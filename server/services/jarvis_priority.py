"""V20 PRIORITY ACQUISITION POINTS — the real operational acquisition layer.

The v20 master pack adds priority_acquisition_points_1000.csv: 1,000 real,
fully-specified acquisition points (source strategy, ontology object, cause→effect,
Foundry/Gotham/Apollo/AIP use, vector namespace, graph edges, quality gates, policy
controls). These are richer than the raw endpoint catalogue and span the full topic
breadth — the things the platform should actually acquire and research.

This loads them (from the gzipped CSV in world_os/catalogues) into ont_object as
``AcquisitionPoint`` objects with their topic + source strategy, so they show up in
Gotham and can drive topic-based research. stdlib only; idempotent; never raises.
"""

from __future__ import annotations

import csv
import gzip
import json
import os
import sqlite3
import time

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "server/data/brain.db")

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_CSV = os.path.join(_ROOT, "world_os", "catalogues", "priority_acquisition_points_1000.csv.gz")


def available() -> bool:
    return os.path.isfile(_CSV)


def _open():
    return (gzip.open(_CSV, "rt", encoding="utf-8", errors="ignore", newline="")
            if _CSV.endswith(".gz") else open(_CSV, newline="", encoding="utf-8", errors="ignore"))


def load() -> dict:
    """Load the 1,000 priority acquisition points into the ontology graph. Idempotent."""
    if not available():
        return {"ok": False, "error": f"priority CSV not found at {_CSV}"}
    try:
        c = sqlite3.connect(_db_path(), check_same_thread=False)
    except sqlite3.Error as e:
        return {"ok": False, "error": str(e)}
    now = int(time.time() * 1000)
    n = 0
    try:
        c.execute("INSERT OR IGNORE INTO ont_object_type (name, schema, states, initial, ts) "
                  "VALUES (?,?,?,?,?)",
                  ("AcquisitionPoint", json.dumps({"desc": "v20 priority acquisition point"}),
                   json.dumps(["active"]), "active", now))
        rows = []
        with _open() as f:
            for r in csv.DictReader(f):
                pid = r.get("acquisition_point_id") or r.get("base_id")
                if not pid:
                    continue
                props = {
                    "label": r.get("name") or pid,
                    "source_strategy": r.get("source_strategy"),
                    "ontology_object": r.get("ontology_object"),
                    "cause_input": r.get("cause_input"), "effect_output": r.get("effect_output"),
                    "foundry_use": r.get("foundry_use"), "gotham_use": r.get("gotham_use"),
                    "apollo_use": r.get("apollo_use"), "aip_use": r.get("aip_use"),
                    "vector_namespace": r.get("vector_namespace"),
                    "policy_controls": r.get("policy_controls"),
                }
                rows.append((f"acq:{pid}", "AcquisitionPoint", json.dumps(props, default=str),
                             "active", now, now))
        if rows:
            before = c.total_changes
            c.executemany("INSERT OR IGNORE INTO ont_object (id,type,props,state,created_ts,updated_ts) "
                          "VALUES (?,?,?,?,?,?)", rows)
            n = c.total_changes - before
            c.commit()
        total = c.execute("SELECT COUNT(*) FROM ont_object WHERE type='AcquisitionPoint'").fetchone()[0]
    finally:
        c.close()
    return {"ok": True, "loaded_new": n, "acquisition_points_total": total}


def source_strategies() -> list[str]:
    """Distinct source strategies (real source combos) across the priority points —
    the research targets. Never raises."""
    if not available():
        return []
    seen = set()
    try:
        with _open() as f:
            for r in csv.DictReader(f):
                s = (r.get("source_strategy") or "").strip()
                if s:
                    seen.add(s)
    except Exception:  # noqa: BLE001
        return []
    return sorted(seen)
