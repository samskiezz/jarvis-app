"""JARVIS SIM — simulation & decision intelligence over the operational ontology.

Converts ontology state into recommended / simulated action, without committing:

  * WHAT-IF      — predict the result of applying an action to an object (the
                   lifecycle transition + which neighbours are impacted) WITHOUT
                   mutating anything.
  * RISK PROPAGATION — flood risk from a seed object across links with decay, to
                   estimate downstream blast radius (dependency simulation).
  * MONTE CARLO  — probabilistic outcome estimate for an action's success rate.
  * RECOMMEND    — rank the actions currently legal on an object by a benefit/risk
                   heuristic (the decision engine surfacing ranked options).

stdlib only, never raises. Reads the ontology; never writes (pure simulation).
"""

from __future__ import annotations

import random
import sqlite3

from . import jarvis_os as jos

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "jarvis_os.db")

_RISKW = {"low": 0.2, "medium": 0.5, "high": 0.9}


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _action_types_for(object_type: str) -> list[dict]:
    try:
        c = _conn()
        try:
            rows = c.execute("SELECT * FROM ont_action_type WHERE object_type=?", (object_type,)).fetchall()
        finally:
            c.close()
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []


def whatif(object_id: str, action_name: str) -> dict:
    """Predict applying ``action_name`` to ``object_id`` WITHOUT committing."""
    if ont is None:
        return {"status": "ontology_unavailable"}
    obj = ont.get_object(object_id)
    if not obj:
        return {"status": "not_found", "object": object_id}
    ats = {a["name"]: a for a in _action_types_for(obj["type"])}
    at = ats.get(action_name)
    if not at:
        return {"status": "unknown_action", "action": action_name}
    legal = obj["state"] == at["from_state"]
    nb = ont.neighbors(object_id)
    impacted = [e["to"] for e in nb.get("out", [])] + [e["from"] for e in nb.get("in", [])]
    return {"status": "simulated", "object": object_id, "action": action_name,
            "legal": legal, "current_state": obj["state"],
            "predicted_state": at["to_state"] if legal else obj["state"],
            "requires_approval": at["risk"] != "low",
            "impacted_objects": impacted, "impact_count": len(impacted)}


def propagate_risk(seed_id: str, *, decay: float = 0.5, max_depth: int = 3,
                   seed_risk: float = 1.0) -> dict:
    """Flood risk from a seed object across links with per-hop decay."""
    if ont is None:
        return {"status": "ontology_unavailable"}
    risk: dict[str, float] = {seed_id: seed_risk}
    frontier = [(seed_id, seed_risk, 0)]
    while frontier:
        oid, r, d = frontier.pop()
        if d >= max_depth:
            continue
        nb = ont.neighbors(oid)
        for e in nb.get("out", []) + nb.get("in", []):
            nxt = e.get("to") or e.get("from")
            if not nxt:
                continue
            nr = round(r * decay, 4)
            if nr > risk.get(nxt, 0):
                risk[nxt] = nr
                frontier.append((nxt, nr, d + 1))
    ranked = sorted(({"object": k, "risk": v} for k, v in risk.items() if k != seed_id),
                    key=lambda x: x["risk"], reverse=True)
    jos.audit("sim.propagate_risk", target=seed_id, meta={"reached": len(ranked)})
    return {"status": "ok", "seed": seed_id, "reached": len(ranked), "exposure": ranked}


def monte_carlo(p_success: float, *, trials: int = 1000, seed: int | None = None) -> dict:
    """Estimate an action's outcome distribution over ``trials`` Bernoulli draws."""
    rng = random.Random(seed)
    p = max(0.0, min(1.0, float(p_success)))
    trials = max(1, min(100000, int(trials)))
    wins = sum(1 for _ in range(trials) if rng.random() < p)
    rate = wins / trials
    # Wald 95% CI
    half = round(1.96 * ((rate * (1 - rate) / trials) ** 0.5), 4)
    return {"trials": trials, "p_input": p, "success_rate": round(rate, 4),
            "ci95": [round(max(0, rate - half), 4), round(min(1, rate + half), 4)]}


def recommend(object_id: str) -> dict:
    """Rank the actions currently legal on an object by benefit/risk heuristic."""
    if ont is None:
        return {"status": "ontology_unavailable"}
    obj = ont.get_object(object_id)
    if not obj:
        return {"status": "not_found", "object": object_id}
    nb = ont.neighbors(object_id)
    blast = len(nb.get("out", [])) + len(nb.get("in", []))
    recs = []
    for at in _action_types_for(obj["type"]):
        legal = obj["state"] == at["from_state"]
        if not legal:
            continue
        risk = _RISKW.get(at["risk"], 0.5)
        # benefit heuristic: progressing lifecycle is good; score penalised by risk*blast
        score = round((1.0 - risk) - 0.05 * risk * blast, 4)
        recs.append({"action": at["name"], "to_state": at["to_state"], "risk": at["risk"],
                     "requires_approval": at["risk"] != "low", "score": score})
    recs.sort(key=lambda r: r["score"], reverse=True)
    jos.audit("sim.recommend", target=object_id, meta={"options": len(recs)})
    return {"status": "ok", "object": object_id, "state": obj["state"],
            "blast_radius": blast, "recommendations": recs}
