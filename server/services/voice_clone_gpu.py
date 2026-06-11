#!/usr/bin/env python3
"""JARVIS voice-clone microservice — XTTS-v2 zero-shot cloning ON THE GPU.

Same wire-contract as server/services/voice_clone_service.py (the CPU service) so the
dashboard can point XTTS_URL at either one transparently:
  * GET  /health      -> {"ready":bool,"refs":[...],"model":...,"device":"cuda"}
  * POST /synthesize  {"text": ...} -> audio/wav (24 kHz mono PCM), or 204 on empty

The ONLY difference from the CPU service is the device: it moves XTTS-v2 to CUDA, so a
novel phrase synthesizes in ~1s instead of ~14s on CPU. It runs ON the Vast GPU box and
is reached from Hostinger over the existing SSH tunnel. Reference clips live in
XTTS_REF_DIR on the box (rsynced copies of server/voices/ref/*.wav). Aggressive disk
cache by text hash so a repeated line is instant. Falls back cleanly: if CUDA is
unavailable it loads on CPU (still works, just slow) rather than crashing.
"""
import hashlib
import io
import json
import os
import sys
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

os.environ.setdefault("COQUI_TOS_AGREED", "1")
os.environ.setdefault("TTS_HOME", "/root/tts_cache")

import numpy as np  # noqa: E402
import torch  # noqa: E402

REF_DIR = os.environ.get("XTTS_REF_DIR", "/root/voices/ref")
CACHE_DIR = os.environ.get("XTTS_CACHE_DIR", "/root/voices/clone_cache")
HOST = os.environ.get("XTTS_HOST", "0.0.0.0")
PORT = int(os.environ.get("XTTS_PORT", "8096"))
LANG = os.environ.get("XTTS_LANG", "en")
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

os.makedirs(CACHE_DIR, exist_ok=True)

_LOCK = threading.Lock()  # XTTS inference is not thread-safe; serialize (GPU is fast anyway)
_M = {"model": None, "gpt_lat": None, "spk": None, "ready": False}


def _ref_wavs():
    if not os.path.isdir(REF_DIR):
        return []
    return sorted(
        os.path.join(REF_DIR, f)
        for f in os.listdir(REF_DIR)
        if f.lower().endswith(".wav")
    )


_REFS = _ref_wavs()
_REF_TAG = "|".join(os.path.basename(w) for w in _REFS) or "noref"


def _load():
    if _M["model"] is not None:
        return
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import Xtts
    from TTS.utils.manage import ModelManager

    sys.stderr.write(f"[voiceclone-gpu] loading {MODEL_NAME} on {DEVICE}...\n")
    sys.stderr.flush()
    model_path = ModelManager().download_model(MODEL_NAME)[0]
    config = XttsConfig()
    config.load_json(os.path.join(model_path, "config.json"))
    model = Xtts.init_from_config(config)
    model.load_checkpoint(config, checkpoint_dir=model_path, eval=True)
    if DEVICE == "cuda":
        model.cuda()
    model.eval()

    if not _REFS:
        raise RuntimeError(f"no reference WAVs found in {REF_DIR}")
    sys.stderr.write(f"[voiceclone-gpu] conditioning on {len(_REFS)} ref clip(s): {_REF_TAG}\n")
    sys.stderr.flush()
    gpt_lat, spk = model.get_conditioning_latents(audio_path=_REFS)
    _M.update(model=model, gpt_lat=gpt_lat, spk=spk, ready=True)
    sys.stderr.write("[voiceclone-gpu] ready.\n")
    sys.stderr.flush()


def _wav_bytes(pcm_float, sr=24000):
    pcm = np.clip(np.asarray(pcm_float, dtype=np.float32), -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    wf = wave.open(buf, "wb")
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sr)
    wf.writeframes(pcm16)
    wf.close()
    return buf.getvalue()


def synth(text: str) -> bytes:
    text = (text or "").strip()[:600]
    if not text:
        return b""
    key = hashlib.md5(("xtts|" + _REF_TAG + "|" + LANG + "|" + text).encode()).hexdigest()
    fp = os.path.join(CACHE_DIR, key + ".wav")
    if os.path.exists(fp):
        with open(fp, "rb") as f:
            return f.read()
    with _LOCK:
        _load()
        out = _M["model"].inference(
            text=text,
            language=LANG,
            gpt_cond_latent=_M["gpt_lat"],
            speaker_embedding=_M["spk"],
            temperature=0.7,
            enable_text_splitting=True,
        )
    data = _wav_bytes(out["wav"], sr=24000)
    tmp = fp + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, fp)
    return data


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            ok = _M["ready"]
            self.send_response(200 if ok else 503)
            self.send_header("Content-Type", "application/json")
            body = json.dumps({"ready": ok, "refs": _REFS, "model": MODEL_NAME, "device": DEVICE}).encode()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path != "/synthesize":
            self.send_response(404)
            self.end_headers()
            return
        n = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        try:
            text = json.loads(body).get("text", "")
        except Exception:
            text = parse_qs(body).get("text", [""])[0]
        try:
            data = synth(text)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[voiceclone-gpu] synth error: {e}\n")
            sys.stderr.flush()
            data = b""
        if data:
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_response(204)
            self.end_headers()


def main():
    _load()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(f"[voiceclone-gpu] serving on http://{HOST}:{PORT}  POST /synthesize  (device={DEVICE})\n")
    sys.stderr.flush()
    srv.serve_forever()


if __name__ == "__main__":
    main()
