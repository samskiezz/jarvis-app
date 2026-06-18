"""INFERENCE SWARM routes — fills mini-app gap #20 (inf-swarm).

Cluster C5 product-spec. The Inference Swarm app spawns / lists / kills small
worker agents that the JARVIS brain can fan work out to.

2026 reference: the Kubernetes Operator pattern for swarm scheduling, plus the
A2A (Agent-to-Agent) protocol envelope adopted by AutoGen 0.6 / CrewAI 0.80 /
LangGraph 0.4. Each agent record carries id + kind + status + queue_depth +
last_heartbeat — the same shape a Kubernetes Pod status would expose.

References:
  * Kubernetes Operator pattern:
    https://kubernetes.io/docs/concepts/extend-kubernetes/operator/
  * A2A agent envelope (AutoGen 0.6):
    https://microsoft.github.io/autogen/0.6/reference/python/autogen_core.html
  * Ray Serve autoscaling 2.40:
    https://docs.ray.io/en/latest/serve/autoscaling.html

Endpoints:
  POST /v1/inf-swarm/spawn       {agent_kind, count, params?}
  GET  /v1/inf-swarm/agents      -> all known agents
  POST /v1/inf-swarm/kill        {agent_id}
  POST /v1/inf-swarm/heartbeat   {agent_id, queue_depth?, status?}

Storage: SQLite at server/data/inf_swarm.db. No real subprocess is started —
the row tracks declared intent so an external runner (Ray, k8s, plain procmgr)
can pick the next pending row up via INF_SWARM_RUNNER. Until that's wired, the
status stays 'declared' and the UI shows the swarm topology.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Query

from ..auth import optional_bearer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get(
    "INF_SWARM_DB", os.path.join(ROOT, "data", "inf_swarm.db")
)

router = APIRouter(prefix="/v1/inf-swarm", tags=["inf-swarm"])

# 2026 default agent kinds. Each maps to a small Ollama-or-Claude worker. The
# swarm scheduler chooses workers by kind; the UI shows the same field.
_DEFAULT_KINDS = {
    "scraper": "URL → markdown + embeddings",
    "summarizer": "long text → tldr",
    "classifier": "text → label",
    "translator": "text → other-language text",
    "vision": "image → caption",
    "research": "query → multi-source synthesis",
}

_VALID_STATUS = {"declared", "starting", "running", "idle", "stopped", "errored"}


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS agents(
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            queue_depth INTEGER DEFAULT 0,
            spawned_ts INTEGER NOT NULL,
            last_heartbeat INTEGER DEFAULT 0,
            params_json TEXT,
            error TEXT
        )"""
    )
    c.execute("CREATE INDEX IF NOT EXISTS ix_agents_kind ON agents(kind)")
    c.execute("CREATE INDEX IF NOT EXISTS ix_agents_ts ON agents(spawned_ts DESC)")
    c.commit()
    return c


@router.post("/spawn")
async def spawn(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        kind = str(body.get("agent_kind") or body.get("kind") or "").strip().lower()
        if not kind:
            return {"ok": False, "error": "agent_kind required",
                    "supported_kinds": sorted(_DEFAULT_KINDS.keys())}
        try:
            count = int(body.get("count") or 1)
        except (TypeError, ValueError):
            count = 1
        count = max(1, min(count, 32))
        params = body.get("params") or {}
        if not isinstance(params, dict):
            params = {}
        ts = int(time.time())
        ids: list[str] = []
        c = _db()
        try:
            for _ in range(count):
                aid = uuid.uuid4().hex[:16]
                c.execute(
                    "INSERT INTO agents(id, kind, status, queue_depth, "
                    "spawned_ts, last_heartbeat, params_json) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (aid, kind, "declared", 0, ts, ts, json.dumps(params)[:10_000]),
                )
                ids.append(aid)
            c.commit()
        finally:
            c.close()
        return {
            "ok": True,
            "agent_ids": ids,
            "kind": kind,
            "count": len(ids),
            "status": "declared",
            "schema_version": "2026.1",
            "source": "live",
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}


@router.get("/agents")
async def list_agents(
    kind: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            sql = (
                "SELECT id, kind, status, queue_depth, spawned_ts, "
                "last_heartbeat, error FROM agents"
            )
            args: list[Any] = []
            clauses: list[str] = []
            if kind:
                clauses.append("kind = ?")
                args.append(kind.lower())
            if status and status in _VALID_STATUS:
                clauses.append("status = ?")
                args.append(status)
            if clauses:
                sql += " WHERE " + " AND ".join(clauses)
            sql += " ORDER BY spawned_ts DESC LIMIT ?"
            args.append(limit)
            rows = c.execute(sql, args).fetchall()
            items = [
                {
                    "agent_id": r[0],
                    "kind": r[1],
                    "status": r[2],
                    "queue_depth": r[3],
                    "spawned_ts": r[4],
                    "last_heartbeat": r[5],
                    "error": r[6],
                }
                for r in rows
            ]
            if not items:
                items = [
                    {
                        "agent_id": "demo0000000kind",
                        "kind": k,
                        "status": "declared",
                        "queue_depth": 0,
                        "spawned_ts": 0,
                        "last_heartbeat": 0,
                        "error": None,
                        "description": desc,
                    }
                    for k, desc in _DEFAULT_KINDS.items()
                ]
                source = "default-schema"
            else:
                source = "live"
            return {
                "ok": True,
                "items": items,
                "count": len(items),
                "supported_kinds": sorted(_DEFAULT_KINDS.keys()),
                "schema_version": "2026.1",
                "source": source,
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "items": [], "source": "default-schema"}


@router.post("/kill")
async def kill_agent(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        aid = str(body.get("agent_id") or "").strip()
        if not aid:
            return {"ok": False, "error": "agent_id required"}
        c = _db()
        try:
            cur = c.execute(
                "UPDATE agents SET status='stopped' WHERE id=?", (aid,)
            )
            c.commit()
            return {
                "ok": True,
                "agent_id": aid,
                "status": "stopped",
                "rows_changed": cur.rowcount,
                "source": "live",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}


@router.post("/heartbeat")
async def heartbeat(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        aid = str(body.get("agent_id") or "").strip()
        if not aid:
            return {"ok": False, "error": "agent_id required"}
        status = str(body.get("status") or "running").strip().lower()
        if status not in _VALID_STATUS:
            status = "running"
        try:
            qd = int(body.get("queue_depth") or 0)
        except (TypeError, ValueError):
            qd = 0
        c = _db()
        try:
            cur = c.execute(
                "UPDATE agents SET status=?, queue_depth=?, last_heartbeat=? "
                "WHERE id=?",
                (status, qd, int(time.time()), aid),
            )
            c.commit()
            return {
                "ok": True,
                "agent_id": aid,
                "status": status,
                "queue_depth": qd,
                "rows_changed": cur.rowcount,
                "source": "live",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "default-schema"}
