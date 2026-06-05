"""JARVIS SANDBOX — sandbox universes / operational branching (doctrine Layer 9).

"A system that cannot simulate is just a reporting system." This is real branchable
object state: fork the ontology into a named universe, apply hypothetical actions
and edits there WITHOUT touching production, diff against the base, then promote
(commit to main) or discard — all governed and audited.

Implemented as a copy-on-write overlay over the ontology object store (stdlib only,
never raises): a branch only stores the objects it has changed; everything else is
read through to ``main``.
"""

from __future__ import annotations

import json
import sqlite3
import time

from . import jarvis_os as jos

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from . import jarvis_events as events
except Exception:  # noqa: BLE001
    events = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")


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
                CREATE TABLE IF NOT EXISTS sbx_branch (
                    name TEXT PRIMARY KEY, base TEXT, status TEXT, actor TEXT, created_ts INTEGER
                );
                CREATE TABLE IF NOT EXISTS sbx_overlay (
                    branch TEXT, object_id TEXT, props TEXT, state TEXT, changed_ts INTEGER,
                    PRIMARY KEY (branch, object_id)
                );
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def create_branch(name: str, *, base: str = "main", actor: str = "system") -> dict:
    init_db()
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO sbx_branch (name,base,status,actor,created_ts) VALUES (?,?,?,?,?)",
                      (name, base, "open", actor, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    jos.audit("sandbox.create_branch", actor=actor, target=name, meta={"base": base})
    if events:
        events.emit("sandbox", "branch.created", {"branch": name, "base": base}, actor=actor)
    return {"status": "created", "branch": name, "base": base}


def list_branches() -> list[dict]:
    init_db()
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM sbx_branch ORDER BY created_ts DESC").fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


def _overlay(branch: str, object_id: str) -> dict | None:
    init_db()
    try:
        c = _conn()
        try:
            r = c.execute("SELECT * FROM sbx_overlay WHERE branch=? AND object_id=?", (branch, object_id)).fetchone()
        finally:
            c.close()
        if not r:
            return None
        return {"id": object_id, "props": json.loads(r["props"] or "{}"), "state": r["state"]}
    except Exception:  # noqa: BLE001
        return None


def branch_get(branch: str, object_id: str) -> dict | None:
    """Read an object in a branch: the overlay if changed here, else read-through to main."""
    ov = _overlay(branch, object_id)
    if ov is not None:
        base = ont.get_object(object_id) if ont else None
        ov["type"] = base["type"] if base else None
        ov["branch"] = branch
        ov["modified_in_branch"] = True
        return ov
    obj = ont.get_object(object_id) if ont else None
    if obj:
        obj["branch"] = branch
        obj["modified_in_branch"] = False
    return obj


def _write_overlay(branch: str, object_id: str, props: dict, state: str) -> None:
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO sbx_overlay (branch,object_id,props,state,changed_ts) VALUES (?,?,?,?,?)",
                      (branch, object_id, json.dumps(props, default=str), state, int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def branch_set_prop(branch: str, object_id: str, prop: str, value, *, actor: str = "system") -> dict:
    """Hypothetically edit a property in the branch only."""
    cur = branch_get(branch, object_id)
    if not cur:
        return {"status": "not_found"}
    props = dict(cur.get("props") or {})
    props[prop] = value
    _write_overlay(branch, object_id, props, cur.get("state", "active"))
    jos.audit("sandbox.set_prop", actor=actor, target=f"{branch}:{object_id}", meta={"prop": prop})
    return {"status": "ok", "branch": branch, "object": object_id, "prop": prop, "value": value}


def branch_apply_action(branch: str, action_name: str, object_id: str, *,
                        role: str = "operator", actor: str = "system") -> dict:
    """Apply a governed action's transition in the BRANCH only (no prod mutation,
    no approval gate — it's a simulation). RBAC still applies."""
    if ont is None:
        return {"status": "ontology_unavailable"}
    if not jos.require(role, "workflow.run", actor=actor):
        return {"status": "denied", "needed": "workflow.run", "role": role}
    cur = branch_get(branch, object_id)
    if not cur:
        return {"status": "not_found"}
    try:
        c = _conn()
        try:
            at = c.execute("SELECT * FROM ont_action_type WHERE name=?", (action_name,)).fetchone()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        at = None
    if not at:
        return {"status": "unknown_action"}
    if cur.get("state") != at["from_state"]:
        return {"status": "illegal_transition", "object_state": cur.get("state"), "requires": at["from_state"]}
    _write_overlay(branch, object_id, cur.get("props") or {}, at["to_state"])
    jos.audit("sandbox.apply_action", actor=actor, target=f"{branch}:{object_id}",
              meta={"action": action_name, "to": at["to_state"]})
    if events:
        events.emit("sandbox", "action.simulated",
                    {"branch": branch, "object": object_id, "action": action_name}, actor=actor)
    return {"status": "simulated", "branch": branch, "object": object_id,
            "action": action_name, "from_state": at["from_state"], "to_state": at["to_state"]}


def diff(branch: str) -> dict:
    """Compare a branch against its base: what changed, before → after."""
    init_db()
    changes = []
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM sbx_overlay WHERE branch=?", (branch,)).fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        rows = []
    for r in rows:
        base = ont.get_object(r["object_id"]) if ont else None
        after = {"props": json.loads(r["props"] or "{}"), "state": r["state"]}
        changes.append({"object_id": r["object_id"],
                        "before": {"props": base["props"], "state": base["state"]} if base else None,
                        "after": after})
    return {"branch": branch, "changed": len(changes), "changes": changes}


def promote(branch: str, *, role: str = "operator", actor: str = "system") -> dict:
    """Commit a branch's overlay into the main ontology (governed + audited)."""
    if ont is None:
        return {"status": "ontology_unavailable"}
    if not jos.require(role, "workflow.run", actor=actor):
        return {"status": "denied", "needed": "workflow.run", "role": role}
    init_db()
    d = diff(branch)
    applied = 0
    for ch in d["changes"]:
        oid = ch["object_id"]
        after = ch["after"]
        try:
            c = _conn()
            try:
                c.execute("UPDATE ont_object SET props=?, state=?, updated_ts=? WHERE id=?",
                          (json.dumps(after["props"], default=str), after["state"], int(time.time() * 1000), oid))
                c.commit()
            finally:
                c.close()
            applied += 1
        except Exception:  # noqa: BLE001
            continue
    try:
        c = _conn()
        try:
            c.execute("UPDATE sbx_branch SET status='promoted' WHERE name=?", (branch,))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass
    jos.audit("sandbox.promote", actor=actor, target=branch, meta={"applied": applied})
    if events:
        events.emit("sandbox", "branch.promoted", {"branch": branch, "applied": applied}, actor=actor)
    return {"status": "promoted", "branch": branch, "objects_committed": applied}


def discard(branch: str, *, actor: str = "system") -> dict:
    """Throw away a branch's overlay (the simulated reality never touched prod)."""
    init_db()
    try:
        c = _conn()
        try:
            c.execute("DELETE FROM sbx_overlay WHERE branch=?", (branch,))
            c.execute("UPDATE sbx_branch SET status='discarded' WHERE name=?", (branch,))
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return {"status": "error"}
    jos.audit("sandbox.discard", actor=actor, target=branch)
    return {"status": "discarded", "branch": branch}
