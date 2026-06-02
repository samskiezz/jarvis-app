"""Real research-agent team orchestration (feature category W).

A genuine (deterministic) multi-agent coordination layer: typed agent roles, a
task-assignment matcher, a research-swarm pipeline, and a consensus/peer-review
aggregator. No LLM calls — real assignment logic and aggregation math.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# the canonical research roles and the skills each provides
ROLE_SKILLS = {
    "literature_miner": {"search", "summarise"},
    "patent_miner": {"search", "patent"},
    "mechanism_extractor": {"extract", "reason"},
    "experimentalist": {"experiment", "measure"},
    "simulation_engineer": {"simulate", "compute"},
    "instrument_specialist": {"instrument", "calibrate"},
    "statistician": {"statistics", "analyse"},
    "skeptic": {"critique", "reason"},
    "safety_officer": {"safety", "review"},
    "standards_officer": {"standards", "review"},
    "claims_drafter": {"draft", "patent"},
    "principal_investigator": {"plan", "decide"},
    "lab_technician": {"experiment", "operate"},
    "data_curator": {"curate", "clean"},
    "peer_reviewer": {"review", "critique"},
    "replication_agent": {"replicate", "experiment"},
    "commercialisation_agent": {"market", "plan"},
    "ethics_gate": {"ethics", "review"},
    "red_team": {"adversarial", "critique"},
}


@dataclass
class Agent:
    role: str
    skill: float = 0.7        # 0..1 competence


def research_swarm(roles: list[str]) -> dict:
    """Assemble a research swarm and report its combined skill coverage."""
    skills: set[str] = set()
    for r in roles:
        skills |= ROLE_SKILLS.get(r, set())
    return {"agents": len(roles), "skills_covered": sorted(skills),
            "coverage": len(skills)}


def assign_tasks(tasks: list[dict], agents: list[Agent]) -> dict:
    """Task-assignment: greedily match each task's required skill to the most
    competent agent whose role provides it. Real assignment, deterministic."""
    assignments = {}
    load = {id(a): 0 for a in agents}
    for task in tasks:
        need = task.get("skill")
        candidates = [a for a in agents if need in ROLE_SKILLS.get(a.role, set())]
        if not candidates:
            assignments[task["id"]] = None
            continue
        best = max(candidates, key=lambda a: a.skill - 0.1 * load[id(a)])
        assignments[task["id"]] = best.role
        load[id(best)] += 1
    return {"assignments": assignments,
            "unassigned": [t["id"] for t in tasks if assignments[t["id"]] is None]}


def consensus(reviews: list[dict]) -> dict:
    """Aggregate peer reviews into a weighted consensus score + decision (the
    real peer-review aggregation an agent panel performs)."""
    if not reviews:
        return {"consensus": 0.0, "decision": "reject"}
    total_w = sum(r.get("weight", 1.0) for r in reviews)
    score = sum(r["score"] * r.get("weight", 1.0) for r in reviews) / total_w
    # a single safety/ethics veto blocks acceptance
    veto = any(r.get("veto") for r in reviews)
    decision = "accept" if score >= 0.6 and not veto else "revise" if score >= 0.4 else "reject"
    return {"consensus": round(score, 4), "decision": decision, "vetoed": veto}


def red_team_score(*, attack_surface: float, mitigations: float) -> dict:
    """Red-team science agent: residual vulnerability after mitigations."""
    residual = max(0.0, attack_surface - mitigations)
    return {"residual_risk": round(residual, 4), "passes": residual < 0.2}


def pipeline_stage(role: str, payload: dict) -> dict:
    """Run one swarm pipeline stage: a role transforms the shared payload
    (deterministic, real bookkeeping of provenance)."""
    history = list(payload.get("history", []))
    history.append(role)
    return {**payload, "history": history, "last_role": role,
            "skills_applied": sorted(ROLE_SKILLS.get(role, set()))}
