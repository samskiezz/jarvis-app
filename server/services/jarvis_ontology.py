"""JARVIS ONTOLOGY — the operational ontology core (Palantir Ontology-style).

Palantir's mental model: the Ontology encodes the *data, logic, action and security*
of the enterprise. This module implements that natively (stdlib only, never raises),
on top of the ``jarvis_os`` governance spine:

  * OBJECT TYPE registry   — typed objects with a property schema + a lifecycle
                             (allowed states + the initial state).
  * LINK TYPE registry     — governed relationship types (from_type → to_type).
  * ACTION TYPE registry   — governed state transitions on objects, each bound to
                             an RBAC permission + a risk tier (the Action Layer).
  * OBJECTS + LINKS        — instances, validated against their type's schema.
  * LIFECYCLE engine       — a transition is only legal if an action type permits
                             from_state → to_state.
  * POLICY-BOUND access    — create/link/act are deny-by-default RBAC checks.
  * EVENT model            — every mutation emits a tamper-evident audit event and
                             records provenance/lineage. Objects are never mutated
                             except through a governed action.

Persists in the app's brain SQLite DB (``ont_*`` tables).
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid

from . import jarvis_aip as aip
from . import jarvis_os as jos

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")

_TYPES = {"str", "int", "float", "bool", "list", "dict"}


# ───────────────────────────────────────────────────────────── storage
def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS ont_object_type (
                    name TEXT PRIMARY KEY, schema TEXT, states TEXT, initial TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS ont_link_type (
                    name TEXT PRIMARY KEY, from_type TEXT, to_type TEXT, cardinality TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS ont_action_type (
                    name TEXT PRIMARY KEY, object_type TEXT, permission TEXT, risk TEXT,
                    from_state TEXT, to_state TEXT, description TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS ont_object (
                    id TEXT PRIMARY KEY, type TEXT, props TEXT, state TEXT,
                    created_ts INTEGER, updated_ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS ont_link (
                    id TEXT PRIMARY KEY, type TEXT, from_id TEXT, to_id TEXT, ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS ont_event (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, object_id TEXT,
                    kind TEXT, actor TEXT, detail TEXT
                );
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def _event(object_id: str, kind: str, *, actor: str, detail: dict | None = None) -> None:
    """Emit an ontology event: object-scoped history + tamper-evident audit + lineage."""
    init_db()
    try:
        c = _conn()
        try:
            c.execute("INSERT INTO ont_event (ts,object_id,kind,actor,detail) VALUES (?,?,?,?,?)",
                      (int(time.time() * 1000), object_id, kind, actor, json.dumps(detail or {}, default=str)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit(f"ontology.{kind}", actor=actor, target=object_id, meta=detail or {})


# ───────────────────────────────────────────────────────────── type registries
def define_object_type(name: str, properties: dict, *, states: list[str] | None = None,
                       initial: str = "active") -> dict:
    """Register a typed object. ``properties`` maps field → type name (str/int/...)."""
    init_db()
    schema = {k: (v if v in _TYPES else "str") for k, v in (properties or {}).items()}
    states = states or ["active", "archived"]
    if initial not in states:
        initial = states[0]
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO ont_object_type (name,schema,states,initial,ts) VALUES (?,?,?,?,?)",
                      (name, json.dumps(schema), json.dumps(states), initial, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit("ontology.define_object_type", target=name, meta={"schema": schema, "states": states})
    return {"name": name, "schema": schema, "states": states, "initial": initial}


def define_link_type(name: str, from_type: str, to_type: str, *, cardinality: str = "many") -> dict:
    init_db()
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO ont_link_type (name,from_type,to_type,cardinality,ts) VALUES (?,?,?,?,?)",
                      (name, from_type, to_type, cardinality, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit("ontology.define_link_type", target=name, meta={"from": from_type, "to": to_type})
    return {"name": name, "from_type": from_type, "to_type": to_type, "cardinality": cardinality}


def define_action_type(name: str, object_type: str, *, permission: str, from_state: str,
                       to_state: str, risk: str = "medium", description: str = "") -> dict:
    """Register a governed transition: applying ``name`` to an ``object_type`` in
    ``from_state`` moves it to ``to_state``, if the caller holds ``permission``."""
    init_db()
    try:
        c = _conn()
        try:
            c.execute(
                "INSERT OR REPLACE INTO ont_action_type "
                "(name,object_type,permission,risk,from_state,to_state,description,ts) VALUES (?,?,?,?,?,?,?,?)",
                (name, object_type, permission, risk, from_state, to_state, description, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit("ontology.define_action_type", target=name,
              meta={"object_type": object_type, "permission": permission, "risk": risk,
                    "transition": f"{from_state}->{to_state}"})
    return {"name": name, "object_type": object_type, "permission": permission, "risk": risk,
            "from_state": from_state, "to_state": to_state}


def _get_object_type(name: str) -> dict | None:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM ont_object_type WHERE name=?", (name,)).fetchone()
        finally:
            c.close()
        return dict(r) if r else None
    except Exception:  # noqa: BLE001
        return None


# ───────────────────────────────────────────────────────────── objects + links
def _validate(schema: dict, props: dict) -> dict:
    """Coerce/validate props against the schema; drop unknown fields."""
    pytypes = {"str": str, "int": int, "float": float, "bool": bool, "list": list, "dict": dict}
    out = {}
    for k, t in schema.items():
        if k in props:
            want = pytypes.get(t, str)
            v = props[k]
            try:
                out[k] = v if isinstance(v, want) else want(v)
            except Exception:  # noqa: BLE001
                out[k] = v
    return out


def create_object(object_type: str, props: dict, *, role: str = "viewer", actor: str = "system") -> dict:
    """Create a typed object (policy-checked, schema-validated, event-emitting)."""
    ot = _get_object_type(object_type)
    if ot is None:
        return {"status": "unknown_type", "type": object_type}
    if not jos.require(role, "write" if "write" in jos.ROLES.get(role, set()) or role == "admin" else "enrich", actor=actor) \
       and not jos.can(role, "*"):
        # objects require at least analyst-grade write capability; deny-by-default
        if not jos.can(role, "enrich"):
            return {"status": "denied", "needed": "write/enrich", "role": role}
    schema = json.loads(ot["schema"] or "{}")
    oid = f"{object_type.lower()}:{uuid.uuid4().hex[:10]}"
    now = int(time.time() * 1000)
    obj = {"id": oid, "type": object_type, "props": _validate(schema, props or {}),
           "state": ot["initial"], "created_ts": now, "updated_ts": now}
    try:
        c = _conn()
        try:
            c.execute("INSERT INTO ont_object (id,type,props,state,created_ts,updated_ts) VALUES (?,?,?,?,?,?)",
                      (oid, object_type, json.dumps(obj["props"], default=str), obj["state"], now, now))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error", "type": object_type}
    _event(oid, "create", actor=actor, detail={"type": object_type, "state": obj["state"]})
    aip.record_lineage("ontology.create", oid, actor=actor, meta={"type": object_type})
    return {"status": "created", **obj}


def get_object(object_id: str) -> dict | None:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM ont_object WHERE id=?", (object_id,)).fetchone()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return None
    if not r:
        return None
    d = dict(r)
    d["props"] = json.loads(d.get("props") or "{}")
    return d


def list_objects(object_type: str | None = None, limit: int = 100) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            if object_type:
                rows = c.execute("SELECT id,type,state,updated_ts FROM ont_object WHERE type=? ORDER BY updated_ts DESC LIMIT ?",
                                 (object_type, max(1, int(limit)))).fetchall()
            else:
                rows = c.execute("SELECT id,type,state,updated_ts FROM ont_object ORDER BY updated_ts DESC LIMIT ?",
                                 (max(1, int(limit)),)).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


def link_objects(link_type: str, from_id: str, to_id: str, *, role: str = "viewer",
                 actor: str = "system") -> dict:
    """Create a governed relationship between two objects (type-checked)."""
    init_db()
    if not jos.can(role, "enrich") and not jos.can(role, "*"):
        return {"status": "denied", "needed": "write", "role": role}
    try:
        c = _conn()
        try:
            lt = c.execute("SELECT * FROM ont_link_type WHERE name=?", (link_type,)).fetchone()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        lt = None
    if not lt:
        return {"status": "unknown_link_type", "type": link_type}
    a, b = get_object(from_id), get_object(to_id)
    if not a or not b:
        return {"status": "missing_object"}
    if a["type"] != lt["from_type"] or b["type"] != lt["to_type"]:
        return {"status": "type_mismatch",
                "expected": f"{lt['from_type']}->{lt['to_type']}", "got": f"{a['type']}->{b['type']}"}
    lid = f"link:{uuid.uuid4().hex[:10]}"
    try:
        c = _conn()
        try:
            c.execute("INSERT INTO ont_link (id,type,from_id,to_id,ts) VALUES (?,?,?,?,?)",
                      (lid, link_type, from_id, to_id, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    _event(from_id, "link", actor=actor, detail={"link": link_type, "to": to_id})
    return {"status": "linked", "id": lid, "type": link_type, "from": from_id, "to": to_id}


def neighbors(object_id: str) -> dict:
    """Outbound + inbound links for an object (graph traversal)."""
    init_db()
    try:
        c = _conn()
        try:
            out = c.execute("SELECT type,to_id FROM ont_link WHERE from_id=?", (object_id,)).fetchall()
            inc = c.execute("SELECT type,from_id FROM ont_link WHERE to_id=?", (object_id,)).fetchall()
        finally:
            c.close()
        return {"object": object_id,
                "out": [{"type": r["type"], "to": r["to_id"]} for r in out],
                "in": [{"type": r["type"], "from": r["from_id"]} for r in inc]}
    except Exception:  # noqa: BLE001
        return {"object": object_id, "out": [], "in": []}


# ───────────────────────────────────────────────────────────── the Action Layer
def apply_action(action_name: str, object_id: str, *, role: str = "viewer",
                 actor: str = "system", approval_id: str | None = None) -> dict:
    """Apply a governed action to an object: RBAC → approval (if risky) → validate
    lifecycle transition → mutate state → emit event + lineage + audit."""
    init_db()
    try:
        c = _conn()
        try:
            at = c.execute("SELECT * FROM ont_action_type WHERE name=?", (action_name,)).fetchone()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        at = None
    if not at:
        return {"status": "unknown_action", "action": action_name}
    obj = get_object(object_id)
    if not obj:
        return {"status": "missing_object", "object": object_id}
    if obj["type"] != at["object_type"]:
        return {"status": "type_mismatch", "expected": at["object_type"], "got": obj["type"]}

    # 1. RBAC (deny-by-default, audited)
    if not jos.require(role, at["permission"], actor=actor):
        return {"status": "denied", "needed": at["permission"], "role": role}

    # 2. lifecycle guard
    if obj["state"] != at["from_state"]:
        return {"status": "illegal_transition", "object_state": obj["state"],
                "requires": at["from_state"]}

    # 3. approval gate for non-low-risk actions
    if at["risk"] != "low":
        if approval_id is None:
            req = jos.request_approval(f"ontology.{action_name}",
                                       {"object": object_id, "to_state": at["to_state"]},
                                       risk=at["risk"], actor=actor)
            if req.get("status") != "approved":
                return {"status": "pending_approval", "approval_id": req["id"], "risk": at["risk"]}
            approval_id = req["id"]
        elif not jos.is_approved(approval_id):
            return {"status": "not_approved", "approval_id": approval_id}

    # 4. mutate state
    new_state = at["to_state"]
    try:
        c = _conn()
        try:
            c.execute("UPDATE ont_object SET state=?,updated_ts=? WHERE id=?",
                      (new_state, int(time.time() * 1000), object_id))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    # 5. event + lineage + audit
    _event(object_id, "action", actor=actor,
           detail={"action": action_name, "from": at["from_state"], "to": new_state,
                   "approval_id": approval_id})
    aip.record_lineage(f"ontology.action.{action_name}", object_id, actor=actor,
                       meta={"transition": f"{at['from_state']}->{new_state}"})
    return {"status": "applied", "action": action_name, "object": object_id,
            "from_state": at["from_state"], "to_state": new_state, "approval_id": approval_id}


def object_history(object_id: str, limit: int = 100) -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM ont_event WHERE object_id=? ORDER BY id DESC LIMIT ?",
                             (object_id, max(1, int(limit)))).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


# ───────────────────────────────────────────────────────────── introspection
def seed_mission_ontology() -> dict:
    """Bootstrap a starter mission ontology (Person/Organisation/Asset/Event/
    Location + governed links + lifecycle actions). Idempotent."""
    define_object_type("Person", {"name": "str", "role": "str", "email": "str"},
                       states=["active", "flagged", "cleared"], initial="active")
    define_object_type("Organisation", {"name": "str", "sector": "str", "country": "str"},
                       states=["active", "under_review", "cleared"], initial="active")
    define_object_type("Asset", {"name": "str", "kind": "str", "value": "float"},
                       states=["active", "frozen", "released"], initial="active")
    define_object_type("Event", {"name": "str", "kind": "str", "ts": "str"},
                       states=["open", "investigating", "closed"], initial="open")
    define_object_type("Location", {"name": "str", "lat": "float", "lon": "float"},
                       states=["active", "restricted"], initial="active")
    define_link_type("works_for", "Person", "Organisation")
    define_link_type("owns", "Organisation", "Asset")
    define_link_type("located_at", "Asset", "Location")
    define_link_type("involved_in", "Person", "Event")
    define_action_type("flag_risk", "Person", permission="workflow.run",
                       from_state="active", to_state="flagged", risk="high",
                       description="Flag a person for risk review.")
    define_action_type("clear", "Person", permission="workflow.approve",
                       from_state="flagged", to_state="cleared", risk="medium",
                       description="Clear a flagged person after review.")
    define_action_type("freeze", "Asset", permission="workflow.run",
                       from_state="active", to_state="frozen", risk="high",
                       description="Freeze an asset pending investigation.")
    jos.audit("ontology.seed_mission", target="mission")
    return schema()


def schema() -> dict:
    """The full ontology schema: object/link/action types + instance counts."""
    init_db()
    out = {"object_types": [], "link_types": [], "action_types": [], "counts": {}}
    try:
        c = _conn()
        try:
            for r in c.execute("SELECT * FROM ont_object_type").fetchall():
                d = dict(r); d["schema"] = json.loads(d["schema"] or "{}"); d["states"] = json.loads(d["states"] or "[]")
                out["object_types"].append(d)
            out["link_types"] = [dict(r) for r in c.execute("SELECT * FROM ont_link_type").fetchall()]
            out["action_types"] = [dict(r) for r in c.execute("SELECT * FROM ont_action_type").fetchall()]
            out["counts"] = {
                "objects": c.execute("SELECT COUNT(*) FROM ont_object").fetchone()[0],
                "links": c.execute("SELECT COUNT(*) FROM ont_link").fetchone()[0],
                "events": c.execute("SELECT COUNT(*) FROM ont_event").fetchone()[0],
            }
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    return out
