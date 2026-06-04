"""ALERTING / RULES engine — the WATCHTOWER (Gotham-style ops).

A SQLite-backed (stdlib ``sqlite3``, no ORM) store of operator-defined rules and
the alerts they fire. It evaluates *safe*, declarative JSON conditions against a
context dict (e.g. a live-intel snapshot, a History Lake reading, or any supplied
data) — there is NO ``eval``/``exec`` of arbitrary code, ever.

Tables (idempotent DDL):
  * ``rule``  — operator rule catalog (id, name, expr, target, severity, enabled).
  * ``alert`` — one row per rule firing (id, rule_id, fired_ts, status,
                payload_json, ack_by).

A *rule expression* (``rule.expr``) is JSON describing a condition. Two leaf
shapes are supported plus boolean composition:

  Leaf via metric (looked up in ``context[metric]``)::

      {"metric": "earthquake_max_mag", "op": ">", "value": 5.0}

  Leaf via field-path (dotted / bracketed path resolved through dicts & lists)::

      {"field": "markets.0.change_pct", "op": "<", "value": -5}

  Composition::

      {"all": [<cond>, <cond>, ...]}   # logical AND
      {"any": [<cond>, <cond>, ...]}   # logical OR
      {"not": <cond>}                  # negation

Supported ``op`` values: ``> >= < <= == != in nin contains``.

Design doctrine (mirrors history_lake.py):
  * stdlib ``sqlite3`` only (optional ``numpy`` not required here).
  * idempotent DDL + idempotent writes.
  * never raise on normal use — every public function degrades gracefully.

DB path comes from env ``OPS_DB`` (default ``server/data/ops.db``). Tests pass an
explicit temp path via the env var.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ops.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``OPS_DB`` first."""
    return os.environ.get("OPS_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS rule (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    expr       TEXT    NOT NULL DEFAULT '{}',
    target     TEXT,
    severity   INTEGER NOT NULL DEFAULT 50,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_rule_enabled ON rule (enabled);

CREATE TABLE IF NOT EXISTS alert (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id      INTEGER NOT NULL REFERENCES rule(id) ON DELETE CASCADE,
    fired_ts     INTEGER NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'open',
    payload_json TEXT    NOT NULL DEFAULT '{}',
    ack_by       TEXT
);
CREATE INDEX IF NOT EXISTS ix_alert_rule   ON alert (rule_id);
CREATE INDEX IF NOT EXISTS ix_alert_status ON alert (status);
"""


# ── Connection management ────────────────────────────────────────────────────────
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
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create all tables/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── Safe rule evaluator ──────────────────────────────────────────────────────────
_SENTINEL = object()

_OPS = {">", ">=", "<", "<=", "==", "!=", "in", "nin", "contains"}


def _resolve_path(context: Any, path: str) -> Any:
    """Resolve a dotted / bracketed path through nested dicts & lists.

    Examples: ``markets.0.change_pct``, ``markets[0].change_pct``,
    ``a.b.c``. Returns ``_SENTINEL`` if any hop is missing (never raises).
    """
    if path is None:
        return _SENTINEL
    # Normalize bracket syntax to dotted, e.g. markets[0].x -> markets.0.x
    norm = str(path).replace("[", ".").replace("]", "")
    cur: Any = context
    for raw in norm.split("."):
        key = raw.strip()
        if key == "":
            continue
        if isinstance(cur, dict):
            if key in cur:
                cur = cur[key]
            else:
                return _SENTINEL
        elif isinstance(cur, (list, tuple)):
            try:
                idx = int(key)
            except (TypeError, ValueError):
                return _SENTINEL
            if -len(cur) <= idx < len(cur):
                cur = cur[idx]
            else:
                return _SENTINEL
        else:
            return _SENTINEL
    return cur


def _coerce_num(x: Any) -> Any:
    """Try to coerce to float for numeric comparison; return original on failure."""
    if isinstance(x, bool):
        return x
    if isinstance(x, (int, float)):
        return x
    try:
        return float(x)
    except (TypeError, ValueError):
        return x


def _apply_op(op: str, left: Any, right: Any) -> bool:
    """Apply a single comparison operator safely. Never raises."""
    try:
        if op == "in":
            return left in right  # right is the container
        if op == "nin":
            return left not in right
        if op == "contains":
            return right in left  # left is the container
        if op in ("==", "!="):
            # Try numeric first, fall back to direct equality.
            ln, rn = _coerce_num(left), _coerce_num(right)
            if isinstance(ln, (int, float)) and isinstance(rn, (int, float)):
                eq = float(ln) == float(rn)
            else:
                eq = left == right
            return eq if op == "==" else not eq
        # Ordered numeric comparisons.
        ln, rn = _coerce_num(left), _coerce_num(right)
        if not (isinstance(ln, (int, float)) and isinstance(rn, (int, float))):
            return False
        ln, rn = float(ln), float(rn)
        if op == ">":
            return ln > rn
        if op == ">=":
            return ln >= rn
        if op == "<":
            return ln < rn
        if op == "<=":
            return ln <= rn
    except TypeError:
        return False
    return False


def evaluate_expr(expr: Any, context: dict) -> bool:
    """Evaluate a parsed JSON rule expression against ``context``.

    Pure, side-effect-free, and total (never raises). Unknown / malformed
    expressions evaluate to ``False`` so a bad rule can never fire spuriously.
    """
    if not isinstance(expr, dict):
        return False
    try:
        # Boolean composition.
        if "all" in expr:
            subs = expr.get("all") or []
            return isinstance(subs, list) and all(evaluate_expr(s, context) for s in subs)
        if "any" in expr:
            subs = expr.get("any") or []
            return isinstance(subs, list) and any(evaluate_expr(s, context) for s in subs)
        if "not" in expr:
            return not evaluate_expr(expr.get("not"), context)

        op = expr.get("op")
        if op not in _OPS:
            return False

        # Resolve the left operand from the context.
        if "metric" in expr:
            metric = expr.get("metric")
            left = context.get(metric, _SENTINEL) if isinstance(context, dict) else _SENTINEL
        elif "field" in expr:
            left = _resolve_path(context, expr.get("field"))
        else:
            return False

        if left is _SENTINEL:
            return False

        right = expr.get("value")
        return _apply_op(op, left, right)
    except Exception:  # noqa: BLE001 — evaluation must never abort a sweep
        return False


# ── Rule CRUD ────────────────────────────────────────────────────────────────────
def create_rule(
    name: str,
    expr: Any,
    *,
    target: Optional[str] = None,
    severity: int = 50,
    enabled: bool = True,
    db_path: Optional[str] = None,
) -> Optional[int]:
    """Create a rule. ``expr`` may be a JSON string or a dict (it is stored as
    canonical JSON). Returns the new rule id, or ``None`` on error."""
    if isinstance(expr, str):
        try:
            parsed = json.loads(expr)
        except (TypeError, ValueError):
            parsed = {}
    else:
        parsed = expr if isinstance(expr, dict) else {}
    try:
        expr_json = json.dumps(parsed, default=str)
    except (TypeError, ValueError):
        expr_json = "{}"
    try:
        sev = int(severity)
    except (TypeError, ValueError):
        sev = 50
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                """
                INSERT INTO rule (name, expr, target, severity, enabled, created_ts)
                VALUES (?,?,?,?,?,?)
                """,
                (str(name or "rule"), expr_json, target, sev, 1 if enabled else 0, _now_ms()),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def _rule_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d.get("enabled"))
    try:
        d["expr"] = json.loads(d.get("expr") or "{}")
    except (TypeError, ValueError):
        d["expr"] = {}
    return d


def list_rules(enabled_only: bool = False, db_path: Optional[str] = None) -> list[dict]:
    """List all rules (newest first). ``enabled_only`` filters to enabled rules."""
    try:
        conn = _connect(db_path)
        try:
            q = "SELECT * FROM rule"
            if enabled_only:
                q += " WHERE enabled = 1"
            q += " ORDER BY id DESC"
            rows = conn.execute(q).fetchall()
            return [_rule_to_dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_rule(rule_id: int, db_path: Optional[str] = None) -> Optional[dict]:
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute("SELECT * FROM rule WHERE id=?", (int(rule_id),)).fetchone()
            return _rule_to_dict(row) if row else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def set_rule_enabled(rule_id: int, enabled: bool, db_path: Optional[str] = None) -> bool:
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE rule SET enabled=? WHERE id=?", (1 if enabled else 0, int(rule_id))
            )
            conn.commit()
            return True
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return False


# ── Evaluation → alerts ──────────────────────────────────────────────────────────
def evaluate(context: dict, *, db_path: Optional[str] = None) -> list[dict]:
    """Evaluate every enabled rule against ``context``. For each rule whose
    expression matches, insert an ``alert`` row and return it. Returns the list
    of fired alerts (each a dict). Never raises; a bad rule simply doesn't fire.
    """
    if not isinstance(context, dict):
        context = {}
    fired: list[dict] = []
    try:
        conn = _connect(db_path)
        try:
            rules = conn.execute("SELECT * FROM rule WHERE enabled = 1 ORDER BY id").fetchall()
            for r in rules:
                try:
                    expr = json.loads(r["expr"] or "{}")
                except (TypeError, ValueError):
                    continue
                if not evaluate_expr(expr, context):
                    continue
                payload = {
                    "rule_name": r["name"],
                    "target": r["target"],
                    "severity": r["severity"],
                    "expr": expr,
                    "matched_at": _now_ms(),
                }
                try:
                    payload_json = json.dumps(payload, default=str)
                except (TypeError, ValueError):
                    payload_json = "{}"
                fired_ts = _now_ms()
                cur = conn.execute(
                    """
                    INSERT INTO alert (rule_id, fired_ts, status, payload_json, ack_by)
                    VALUES (?,?,?,?,?)
                    """,
                    (int(r["id"]), fired_ts, "open", payload_json, None),
                )
                fired.append(
                    {
                        "id": int(cur.lastrowid),
                        "rule_id": int(r["id"]),
                        "fired_ts": fired_ts,
                        "status": "open",
                        "payload": payload,
                        "ack_by": None,
                    }
                )
            conn.commit()
            return fired
        finally:
            conn.close()
    except sqlite3.Error:
        return fired


def _alert_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["payload"] = json.loads(d.pop("payload_json", None) or "{}")
    except (TypeError, ValueError):
        d["payload"] = {}
    return d


def list_alerts(status: Optional[str] = None, db_path: Optional[str] = None) -> list[dict]:
    """List alerts (newest first), optionally filtered by ``status``
    ('open' | 'acked' | ...)."""
    try:
        conn = _connect(db_path)
        try:
            q = "SELECT * FROM alert"
            args: list[Any] = []
            if status is not None:
                q += " WHERE status = ?"
                args.append(status)
            q += " ORDER BY id DESC"
            rows = conn.execute(q, args).fetchall()
            return [_alert_to_dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def ack_alert(alert_id: int, by: str, db_path: Optional[str] = None) -> bool:
    """Acknowledge an alert: set status='acked' and record who. Returns True on
    success (a real row updated)."""
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                "UPDATE alert SET status='acked', ack_by=? WHERE id=?",
                (str(by or "")[:200], int(alert_id)),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return False


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
