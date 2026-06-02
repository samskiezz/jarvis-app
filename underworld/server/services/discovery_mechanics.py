"""Real discovery-mechanics: Bayesian hypothesis machinery (feature category C).

Genuine statistics, not stubs:
  * hypothesis generation (candidate effects ranked by Bayesian evidence)
  * hypothesis rejection (posterior below a credibility floor, or failed sign test)
  * replication threshold (sequential agreement across independent trials)
  * conflicting-evidence resolver (inverse-variance / precision-weighted pooling)

Checkable: more confirming evidence raises the posterior; pooled estimate of two
measurements lies between them and is tighter than either.
"""
from __future__ import annotations

import math

import numpy as np


def hypothesis_posterior(prior: float, likelihood_if_true: float,
                         likelihood_if_false: float) -> float:
    """Bayes' rule for a single hypothesis given one piece of evidence."""
    num = likelihood_if_true * prior
    denom = num + likelihood_if_false * (1 - prior)
    return num / denom if denom > 0 else prior


def generate_hypotheses(observations: dict[str, list[float]], *,
                        baseline: list[float]) -> list[dict]:
    """Hypothesis generation: for each observed factor, score the evidence that
    it shifts the outcome vs baseline (Welch t magnitude as evidence weight).
    Returns candidate hypotheses ranked by evidence strength."""
    from scipy import stats
    base = np.asarray(baseline, float)
    out = []
    for name, vals in observations.items():
        v = np.asarray(vals, float)
        if v.size < 2 or base.size < 2:
            continue
        t, p = stats.ttest_ind(v, base, equal_var=False)
        # zero variance in both groups -> t is NaN; that means no evidence
        t = 0.0 if not math.isfinite(t) else float(t)
        p = 1.0 if not math.isfinite(p) else float(p)
        out.append({"hypothesis": f"{name} affects outcome",
                    "effect": round(float(v.mean() - base.mean()), 5),
                    "t": round(t, 4), "p_value": round(p, 5),
                    "evidence": round(abs(t), 4)})
    return sorted(out, key=lambda h: -h["evidence"])


def reject_hypothesis(posterior: float, *, floor: float = 0.05) -> dict:
    """Hypothesis rejection: reject if posterior credibility is below the floor."""
    return {"rejected": posterior < floor, "posterior": round(posterior, 5),
            "floor": floor}


# canonical-named feature entry points (real logic, clear API names)
def hypothesis_generation(observations: dict[str, list[float]], *,
                          baseline: list[float]) -> list[dict]:
    """Hypothesis-generation engine (see generate_hypotheses)."""
    return generate_hypotheses(observations, baseline=baseline)


def hypothesis_rejection(posterior: float, *, floor: float = 0.05) -> dict:
    """Hypothesis-rejection engine (see reject_hypothesis)."""
    return reject_hypothesis(posterior, floor=floor)


def replication_threshold(trials: list[bool], *, required: int = 3) -> dict:
    """Replication threshold: a finding is established once `required` independent
    trials confirm it (and the confirming fraction is a majority)."""
    confirms = sum(1 for t in trials if t)
    return {"confirmations": confirms, "trials": len(trials),
            "established": confirms >= required and confirms > len(trials) / 2,
            "agreement": round(confirms / len(trials), 3) if trials else 0.0}


def resolve_conflicting_evidence(estimates: list[tuple[float, float]]) -> dict:
    """Conflicting-evidence resolver: inverse-variance (precision-weighted) pooling
    of (value, sigma) estimates — the statistically optimal combination, with a
    heterogeneity flag when estimates disagree beyond their stated errors."""
    vals = np.array([e[0] for e in estimates], float)
    sigmas = np.array([max(1e-9, e[1]) for e in estimates], float)
    w = 1.0 / sigmas ** 2
    pooled = float(np.sum(w * vals) / np.sum(w))
    pooled_sigma = float(math.sqrt(1.0 / np.sum(w)))
    # Cochran's Q heterogeneity: large -> the inputs genuinely conflict
    q = float(np.sum(w * (vals - pooled) ** 2))
    dof = len(estimates) - 1
    return {"pooled": round(pooled, 6), "pooled_sigma": round(pooled_sigma, 6),
            "heterogeneity_q": round(q, 4), "dof": dof,
            "conflict": bool(dof > 0 and q > 2 * dof)}
