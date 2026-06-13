"""SPEC FORGE — turn rough ideas into build-ready implementation specs.

Uses the LLM router to generate structured specs and stores them as second-brain
notes (kind=spec). Degrades gracefully if the LLM is unavailable.
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
    return t[:60] or "spec"


def _prompt() -> str:
    return """You are SpecForge. Turn the user's rough idea into a build-ready implementation spec.
Return ONLY valid JSON with these keys:
- title: concise spec title
- description: one-paragraph overview
- screens: list of screens/panels with purpose
- controls: list of user controls (buttons, inputs, sliders) with purpose
- backend_routes: list of API routes (method + path + purpose)
- data_model: list of data objects/fields
- events: list of domain events emitted
- guardrails: list of safety/validation rules
- tests: list of test cases
- mvp: list of MVP implementation steps
- future: list of future-version ideas
- clashes: list of potential clashes with existing features or risks
Keep it practical and grounded. Do not include markdown code fences."""


def create_spec(
    idea: str,
    context: str = "",
    actor: Optional[str] = None,
) -> dict[str, Any]:
    if not idea or not str(idea).strip():
        return {"ok": False, "error": "empty idea"}
    raw = str(idea).strip()
    structured: dict[str, Any] = {}
    try:
        out = llm_router.complete(
            message=f"Idea:\n{raw[:8000]}\n\nContext:\n{str(context)[:2000]}",
            system_prompt=_prompt(),
            fmt="json",
            max_tokens=1536,
        )
        if out:
            structured = json.loads(out)
    except Exception:  # noqa: BLE001
        structured = {}

    if not isinstance(structured, dict):
        structured = {}

    title = structured.get("title") or f"spec:{_now_ms()}:{_slug(raw.split('\\n')[0])}"
    body = f"# {title}\n\n## Description\n\n{structured.get('description', raw[:500])}\n\n"
    for section in ["screens", "controls", "backend_routes", "data_model", "events", "guardrails", "tests", "mvp", "future", "clashes"]:
        items = structured.get(section) or []
        if items:
            body += f"## {section.replace('_', ' ').title()}\n\n"
            for it in items:
                body += f"- {it}\n"
            body += "\n"

    note = sb.upsert_note(
        kind="spec",
        title=title,
        body_md=body,
        frontmatter={
            "created_at": _now_ms(),
            "structured": structured,
            "raw_idea": raw,
            "context": context,
            "status": "draft",
        },
        actor=actor,
    )
    if note is None:
        return {"ok": False, "error": "failed to save spec"}
    return {"ok": True, "spec": note}


def list_specs(limit: int = 50) -> list[dict[str, Any]]:
    return sb.list_notes(kind="spec", limit=limit)


def get_spec(spec_id: str) -> Optional[dict[str, Any]]:
    return sb.get_note(spec_id)


def approve(spec_id: str) -> dict[str, Any]:
    note = sb.get_note(spec_id)
    if note is None:
        return {"ok": False, "error": "spec not found"}
    fm = dict(note.get("frontmatter") or {})
    fm["status"] = "approved"
    fm["approved_at"] = _now_ms()
    updated = sb.upsert_note(
        kind="spec",
        title=note["title"],
        body_md=note.get("body_md", ""),
        frontmatter=fm,
        confidence=note.get("confidence"),
    )
    if updated is None:
        return {"ok": False, "error": "failed to update spec"}
    return {"ok": True, "spec": updated}
