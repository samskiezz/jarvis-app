"""DASHBOARDS — saved dashboard definitions + live widget resolution (P0).

A SQLite-backed (stdlib ``sqlite3``, no ORM) store of saved dashboard layouts.
A dashboard is a name + a JSON list of *widget specs*; each widget is resolved to
live data on demand by :func:`resolve_widget`, so the frontend can persist a
layout once and re-hydrate it from the live services.

Widget spec shape (small, JSON-friendly)::

    {"type": "stat"|"chart"|"list",
     "source": "markets"|"skill"|"objects"|"alerts",
     ... source-specific options ... }

Source semantics:
  * ``markets`` — live market instruments (live_intel snapshot).
  * ``skill``   — History Lake rolling skill summary (optional ``domain``).
  * ``objects`` — ontology objects (optional ``object_type``); a ``stat`` widget
                  returns the count, a ``list`` returns the objects.
  * ``alerts``  — current alerts (optional ``status``).

Design doctrine (mirrors reports.py / cases.py):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL; never raise on normal use.

DB path comes from env ``REPORTS_DB`` (shared with reports.py; default
``server/data/reports.db``). Tests pass an explicit temp path via the env var.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any, Optional

# ── DB location (shared with reports.py) ─────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "reports.db"
)


def _db_path() -> str:
    return os.environ.get("REPORTS_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else [], default=str)
    except (TypeError, ValueError):
        return "[]"


def _loads(text: Optional[str], default: Any) -> Any:
    if not text:
        return default
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return default


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS dashboard (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    widgets_json TEXT    NOT NULL DEFAULT '[]',
    created_ts   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_dashboard_created ON dashboard (created_ts);
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
    """Create the dashboard table/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── CRUD ─────────────────────────────────────────────────────────────────────────
def _row_to_dashboard(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "widgets": _loads(r["widgets_json"], []),
        "created_ts": r["created_ts"],
    }


def save_dashboard(
    name: str,
    widgets_json: Any,
    *,
    db_path: Optional[str] = None,
) -> Optional[int]:
    """Persist a dashboard definition. ``widgets_json`` may be a python list/dict
    or an already-serialised JSON string. Returns the new id or None on error."""
    init_db(db_path)
    if isinstance(widgets_json, str):
        widgets = _loads(widgets_json, [])
    else:
        widgets = widgets_json if widgets_json is not None else []
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                "INSERT INTO dashboard (name, widgets_json, created_ts) VALUES (?,?,?)",
                (str(name or "dashboard"), _dumps(widgets), _now_ms()),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def list_dashboards(db_path: Optional[str] = None) -> list[dict]:
    """List saved dashboards (newest first)."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute("SELECT * FROM dashboard ORDER BY id DESC").fetchall()
            return [_row_to_dashboard(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_dashboard(dashboard_id: int, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one dashboard by id, or None."""
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute(
                "SELECT * FROM dashboard WHERE id=?", (int(dashboard_id),)
            ).fetchone()
            return _row_to_dashboard(r) if r else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def delete_dashboard(dashboard_id: int, db_path: Optional[str] = None) -> bool:
    """Delete a dashboard. Returns True if a row was removed."""
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                "DELETE FROM dashboard WHERE id=?", (int(dashboard_id),)
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return False


# ── live widget resolution ───────────────────────────────────────────────────────
def _resolve_objects(widget: dict) -> dict:
    """Resolve an ``objects`` widget from the ontology store."""
    try:
        from . import ontology_store
    except Exception:  # noqa: BLE001
        return {"value": 0, "items": []}
    otype = widget.get("object_type") or widget.get("filter_type")
    try:
        objs = ontology_store.query_objects(type=otype)
    except Exception:  # noqa: BLE001
        objs = []
    wtype = str(widget.get("type") or "stat")
    if wtype == "list":
        return {
            "value": len(objs),
            "items": [
                {"id": o.get("id"), "label": o.get("label"), "type": o.get("type")}
                for o in objs
            ],
        }
    # stat / chart default to the count
    return {"value": len(objs), "items": []}


def _resolve_markets(widget: dict) -> dict:
    """Resolve a ``markets`` widget from the live-intel snapshot (best effort)."""
    markets: list[dict] = []
    try:
        import asyncio

        from .live_intel import get_live_intel
    except Exception:  # noqa: BLE001
        return {"value": 0, "items": []}
    try:
        try:
            asyncio.get_running_loop()
            running = True
        except RuntimeError:
            running = False
        if not running:
            snap = asyncio.run(get_live_intel())
            if isinstance(snap, dict) and isinstance(snap.get("markets"), list):
                markets = snap["markets"]
    except Exception:  # noqa: BLE001
        markets = []
    sym = widget.get("symbol")
    if sym:
        markets = [m for m in markets if m.get("sym") == sym or m.get("display") == sym]
    return {"value": len(markets), "items": markets}


def _resolve_skill(widget: dict) -> dict:
    """Resolve a ``skill`` widget from the History Lake skill summary."""
    try:
        from . import history_lake
    except Exception:  # noqa: BLE001
        return {"value": None, "items": []}
    try:
        summary = history_lake.skill_summary(domain=widget.get("domain"))
    except Exception:  # noqa: BLE001
        summary = {}
    return {"value": summary.get("mae") if isinstance(summary, dict) else None,
            "summary": summary, "items": []}


def _resolve_alerts(widget: dict) -> dict:
    """Resolve an ``alerts`` widget from the alerts service."""
    try:
        from . import alerts as alerts_svc
    except Exception:  # noqa: BLE001
        return {"value": 0, "items": []}
    try:
        items = alerts_svc.list_alerts(status=widget.get("status"))
    except Exception:  # noqa: BLE001
        items = []
    return {"value": len(items), "items": items}


def resolve_widget(widget: dict) -> dict:
    """Fetch the live value for a single widget spec. Returns
    ``{"widget": <spec>, "data": {...}}`` — never raises.

    ``data`` always has a ``value`` (a scalar suitable for a ``stat`` widget) and
    usually an ``items`` list (for ``list``/``chart`` widgets)."""
    if not isinstance(widget, dict):
        return {"widget": widget, "data": {"value": None, "items": [], "error": "bad widget"}}
    source = str(widget.get("source") or "")
    resolver = {
        "objects": _resolve_objects,
        "markets": _resolve_markets,
        "skill": _resolve_skill,
        "alerts": _resolve_alerts,
    }.get(source)
    if resolver is None:
        return {"widget": widget, "data": {"value": None, "items": [], "error": "unknown source"}}
    try:
        data = resolver(widget)
    except Exception:  # noqa: BLE001 - never raise
        data = {"value": None, "items": [], "error": "resolve failed"}
    return {"widget": widget, "data": data}


def resolve_dashboard(dashboard_id: int, db_path: Optional[str] = None) -> Optional[dict]:
    """Resolve every widget of a saved dashboard to live data. Returns the
    dashboard with a ``resolved`` list, or None if the dashboard is missing."""
    dash = get_dashboard(dashboard_id, db_path=db_path)
    if dash is None:
        return None
    widgets = dash.get("widgets") or []
    dash["resolved"] = [resolve_widget(w) for w in widgets if isinstance(w, (dict,))]
    return dash


# Bootstrap the default DB on import.
init_db()
