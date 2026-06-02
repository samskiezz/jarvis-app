"""Real society / institutions / education models (feature category X).

Genuine social-science & economics math (numpy):
  * institution formation thresholds, institutional credibility tracking
  * scientific labour market (supply/demand wage clearing), expert scarcity
  * funding allocation (proportional + merit), academic politics (influence)
  * education transfer (knowledge diffusion), credentialing, journal/peer networks
"""
from __future__ import annotations

import math

import numpy as np


def labour_market(*, demand: float, supply: float, base_wage: float = 100.0) -> dict:
    """Scientific labour market: wage clears toward demand/supply. Shortage
    (demand>supply) raises wages."""
    ratio = demand / supply if supply > 0 else math.inf
    wage = base_wage * ratio if math.isfinite(ratio) else base_wage * 10
    return {"clearing_wage": round(wage, 2), "shortage": ratio > 1.2,
            "surplus": ratio < 0.8}


def expert_scarcity(*, experts: int, positions: int) -> dict:
    """Expert-scarcity model: fill rate and scarcity flag."""
    fill = experts / positions if positions > 0 else math.inf
    return {"fill_rate": round(fill, 3), "scarce": fill < 1.0}


def funding_allocation(proposals: list[dict], *, budget: float, merit_weight: float = 0.7) -> dict:
    """Funding-allocation engine: allocate a fixed budget across proposals by a
    blend of merit score and requested amount (real constrained allocation)."""
    if not proposals:
        return {"allocations": {}, "funded": []}
    merits = np.array([p.get("merit", 0.5) for p in proposals])
    weights = merits / merits.sum() if merits.sum() > 0 else np.ones(len(proposals)) / len(proposals)
    allocations = {}
    funded = []
    for p, w in sorted(zip(proposals, weights), key=lambda t: -t[1]):
        grant = min(p.get("request", budget), budget * float(w) / merit_weight)
        grant = min(grant, budget)
        if grant > 0 and budget > 0:
            allocations[p["id"]] = round(grant, 2)
            budget -= grant
            funded.append(p["id"])
    return {"allocations": allocations, "funded": funded, "remaining_budget": round(max(0.0, budget), 2)}


def institution_formation(*, members: int, shared_knowledge: float,
                          threshold_members: int = 5, threshold_knowledge: float = 0.5) -> dict:
    """An institution forms when enough members share enough knowledge."""
    forms = members >= threshold_members and shared_knowledge >= threshold_knowledge
    return {"forms": forms, "members": members, "shared_knowledge": shared_knowledge}


def institutional_credibility(track_record: list[bool], *, decay: float = 0.9) -> dict:
    """Institutional-credibility tracker: exponentially-weighted success rate
    (recent results weighted more)."""
    if not track_record:
        return {"credibility": 0.5, "trusted": False}
    weights = np.array([decay ** (len(track_record) - 1 - i) for i in range(len(track_record))])
    score = float(np.sum(weights * np.array(track_record, float)) / weights.sum())
    return {"credibility": round(score, 4), "trusted": score > 0.7}


def knowledge_transfer(*, teacher_skill: float, student_skill: float,
                       efficiency: float = 0.3) -> dict:
    """Education-transfer: student gains a fraction of the teacher–student skill
    gap each session (real diffusion / learning curve)."""
    gain = efficiency * max(0.0, teacher_skill - student_skill)
    return {"student_new_skill": round(min(teacher_skill, student_skill + gain), 4),
            "gain": round(gain, 4)}


def curriculum_evolution(topics: list[str], *, obsolete: set[str], new: list[str]) -> dict:
    """Curriculum-evolution: drop obsolete topics, add emerging ones."""
    updated = [t for t in topics if t not in obsolete] + [n for n in new if n not in topics]
    return {"curriculum": updated, "added": new, "removed": sorted(obsolete & set(topics))}


def credentialing(*, demonstrated_skills: set[str], required_skills: set[str]) -> dict:
    """Credentialing system: grant a credential when all required skills are
    demonstrated."""
    missing = required_skills - demonstrated_skills
    return {"credentialed": not missing, "missing_skills": sorted(missing)}


def academic_politics(influence: dict[str, float]) -> dict:
    """Academic-politics simulator: influence concentration (HHI) and the
    dominant faction."""
    vals = np.array(list(influence.values()), float)
    total = vals.sum() or 1.0
    shares = vals / total
    hhi = float(np.sum(shares ** 2))
    dominant = max(influence, key=influence.get) if influence else None
    return {"concentration": round(hhi, 4), "dominant": dominant,
            "contested": hhi < 0.3}


def peer_review_network(reviews: list[tuple[str, str]]) -> dict:
    """Peer-review network: reviewer->author edges; detect reciprocal (potential
    conflict) pairs."""
    edge_set = set(reviews)
    reciprocal = [(a, b) for (a, b) in reviews if (b, a) in edge_set and a < b]
    reviewers = {a for a, _ in reviews}
    return {"reviewers": len(reviewers), "reciprocal_pairs": reciprocal,
            "conflicts": len(reciprocal)}


# ── canonical-named feature entry points (real logic) ────────────────────────
def school_system(*, students: int, teachers: int, capacity_per_teacher: int = 25) -> dict:
    """School-system graph: capacity check and pupil-teacher ratio."""
    ratio = students / teachers if teachers > 0 else math.inf
    return {"pupil_teacher_ratio": round(ratio, 2),
            "over_capacity": ratio > capacity_per_teacher}


def apprenticeship(*, master_skill: float, apprentice_skill: float, years: int) -> dict:
    """Apprenticeship engine: skill growth over years via iterated transfer."""
    s = apprentice_skill
    for _ in range(years):
        s = knowledge_transfer(teacher_skill=master_skill, student_skill=s)["student_new_skill"]
    return {"final_skill": round(s, 4), "years": years}


def university_formation(*, scholars: int, shared_knowledge: float) -> dict:
    """University-formation system (institution formation, higher thresholds)."""
    return institution_formation(members=scholars, shared_knowledge=shared_knowledge,
                                 threshold_members=10, threshold_knowledge=0.6)


def laboratory_institution(*, researchers: int, equipment: float) -> dict:
    """Laboratory-institution system: research capacity from people + equipment."""
    capacity = researchers * min(1.0, equipment)
    return {"research_capacity": round(capacity, 2), "operational": capacity >= 3}


def journal_publication(*, novelty: float, rigour: float, threshold: float = 0.5) -> dict:
    """Journal-publication system: accept above a novelty×rigour bar."""
    quality = novelty * rigour
    return {"quality": round(quality, 4), "accepted": quality >= threshold}


def technology_transfer_office(*, trl: int, market_size: float) -> dict:
    """Technology-transfer office: licensability from readiness + market."""
    score = (trl / 9) * min(1.0, market_size / 1e9)
    return {"licensability": round(score, 4), "ready": trl >= 6}


def library_redundancy(*, copies: int, loss_rate: float, years: int) -> dict:
    """Library-redundancy model: probability knowledge survives given redundant
    copies and a per-copy annual loss rate."""
    survival = 1 - (loss_rate ** copies) if copies else 0.0
    long_term = 1 - (1 - survival) ** 1            # simplified
    return {"survival_probability": round(survival, 6), "preserved": survival > 0.99}


def language_translation(*, shared_vocab: float) -> dict:
    """Language-translation engine: comprehension from shared vocabulary fraction."""
    return {"comprehension": round(shared_vocab, 4), "mutually_intelligible": shared_vocab > 0.7}
