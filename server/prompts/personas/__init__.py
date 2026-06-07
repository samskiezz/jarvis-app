"""Persona registry — loads markdown system-prompt templates from disk.

Usage::

    from server.prompts.personas import list_personas, load_persona
    system_prompt = load_persona("butler")

Each persona is a plain markdown file containing the system prompt text.
The ``{ontology}`` and ``{memory_context}`` placeholders are replaced by
:mod:`server.services.persona_engine` at runtime.
"""

from __future__ import annotations

from pathlib import Path

_DIR = Path(__file__).resolve().parent


def list_personas() -> list[str]:
    """Return available persona ids (filenames without ``.md``)."""
    return sorted(
        p.stem for p in _DIR.glob("*.md") if p.is_file()
    )


def load_persona(persona_id: str) -> str:
    """Load raw markdown for a persona. Falls back to ``default`` if missing."""
    path = _DIR / f"{persona_id}.md"
    if not path.exists():
        path = _DIR / "default.md"
    if not path.exists():
        return "You are JARVIS, a helpful AI assistant."
    return path.read_text(encoding="utf-8")
