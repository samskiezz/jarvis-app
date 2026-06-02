"""Real population & molecular genetics (feature category R).

Genuine genetics math (numpy), checkable against textbook results:
  * Hardy–Weinberg equilibrium, allele/genotype frequencies
  * mutation, selection (fitness-weighted), Wright–Fisher genetic drift
  * heritability (narrow-sense h²), inheritance (Punnett), epigenetic state
  * gene-regulatory Hill activation, expression matrices, speciation distance
"""
from __future__ import annotations

import math

import numpy as np


def hardy_weinberg(p: float) -> dict:
    """Genotype frequencies at HW equilibrium: AA=p², Aa=2pq, aa=q²."""
    q = 1 - p
    return {"AA": round(p * p, 6), "Aa": round(2 * p * q, 6), "aa": round(q * q, 6)}


def allele_frequency(*, n_AA: int, n_Aa: int, n_aa: int) -> dict:
    """Allele frequency from genotype counts."""
    total = n_AA + n_Aa + n_aa
    if total == 0:
        return {"p": 0.0, "q": 0.0}
    p = (2 * n_AA + n_Aa) / (2 * total)
    return {"p": round(p, 6), "q": round(1 - p, 6)}


def hw_equilibrium_test(*, n_AA: int, n_Aa: int, n_aa: int, tol: float = 0.05) -> dict:
    """Chi-square goodness-of-fit to HW expectations."""
    from scipy import stats
    total = n_AA + n_Aa + n_aa
    p = allele_frequency(n_AA=n_AA, n_Aa=n_Aa, n_aa=n_aa)["p"]
    exp = hardy_weinberg(p)
    expected = [exp["AA"] * total, exp["Aa"] * total, exp["aa"] * total]
    observed = [n_AA, n_Aa, n_aa]
    expected = [max(1e-9, e) for e in expected]
    chi2 = sum((o - e) ** 2 / e for o, e in zip(observed, expected))
    pval = 1 - stats.chi2.cdf(chi2, df=1)
    return {"chi2": round(chi2, 4), "p_value": round(float(pval), 4),
            "in_equilibrium": bool(pval > tol)}


def selection_step(*, p: float, w_AA: float, w_Aa: float, w_aa: float) -> float:
    """One generation of natural selection on allele A (fitness-weighted)."""
    q = 1 - p
    w_bar = p * p * w_AA + 2 * p * q * w_Aa + q * q * w_aa
    if w_bar == 0:
        return p
    return (p * p * w_AA + p * q * w_Aa) / w_bar


def mutation_step(*, p: float, forward: float, back: float) -> float:
    """Allele frequency after mutation A->a (forward) and a->A (back)."""
    return p * (1 - forward) + (1 - p) * back


def genetic_drift(*, p: float, pop_size: int, generations: int, seed: int = 0) -> dict:
    """Wright–Fisher genetic drift: binomial resampling each generation. Returns
    the final allele frequency and whether it fixed/was lost."""
    rng = np.random.default_rng(seed)
    n = 2 * pop_size
    for _ in range(generations):
        k = rng.binomial(n, p)
        p = k / n
        if p in (0.0, 1.0):
            break
    return {"final_p": round(float(p), 6), "fixed": p == 1.0, "lost": p == 0.0}


def heritability(*, var_genetic: float, var_environment: float) -> float:
    """Broad-sense heritability H² = Vg / (Vg + Ve)."""
    total = var_genetic + var_environment
    return round(var_genetic / total, 6) if total > 0 else 0.0


def punnett(parent1: str, parent2: str) -> dict:
    """Single-gene cross: offspring genotype probabilities."""
    counts: dict[str, int] = {}
    for a in parent1:
        for b in parent2:
            g = "".join(sorted([a, b], key=lambda c: (c.islower(), c)))
            counts[g] = counts.get(g, 0) + 1
    total = sum(counts.values())
    return {g: round(c / total, 4) for g, c in counts.items()}


def hill_activation(*, concentration: float, k: float, n: float = 2.0) -> float:
    """Gene-regulatory Hill function: fractional activation cⁿ/(Kⁿ+cⁿ)."""
    cn = concentration ** n
    return round(cn / (k ** n + cn), 6) if (k ** n + cn) > 0 else 0.0


def speciation_distance(seq1: str, seq2: str) -> dict:
    """Genetic distance between two sequences (Hamming/Jukes–Cantor) and a
    speciation flag past a divergence threshold."""
    if not seq1 or len(seq1) != len(seq2):
        return {"p_distance": None, "jukes_cantor": None}
    diff = sum(1 for a, b in zip(seq1, seq2) if a != b)
    p = diff / len(seq1)
    jc = -0.75 * math.log(1 - 4 * p / 3) if p < 0.75 else math.inf
    return {"p_distance": round(p, 4), "jukes_cantor": round(jc, 4) if math.isfinite(jc) else None,
            "distinct_species": p > 0.1}


# ── canonical-named feature entry points (real logic) ────────────────────────
def genome_object(genes: list[str], *, ploidy: int = 2) -> dict:
    """Genome object: gene inventory + ploidy + total locus count."""
    return {"genes": genes, "ploidy": ploidy, "n_genes": len(genes),
            "loci": len(genes) * ploidy}


def chromosome_model(*, n_genes: int, length_mbp: float) -> dict:
    """Chromosome model: gene density per megabase pair."""
    return {"n_genes": n_genes, "length_mbp": length_mbp,
            "gene_density": round(n_genes / length_mbp, 4) if length_mbp else 0.0}


def gene_registry(genes: dict[str, dict]) -> dict:
    """Gene object registry: index genes with their attributes."""
    return {"count": len(genes), "ids": sorted(genes)}


def inheritance_engine(parent1: str, parent2: str) -> dict:
    """Inheritance engine: offspring genotype distribution (Mendelian cross)."""
    return punnett(parent1, parent2)


def epigenetic_state(*, methylation: float, acetylation: float) -> dict:
    """Epigenetic state model: methylation silences, acetylation activates ->
    net expression modifier in [0,1]."""
    activity = max(0.0, min(1.0, 0.5 + 0.5 * (acetylation - methylation)))
    return {"expression_modifier": round(activity, 4),
            "silenced": activity < 0.25}


def gene_regulatory_graph(*, concentration: float, k: float, n: float = 2.0) -> dict:
    """Gene-regulatory graph node: Hill activation of a target gene."""
    return {"activation": hill_activation(concentration=concentration, k=k, n=n)}


def expression_state_matrix(cells: list[list[float]]) -> dict:
    """Expression state matrix: per-gene mean expression across cells."""
    arr = np.array(cells, float)
    return {"cells": arr.shape[0], "genes": arr.shape[1] if arr.ndim > 1 else 0,
            "mean_expression": [round(float(x), 4) for x in arr.mean(axis=0)] if arr.size else []}


def heritability_estimator(*, var_genetic: float, var_environment: float) -> dict:
    """Heritability estimator (broad-sense H²)."""
    return {"heritability": heritability(var_genetic=var_genetic, var_environment=var_environment)}


def evolutionary_selection(*, p: float, w_AA: float, w_Aa: float, w_aa: float,
                           generations: int = 10) -> dict:
    """Evolutionary-selection model: iterate selection over generations."""
    traj = [p]
    for _ in range(generations):
        p = selection_step(p=p, w_AA=w_AA, w_Aa=w_Aa, w_aa=w_aa)
        traj.append(round(p, 6))
    return {"final_p": round(p, 6), "trajectory": traj}


def promoter_enhancer(*, basal: float, enhancer_strength: float, bound: bool) -> dict:
    """Promoter/enhancer model: transcription rate boosted when enhancer is
    bound by its transcription factor."""
    rate = basal * (1 + enhancer_strength) if bound else basal
    return {"transcription_rate": round(rate, 4), "enhancer_active": bound}


def gene_object_registry(genes: dict[str, dict]) -> dict:
    """Gene object registry (canonical name)."""
    return gene_registry(genes)
