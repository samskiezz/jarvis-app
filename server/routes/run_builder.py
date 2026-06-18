"""RUN BUILDER routes — fills mini-app gap #17 (run-builder).

Cluster C5 product-spec. The Run Builder lets the owner stitch nodes into a
runnable graph (similar to n8n / Node-RED / Make). The 2026 default schema
copies the n8n workflow JSON envelope so that:

  * existing n8n workflow exports can be POSTed in unmodified
  * Node-RED flows.json can be transformed with a thin shim
  * the schema can outlive whichever runtime the owner eventually picks

Schema reference:
  * n8n workflow format: https://docs.n8n.io/workflows/export-import/
    {nodes: [{id, name, type, typeVersion, position:[x,y], parameters:{}}],
     connections: {srcNode: {main: [[{node:dstNode, type:'main', index:0}]]}}}
  * Node-RED flows.json: https://nodered.org/docs/api/admin/methods/get/flows/
    [{id, type, x, y, wires:[[nextId]], ...}]

Endpoints:
  POST /v1/run-builder/build      {graph_json}   -> {run_id, status, nodes_compiled}
  GET  /v1/run-builder/runs       -> recent compiled runs
  GET  /v1/run-builder/run/{rid}  -> single run + graph
  POST /v1/run-builder/run/{rid}/cancel

Storage: SQLite at server/data/run_builder.db. Compilation is a pure
validation pass for now — when the owner picks an actual executor (n8n,
Prefect 3, Temporal, Dagster Mesh), the dispatch hook lives in _dispatch().
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Path, Query

from ..auth import optional_bearer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get(
    "RUN_BUILDER_DB", os.path.join(ROOT, "data", "run_builder.db")
)

router = APIRouter(prefix="/v1/run-builder", tags=["run-builder"])

# 2026 default graph follows the n8n minimal workflow envelope.
_DEFAULT_GRAPH: dict[str, Any] = {
    "name": "demo.echo",
    "nodes": [
        {
            "id": "trigger",
            "name": "Manual Trigger",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [240, 300],
            "parameters": {},
        },
        {
            "id": "echo",
            "name": "Echo",
            "type": "n8n-nodes-base.set",
            "typeVersion": 3,
            "position": [480, 300],
            "parameters": {"values": {"string": [{"name": "msg", "value": "hello"}]}},
        },
    ],
    "connections": {
        "trigger": {"main": [[{"node": "echo", "type": "main", "index": 0}]]}
    },
}


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS runs(
            id TEXT PRIMARY KEY,
            ts INTEGER NOT NULL,
            name TEXT,
            status TEXT NOT NULL,
            nodes_compiled INTEGER DEFAULT 0,
            graph_json TEXT NOT NULL,
            error TEXT
        )"""
    )
    c.execute("CREATE INDEX IF NOT EXISTS ix_runs_ts ON runs(ts DESC)")
    c.commit()
    return c


def _validate_graph(graph: dict[str, Any]) -> tuple[bool, str, int]:
    """Light n8n-flavoured validator. Returns (ok, reason, node_count)."""
    if not isinstance(graph, dict):
        return False, "graph must be a JSON object", 0
    nodes = graph.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return False, "graph.nodes must be a non-empty list", 0
    seen: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict):
            return False, "each node must be an object", 0
        nid = str(n.get("id") or n.get("name") or "")
        if not nid:
            return False, "every node needs an id or name", 0
        if nid in seen:
            return False, f"duplicate node id: {nid}", 0
        seen.add(nid)
        if not n.get("type"):
            return False, f"node {nid} missing type", 0
    conns = graph.get("connections") or {}
    if not isinstance(conns, dict):
        return False, "connections must be an object", 0
    for src in conns:
        if src not in seen:
            return False, f"connection from unknown node: {src}", 0
    return True, "", len(nodes)


def _dispatch(run_id: str, graph: dict[str, Any]) -> str:
    """Hand-off seam to a real executor. Returns the new run status.

    Today this stays in 'compiled' until a real engine (n8n, Prefect 3, Temporal,
    Dagster Mesh) is wired in via env RUN_BUILDER_EXECUTOR. The contract: any
    executor implementation must accept the n8n-shaped graph and report back
    one of: compiled, running, succeeded, failed, cancelled.
    """
    return "compiled"


@router.post("/build")
async def build(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        graph = body.get("graph_json") or body.get("graph") or body
        if isinstance(graph, str):
            try:
                graph = json.loads(graph)
            except json.JSONDecodeError as e:
                return {"ok": False, "error": f"graph_json not valid JSON: {e}"}
        ok, reason, node_count = _validate_graph(graph if isinstance(graph, dict) else {})
        run_id = uuid.uuid4().hex[:16]
        ts = int(time.time())
        status = "compiled" if ok else "failed"
        if ok:
            status = _dispatch(run_id, graph)
        c = _db()
        try:
            c.execute(
                "INSERT INTO runs(id, ts, name, status, nodes_compiled, graph_json, error) "
                "VALUES(?,?,?,?,?,?,?)",
                (
                    run_id,
                    ts,
                    str(graph.get("name") if isinstance(graph, dict) else "") or None,
                    status,
                    node_count,
                    json.dumps(graph)[:200_000],
                    None if ok else reason,
                ),
            )
            c.commit()
        finally:
            c.close()
        return {
            "ok": ok,
            "run_id": run_id,
            "status": status,
            "nodes_compiled": node_count,
            "error": None if ok else reason,
            "schema_version": "2026.1",
            "source": "live",
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}


@router.get("/runs")
async def list_runs(
    limit: int = Query(50, ge=1, le=500),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            rows = c.execute(
                "SELECT id, ts, name, status, nodes_compiled, error "
                "FROM runs ORDER BY ts DESC LIMIT ?",
                (limit,),
            ).fetchall()
            items = [
                {
                    "run_id": r[0],
                    "ts": r[1],
                    "name": r[2],
                    "status": r[3],
                    "nodes_compiled": r[4],
                    "error": r[5],
                }
                for r in rows
            ]
            if not items:
                items = [
                    {
                        "run_id": "demo000000000000",
                        "ts": 0,
                        "name": _DEFAULT_GRAPH["name"],
                        "status": "compiled",
                        "nodes_compiled": len(_DEFAULT_GRAPH["nodes"]),
                        "error": None,
                    }
                ]
                source = "default-schema"
            else:
                source = "live"
            return {
                "ok": True,
                "items": items,
                "count": len(items),
                "schema_version": "2026.1",
                "source": source,
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "items": [], "source": "default-schema"}


@router.get("/run/{run_id}")
async def get_run(
    run_id: str = Path(..., min_length=1, max_length=64),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            r = c.execute(
                "SELECT id, ts, name, status, nodes_compiled, graph_json, error "
                "FROM runs WHERE id = ?",
                (run_id,),
            ).fetchone()
            if not r:
                return {
                    "ok": True,
                    "run_id": run_id,
                    "status": "unknown",
                    "graph": _DEFAULT_GRAPH,
                    "schema_version": "2026.1",
                    "source": "default-schema",
                }
            try:
                graph = json.loads(r[5])
            except Exception:  # noqa: BLE001
                graph = {}
            return {
                "ok": True,
                "run_id": r[0],
                "ts": r[1],
                "name": r[2],
                "status": r[3],
                "nodes_compiled": r[4],
                "graph": graph,
                "error": r[6],
                "schema_version": "2026.1",
                "source": "live",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}


@router.post("/run/{run_id}/cancel")
async def cancel_run(
    run_id: str = Path(..., min_length=1, max_length=64),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            cur = c.execute(
                "UPDATE runs SET status='cancelled' "
                "WHERE id=? AND status IN ('compiled','running')",
                (run_id,),
            )
            c.commit()
            return {
                "ok": True,
                "run_id": run_id,
                "status": "cancelled",
                "rows_changed": cur.rowcount,
                "source": "live",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}
