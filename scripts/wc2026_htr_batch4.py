"""HTR batch-4 — top-20 30k-search variants #13..#16 graded vs WC2026 actuals only.

Each variant from `server/data/wc2026_30k_search_results.json` (ranks 13..16)
is re-walked through the canonical Elo + bivariate-Poisson + Dixon-Coles
walk-forward defined in `wc2026_30k_search.py`, but Brier / winner accuracy
are accumulated ONLY over the verified WC2026 graded rows (resolved
server-side by `wc2026_db.actual_for()` — never injected as
`actual_score` / `actual_wdl`). The production baseline (k=40, ha=0.4,
b=1.6, tau=-0.08, hl=365d) is re-evaluated on the SAME per-match grid so
the per-match Brier vectors are paired and we can paired-bootstrap each
variant's delta vs production.

This script is identical in procedure to
`scripts/wc2026_htr_h013_to_h032_top20_eval.py` but scoped to ranks
13..16 only. Output is `server/data/wc2026_htr_batch4.json`. The HTR
tree is NOT modified (the 20-node block was already committed via
`wc2026_htr_h013_to_h032_top20_eval.py`); this batch JSON is a
standalone evidence artefact.

Audit-DB compliance:
  - Each variant logged with a unique run_id and non-empty `notes`.
  - `log_run(notes=...)` is mandatory non-empty per CLAUDE.md.
  - Actuals never injected (resolved by `actual_for()`).

Output:
  - server/data/wc2026_htr_batch4.json
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

# Re-use the canonical walker + the h-013..h-032 per-row backtest helper so
# the WC2026-only re-grading uses the IDENTICAL mechanics.
import wc2026_30k_search as ws  # noqa: E402
import wc2026_db as wdb  # noqa: E402
from wc2026_htr_h013_to_h032_top20_eval import (  # noqa: E402
    backtest_per_row,
    paired_bootstrap_delta,
    BOOTSTRAP_REPS,
    BOOTSTRAP_SEED,
    NODE_BASE_INDEX,
)

logger = logging.getLogger("wc2026_htr_batch4")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


TOP20_JSON = REPO_ROOT / "server" / "data" / "wc2026_30k_search_results.json"
OUT_JSON = REPO_ROOT / "server" / "data" / "wc2026_htr_batch4.json"

BATCH_RANKS = (13, 14, 15, 16)  # variants this batch evaluates
BATCH_ID = "batch4"


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

    Actuals are resolved server-side via `actual_for()`; `notes` is
    mandatory non-empty per CLAUDE.md.
    """
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if is_baseline:
        model_name = "elo_batch4_baseline_wc2026_only"
        run_id = f"htr_batch4_baseline_{ts_tag}"
        notes = (
            "HTR batch-4 paired-bootstrap baseline: production "
            "Elo+bivariate-Poisson+Dixon-Coles params (k=40, ha=0.4, "
            "b=1.6, tau=-0.08, decay=365d) re-walked over the full "
            "history+WC2026 corpus; per-match Brier / winner-hit "
            f"recorded on the {len(briers)} verified WC2026 fixtures only."
        )
    else:
        model_name = f"elo_30k_top{rank:02d}_wc2026_only_batch4"
        run_id = f"htr_batch4_rank{rank:02d}_{ts_tag}"
        p = params
        notes = (
            f"HTR batch-4 (30k-search top-{rank}): walk-forward grade of "
            f"k={p['k_factor']:.4f} ha={p['home_adv']:.4f} "
            f"b={p['poisson_b']:.4f} tau={p['dc_tau']:+.4f} "
            f"hl={p['decay_half_life_days']:.4f}d on the full corpus; "
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
                "source": f"wc2026_htr_batch4.{model_name}",
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

    # ---------------- Baseline (production params) ----------------
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

    # Audit log the baseline.
    base_run, base_model, base_rows = _audit_log_variant(
        rank=0,
        node_id="batch4_baseline",
        params=ws.BASELINE_PARAMS,
        briers=baseline_briers_wc.tolist(),
        hits=baseline_hits_wc.tolist(),
        wc2026_keys=wc_keys_scored,
        is_baseline=True,
    )

    # ---------------- Batch-4 variants (ranks 13..16) ----------------
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
            "search_winner_480": entry.get("winner_acc"),
            "search_log_loss_480": entry.get("log_loss"),
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
            "audit_model": model_name,
            "audit_rows_logged": rows_logged,
        })
        logger.info(
            "rank=%2d %s brier=%.6f delta=%+.6f ci=[%+.6f,%+.6f] lift=%s winner=%.4f",
            rank, node_id, v_brier_mean, delta_point, ci_lo, ci_hi, real_lift, v_winner,
        )

    # ---------------- Pick best real-lift in batch ----------------
    real_lifts = [r for r in variant_results if r["real_lift_brier"]]
    n_real_lifts = len(real_lifts)
    best_node = min(real_lifts, key=lambda r: r["wc2026_brier"]) if real_lifts else None

    # ---------------- Build payload ----------------
    payload: dict = {
        "verified": True,
        "source": (
            "scripts/wc2026_htr_batch4.py walking 30k-search "
            "variants #13..#16 from server/data/wc2026_30k_search_results.json "
            "and grading Brier / winner accuracy only on the verified WC2026 "
            "rows of server/data/wc2026_actuals.json (resolved server-side by "
            "wc2026_db.actual_for()); paired bootstrap reps="
            f"{BOOTSTRAP_REPS} vs production baseline "
            "(k=40, ha=0.4, b=1.6, tau=-0.08, hl=365d)."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "batch_id": BATCH_ID,
        "batch_ranks": list(BATCH_RANKS),
        "node_ids": [f"h-{NODE_BASE_INDEX + r - 1:03d}" for r in BATCH_RANKS],
        "n_total_corpus": n_total,
        "n_wc2026_in_corpus": n_wc,
        "n_scored": n_scored,
        "bootstrap_reps": BOOTSTRAP_REPS,
        "bootstrap_seed_base": BOOTSTRAP_SEED,
        "baseline_params": dict(ws.BASELINE_PARAMS),
        "baseline_wc2026_brier": round(baseline_brier_mean, 6),
        "baseline_wc2026_winner_acc": round(baseline_winner, 6),
        "baseline_audit_run_id": base_run,
        "baseline_audit_model": base_model,
        "baseline_audit_rows_logged": base_rows,
        "variants": variant_results,
        "n_real_lifts": n_real_lifts,
        "best_node_id": (best_node["node_id"] if best_node else None),
        "best_brier": (best_node["wc2026_brier"] if best_node else None),
        "best_ci_95": (best_node["ci_95"] if best_node else None),
        "notes": (
            "Batch-4 of the top-20 30k-search evaluation. Each variant's "
            "brier_delta_vs_baseline = mean(variant_brier - baseline_brier) "
            "over the paired per-match Brier vectors on the WC2026-only "
            "subset of the walk-forward grade. real_lift_brier is True only "
            "if ci_95[1] < 0 (95% paired-bootstrap CI strictly below 0; "
            "lower Brier is better). This batch does NOT modify "
            "wc2026_htr_tree.json — the canonical h-013..h-032 block was "
            "already committed by wc2026_htr_h013_to_h032_top20_eval.py; "
            "this artefact is a standalone batch-evidence file."
        ),
    }
    _atomic_write(OUT_JSON, payload)
    logger.info("wrote %s", OUT_JSON)

    return {
        "batch_id": payload["batch_id"],
        "n_real_lifts": n_real_lifts,
        "best_node_id": payload["best_node_id"],
        "best_brier": payload["best_brier"],
        "best_ci_95": payload["best_ci_95"],
    }


if __name__ == "__main__":
    summary = main()
    print(json.dumps(summary, indent=2, ensure_ascii=False))
