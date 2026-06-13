"""MODE MIXER — behaviour-mode control for Jarvis.

Stores mode profiles in the shared mini_app_state JSON store. The active mode
is a lightweight configuration that other services can read via `get_active()`.
No service is forced to honour it, but it provides a single source of truth.
"""
from __future__ import annotations

import time
from typing import Any, Optional

from . import mini_app_state as mas

APP = "mode_mixer"

_DEFAULT_PRESETS = {
    "quiet": {
        "id": "quiet",
        "name": "Quiet",
        "tone": "minimal",
        "detail": "low",
        "speed": "fast",
        "strictness": 0.3,
        "privacy": "high",
        "tool_use": "limited",
        "cost": "low",
        "safety": "high",
        "autonomy": 0.1,
        "voice_style": "calm",
    },
    "detailed": {
        "id": "detailed",
        "name": "Detailed",
        "tone": "formal",
        "detail": "high",
        "speed": "normal",
        "strictness": 0.7,
        "privacy": "normal",
        "tool_use": "full",
        "cost": "normal",
        "safety": "high",
        "autonomy": 0.3,
        "voice_style": "clear",
    },
    "careful": {
        "id": "careful",
        "name": "Careful",
        "tone": "cautious",
        "detail": "high",
        "speed": "slow",
        "strictness": 0.9,
        "privacy": "high",
        "tool_use": "ask",
        "cost": "normal",
        "safety": "very_high",
        "autonomy": 0.0,
        "voice_style": "calm",
    },
    "fast": {
        "id": "fast",
        "name": "Fast",
        "tone": "direct",
        "detail": "low",
        "speed": "fast",
        "strictness": 0.2,
        "privacy": "normal",
        "tool_use": "full",
        "cost": "low",
        "safety": "normal",
        "autonomy": 0.4,
        "voice_style": "energetic",
    },
}


def _state() -> dict[str, Any]:
    return mas.ensure(APP, {"presets": dict(_DEFAULT_PRESETS), "custom": {}, "active": "detailed"})


def get_presets() -> dict[str, Any]:
    return _state().get("presets", {})


def get_custom() -> dict[str, Any]:
    return _state().get("custom", {})


def get_active() -> dict[str, Any]:
    s = _state()
    active_id = s.get("active", "detailed")
    profile = (s.get("presets") or {}).get(active_id) or (s.get("custom") or {}).get(active_id)
    if profile is None:
        profile = dict(_DEFAULT_PRESETS["detailed"])
        profile["id"] = active_id
    return {"active_id": active_id, "profile": profile}


def apply(id: str) -> dict[str, Any]:
    s = _state()
    if id not in (s.get("presets") or {}) and id not in (s.get("custom") or {}):
        return {"ok": False, "error": "profile not found"}
    s["active"] = id
    s["activated_at"] = int(time.time())
    mas.save(APP, s)
    return {"ok": True, "active": get_active()}


def save_profile(profile: dict[str, Any]) -> dict[str, Any]:
    s = _state()
    pid = str(profile.get("id") or f"custom-{int(time.time())}").strip()
    profile["id"] = pid
    s.setdefault("custom", {})[pid] = profile
    mas.save(APP, s)
    return {"ok": True, "profile": profile}


def mix(base_id: str, overrides: dict[str, Any]) -> dict[str, Any]:
    """Create a one-off mixed profile from a base + override map."""
    s = _state()
    base = (s.get("presets") or {}).get(base_id) or (s.get("custom") or {}).get(base_id)
    if base is None:
        return {"ok": False, "error": "base profile not found"}
    profile = dict(base)
    for k, v in overrides.items():
        if k in profile:
            profile[k] = v
    profile["id"] = f"mixed-{int(time.time())}"
    profile["name"] = f"Mixed from {base.get('name', base_id)}"
    s.setdefault("custom", {})[profile["id"]] = profile
    s["active"] = profile["id"]
    s["activated_at"] = int(time.time())
    mas.save(APP, s)
    return {"ok": True, "active": get_active()}
