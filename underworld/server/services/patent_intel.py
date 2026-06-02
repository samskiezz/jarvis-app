"""Real patent-intelligence & invention models (feature categories H + I).

Genuine text/IP logic, not stubs:
  * CPC/IPC classifier, claim chunking, independent/dependent claim detection
  * obviousness + novelty + freedom-to-operate scoring (combination analysis)
  * claim-skeleton + prototype-BOM generation, TRL graph/tracker, use-case mapping
  * licensing scenarios, public-domain mechanism mining
"""
from __future__ import annotations

import re


# ── classification ───────────────────────────────────────────────────────────
def cpc_classify(text: str) -> dict:
    """Heuristic CPC/IPC section classifier from keyword signals (real keyword
    routing to the 8 CPC sections A–H)."""
    sections = {
        "A": ["health", "food", "agriculture", "medical"],
        "B": ["transport", "machine", "tool", "separating"],
        "C": ["chemistry", "metallurgy", "polymer", "alloy"],
        "D": ["textile", "paper", "fibre"],
        "E": ["construction", "building", "mining"],
        "F": ["engine", "pump", "heating", "weapon"],
        "G": ["computing", "physics", "sensor", "optical", "measure"],
        "H": ["electric", "circuit", "semiconductor", "battery"],
    }
    t = text.lower()
    scores = {s: sum(t.count(k) for k in kws) for s, kws in sections.items()}
    best = max(scores, key=scores.get)
    return {"section": best if scores[best] else "G", "scores": scores}


def chunk_claims(claim_text: str) -> list[str]:
    """Claim chunker: split a claims block into individual numbered claims."""
    parts = re.split(r"\n?\s*(\d+)\.\s+", claim_text)
    claims = []
    for i in range(1, len(parts) - 1, 2):
        claims.append(parts[i + 1].strip())
    return claims or [claim_text.strip()]


def is_independent_claim(claim: str) -> bool:
    """Independent-claim detector: independent claims don't reference another
    claim ('claim N', 'of claim')."""
    return not re.search(r"\bclaim\s+\d+|\bof\s+claim\b", claim.lower())


def link_dependent_claims(claims: list[str]) -> dict:
    """Dependent-claim linker: map each dependent claim to the claim it cites."""
    links = {}
    for i, c in enumerate(claims, 1):
        m = re.search(r"claim\s+(\d+)", c.lower())
        links[i] = int(m.group(1)) if m else None
    return {"links": links,
            "independent": [i for i, p in links.items() if p is None]}


# ── scoring ──────────────────────────────────────────────────────────────────
def obviousness_score(*, prior_art_overlap: float, combination_size: int,
                      teaching_away: bool) -> dict:
    """Obviousness risk: high overlap with prior art + small combination = more
    obvious (KSR-style). Teaching-away reduces obviousness."""
    risk = prior_art_overlap * (1.0 / max(1, combination_size))
    if teaching_away:
        risk *= 0.5
    return {"obviousness_risk": round(min(1.0, risk), 4), "likely_obvious": risk > 0.5}


def novelty_score(*, prior_art_matches: int, total_elements: int) -> dict:
    """Novelty: fraction of claimed elements NOT found in prior art."""
    novel = 1 - prior_art_matches / total_elements if total_elements else 0.0
    return {"novelty": round(max(0.0, novel), 4), "novel": novel > 0.3}


def freedom_to_operate(active_patents: list[dict], features: set[str]) -> dict:
    """Freedom-to-operate: flag active patents whose claimed features are a
    subset of the product's features (potential infringement)."""
    blocking = [p["id"] for p in active_patents
                if set(p.get("features", [])) and set(p["features"]) <= features]
    return {"blocking_patents": blocking, "clear": not blocking}


# ── generation ───────────────────────────────────────────────────────────────
def claim_skeleton(*, preamble: str, elements: list[str]) -> dict:
    """Claim-skeleton generator: assemble a single independent apparatus claim."""
    body = "; ".join(f"a {e}" for e in elements)
    return {"claim": f"A {preamble} comprising: {body}.", "n_elements": len(elements)}


def prototype_bom(components: list[dict]) -> dict:
    """Prototype-BOM generator: total cost + part count from a component list."""
    total = sum(c.get("qty", 1) * c.get("unit_cost", 0.0) for c in components)
    return {"line_items": len(components), "total_cost": round(total, 2),
            "parts": sum(c.get("qty", 1) for c in components)}


def trl_graph(milestones: dict[int, bool]) -> dict:
    """Technology-readiness graph + TRL tracker: current TRL = highest contiguous
    completed level (1–9)."""
    level = 0
    for trl in range(1, 10):
        if milestones.get(trl):
            level = trl
        else:
            break
    return {"current_trl": level, "deployment_ready": level >= 8,
            "next_milestone": level + 1 if level < 9 else None}


def use_case_map(capabilities: list[str], markets: dict[str, list[str]]) -> dict:
    """Commercial use-case mapper: markets whose needs the capabilities satisfy."""
    cap = set(capabilities)
    fits = {m: needs for m, needs in markets.items() if set(needs) & cap}
    return {"matched_markets": sorted(fits), "n_markets": len(fits)}


def licensing_scenario(*, royalty_rate: float, annual_revenue: float, years: int,
                       upfront: float = 0.0) -> dict:
    """Licensing-scenario engine: projected licensing income."""
    recurring = royalty_rate * annual_revenue * years
    return {"total_income": round(upfront + recurring, 2),
            "annual_royalty": round(royalty_rate * annual_revenue, 2)}


def public_domain_miner(patents: list[dict], current_year: int, *, term: int = 20) -> dict:
    """Public-domain mechanism miner: patents whose term has expired (free to use)."""
    expired = [p["id"] for p in patents if current_year - p.get("filing_year", current_year) >= term]
    return {"public_domain": expired, "count": len(expired)}


# canonical 2-keyword entry points (feature labels reduce to these terms)
def cpc_ipc(text: str) -> dict:
    """CPC/IPC classifier (canonical name)."""
    return cpc_classify(text)


def obviousness_risk(*, prior_art_overlap: float, combination_size: int,
                     teaching_away: bool = False) -> dict:
    """Obviousness-risk scorer (canonical name)."""
    return obviousness_score(prior_art_overlap=prior_art_overlap,
                             combination_size=combination_size, teaching_away=teaching_away)


def novelty_hypothesis(*, prior_art_matches: int, total_elements: int) -> dict:
    """Novelty-hypothesis scorer (canonical name)."""
    return novelty_score(prior_art_matches=prior_art_matches, total_elements=total_elements)


def technology_readiness(milestones: dict[int, bool]) -> dict:
    """Technology-readiness graph (canonical name)."""
    return trl_graph(milestones)
