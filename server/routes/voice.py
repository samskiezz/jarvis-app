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
_ELEVENLABS_VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")  # default; over/ridden by _elevenlabs_voice()
_PIPER_MODEL = os.environ.get("PIPER_MODEL", "")


# ── models ───────────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    provider: str | None = None


class STTRequest(BaseModel):
    audio_base64: str
    language: str = "en"


class NLURequest(BaseModel):
    text: str
    session_id: str = "default"


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

    vid = voice_id or _elevenlabs_voice()
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/stream"
    headers = {"xi-api-key": _elevenlabs_key(), "Content-Type": "application/json"}
    payload = {"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}}
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"ElevenLabs error: {r.status_code}")
        return r.content


def _secret_from_file(path: str, name: str) -> str:
    """Read NAME=value from a KEY=value secrets file. pm2 env does not carry secrets,
    so file fallback is the reliable path for this deployment."""
    try:
        for ln in open(path):
            ln = ln.strip()
            if "=" not in ln or ln.startswith("#"):
                continue
            k, v = ln.split("=", 1)
            if k.strip() == name:
                return v.strip().strip('"').strip("'")
    except Exception:
        pass
    return ""


def _openai_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "") or _secret_from_file(
        "/opt/jarvis-app-1/.openai_env", "OPENAI_API_KEY"
    )


def _elevenlabs_key() -> str:
    return os.environ.get("ELEVENLABS_API_KEY", "") or _secret_from_file(
        "/opt/jarvis-app-1/.env.secrets", "ELEVENLABS_API_KEY"
    )


def _elevenlabs_voice() -> str:
    return (
        os.environ.get("ELEVENLABS_VOICE_ID", "")
        or _secret_from_file("/opt/jarvis-app-1/.env.secrets", "ELEVENLABS_VOICE_ID")
        or _ELEVENLABS_VOICE
    )


async def _tts_openai(text: str, voice: str | None, key: str) -> bytes:
    """Best path: OpenAI gpt-4o-mini-tts with the JARVIS British-butler delivery instruction."""
    import httpx
    from ..services import jarvis_persona as _persona
    body = {
        "model": "gpt-4o-mini-tts",
        "voice": voice or _persona.VOICE,
        "input": text[:4000],
        "instructions": _persona.VOICE_INSTRUCTIONS,
        "response_format": "mp3",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        r = await client.post("https://api.openai.com/v1/audio/speech",
                              headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                              json=body)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"OpenAI TTS {r.status_code}: {r.text[:160]}")
        return r.content


# ── routes ───────────────────────────────────────────────────────────────────

@router.get("/v1/voice/status", response_model=VoiceStatus)
async def voice_status():
    """Report which voice engines are actually available.

    Honest reporting: TTS prefers OpenAI (gpt-4o-mini-tts), then ElevenLabs, then
    the always-present local Piper/espeak fallback. Server-side STT (Whisper) is
    only available when an OpenAI key resolves; otherwise the client must use the
    browser Web Speech API.
    """
    openai_key = _openai_key()
    if openai_key:
        provider = "openai"
    elif _elevenlabs_key():
        provider = "elevenlabs"
    else:
        provider = "piper"
    return VoiceStatus(
        tts_provider=provider,
        tts_available=True,                 # local Piper/espeak fallback always works
        stt_available=bool(openai_key),     # server Whisper needs the key; else browser-only
        stt_engine="whisper" if openai_key else "browser-web-speech",
    )


@router.post("/v1/voice/tts")
async def text_to_speech(req: TTSRequest):
    """Convert text to speech. Prefers OpenAI gpt-4o-mini-tts (JARVIS British-butler voice);
    falls back to ElevenLabs, then local Piper/espeak."""
    provider = (req.provider or _VOICE_PROVIDER).lower()
    okey = _openai_key()
    if provider != "elevenlabs" and okey:
        try:
            audio = await _tts_openai(req.text, req.voice, okey)
            return StreamingResponse(iter([audio]), media_type="audio/mpeg",
                                     headers={"Content-Disposition": "inline; filename=jarvis.mp3"})
        except Exception:
            pass  # degrade gracefully to ElevenLabs, then local engines
    if _elevenlabs_key():
        try:
            audio = await _tts_elevenlabs(req.text, req.voice)
            return StreamingResponse(iter([audio]), media_type="audio/mpeg",
                                     headers={"Content-Disposition": "inline; filename=jarvis.mp3"})
        except Exception:
            pass  # ElevenLabs unreachable → local Piper/espeak
    audio = await _tts_piper(req.text)
    return StreamingResponse(iter([audio]), media_type="audio/wav",
                             headers={"Content-Disposition": "inline; filename=jarvis.wav"})


@router.post("/v1/voice/nlu")
async def voice_nlu(req: NLURequest):
    """Parse a natural-language voice command with context awareness.

    Returns a structured intent so the frontend can give rich feedback and
    route context-dependent commands ("turn it down" after a climate command)
    without the user needing to remember specific keywords.
    """
    from ..services import voice_nlu as _nlu

    text = req.text.strip()[:500]          # length-limit
    sid = req.session_id.strip()[:64]      # session-id sanitise
    if not sid:
        sid = "default"

    result = _nlu.parse(text, sid)
    return {
        "intent": result.intent,
        "domain": result.domain,
        "entities": result.entities,
        "confidence": result.confidence,
        "requires_clarification": result.requires_clarification,
        "clarification_prompt": result.clarification_prompt,
        "resolved_text": result.resolved_text,
        "action_hint": result.action_hint,
    }


@router.get("/v1/voice/nlu/context/{session_id}")
async def voice_nlu_context(session_id: str):
    """Return current NLU context for a session (domain, last intent, entities)."""
    from ..services import voice_nlu as _nlu

    return _nlu.get_context(session_id.strip()[:64])


@router.delete("/v1/voice/nlu/context/{session_id}")
async def voice_nlu_reset(session_id: str):
    """Reset NLU context for a session."""
    from ..services import voice_nlu as _nlu

    _nlu.reset_context(session_id.strip()[:64])
    return {"reset": True}


@router.get("/v1/voice/commands")
async def voice_commands():
    """Return the full catalog of voice commands available in the dashboard, grouped by category."""
    return {
        "ok": True,
        "mic_tip": "Tap the 🎤 mic button to activate, then speak naturally.",
        "categories": [
            {
                "name": "Navigation & Apps",
                "commands": [
                    {"phrase": "open [app name]", "example": "open tasks", "description": "Open any mini-app by name"},
                    {"phrase": "open apps", "example": "open apps", "description": "Show the full app carousel"},
                    {"phrase": "open control centre", "example": "open control centre", "description": "Toggle the control centre panel"},
                    {"phrase": "open system health", "example": "open system health", "description": "Open the System Health hub"},
                    {"phrase": "open intelligence", "example": "open intelligence", "description": "Open the Intelligence hub"},
                    {"phrase": "open memory", "example": "open memory", "description": "Open Memory recall panel"},
                    {"phrase": "open tasks", "example": "open tasks", "description": "Open the Live Tasks daemon list"},
                    {"phrase": "open agent", "example": "open agent", "description": "Open Agent OS tool console"},
                    {"phrase": "open settings", "example": "open settings", "description": "Open system settings"},
                    {"phrase": "open voice commands", "example": "open voice commands", "description": "Open this command reference"},
                ],
            },
            {
                "name": "Media & Generation",
                "commands": [
                    {"phrase": "image of [description]", "example": "image of a glowing city", "description": "Generate an AI image"},
                    {"phrase": "picture of [description]", "example": "picture of a robot butler", "description": "Generate an AI image"},
                    {"phrase": "3d model of [description]", "example": "3d model of a helmet", "description": "Generate a 3D model"},
                    {"phrase": "open library", "example": "open library", "description": "Browse generated images and models"},
                    {"phrase": "open higgsfield", "example": "open higgsfield", "description": "Open the image-to-video tool"},
                    {"phrase": "open tripo", "example": "open tripo", "description": "Open the 3D generation tool"},
                ],
            },
            {
                "name": "System Controls",
                "commands": [
                    {"phrase": "run all", "example": "run all", "description": "Start all services"},
                    {"phrase": "stop all", "example": "stop all", "description": "Stop all services"},
                    {"phrase": "sleep", "example": "sleep", "description": "Enter sleep mode"},
                    {"phrase": "status", "example": "status", "description": "Read current system status aloud"},
                    {"phrase": "open debugger", "example": "open debugger", "description": "Run diagnostics"},
                    {"phrase": "speed up JARVIS", "example": "speed up JARVIS", "description": "Run system optimiser"},
                    {"phrase": "run diagnostics", "example": "run diagnostics", "description": "Open debugger and scan for issues"},
                ],
            },
            {
                "name": "AI & Intelligence",
                "commands": [
                    {"phrase": "open suggestions", "example": "open suggestions", "description": "Browse self-improvement ideas"},
                    {"phrase": "approve [suggestion id]", "example": "approve sug1", "description": "Approve a self-dev suggestion"},
                    {"phrase": "decline [suggestion id]", "example": "decline sug2", "description": "Decline a suggestion"},
                    {"phrase": "open brain", "example": "open brain", "description": "Open GPU brain status"},
                    {"phrase": "open ai console", "example": "open ai console", "description": "Open the AI chat console"},
                    {"phrase": "open graph search", "example": "open graph search", "description": "Search the knowledge graph"},
                ],
            },
            {
                "name": "Vision",
                "commands": [
                    {"phrase": "what do you see", "example": "what do you see", "description": "JARVIS describes the camera view"},
                    {"phrase": "look around", "example": "look around", "description": "JARVIS uses the camera to describe the scene"},
                    {"phrase": "what is this", "example": "what is this", "description": "Identify an object in the camera view"},
                    {"phrase": "describe what you see", "example": "describe what you see", "description": "JARVIS describes the camera feed"},
                ],
            },
            {
                "name": "Guardian & Care",
                "commands": [
                    {"phrase": "guardian", "example": "guardian", "description": "Switch to Guardian monitor for mum"},
                    {"phrase": "open guardian", "example": "open guardian", "description": "Open the Guardian care monitor"},
                ],
            },
            {
                "name": "Settings & Toggles",
                "commands": [
                    {"phrase": "archon", "example": "archon", "description": "Toggle Archon autonomous mode on/off"},
                    {"phrase": "low power", "example": "low power", "description": "Toggle low-power mode"},
                    {"phrase": "dense", "example": "dense", "description": "Toggle dense layout"},
                    {"phrase": "spatial", "example": "spatial", "description": "Toggle spatial wallpaper"},
                    {"phrase": "panel tint", "example": "panel tint", "description": "Toggle panel tint"},
                    {"phrase": "generate theme", "example": "generate theme", "description": "Generate a new UI theme"},
                ],
            },
            {
                "name": "Voice & Sound",
                "commands": [
                    {"phrase": "voice commands", "example": "voice commands", "description": "Open this command reference"},
                    {"phrase": "what can I say", "example": "what can I say", "description": "Open voice command reference"},
                    {"phrase": "voice help", "example": "voice help", "description": "Open voice command reference"},
                    {"phrase": "open voice forge", "example": "open voice forge", "description": "Open 12LABS text-to-speech studio"},
                    {"phrase": "text to speech", "example": "text to speech", "description": "Open the voice cloning studio"},
                ],
            },
        ],
    }


@router.post("/v1/voice/stt")
async def speech_to_text(req: STTRequest):
    """Server-side STT via OpenAI Whisper — the voice-input path for browsers that
    lack the Web Speech API (iOS Safari, Firefox).

    Uses the same key resolution as TTS (``_openai_key()``) so it works under pm2,
    which does not carry ``OPENAI_API_KEY`` in its process env. Returns honest
    errors instead of silently transcribing to an empty string.
    """
    import base64
    import tempfile

    whisper_key = _openai_key()
    if not whisper_key:
        return {
            "ok": False,
            "text": "",
            "engine": "none",
            "note": "Server-side STT unavailable (no OpenAI key); use the Web Speech API in a Chromium browser",
        }

    try:
        audio_bytes = base64.b64decode(req.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="audio_base64 is not valid base64")
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty audio")

    import httpx

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            with open(tmp_path, "rb") as af:
                r = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {whisper_key}"},
                    files={"file": ("audio.webm", af, "audio/webm")},
                    data={"model": "whisper-1", "language": req.language},
                )
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Whisper {r.status_code}: {r.text[:160]}")
        return {"ok": True, "text": r.json().get("text", ""), "engine": "whisper"}
    finally:
        with contextlib.suppress(Exception):
            os.remove(tmp_path)
