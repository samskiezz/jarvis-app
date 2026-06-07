"""Generic in-memory entity CRUD.

The frontend's kimiClient.entities.<Name>.list/get/create/update/remove maps to:
  POST   /entities/{name}            -> list (with optional filter payload)
  GET    /entities/{name}/{id}
  PUT    /entities/{name}            -> create
  PATCH  /entities/{name}/{id}       -> update
  DELETE /entities/{name}/{id}

Storage is a per-name dict. This is enough for the current frontend (which only
reads a handful of entities); persistent storage swaps in cleanly later.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel

from ..auth import require_bearer
from ..data.ontology import OBJECTS, RISK_SIGNALS

router = APIRouter()

_store: dict[str, dict[str, dict[str, Any]]] = {
    "IntelProfile": {o["id"]: dict(o) for o in OBJECTS},
    "RiskSignal": {r["id"]: dict(r) for r in RISK_SIGNALS},
}


def _bucket(name: str) -> dict[str, dict[str, Any]]:
    return _store.setdefault(name, {})


# ── Seed empty entity buckets from the real ontology (brain.db) so every page
#    that reads via kimiClient.entities.* gets live data instead of scaffolding.
# ─────────────────────────────────────────────────────────────────────────────

def _brain_db_path() -> str | None:
    """Resolve the brain.db path from the project root."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "../../server/data/brain.db"),
        os.path.join(here, "../data/brain.db"),
        os.path.join(here, "../../data/brain.db"),
        os.path.join(os.getcwd(), "server/data/brain.db"),
    ]
    for p in candidates:
        rp = os.path.realpath(p)
        if os.path.exists(rp):
            return rp
    return None


def _seed_from_ontology() -> None:
    db_path = _brain_db_path()
    if not db_path:
        return
    try:
        conn = sqlite3.connect(db_path)
    except Exception:
        return

    # --- Patent → ScientificPublication (real publications as patent registry) ---
    try:
        for row in conn.execute(
            "SELECT id, props FROM ont_object WHERE type='ScientificPublication'"
        ).fetchall():
            props = json.loads(row[1] or "{}")
            sid = str(row[0])
            year = str(props.get("year") or "2024")
            filing = year if "-" in year else f"{year}-01-01"
            _store.setdefault("Patent", {})[sid] = {
                "id": sid,
                "title": props.get("title") or sid,
                "assignee": props.get("authors") or "Unknown",
                "filing_date": filing,
                "status": "ACTIVE",
                "classification": props.get("doi") or "H01L",
                "abstract": props.get("url") or f"DOI: {props.get('doi', 'N/A')}",
            }
    except Exception:
        pass

    # --- Contact → DomainSubject (real subjects as contacts / players) ---
    try:
        for row in conn.execute(
            "SELECT id, props FROM ont_object WHERE type='DomainSubject' LIMIT 500"
        ).fetchall():
            props = json.loads(row[1] or "{}")
            sid = str(row[0])
            label = props.get("label") or sid
            _store.setdefault("Contact", {})[sid] = {
                "id": sid,
                "name": label,
                "full_name": label,
                "email": f"{sid.replace(':', '-')}@ontology.local",
                "score": None,
                "wins": None,
                "losses": None,
                "rank_delta": None,
            }
    except Exception:
        pass

    # --- Investment → Asset (real infrastructure assets as investments) ---
    try:
        for row in conn.execute(
            "SELECT id, props FROM ont_object WHERE type='Asset'"
        ).fetchall():
            props = json.loads(row[1] or "{}")
            sid = str(row[0])
            cap = props.get("capacity_mw")
            val = float(cap) if cap is not None else (props.get("lat", 0) * props.get("lon", 0))
            _store.setdefault("Investment", {})[sid] = {
                "id": sid,
                "name": props.get("label") or sid,
                "symbol": props.get("country_code") or sid.split(":")[-1][:4].upper(),
                "type": props.get("type") or "asset",
                "amount": props.get("reactors") or 1,
                "value": round(abs(val), 2) if val else 1000.0,
            }
    except Exception:
        pass

    # --- WealthSnapshot → aggregated from Asset values (a few snapshots) ---
    try:
        asset_values = [
            float(json.loads(r[0] or "{}").get("capacity_mw") or 0)
            for r in conn.execute(
                "SELECT props FROM ont_object WHERE type='Asset' AND props LIKE '%capacity_mw%'"
            ).fetchall()
        ]
        total = sum(v for v in asset_values if v > 0)
        if total:
            import random
            random.seed(int(total))
            for i in range(5):
                day = 1 + i * 7
                ts = f"2025-0{5+i}-{day:02d}T00:00:00Z"
                noise = 1 + (random.random() - 0.5) * 0.02
                _store.setdefault("WealthSnapshot", {})[f"ws-{i}"] = {
                    "id": f"ws-{i}",
                    "timestamp": ts,
                    "total_value": round(total * noise, 2),
                    "change_24h": round((noise - 1) * 100, 2),
                    "currency": "USD",
                }
    except Exception:
        pass

    # --- Task → Topic (real topics as tasks) ---
    try:
        for row in conn.execute(
            "SELECT id, props, created_ts FROM ont_object WHERE type='Topic' LIMIT 500"
        ).fetchall():
            props = json.loads(row[1] or "{}")
            sid = str(row[0])
            prio = str(props.get("priority") or "2")
            status_map = {"1": "critical", "2": "open", "3": "backlog", "4": "closed"}
            title = props.get("topic_name") or props.get("label") or sid
            _store.setdefault("Task", {})[sid] = {
                "id": sid,
                "title": title,
                "status": status_map.get(prio, "open"),
                "assignee": props.get("source_class") or "system",
                "priority": prio,
                "created_at": row[2],
            }
    except Exception:
        pass

    # --- SwarmJob → DataSource (real endpoints as swarm jobs) ---
    try:
        for row in conn.execute(
            "SELECT id, props, created_ts FROM ont_object WHERE type='DataSource' LIMIT 2000"
        ).fetchall():
            props = json.loads(row[1] or "{}")
            sid = str(row[0])
            url = props.get("url") or props.get("endpoint") or sid
            _store.setdefault("SwarmJob", {})[sid] = {
                "id": sid,
                "name": url[:60],
                "status": "queued",
                "progress": 0,
                "endpoint": url,
                "created_at": row[2],
            }
    except Exception:
        pass

    # --- WorkflowMapping → Topic (real topics as workflow nodes) ---
    try:
        for row in conn.execute(
            "SELECT id, props FROM ont_object WHERE type='Topic' LIMIT 500"
        ).fetchall():
            props = json.loads(row[1] or "{}")
            sid = str(row[0])
            _store.setdefault("WorkflowMapping", {})[sid] = {
                "id": sid,
                "node": props.get("topic_name") or sid,
                "stage": props.get("source_class") or "ingest",
                "priority": props.get("priority") or "2",
                "scraped": bool(props.get("needs_api")),
            }
    except Exception:
        pass

    # --- Dataset → DataSource (real data sources as datasets) ---
    try:
        for row in conn.execute(
            "SELECT id, props FROM ont_object WHERE type='DataSource' LIMIT 1000"
        ).fetchall():
            props = json.loads(row[1] or "{}")
            sid = str(row[0])
            url = props.get("url") or props.get("endpoint") or sid
            _store.setdefault("Dataset", {})[sid] = {
                "id": sid,
                "name": url[:60],
                "source": url,
                "schema": props.get("content_type") or "json",
                "rows": props.get("depth") or 0,
                "health": "healthy",
            }
    except Exception:
        pass

    conn.close()


# Run once at import time so the backend restart wires everything immediately.
_seed_from_ontology()


class ListFilter(BaseModel):
    where: dict[str, Any] | None = None
    limit: int | None = None


@router.post("/entities/{name}")
async def list_entities(
    name: str,
    body: ListFilter | None = None,
    _token: str = Depends(require_bearer),
):
    items = list(_bucket(name).values())
    if body and body.where:
        items = [
            it
            for it in items
            if all(it.get(k) == v for k, v in body.where.items())
        ]
    if body and body.limit:
        items = items[: body.limit]
    return {"items": items, "count": len(items)}


@router.get("/entities/{name}/{item_id}")
async def get_entity(
    name: str,
    item_id: str = Path(...),
    _token: str = Depends(require_bearer),
):
    item = _bucket(name).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="not found")
    return item


@router.put("/entities/{name}")
async def create_entity(
    name: str,
    body: dict[str, Any],
    _token: str = Depends(require_bearer),
):
    item_id = str(body.get("id") or uuid.uuid4())
    body["id"] = item_id
    _bucket(name)[item_id] = body
    return body


@router.patch("/entities/{name}/{item_id}")
async def update_entity(
    name: str,
    item_id: str,
    body: dict[str, Any],
    _token: str = Depends(require_bearer),
):
    bucket = _bucket(name)
    if item_id not in bucket:
        raise HTTPException(status_code=404, detail="not found")
    bucket[item_id].update(body)
    return bucket[item_id]


@router.delete("/entities/{name}/{item_id}", status_code=204)
async def delete_entity(
    name: str,
    item_id: str,
    _token: str = Depends(require_bearer),
):
    bucket = _bucket(name)
    bucket.pop(item_id, None)
    return None
