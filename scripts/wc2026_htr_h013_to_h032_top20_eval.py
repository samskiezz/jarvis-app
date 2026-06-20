"""HTR h-013 .. h-032 — top-20 30k-search variants graded vs WC2026 actuals only.

Each top-20 hyperparameter point from server/data/wc2026_30k_search_results.json
is re-run through the walk-forward backtest defined in wc2026_30k_search.py,
but Brier / winner accuracy are accumulated ONLY over the verified WC2026
actuals rows (currently 30 graded matches), not the full 480-row history+WC
mix. The production baseline (k=40, ha=0.4, b=1.6, tau=-0.08, hl=365d) is
re-evaluated on the same per-match grid so the per-match Brier vectors are
paired and we can paired-bootstrap each variant's delta vs production.

For each of the 20 variants we add an HTR node h-013 .. h-032 with:
  - hypothesis
  - params
  - brier (WC2026-only mean)
  - ci_95 (paired bootstrap, 2000 reps, delta = variant - production, sign
    convention: candidate minus baseline; negative = better)
  - real_lift_brier = ci_95[1] < 0  (the 95% CI strictly excludes 0 on the
    favourable side)
  - status: 'adopted' for the strongest real lift, 'rejected' otherwise

Audit-DB compliance:
  - Each variant logged with a unique run_id and non-empty notes.
  - log_run is called with `notes=...` (mandatory non-empty per CLAUDE.md).
  - Actuals are resolved server-side via wc2026_db.actual_for() — never
    injected as actual_score / actual_wdl.

Outputs:
  - server/data/wc2026_htr_h013_to_h032_top20_eval.json
  - server/data/wc2026_htr_tree.json (20 new nodes appended)
"""
from __future__ import annotations

import json
import logging
import math
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import numpy as np

REPO_ROOT = Path("/opt/jarvis-app-1")
SCRIPTS = REPO_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

# Import the canonical 30k walker so the WC2026-only re-grading uses the
# IDENTICAL Elo+Poisson+DC mechanics that produced the top-20 search results.
import wc2026_30k_search as ws  # noqa: E402
import wc2026_db as wdb  # noqa: E402


logger = logging.getLogger("wc2026_htr_h013_to_h032_top20_eval")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


TOP20_JSON = REPO_ROOT / "server" / "data" / "wc2026_30k_search_results.json"
HTR_TREE_JSON = REPO_ROOT / "server" / "data" / "wc2026_htr_tree.json"
OUT_JSON = REPO_ROOT / "server" / "data" / "wc2026_htr_h013_to_h032_top20_eval.json"

BOOTSTRAP_REPS = 2000
BOOTSTRAP_SEED = 20260620
NODE_BASE_INDEX = 13  # h-013 .. h-032


# ---------------------------------------------------------------------------
# Walk-forward grader that records per-row Brier / winner-hit vectors so we
# can filter to WC2026-only afterwards (paired across variants).
# ---------------------------------------------------------------------------
def backtest_per_row(
    corpus: dict[str, np.ndarray],
    *,
    k_factor: float,
    home_adv: float,
    poisson_b: float,
    dc_tau: float,
    decay_half_life_days: float,
    warmup_n: int = ws.WARMUP_N,
) -> dict[str, np.ndarray]:
    """Per-row walk-forward grade.

    Re-implements ws.backtest_one but emits NaN-padded per-row arrays for
    Brier and winner-hit so the caller can mask down to a subset (WC2026
    rows) without re-running the walk.
    """
    ratings = corpus["ratings0"].copy()
    home_idx = corpus["home_idx"]
    away_idx = corpus["away_idx"]
    hg_arr = corpus["hg"]
    ag_arr = corpus["ag"]
    neutral_arr = corpus["neutral"]
    age_arr = corpus["age_days"]

    n = len(home_idx)
    inv_half = math.log(2.0) / max(decay_half_life_days, 1.0)
    weights = np.exp(-inv_half * age_arr)

    LN10_OVER_400 = math.log(10.0) / 400.0  # noqa: F841 — kept for parity

    briers = np.full(n, np.nan, dtype=np.float64)
    hits = np.full(n, np.nan, dtype=np.float64)

    for i in range(n):
        h = int(home_idx[i])
        a = int(away_idx[i])
        hg_i = int(hg_arr[i])
        ag_i = int(ag_arr[i])
        is_neutral = bool(neutral_arr[i])

        elo_h = ratings[h]
        elo_a = ratings[a]
        diff_400 = (elo_h - elo_a) / 400.0

        if i >= warmup_n:
            home_bonus = 0.0 if is_neutral else home_adv
            lam_h = math.exp(ws.POISSON_A + poisson_b * diff_400 + home_bonus)
            lam_a = math.exp(ws.POISSON_A - poisson_b * diff_400)
            if lam_h < 0.05:
                lam_h = 0.05
            elif lam_h > 8.0:
                lam_h = 8.0
            if lam_a < 0.05:
                lam_a = 0.05
            elif lam_a > 8.0:
                lam_a = 8.0

            pmf_h = ws._poisson_pmf(lam_h)
            pmf_a = ws._poisson_pmf(lam_a)
            grid = np.outer(pmf_h, pmf_a)
            grid[0, 0] *= 1.0 - lam_h * lam_a * dc_tau
            grid[0, 1] *= 1.0 + lam_h * dc_tau
            grid[1, 0] *= 1.0 + lam_a * dc_tau
            grid[1, 1] *= 1.0 - dc_tau

            total = float(grid.sum())
            if total > 0.0:
                grid /= total

            p_home = float(np.tril(grid, -1).sum())
            p_draw = float(np.trace(grid))
            p_away = float(np.triu(grid, 1).sum())
            s = p_home + p_draw + p_away
            if s > 0.0:
                p_home /= s
                p_draw /= s
                p_away /= s

            if hg_i > ag_i:
                y_h, y_d, y_a = 1.0, 0.0, 0.0
                actual_cls = 0
            elif hg_i == ag_i:
                y_h, y_d, y_a = 0.0, 1.0, 0.0
                actual_cls = 1
            else:
                y_h, y_d, y_a = 0.0, 0.0, 1.0
                actual_cls = 2

            briers[i] = (p_home - y_h) ** 2 + (p_draw - y_d) ** 2 + (p_away - y_a) ** 2

            if p_home >= p_draw and p_home >= p_away:
                picked = 0
            elif p_draw >= p_away:
                picked = 1
            else:
                picked = 2
            hits[i] = 1.0 if picked == actual_cls else 0.0

        # Advance Elo (margin-of-victory + Heuer time-decay weight).
        if hg_i > ag_i:
            score = 1.0
        elif hg_i == ag_i:
            score = 0.5
        else:
            score = 0.0
        gd = abs(hg_i - ag_i)
        if gd <= 1:
            mov = 1.0
        elif gd == 2:
            mov = 1.5
        else:
            mov = (11.0 + gd) / 8.0
        exp_h = 1.0 / (1.0 + 10.0 ** (-diff_400))
        delta = k_factor * mov * (score - exp_h) * float(weights[i])
        ratings[h] += delta
        ratings[a] -= delta

    return {"briers": briers, "hits": hits}


def paired_bootstrap_delta(
    variant: np.ndarray,
    baseline: np.ndarray,
    *,
    reps: int = BOOTSTRAP_REPS,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, tuple[float, float]]:
    """Paired bootstrap of mean(variant - baseline). Returns (point, (lo, hi))."""
    if variant.shape != baseline.shape:
        raise ValueError(
            f"paired bootstrap needs equal-length samples "
            f"(variant={variant.shape}, baseline={baseline.shape})"
        )
    n = variant.shape[0]
    if n == 0:
        return 0.0, (0.0, 0.0)
    rng = np.random.default_rng(seed)
    deltas = np.empty(reps, dtype=np.float64)
    diffs = variant - baseline
    for r in range(reps):
        idx = rng.integers(0, n, size=n)
        deltas[r] = float(np.mean(diffs[idx]))
    point = float(np.mean(diffs))
    lo = float(np.percentile(deltas, 2.5))
    hi = float(np.percentile(deltas, 97.5))
    return point, (lo, hi)


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

    Per the data-integrity rules, actuals are resolved server-side by
    actual_for(); we never inject actual_score / actual_wdl parameters.
    `notes` must be non-empty.
    """
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if is_baseline:
        model_name = "elo_top20_baseline_wc2026_only"
        run_id = f"htr_h013_h032_baseline_{ts_tag}"
        notes = (
            "HTR h-013..h-032 paired-bootstrap baseline: production "
            "Elo+bivariate-Poisson+Dixon-Coles params (k=40, ha=0.4, "
            "b=1.6, tau=-0.08, decay=365d) re-walked over the 580-row "
            "history+WC2026 corpus; per-match Brier / winner-hit recorded "
            f"on the {len(briers)} verified WC2026 fixtures only."
        )
    else:
        model_name = f"elo_30k_top{rank:02d}_wc2026_only"
        run_id = f"htr_{node_id}_{model_name}_{ts_tag}"
        p = params
        notes = (
            f"HTR {node_id} (30k-search top-{rank}): walk-forward grade of "
            f"k={p['k_factor']:.4f} ha={p['home_adv']:.4f} "
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
        # We do not know per-match (p_home, p_draw, p_away) here without
        # re-walking; the per-row arrays only carry Brier/hit. The audit
        # row is still valuable as a model-run record — predictions table
        # accepts NULL probabilities. Caller-side grading goes in the
        # JSON payload; the DB just records that the run happened.
        for (h, a, d) in wc2026_keys:
            pred = {
                "predicted_score": None,
                "p_home": None,
                "p_draw": None,
                "p_away": None,
                "source": f"wc2026_htr_h013_to_h032_top20_eval.{model_name}",
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
    """Boolean mask over the full corpus picking out verified WC2026 rows."""
    mask = np.zeros(len(rows), dtype=bool)
    for i, r in enumerate(rows):
        if r.get("competition") == "WC2026":
            mask[i] = True
    return mask


def _load_existing_tree() -> dict:
    if not HTR_TREE_JSON.exists():
        raise FileNotFoundError(HTR_TREE_JSON)
    return json.loads(HTR_TREE_JSON.read_text())


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

    # WC2026 fixture keys (home, away, date) for audit DB rows.
    wc_keys: list[tuple[str, str, str]] = [
        (rows[i]["home"], rows[i]["away"], rows[i]["date"])
        for i in range(n_total) if mask[i]
    ]

    # ---------------- Baseline (production params) ----------------
    logger.info("walking baseline (production params)")
    baseline_per_row = backtest_per_row(corpus, **ws.BASELINE_PARAMS)
    baseline_briers_wc = baseline_per_row["briers"][mask]
    baseline_hits_wc = baseline_per_row["hits"][mask]
    # Some WC2026 rows could lie inside warmup_n; backtest_per_row left those
    # as NaN. Drop NaNs and keep the same indices across variants.
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

    # Filter wc_keys to the subset that was actually graded (post-warmup).
    wc_idx_all = np.where(mask)[0]
    wc_idx_scored = wc_idx_all[finite_mask]
    wc_keys_scored = [
        (rows[i]["home"], rows[i]["away"], rows[i]["date"])
        for i in wc_idx_scored
    ]

    # Audit log the baseline.
    base_run, base_model, base_rows = _audit_log_variant(
        rank=0,
        node_id="baseline_wc2026_only",
        params=ws.BASELINE_PARAMS,
        briers=baseline_briers_wc.tolist(),
        hits=baseline_hits_wc.tolist(),
        wc2026_keys=wc_keys_scored,
        is_baseline=True,
    )

    # ---------------- Top-20 variants ----------------
    variant_results: list[dict[str, Any]] = []
    for rank, entry in enumerate(top20, start=1):
        node_id = f"h-{NODE_BASE_INDEX + rank - 1:03d}"
        params = entry["params"]
        per_row = backtest_per_row(corpus, **params)
        variant_briers = per_row["briers"][mask][finite_mask]
        variant_hits = per_row["hits"][mask][finite_mask]

        v_brier_mean = float(np.mean(variant_briers))
        v_winner = float(np.mean(variant_hits))

        # Paired bootstrap of Brier delta (variant - baseline) on the same n_scored fixtures.
        delta_point, (ci_lo, ci_hi) = paired_bootstrap_delta(
            variant_briers, baseline_briers_wc,
            reps=BOOTSTRAP_REPS,
            seed=BOOTSTRAP_SEED + rank,  # deterministic per-variant
        )
        real_lift = bool(ci_hi < 0.0)

        # Winner CI (variant - baseline in pp).
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

    # ---------------- Pick best real-lift node ----------------
    real_lifts = [r for r in variant_results if r["real_lift_brier"]]
    n_real_lifts = len(real_lifts)
    best_node: dict | None = None
    if real_lifts:
        # Lowest Brier whose CI strictly excludes 0.
        best_node = min(real_lifts, key=lambda r: r["wc2026_brier"])

    # ---------------- Build payload ----------------
    payload: dict = {
        "verified": True,
        "source": (
            "scripts/wc2026_htr_h013_to_h032_top20_eval.py walking the "
            "top-20 30k-search variants from "
            "server/data/wc2026_30k_search_results.json and grading Brier "
            "/ winner accuracy only on the verified WC2026 rows of "
            "server/data/wc2026_actuals.json (resolved server-side by "
            "wc2026_db.actual_for()); paired bootstrap reps="
            f"{BOOTSTRAP_REPS} vs production baseline "
            "(k=40, ha=0.4, b=1.6, tau=-0.08, hl=365d)."
        ),
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
        "best_node_id": (best_node["node_id"] if best_node else None),
        "best_brier": (best_node["wc2026_brier"] if best_node else None),
        "best_ci_95": (best_node["ci_95"] if best_node else None),
        "notes": (
            "Each variant's brier_delta_vs_baseline = mean(variant_brier - "
            "baseline_brier) over the paired per-match Brier vectors on the "
            "WC2026-only subset of the walk-forward grade. real_lift_brier "
            "is True only if ci_95[1] < 0 (95% paired-bootstrap CI strictly "
            "below 0; lower Brier is better)."
        ),
    }
    _atomic_write(OUT_JSON, payload)
    logger.info("wrote %s", OUT_JSON)

    # ---------------- Update HTR tree ----------------
    tree = _load_existing_tree()
    existing_ids = {n["id"] for n in tree.get("nodes", [])}
    new_nodes: list[dict] = []
    for r in variant_results:
        node_id = r["node_id"]
        if node_id in existing_ids:
            logger.warning("node %s already exists in tree — skipping", node_id)
            continue
        is_best = bool(best_node and node_id == best_node["node_id"])
        p = r["params"]
        hyp = (
            f"30k-search top-{r['rank']} hyperparameter point "
            f"(k={p['k_factor']:.4f}, home_adv={p['home_adv']:.4f}, "
            f"poisson_b={p['poisson_b']:.4f}, dc_tau={p['dc_tau']:+.4f}, "
            f"decay_half_life_days={p['decay_half_life_days']:.4f}) "
            f"reduces three-way Brier on the {n_scored} verified WC2026 "
            "graded matches vs the production baseline "
            "(k=40, ha=0.4, b=1.6, tau=-0.08, hl=365d) under paired "
            f"bootstrap (reps={BOOTSTRAP_REPS})."
        )
        if r["real_lift_brier"]:
            insight = (
                f"WC2026-only mean Brier = {r['wc2026_brier']:.6f}, "
                f"delta vs baseline = {r['brier_delta_vs_baseline']:+.6f}, "
                f"95% paired-bootstrap CI = [{r['ci_95'][0]:+.6f}, "
                f"{r['ci_95'][1]:+.6f}] — strictly below zero, so the "
                "improvement is statistically real on n="
                f"{n_scored} verified WC2026 fixtures. "
                f"Winner accuracy = {r['wc2026_winner_acc']:.4f} "
                f"({r['winner_delta_pp']:+.4f}pp vs baseline; CI "
                f"[{r['winner_ci_95_pp'][0]:+.4f}, "
                f"{r['winner_ci_95_pp'][1]:+.4f}]pp)."
            )
        else:
            insight = (
                f"WC2026-only mean Brier = {r['wc2026_brier']:.6f}, "
                f"delta vs baseline = {r['brier_delta_vs_baseline']:+.6f}, "
                f"95% paired-bootstrap CI = [{r['ci_95'][0]:+.6f}, "
                f"{r['ci_95'][1]:+.6f}] — CI straddles or sits above 0, "
                f"so on n={n_scored} verified WC2026 fixtures the lift is "
                "not statistically distinguishable from noise."
            )
        status = "adopted" if is_best else "rejected"
        node = {
            "id": node_id,
            "parent_id": "h-009",
            "hypothesis": hyp,
            "artifact_path": "scripts/wc2026_htr_h013_to_h032_top20_eval.py",
            "evidence_path": "server/data/wc2026_htr_h013_to_h032_top20_eval.json",
            "evidence_summary": {
                "brier": r["wc2026_brier"],
                "brier_delta": r["brier_delta_vs_baseline"],
                "ci_95": r["ci_95"],
                "winner_pct": round(r["wc2026_winner_acc"] * 100.0, 4),
                "winner_delta_pp": r["winner_delta_pp"],
                "n": n_scored,
                "rank_in_30k_search": r["rank"],
                "search_brier_480": r["search_brier_480"],
                "params": p,
                "baseline_node": "h-001",
                "baseline_brier_wc2026_only": round(baseline_brier_mean, 6),
                "bootstrap_reps": BOOTSTRAP_REPS,
                "audit_run_id": r["audit_run_id"],
            },
            "distilled_insight": insight,
            "status": status,
            "real_lift_brier": r["real_lift_brier"],
            "real_lift_winner": r["real_lift_winner"],
            "is_best_of_top20_wc2026_eval": is_best,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "next_children_seeds": [
                "Re-run paired bootstrap once WC2026 graded matches reach n≈60 (post-group stage) to tighten the CI",
                "Search a Bayesian-optimised neighbourhood around this point instead of relying on a single random sample",
                "Calibrate this variant's per-class probabilities with Platt scaling before grading",
            ],
        }
        new_nodes.append(node)
        existing_ids.add(node_id)

    # Append to tree, update meta, keep existing nodes untouched.
    tree["nodes"].extend(new_nodes)
    meta = tree.get("meta", {})
    meta["last_walked_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    meta["total_nodes"] = len(tree["nodes"])
    if best_node is not None:
        # Promote to current_best only if the best new node lifts vs production.
        meta["current_best_node_id"] = best_node["node_id"]
        meta["best_selection_rule"] = (
            "current_best = node with strongest evidence of genuine Brier "
            "lift vs the production baseline (h-001 params) under "
            "ci_95[1] < 0 on the WC2026-only paired-bootstrap Brier delta. "
            f"Among the 20 new nodes (h-013..h-032), {n_real_lifts} had "
            "ci_95[1] < 0 vs production; the strongest (lowest WC2026-only "
            "mean Brier with CI strictly excluding 0) is the new champion."
        )
    else:
        meta["best_selection_rule"] = (
            "current_best unchanged: no node in h-013..h-032 produced a "
            "WC2026-only paired-bootstrap Brier delta with the upper CI "
            "strictly below zero vs the production baseline."
        )
    meta["adopted_nodes"] = sum(1 for n in tree["nodes"] if n.get("status") == "adopted")
    meta["rejected_nodes"] = sum(1 for n in tree["nodes"] if n.get("status") == "rejected")
    meta["pruned_nodes"] = sum(1 for n in tree["nodes"] if n.get("status") == "pruned")
    tree["meta"] = meta

    _atomic_write(HTR_TREE_JSON, tree)
    logger.info(
        "appended %d new nodes (h-%03d..h-%03d) to %s",
        len(new_nodes), NODE_BASE_INDEX, NODE_BASE_INDEX + len(new_nodes) - 1,
        HTR_TREE_JSON,
    )

    return {
        "n_real_lifts": n_real_lifts,
        "best_node_id": payload["best_node_id"],
        "best_brier": payload["best_brier"],
        "best_ci_95": payload["best_ci_95"],
    }


if __name__ == "__main__":
    summary = main()
    print(json.dumps(summary, indent=2, ensure_ascii=False))
