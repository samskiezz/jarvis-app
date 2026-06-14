"""THOUGHT COMPRESSOR — turn messy information into clean reusable memory packs.

Uses the LLM router for compression and stores packs as second-brain notes
(kind=pack). Degrades gracefully: if the LLM fails, returns a basic pack.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Optional

from . import llm_router
from . import second_brain as sb


def _now_ms() -> int:
    return int(time.time() * 1000)


def _slug(text: str) -> str:
    t = re.sub(r"[^a-zA-Z0-9\- ]+", "", text or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t[:60] or "pack"


def _prompt(source_type: str) -> str:
    return f"""You are ThoughtCompressor. Compress the following {source_type} into a clean, reusable working-memory pack.
Return ONLY valid JSON with these keys:
- short_summary: one or two sentences
- full_brief: a structured paragraph summary
- key_facts: list of key facts
- decisions: list of decisions made or implied
- risks: list of risks or uncertainties
- next_actions: list of concrete next actions
- uncertain: list of things marked as uncertain or needing verification
- sources: list of source snippets (short)
Do not include markdown code fences. Keep it factual."""


def compress(
    text: str,
    source_type: str = "text",
    title: Optional[str] = None,
    actor: Optional[str] = None,
) -> dict[str, Any]:
    if not text or not str(text).strip():
        return {"ok": False, "error": "empty input"}
    raw = str(text).strip()
    title = str(title or f"pack:{_now_ms()}:{_slug(raw.split('\\n')[0])}").strip()
    structured: dict[str, Any] = {}
    try:
        out = llm_router.complete(
            message=raw[:12000],
            system_prompt=_prompt(source_type),
            fmt="json",
            max_tokens=1024,
        )
        if out:
            import re as _re
            m = _re.search(r"\{.*\}", out, _re.S)   # tolerate code fences / prose around the JSON
            structured = json.loads(m.group(0) if m else out)
    except Exception:  # noqa: BLE001
        structured = {}

    if not isinstance(structured, dict):
        structured = {}

    # Fallback fields so the UI always has something useful.
    short = structured.get("short_summary") or raw[:200]
    full = structured.get("full_brief") or raw[:1000]
    body = f"## Summary\n\n{short}\n\n## Full brief\n\n{full}\n\n## Source\n\n{raw[:2000]}"

    note = sb.upsert_note(
        kind="pack",
        title=title,
        body_md=body,
        frontmatter={
            "source_type": source_type,
            "created_at": _now_ms(),
            "structured": structured,
        },
        actor=actor,
    )
    if note is None:
        return {"ok": False, "error": "failed to save pack"}
    return {"ok": True, "pack": note}


def list_packs(limit: int = 50) -> list[dict[str, Any]]:
    return sb.list_notes(kind="pack", limit=limit)


def get_pack(pack_id: str) -> Optional[dict[str, Any]]:
    return sb.get_note(pack_id)


def refresh(pack_id: str) -> dict[str, Any]:
    """Re-compress using the stored source snippet (best-effort)."""
    note = sb.get_note(pack_id)
    if note is None:
        return {"ok": False, "error": "pack not found"}
    fm = note.get("frontmatter") or {}
    structured = fm.get("structured") or {}
    source = note.get("body_md", "")
    # Extract source section if present.
    m = re.search(r"## Source\n\n(.+)$", source, re.S)
    if m:
        source = m.group(1)
    return compress(source, source_type=fm.get("source_type", "text"), title=note["title"])
