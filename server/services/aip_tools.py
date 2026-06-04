"""AIP TOOL-USE + AI-ACTIONS + AGENT-WORKFLOWS — Palantir AIP pillars P9 (#63/#64/#65).

This is the AIP "do something" surface for JARVIS/APEX. It builds ALONGSIDE
``services.aip`` (grounded answers / prediction) and adds the three governed
capabilities of an AIP-style agent:

  * #64 TOOL-USE — a catalog of callable tools (:func:`list_tools`) and a single
    governed dispatcher (:func:`call_tool`). Tools wrap REAL implementations the
    backend already ships: ontology governed write-back
    (``ontology_store.apply_action``), the underworld 489-method science registry
    (via ``services.science_bridge``), grounded search (``services.aip.retrieve``)
    and read-only ontology queries.
  * #63 AI-PROPOSED GOVERNED ACTIONS — an AI may *propose* a data mutation, but it
    is persisted as a PENDING proposal and NOTHING changes until a human approves
    (:func:`propose_action` / :func:`list_proposals` / :func:`approve_proposal` /
    :func:`reject_proposal`). This mirrors the forge approval pattern but for the
    ontology DATA. Approval executes via ``ontology_store.apply_action`` and audits.
  * #65 AGENT WORKFLOWS — :func:`run_plan` executes a list of ``{tool, params}``
    steps sequentially, collecting a trace and stopping on the first hard error.
    Read-only tools auto-run; WRITE tools (the ontology actions) are NOT silently
    executed — they emit a proposal instead, unless the actor carries the
    ``auto_approve`` capability. Governed + honest.

Doctrine (mirrors the rest of the backend):
  * stdlib ``sqlite3`` only — no new dependency. Reuses existing services.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``).
  * NEVER raise on normal use — every public function degrades gracefully and
    returns a structured value on any failure.
  * GOVERNED — no silent writes. Mutations either go through the allow-listed
    ``ontology_store.apply_action`` (with an audit row) or through the
    propose/approve flow.

The proposal store lives in its own SQLite DB at env ``AIP_DB`` (default
``server/data/aip.db``), so it never interferes with the ontology / audit DBs.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import audit as _audit
from . import ontology_store as _ont
from . import science_bridge as _science

try:  # grounded retrieval (RAG) — best-effort
    from . import aip as _aip
except Exception:  # noqa: BLE001 - defensive
    _aip = None  # type: ignore[assignment]


# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "aip.db"
)


def _db_path() -> str:
    """Resolve the proposal DB at call-time so tests can set ``AIP_DB`` first."""
    return os.environ.get("AIP_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, default=str)
    except (TypeError, ValueError):
        return "{}"


def _loads(text: Optional[str]) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return {}


# ── Proposal store schema (idempotent) ───────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS proposal (
    id           TEXT PRIMARY KEY,
    object_id    TEXT NOT NULL,
    action       TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    rationale    TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'PENDING',
    actor        TEXT,
    approver     TEXT,
    result_json  TEXT NOT NULL DEFAULT '{}',
    created_ts   INTEGER NOT NULL,
    decided_ts   INTEGER
);
CREATE INDEX IF NOT EXISTS ix_proposal_status ON proposal (status, created_ts);
CREATE INDEX IF NOT EXISTS ix_proposal_object ON proposal (object_id);
"""

# Statuses
PENDING = "PENDING"
APPROVED = "APPROVED"
REJECTED = "REJECTED"

# Ontology actions that mutate DATA — these are the "write" tools. They are
# proposed (not auto-executed) inside an agent plan unless the actor is trusted.
_WRITE_ACTIONS = tuple(_ont.ALLOWED_ACTIONS)


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create the proposal table/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# #64 — TOOL CATALOG + DISPATCH
# ══════════════════════════════════════════════════════════════════════════════
# A documented STATIC subset of science methods to advertise when the underworld
# registry is not importable in this process — so the catalog is never empty and
# the contract is honest about what's reachable.
_STATIC_SCIENCE = [
    {"key": "sonar", "domain": "acoustics", "doc": "submarine/sonar acoustics"},
    {"key": "meteor", "domain": "physics", "doc": "meteor / impact dynamics"},
    {"key": "ppm", "domain": "chemistry", "doc": "atmospheric ppm chemistry"},
    {"key": "buoy", "domain": "oceanography", "doc": "buoy / ocean state"},
    {"key": "flight", "domain": "aero", "doc": "flight / aerodynamics"},
    {"key": "frequency", "domain": "rf", "doc": "frequency / RF"},
    {"key": "seismic", "domain": "seismic", "doc": "seismic wave propagation"},
    {"key": "quantum", "domain": "quantum", "doc": "quantum mechanics"},
]


def _ontology_tools() -> list[dict]:
    """The governed ontology write-back actions, surfaced as write tools."""
    schemas = {
        "set_property": {"object_id": "str", "key": "str", "value": "any"},
        "remove_property": {"object_id": "str", "key": "str"},
        "set_label": {"object_id": "str", "label": "str"},
        "set_mark": {"object_id": "str", "mark": "str"},
        "add_link": {"object_id": "str", "to": "str", "relation": "str?", "strength": "float?"},
        "flag": {"object_id": "str", "flag": "str?", "value": "any?"},
    }
    out: list[dict] = []
    for action in _ont.ALLOWED_ACTIONS:
        out.append(
            {
                "name": f"ontology.{action}",
                "kind": "write",
                "params_schema": schemas.get(action, {"object_id": "str"}),
                "description": f"Governed ontology write-back action: {action}.",
            }
        )
    return out


def _science_tools() -> list[dict]:
    """The science registry methods as read tools (one generic invoker + a sample
    of available method keys, live from the underworld registry when reachable)."""
    tools: list[dict] = [
        {
            "name": "science.run",
            "kind": "read",
            "params_schema": {"field": "str", "params": "dict?"},
            "description": (
                "Run a benchmark-verified science method from the underworld "
                "489-method registry by keyword (field), e.g. field='sonar'."
            ),
        }
    ]
    methods = _science.list_methods()
    if isinstance(methods, list) and methods:
        sample = methods[:40]
        avail = True
    else:
        sample = _STATIC_SCIENCE
        avail = False
    tools.append(
        {
            "name": "science.list",
            "kind": "read",
            "params_schema": {"domain": "str?"},
            "description": (
                "List available science methods/domains. "
                + ("live from registry." if avail else "static subset (registry offline).")
            ),
        }
    )
    # Advertise the sampled method keys so callers can discover real fields.
    tools.append(
        {
            "name": "science.catalog",
            "kind": "meta",
            "params_schema": {},
            "description": "Discovered science method keys.",
            "methods": [
                {"key": m.get("key"), "domain": m.get("domain"), "doc": m.get("doc")}
                for m in sample
            ],
            "registry_available": avail,
        }
    )
    return tools


def list_tools() -> list[dict]:
    """Return the catalog of callable tools — never raises, never empty.

    Each tool is ``{name, kind, params_schema, description}`` (science.catalog
    additionally carries discovered ``methods``). ``kind`` is one of:
      * ``read``  — side-effect-free; auto-runs in an agent plan.
      * ``write`` — mutates ontology DATA; proposed (governed) in a plan.
      * ``meta``  — informational (discovery).
    """
    tools: list[dict] = []
    try:
        tools.append(
            {
                "name": "ontology.query",
                "kind": "read",
                "params_schema": {"type": "str?", "where": "dict?", "limit": "int?"},
                "description": "Query ontology objects by type / property filter.",
            }
        )
        tools.append(
            {
                "name": "ontology.get",
                "kind": "read",
                "params_schema": {"object_id": "str"},
                "description": "Fetch one ontology object by id.",
            }
        )
        tools.append(
            {
                "name": "search",
                "kind": "read",
                "params_schema": {"query": "str", "k": "int?"},
                "description": "Grounded retrieval (RAG) over the ontology.",
            }
        )
        tools.extend(_science_tools())
        tools.extend(_ontology_tools())
    except Exception:  # noqa: BLE001 - catalog must never raise
        if not tools:
            tools = [
                {
                    "name": "search",
                    "kind": "read",
                    "params_schema": {"query": "str", "k": "int?"},
                    "description": "Grounded retrieval (RAG) over the ontology.",
                }
            ]
    return tools


def _tool_kind(name: str) -> Optional[str]:
    for t in list_tools():
        if t.get("name") == name:
            return t.get("kind")
    return None


def call_tool(name: str, params: Optional[dict] = None, actor: Optional[str] = None) -> dict:
    """Dispatch ``name`` to its REAL implementation. Returns ``{ok, result|error}``.

    Every call is audited. Never raises — an unknown tool or a downstream failure
    becomes ``{"ok": False, "error": ...}``. Write tools (``ontology.*``) execute
    the governed ``apply_action`` directly here (with its own audit row); callers
    who want the human-in-the-loop flow should use :func:`propose_action` instead.
    """
    name = str(name or "")
    params = params if isinstance(params, dict) else {}
    try:
        if name == "search":
            if _aip is None:
                result = []
            else:
                result = _aip.retrieve(str(params.get("query") or ""), int(params.get("k") or 8))
            out = {"ok": True, "result": result}

        elif name == "ontology.query":
            result = _ont.query_objects(
                type=params.get("type"),
                where=params.get("where"),
                limit=params.get("limit"),
            )
            out = {"ok": True, "result": result}

        elif name == "ontology.get":
            obj = _ont.get_object(str(params.get("object_id") or ""))
            if obj is None:
                out = {"ok": False, "error": "object not found"}
            else:
                out = {"ok": True, "result": obj}

        elif name in ("science.run",):
            res = _science.run_method(str(params.get("field") or ""), params.get("params"))
            ok = isinstance(res, dict) and res.get("status") == "ok"
            out = {"ok": bool(ok), "result": res} if ok else {"ok": False, "error": res}

        elif name == "science.list":
            methods = _science.list_methods()
            if isinstance(methods, list):
                dom = params.get("domain")
                if dom:
                    methods = [m for m in methods if m.get("domain") == dom]
                out = {"ok": True, "result": methods}
            else:
                out = {"ok": True, "result": _STATIC_SCIENCE, "note": methods}

        elif name == "science.catalog":
            out = {"ok": True, "result": _science_tools()}

        elif name.startswith("ontology."):
            action = name.split(".", 1)[1]
            if action not in _ont.ALLOWED_ACTIONS:
                out = {"ok": False, "error": f"unknown ontology action: {action}"}
            else:
                object_id = str(params.get("object_id") or "")
                payload = {k: v for k, v in params.items() if k != "object_id"}
                res = _ont.apply_action(object_id, action, payload, actor=actor)
                out = {"ok": bool(res.get("ok")), "result": res} if res.get("ok") else {
                    "ok": False,
                    "error": res.get("error", "action failed"),
                    "result": res,
                }
        else:
            out = {"ok": False, "error": f"unknown tool: {name}"}
    except Exception as exc:  # noqa: BLE001 - dispatcher must never raise
        out = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    try:
        _audit.record(
            actor or "anonymous",
            "aip.call_tool",
            name,
            {"params": params, "ok": out.get("ok")},
        )
    except Exception:  # noqa: BLE001
        pass
    return out


# ══════════════════════════════════════════════════════════════════════════════
# #63 — AI-PROPOSED GOVERNED ACTIONS (propose / list / approve / reject)
# ══════════════════════════════════════════════════════════════════════════════
def _row_to_proposal(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "object_id": r["object_id"],
        "action": r["action"],
        "payload": _loads(r["payload_json"]),
        "rationale": r["rationale"],
        "status": r["status"],
        "actor": r["actor"],
        "approver": r["approver"],
        "result": _loads(r["result_json"]),
        "created_ts": r["created_ts"],
        "decided_ts": r["decided_ts"],
    }


def propose_action(
    object_id: str,
    action: str,
    payload: Optional[dict] = None,
    rationale: str = "",
    actor: Optional[str] = None,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Persist a PENDING proposal WITHOUT mutating any data (#63).

    Returns ``{ok, proposal}`` or ``{ok: False, error}``. The proposed action is
    validated against the ontology allow-list, but NOTHING is written to the
    ontology — a human must :func:`approve_proposal` first. Audited. Never raises.
    """
    init_db(db_path)
    action = str(action or "")
    object_id = str(object_id or "")
    payload = payload if isinstance(payload, dict) else {}
    if action not in _ont.ALLOWED_ACTIONS:
        return {"ok": False, "error": f"action not allowed: {action}"}
    pid = uuid.uuid4().hex
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO proposal
                  (id, object_id, action, payload_json, rationale, status, actor,
                   approver, result_json, created_ts, decided_ts)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    pid, object_id, action, _dumps(payload), str(rationale or ""),
                    PENDING, actor, None, "{}", now, None,
                ),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM proposal WHERE id=?", (pid,)).fetchone()
            prop = _row_to_proposal(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    try:
        _audit.record(
            actor or "anonymous", "aip.propose_action", object_id,
            {"proposal_id": pid, "action": action, "payload": payload, "rationale": rationale},
        )
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "proposal": prop}


def list_proposals(status: Optional[str] = None, *, db_path: Optional[str] = None) -> list[dict]:
    """Return proposals, newest first, optionally filtered by ``status``. Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            if status:
                rows = conn.execute(
                    "SELECT * FROM proposal WHERE status=? ORDER BY created_ts DESC, id DESC",
                    (str(status),),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM proposal ORDER BY created_ts DESC, id DESC"
                ).fetchall()
            return [_row_to_proposal(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_proposal(proposal_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Return one proposal by id (or None). Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT * FROM proposal WHERE id=?", (str(proposal_id or ""),)
            ).fetchone()
            return _row_to_proposal(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def approve_proposal(proposal_id: str, approver: Optional[str] = None, *, db_path: Optional[str] = None) -> dict:
    """Approve + EXECUTE a pending proposal via ``ontology_store.apply_action``.

    Marks the proposal APPROVED, stores the execution result, and audits. Only a
    PENDING proposal can be approved (idempotent: a second approve is a no-op
    error). Returns ``{ok, proposal, result}`` or ``{ok: False, error}``. Never raises.
    """
    init_db(db_path)
    prop = get_proposal(proposal_id, db_path=db_path)
    if prop is None:
        return {"ok": False, "error": "proposal not found"}
    if prop["status"] != PENDING:
        return {"ok": False, "error": f"proposal is {prop['status']}, not {PENDING}"}

    # Execute the REAL governed write-back now (this is where DATA changes).
    result = _ont.apply_action(
        prop["object_id"], prop["action"], prop["payload"], actor=approver
    )
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE proposal SET status=?, approver=?, result_json=?, decided_ts=? WHERE id=?",
                (APPROVED, approver, _dumps(result), now, proposal_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM proposal WHERE id=?", (proposal_id,)).fetchone()
            prop = _row_to_proposal(row) if row else prop
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    try:
        _audit.record(
            approver or "anonymous", "aip.approve_proposal", prop["object_id"],
            {"proposal_id": proposal_id, "action": prop["action"], "result_ok": result.get("ok")},
        )
    except Exception:  # noqa: BLE001
        pass
    return {"ok": bool(result.get("ok")), "proposal": prop, "result": result}


def reject_proposal(proposal_id: str, approver: Optional[str] = None, *, db_path: Optional[str] = None) -> dict:
    """Mark a pending proposal REJECTED WITHOUT executing it. Audited. Never raises."""
    init_db(db_path)
    prop = get_proposal(proposal_id, db_path=db_path)
    if prop is None:
        return {"ok": False, "error": "proposal not found"}
    if prop["status"] != PENDING:
        return {"ok": False, "error": f"proposal is {prop['status']}, not {PENDING}"}
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE proposal SET status=?, approver=?, decided_ts=? WHERE id=?",
                (REJECTED, approver, now, proposal_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM proposal WHERE id=?", (proposal_id,)).fetchone()
            prop = _row_to_proposal(row) if row else prop
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    try:
        _audit.record(
            approver or "anonymous", "aip.reject_proposal", prop["object_id"],
            {"proposal_id": proposal_id, "action": prop["action"]},
        )
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "proposal": prop}


# ══════════════════════════════════════════════════════════════════════════════
# #65 — AGENT WORKFLOWS
# ══════════════════════════════════════════════════════════════════════════════
def _actor_can_auto_approve(actor: Any) -> bool:
    """Whether ``actor`` carries the ``auto_approve`` capability.

    ``actor`` may be a plain string (no capability) or a dict carrying flags, e.g.
    ``{"id": "agent-1", "auto_approve": true}``. Honest default: NO auto-approve.
    """
    if isinstance(actor, dict):
        return bool(actor.get("auto_approve"))
    return False


def _actor_id(actor: Any) -> Optional[str]:
    if isinstance(actor, dict):
        return actor.get("id") or actor.get("actor") or "agent"
    return actor


def run_plan(steps: Any, actor: Any = None, *, db_path: Optional[str] = None) -> dict:
    """Execute an agent plan of ``steps`` (#65). Governed + honest. Never raises.

    ``steps`` is a list of ``{tool, params}``. Each step is run sequentially:
      * READ / META tools run immediately via :func:`call_tool`.
      * WRITE tools (``ontology.*`` mutations) are NOT silently executed — instead
        a PENDING proposal is emitted via :func:`propose_action`, UNLESS the actor
        carries the ``auto_approve`` capability, in which case the write executes.

    Execution stops on the first HARD error (a step that returns ``ok=False`` for a
    read tool, or a proposal failure). Returns ``{ok, trace, n_steps, stopped_at}``
    where ``trace`` is the per-step record.
    """
    init_db(db_path)
    actor_id = _actor_id(actor)
    auto = _actor_can_auto_approve(actor)
    trace: list[dict] = []
    stopped_at: Optional[int] = None
    overall_ok = True

    if not isinstance(steps, list):
        return {"ok": False, "trace": [], "n_steps": 0, "stopped_at": None,
                "error": "steps must be a list of {tool, params}"}

    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            trace.append({"step": i, "error": "step must be a dict", "ok": False})
            overall_ok = False
            stopped_at = i
            break
        name = str(step.get("tool") or "")
        params = step.get("params") if isinstance(step.get("params"), dict) else {}
        kind = _tool_kind(name)

        if kind == "write":
            # Governed: propose instead of execute (unless trusted).
            action = name.split(".", 1)[1] if "." in name else name
            object_id = str(params.get("object_id") or "")
            payload = {k: v for k, v in params.items() if k != "object_id"}
            if auto:
                res = call_tool(name, params, actor=actor_id)
                rec = {"step": i, "tool": name, "mode": "executed", **res}
                if not res.get("ok"):
                    overall_ok = False
                    stopped_at = i
                    trace.append(rec)
                    break
            else:
                pr = propose_action(
                    object_id, action, payload,
                    rationale=str(step.get("rationale") or "agent plan step"),
                    actor=actor_id, db_path=db_path,
                )
                rec = {"step": i, "tool": name, "mode": "proposed", **pr}
                if not pr.get("ok"):
                    overall_ok = False
                    stopped_at = i
                    trace.append(rec)
                    break
            trace.append(rec)
        else:
            res = call_tool(name, params, actor=actor_id)
            rec = {"step": i, "tool": name, "mode": "executed", **res}
            trace.append(rec)
            if not res.get("ok"):
                overall_ok = False
                stopped_at = i
                break

    return {
        "ok": overall_ok,
        "trace": trace,
        "n_steps": len(steps),
        "stopped_at": stopped_at,
        "auto_approve": auto,
    }


# Bootstrap the default proposal DB on import so the first request finds the table.
init_db()
