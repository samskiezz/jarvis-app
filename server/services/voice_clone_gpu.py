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

# ── Inference tuning (research-backed defaults for a NATURAL, non-robotic clone) ──────────────
# All overridable by env so the voice can be re-tuned without code edits + a redeploy.
#   temperature : lower = steadier/less wobbly (0.6-0.75 sweet spot; <0.5 flat, >0.85 artifacts)
#   repetition_penalty : guards stutter/drone; ~5 is a safe middle (method default 10 can clip/rush)
#   speed : <1.0 = slower, older, weightier cadence (0.88-0.95; far from 1.0 artifacts)
#   stream_chunk_size : bigger = smoother streamed audio, slightly later first chunk (20 choppy → 40)
#   gpt_cond_len : seconds of reference used for prosody conditioning (more = steadier)
TEMP = float(os.environ.get("XTTS_TEMP", "0.70"))
REP_PEN = float(os.environ.get("XTTS_REP_PENALTY", "5.0"))
TOP_P = float(os.environ.get("XTTS_TOP_P", "0.85"))
TOP_K = int(os.environ.get("XTTS_TOP_K", "50"))
SPEED = float(os.environ.get("XTTS_SPEED", "0.92"))
STREAM_CHUNK = int(os.environ.get("XTTS_STREAM_CHUNK", "40"))
GPT_COND_LEN = int(os.environ.get("XTTS_GPT_COND_LEN", "24"))
# Bump when refs/params change so old cached clips are NOT reused (kept in the disk cache key).
CACHE_VER = os.environ.get("XTTS_CACHE_VER", "v2-alfred-low")

os.makedirs(CACHE_DIR, exist_ok=True)

_LOCK = threading.Lock()  # XTTS inference is not thread-safe; serialize (GPU is fast anyway)
_M = {"model": None, "gpt_lat": None, "spk": None, "ready": False}


import re as _re

_EMOJI = _re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF←-⇿✀-➿]")


def _clean_for_tts(text: str) -> str:
    """Strip the things XTTS reads as garbage / that cause robotic output, and shape punctuation for prosody.
    XTTS has no SSML; punctuation IS the pacing. Markdown/emoji/URLs read literally → clean them first."""
    t = text or ""
    t = _re.sub(r"```.*?```", " ", t, flags=_re.S)            # fenced code blocks
    t = _re.sub(r"`([^`]*)`", r"\1", t)                        # inline code ticks
    t = _re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)               # images
    t = _re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)            # links → link text
    t = _re.sub(r"https?://\S+", " ", t)                        # bare URLs
    t = _re.sub(r"[*_#>`~|]+", " ", t)                          # markdown punctuation
    t = _EMOJI.sub("", t)                                       # emoji
    t = t.replace("…", ". ").replace("...", ". ")              # ellipses destabilize XTTS splitting
    t = t.replace("—", ", ").replace("–", ", ")               # em/en dashes → commas
    t = _re.sub(r"^\s*[-•]\s*", "", t, flags=_re.M)            # list bullets
    t = _re.sub(r"[ \t]+", " ", t).strip()
    if t and t[-1] not in ".!?,;:":                             # unterminated text → XTTS hallucinates
        t += "."
    return t


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
    # More reference + loudness-normalized refs = a steadier, less robotic clone (research-backed).
    gpt_lat, spk = model.get_conditioning_latents(
        audio_path=_REFS, gpt_cond_len=GPT_COND_LEN, max_ref_length=30, sound_norm_refs=True)
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


def _to_mp3(wav: bytes) -> bytes:
    """Compress WAV -> MP3 (64k mono) so the clip crosses a slow VPS tunnel ~6x faster. WAV unchanged on failure."""
    try:
        import subprocess
        p = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
                            "-ac", "1", "-b:a", "64k", "-f", "mp3", "pipe:1"],
                           input=wav, capture_output=True, timeout=20)
        return p.stdout if p.returncode == 0 and p.stdout else wav
    except Exception:
        return wav


def synth(text: str, fmt: str = "wav") -> bytes:
    text = _clean_for_tts(text).strip()[:600]
    if not text:
        return b""
    ext = "mp3" if fmt == "mp3" else "wav"
    # CACHE_VER + tuning in the key so changing refs/params never serves a stale (robotic) clip.
    sig = f"{CACHE_VER}|{TEMP}|{REP_PEN}|{SPEED}|{TOP_P}"
    key = hashlib.md5(("xtts|" + sig + "|" + _REF_TAG + "|" + LANG + "|" + text).encode()).hexdigest()
    fp = os.path.join(CACHE_DIR, key + "." + ext)
    if os.path.exists(fp):
        with open(fp, "rb") as f:
            return f.read()
    wfp = os.path.join(CACHE_DIR, key + ".wav")               # reuse the WAV cache if it exists
    if os.path.exists(wfp):
        with open(wfp, "rb") as f:
            data = f.read()
    else:
        with _LOCK:
            _load()
            out = _M["model"].inference(
                text=text,
                language=LANG,
                gpt_cond_latent=_M["gpt_lat"],
                speaker_embedding=_M["spk"],
                temperature=TEMP,
                repetition_penalty=REP_PEN,
                top_p=TOP_P,
                top_k=TOP_K,
                speed=SPEED,
                enable_text_splitting=True,
            )
        data = _wav_bytes(out["wav"], sr=24000)
        tmp = wfp + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, wfp)
    if ext == "mp3":
        data = _to_mp3(data)
        tmp = fp + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, fp)
    return data


def synth_stream(text: str):
    """Yield raw PCM int16 (24kHz mono) chunks AS XTTS generates them — first chunk in ~0.3-0.5s, so the
    browser can start playing long before the full clip is done (the path to sub-300ms-ish first audio)."""
    text = _clean_for_tts(text).strip()[:600]
    if not text:
        return
    with _LOCK:
        _load()
        try:
            it = _M["model"].inference_stream(text, LANG, _M["gpt_lat"], _M["spk"],
                                              temperature=TEMP, repetition_penalty=REP_PEN,
                                              top_p=TOP_P, top_k=TOP_K, speed=SPEED,
                                              enable_text_splitting=True, stream_chunk_size=STREAM_CHUNK)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[voiceclone-gpu] inference_stream unsupported: {e}\n"); sys.stderr.flush()
            return
        for chunk in it:
            try:
                pcm = np.clip(np.asarray(chunk.detach().cpu().numpy(), dtype=np.float32), -1.0, 1.0)
                yield (pcm * 32767.0).astype("<i2").tobytes()
            except Exception:  # noqa: BLE001
                break


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
        p = urlparse(self.path).path
        if p not in ("/synthesize", "/synthesize_stream"):
            self.send_response(404)
            self.end_headers()
            return
        n = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        try:
            text = json.loads(body).get("text", "")
        except Exception:
            text = parse_qs(body).get("text", [""])[0]
        if p == "/synthesize_stream":
            self.send_response(200)
            self.send_header("Content-Type", "audio/L16;rate=24000;channels=1")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                for pcm in synth_stream(text):
                    self.wfile.write(pcm); self.wfile.flush()
            except Exception:  # noqa: BLE001
                pass
            return
        fmt = parse_qs(urlparse(self.path).query).get("fmt", ["wav"])[0]
        try:
            data = synth(text, fmt)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[voiceclone-gpu] synth error: {e}\n")
            sys.stderr.flush()
            data = b""
        if data:
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg" if fmt == "mp3" else "audio/wav")
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
