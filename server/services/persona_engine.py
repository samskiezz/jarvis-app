"""Persona Engine — loads persona templates, injects memory context, and returns
a ready-to-use system prompt string.

Usage::

    from server.services.persona_engine import build_system_prompt, list_personas, set_active_persona, get_active_persona
    prompt = await build_system_prompt("butler", user_id="sam")

Persona choice is persisted per-user in a simple in-process cache (no new DB).
For production scale this should move to Redis / the user's profile table.
"""

from __future__ import annotations

from typing import Optional

from ..data.ontology import ontology_summary
from ..prompts.personas import list_personas as _list_personas, load_persona as _load_persona

try:
    from ..data import memory_store as _mem
except Exception:  # noqa: BLE001
    _mem = None  # type: ignore[assignment]

# In-process per-user active persona cache.
_user_persona: dict[str, str] = {}


def list_personas() -> list[str]:
    """Return available persona ids."""
    return _list_personas()


def get_active_persona(user_id: str) -> str:
    """Return the active persona id for a user (default 'butler')."""
    return _user_persona.get(str(user_id or "anonymous"), "butler")


def set_active_persona(user_id: str, persona_id: str) -> dict:
    """Set the active persona for a user."""
    available = _list_personas()
    pid = str(persona_id or "default")
    if pid not in available:
        pid = "default"
    _user_persona[str(user_id or "anonymous")] = pid
    return {"ok": True, "user_id": user_id, "persona": pid, "available": available}


async def _memory_context(user_id: str, limit: int = 6) -> str:
    """Fetch top memories and traits, formatted for prompt injection."""
    if _mem is None:
        return ""
    try:
        memories = await _mem.recall(user_id, limit=limit)
        traits = await _mem.get_traits(user_id, limit=limit)
    except Exception:  # noqa: BLE001
        return ""
    lines: list[str] = []
    if traits:
        lines.append("## Known traits")
        for t in traits:
            lines.append(f"- {t['trait']} (confidence {t['confidence']:.0%}): {t['evidence'][:180]}")
    if memories:
        lines.append("## Recent memories")
        for m in memories:
            lines.append(f"- {m['key']} [{m['importance']:.0%}]: {m['value'][:180]}")
    return "\n".join(lines) if lines else ""


async def build_system_prompt(
    persona_id: str | None = None,
    user_id: str | None = None,
) -> str:
    """Build a system prompt for the given persona, injecting ontology + memory.

    Args:
        persona_id: Which persona to load. If None, uses the user's active persona.
        user_id: The principal's id (for memory lookup).
    """
    uid = str(user_id or "anonymous")
    pid = str(persona_id or get_active_persona(uid))
    template = _load_persona(pid)
    mem_ctx = await _memory_context(uid)
    return template.replace("{ontology}", ontology_summary()).replace("{memory_context}", mem_ctx)


async def get_persona_with_memory(user_id: str) -> dict:
    """Return the full persona package for a user — prompt, id, and memory summary."""
    uid = str(user_id or "anonymous")
    pid = get_active_persona(uid)
    prompt = await build_system_prompt(pid, uid)
    profile: dict = {"user_id": uid, "persona": pid, "prompt": prompt}
    if _mem is not None:
        try:
            profile["memory_summary"] = await _mem.summarize_user(uid)
        except Exception:  # noqa: BLE001
            pass
    return profile
