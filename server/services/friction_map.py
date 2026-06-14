"""FRICTION MAP — detect repeated workflow friction.

Combines:
- recent user actions logged by the frontend (open app, search, retry)
- duplicate prompts and repeated errors from tiered_llm.db

Returns ranked friction items with suggestions (automation, ritual, spec).
Degrades gracefully.
"""
from __future__ import annotations

import sqlite3
import time
from collections import Counter
from typing import Any, Optional

from . import mini_app_state as mas

APP = "friction_map"
TL_DB = "server/data/tiered_llm.db"


def _db_path() -> str:
    import os
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, TL_DB)


def _state() -> dict[str, Any]:
    return mas.ensure(APP, {"actions": []})


def log_action(action: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    s = _state()
    entry = {"t": int(time.time()), "action": action, "detail": detail or {}}
    s.setdefault("actions", []).append(entry)
    s["actions"] = s["actions"][-1000:]
    mas.save(APP, s)
    return {"ok": True}


def _recent_actions(hours: int = 24) -> list[dict[str, Any]]:
    since = int(time.time()) - hours * 3600
    return [a for a in _state().get("actions", []) if (a.get("t") or 0) >= since]


def _duplicate_prompts(hours: int = 24, min_dupes: int = 2) -> list[dict[str, Any]]:
    since = int(time.time()) - hours * 3600
    try:
        conn = sqlite3.connect(_db_path(), timeout=4)
        rows = conn.execute(
            "SELECT prompt_tokens, err FROM tiered_llm_calls WHERE ts>?",
            (since,),
        ).fetchall()
        conn.close()
    except Exception:  # noqa: BLE001
        return []
    # We don't store raw prompts, so use prompt_tokens as a coarse proxy bucket.
    counts = Counter(str(p) for p, _ in rows)
    dupes = []
    for token_bucket, count in counts.most_common(20):
        if count >= min_dupes:
            dupes.append({"bucket": token_bucket, "count": count})
    return dupes


def _repeat_errors(hours: int = 24) -> list[dict[str, Any]]:
    since = int(time.time()) - hours * 3600
    try:
        conn = sqlite3.connect(_db_path(), timeout=4)
        rows = conn.execute(
            "SELECT err, COUNT(*) FROM tiered_llm_calls WHERE ts>? AND ok=0 AND err IS NOT NULL AND err!='' GROUP BY err ORDER BY COUNT(*) DESC LIMIT 20",
            (since,),
        ).fetchall()
        conn.close()
        return [{"error": e, "count": c} for e, c in rows if c >= 2]
    except Exception:  # noqa: BLE001
        return []


def scan(hours: int = 24) -> dict[str, Any]:
    actions = _recent_actions(hours)
    action_counts = Counter(a.get("action") for a in actions)
    repeated_actions = [
        {"action": a, "count": c}
        for a, c in action_counts.most_common()
        if c >= 3
    ]

    dupes = _duplicate_prompts(hours)
    errs = _repeat_errors(hours)

    findings: list[dict[str, Any]] = []
    for r in repeated_actions:
        findings.append({
            "kind": "repeated_action",
            "label": f"Repeated action: {r['action']}",
            "count": r["count"],
            "suggestion": "Consider a RitualDeck routine or shortcut.",
        })
    for d in dupes:
        findings.append({
            "kind": "duplicate_prompt",
            "label": f"Repeated call pattern (~{d['bucket']} tokens, content not stored)",
            "count": d["count"],
            "suggestion": "Use ThoughtCompressor to create a reusable pack.",
        })
    for e in errs:
        findings.append({
            "kind": "repeat_error",
            "label": f"Repeated error: {e['error'][:80]}",
            "count": e["count"],
            "suggestion": "Open PanicKey or AssetDNA to investigate.",
        })

    # Simple waiting friction heuristic: long gaps between actions with same label.
    # (placeholder for future richer instrumentation)

    score = min(100, len(findings) * 10 + sum(f.get("count", 0) for f in findings))
    return {
        "hours": hours,
        "score": score,
        "findings": findings,
        "action_summary": dict(action_counts.most_common(10)),
    }
