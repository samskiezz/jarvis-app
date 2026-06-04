"""FORGE BRIDGE — read-only APEX view of the APEX Forge code-improvement agent.

Forge (``forge/``) is the autonomous, test-gated code-evolution agent: it scans
the codebase, researches improvements (DuckDuckGo / arXiv / GitHub trending), asks
a local Ollama model to improve files, and lands changes through a *reviewable*
approval pipeline (never touches ``main``). It runs as its own service / cluster
job.

This bridge surfaces Forge *inside the APEX app* without granting the web tier the
power to mutate code: it is **read-only** — it reports config/status and lists the
pending approval queue + diffs. Triggering an actual improvement cycle stays with
the Forge job (by design — the web app should never kick off model-driven code
rewrites). Every function degrades gracefully and never raises if Forge isn't
importable in this environment.
"""

from __future__ import annotations

import os
from typing import Any, Optional


def available() -> bool:
    """True if the Forge package is importable here."""
    try:
        import forge.approvals  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def _store():
    try:
        from forge.approvals import ApprovalStore

        return ApprovalStore()
    except Exception:  # noqa: BLE001
        return None


def status() -> dict:
    """Forge configuration + a cheap scan summary. Read-only, never raises."""
    out: dict[str, Any] = {
        "available": available(),
        "read_only": True,
        "note": "Web view is read-only; improvement cycles run in the Forge job/cluster.",
    }
    try:
        from forge.forge_agent import Config, iter_source_files

        cfg = Config()
        out["config"] = {
            "model": getattr(cfg, "model", os.environ.get("FORGE_MODEL", "deepseek-coder:6.7b")),
            "ollama_url": getattr(cfg, "ollama_url", os.environ.get("OLLAMA_URL", "")),
            "branch_policy": "never main — applies on forge/* via reviewable PR",
            "test_gated": True,
        }
        try:
            files = iter_source_files(cfg)
            out["candidate_files"] = len(files)
        except Exception:  # noqa: BLE001
            out["candidate_files"] = None
    except Exception:  # noqa: BLE001
        out["config"] = None
        out["candidate_files"] = None
    # queue depth
    pend = approvals(status="pending")
    out["pending_approvals"] = len(pend)
    return out


def _change_to_dict(c: Any, *, with_diff: bool = False) -> dict:
    d = {
        "id": getattr(c, "id", None),
        "path": getattr(c, "path", None),
        "status": getattr(c, "status", None),
        "created_at": getattr(c, "created_at", None),
        "by": getattr(c, "by", None),
    }
    diff = getattr(c, "diff", None)
    if diff is not None:
        d["diff_lines"] = len(str(diff).splitlines())
        if with_diff:
            d["diff"] = str(diff)[:20000]
    return d


def approvals(status: Optional[str] = None, limit: int = 100) -> list[dict]:
    """List Forge approval-queue changes (id/path/status/created_at + diff size).
    Read-only; returns [] if Forge/store unavailable. Never raises."""
    store = _store()
    if store is None:
        return []
    try:
        rows = store.list(status) if status else store.list()
        return [_change_to_dict(c) for c in (rows or [])][: max(0, limit)]
    except Exception:  # noqa: BLE001
        return []


def get_change(change_id: str) -> Optional[dict]:
    """A single change with its full diff (read-only). None if missing."""
    store = _store()
    if store is None:
        return None
    try:
        c = store.get(change_id)
        return _change_to_dict(c, with_diff=True) if c is not None else None
    except Exception:  # noqa: BLE001
        return None
