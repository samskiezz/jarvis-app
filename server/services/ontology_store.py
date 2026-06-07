"""ONTOLOGY STORE — the LIVE, persistent Foundry-style object model (P0).

A SQLite-backed (stdlib ``sqlite3``, no ORM) store that replaces the static
in-memory entity store with a real typed/editable object + link + action model:

  * ``object_type``   — the type catalog (person/org/client/…), with a JSON
                        props schema for the UI.
  * ``object``        — the typed objects (one row per entity), with arbitrary
                        JSON props and create/update timestamps.
  * ``link``          — typed, weighted relations between two objects.
  * ``object_action`` — the governed write-back audit trail (one row per
                        applied action).

Design rules (mirrors ``history_lake.py``):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``) and idempotent writes
    (``INSERT ... ON CONFLICT ... DO UPDATE``).
  * never raise on normal use — every public function degrades gracefully and
    returns a sensible empty/zero value on error.

DB path comes from the env var ``ONTOLOGY_DB`` (default
``server/data/ontology.db``). The seed lives in ``server/data/ontology.py`` and
is loaded once via :func:`seed_from_static` if the store is empty.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import revdb

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ontology.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``ONTOLOGY_DB`` (or pass
    ``db_path=`` explicitly) before the first connection."""
    return os.environ.get("ONTOLOGY_DB", _DEFAULT_DB)


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


# ── Type catalog (icons match the seed domain vocabulary) ────────────────────────
_TYPE_ICONS = {
    "person": "user",
    "org": "building",
    "client": "briefcase",
    "invest": "trending-up",
    "asset": "coins",
    "property": "home",
    "creative": "music",
    "target": "target",
    "risk": "alert-triangle",
}


# ── Schema (idempotent) ──────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS object_type (
    type_id          TEXT PRIMARY KEY,
    label            TEXT NOT NULL,
    icon             TEXT,
    props_schema_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS object (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,
    label      TEXT NOT NULL DEFAULT '',
    mark       TEXT,
    props_json TEXT NOT NULL DEFAULT '{}',
    created_ts INTEGER NOT NULL,
    updated_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_object_type ON object (type);

CREATE TABLE IF NOT EXISTS link (
    id         TEXT PRIMARY KEY,
    a          TEXT NOT NULL,
    b          TEXT NOT NULL,
    relation   TEXT NOT NULL DEFAULT '',
    strength   REAL NOT NULL DEFAULT 1,
    props_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (a, b, relation)
);
CREATE INDEX IF NOT EXISTS ix_link_a ON link (a);
CREATE INDEX IF NOT EXISTS ix_link_b ON link (b);

CREATE TABLE IF NOT EXISTS object_action (
    id           TEXT PRIMARY KEY,
    object_id    TEXT NOT NULL,
    action       TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    actor        TEXT,
    ts           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_action_object ON object_action (object_id, ts);
"""


# ── Connection management ────────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection with WAL + foreign keys. ``check_same_thread=False`` so
    the FastAPI threadpool/asyncio loop can share it."""
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
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create all tables/indexes if absent. Idempotent — safe to call on every
    import / app start. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── Seeding ──────────────────────────────────────────────────────────────────────
def seed_from_static(db_path: Optional[str] = None) -> int:
    """Load the static seed (OBJECTS/LINKS/RISK_SIGNALS) from
    ``server/data/ontology.py`` exactly once — only if the ``object`` table is
    empty. Returns the number of objects written (0 if already seeded / on error)."""
    init_db(db_path)
    try:
        from ..data.ontology import OBJECTS, LINKS, RISK_SIGNALS
    except Exception:  # noqa: BLE001 - missing seed must not break the store
        return 0

    try:
        conn = _connect(db_path)
        try:
            row = conn.execute("SELECT COUNT(*) AS n FROM object").fetchone()
            if row and row["n"]:
                return 0  # already seeded — idempotent

            now = _now_ms()

            # 1. type catalog — derive from the seed object types (+ risk).
            types: dict[str, str] = {}
            for o in OBJECTS:
                t = str(o.get("type") or "object")
                types[t] = t.replace("_", " ").title()
            types.setdefault("risk", "Risk")
            for tid, label in types.items():
                conn.execute(
                    """
                    INSERT INTO object_type (type_id, label, icon, props_schema_json)
                    VALUES (?,?,?,?)
                    ON CONFLICT(type_id) DO NOTHING
                    """,
                    (tid, label, _TYPE_ICONS.get(tid), "{}"),
                )

            # 2. objects.
            n = 0
            for o in OBJECTS:
                oid = str(o.get("id") or uuid.uuid4().hex)
                conn.execute(
                    """
                    INSERT INTO object (id, type, label, mark, props_json, created_ts, updated_ts)
                    VALUES (?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    (
                        oid,
                        str(o.get("type") or "object"),
                        str(o.get("label") or oid),
                        o.get("mark"),
                        _dumps(o.get("props") or {}),
                        now,
                        now,
                    ),
                )
                n += 1

            # 3. risk signals become first-class objects too (linked below).
            for r in RISK_SIGNALS:
                rid = str(r.get("id") or uuid.uuid4().hex)
                props = {
                    k: v for k, v in r.items()
                    if k not in ("id", "title", "linked")
                }
                conn.execute(
                    """
                    INSERT INTO object (id, type, label, mark, props_json, created_ts, updated_ts)
                    VALUES (?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    (
                        rid,
                        "risk",
                        str(r.get("title") or rid),
                        "RISK",
                        _dumps(props),
                        now,
                        now,
                    ),
                )

            # 4. links from the seed.
            for lk in LINKS:
                _insert_link(
                    conn,
                    a=str(lk.get("a")),
                    b=str(lk.get("b")),
                    relation=str(lk.get("label") or lk.get("relation") or ""),
                    strength=float(lk.get("strength") or 1),
                    props={},
                )

            # 5. links from risk signals to the object they touch.
            for r in RISK_SIGNALS:
                linked = r.get("linked")
                if linked:
                    _insert_link(
                        conn,
                        a=str(r.get("id")),
                        b=str(linked),
                        relation="RISK_TO",
                        strength=float(r.get("severity", 0)) / 100.0,
                        props={},
                    )

            conn.commit()
            return n
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return 0


# ── Object types ─────────────────────────────────────────────────────────────────
def list_types(db_path: Optional[str] = None) -> list[dict]:
    """Return the type catalog with a per-type object count."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                """
                SELECT t.type_id, t.label, t.icon, t.props_schema_json,
                       COUNT(o.id) AS n_objects
                FROM object_type t
                LEFT JOIN object o ON o.type = t.type_id
                GROUP BY t.type_id
                ORDER BY t.type_id
                """
            ).fetchall()
            return [
                {
                    "type_id": r["type_id"],
                    "label": r["label"],
                    "icon": r["icon"],
                    "props_schema": _loads(r["props_schema_json"]),
                    "n_objects": int(r["n_objects"]),
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def upsert_type(
    type_id: str,
    *,
    label: Optional[str] = None,
    icon: Optional[str] = None,
    props_schema: Optional[dict] = None,
    db_path: Optional[str] = None,
) -> Optional[str]:
    """Create/update a type row. Returns the type_id or None on error."""
    if not type_id:
        return None
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO object_type (type_id, label, icon, props_schema_json)
                VALUES (?,?,?,?)
                ON CONFLICT(type_id) DO UPDATE SET
                    label = excluded.label,
                    icon = excluded.icon,
                    props_schema_json = excluded.props_schema_json
                """,
                (
                    type_id,
                    label or type_id.replace("_", " ").title(),
                    icon if icon is not None else _TYPE_ICONS.get(type_id),
                    _dumps(props_schema or {}),
                ),
            )
            conn.commit()
            return type_id
        finally:
            conn.close()
    except sqlite3.Error:
        return None


# ── Objects ──────────────────────────────────────────────────────────────────────
def _row_to_object(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "type": r["type"],
        "label": r["label"],
        "mark": r["mark"],
        "props": _loads(r["props_json"]),
        "created_ts": r["created_ts"],
        "updated_ts": r["updated_ts"],
    }


def upsert_object(
    obj: dict,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Insert or update an object. ``obj`` accepts ``{id?, type, label?, mark?,
    props?}``. A missing id is generated. On update, props are *merged* (shallow)
    so partial writes don't clobber existing properties. The type row is ensured.
    Returns the stored object dict or None on error."""
    if not isinstance(obj, dict):
        return None
    oid = str(obj.get("id") or uuid.uuid4().hex)
    otype = str(obj.get("type") or "object")
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            existing = conn.execute(
                "SELECT * FROM object WHERE id=?", (oid,)
            ).fetchone()

            # ensure the type exists in the catalog
            conn.execute(
                """
                INSERT INTO object_type (type_id, label, icon, props_schema_json)
                VALUES (?,?,?,?)
                ON CONFLICT(type_id) DO NOTHING
                """,
                (otype, otype.replace("_", " ").title(), _TYPE_ICONS.get(otype), "{}"),
            )

            if existing is None:
                label = str(obj.get("label") or oid)
                mark = obj.get("mark")
                props = obj.get("props") or {}
                conn.execute(
                    """
                    INSERT INTO object (id, type, label, mark, props_json, created_ts, updated_ts)
                    VALUES (?,?,?,?,?,?,?)
                    """,
                    (oid, otype, label, mark, _dumps(props), now, now),
                )
            else:
                cur = _row_to_object(existing)
                label = obj.get("label", cur["label"])
                mark = obj.get("mark", cur["mark"])
                merged = dict(cur["props"])
                incoming = obj.get("props")
                if isinstance(incoming, dict):
                    merged.update(incoming)
                conn.execute(
                    """
                    UPDATE object SET type=?, label=?, mark=?, props_json=?, updated_ts=?
                    WHERE id=?
                    """,
                    (otype, label, mark, _dumps(merged), now, oid),
                )
            conn.commit()
            # RevDB: record ontology mutation
            try:
                op = "create" if existing is None else "update"
                old_obj = _row_to_object(existing) if existing else None
                new_obj = get_object(oid, db_path=db_path)
                revdb._commit_sync(
                    actor="system",
                    message=f"ontology {op} {oid}",
                    changes=[
                        {
                            "object_type": otype,
                            "object_id": oid,
                            "operation": op,
                            "old_value": old_obj,
                            "new_value": new_obj,
                        }
                    ],
                    db_path=db_path,
                )
            except Exception:  # noqa: BLE001
                pass
            return get_object(oid, db_path=db_path)
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def get_object(object_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Return one object by id (or None)."""
    if not object_id:
        return None
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute("SELECT * FROM object WHERE id=?", (object_id,)).fetchone()
            return _row_to_object(r) if r else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def query_objects(
    type: Optional[str] = None,
    where: Optional[dict] = None,
    limit: Optional[int] = None,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """Query objects, optionally filtered by ``type`` and a ``where`` dict.

    ``where`` keys match either a top-level column (id/label/mark) or a property
    inside ``props`` (equality, compared as strings). ``limit`` caps the result."""
    try:
        conn = _connect(db_path)
        try:
            q = "SELECT * FROM object"
            args: list[Any] = []
            if type:
                q += " WHERE type=?"
                args.append(type)
            q += " ORDER BY created_ts ASC"
            rows = conn.execute(q, args).fetchall()
            items = [_row_to_object(r) for r in rows]

            if where:
                def _match(it: dict) -> bool:
                    for k, v in where.items():
                        if k in ("id", "label", "mark", "type"):
                            if it.get(k) != v:
                                return False
                        else:
                            pv = it.get("props", {}).get(k)
                            if pv != v and str(pv) != str(v):
                                return False
                    return True

                items = [it for it in items if _match(it)]

            if limit is not None:
                items = items[: int(limit)]
            return items
        finally:
            conn.close()
    except (sqlite3.Error, ValueError):
        return []


def delete_object(object_id: str, *, db_path: Optional[str] = None) -> bool:
    """Delete an object and any links/actions touching it. Returns True if a row
    was removed."""
    if not object_id:
        return False
    try:
        conn = _connect(db_path)
        try:
            # RevDB: record ontology mutation before deleting
            try:
                obj = get_object(object_id, db_path=db_path)
                if obj:
                    revdb._commit_sync(
                        actor="system",
                        message=f"ontology delete {object_id}",
                        changes=[
                            {
                                "object_type": obj.get("type"),
                                "object_id": object_id,
                                "operation": "delete",
                                "old_value": obj,
                                "new_value": None,
                            }
                        ],
                        db_path=db_path,
                    )
            except Exception:  # noqa: BLE001
                pass
            cur = conn.execute("DELETE FROM object WHERE id=?", (object_id,))
            conn.execute("DELETE FROM link WHERE a=? OR b=?", (object_id, object_id))
            conn.execute("DELETE FROM object_action WHERE object_id=?", (object_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except sqlite3.Error:
        return False


# ── Links ────────────────────────────────────────────────────────────────────────
def _link_id(a: str, b: str, relation: str) -> str:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"{a}|{b}|{relation}").hex


def _insert_link(
    conn: sqlite3.Connection,
    *,
    a: str,
    b: str,
    relation: str,
    strength: float,
    props: dict,
) -> str:
    lid = _link_id(a, b, relation)
    conn.execute(
        """
        INSERT INTO link (id, a, b, relation, strength, props_json)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(a, b, relation) DO UPDATE SET
            strength = excluded.strength,
            props_json = excluded.props_json
        """,
        (lid, a, b, relation, strength, _dumps(props)),
    )
    return lid


def _row_to_link(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "a": r["a"],
        "b": r["b"],
        "relation": r["relation"],
        "strength": r["strength"],
        "props": _loads(r["props_json"]),
    }


def upsert_link(
    a: str,
    b: str,
    relation: str = "",
    *,
    strength: float = 1.0,
    props: Optional[dict] = None,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Insert or update a typed link between two objects. Idempotent on
    ``(a, b, relation)``. Returns the stored link dict or None on error."""
    if not a or not b:
        return None
    try:
        conn = _connect(db_path)
        try:
            lid = _insert_link(
                conn,
                a=str(a),
                b=str(b),
                relation=str(relation or ""),
                strength=float(strength),
                props=props or {},
            )
            conn.commit()
            r = conn.execute("SELECT * FROM link WHERE id=?", (lid,)).fetchone()
            return _row_to_link(r) if r else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def links_for(object_id: str, *, db_path: Optional[str] = None) -> list[dict]:
    """Return all links where ``object_id`` is either endpoint."""
    if not object_id:
        return []
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM link WHERE a=? OR b=? ORDER BY relation",
                (object_id, object_id),
            ).fetchall()
            return [_row_to_link(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── Governed write-back actions ──────────────────────────────────────────────────
# The small allow-list of actions the ontology will execute. Anything else is
# rejected (recorded as a no-op audit row with ok=False) — this is the governance
# boundary for live mutation.
ALLOWED_ACTIONS = ("set_property", "remove_property", "set_label", "set_mark", "add_link", "flag")


def _record_action(
    conn: sqlite3.Connection,
    object_id: str,
    action: str,
    payload: dict,
    actor: Optional[str],
) -> str:
    aid = uuid.uuid4().hex
    conn.execute(
        """
        INSERT INTO object_action (id, object_id, action, payload_json, actor, ts)
        VALUES (?,?,?,?,?,?)
        """,
        (aid, object_id, action, _dumps(payload), actor, _now_ms()),
    )
    return aid


def apply_action(
    object_id: str,
    action: str,
    payload: Optional[dict] = None,
    actor: Optional[str] = None,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Apply a governed write-back action to an object and record an audit row.

    Allowed actions (anything else is rejected):
      * ``set_property``    payload ``{key, value}`` — set props[key]=value.
      * ``remove_property`` payload ``{key}``        — delete props[key].
      * ``set_label``       payload ``{label}``      — rename the object.
      * ``set_mark``        payload ``{mark}``       — set the classification.
      * ``add_link``        payload ``{to, relation?, strength?}`` — link to another object.
      * ``flag``            payload ``{flag?, value?}`` — set props["flag:<name>"]=value (default true).

    Every attempt (success or rejection) writes an ``object_action`` audit row.
    Returns ``{ok, action, object?, audit_id?, error?}`` — never raises."""
    payload = payload if isinstance(payload, dict) else {}
    action = str(action or "")
    try:
        conn = _connect(db_path)
        try:
            existing = conn.execute(
                "SELECT * FROM object WHERE id=?", (object_id,)
            ).fetchone()
            if existing is None:
                aid = _record_action(conn, object_id, action, payload, actor)
                conn.commit()
                return {"ok": False, "action": action, "audit_id": aid, "error": "object not found"}

            if action not in ALLOWED_ACTIONS:
                aid = _record_action(conn, object_id, action, payload, actor)
                conn.commit()
                return {"ok": False, "action": action, "audit_id": aid, "error": "action not allowed"}

            obj = _row_to_object(existing)
            props = dict(obj["props"])
            label = obj["label"]
            mark = obj["mark"]

            if action == "set_property":
                key = payload.get("key")
                if not key:
                    aid = _record_action(conn, object_id, action, payload, actor)
                    conn.commit()
                    return {"ok": False, "action": action, "audit_id": aid, "error": "missing key"}
                props[str(key)] = payload.get("value")
            elif action == "remove_property":
                key = payload.get("key")
                props.pop(str(key), None)
            elif action == "set_label":
                label = str(payload.get("label", label))
            elif action == "set_mark":
                mark = payload.get("mark", mark)
            elif action == "flag":
                name = str(payload.get("flag", "flagged"))
                value = payload.get("value", True)
                props[f"flag:{name}"] = value
            elif action == "add_link":
                to = payload.get("to")
                if not to:
                    aid = _record_action(conn, object_id, action, payload, actor)
                    conn.commit()
                    return {"ok": False, "action": action, "audit_id": aid, "error": "missing to"}
                _insert_link(
                    conn,
                    a=object_id,
                    b=str(to),
                    relation=str(payload.get("relation") or "RELATED"),
                    strength=float(payload.get("strength") or 1),
                    props={},
                )

            # persist object mutation (add_link only touches the link table)
            if action != "add_link":
                conn.execute(
                    "UPDATE object SET label=?, mark=?, props_json=?, updated_ts=? WHERE id=?",
                    (label, mark, _dumps(props), _now_ms(), object_id),
                )

            aid = _record_action(conn, object_id, action, payload, actor)
            conn.commit()
            # RevDB: record ontology mutation
            try:
                new_obj = get_object(object_id, db_path=db_path)
                revdb._commit_sync(
                    actor=actor or "system",
                    message=f"ontology action {action} on {object_id}",
                    changes=[
                        {
                            "object_type": obj.get("type") if obj else "unknown",
                            "object_id": object_id,
                            "operation": "action",
                            "old_value": obj,
                            "new_value": new_obj,
                        }
                    ],
                    db_path=db_path,
                )
            except Exception:  # noqa: BLE001
                pass
            return {
                "ok": True,
                "action": action,
                "audit_id": aid,
                "object": get_object(object_id, db_path=db_path),
            }
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError) as e:
        return {"ok": False, "action": action, "error": str(e)}


def list_actions(
    object_id: Optional[str] = None,
    limit: int = 100,
    *,
    db_path: Optional[str] = None,
) -> list[dict]:
    """Return the write-back audit trail, newest first (optionally per object)."""
    try:
        conn = _connect(db_path)
        try:
            if object_id:
                rows = conn.execute(
                    "SELECT * FROM object_action WHERE object_id=? ORDER BY ts DESC, id DESC LIMIT ?",
                    (object_id, int(limit)),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM object_action ORDER BY ts DESC, id DESC LIMIT ?",
                    (int(limit),),
                ).fetchall()
            return [
                {
                    "id": r["id"],
                    "object_id": r["object_id"],
                    "action": r["action"],
                    "payload": _loads(r["payload_json"]),
                    "actor": r["actor"],
                    "ts": r["ts"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except (sqlite3.Error, ValueError):
        return []


# ── Graph traversal ──────────────────────────────────────────────────────────────
def neighbors(object_id: str, depth: int = 1, *, db_path: Optional[str] = None) -> dict:
    """Breadth-first neighborhood around ``object_id`` up to ``depth`` hops.

    Returns ``{"center", "objects": [...], "links": [...]}`` where ``objects`` are
    the full object dicts reachable within ``depth`` hops (excluding the center)
    and ``links`` are the edges traversed. Empty/center-only on missing object."""
    center = get_object(object_id, db_path=db_path)
    if center is None:
        return {"center": object_id, "objects": [], "links": []}

    try:
        depth = max(0, int(depth))
    except (TypeError, ValueError):
        depth = 1

    visited: set[str] = {object_id}
    frontier: list[str] = [object_id]
    edge_ids: set[str] = set()
    edges: list[dict] = []

    try:
        conn = _connect(db_path)
        try:
            for _ in range(depth):
                next_frontier: list[str] = []
                for node in frontier:
                    rows = conn.execute(
                        "SELECT * FROM link WHERE a=? OR b=?", (node, node)
                    ).fetchall()
                    for r in rows:
                        lk = _row_to_link(r)
                        if lk["id"] not in edge_ids:
                            edge_ids.add(lk["id"])
                            edges.append(lk)
                        other = lk["b"] if lk["a"] == node else lk["a"]
                        if other not in visited:
                            visited.add(other)
                            next_frontier.append(other)
                frontier = next_frontier
                if not frontier:
                    break

            out_ids = visited - {object_id}
            objects: list[dict] = []
            for oid in out_ids:
                o = get_object(oid, db_path=db_path)
                if o:
                    objects.append(o)
            return {"center": object_id, "objects": objects, "links": edges}
        finally:
            conn.close()
    except sqlite3.Error:
        return {"center": object_id, "objects": [], "links": []}


# Bootstrap the default DB on import so the first request finds the tables, then
# seed once if empty. Guarded so a read-only / missing-dir environment never
# breaks import.
init_db()
try:
    seed_from_static()
except Exception:  # noqa: BLE001
    pass
