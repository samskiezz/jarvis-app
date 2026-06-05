"""JARVIS AIP — the governed action layer (Palantir/AIP-style execution flow).

Palantir-grade AI is not a loose chatbot: an action must flow through governance.
This module implements that exact pipeline natively, on top of the ``jarvis_os``
spine (RBAC, approvals, audit, tracing):

    execute(action, role, params)
      1. AUTHORIZE   — deny-by-default RBAC check (audited).
      2. APPROVAL    — high-risk actions open a human-in-the-loop gate and pause.
      3. TRACE       — the real action runs inside an observability span.
      4. EXECUTE     — the registered, governed callable runs.
      5. LINEAGE     — outputs are recorded with provenance (action, actor, ts).
      6. AUDIT       — the full outcome (status, cost, evidence) is logged.

Actions are not arbitrary code: they live in a TOOL/ACTION REGISTRY, each bound to
a required permission, a risk tier and an architecture layer — so the catalogue of
what the platform (or an agent) may do is explicit and governed.

The autonomous capabilities built earlier (enrichment, planner, autopilot) are
registered here, so they can no longer run un-audited: enrichment is now governed
("no unaudited scraping"), planner/autopilot are permissioned and traced.

stdlib only, never raises.
"""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Callable

from . import jarvis_os as jos

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")


# ───────────────────────────────────────────────────────────── lineage storage
def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _init() -> None:
    try:
        c = _conn()
        try:
            c.execute(
                """CREATE TABLE IF NOT EXISTS jos_lineage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, action TEXT,
                    actor TEXT, target TEXT, derived_from TEXT, meta TEXT
                )"""
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def record_lineage(action: str, target: str, *, actor: str = "system",
                   derived_from: list[str] | None = None, meta: dict | None = None) -> None:
    _init()
    try:
        c = _conn()
        try:
            c.execute(
                "INSERT INTO jos_lineage (ts,action,actor,target,derived_from,meta) VALUES (?,?,?,?,?,?)",
                (int(time.time() * 1000), action, actor, target,
                 json.dumps(derived_from or [], default=str), json.dumps(meta or {}, default=str)),
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def lineage(target: str | None = None, limit: int = 100) -> list[dict]:
    _init()
    try:
        c = _conn()
        try:
            if target:
                rows = c.execute("SELECT * FROM jos_lineage WHERE target=? ORDER BY id DESC LIMIT ?",
                                 (target, max(1, int(limit)))).fetchall()
            else:
                rows = c.execute("SELECT * FROM jos_lineage ORDER BY id DESC LIMIT ?",
                                 (max(1, int(limit)),)).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


# ───────────────────────────────────────────────────────────── action registry
@dataclass
class ActionSpec:
    name: str
    fn: Callable[..., Any]
    permission: str
    risk: str          # low | medium | high
    layer: str
    description: str


_REGISTRY: dict[str, ActionSpec] = {}


def register_action(name: str, fn: Callable[..., Any], *, permission: str,
                    risk: str = "medium", layer: str = "agent", description: str = "") -> None:
    _REGISTRY[name] = ActionSpec(name, fn, permission, risk, layer, description)


def registry() -> list[dict]:
    return [{"name": s.name, "permission": s.permission, "risk": s.risk,
             "layer": s.layer, "description": s.description} for s in _REGISTRY.values()]


# ───────────────────────────────────────────────────────────── the governed flow
def execute(action: str, *, role: str = "viewer", params: dict | None = None,
            actor: str = "system", approval_id: str | None = None) -> dict:
    """Run a registered action through the full AIP governance pipeline."""
    params = params or {}
    spec = _REGISTRY.get(action)
    if spec is None:
        return {"status": "unknown_action", "action": action}

    # 1. AUTHORIZE (deny-by-default, audited)
    if not jos.require(role, spec.permission, actor=actor):
        return {"status": "denied", "action": action, "needed": spec.permission, "role": role}

    # 2. APPROVAL gate for non-low-risk actions
    if spec.risk != "low":
        if approval_id is None:
            req = jos.request_approval(action, params, risk=spec.risk, actor=actor)
            if req.get("status") != "approved":      # pending → pause here
                return {"status": "pending_approval", "action": action,
                        "approval_id": req["id"], "risk": spec.risk}
            approval_id = req["id"]
        elif not jos.is_approved(approval_id):
            return {"status": "not_approved", "action": action, "approval_id": approval_id}

    # 3 + 4. TRACE + EXECUTE
    result: Any = None
    status = "executed"
    t0 = time.time()
    try:
        with jos.trace(action, layer=spec.layer, meta={"role": role, "actor": actor}):
            result = spec.fn(**params)
    except Exception as e:  # noqa: BLE001
        status = "error"
        result = {"error": str(e)[:200]}

    # 5. LINEAGE — capture produced objects with provenance
    produced = _produced_targets(result)
    for tgt in produced:
        record_lineage(action, tgt, actor=actor,
                       derived_from=_evidence_sources(result),
                       meta={"approval_id": approval_id})

    # 6. AUDIT the outcome
    jos.audit("action.execute", actor=actor, target=action,
              meta={"status": status, "role": role, "approval_id": approval_id,
                    "produced": len(produced), "duration_ms": int((time.time() - t0) * 1000)})

    return {"status": status, "action": action, "approval_id": approval_id,
            "produced": produced, "result": result}


def _produced_targets(result: Any) -> list[str]:
    """Best-effort extraction of objects an action created (for lineage)."""
    out: list[str] = []
    if isinstance(result, dict):
        for it in result.get("items", []) or []:
            if isinstance(it, dict) and it.get("title"):
                out.append(str(it["title"]))
    return out[:50]


def _evidence_sources(result: Any) -> list[str]:
    if isinstance(result, dict):
        su = result.get("sources_used")
        if isinstance(su, dict):
            return list(su.keys())
    return []


# ───────────────────────────────────────────────────────────── register real actions
def _bootstrap() -> None:
    """Bind the platform's real autonomous capabilities into the governed registry,
    so none of them can run outside the audit/approval/trace pipeline."""
    try:
        from . import brain_enrich as be
        register_action("knowledge.enrich", lambda **kw: be.enrich(**kw),
                        permission="enrich", risk="medium", layer="data",
                        description="Acquire external knowledge for gaps (audited, attributed).")
    except Exception:  # noqa: BLE001
        pass
    try:
        from . import brain_planner as bp
        register_action("agent.plan", lambda **kw: bp.run(**kw),
                        permission="workflow.run", risk="medium", layer="agent",
                        description="GOAP goal-directed autopilot planning + execution.")
    except Exception:  # noqa: BLE001
        pass
    try:
        from . import brain_autopilot as ap
        register_action("agent.autopilot", lambda **kw: ap.run(**kw),
                        permission="workflow.run", risk="high", layer="agent",
                        description="Self-improving vault autopilot (high-risk: writes at scale).")
    except Exception:  # noqa: BLE001
        pass


_bootstrap()
