"""CORPUS → ONTOLOGY PROJECTION — make Gotham reflect the REAL loaded data.

The acquisition corpus (world_subject / world_endpoint / world_ocr / world_edge)
was loaded into its own tables but never projected into the ontology graph, so
Gotham only ever saw the ~119 demo objects — the maths didn't math. This projects
the corpus into ``ont_object`` / ``ont_link`` (the tables Gotham + the graph read):

  * each domain SUBJECT  -> a DomainSubject object  (these are the NEURONS)
  * each ENDPOINT        -> a DataSource object, linked SERVES -> its subject
  * each OCR candidate   -> a Document object,   linked DESCRIBES -> its subject
  * each typed flow EDGE -> an ont_link between the subject and the flow target

Idempotent (``INSERT OR IGNORE`` on the PK), bulk (executemany), stdlib only,
never raises. Returns the real counts so startup/status can report the truth.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Optional

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "server/data/brain.db")

_TYPES = {
    "DomainSubject": "Domain knowledge subject (neuron).",
    "DataSource": "Catalogued data acquisition endpoint.",
    "Document": "OCR / reference document candidate.",
}


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _ensure_schema(c: sqlite3.Connection) -> None:
    """Create the ontology-graph tables if they don't exist yet.

    The projection runs during startup on a FRESH database (every ephemeral container
    clones the repo anew) — BEFORE any ontology API call has created these tables — so
    it must create them itself or it crashes on the first INSERT and Gotham stays empty
    (0 objects / 0 neurons). This was the bug that made the whole graph look "fake".
    Schema is identical to ``jarvis_ontology.init_db`` so both paths share one shape."""
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS ont_object_type (
            name TEXT PRIMARY KEY, schema TEXT, states TEXT, initial TEXT, ts INTEGER
        );
        CREATE TABLE IF NOT EXISTS ont_object (
            id TEXT PRIMARY KEY, type TEXT, props TEXT, state TEXT,
            created_ts INTEGER, updated_ts INTEGER
        );
        CREATE TABLE IF NOT EXISTS ont_link (
            id TEXT PRIMARY KEY, type TEXT, from_id TEXT, to_id TEXT, ts INTEGER
        );
        """
    )


def _ensure_types(c: sqlite3.Connection) -> None:
    _ensure_schema(c)
    now = int(time.time() * 1000)
    c.executemany(
        "INSERT OR IGNORE INTO ont_object_type (name, schema, states, initial, ts) VALUES (?,?,?,?,?)",
        [(name, json.dumps({"desc": desc}), json.dumps(["active"]), "active", now)
         for name, desc in _TYPES.items()],
    )


def _bulk_objects(c, rows) -> int:
    """rows: iterable of (id, type, props_dict). INSERT OR IGNORE. Returns inserted."""
    now = int(time.time() * 1000)
    data = [(oid, otype, json.dumps(props, default=str), "active", now, now)
            for (oid, otype, props) in rows]
    before = c.total_changes
    c.executemany(
        "INSERT OR IGNORE INTO ont_object (id,type,props,state,created_ts,updated_ts) VALUES (?,?,?,?,?,?)",
        data,
    )
    return c.total_changes - before


def _bulk_links(c, rows) -> int:
    """rows: iterable of (id, type, from_id, to_id)."""
    now = int(time.time() * 1000)
    data = [(lid, ltype, fid, tid, now) for (lid, ltype, fid, tid) in rows]
    before = c.total_changes
    c.executemany(
        "INSERT OR IGNORE INTO ont_link (id,type,from_id,to_id,ts) VALUES (?,?,?,?,?)",
        data,
    )
    return c.total_changes - before


def project(*, batch: int = 5000) -> dict:
    """Project the whole corpus into the ontology graph. Idempotent. Never raises."""
    try:
        c = _conn()
    except sqlite3.Error as e:
        return {"ok": False, "error": str(e)}
    out = {"subjects": 0, "sources": 0, "documents": 0, "links": 0}
    try:
        _ensure_types(c)

        # 1) subjects -> DomainSubject (neurons)
        try:
            rows, buf = c.execute(
                "SELECT subject_id, domain_subject, master_topic, neuron_type, "
                "primary_source_families, ontology_targets, lawful_boundary FROM world_subject"
            ), []
            for r in rows:
                buf.append((f"subject:{r['subject_id']}", "DomainSubject", {
                    "label": r["domain_subject"] or r["subject_id"],
                    "master_topic": r["master_topic"], "neuron_type": r["neuron_type"],
                    "source_families": r["primary_source_families"],
                    "ontology_targets": r["ontology_targets"], "lawful_boundary": r["lawful_boundary"],
                }))
                if len(buf) >= batch:
                    out["subjects"] += _bulk_objects(c, buf); buf = []; c.commit()
            if buf:
                out["subjects"] += _bulk_objects(c, buf); c.commit()
        except sqlite3.Error:
            pass

        # 2) endpoints -> DataSource + SERVES link to subject
        try:
            rows = c.execute(
                "SELECT endpoint_candidate_id, subject_id, source_name, official_url, "
                "master_topic, access_method, recommended_ingestion_connector FROM world_endpoint"
            )
            obuf, lbuf = [], []
            for r in rows:
                oid = f"source:{r['endpoint_candidate_id']}"
                obuf.append((oid, "DataSource", {
                    "label": r["source_name"] or r["endpoint_candidate_id"],
                    "url": r["official_url"], "master_topic": r["master_topic"],
                    "access_method": r["access_method"],
                    "connector": r["recommended_ingestion_connector"],
                }))
                if r["subject_id"]:
                    lbuf.append((f"serves:{r['endpoint_candidate_id']}", "SERVES",
                                 oid, f"subject:{r['subject_id']}"))
                if len(obuf) >= batch:
                    out["sources"] += _bulk_objects(c, obuf); obuf = []
                    out["links"] += _bulk_links(c, lbuf); lbuf = []; c.commit()
            if obuf:
                out["sources"] += _bulk_objects(c, obuf)
                out["links"] += _bulk_links(c, lbuf); c.commit()
        except sqlite3.Error:
            pass

        # 3) OCR -> Document + DESCRIBES link to subject
        try:
            rows = c.execute(
                "SELECT ocr_candidate_id, subject_id, source_name, master_topic, "
                "document_types, source_url FROM world_ocr"
            )
            obuf, lbuf = [], []
            for r in rows:
                oid = f"doc:{r['ocr_candidate_id']}"
                obuf.append((oid, "Document", {
                    "label": r["source_name"] or r["ocr_candidate_id"],
                    "master_topic": r["master_topic"], "document_types": r["document_types"],
                    "url": r["source_url"],
                }))
                if r["subject_id"]:
                    lbuf.append((f"describes:{r['ocr_candidate_id']}", "DESCRIBES",
                                 oid, f"subject:{r['subject_id']}"))
                if len(obuf) >= batch:
                    out["documents"] += _bulk_objects(c, obuf); obuf = []
                    out["links"] += _bulk_links(c, lbuf); lbuf = []; c.commit()
            if obuf:
                out["documents"] += _bulk_objects(c, obuf)
                out["links"] += _bulk_links(c, lbuf); c.commit()
        except sqlite3.Error:
            pass

        # 4) typed flow edges -> ont_link scoped to the subject
        try:
            rows = c.execute(
                "SELECT edge_id, subject_id, source_class, target_class, edge_type FROM world_edge"
            )
            lbuf = []
            for r in rows:
                if not r["subject_id"]:
                    continue
                lbuf.append((f"flow:{r['edge_id']}", r["edge_type"] or "FLOW",
                             f"subject:{r['subject_id']}",
                             f"class:{r['target_class']}"))
                if len(lbuf) >= batch:
                    out["links"] += _bulk_links(c, lbuf); lbuf = []; c.commit()
            if lbuf:
                out["links"] += _bulk_links(c, lbuf); c.commit()
        except sqlite3.Error:
            pass

        c.commit()
        # honest final counts straight from the graph
        out["ont_objects_total"] = c.execute("SELECT COUNT(*) FROM ont_object").fetchone()[0]
        out["neurons_total"] = c.execute(
            "SELECT COUNT(*) FROM ont_object WHERE type='DomainSubject'").fetchone()[0]
        out["ont_links_total"] = c.execute("SELECT COUNT(*) FROM ont_link").fetchone()[0]
    finally:
        c.close()
    out["ok"] = True
    return out


def counts() -> dict:
    """Current projected graph sizes (for status). Never raises."""
    try:
        c = _conn()
        try:
            return {
                "ont_objects": c.execute("SELECT COUNT(*) FROM ont_object").fetchone()[0],
                "neurons": c.execute("SELECT COUNT(*) FROM ont_object WHERE type='DomainSubject'").fetchone()[0],
                "ont_links": c.execute("SELECT COUNT(*) FROM ont_link").fetchone()[0],
                "sources": c.execute("SELECT COUNT(*) FROM ont_object WHERE type='DataSource'").fetchone()[0],
                "documents": c.execute("SELECT COUNT(*) FROM ont_object WHERE type='Document'").fetchone()[0],
            }
        finally:
            c.close()
    except sqlite3.Error:
        return {}
