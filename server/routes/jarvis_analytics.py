"""JARVIS ANALYTICS — computed graph metrics, risk signals, and predictive insights.

Billion-dollar data architecture: every object carries computed centrality,
PageRank, community, and connectivity scores. Every page gets an influence
score derived from its topic graph."""

from __future__ import annotations

import json
import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Depends

from ..auth import optional_bearer

router = APIRouter(prefix="/v1/jarvis/analytics", tags=["jarvis-analytics"])

_BRAIN_DB = "server/data/brain.db"


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_BRAIN_DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


@router.get("/object/{obj_id}")
async def object_analytics(obj_id: str, _t: str | None = Depends(optional_bearer)):
    """Computed scores for a single object: centrality, pagerank, community,
    connectivity, plus live neighbors and risk context."""
    c = _conn()
    try:
        row = c.execute(
            "SELECT id, type, props, state, created_ts, updated_ts FROM ont_object WHERE id=?",
            (obj_id,)
        ).fetchone()
        if not row:
            return {"error": "not found", "id": obj_id}

        try:
            props = json.loads(row["props"] or "{}")
        except Exception:
            props = {}

        computed = props.get("_computed", {})

        # Neighbors
        neighbors = []
        for r in c.execute(
            "SELECT from_id, to_id, type as relation, 1.0 as strength FROM ont_link WHERE from_id=? OR to_id=? LIMIT 20",
            (obj_id, obj_id)
        ).fetchall():
            nid = r["to_id"] if r["from_id"] == obj_id else r["from_id"]
            nr = c.execute("SELECT props, type FROM ont_object WHERE id=?", (nid,)).fetchone()
            nlabel = nid
            if nr:
                try:
                    np = json.loads(nr["props"] or "{}")
                    nlabel = np.get("label") or np.get("topic_name") or np.get("title") or nid
                except Exception:
                    pass
            neighbors.append({
                "id": nid,
                "label": nlabel,
                "type": nr["type"] if nr else "unknown",
                "relation": r["relation"],
                "strength": float(r["strength"] or 1),
            })

        # Recent measurements linked to this object
        measurements = []
        for r in c.execute(
            "SELECT o.id, o.props, o.updated_ts FROM ont_object o JOIN ont_link l ON (o.id=l.from_id OR o.id=l.to_id) "
            "WHERE (l.from_id=? OR l.to_id=?) AND o.type='Measurement' AND o.state='live' ORDER BY o.updated_ts DESC LIMIT 10",
            (obj_id, obj_id)
        ).fetchall():
            try:
                mp = json.loads(r["props"] or "{}")
            except Exception:
                mp = {}
            measurements.append({"id": r["id"], "metric": mp.get("metric"), "value": mp.get("value"), "updated_ts": r["updated_ts"]})

        return {
            "id": obj_id,
            "type": row["type"],
            "label": props.get("label") or props.get("topic_name") or props.get("title") or obj_id,
            "computed": {
                "centrality": computed.get("centrality", 0),
                "pagerank": computed.get("pagerank", 0),
                "community": computed.get("community", 0),
                "connectivity": computed.get("connectivity", 0),
                "computed_at": computed.get("computed_at"),
            },
            "neighbors": neighbors,
            "measurements": measurements,
        }
    finally:
        c.close()


@router.get("/page/{page_name}")
async def page_analytics(page_name: str, _t: str | None = Depends(optional_bearer)):
    """Advanced analytics for a page: influence score, topic centrality,
    trending measurements, and risk summary."""
    from ..services import topic_engine as te

    c = _conn()
    try:
        topics = te.topics_for_page(page_name)
        topic_ids = {f"topic_{t['ID']}" for t in topics}

        # Aggregate computed scores across page topics
        scores = {"centrality": 0.0, "pagerank": 0.0, "connectivity": 0}
        count = 0
        communities = set()

        if topic_ids:
            placeholders = ",".join("?" * len(topic_ids))
            for r in c.execute(
                f"SELECT props FROM ont_object WHERE id IN ({placeholders})",
                tuple(topic_ids)
            ).fetchall():
                try:
                    p = json.loads(r["props"] or "{}")
                    comp = p.get("_computed", {})
                    scores["centrality"] += comp.get("centrality", 0)
                    scores["pagerank"] += comp.get("pagerank", 0)
                    scores["connectivity"] += comp.get("connectivity", 0)
                    communities.add(comp.get("community", 0))
                    count += 1
                except Exception:
                    pass

        if count:
            scores["centrality"] = round(scores["centrality"] / count, 6)
            scores["pagerank"] = round(scores["pagerank"] / count, 6)
            scores["connectivity"] = round(scores["connectivity"] / count, 1)

        # Trending: measurements whose value changed most recently
        trending = []
        if topic_ids:
            placeholders = ",".join("?" * len(topic_ids))
            for r in c.execute(
                f"SELECT o.id, o.props, o.updated_ts FROM ont_object o JOIN ont_link l ON (o.id=l.from_id OR o.id=l.to_id) "
                f"WHERE (l.from_id IN ({placeholders}) OR l.to_id IN ({placeholders})) AND o.type='Measurement' AND o.state='live' "
                "ORDER BY o.updated_ts DESC LIMIT 10",
                tuple(topic_ids) * 2
            ).fetchall():
                try:
                    mp = json.loads(r["props"] or "{}")
                except Exception:
                    mp = {}
                trending.append({
                    "id": r["id"],
                    "metric": mp.get("metric"),
                    "value": mp.get("value"),
                    "unit": mp.get("unit"),
                    "city_id": mp.get("city_id"),
                    "updated_ts": r["updated_ts"],
                })

        # Risk signals linked to page topics
        risks = []
        if topic_ids:
            placeholders = ",".join("?" * len(topic_ids))
            for r in c.execute(
                f"SELECT o.id, o.props FROM ont_object o JOIN ont_link l ON (o.id=l.from_id OR o.id=l.to_id) "
                f"WHERE (l.from_id IN ({placeholders}) OR l.to_id IN ({placeholders})) AND o.type='Event' AND o.state='live' "
                "ORDER BY o.updated_ts DESC LIMIT 5",
                tuple(topic_ids) * 2
            ).fetchall():
                try:
                    ep = json.loads(r["props"] or "{}")
                except Exception:
                    ep = {}
                risks.append({
                    "id": r["id"],
                    "label": ep.get("label") or ep.get("title") or r["id"],
                    "severity": ep.get("severity", "medium"),
                })

        return {
            "page": page_name,
            "mapped_topics": len(topics),
            "influence": scores,
            "communities": len(communities),
            "trending_measurements": trending,
            "risk_signals": risks,
        }
    finally:
        c.close()


@router.get("/top-objects")
async def top_objects(kind: str = "pagerank", limit: int = 20, _t: str | None = Depends(optional_bearer)):
    """Top objects by computed score (pagerank | centrality | connectivity)."""
    c = _conn()
    try:
        rows = c.execute(
            "SELECT id, type, props, updated_ts FROM ont_object WHERE type != 'Measurement' LIMIT 5000"
        ).fetchall()
        scored = []
        for r in rows:
            try:
                p = json.loads(r["props"] or "{}")
                comp = p.get("_computed", {})
                score = comp.get(kind, 0)
            except Exception:
                score = 0
            if score > 0:
                scored.append((score, r))
        scored.sort(key=lambda x: -x[0])
        out = []
        for score, r in scored[:limit]:
            try:
                p = json.loads(r["props"] or "{}")
            except Exception:
                p = {}
            out.append({
                "id": r["id"],
                "type": r["type"],
                "label": p.get("label") or p.get("topic_name") or p.get("title") or r["id"],
                "score": score,
                "updated_ts": r["updated_ts"],
            })
        return {"kind": kind, "count": len(out), "results": out}
    finally:
        c.close()


@router.get("/forecast/{metric}")
async def forecast_metric(metric: str, horizon: int = 24, _t: str | None = Depends(optional_bearer)):
    """Simple linear regression forecast for a measurement metric.
    Returns trend, forecast values, and anomaly flag."""
    c = _conn()
    try:
        rows = c.execute(
            "SELECT props, updated_ts FROM ont_object WHERE type='Measurement' AND state='live' AND json_extract(props,'$.metric')=? ORDER BY updated_ts DESC LIMIT 500",
            (metric,)
        ).fetchall()
        if len(rows) < 10:
            return {"metric": metric, "error": "insufficient data", "n": len(rows)}

        points = []
        for r in rows:
            try:
                p = json.loads(r["props"] or "{}")
                v = float(p.get("value", 0))
                ts = r["updated_ts"]
                points.append((ts, v))
            except Exception:
                pass

        if len(points) < 10:
            return {"metric": metric, "error": "insufficient numeric data", "n": len(points)}

        points.sort(key=lambda x: x[0])
        n = len(points)
        x_vals = list(range(n))
        y_vals = [p[1] for p in points]

        # Linear regression
        x_mean = sum(x_vals) / n
        y_mean = sum(y_vals) / n
        ss_xy = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
        ss_xx = sum((x - x_mean) ** 2 for x in x_vals)
        slope = ss_xy / ss_xx if ss_xx != 0 else 0
        intercept = y_mean - slope * x_mean

        # Residual std
        residuals = [y - (intercept + slope * x) for x, y in zip(x_vals, y_vals)]
        mse = sum(r ** 2 for r in residuals) / n
        rmse = mse ** 0.5

        # Forecast
        last_x = x_vals[-1]
        forecasts = []
        for i in range(1, horizon + 1):
            fx = last_x + i
            fv = intercept + slope * fx
            forecasts.append({"step": i, "value": round(fv, 4)})

        # Latest anomaly
        latest_y = y_vals[-1]
        predicted = intercept + slope * last_x
        anomaly = abs(latest_y - predicted) > 2 * rmse if rmse > 0 else False

        return {
            "metric": metric,
            "n": n,
            "trend": "up" if slope > 0 else "down" if slope < 0 else "flat",
            "slope": round(slope, 6),
            "latest": round(latest_y, 4),
            "predicted": round(predicted, 4),
            "rmse": round(rmse, 4),
            "anomaly": anomaly,
            "forecast": forecasts[:10],
        }
    finally:
        c.close()


@router.get("/anomalies")
async def anomalies(limit: int = 20, _t: str | None = Depends(optional_bearer)):
    """Detect anomalous measurements across all metrics."""
    c = _conn()
    try:
        # Group latest measurements by metric
        rows = c.execute(
            "SELECT id, props, updated_ts FROM ont_object WHERE type='Measurement' AND state='live' ORDER BY updated_ts DESC LIMIT 2000"
        ).fetchall()
        by_metric: dict[str, list[tuple[float, int]]] = {}
        for r in rows:
            try:
                p = json.loads(r["props"] or "{}")
                m = p.get("metric")
                v = float(p.get("value", 0))
                if m:
                    by_metric.setdefault(m, []).append((v, r["updated_ts"]))
            except Exception:
                pass

        results = []
        for metric, vals in by_metric.items():
            if len(vals) < 10:
                continue
            values = [v for v, _ in vals]
            n = len(values)
            mean = sum(values) / n
            var = sum((v - mean) ** 2 for v in values) / n
            std = var ** 0.5
            latest = values[0]
            zscore = (latest - mean) / std if std > 0 else 0
            if abs(zscore) > 2.0:
                results.append({
                    "metric": metric,
                    "latest": round(latest, 4),
                    "mean": round(mean, 4),
                    "std": round(std, 4),
                    "zscore": round(zscore, 4),
                    "severity": "high" if abs(zscore) > 3 else "medium",
                })

        results.sort(key=lambda x: -abs(x["zscore"]))
        return {"count": len(results), "anomalies": results[:limit]}
    finally:
        c.close()
