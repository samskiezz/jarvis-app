"""Real synthetic-biology / bioengineering models (feature category U).

Genuine bioengineering math (numpy), checkable:
  * CRISPR guide-RNA scoring + GC content, off-target Hamming risk
  * genetic-circuit logic (Hill-gated gates), synthetic promoter strength
  * Monod fermentation growth, bioreactor mass balance, codon optimisation
  * delivery-vehicle / vector scoring, containment & biosecurity risk
"""
from __future__ import annotations

import math

import numpy as np

_DNA = set("ACGT")


def gc_content(seq: str) -> float:
    s = seq.upper()
    return round((s.count("G") + s.count("C")) / len(s), 4) if s else 0.0


def guide_rna_score(guide: str) -> dict:
    """Guide-RNA quality: rewards ~40-60% GC and penalises homopolymer runs and
    a non-optimal length (20 nt). A real (simple) on-target heuristic."""
    s = guide.upper()
    gc = gc_content(s)
    gc_pen = abs(gc - 0.5) * 2
    runs = max((len(r) for r in _runs(s)), default=0)
    run_pen = max(0, runs - 4) * 0.1
    len_pen = abs(len(s) - 20) * 0.05
    score = max(0.0, 1.0 - gc_pen - run_pen - len_pen)
    return {"score": round(score, 4), "gc_content": gc, "length": len(s),
            "valid": set(s) <= _DNA}


def _runs(s: str) -> list[str]:
    out, cur = [], ""
    for ch in s:
        cur = cur + ch if (cur and cur[-1] == ch) else ch
        out.append(cur)
    return out


def off_target_risk(guide: str, genome_sites: list[str]) -> dict:
    """Off-target risk: count genome sites within a small mismatch (Hamming)
    distance of the guide."""
    g = guide.upper()
    hits = []
    for site in genome_sites:
        if len(site) == len(g):
            mm = sum(1 for a, b in zip(g, site.upper()) if a != b)
            if mm <= 3:
                hits.append(mm)
    return {"off_targets": len(hits), "min_mismatches": min(hits) if hits else None,
            "risky": bool(hits and min(hits) <= 2)}


def crispr_design(target: str, genome_sites: list[str] | None = None) -> dict:
    """CRISPR design module: guide score + off-target assessment."""
    score = guide_rna_score(target)
    off = off_target_risk(target, genome_sites or [])
    return {**score, **off, "recommended": score["score"] > 0.6 and not off["risky"]}


def genetic_circuit(inputs: dict[str, float], gate: str, *, k: float = 0.5) -> dict:
    """Genetic-circuit logic gate over Hill-activated inputs (AND/OR/NOT)."""
    from .bio_genetics import hill_activation
    acts = {name: hill_activation(concentration=v, k=k) for name, v in inputs.items()}
    vals = list(acts.values())
    if gate == "AND":
        out = math.prod(vals) if vals else 0.0
    elif gate == "OR":
        out = 1 - math.prod(1 - v for v in vals) if vals else 0.0
    elif gate == "NOT":
        out = 1 - (vals[0] if vals else 0.0)
    else:
        out = vals[0] if vals else 0.0
    return {"output": round(out, 6), "activations": {k: round(v, 4) for k, v in acts.items()}}


def synthetic_promoter(*, strength: float, induction: float) -> dict:
    """Synthetic promoter: expression = base strength × inducer response."""
    return {"expression": round(strength * max(0.0, min(1.0, induction)), 4)}


def monod_growth(*, substrate: float, mu_max: float, ks: float) -> float:
    """Monod microbial growth rate μ = μ_max·S/(Ks+S)."""
    return round(mu_max * substrate / (ks + substrate), 6) if (ks + substrate) > 0 else 0.0


def fermentation(*, s0: float, x0: float, mu_max: float, ks: float, yield_xs: float,
                 steps: int = 100, dt: float = 0.1) -> dict:
    """Fermentation-optimisation: integrate Monod growth with substrate
    consumption; report final biomass and substrate."""
    s, x = s0, x0
    for _ in range(steps):
        mu = monod_growth(substrate=s, mu_max=mu_max, ks=ks)
        dx = mu * x
        ds = -dx / yield_xs if yield_xs > 0 else 0.0
        x += dx * dt; s = max(0.0, s + ds * dt)
    return {"final_biomass": round(x, 4), "final_substrate": round(s, 4)}


def bioreactor(*, flow_in: float, flow_out: float, conc_in: float, volume: float,
               concentration: float, dt: float = 1.0) -> dict:
    """Bioreactor mass balance: dC/dt = (Fin·Cin − Fout·C)/V."""
    dc = (flow_in * conc_in - flow_out * concentration) / volume if volume > 0 else 0.0
    return {"new_concentration": round(concentration + dc * dt, 6),
            "steady_state": abs(dc) < 1e-6}


def codon_optimise(*, gc_target: float, current_gc: float) -> dict:
    """Codon-optimisation: distance of current GC from the host's optimal GC."""
    return {"gc_gap": round(abs(current_gc - gc_target), 4),
            "optimised": abs(current_gc - gc_target) < 0.05}


def delivery_vehicle(*, payload_size_kb: float, vector: str = "AAV") -> dict:
    """Delivery-vehicle / vector scorer: capacity check by vector type."""
    capacity = {"AAV": 4.7, "lentivirus": 8.0, "plasmid": 20.0, "LNP": 10.0}
    cap = capacity.get(vector, 5.0)
    return {"vector": vector, "capacity_kb": cap, "fits": payload_size_kb <= cap,
            "headroom_kb": round(cap - payload_size_kb, 3)}


def containment_risk(*, gene_drive: bool, environmental_release: bool,
                     kill_switch: bool) -> dict:
    """Biosafety containment risk score."""
    risk = 0.0
    risk += 0.5 if gene_drive else 0.0
    risk += 0.3 if environmental_release else 0.0
    risk -= 0.4 if kill_switch else 0.0
    risk = max(0.0, min(1.0, risk + 0.2))
    return {"risk": round(risk, 3), "containment_required": risk > 0.4}


def biosecurity_screen(sequence: str, hazard_db: list[str]) -> dict:
    """Biosecurity risk layer: flag sequences matching known hazard motifs."""
    s = sequence.upper()
    matches = [h for h in hazard_db if h.upper() in s]
    return {"flagged": bool(matches), "matches": matches}


# ── canonical-named feature entry points (real logic) ────────────────────────
def biosensor_organism(*, analyte: float, threshold: float, reporter_gain: float = 1.0) -> dict:
    """Biosensor-organism module: reporter output when analyte exceeds threshold
    (Hill-like switch)."""
    from .bio_genetics import hill_activation
    signal = hill_activation(concentration=analyte, k=threshold) * reporter_gain
    return {"reporter_signal": round(signal, 4), "detected": analyte > threshold}


def gene_therapy_vector(*, payload_size_kb: float, vector: str = "AAV") -> dict:
    """Gene-therapy vector selector (capacity check)."""
    return delivery_vehicle(payload_size_kb=payload_size_kb, vector=vector)


def biomanufacturing_process(*, s0: float, x0: float, mu_max: float, ks: float,
                             yield_xs: float) -> dict:
    """Biomanufacturing process model (fermentation-based)."""
    return fermentation(s0=s0, x0=x0, mu_max=mu_max, ks=ks, yield_xs=yield_xs)


def fermentation_optimisation(*, s0: float, x0: float, mu_max: float, ks: float,
                              yield_xs: float) -> dict:
    """Fermentation-optimisation engine."""
    return fermentation(s0=s0, x0=x0, mu_max=mu_max, ks=ks, yield_xs=yield_xs)


def biosecurity_risk(sequence: str, hazard_db: list[str]) -> dict:
    """Biosecurity risk layer (hazard motif screen)."""
    return biosecurity_screen(sequence, hazard_db)


def tissue_engineering(*, cell_density: float, scaffold_porosity: float,
                       nutrient_supply: float) -> dict:
    """Tissue-engineering module: viability from density, porosity and nutrient
    diffusion (overcrowding or poor perfusion lowers viability)."""
    crowding = max(0.0, cell_density - 0.8)
    viability = max(0.0, min(1.0, scaffold_porosity * nutrient_supply - crowding))
    return {"viability": round(viability, 4), "viable": viability > 0.5}
