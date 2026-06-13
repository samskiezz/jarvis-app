"""VOICE FORGE — profile-scoped voice cloning studio.

Wraps the existing XTTS/Piper/TTS infrastructure so users can record, build, test,
and switch voice profiles without duplicating heavy inference code.
"""
from __future__ import annotations

import datetime
import os
import re
import shutil
import subprocess
import time
import uuid
from typing import Any, Optional
from urllib.parse import quote

from . import mini_app_state as mas

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VOICES_ROOT = os.path.join(ROOT, "server", "voices")
ACTIVE_REF_DIR = os.path.join(VOICES_ROOT, "ref")
ACTIVE_CACHE_DIR = os.path.join(VOICES_ROOT, "clone_cache")
PIPELINE_SCRIPT = os.path.join(ROOT, "scripts", "voice_pipeline.py")

APP = "voiceforge"
VALID_ID = re.compile(r"^[a-z0-9_-]{1,32}$")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _profile_dir(profile_id: str, sub: str) -> str:
    return os.path.join(VOICES_ROOT, "profiles", profile_id, sub)


def _state() -> dict[str, Any]:
    return mas.ensure(APP, {"profiles": {}, "active_profile_id": ""})


def _save(s: dict[str, Any]) -> bool:
    return mas.save(APP, s)


def _sanitize_filename(name: str) -> str:
    base = os.path.basename(name)
    stem, ext = os.path.splitext(base)
    stem = re.sub(r"[^a-zA-Z0-9_-]+", "_", stem)[:40] or "sample"
    ext = re.sub(r"[^a-zA-Z0-9.]+", "", ext).lower()
    if ext not in {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".aac", ".flac"}:
        ext = ".wav"
    return f"{stem}_{int(time.time())}{ext}"


def _xtts_urls() -> list[str]:
    gpu = os.environ.get("XTTS_GPU_URL", "http://127.0.0.1:8096")
    cpu = os.environ.get("XTTS_URL", "http://127.0.0.1:8097")
    urls = []
    if gpu:
        urls.append(gpu.rstrip("/"))
    if cpu and cpu != gpu:
        urls.append(cpu.rstrip("/"))
    return urls


def _xtts_available() -> dict[str, Any]:
    import urllib.error
    import urllib.request

    for url in _xtts_urls():
        try:
            with urllib.request.urlopen(f"{url}/health", timeout=3) as resp:
                data = resp.read().decode("utf-8", "replace")
            import json

            info = json.loads(data)
            return {"available": bool(info.get("ready")), "url": url, "info": info}
        except Exception:  # noqa: BLE001
            continue
    return {"available": False, "url": None, "info": {}}


def list_profiles() -> dict[str, Any]:
    s = _state()
    return {
        "profiles": list(s.get("profiles", {}).values()),
        "active_profile_id": s.get("active_profile_id", ""),
        "xtts": _xtts_available(),
    }


def get_profile(profile_id: str) -> Optional[dict[str, Any]]:
    if not VALID_ID.match(profile_id):
        return None
    return _state().get("profiles", {}).get(profile_id)


def save_profile(profile_id: str, name: str, description: str = "") -> dict[str, Any]:
    if not VALID_ID.match(profile_id):
        return {"ok": False, "error": "invalid profile id"}
    name = (name or "").strip()
    if not name:
        return {"ok": False, "error": "name required"}
    s = _state()
    profiles = s.setdefault("profiles", {})
    now = _now_ms()
    profiles[profile_id] = {
        "id": profile_id,
        "name": name,
        "description": (description or "").strip(),
        "raw_dir": _profile_dir(profile_id, "raw"),
        "ref_dir": _profile_dir(profile_id, "ref"),
        "created_at": profiles.get(profile_id, {}).get("created_at", now),
        "updated_at": now,
    }
    os.makedirs(profiles[profile_id]["raw_dir"], exist_ok=True)
    os.makedirs(profiles[profile_id]["ref_dir"], exist_ok=True)
    _save(s)
    return {"ok": True, "profile": profiles[profile_id]}


def create_profile(name: str, description: str = "") -> dict[str, Any]:
    profile_id = str(uuid.uuid4())[:8]
    return save_profile(profile_id, name, description)


def upload_sample(profile_id: str, filename: str, content: bytes) -> dict[str, Any]:
    if not VALID_ID.match(profile_id):
        return {"ok": False, "error": "invalid profile id"}
    profile = get_profile(profile_id)
    if profile is None:
        return {"ok": False, "error": "profile not found"}
    if not content:
        return {"ok": False, "error": "empty file"}
    raw_dir = profile["raw_dir"]
    os.makedirs(raw_dir, exist_ok=True)
    safe = _sanitize_filename(filename)
    path = os.path.join(raw_dir, safe)
    try:
        with open(path, "wb") as f:
            f.write(content)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"write failed: {e}"}
    return {"ok": True, "filename": safe, "path": path}


def build_profile(profile_id: str) -> dict[str, Any]:
    if not VALID_ID.match(profile_id):
        return {"ok": False, "error": "invalid profile id"}
    profile = get_profile(profile_id)
    if profile is None:
        return {"ok": False, "error": "profile not found"}
    work_dir = _profile_dir(profile_id, "work")
    cache_dir = _profile_dir(profile_id, "cache")
    qc_path = _profile_dir(profile_id, "QC_REPORT.md")
    for d in (work_dir, cache_dir):
        os.makedirs(d, exist_ok=True)
    cmd = [
        "python3",
        PIPELINE_SCRIPT,
        "--raw-dir",
        profile["raw_dir"],
        "--ref-dir",
        profile["ref_dir"],
        "--work-dir",
        work_dir,
        "--cache-dir",
        cache_dir,
        "--qc-path",
        qc_path,
        "--no-restart",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"pipeline failed: {e}"}
    ok = r.returncode == 0
    refs = []
    if os.path.isdir(profile["ref_dir"]):
        refs = sorted(f for f in os.listdir(profile["ref_dir"]) if f.lower().endswith(".wav"))
    qc = ""
    try:
        if os.path.exists(qc_path):
            qc = open(qc_path, encoding="utf-8", errors="ignore").read()[:2000]
    except Exception:  # noqa: BLE001
        pass
    return {
        "ok": ok,
        "returncode": r.returncode,
        "refs_count": len(refs),
        "refs": refs,
        "stdout": r.stdout[-2000:],
        "stderr": r.stderr[-2000:],
        "qc_excerpt": qc,
    }


def test_voice(text: str = "VoiceForge profile test.") -> dict[str, Any]:
    text = (text or "VoiceForge profile test.").strip()[:300]
    xtts = _xtts_available()
    return {
        "ok": True,
        "text": text,
        "xtts": xtts,
        "audio_url": f"/tts?text={quote(text)}",
    }


def activate_profile(profile_id: str) -> dict[str, Any]:
    if not VALID_ID.match(profile_id):
        return {"ok": False, "error": "invalid profile id"}
    profile = get_profile(profile_id)
    if profile is None:
        return {"ok": False, "error": "profile not found"}
    if not os.path.isdir(profile["ref_dir"]) or not any(f.lower().endswith(".wav") for f in os.listdir(profile["ref_dir"])):
        return {"ok": False, "error": "profile has no built references"}

    # Backup current active refs.
    if os.path.isdir(ACTIVE_REF_DIR) and any(f.lower().endswith(".wav") for f in os.listdir(ACTIVE_REF_DIR)):
        bak = ACTIVE_REF_DIR + "_backup_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        try:
            shutil.copytree(ACTIVE_REF_DIR, bak)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"backup failed: {e}"}

    # Install profile refs as active refs.
    try:
        os.makedirs(ACTIVE_REF_DIR, exist_ok=True)
        for f in os.listdir(ACTIVE_REF_DIR):
            if f.lower().endswith(".wav"):
                os.remove(os.path.join(ACTIVE_REF_DIR, f))
        for f in os.listdir(profile["ref_dir"]):
            if f.lower().endswith(".wav"):
                shutil.copy2(os.path.join(profile["ref_dir"], f), os.path.join(ACTIVE_REF_DIR, f))
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"install refs failed: {e}"}

    # Clear active clone cache.
    if os.path.isdir(ACTIVE_CACHE_DIR):
        for f in os.listdir(ACTIVE_CACHE_DIR):
            if f.lower().endswith(".wav"):
                try:
                    os.remove(os.path.join(ACTIVE_CACHE_DIR, f))
                except Exception:  # noqa: BLE001
                    pass

    # Restart clone service.
    try:
        r = subprocess.run(["pm2", "restart", "jarvis-voiceclone"], capture_output=True, text=True, timeout=60)
        restart_ok = r.returncode == 0
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"refs installed but restart failed: {e}"}

    s = _state()
    s["active_profile_id"] = profile_id
    _save(s)
    return {
        "ok": True,
        "active_profile_id": profile_id,
        "restart_ok": restart_ok,
    }


def delete_profile(profile_id: str) -> dict[str, Any]:
    if not VALID_ID.match(profile_id):
        return {"ok": False, "error": "invalid profile id"}
    s = _state()
    profile = s.get("profiles", {}).pop(profile_id, None)
    if profile is None:
        return {"ok": False, "error": "profile not found"}
    if s.get("active_profile_id") == profile_id:
        s["active_profile_id"] = ""
    _save(s)
    profile_root = os.path.join(VOICES_ROOT, "profiles", profile_id)
    try:
        if os.path.isdir(profile_root):
            shutil.rmtree(profile_root)
    except Exception as e:  # noqa: BLE001
        return {"ok": True, "warning": f"profile removed from state but directory cleanup failed: {e}"}
    return {"ok": True}
