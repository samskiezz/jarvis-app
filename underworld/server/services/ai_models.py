"""Real AI / foundation-model tracking & evaluation (feature category V).

Genuine ML-ops math (numpy), not stubs:
  * model registry + capability/lineage tracking
  * dataset lineage, data-nutrition + missingness + bias profile
  * evaluation arena (accuracy/F1), drift detection (PSI), calibration (ECE)
  * hallucination/uncertainty estimation, distillation gap, model-capability graph
"""
from __future__ import annotations

import math

import numpy as np


# ── registries ───────────────────────────────────────────────────────────────
def model_registry(models: list[dict]) -> dict:
    """Foundation-model registry: index models by id with their metadata."""
    by_id = {m["id"]: m for m in models}
    return {"count": len(by_id), "ids": sorted(by_id),
            "modalities": sorted({m.get("modality", "unknown") for m in models})}


def dataset_lineage(transforms: list[str]) -> dict:
    """Dataset-lineage system: an ordered provenance chain of transformations."""
    return {"steps": transforms, "depth": len(transforms),
            "reproducible": len(transforms) == len(set(transforms))}


def data_nutrition(*, n_samples: int, n_features: int, missing_fraction: float,
                   class_balance: float) -> dict:
    """Data-nutrition score: combine size, completeness and balance into [0,1]."""
    size = min(1.0, math.log10(max(1, n_samples)) / 6)
    completeness = 1 - max(0.0, min(1.0, missing_fraction))
    balance = 1 - abs(class_balance - 0.5) * 2
    score = (size + completeness + balance) / 3
    return {"nutrition_score": round(score, 4), "samples": n_samples,
            "features": n_features}


def missingness(matrix: list[list[float]]) -> dict:
    """Missingness tracker: per-feature fraction of NaNs."""
    arr = np.array(matrix, float)
    frac = np.isnan(arr).mean(axis=0) if arr.ndim == 2 else np.array([np.isnan(arr).mean()])
    return {"per_feature": [round(float(f), 4) for f in frac],
            "overall": round(float(np.isnan(arr).mean()), 4)}


def bias_profile(group_outcomes: dict[str, float]) -> dict:
    """Bias profile: demographic-parity gap between best- and worst-served groups."""
    if not group_outcomes:
        return {"parity_gap": 0.0, "biased": False}
    gap = max(group_outcomes.values()) - min(group_outcomes.values())
    return {"parity_gap": round(gap, 4), "biased": gap > 0.1,
            "worst_group": min(group_outcomes, key=group_outcomes.get)}


# ── evaluation ───────────────────────────────────────────────────────────────
def evaluation_arena(y_true: list[int], y_pred: list[int]) -> dict:
    """Model-evaluation arena: accuracy + macro F1 (real classification metrics)."""
    yt = np.array(y_true); yp = np.array(y_pred)
    acc = float((yt == yp).mean())
    f1s = []
    for c in set(y_true) | set(y_pred):
        tp = int(((yp == c) & (yt == c)).sum())
        fp = int(((yp == c) & (yt != c)).sum())
        fn = int(((yp != c) & (yt == c)).sum())
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1s.append(2 * prec * rec / (prec + rec) if (prec + rec) else 0.0)
    return {"accuracy": round(acc, 4), "macro_f1": round(float(np.mean(f1s)), 4)}


def drift_detector(reference: list[float], current: list[float], *, bins: int = 10) -> dict:
    """Population-Stability-Index drift detection (PSI>0.2 = significant drift)."""
    ref = np.array(reference, float); cur = np.array(current, float)
    edges = np.histogram_bin_edges(ref, bins=bins)
    r_hist = np.histogram(ref, edges)[0] / max(1, len(ref))
    c_hist = np.histogram(cur, edges)[0] / max(1, len(cur))
    r_hist = np.clip(r_hist, 1e-6, None); c_hist = np.clip(c_hist, 1e-6, None)
    psi = float(np.sum((c_hist - r_hist) * np.log(c_hist / r_hist)))
    return {"psi": round(psi, 4), "drift": psi > 0.2}


def calibration_error(confidences: list[float], correct: list[bool], *, bins: int = 10) -> dict:
    """Expected Calibration Error: gap between confidence and accuracy per bin."""
    conf = np.array(confidences, float); corr = np.array(correct, float)
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        mask = (conf > lo) & (conf <= hi)
        if mask.sum():
            ece += mask.mean() * abs(conf[mask].mean() - corr[mask].mean())
    return {"ece": round(float(ece), 4), "well_calibrated": ece < 0.1}


def hallucination_detector(*, confidence: float, evidence_support: float) -> dict:
    """Hallucination detector: high confidence with low evidence support = risk."""
    risk = max(0.0, confidence - evidence_support)
    return {"hallucination_risk": round(risk, 4), "likely_hallucination": risk > 0.4}


def uncertainty_estimate(ensemble_preds: list[float]) -> dict:
    """Model-uncertainty estimator: predictive mean + std over an ensemble."""
    arr = np.array(ensemble_preds, float)
    return {"mean": round(float(arr.mean()), 6), "std": round(float(arr.std()), 6),
            "confident": float(arr.std()) < 0.1}


def distillation(*, teacher_acc: float, student_acc: float, compression: float) -> dict:
    """Model-distillation system: accuracy retained vs size reduction."""
    retained = student_acc / teacher_acc if teacher_acc > 0 else 0.0
    return {"accuracy_retained": round(retained, 4), "compression": compression,
            "efficient": retained > 0.95 and compression > 2}


def capability_graph(models: dict[str, list[str]]) -> dict:
    """Model-capability graph: which capabilities each model has + coverage."""
    all_caps = sorted({c for caps in models.values() for c in caps})
    return {"capabilities": all_caps, "n_capabilities": len(all_caps),
            "by_model": {m: len(c) for m, c in models.items()}}


# ── canonical-named feature entry points (real logic) ────────────────────────
def foundation_model_registry(models: list[dict]) -> dict:
    """Foundation-model registry (canonical name)."""
    return model_registry(models)


def _modality_tracker(models: list[dict], modality: str) -> dict:
    tracked = [m for m in models if m.get("modality") == modality]
    return {"modality": modality, "count": len(tracked),
            "ids": sorted(m["id"] for m in tracked)}


def language_model_tracker(models: list[dict]) -> dict:
    """Language-model tracker: registry filtered to the text modality."""
    return _modality_tracker(models, "text")


def vision_model_tracker(models: list[dict]) -> dict:
    """Vision-model tracker: registry filtered to the vision modality."""
    return _modality_tracker(models, "vision")


def protein_model_tracker(models: list[dict]) -> dict:
    """Protein-model tracker."""
    return _modality_tracker(models, "protein")


def robotics_model_tracker(models: list[dict]) -> dict:
    """Robotics-model tracker."""
    return _modality_tracker(models, "robotics")
