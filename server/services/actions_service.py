"""GOVERNED ACTIONS SERVICE — Palantir-style governed transactions (Ontology V2).

Every mutation flows through:
  1. define_action_type   → runtime registration of a governed action schema
  2. submit_action        → create a pending execution (validated against criteria)
  3. approve_action       → human approval gate (pending → approved)
  4. apply_action         → execute side effects (approved|pending → applied)

All state is persisted to a local SQLite DB (env ``ACTIONS_DB``). Every step is
audited to the ``action_audit`` table. Permission checks reuse
:mod:`server.services.redaction` so the clearance lattice is respected.

Doctrine (matching the rest of the backend): stdlib ``sqlite3`` only, never
raise — every public function degrades gracefully.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import ontology_store as store
from . import redaction
from . import revdb
from . import security

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "actions.db"
)


def _db_path() -> str:
    return os.environ.get("ACTIONS_DB", _DEFAULT_DB)


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


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS action_type (
    id                       TEXT PRIMARY KEY,
    name                     TEXT NOT NULL,
    parameters_json          TEXT NOT NULL DEFAULT '{}',
    submission_criteria_json TEXT NOT NULL DEFAULT '{}',
    side_effects_json        TEXT NOT NULL DEFAULT '[]',
    required_clearance       TEXT,
    created_ts               INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS action_execution (
    id             TEXT PRIMARY KEY,
    action_type_id TEXT NOT NULL,
    params_json    TEXT NOT NULL DEFAULT '{}',
    state          TEXT NOT NULL DEFAULT 'pending',
    actor          TEXT NOT NULL DEFAULT '',
    approver       TEXT,
    created_ts     INTEGER NOT NULL,
    applied_ts     INTEGER,
    error          TEXT
);
CREATE INDEX IF NOT EXISTS ix_exec_state ON action_execution (state);
CREATE INDEX IF NOT EXISTS ix_exec_type  ON action_execution (action_type_id);

CREATE TABLE IF NOT EXISTS action_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    resource    TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_action_audit_ts ON action_audit (ts);
"""


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
    """Idempotent DDL. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── internal helpers ────────────────────────────────────────────────────────────
def _audit(actor: str, action: str, resource: str, detail: dict) -> None:
    """Append a row to action_audit. Fire-and-forget."""
    try:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO action_audit (ts, actor, action, resource, detail_json)
                VALUES (?,?,?,?,?)
                """,
                (_now_ms(), actor, action, resource, _dumps(detail)),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _actor_clearance(actor: str) -> str:
    """Derive a clearance mark from an actor identifier (token or role string)."""
    if not actor:
        return redaction.DEFAULT_CLEARANCE
    # If the actor string is a known token, resolve via security.
    role = security.role_for_token(actor)
    if role and role != security.DEFAULT_ROLE:
        mapped = redaction._ROLE_TO_CLEARANCE.get(role)
        if mapped:
            return mapped
    # Allow passing a raw clearance mark as the actor for tests.
    c = actor.strip().upper()
    if c in redaction.MARK_LEVELS:
        return c
    return redaction.DEFAULT_CLEARANCE


def _validate_criteria(params: dict, criteria: dict) -> tuple[bool, Optional[str]]:
    """Declarative validation: range, arraySize, oneOf, objectQueryResult."""
    for key, rule in criteria.items():
        if not isinstance(rule, dict):
            continue
        val = params.get(key)

        # range
        if "min" in rule or "max" in rule:
            try:
                v = float(val) if val is not None else None
            except (TypeError, ValueError):
                return False, f"{key} must be numeric"
            if v is None:
                return False, f"{key} is required"
            if "min" in rule and v < float(rule["min"]):
                return False, f"{key} below minimum {rule['min']}"
            if "max" in rule and v > float(rule["max"]):
                return False, f"{key} above maximum {rule['max']}"

        # arraySize
        if "minLength" in rule or "maxLength" in rule:
            if not isinstance(val, list):
                return False, f"{key} must be an array"
            if "minLength" in rule and len(val) < int(rule["minLength"]):
                return False, f"{key} too short"
            if "maxLength" in rule and len(val) > int(rule["maxLength"]):
                return False, f"{key} too long"

        # oneOf
        if "oneOf" in rule:
            opts = rule["oneOf"]
            if isinstance(opts, list) and val not in opts:
                return False, f"{key} must be one of {opts}"

        # objectQueryResult
        if "objectQueryResult" in rule:
            q = rule["objectQueryResult"]
            obj_type = q.get("objectType")
            min_results = q.get("minResults", 1)
            results = store.query_objects(type=obj_type, limit=max(min_results, 1))
            if len(results) < min_results:
                return False, f"{key} object query returned insufficient results"

    return True, None


# ── public API ──────────────────────────────────────────────────────────────────
async def define_action_type(definition: dict) -> dict:
    """Register (or update) an action type at runtime."""
    init_db()
    name = definition.get("name", "")
    if not name:
        return {"ok": False, "error": "name required"}
    atid = definition.get("id") or uuid.uuid4().hex
    now = _now_ms()
    try:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO action_type
                    (id, name, parameters_json, submission_criteria_json,
                     side_effects_json, required_clearance, created_ts)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    parameters_json=excluded.parameters_json,
                    submission_criteria_json=excluded.submission_criteria_json,
                    side_effects_json=excluded.side_effects_json,
                    required_clearance=excluded.required_clearance
                """,
                (
                    atid,
                    name,
                    _dumps(definition.get("parameters")),
                    _dumps(definition.get("submission_criteria")),
                    _dumps(definition.get("side_effects")),
                    definition.get("required_clearance"),
                    now,
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    _audit("system", "action_type.defined", atid, {"name": name})
    return {"ok": True, "id": atid}


async def list_action_types() -> list[dict]:
    """List all registered action types, newest first."""
    init_db()
    try:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT * FROM action_type ORDER BY created_ts DESC"
            ).fetchall()
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "parameters": _loads(r["parameters_json"]),
                    "submission_criteria": _loads(r["submission_criteria_json"]),
                    "side_effects": _loads(r["side_effects_json"]),
                    "required_clearance": r["required_clearance"],
                    "created_ts": r["created_ts"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


async def submit_action(action_type_id: str, params: dict, actor: str) -> dict:
    """Create a pending action execution after criteria + clearance checks."""
    init_db()
    try:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT * FROM action_type WHERE id=?", (action_type_id,)
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    if row is None:
        return {"ok": False, "error": "unknown action type"}

    atype = {
        "parameters": _loads(row["parameters_json"]),
        "submission_criteria": _loads(row["submission_criteria_json"]),
        "required_clearance": row["required_clearance"],
    }

    # Clearance check via redaction lattice
    actor_clr = _actor_clearance(actor)
    req_clr = atype["required_clearance"] or redaction.DEFAULT_CLEARANCE
    if redaction.clearance_rank(actor_clr) < redaction.clearance_rank(req_clr):
        _audit(actor, "action.submit.denied", action_type_id,
               {"reason": "insufficient_clearance", "actor_clearance": actor_clr})
        return {"ok": False, "error": "insufficient clearance"}

    # Criteria validation
    ok, err = _validate_criteria(params, atype["submission_criteria"])
    if not ok:
        _audit(actor, "action.submit.denied", action_type_id, {"reason": err})
        return {"ok": False, "error": err}

    eid = uuid.uuid4().hex
    now = _now_ms()
    try:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO action_execution
                    (id, action_type_id, params_json, state, actor, created_ts)
                VALUES (?,?,?,?,?,?)
                """,
                (eid, action_type_id, _dumps(params), "pending", actor, now),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    _audit(actor, "action.submitted", eid,
           {"action_type_id": action_type_id, "params": params})
    return {"ok": True, "id": eid, "state": "pending"}


async def approve_action(execution_id: str, actor: str) -> dict:
    """Approve a pending execution (human gate)."""
    init_db()
    try:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT * FROM action_execution WHERE id=?", (execution_id,)
            ).fetchone()
            if row is None:
                return {"ok": False, "error": "execution not found"}
            if row["state"] != "pending":
                return {"ok": False, "error": f"cannot approve from state {row['state']}"}
            conn.execute(
                "UPDATE action_execution SET state='approved', approver=? WHERE id=?",
                (actor, execution_id),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    _audit(actor, "action.approved", execution_id, {})
    return {"ok": True, "state": "approved"}


async def apply_action(execution_id: str) -> dict:
    """Execute side effects for an approved (or pending) execution."""
    init_db()
    try:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT * FROM action_execution WHERE id=?", (execution_id,)
            ).fetchone()
            if row is None:
                return {"ok": False, "error": "execution not found"}
            if row["state"] not in ("pending", "approved"):
                return {"ok": False, "error": f"cannot apply from state {row['state']}"}
            at_row = conn.execute(
                "SELECT * FROM action_type WHERE id=?", (row["action_type_id"],)
            ).fetchone()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    if at_row is None:
        return {"ok": False, "error": "action type not found"}

    side_effects = _loads(at_row["side_effects_json"])
    params = _loads(row["params_json"])
    actor = row["actor"]

    for effect in side_effects:
        etype = effect.get("type")
        if etype == "webhook":
            url = effect.get("url", "")
            _audit(actor, "action.side_effect.webhook", execution_id, {"url": url})
        elif etype == "objectMutation":
            _apply_object_mutation(effect, params, actor, execution_id)
        elif etype == "notification":
            _audit(actor, "action.side_effect.notification", execution_id,
                   {"message": effect.get("message", "")})

    now = _now_ms()
    try:
        conn = _connect()
        try:
            conn.execute(
                "UPDATE action_execution SET state='applied', applied_ts=? WHERE id=?",
                (now, execution_id),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}

    _audit(actor, "action.applied", execution_id,
           {"side_effects": len(side_effects)})
    # RevDB: record action execution
    try:
        await revdb.commit(
            actor,
            f"action.applied {execution_id}",
            [
                {
                    "object_type": "action_execution",
                    "object_id": execution_id,
                    "operation": "apply",
                    "old_value": {"state": row["state"]},
                    "new_value": {"state": "applied"},
                }
            ],
        )
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "state": "applied"}


def _apply_object_mutation(effect: dict, params: dict, actor: str, execution_id: str) -> None:
    """Best-effort object mutation side effect."""
    obj_spec = dict(effect.get("object") or {})
    # Simple template substitution: replace {key} with params[key]
    merged: dict[str, Any] = {}
    for k, v in obj_spec.items():
        if isinstance(v, str) and "{" in v:
            try:
                merged[k] = v.format(**params)
            except KeyError:
                merged[k] = v
        else:
            merged[k] = v

    oid = merged.pop("objectId", None) or merged.pop("id", None)
    if oid is None:
        _audit(actor, "action.side_effect.objectMutation.skipped", execution_id,
               {"reason": "missing objectId"})
        return

    obj = store.get_object(oid)
    if obj:
        props = dict(obj.get("props") or {})
        # Merge props from the effect (excluding structural keys)
        for k, v in merged.items():
            if k not in ("type", "label", "mark"):
                props[k] = v
        store.upsert_object({
            "id": oid,
            "type": merged.get("type", obj.get("type")),
            "label": merged.get("label", obj.get("label")),
            "mark": merged.get("mark", obj.get("mark")),
            "props": props,
        })
    else:
        store.upsert_object({
            "id": oid,
            "type": merged.get("type", "object"),
            "label": merged.get("label", oid),
            "mark": merged.get("mark"),
            "props": {k: v for k, v in merged.items() if k not in ("type", "label", "mark")},
        })
    _audit(actor, "action.side_effect.objectMutation", oid,
           {"execution_id": execution_id})


async def list_executions(
    state: Optional[str] = None,
    action_type_id: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """List executions with optional filters."""
    init_db()
    try:
        conn = _connect()
        try:
            sql = "SELECT * FROM action_execution WHERE 1=1"
            args: list[Any] = []
            if state:
                sql += " AND state=?"
                args.append(state)
            if action_type_id:
                sql += " AND action_type_id=?"
                args.append(action_type_id)
            sql += " ORDER BY created_ts DESC LIMIT ?"
            args.append(limit)
            rows = conn.execute(sql, args).fetchall()
            return [
                {
                    "id": r["id"],
                    "action_type_id": r["action_type_id"],
                    "params": _loads(r["params_json"]),
                    "state": r["state"],
                    "actor": r["actor"],
                    "approver": r["approver"],
                    "created_ts": r["created_ts"],
                    "applied_ts": r["applied_ts"],
                    "error": r["error"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


async def get_execution(execution_id: str) -> Optional[dict]:
    """Fetch a single execution by id."""
    init_db()
    try:
        conn = _connect()
        try:
            r = conn.execute(
                "SELECT * FROM action_execution WHERE id=?", (execution_id,)
            ).fetchone()
            if r is None:
                return None
            return {
                "id": r["id"],
                "action_type_id": r["action_type_id"],
                "params": _loads(r["params_json"]),
                "state": r["state"],
                "actor": r["actor"],
                "approver": r["approver"],
                "created_ts": r["created_ts"],
                "applied_ts": r["applied_ts"],
                "error": r["error"],
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None
