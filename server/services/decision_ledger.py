"""DECISION LEDGER — records important decisions and the reasoning behind them.

Backed by the second-brain note store (kind=decision). Degrades gracefully.
"""
from __future__ import annotations

import time
from typing import Any, Optional

from . import second_brain as sb


def _now_ms() -> int:
    return int(time.time() * 1000)


def _body_from_fields(
    reason: str,
    evidence: list[str] | None = None,
    alternatives: list[str] | None = None,
    rejected: list[str] | None = None,
    risks: list[str] | None = None,
    expected_outcome: str = "",
) -> str:
    parts: list[str] = []
    parts.append(f"## Reason\n\n{reason or '(no reason recorded)'}")
    if evidence:
        parts.append("## Evidence\n\n" + "\n".join(f"- {e}" for e in evidence))
    if alternatives:
        parts.append("## Alternatives considered\n\n" + "\n".join(f"- {a}" for a in alternatives))
    if rejected:
        parts.append("## Rejected options\n\n" + "\n".join(f"- {r}" for r in rejected))
    if risks:
        parts.append("## Risks\n\n" + "\n".join(f"- {r}" for r in risks))
    if expected_outcome:
        parts.append(f"## Expected outcome\n\n{expected_outcome}")
    return "\n\n".join(parts)


def create_decision(
    title: str,
    reason: str,
    evidence: Optional[list[str]] = None,
    alternatives: Optional[list[str]] = None,
    rejected: Optional[list[str]] = None,
    risks: Optional[list[str]] = None,
    expected_outcome: str = "",
    review_at: Optional[int] = None,
    actor: Optional[str] = None,
) -> dict[str, Any]:
    if not title or not str(title).strip():
        return {"ok": False, "error": "title required"}
    note = sb.upsert_note(
        kind="decision",
        title=str(title).strip(),
        body_md=_body_from_fields(reason, evidence, alternatives, rejected, risks, expected_outcome),
        frontmatter={
            "state": "draft",
            "review_at": review_at,
            "actual_outcome": "",
            "score": None,
            "created_at": _now_ms(),
        },
        actor=actor,
    )
    if note is None:
        return {"ok": False, "error": "failed to save decision"}
    return {"ok": True, "decision": note}


def list_decisions(limit: int = 50) -> list[dict[str, Any]]:
    return sb.list_notes(kind="decision", limit=limit)


def get_decision(decision_id: str) -> Optional[dict[str, Any]]:
    return sb.get_note(decision_id)


def update_decision(
    decision_id: str,
    fields: dict[str, Any],
) -> dict[str, Any]:
    note = sb.get_note(decision_id)
    if note is None:
        return {"ok": False, "error": "decision not found"}
    fm = dict(note.get("frontmatter") or {})
    allowed = {"state", "review_at", "actual_outcome", "score"}
    for k, v in fields.items():
        if k in allowed:
            fm[k] = v
    fm["updated_at"] = _now_ms()
    updated = sb.upsert_note(
        kind="decision",
        title=note["title"],
        body_md=note.get("body_md", ""),
        frontmatter=fm,
        confidence=note.get("confidence"),
    )
    if updated is None:
        return {"ok": False, "error": "failed to update decision"}
    return {"ok": True, "decision": updated}


def finalize(decision_id: str) -> dict[str, Any]:
    return update_decision(decision_id, {"state": "final"})


def review(decision_id: str, actual_outcome: str, score: Optional[float] = None) -> dict[str, Any]:
    return update_decision(
        decision_id,
        {"state": "reviewed", "actual_outcome": actual_outcome, "score": score},
    )
