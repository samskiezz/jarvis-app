"""ONTOLOGY EXT — companion service extending the live ontology (Foundry P2).

Composes (never edits) :mod:`server.services.ontology_store`, adding:

  * #19 Computed functions — a safe ``ast``-whitelisted expression evaluator over
    an object's props. ``register_function`` persists ``(type_id, name, expr)``;
    ``compute`` applies a type's functions to an object's props.
  * #20 Object views — a per-type layout descriptor (summary/detail/related),
    auto-generated from a type's observed props when none is set.
  * #23 Object sets — saved filters over ``query_objects`` re-evaluated live.
  * #24 Bulk action — apply a governed ``apply_action`` to every object in a set
    (capped + audited).
  * #26 Import/export — round-trippable ``{types, objects, links}`` dict.

Design rules mirror ``ontology_store.py``: stdlib only (``sqlite3`` + ``ast``),
idempotent DDL/writes, and **never raise** — every public function degrades
gracefully. Extension state lives in its own DB (env ``ONTOLOGY_EXT_DB``, default
``server/data/ontology_ext.db``) so the base store is untouched.
"""

from __future__ import annotations

import ast
import json
import operator
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import ontology_store as store

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ontology_ext.db"
)

BULK_CAP = 500  # max objects mutated by a single bulk_action


def _db_path() -> str:
    return os.environ.get("ONTOLOGY_EXT_DB", _DEFAULT_DB)


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


# ── Schema (idempotent) ──────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ext_function (
    type_id  TEXT NOT NULL,
    name     TEXT NOT NULL,
    expr     TEXT NOT NULL,
    PRIMARY KEY (type_id, name)
);

CREATE TABLE IF NOT EXISTS ext_view (
    type_id   TEXT PRIMARY KEY,
    view_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ext_set (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    query_json TEXT NOT NULL DEFAULT '{}',
    created_ts INTEGER NOT NULL
);
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
    """Create all ext tables/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── #19 Computed functions: safe expression evaluator ─────────────────────────────
# A tiny calculator over an object's props. We parse with ``ast`` and walk a strict
# whitelist of node types — NO calls, NO attribute access, NO names except prop
# keys (resolved from the props dict), NO comprehensions/lambdas/subscripts. Any
# node outside the whitelist raises ``_UnsafeExpr`` which compute() turns into None.

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
    ast.Not: operator.not_,
}
_CMP_OPS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}
_BOOL_OPS = {ast.And: all, ast.Or: any}

_MAX_POW = 1000  # bound exponent to avoid pathological compute


class _UnsafeExpr(Exception):
    """Raised when an expression node is outside the whitelist."""


def _coerce_num(value: Any) -> Any:
    """Best-effort numeric coercion so props stored as strings still compute."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        s = value.strip()
        try:
            if "." in s or "e" in s.lower():
                return float(s)
            return int(s)
        except (TypeError, ValueError):
            return value
    return value


def _eval_node(node: ast.AST, props: dict) -> Any:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, props)
    # literals
    if isinstance(node, ast.Constant):
        return node.value
    # a bare name resolves to a prop value (numeric-coerced)
    if isinstance(node, ast.Name):
        return _coerce_num(props.get(node.id))
    if isinstance(node, ast.BinOp):
        op = _BIN_OPS.get(type(node.op))
        if op is None:
            raise _UnsafeExpr(f"operator {type(node.op).__name__}")
        left = _eval_node(node.left, props)
        right = _eval_node(node.right, props)
        if isinstance(node.op, ast.Pow):
            try:
                if abs(float(right)) > _MAX_POW:
                    raise _UnsafeExpr("exponent too large")
            except (TypeError, ValueError):
                pass
        return op(left, right)
    if isinstance(node, ast.UnaryOp):
        op = _UNARY_OPS.get(type(node.op))
        if op is None:
            raise _UnsafeExpr(f"unary {type(node.op).__name__}")
        return op(_eval_node(node.operand, props))
    if isinstance(node, ast.BoolOp):
        op = _BOOL_OPS.get(type(node.op))
        if op is None:
            raise _UnsafeExpr("boolop")
        return op(bool(_eval_node(v, props)) for v in node.values)
    if isinstance(node, ast.Compare):
        left = _eval_node(node.left, props)
        for op_node, comparator in zip(node.ops, node.comparators):
            cmp = _CMP_OPS.get(type(op_node))
            if cmp is None:
                raise _UnsafeExpr("compare op")
            right = _eval_node(comparator, props)
            if not cmp(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.IfExp):  # a if cond else b
        return (
            _eval_node(node.body, props)
            if _eval_node(node.test, props)
            else _eval_node(node.orelse, props)
        )
    # Anything else (Call, Attribute, Subscript, Lambda, comprehensions, Import,
    # Name resolving to builtins, etc.) is rejected.
    raise _UnsafeExpr(type(node).__name__)


def safe_eval(expr: str, props: dict) -> dict:
    """Evaluate ``expr`` against ``props`` using the whitelisted AST walker.

    Returns ``{"ok": True, "value": <result>}`` or ``{"ok": False, "error": ...}``.
    NEVER raises and NEVER executes arbitrary code (no eval/exec, no calls/attrs)."""
    if not isinstance(expr, str) or not expr.strip():
        return {"ok": False, "error": "empty expression"}
    try:
        tree = ast.parse(expr, mode="eval")
    except (SyntaxError, ValueError) as e:
        return {"ok": False, "error": f"parse error: {e}"}
    try:
        value = _eval_node(tree, props if isinstance(props, dict) else {})
        return {"ok": True, "value": value}
    except _UnsafeExpr as e:
        return {"ok": False, "error": f"unsafe expression: {e}"}
    except (ZeroDivisionError, TypeError, ValueError, OverflowError) as e:
        return {"ok": False, "error": f"eval error: {e}"}


def register_function(
    type_id: str, name: str, expr: str, *, db_path: Optional[str] = None
) -> dict:
    """Persist a computed-function definition for a type. Validates the expr is
    parseable + within the whitelist (using empty props) before storing. Returns
    ``{ok, type_id?, name?, error?}`` — never raises."""
    if not type_id or not name or not isinstance(expr, str) or not expr.strip():
        return {"ok": False, "error": "type_id, name and expr are required"}
    # Reject definitions that are structurally unsafe up-front (missing-name
    # references are fine; they resolve to None at compute time).
    try:
        ast.parse(expr, mode="eval")
    except (SyntaxError, ValueError) as e:
        return {"ok": False, "error": f"parse error: {e}"}
    check = safe_eval(expr, {})
    if not check["ok"] and str(check.get("error", "")).startswith("unsafe"):
        return {"ok": False, "error": check["error"]}
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO ext_function (type_id, name, expr)
                VALUES (?,?,?)
                ON CONFLICT(type_id, name) DO UPDATE SET expr = excluded.expr
                """,
                (str(type_id), str(name), expr),
            )
            conn.commit()
            return {"ok": True, "type_id": str(type_id), "name": str(name), "expr": expr}
        finally:
            conn.close()
    except sqlite3.Error as e:
        return {"ok": False, "error": str(e)}


def list_functions(type_id: Optional[str] = None, *, db_path: Optional[str] = None) -> list[dict]:
    """List registered function defs, optionally for one type."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            if type_id:
                rows = conn.execute(
                    "SELECT * FROM ext_function WHERE type_id=? ORDER BY name", (str(type_id),)
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM ext_function ORDER BY type_id, name"
                ).fetchall()
            return [
                {"type_id": r["type_id"], "name": r["name"], "expr": r["expr"]} for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def compute(object_id: str, *, db_path: Optional[str] = None) -> dict:
    """Apply the object's type's computed functions to its props.

    Returns ``{function_name: value, ...}`` (value is None for any function whose
    expression failed/was unsafe). Empty dict if the object is missing. Never raises."""
    obj = store.get_object(object_id)
    if obj is None:
        return {}
    props = obj.get("props") or {}
    out: dict[str, Any] = {}
    for fn in list_functions(obj.get("type"), db_path=db_path):
        res = safe_eval(fn["expr"], props)
        out[fn["name"]] = res["value"] if res.get("ok") else None
    return out


# ── #20 Object views ──────────────────────────────────────────────────────────────
def _observed_props(type_id: str) -> list[str]:
    """Collect the union of prop keys observed across objects of a type."""
    keys: list[str] = []
    seen: set[str] = set()
    for o in store.query_objects(type=type_id, limit=200):
        for k in (o.get("props") or {}).keys():
            if k not in seen:
                seen.add(k)
                keys.append(k)
    return keys


def _default_view(type_id: str) -> dict:
    """Generate a sensible default layout from a type's observed props.

    First few props become the summary, the rest are detail. ``related`` lists the
    relation labels seen on objects of this type (best-effort)."""
    keys = _observed_props(type_id)
    summary = keys[:3]
    detail = keys[3:]
    related: list[str] = []
    seen: set[str] = set()
    for o in store.query_objects(type=type_id, limit=50):
        for lk in store.links_for(o.get("id")):
            rel = lk.get("relation") or ""
            if rel and rel not in seen:
                seen.add(rel)
                related.append(rel)
    return {
        "type_id": type_id,
        "summary": summary,
        "detail": detail,
        "related": related,
        "generated": True,
    }


def set_view(type_id: str, view: dict, *, db_path: Optional[str] = None) -> dict:
    """Store a per-type view descriptor. Returns ``{ok, view?, error?}``."""
    if not type_id:
        return {"ok": False, "error": "type_id required"}
    if not isinstance(view, dict):
        return {"ok": False, "error": "view must be an object"}
    stored = dict(view)
    stored["type_id"] = str(type_id)
    stored.setdefault("generated", False)
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO ext_view (type_id, view_json) VALUES (?,?)
                ON CONFLICT(type_id) DO UPDATE SET view_json = excluded.view_json
                """,
                (str(type_id), _dumps(stored)),
            )
            conn.commit()
            return {"ok": True, "view": stored}
        finally:
            conn.close()
    except sqlite3.Error as e:
        return {"ok": False, "error": str(e)}


def get_view(type_id: str, *, db_path: Optional[str] = None) -> dict:
    """Return the stored view for a type, or a default-generated one. Never raises."""
    if not type_id:
        return _default_view("")
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute(
                "SELECT view_json FROM ext_view WHERE type_id=?", (str(type_id),)
            ).fetchone()
            if r:
                v = _loads(r["view_json"])
                if isinstance(v, dict) and v:
                    return v
        finally:
            conn.close()
    except sqlite3.Error:
        pass
    return _default_view(str(type_id))


# ── #23 Object sets ────────────────────────────────────────────────────────────────
def _normalize_query(query: Any) -> dict:
    """Coerce a saved query into ``{type?, where?, limit?}``."""
    if not isinstance(query, dict):
        return {}
    q: dict[str, Any] = {}
    if query.get("type"):
        q["type"] = str(query["type"])
    where = query.get("where")
    if isinstance(where, dict):
        q["where"] = where
    if query.get("limit") is not None:
        try:
            q["limit"] = int(query["limit"])
        except (TypeError, ValueError):
            pass
    return q


def create_set(name: str, query: dict, *, db_path: Optional[str] = None) -> dict:
    """Save a filter (object set). Returns ``{ok, id?, name?, query?, error?}``."""
    if not name:
        return {"ok": False, "error": "name required"}
    q = _normalize_query(query)
    sid = uuid.uuid4().hex
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "INSERT INTO ext_set (id, name, query_json, created_ts) VALUES (?,?,?,?)",
                (sid, str(name), _dumps(q), _now_ms()),
            )
            conn.commit()
            return {"ok": True, "id": sid, "name": str(name), "query": q}
        finally:
            conn.close()
    except sqlite3.Error as e:
        return {"ok": False, "error": str(e)}


def list_sets(*, db_path: Optional[str] = None) -> list[dict]:
    """List saved object sets, newest first."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM ext_set ORDER BY created_ts DESC, id DESC"
            ).fetchall()
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "query": _loads(r["query_json"]),
                    "created_ts": r["created_ts"],
                }
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def _get_set(set_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    if not set_id:
        return None
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute("SELECT * FROM ext_set WHERE id=?", (str(set_id),)).fetchone()
            if not r:
                return None
            return {
                "id": r["id"],
                "name": r["name"],
                "query": _loads(r["query_json"]),
                "created_ts": r["created_ts"],
            }
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def resolve_set(set_id: str, *, db_path: Optional[str] = None) -> dict:
    """Re-evaluate a saved set's query live and return the matching objects."""
    init_db(db_path)
    s = _get_set(set_id, db_path=db_path)
    if s is None:
        return {"ok": False, "error": "set not found", "items": [], "count": 0}
    q = s["query"] or {}
    items = store.query_objects(
        type=q.get("type"), where=q.get("where"), limit=q.get("limit")
    )
    return {"ok": True, "id": s["id"], "name": s["name"], "items": items, "count": len(items)}


def delete_set(set_id: str, *, db_path: Optional[str] = None) -> bool:
    """Delete a saved set. Returns True if a row was removed."""
    if not set_id:
        return False
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute("DELETE FROM ext_set WHERE id=?", (str(set_id),))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except sqlite3.Error:
        return False


# ── #24 Bulk action ─────────────────────────────────────────────────────────────────
def bulk_action(
    set_id_or_query: Any,
    action: str,
    payload: Optional[dict] = None,
    actor: Optional[str] = None,
    *,
    db_path: Optional[str] = None,
) -> dict:
    """Apply a governed ``apply_action`` to every object in a set.

    ``set_id_or_query`` may be a saved-set id (str) or an inline query dict
    (``{type?, where?, limit?}``). The count is capped at ``BULK_CAP``. Each
    apply is audited by the underlying store. Returns
    ``{ok, action, count, capped, results:[{id, ok, error?}, ...]}`` — never raises."""
    payload = payload if isinstance(payload, dict) else {}
    action = str(action or "")

    # Resolve the target object list.
    if isinstance(set_id_or_query, dict):
        q = _normalize_query(set_id_or_query)
        objs = store.query_objects(type=q.get("type"), where=q.get("where"), limit=q.get("limit"))
    elif isinstance(set_id_or_query, str) and set_id_or_query:
        res = resolve_set(set_id_or_query, db_path=db_path)
        if not res.get("ok"):
            return {"ok": False, "error": res.get("error", "set not found"), "results": [], "count": 0}
        objs = res.get("items", [])
    else:
        return {"ok": False, "error": "set_id or query required", "results": [], "count": 0}

    capped = len(objs) > BULK_CAP
    objs = objs[:BULK_CAP]

    results: list[dict] = []
    for o in objs:
        oid = o.get("id")
        try:
            r = store.apply_action(oid, action, payload, actor=actor)
        except Exception as e:  # defensive — store shouldn't raise, but never propagate
            r = {"ok": False, "error": str(e)}
        entry = {"id": oid, "ok": bool(r.get("ok"))}
        if not r.get("ok") and r.get("error"):
            entry["error"] = r["error"]
        results.append(entry)

    return {
        "ok": True,
        "action": action,
        "count": len(results),
        "capped": capped,
        "results": results,
    }


# ── #26 Import / export ─────────────────────────────────────────────────────────────
def export_ontology() -> dict:
    """Snapshot the live ontology as ``{types, objects, links}`` — round-trippable
    by :func:`import_ontology`. Never raises (returns empty lists on error)."""
    types = store.list_types()
    objects = store.query_objects()
    links: list[dict] = []
    seen: set[str] = set()
    for o in objects:
        for lk in store.links_for(o.get("id")):
            if lk.get("id") not in seen:
                seen.add(lk.get("id"))
                links.append(lk)
    return {"types": types, "objects": objects, "links": links}


def import_ontology(payload: dict, mode: str = "merge") -> dict:
    """Upsert types/objects/links from an exported snapshot back into the store.

    Idempotent (re-running yields the same state). ``mode`` is accepted for API
    symmetry; only "merge" is implemented (we never destructively replace). Returns
    ``{ok, types, objects, links}`` counts — never raises."""
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload must be an object", "types": 0, "objects": 0, "links": 0}

    n_types = n_objects = n_links = 0

    for t in payload.get("types") or []:
        if not isinstance(t, dict):
            continue
        tid = t.get("type_id") or t.get("id")
        if not tid:
            continue
        res = store.upsert_type(
            str(tid),
            label=t.get("label"),
            icon=t.get("icon"),
            props_schema=t.get("props_schema") or t.get("props_schema_json") or {},
        )
        if res:
            n_types += 1

    for o in payload.get("objects") or []:
        if not isinstance(o, dict):
            continue
        res = store.upsert_object(
            {
                "id": o.get("id"),
                "type": o.get("type"),
                "label": o.get("label"),
                "mark": o.get("mark"),
                "props": o.get("props") or {},
            }
        )
        if res:
            n_objects += 1

    for lk in payload.get("links") or []:
        if not isinstance(lk, dict):
            continue
        a, b = lk.get("a"), lk.get("b")
        if not a or not b:
            continue
        res = store.upsert_link(
            str(a),
            str(b),
            str(lk.get("relation") or lk.get("label") or ""),
            strength=float(lk.get("strength") or 1),
            props=lk.get("props") or {},
        )
        if res:
            n_links += 1

    return {"ok": True, "mode": "merge", "types": n_types, "objects": n_objects, "links": n_links}


# Bootstrap the default ext DB on import so the first request finds the tables.
init_db()
