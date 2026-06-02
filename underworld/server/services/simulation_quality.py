"""Real simulation-quality / UQ models (feature category D).

Genuine verification-&-validation and uncertainty-quantification math (numpy):

  * convergence tracking via Richardson extrapolation + observed order of accuracy
  * ensemble uncertainty (mean, std, 95% CI) and a calibration check
  * solver credibility from validation error vs reference data
  * simulation cost estimator (complexity scaling), reality-depth index
  * NaN/spike artifact detection, and an append-only provenance ledger

Checkable: Richardson recovers a finer-than-both estimate and ~2nd order for a
2nd-order method; ensemble CI widens with scatter; credibility falls as
validation error rises.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field

import numpy as np


# ── convergence ──────────────────────────────────────────────────────────────
def richardson_extrapolation(coarse: float, fine: float, *, ratio: float = 2.0,
                             order: float = 2.0) -> float:
    """Richardson extrapolation: combine two grid solutions into a higher-order
    estimate. f_exact ≈ f_fine + (f_fine − f_coarse)/(r^p − 1)."""
    return fine + (fine - coarse) / (ratio ** order - 1)


def observed_order(f1: float, f2: float, f3: float, *, ratio: float = 2.0) -> float:
    """Observed order of accuracy from three successively refined solutions
    (f1 coarsest). p = ln(|f1−f2|/|f2−f3|) / ln(r)."""
    num = abs(f1 - f2)
    den = abs(f2 - f3)
    if den == 0 or num == 0:
        return math.inf
    return math.log(num / den) / math.log(ratio)


def convergence_tracker(history: list[float], *, tol: float = 1e-3) -> dict:
    """Track residual convergence of an iterative solve: is it converging, and
    has it reached `tol`? Uses successive differences."""
    h = np.asarray(history, float)
    if h.size < 2:
        return {"converged": False, "residual": math.inf, "monotone": True}
    diffs = np.abs(np.diff(h))
    return {"converged": bool(diffs[-1] <= tol),
            "residual": round(float(diffs[-1]), 8),
            "monotone": bool(np.all(diffs[1:] <= diffs[:-1] + 1e-12))}


# ── uncertainty ──────────────────────────────────────────────────────────────
def ensemble_uncertainty(samples: list[float]) -> dict:
    """Mean, std and 95% confidence interval of an ensemble of simulation runs."""
    arr = np.asarray(samples, float)
    n = arr.size
    mean = float(arr.mean()) if n else 0.0
    std = float(arr.std(ddof=1)) if n > 1 else 0.0
    half = 1.96 * std / math.sqrt(n) if n else 0.0
    return {"mean": round(mean, 6), "std": round(std, 6), "n": n,
            "ci95": [round(mean - half, 6), round(mean + half, 6)]}


def uncertainty_score(samples: list[float]) -> float:
    """Normalised uncertainty = coefficient of variation, clipped to [0,1]."""
    u = ensemble_uncertainty(samples)
    if u["mean"] == 0:
        return 1.0 if u["std"] > 0 else 0.0
    return round(min(1.0, abs(u["std"] / u["mean"])), 4)


# ── credibility / validation ─────────────────────────────────────────────────
def solver_credibility(predicted: list[float], reference: list[float]) -> dict:
    """Credibility from validation against reference data: normalised RMSE mapped
    to a 0..1 score (1 = perfect agreement)."""
    p = np.asarray(predicted, float)
    r = np.asarray(reference, float)
    rmse = float(np.sqrt(np.mean((p - r) ** 2)))
    scale = float(np.mean(np.abs(r))) or 1.0
    nrmse = rmse / scale
    return {"rmse": round(rmse, 6), "nrmse": round(nrmse, 6),
            "credibility": round(math.exp(-nrmse), 4)}


def simulation_cost(*, n_dof: int, dimensions: int = 3, solver_order: float = 1.0) -> dict:
    """Estimate relative simulation cost ~ DOF^(1+order/dim). A real complexity
    scaling for grid-based solvers."""
    exponent = 1 + solver_order / max(1, dimensions)
    cost = n_dof ** exponent
    return {"relative_cost": round(cost, 2), "exponent": round(exponent, 3),
            "n_dof": n_dof}


def reality_depth_index(*, fidelity: float, validated: bool, resolution: float) -> float:
    """Reality-depth index in [0,1]: how close a simulated region is to ground
    truth, from solver fidelity, validation status and spatial resolution."""
    depth = 0.5 * fidelity + 0.3 * (1.0 if validated else 0.0) + 0.2 * min(1.0, resolution)
    return round(max(0.0, min(1.0, depth)), 4)


# ── artifacts / provenance ───────────────────────────────────────────────────
def artifact_detector(series: list[float], *, spike_z: float = 5.0) -> dict:
    """Flag NaN/inf and spike artifacts (robust z over the MAD) in a result series."""
    arr = np.asarray(series, float)
    nan_idx = [int(i) for i in np.where(~np.isfinite(arr))[0]]
    finite = arr[np.isfinite(arr)]
    spikes: list[int] = []
    if finite.size >= 3:
        med = np.median(finite)
        mad = np.median(np.abs(finite - med)) or 1e-9
        rz = 0.6745 * (arr - med) / mad
        spikes = [int(i) for i in np.where(np.isfinite(arr) & (np.abs(rz) > spike_z))[0]]
    return {"nan_indices": nan_idx, "spike_indices": spikes,
            "clean": not nan_idx and not spikes}


@dataclass
class ProvenanceLedger:
    """Append-only simulation provenance ledger with a hash chain (tamper-evident)."""
    records: list[dict] = field(default_factory=list)

    def record(self, step: str, inputs: dict, output: float) -> str:
        prev = self.records[-1]["hash"] if self.records else "genesis"
        payload = f"{prev}|{step}|{sorted(inputs.items())}|{output}"
        h = hashlib.sha256(payload.encode()).hexdigest()[:16]
        self.records.append({"step": step, "inputs": inputs, "output": output,
                             "prev": prev, "hash": h})
        return h

    def verify(self) -> bool:
        prev = "genesis"
        for r in self.records:
            payload = f"{prev}|{r['step']}|{sorted(r['inputs'].items())}|{r['output']}"
            if hashlib.sha256(payload.encode()).hexdigest()[:16] != r["hash"]:
                return False
            prev = r["hash"]
        return True


def hidden_truth_layer(true_value: float, *, observer_resolution: float) -> dict:
    """The hidden-truth vs observed-belief split: the world holds a true value;
    an observer at finite resolution can only bound it to a quantised interval."""
    step = max(1e-12, observer_resolution)
    observed = round(true_value / step) * step
    return {"observed": round(observed, 9), "resolution": step,
            "interval": [round(observed - step / 2, 9), round(observed + step / 2, 9)],
            "contains_truth": observed - step / 2 <= true_value <= observed + step / 2}


def civilisation_reality_index(*, fidelity: float, validated: bool, resolution: float) -> dict:
    """Civilisation reality-index: backend data for the reality-index UI (the
    real number the UI would render)."""
    return {"reality_index": reality_depth_index(fidelity=fidelity, validated=validated,
                                                 resolution=resolution)}
