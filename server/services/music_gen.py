"""Music generation provider (gap #50 — Awakening ambient music banks).

Tries backends in priority order:
  1. Suno API (third-party reseller) via SUNO_API_KEY + SUNO_API_BASE
  2. Stable Audio (Stability AI) via STABILITY_API_KEY
  3. Local MusicGen via audiocraft (if installed + GPU)
  4. Pre-baked fallback bank under server/data/music_bank/

Public surface:
    generate(prompt: str, duration_s: float = 30.0, tags: list[str] | None = None) -> dict
        -> {"ok": bool, "backend": str, "path": str | None, "url": str | None, "status": str}
    status() -> dict

Plug-in instructions:

    # Suno (third-party API resellers, ~$0.014–$0.111/song):
    export SUNO_API_KEY=...
    # Default base targets sunoapi.org; override for evolink/apiframe/etc.
    export SUNO_API_BASE=https://api.sunoapi.org

    # Stable Audio (~$0.0206/generation):
    export STABILITY_API_KEY=sk-...

    # Local MusicGen (free, needs 16GB+ GPU for medium):
    pip install audiocraft torch

Pricing (June 2026):
    Suno (Pro):       $10/mo, 2,500 credits
    Suno (third-party reseller): $0.014–$0.111 per song
    Stable Audio:     $0.0206 per generation (~6 min max)
    MusicGen local:   free; ~16 GB GPU for medium, ~24 GB+ for large
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

try:
    from urllib import request as _urlreq
    from urllib import parse as _urlparse
    from urllib.error import HTTPError, URLError
except Exception:  # pragma: no cover
    _urlreq = None  # type: ignore

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT_S = 30.0
DATA_DIR = Path(os.environ.get("JARVIS_DATA_DIR", "/opt/jarvis-app-1/server/data"))
MUSIC_OUT_DIR = DATA_DIR / "music_generated"
MUSIC_BANK_DIR = DATA_DIR / "music_bank"
MUSIC_OUT_DIR.mkdir(parents=True, exist_ok=True)
MUSIC_BANK_DIR.mkdir(parents=True, exist_ok=True)


def _new_id() -> str:
    return f"mg_{int(time.time())}_{uuid.uuid4().hex[:8]}"


def _save_index(entry: dict[str, Any]) -> None:
    idx = MUSIC_OUT_DIR / "index.jsonl"
    try:
        with idx.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as exc:  # pragma: no cover
        log.warning("music index write failed: %s", exc)


def _suno_generate(prompt: str, duration_s: float) -> dict[str, Any]:
    key = os.environ.get("SUNO_API_KEY", "").strip()
    if not key:
        return {"ok": False, "backend": "suno", "error": "not_configured"}
    base = os.environ.get("SUNO_API_BASE", "https://api.sunoapi.org").rstrip("/")
    if _urlreq is None:
        return {"ok": False, "backend": "suno", "error": "urllib_unavailable"}
    payload = {
        "prompt": prompt,
        "make_instrumental": True,
        "model": os.environ.get("SUNO_MODEL", "suno-v4.5-beta"),
        "wait_audio": False,
    }
    body = json.dumps(payload).encode("utf-8")
    req = _urlreq.Request(f"{base}/api/v1/generate", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    try:
        with _urlreq.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
            data = json.loads(resp.read().decode("utf-8") or "{}")
        return {"ok": True, "backend": "suno", "status": "queued", "result": data}
    except HTTPError as exc:
        return {"ok": False, "backend": "suno", "error": f"HTTP {exc.code}"}
    except URLError as exc:
        return {"ok": False, "backend": "suno", "error": str(exc.reason)}


def _stable_audio_generate(prompt: str, duration_s: float) -> dict[str, Any]:
    key = os.environ.get("STABILITY_API_KEY", "").strip()
    if not key:
        return {"ok": False, "backend": "stable_audio", "error": "not_configured"}
    if _urlreq is None:
        return {"ok": False, "backend": "stable_audio", "error": "urllib_unavailable"}
    # Stable Audio API expects multipart/form-data; we use a minimal urlencoded
    # fallback hitting the audio/generations endpoint. Replace with httpx in
    # production for true multipart if needed.
    url = "https://api.stability.ai/v2beta/audio/stable-audio-3/text-to-audio"
    form_body = _urlparse.urlencode({
        "prompt": prompt,
        "duration": str(int(max(1, min(duration_s, 360)))),
        "output_format": "mp3",
    }).encode("utf-8")
    req = _urlreq.Request(url, data=form_body, method="POST")
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Accept", "audio/*")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with _urlreq.urlopen(req, timeout=DEFAULT_TIMEOUT_S) as resp:
            content_type = resp.headers.get("Content-Type", "")
            audio = resp.read()
        if "audio" not in content_type.lower():
            return {"ok": False, "backend": "stable_audio", "error": "bad_response", "detail": audio[:256].decode("utf-8", "ignore")}
        out_id = _new_id()
        out_path = MUSIC_OUT_DIR / f"{out_id}.mp3"
        out_path.write_bytes(audio)
        return {
            "ok": True,
            "backend": "stable_audio",
            "status": "ready",
            "path": str(out_path),
            "url": f"/jarvis/data/music_generated/{out_path.name}",
            "id": out_id,
        }
    except HTTPError as exc:
        return {"ok": False, "backend": "stable_audio", "error": f"HTTP {exc.code}"}
    except URLError as exc:
        return {"ok": False, "backend": "stable_audio", "error": str(exc.reason)}


def _musicgen_local(prompt: str, duration_s: float) -> dict[str, Any]:
    """Local MusicGen via audiocraft. No-op if not installed."""
    try:
        import torch  # type: ignore
        from audiocraft.models import MusicGen  # type: ignore
        from audiocraft.data.audio import audio_write  # type: ignore
    except Exception as exc:
        return {"ok": False, "backend": "musicgen", "error": "not_installed", "detail": str(exc)}
    try:
        model_name = os.environ.get("MUSICGEN_MODEL", "facebook/musicgen-small")
        model = MusicGen.get_pretrained(model_name)
        model.set_generation_params(duration=int(max(1, min(duration_s, 30))))
        wavs = model.generate([prompt])
        out_id = _new_id()
        out_base = MUSIC_OUT_DIR / out_id
        audio_write(str(out_base), wavs[0].cpu(), model.sample_rate, strategy="loudness")
        path = f"{out_base}.wav"
        return {
            "ok": True,
            "backend": "musicgen",
            "status": "ready",
            "path": path,
            "url": f"/jarvis/data/music_generated/{Path(path).name}",
            "id": out_id,
        }
    except Exception as exc:
        log.exception("musicgen local generation failed")
        return {"ok": False, "backend": "musicgen", "error": "generation_failed", "detail": str(exc)}


def _bank_fallback(prompt: str, tags: list[str] | None) -> dict[str, Any]:
    """Pre-baked ambient loops dropped under server/data/music_bank/*.mp3.

    This guarantees the Awakening surface always has something to play even
    with zero credentials and no GPU. Owner can drop mp3/ogg files here.
    """
    candidates = sorted(MUSIC_BANK_DIR.glob("*.mp3")) + sorted(MUSIC_BANK_DIR.glob("*.ogg")) + sorted(MUSIC_BANK_DIR.glob("*.wav"))
    if not candidates:
        return {
            "ok": False,
            "backend": "bank",
            "error": "empty_bank",
            "hint": f"drop ambient loops into {MUSIC_BANK_DIR}",
        }
    # Pick first match for the first tag if any, else first overall.
    tag_l = (tags or [None])[0]
    pick = candidates[0]
    if tag_l:
        for c in candidates:
            if tag_l.lower() in c.stem.lower():
                pick = c
                break
    return {
        "ok": True,
        "backend": "bank",
        "status": "ready",
        "path": str(pick),
        "url": f"/jarvis/data/music_bank/{pick.name}",
        "id": f"bank_{pick.stem}",
    }


def generate(prompt: str, duration_s: float = 30.0, tags: list[str] | None = None) -> dict[str, Any]:
    """Generate music, returning {ok, backend, path?, url?, status}.

    Tries Suno → Stable Audio → MusicGen → pre-baked bank. The first ok=True
    result is returned. Errors are accumulated under "tried".
    """
    tried: list[dict[str, Any]] = []
    for fn in (_suno_generate, _stable_audio_generate, _musicgen_local):
        try:
            result = fn(prompt, duration_s)
        except Exception as exc:
            log.exception("backend %s crashed", fn.__name__)
            result = {"ok": False, "backend": fn.__name__, "error": "crash", "detail": str(exc)}
        if result.get("ok"):
            result["prompt"] = prompt
            result["duration_s"] = duration_s
            result["tags"] = tags or []
            _save_index({"ts": int(time.time()), **result})
            result["tried"] = tried
            return result
        tried.append(result)
    bank = _bank_fallback(prompt, tags)
    bank["tried"] = tried
    if bank.get("ok"):
        _save_index({"ts": int(time.time()), **bank, "prompt": prompt, "tags": tags or []})
    return bank


def status() -> dict[str, Any]:
    return {
        "suno_configured": bool(os.environ.get("SUNO_API_KEY")),
        "stable_audio_configured": bool(os.environ.get("STABILITY_API_KEY")),
        "musicgen_available": _musicgen_available(),
        "bank_count": len(list(MUSIC_BANK_DIR.glob("*.mp3"))) + len(list(MUSIC_BANK_DIR.glob("*.ogg"))) + len(list(MUSIC_BANK_DIR.glob("*.wav"))),
        "out_dir": str(MUSIC_OUT_DIR),
        "bank_dir": str(MUSIC_BANK_DIR),
    }


def _musicgen_available() -> bool:
    try:
        import audiocraft  # type: ignore  # noqa: F401
        import torch  # type: ignore  # noqa: F401
        return True
    except Exception:
        return False
