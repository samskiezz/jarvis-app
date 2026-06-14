#!/usr/bin/env python3
"""JARVIS voice-clone microservice — XTTS-v2 zero-shot cloning on CPU.

Loads Coqui XTTS-v2 ONCE at startup, precomputes the speaker conditioning
latents from the Cockney reference clip(s) in server/voices/ref/ ONCE (big CPU
win — avoids re-encoding the references on every request), and serves
POST /synthesize {"text": ...} -> audio/wav (24 kHz mono PCM).

Hard rules this honours:
  * Runs as its OWN localhost pm2 service on 127.0.0.1:8096 — never touches the
    dashboard. If it OOMs/crashes, the dashboard's Piper path is unaffected.
  * Installed into the SEPARATE .venv-tts (NOT the main .venv).
  * Aggressive disk cache by text hash (server/voices/clone_cache/) so repeated
    phrases are instant after first synth.
  * XTTS-v2 IS the model (not Piper-with-EQ). No silent downgrade.

CPU latency is real (RTF ~1.4). The dashboard tries this first with a short
timeout and falls back to instant Piper on any slowness/failure; common phrases
are pre-rendered into the cache so they're instant.
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

# --- env: license + cache locations + CPU threading (set before importing torch) ---
os.environ.setdefault("COQUI_TOS_AGREED", "1")
os.environ.setdefault("TTS_HOME", "/opt/jarvis-app-1/.venv-tts/tts_cache")
os.environ.setdefault("OMP_NUM_THREADS", "8")

import numpy as np  # noqa: E402
import torch  # noqa: E402

torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS", "8")))

REF_DIR = os.environ.get("XTTS_REF_DIR", "/opt/jarvis-app-1/server/voices/ref")
CACHE_DIR = os.environ.get("XTTS_CACHE_DIR", "/opt/jarvis-app-1/server/voices/clone_cache")
HOST = os.environ.get("XTTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("XTTS_PORT", "8096"))
LANG = os.environ.get("XTTS_LANG", "en")
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"

os.makedirs(CACHE_DIR, exist_ok=True)

_LOCK = threading.Lock()  # XTTS inference is not thread-safe; serialize (CPU-bound anyway)
_M = {"model": None, "gpt_lat": None, "spk": None, "ready": False}


def _ref_wavs():
    """All clean Cockney reference clips, sorted for a stable cache key."""
    if not os.path.isdir(REF_DIR):
        return []
    wavs = sorted(
        os.path.join(REF_DIR, f)
        for f in os.listdir(REF_DIR)
        if f.lower().endswith(".wav")
    )
    return wavs


_REFS = _ref_wavs()
_REF_TAG = "|".join(os.path.basename(w) for w in _REFS) or "noref"


def _load():
    """Load XTTS-v2 once and precompute speaker latents from ALL reference clips."""
    if _M["model"] is not None:
        return
    from TTS.tts.configs.xtts_config import XttsConfig
    from TTS.tts.models.xtts import Xtts
    from TTS.utils.manage import ModelManager

    sys.stderr.write(f"[voiceclone] loading {MODEL_NAME} (CPU)...\n")
    sys.stderr.flush()
    model_path = ModelManager().download_model(MODEL_NAME)[0]
    config = XttsConfig()
    config.load_json(os.path.join(model_path, "config.json"))
    model = Xtts.init_from_config(config)
    model.load_checkpoint(config, checkpoint_dir=model_path, eval=True)  # CPU; no .cuda()
    model.eval()

    if not _REFS:
        raise RuntimeError(f"no reference WAVs found in {REF_DIR}")
    sys.stderr.write(f"[voiceclone] conditioning on {len(_REFS)} ref clip(s): {_REF_TAG}\n")
    sys.stderr.flush()
    # Averages the conditioning across all reference clips -> more robust speaker.
    gpt_lat, spk = model.get_conditioning_latents(
        audio_path=_REFS, gpt_cond_len=int(os.environ.get("XTTS_GPT_COND_LEN", "24")),
        max_ref_length=30, sound_norm_refs=True)

    _M.update(model=model, gpt_lat=gpt_lat, spk=spk, ready=True)
    sys.stderr.write("[voiceclone] ready.\n")
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
    # Match the GPU service's tuning so the fallback voice sounds the same (natural, lower/older).
    ver = os.environ.get("XTTS_CACHE_VER", "v2-alfred-low")
    key = hashlib.md5(("xtts|" + ver + "|" + _REF_TAG + "|" + LANG + "|" + text).encode()).hexdigest()
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
            temperature=float(os.environ.get("XTTS_TEMP", "0.70")),
            repetition_penalty=float(os.environ.get("XTTS_REP_PENALTY", "5.0")),
            top_p=float(os.environ.get("XTTS_TOP_P", "0.85")),
            top_k=int(os.environ.get("XTTS_TOP_K", "50")),
            speed=float(os.environ.get("XTTS_SPEED", "0.92")),
            enable_text_splitting=True,  # split long text -> shorter chunks (CPU-friendlier)
        )
    data = _wav_bytes(out["wav"], sr=24000)
    tmp = fp + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, fp)  # atomic — never serve a half-written cache file
    return data


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silence default logging
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            ok = _M["ready"]
            self.send_response(200 if ok else 503)
            self.send_header("Content-Type", "application/json")
            body = json.dumps({"ready": ok, "refs": _REFS, "model": MODEL_NAME}).encode()
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
        text = ""
        try:
            text = json.loads(body).get("text", "")
        except Exception:
            text = parse_qs(body).get("text", [""])[0]
        try:
            data = synth(text)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[voiceclone] synth error: {e}\n")
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
    _load()  # block until model + latents ready, then /health -> 200
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(f"[voiceclone] serving on http://{HOST}:{PORT}  POST /synthesize\n")
    sys.stderr.flush()
    srv.serve_forever()


if __name__ == "__main__":
    main()
