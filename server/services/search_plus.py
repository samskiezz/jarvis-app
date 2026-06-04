"""SEARCH-PLUS — saved searches, faceted filters & search-in-graph (P4 #33/#35/#37).

A thin *composition* layer over the existing search / ontology / graph services.
Nothing here re-implements an index or a graph algorithm — it REUSES:

  * :mod:`server.services.search`          — keyword ranking (``search``).
  * :mod:`server.services.ontology_store`  — ``query_objects`` for facets/filters.
  * :mod:`server.services.graph`           — ``shortest_path`` / ``all_paths`` for
                                             search-in-graph, ``subgraph`` for
                                             pattern expansion.

Persistence for the saved-search catalog + alerting snapshots is a tiny SQLite
DB (stdlib ``sqlite3``), pathed by the env var ``SEARCH_DB`` (default
``server/data/search_plus.db``).

Doctrine (matching the rest of the backend):
  * stdlib only (no new dependency);
  * idempotent DDL + writes;
  * NEVER raise — every public function degrades to a safe empty/zero value.

Public surface
--------------
Faceted filters (#33):
  * :func:`facets`            — available facets (type/mark counts + prop histograms).
  * :func:`faceted_search`    — objects matching ``{type?, mark?, props, q?}``.

Saved searches + alerting (#35):
  * :func:`save_search`       — persist a faceted filter spec under a name.
  * :func:`list_searches`     — all saved searches.
  * :func:`run_saved`         — current results for a saved search.
  * :func:`delete_search`     — remove a saved search.
  * :func:`check_new_matches` — NEW result ids since the last check (alerting).

Search-in-graph (#37):
  * :func:`find_paths`        — paths between two object ids.
  * :func:`pattern_search`    — expand a subgraph from a seed (optionally by relation).
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

# ── reused services (all best-effort so import never fails) ───────────────────
try:
    from . import ontology_store as _store  # type: ignore
except Exception:  # noqa: BLE001
    _store = None

try:
    from . import search as _search  # type: ignore
except Exception:  # noqa: BLE001
    _search = None

try:
    from . import graph as _graph  # type: ignore
except Exception:  # noqa: BLE001
    _graph = None


# ── DB location ───────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "search_plus.db"
)


def _db_path() -> str:
    return os.environ.get("SEARCH_DB", _DEFAULT_DB)


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


# ── connection / schema ─────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS saved_search (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    spec_json  TEXT NOT NULL DEFAULT '{}',
    snapshot_json TEXT NOT NULL DEFAULT '[]',
    created_ts INTEGER NOT NULL,
    updated_ts INTEGER NOT NULL,
    checked_ts INTEGER
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
    """Create the saved_search table if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── ontology access helpers (store first, never raise) ────────────────────────
# Prop keys we surface value-histograms for — kept short & generic so the facet
# panel stays useful across the seed domain vocabulary.
_FACET_PROP_KEYS = ("status", "sector", "country", "role", "severity", "category")


def _all_objects(type: Optional[str] = None) -> list[dict]:
    if _store is None:
        return []
    try:
        objs = _store.query_objects(type=type) or []
        return [o for o in objs if isinstance(o, dict)]
    except Exception:  # noqa: BLE001
        return []


# ── FACETED FILTERS (#33) ─────────────────────────────────────────────────────
def facets(type: Optional[str] = None) -> dict:  # noqa: A002 - public API name
    """Compute the available facets over the ontology.

    Returns ``{"type": {t: n}, "mark": {m: n}, "props": {key: {value: n}}, "total": N}``
    where ``props`` holds value-histograms for a few common prop keys. When
    ``type`` is given the histogram is scoped to that object type. Never raises.
    """
    try:
        objs = _all_objects(type=type)
        type_counts: dict[str, int] = {}
        mark_counts: dict[str, int] = {}
        prop_counts: dict[str, dict[str, int]] = {}
        for o in objs:
            t = str(o.get("type") or "")
            if t:
                type_counts[t] = type_counts.get(t, 0) + 1
            m = o.get("mark")
            if m is not None and str(m) != "":
                mk = str(m)
                mark_counts[mk] = mark_counts.get(mk, 0) + 1
            props = o.get("props") if isinstance(o.get("props"), dict) else {}
            for key in _FACET_PROP_KEYS:
                if key in props:
                    val = props.get(key)
                    if val is None:
                        continue
                    bucket = prop_counts.setdefault(key, {})
                    sval = str(val)
                    bucket[sval] = bucket.get(sval, 0) + 1
        return {
            "type": type_counts,
            "mark": mark_counts,
            "props": prop_counts,
            "total": len(objs),
        }
    except Exception:  # noqa: BLE001
        return {"type": {}, "mark": {}, "props": {}, "total": 0}


def _matches_props(obj: dict, props_filter: dict) -> bool:
    op = obj.get("props") if isinstance(obj.get("props"), dict) else {}
    for k, v in props_filter.items():
        pv = op.get(k)
        if pv != v and str(pv) != str(v):
            return False
    return True


def faceted_search(filters: Optional[dict] = None) -> dict:
    """Objects matching a faceted filter spec.

    ``filters`` keys (all optional):
      * ``type``  — object type.
      * ``mark``  — classification mark.
      * ``props`` — dict of ``{prop_key: value}`` equality filters.
      * ``q``     — free-text keyword query (reuses :mod:`search`).
      * ``limit`` — cap on results (default 200).

    Returns ``{"results": [...], "facets": {...}, "count": N}`` where ``facets``
    is recomputed over the *matched* set so the UI can show drill-down counts.
    Never raises.
    """
    filters = filters if isinstance(filters, dict) else {}
    try:
        ftype = filters.get("type")
        fmark = filters.get("mark")
        fprops = filters.get("props") if isinstance(filters.get("props"), dict) else {}
        q = filters.get("q")
        try:
            limit = int(filters.get("limit", 200))
        except (TypeError, ValueError):
            limit = 200
        if limit <= 0:
            limit = 200

        # 1) base set from the ontology store (type filter pushed down).
        where = dict(fprops) if fprops else None
        if _store is not None:
            try:
                base = _store.query_objects(type=ftype, where=where) or []
            except Exception:  # noqa: BLE001
                base = _all_objects(type=ftype)
                base = [o for o in base if _matches_props(o, fprops)]
        else:
            base = []

        # 2) mark filter (case-insensitive).
        if fmark is not None and str(fmark) != "":
            fm = str(fmark).lower()
            base = [o for o in base if str(o.get("mark") or "").lower() == fm]

        # 3) optional keyword filter — REUSE the existing search index for
        #    ranking, then intersect with the structurally-filtered set so the
        #    facet constraints always win.
        if q:
            allowed_ids = {str(o.get("id")) for o in base}
            hits = []
            if _search is not None:
                try:
                    hits = _search.search(q, type=ftype, mark=fmark, limit=max(limit * 2, 50)) or []
                except Exception:  # noqa: BLE001
                    hits = []
            by_id = {str(o.get("id")): o for o in base}
            results: list[dict] = []
            for h in hits:
                hid = str(h.get("id"))
                if hid in allowed_ids and hid in by_id:
                    obj = dict(by_id[hid])
                    obj["score"] = h.get("score")
                    obj["snippet"] = h.get("snippet")
                    results.append(obj)
            matched = results
        else:
            matched = list(base)

        matched = matched[:limit]

        # facets recomputed over the matched set (drill-down counts).
        sub_facets = _facets_over(matched)
        return {"results": matched, "facets": sub_facets, "count": len(matched)}
    except Exception:  # noqa: BLE001
        return {"results": [], "facets": {"type": {}, "mark": {}, "props": {}, "total": 0}, "count": 0}


def _facets_over(objs: list[dict]) -> dict:
    """Facet histograms over an explicit object list (used for drill-down)."""
    type_counts: dict[str, int] = {}
    mark_counts: dict[str, int] = {}
    prop_counts: dict[str, dict[str, int]] = {}
    for o in objs:
        t = str(o.get("type") or "")
        if t:
            type_counts[t] = type_counts.get(t, 0) + 1
        m = o.get("mark")
        if m is not None and str(m) != "":
            mk = str(m)
            mark_counts[mk] = mark_counts.get(mk, 0) + 1
        props = o.get("props") if isinstance(o.get("props"), dict) else {}
        for key in _FACET_PROP_KEYS:
            if key in props and props.get(key) is not None:
                bucket = prop_counts.setdefault(key, {})
                sval = str(props.get(key))
                bucket[sval] = bucket.get(sval, 0) + 1
    return {"type": type_counts, "mark": mark_counts, "props": prop_counts, "total": len(objs)}


# ── SAVED SEARCHES + ALERTING (#35) ───────────────────────────────────────────
def _row_to_saved(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "spec": _loads(r["spec_json"]),
        "created_ts": r["created_ts"],
        "updated_ts": r["updated_ts"],
        "checked_ts": r["checked_ts"],
    }


def save_search(name: str, spec: Optional[dict], *, db_path: Optional[str] = None) -> Optional[dict]:
    """Persist a faceted-search filter ``spec`` under ``name``.

    Returns the stored record (``{id, name, spec, ...}``) or None on error.
    """
    init_db(db_path)
    spec = spec if isinstance(spec, dict) else {}
    sid = uuid.uuid4().hex
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO saved_search
                    (id, name, spec_json, snapshot_json, created_ts, updated_ts, checked_ts)
                VALUES (?,?,?,?,?,?,?)
                """,
                (sid, str(name or "untitled"), _dumps(spec), "[]", now, now, None),
            )
            conn.commit()
            return _get_saved(sid, db_path=db_path)
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def _get_saved(search_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute("SELECT * FROM saved_search WHERE id=?", (search_id,)).fetchone()
            return _row_to_saved(r) if r else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_searches(*, db_path: Optional[str] = None) -> list[dict]:
    """All saved searches, newest first. Never raises."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM saved_search ORDER BY created_ts DESC, id DESC"
            ).fetchall()
            return [_row_to_saved(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def run_saved(search_id: str, *, db_path: Optional[str] = None) -> dict:
    """Run a saved search and return its current results.

    Returns the same shape as :func:`faceted_search` plus the saved metadata, or
    an empty result if the id is unknown. Never raises.
    """
    saved = _get_saved(search_id, db_path=db_path)
    if saved is None:
        return {"id": search_id, "results": [], "facets": {"type": {}, "mark": {}, "props": {}, "total": 0}, "count": 0}
    res = faceted_search(saved.get("spec") or {})
    res["id"] = search_id
    res["name"] = saved.get("name")
    return res


def delete_search(search_id: str, *, db_path: Optional[str] = None) -> bool:
    """Delete a saved search. Returns True if a row was removed. Never raises."""
    if not search_id:
        return False
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute("DELETE FROM saved_search WHERE id=?", (search_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def check_new_matches(search_id: str, *, db_path: Optional[str] = None) -> dict:
    """Alerting primitive: NEW result ids since the last check.

    Runs the saved search, diffs the current result ids against the stored
    snapshot, updates the snapshot to the current ids, and returns
    ``{"id", "new": [ids...], "count", "total"}``. The first call after a save
    reports every current id as new; a subsequent identical call reports ``[]``.
    Never raises.
    """
    saved = _get_saved(search_id, db_path=db_path)
    if saved is None:
        return {"id": search_id, "new": [], "count": 0, "total": 0}
    try:
        res = faceted_search(saved.get("spec") or {})
        current_ids = [str(o.get("id")) for o in res.get("results", []) if o.get("id") is not None]

        conn = _connect(db_path)
        try:
            r = conn.execute(
                "SELECT snapshot_json FROM saved_search WHERE id=?", (search_id,)
            ).fetchone()
            prev = _loads(r["snapshot_json"]) if r else []
            prev_set = set(prev if isinstance(prev, list) else [])
            new_ids = [i for i in current_ids if i not in prev_set]

            conn.execute(
                "UPDATE saved_search SET snapshot_json=?, checked_ts=? WHERE id=?",
                (_dumps(current_ids), _now_ms(), search_id),
            )
            conn.commit()
        finally:
            conn.close()
        return {"id": search_id, "new": new_ids, "count": len(new_ids), "total": len(current_ids)}
    except (sqlite3.Error, TypeError, ValueError):
        return {"id": search_id, "new": [], "count": 0, "total": 0}


# ── SEARCH-IN-GRAPH (#37) ──────────────────────────────────────────────────────
def find_paths(a: str, b: str, max_depth: int = 4, *, role: Optional[str] = None) -> dict:
    """Paths between two object ids.

    REUSES :func:`graph.shortest_path` (strength-weighted Dijkstra) for the
    primary route and :func:`graph.all_paths` (bounded simple-path enumeration)
    for the alternates. Returns
    ``{"a", "b", "shortest": [ids], "edges": [...], "paths": [[ids], ...]}``.
    Never raises.
    """
    a, b = str(a), str(b)
    out = {"a": a, "b": b, "shortest": [], "edges": [], "paths": []}
    if _graph is None:
        return out
    try:
        sp = _graph.shortest_path(a, b, role=role) or {}
        out["shortest"] = sp.get("path", []) or []
        out["edges"] = sp.get("edges", []) or []
    except Exception:  # noqa: BLE001
        pass
    try:
        paths = _graph.all_paths(a, b, max_len=max_depth) or []
        out["paths"] = paths
    except Exception:  # noqa: BLE001
        pass
    return out


def pattern_search(
    seed: Any,
    relation: Optional[str] = None,
    depth: int = 2,
    *,
    role: Optional[str] = None,
) -> dict:
    """Expand the subgraph from ``seed`` out to ``depth`` hops, optionally keeping
    only edges whose relation matches ``relation`` (case-insensitive).

    REUSES :func:`graph.subgraph` for the BFS expansion. When a relation filter is
    given, edges are pruned to that relation and nodes pruned to those still
    touched by a surviving edge (plus the seeds). Returns
    ``{"seed", "relation", "depth", "nodes": [...], "edges": [...]}``. Never raises.
    """
    try:
        if isinstance(seed, (list, tuple, set)):
            seeds = [str(s) for s in seed if s is not None and str(s) != ""]
        else:
            seeds = [str(seed)] if seed is not None and str(seed) != "" else []
        try:
            depth = max(0, int(depth))
        except (TypeError, ValueError):
            depth = 2

        if _graph is None:
            return {"seed": seeds, "relation": relation, "depth": depth, "nodes": [], "edges": []}

        sg = _graph.subgraph(seeds, depth=depth, role=role) or {}
        nodes = sg.get("nodes", []) or []
        edges = sg.get("edges", []) or []

        if relation is not None and str(relation) != "":
            rel = str(relation).lower()
            edges = [e for e in edges if str(e.get("relation") or "").lower() == rel]
            keep_ids = set(seeds)
            for e in edges:
                keep_ids.add(str(e.get("a")))
                keep_ids.add(str(e.get("b")))
            nodes = [n for n in nodes if str(n.get("id")) in keep_ids]

        return {
            "seed": seeds,
            "relation": relation,
            "depth": depth,
            "nodes": nodes,
            "edges": edges,
        }
    except Exception:  # noqa: BLE001
        return {"seed": seed, "relation": relation, "depth": depth, "nodes": [], "edges": []}


# Bootstrap the default DB on import so the first request finds the table.
init_db()
