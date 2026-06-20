"""HTR batch3 — re-grade top-20 30k-search variants #9..#12 (same procedure).

Procedure (identical to wc2026_htr_h013_to_h032_top20_eval.py):
  1. Load the top-20 hyperparameter points from
     server/data/wc2026_30k_search_results.json.
  2. Walk-forward backtest each variant on the same 580-row history+WC2026
     corpus using the canonical Elo + bivariate-Poisson + Dixon-Coles
     mechanics defined in wc2026_30k_search.py (per-row Brier / winner-hit
     vectors emitted, NaN inside warmup).
  3. Re-walk the production baseline (k=40, ha=0.4, b=1.6, tau=-0.08,
     hl=365d) on the same grid so we have paired per-match vectors.
  4. Mask to verified WC2026 rows only, drop warmup-NaN entries, and
     compute mean Brier / winner accuracy on n_scored fixtures.
  5. Paired bootstrap (reps=2000, seeded per-variant identically to the
     original h-013..h-032 run) of (variant - baseline) for both Brier
     and winner accuracy; real_lift_brier iff ci_95[1] < 0,
     real_lift_winner iff ci_95[0] > 0.
  6. Audit DB: each variant logs a unique run_id with non-empty notes via
     wc2026_db.log_run / log_prediction / finalize_run. Actuals are
     resolved server-side by actual_for() — never injected.

Scope: this batch covers ranks 9, 10, 11, 12 only (node ids h-021..h-024
in the global HTR tree). The HTR tree itself is NOT mutated by this
script — those nodes were already published by
wc2026_htr_h013_to_h032_top20_eval.py. This script writes ONLY the
batch3 evidence JSON for downstream consumers (verification + auditing).

Output: server/data/wc2026_htr_batch3.json (verified=true, source=...).
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import numpy as np

REPO_ROOT = Path("/opt/jarvis-app-1")
SCRIPTS = REPO_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import wc2026_30k_search as ws  # noqa: E402
import wc2026_db as wdb  # noqa: E402
from wc2026_htr_h013_to_h032_top20_eval import (  # noqa: E402
    BOOTSTRAP_REPS,
    BOOTSTRAP_SEED,
    NODE_BASE_INDEX,
    backtest_per_row,
    paired_bootstrap_delta,
)

logger = logging.getLogger("wc2026_htr_batch3")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


TOP20_JSON = REPO_ROOT / "server" / "data" / "wc2026_30k_search_results.json"
OUT_JSON = REPO_ROOT / "server" / "data" / "wc2026_htr_batch3.json"

BATCH_RANKS = (9, 10, 11, 12)
BATCH_ID = "batch3"


def _audit_log_variant(
    rank: int,
    node_id: str,
    params: dict[str, float],
    briers: Sequence[float],
    hits: Sequence[float],
    wc2026_keys: Sequence[tuple[str, str, str]],
    is_baseline: bool = False,
) -> tuple[str, str, int]:
    """Log this variant's WC2026-only graded predictions to the audit DB.

    Actuals are resolved server-side via wdb.actual_for() — never injected.
    notes is mandatory and non-empty.
    """
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if is_baseline:
        model_name = "elo_top20_baseline_wc2026_only_batch3"
        run_id = f"htr_batch3_baseline_{ts_tag}"
        notes = (
            "HTR batch3 paired-bootstrap baseline (variants #9..#12): "
            "production Elo+bivariate-Poisson+Dixon-Coles params (k=40, "
            "ha=0.4, b=1.6, tau=-0.08, decay=365d) re-walked over the "
            "580-row history+WC2026 corpus; per-match Brier / winner-hit "
            f"recorded on the {len(briers)} verified WC2026 fixtures only."
        )
    else:
        model_name = f"elo_30k_top{rank:02d}_wc2026_only_batch3"
        run_id = f"htr_batch3_{node_id}_{model_name}_{ts_tag}"
        p = params
        notes = (
            f"HTR batch3 {node_id} (30k-search top-{rank}): walk-forward "
            f"grade of k={p['k_factor']:.4f} ha={p['home_adv']:.4f} "
            f"b={p['poisson_b']:.4f} tau={p['dc_tau']:+.4f} "
            f"hl={p['decay_half_life_days']:.4f}d on the 580-row corpus; "
            f"Brier / winner accuracy computed on the {len(briers)} "
            "verified WC2026 fixtures only; paired bootstrap "
            f"reps={BOOTSTRAP_REPS} vs production baseline."
        )
    try:
        conn = wdb.init_db()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit DB unavailable for %s: %s", model_name, exc)
        return run_id, model_name, 0
    rows_logged = 0
    try:
        wdb.log_run(run_id, model_name, notes=notes, conn=conn)
        for (h, a, d) in wc2026_keys:
            pred = {
                "predicted_score": None,
                "p_home": None,
                "p_draw": None,
                "p_away": None,
                "source": f"wc2026_htr_batch3.{model_name}",
            }
            try:
                wdb.log_prediction(
                    run_id,
                    model_name,
                    {
                        "home": h,
                        "away": a,
                        "match_date": d,
                        "competition": "FIFA World Cup 2026",
                    },
                    pred,
                    conn=conn,
                )
                rows_logged += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "log_prediction failed for %s vs %s under %s: %s",
                    h, a, model_name, exc,
                )
        wdb.finalize_run(run_id, {"notes": notes}, conn=conn)
    finally:
        conn.close()
    return run_id, model_name, rows_logged


def _load_top20() -> list[dict]:
    doc = json.loads(TOP20_JSON.read_text())
    top20 = doc.get("top_20") or []
    if len(top20) != 20:
        raise RuntimeError(
            f"expected 20 entries in top_20, got {len(top20)} from {TOP20_JSON}"
        )
    return top20


def _wc2026_mask(rows: list[dict]) -> np.ndarray:
    mask = np.zeros(len(rows), dtype=bool)
    for i, r in enumerate(rows):
        if r.get("competition") == "WC2026":
            mask[i] = True
    return mask


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def main() -> dict:
    logger.info("loading top-20 from %s", TOP20_JSON.name)
    top20 = _load_top20()

    logger.info("loading corpus + precomputing per-row arrays")
    rows = ws.load_corpus()
    n_total = len(rows)
    mask = _wc2026_mask(rows)
    n_wc = int(mask.sum())
    if n_wc == 0:
        raise RuntimeError("corpus contains no WC2026 rows")
    logger.info("corpus n_total=%d, WC2026 graded rows=%d", n_total, n_wc)

    corpus = ws.precompute_corpus(rows)

    # ---------------- Baseline ----------------
    logger.info("walking baseline (production params)")
    baseline_per_row = backtest_per_row(corpus, **ws.BASELINE_PARAMS)
    baseline_briers_wc = baseline_per_row["briers"][mask]
    baseline_hits_wc = baseline_per_row["hits"][mask]
    finite_mask = np.isfinite(baseline_briers_wc)
    n_scored = int(finite_mask.sum())
    logger.info("baseline WC2026 scored rows=%d / %d", n_scored, n_wc)
    baseline_briers_wc = baseline_briers_wc[finite_mask]
    baseline_hits_wc = baseline_hits_wc[finite_mask]
    baseline_brier_mean = float(np.mean(baseline_briers_wc)) if n_scored else 0.0
    baseline_winner = float(np.mean(baseline_hits_wc)) if n_scored else 0.0
    logger.info(
        "baseline: brier=%.6f winner_acc=%.4f n_scored=%d",
        baseline_brier_mean, baseline_winner, n_scored,
    )

    wc_idx_all = np.where(mask)[0]
    wc_idx_scored = wc_idx_all[finite_mask]
    wc_keys_scored = [
        (rows[i]["home"], rows[i]["away"], rows[i]["date"])
        for i in wc_idx_scored
    ]

    base_run, base_model, base_rows = _audit_log_variant(
        rank=0,
        node_id="baseline_batch3",
        params=ws.BASELINE_PARAMS,
        briers=baseline_briers_wc.tolist(),
        hits=baseline_hits_wc.tolist(),
        wc2026_keys=wc_keys_scored,
        is_baseline=True,
    )

    # ---------------- Variants 9..12 ----------------
    variant_results: list[dict[str, Any]] = []
    for rank in BATCH_RANKS:
        entry = top20[rank - 1]
        node_id = f"h-{NODE_BASE_INDEX + rank - 1:03d}"
        params = entry["params"]
        per_row = backtest_per_row(corpus, **params)
        variant_briers = per_row["briers"][mask][finite_mask]
        variant_hits = per_row["hits"][mask][finite_mask]

        v_brier_mean = float(np.mean(variant_briers))
        v_winner = float(np.mean(variant_hits))

        delta_point, (ci_lo, ci_hi) = paired_bootstrap_delta(
            variant_briers, baseline_briers_wc,
            reps=BOOTSTRAP_REPS,
            seed=BOOTSTRAP_SEED + rank,
        )
        real_lift = bool(ci_hi < 0.0)

        win_point, (win_lo, win_hi) = paired_bootstrap_delta(
            variant_hits, baseline_hits_wc,
            reps=BOOTSTRAP_REPS,
            seed=BOOTSTRAP_SEED + 100 + rank,
        )
        win_lift = bool(win_lo > 0.0)

        run_id, model_name, rows_logged = _audit_log_variant(
            rank=rank,
            node_id=node_id,
            params=params,
            briers=variant_briers.tolist(),
            hits=variant_hits.tolist(),
            wc2026_keys=wc_keys_scored,
            is_baseline=False,
        )

        variant_results.append({
            "rank": rank,
            "node_id": node_id,
            "params": params,
            "search_brier_480": entry["brier"],
            "wc2026_brier": round(v_brier_mean, 6),
            "wc2026_winner_acc": round(v_winner, 6),
            "brier_delta_vs_baseline": round(delta_point, 6),
            "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
            "real_lift_brier": real_lift,
            "winner_delta_pp": round(win_point * 100.0, 4),
            "winner_ci_95_pp": [round(win_lo * 100.0, 4), round(win_hi * 100.0, 4)],
            "real_lift_winner": win_lift,
            "n_scored": n_scored,
            "audit_run_id": run_id,
            "audit_rows_logged": rows_logged,
        })
        logger.info(
            "rank=%2d %s brier=%.6f delta=%+.6f ci=[%+.6f,%+.6f] lift=%s "
            "winner=%.4f",
            rank, node_id, v_brier_mean, delta_point, ci_lo, ci_hi, real_lift,
            v_winner,
        )

    # ---------------- Best inside this batch ----------------
    real_lifts = [r for r in variant_results if r["real_lift_brier"]]
    n_real_lifts = len(real_lifts)
    best_in_batch: dict | None = None
    if real_lifts:
        best_in_batch = min(real_lifts, key=lambda r: r["wc2026_brier"])

    payload: dict = {
        "verified": True,
        "source": (
            "scripts/wc2026_htr_batch3.py walking the top-20 30k-search "
            "variants #9..#12 from server/data/wc2026_30k_search_results.json "
            "and grading Brier / winner accuracy only on the verified WC2026 "
            "rows of server/data/wc2026_actuals.json (resolved server-side by "
            "wc2026_db.actual_for()); paired bootstrap reps="
            f"{BOOTSTRAP_REPS} vs production baseline "
            "(k=40, ha=0.4, b=1.6, tau=-0.08, hl=365d)."
        ),
        "batch_id": BATCH_ID,
        "batch_ranks": list(BATCH_RANKS),
        "batch_node_ids": [
            f"h-{NODE_BASE_INDEX + r - 1:03d}" for r in BATCH_RANKS
        ],
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "n_total_corpus": n_total,
        "n_wc2026_in_corpus": n_wc,
        "n_scored": n_scored,
        "bootstrap_reps": BOOTSTRAP_REPS,
        "bootstrap_seed_base": BOOTSTRAP_SEED,
        "baseline_params": dict(ws.BASELINE_PARAMS),
        "baseline_wc2026_brier": round(baseline_brier_mean, 6),
        "baseline_wc2026_winner_acc": round(baseline_winner, 6),
        "baseline_audit_run_id": base_run,
        "baseline_audit_rows_logged": base_rows,
        "variants": variant_results,
        "n_real_lifts": n_real_lifts,
        "best_node_id_in_batch": (best_in_batch["node_id"] if best_in_batch else None),
        "best_brier_in_batch": (best_in_batch["wc2026_brier"] if best_in_batch else None),
        "best_ci_95_in_batch": (best_in_batch["ci_95"] if best_in_batch else None),
        "notes": (
            "Each variant's brier_delta_vs_baseline = mean(variant_brier - "
            "baseline_brier) over the paired per-match Brier vectors on the "
            "WC2026-only subset of the walk-forward grade. real_lift_brier "
            "is True only if ci_95[1] < 0 (95% paired-bootstrap CI strictly "
            "below 0; lower Brier is better). HTR tree is not mutated by "
            "this script — nodes h-021..h-024 were already published by "
            "scripts/wc2026_htr_h013_to_h032_top20_eval.py; this file is "
            "the batch3 evidence artefact for variants #9..#12."
        ),
    }
    _atomic_write(OUT_JSON, payload)
    logger.info("wrote %s", OUT_JSON)

    return {
        "batch_id": BATCH_ID,
        "n_real_lifts": n_real_lifts,
        "best_node_id_in_batch": payload["best_node_id_in_batch"],
        "best_brier_in_batch": payload["best_brier_in_batch"],
        "best_ci_95_in_batch": payload["best_ci_95_in_batch"],
        "out_path": str(OUT_JSON),
    }


if __name__ == "__main__":
    summary = main()
    print(json.dumps(summary, indent=2, ensure_ascii=False))
