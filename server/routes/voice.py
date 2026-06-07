"""Voice pipeline — STT/TTS endpoints for JARVIS voice interface.

Additive route module.  No existing behaviour is changed.
"""
from __future__ import annotations

import contextlib
import os
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(tags=["voice"])

# ── config ───────────────────────────────────────────────────────────────────
_VOICE_PROVIDER = os.environ.get("VOICE_TTS_PROVIDER", "piper").lower()
_ELEVENLABS_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
_ELEVENLABS_VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")
_PIPER_MODEL = os.environ.get("PIPER_MODEL", "")


# ── models ───────────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    provider: str | None = None


class STTRequest(BaseModel):
    audio_base64: str
    language: str = "en"


class VoiceStatus(BaseModel):
    tts_provider: str
    tts_available: bool
    stt_available: bool
    stt_engine: str


# ── helpers ──────────────────────────────────────────────────────────────────

async def _tts_piper(text: str) -> bytes:
    """Pure-Python fallback TTS using espeak-ng / piper if available."""
    import subprocess
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(text)
        txt_path = f.name

    wav_path = txt_path.replace(".txt", ".wav")
    try:
        if _PIPER_MODEL:
            subprocess.run(
                ["piper", "--model", _PIPER_MODEL, "--output_file", wav_path, "--file", txt_path],
                capture_output=True, timeout=30, check=False,
            )
        else:
            subprocess.run(
                ["espeak-ng", "-w", wav_path, "-f", txt_path],
                capture_output=True, timeout=15, check=False,
            )
        with open(wav_path, "rb") as wf:
            return wf.read()
    except Exception:
        # Ultimate fallback: return silent WAV header
        return b"RIFF\x26\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00" \
               b"\x44\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x02\x00\x00\x00\x00\x00"
    finally:
        for p in (txt_path, wav_path):
            with contextlib.suppress(Exception):
                os.remove(p)


async def _tts_elevenlabs(text: str, voice_id: str | None = None) -> bytes:
    import httpx

    vid = voice_id or _ELEVENLABS_VOICE
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/stream"
    headers = {"xi-api-key": _ELEVENLABS_KEY, "Content-Type": "application/json"}
    payload = {"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}}
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"ElevenLabs error: {r.status_code}")
        return r.content


# ── routes ───────────────────────────────────────────────────────────────────

@router.get("/v1/voice/status", response_model=VoiceStatus)
async def voice_status():
    """Report which voice engines are available."""
    tts_available = bool(_ELEVENLABS_KEY) or True  # piper fallback always "available"
    stt_available = True  # Web Speech API is client-side; we mark available
    return VoiceStatus(
        tts_provider=_ELEVENLABS_KEY and "elevenlabs" or "piper",
        tts_available=tts_available,
        stt_available=stt_available,
        stt_engine="browser-web-speech",
    )


@router.post("/v1/voice/tts")
async def text_to_speech(req: TTSRequest):
    """Convert text to speech audio (mp3/wav stream)."""
    provider = (req.provider or _VOICE_PROVIDER).lower()
    if provider == "elevenlabs" and _ELEVENLABS_KEY:
        audio = await _tts_elevenlabs(req.text, req.voice)
    else:
        audio = await _tts_piper(req.text)

    return StreamingResponse(
        iter([audio]),
        media_type="audio/wav",
        headers={"Content-Disposition": "attachment; filename=jarvis_tts.wav"},
    )


@router.post("/v1/voice/stt")
async def speech_to_text(req: STTRequest):
    """Server-side STT fallback using Whisper if available, otherwise proxy."""
    import base64
    import tempfile

    whisper_key = os.environ.get("OPENAI_API_KEY", "")
    if whisper_key:
        import httpx

        audio_bytes = base64.b64decode(req.audio_base64)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name
        try:
            async with httpx.AsyncClient() as client:
                with open(tmp_path, "rb") as af:
                    r = await client.post(
                        "https://api.openai.com/v1/audio/transcriptions",
                        headers={"Authorization": f"Bearer {whisper_key}"},
                        files={"file": ("audio.webm", af, "audio/webm")},
                        data={"model": "whisper-1", "language": req.language},
                        timeout=30.0,
                    )
                if r.status_code == 200:
                    return {"text": r.json().get("text", ""), "engine": "whisper"}
        finally:
            with contextlib.suppress(Exception):
                os.remove(tmp_path)

    return {
        "text": "",
        "engine": "browser-web-speech",
        "note": "Server-side STT unavailable; use Web Speech API in browser",
    }
