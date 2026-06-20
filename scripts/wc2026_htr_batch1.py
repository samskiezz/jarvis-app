"""HTR batch-1 — top-20 30K-search variants #1..#4 graded by WC2026-actuals-only walk-forward.

Owner-directed evaluation:
  - Source: top-20 hyperparameter points in
    server/data/wc2026_30k_search_results.json (rank 1..4 only).
  - Walk: chronological walk-forward over the 30 verified WC2026 fixtures
    in server/data/wc2026_actuals.json. NO historical CSV warmup — the Elo
    book seeds from BASELINE_ELO (eloratings.net mid-2025 baseline) and
    advances purely on WC2026 results.
  - Baseline: production params (k=40, ha=0.4, b=1.6, tau=-0.08, hl=365d)
    re-walked under the IDENTICAL Elo-from-BASELINE_ELO regime so the per-
    match Brier vectors pair cleanly with each candidate variant.
  - Stats: paired bootstrap (reps=2000) of mean(variant_brier - baseline_brier);
    real_lift_brier := ci_95_upper < 0 (negative = better Brier).

Output:
  - server/data/wc2026_htr_batch1.json — for each variant:
      {rank, params, n, brier, ci_95, real_lift_brier,
       brier_delta_vs_baseline, winner_acc, n_scored, audit_run_id}

Audit DB:
  - Each variant + the baseline gets its own run_id with non-empty notes.
  - Actuals are resolved server-side by wc2026_db.actual_for() — never
    injected as actual_score / actual_wdl parameters (per CLAUDE.md).
  - Team-name lookups go through _canonical_team (no raw string compares).
"""
from __future__ import annotations

import json
import logging
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

PROJECT_ROOT = Path("/opt/jarvis-app-1")
SCRIPTS = PROJECT_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

# Reuse the SAME Poisson/DC mechanics the 30k search used so the WC2026-only
# regrade is apples-to-apples vs the search top-20.
import wc2026_30k_search as ws  # noqa: E402
import wc2026_db as wdb  # noqa: E402
from wc2026_predictor import (  # noqa: E402
    BASELINE_ELO,
    DEFAULT_ELO,
    _canonical_team,
)


logger = logging.getLogger("wc2026_htr_batch1")
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


TOP20_JSON = PROJECT_ROOT / "server" / "data" / "wc2026_30k_search_results.json"
ACTUALS_JSON = PROJECT_ROOT / "server" / "data" / "wc2026_actuals.json"
OUT_JSON = PROJECT_ROOT / "server" / "data" / "wc2026_htr_batch1.json"

BOOTSTRAP_REPS = 2000
BOOTSTRAP_SEED = 20260620
RANKS = (1, 2, 3, 4)


# ---------------------------------------------------------------------------
# Build WC2026-only corpus (chronological, no historical CSV)
# ---------------------------------------------------------------------------

def load_wc2026_only_rows() -> list[dict[str, Any]]:
    """Return ONLY the verified WC2026 matches, sorted by date ascending."""
    if not ACTUALS_JSON.exists():
        raise FileNotFoundError(ACTUALS_JSON)
    blob = json.loads(ACTUALS_JSON.read_text())
    rows: list[dict[str, Any]] = []
    for m in (blob.get("matches") or []):
        if not m.get("verified"):
            continue
        result = (m.get("result") or "").strip()
        if "-" not in result:
            continue
        try:
            hs, as_ = result.split("-", 1)
            hg, ag = int(hs.strip()), int(as_.strip())
        except ValueError:
            continue
        rows.append({
            "date": m.get("date", ""),
            "home_raw": m.get("home", ""),
            "away_raw": m.get("away", ""),
            "home": _canonical_team(m.get("home", "")),
            "away": _canonical_team(m.get("away", "")),
            "hg": hg,
            "ag": ag,
            # WC2026 matches play at fixed host venues — treat as neutral, the
            # same convention used by the production predictor and the 30k
            # search corpus assembler.
            "neutral": True,
        })
    rows.sort(key=lambda r: (r["date"], r["home"]))
    return rows


def _team_set(rows: list[dict[str, Any]]) -> dict[str, int]:
    idx: dict[str, int] = {}
    for r in rows:
        for t in (r["home"], r["away"]):
            if t not in idx:
                idx[t] = len(idx)
    return idx


# ---------------------------------------------------------------------------
# Per-row walk-forward grader on WC2026-only rows
# ---------------------------------------------------------------------------

def backtest_wc2026_only(
    rows: list[dict[str, Any]],
    *,
    k_factor: float,
    home_adv: float,
    poisson_b: float,
    dc_tau: float,
    decay_half_life_days: float,
) -> dict[str, np.ndarray]:
    """Walk the 30 WC2026 rows chronologically.

    Elo seeds from BASELINE_ELO (DEFAULT_ELO fallback) — NO history CSV warmup.
    For every row, predict before updating Elo, then advance Elo with margin-of-
    victory + Heuer (2010) exponential time-decay weight (age relative to the
    most-recent row). Returns paired (brier, winner-hit) vectors aligned to
    `rows` order — every row is scored (no warmup mask).
    """
    n = len(rows)
    team_to_idx = _team_set(rows)
    ratings = np.full(len(team_to_idx), DEFAULT_ELO, dtype=np.float64)
    for t, i in team_to_idx.items():
        ratings[i] = BASELINE_ELO.get(t, DEFAULT_ELO)

    # Parse dates once for age-based weights.
    def _parse(d: str) -> datetime:
        try:
            return datetime.strptime(d, "%Y-%m-%d")
        except (ValueError, TypeError):
            return datetime(2026, 1, 1)

    dates = [_parse(r["date"]) for r in rows]
    ref_date = max(dates)
    ages = np.array([(ref_date - d).days for d in dates], dtype=np.float64)
    inv_half = math.log(2.0) / max(decay_half_life_days, 1.0)
    weights = np.exp(-inv_half * ages)

    briers = np.full(n, np.nan, dtype=np.float64)
    hits = np.full(n, np.nan, dtype=np.float64)
    log_losses = np.full(n, np.nan, dtype=np.float64)
    probs: list[tuple[float, float, float]] = []
    eps = 1e-12

    for i, r in enumerate(rows):
        h = team_to_idx[r["home"]]
        a = team_to_idx[r["away"]]
        hg_i = int(r["hg"])
        ag_i = int(r["ag"])
        is_neutral = bool(r["neutral"])

        elo_h = ratings[h]
        elo_a = ratings[a]
        diff_400 = (elo_h - elo_a) / 400.0

        home_bonus = 0.0 if is_neutral else home_adv
        lam_h = math.exp(ws.POISSON_A + poisson_b * diff_400 + home_bonus)
        lam_a = math.exp(ws.POISSON_A - poisson_b * diff_400)
        lam_h = min(max(lam_h, 0.05), 8.0)
        lam_a = min(max(lam_a, 0.05), 8.0)

        pmf_h = ws._poisson_pmf(lam_h)
        pmf_a = ws._poisson_pmf(lam_a)
        grid = np.outer(pmf_h, pmf_a)
        # Dixon-Coles low-score corner correction.
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
        probs.append((p_home, p_draw, p_away))

        if hg_i > ag_i:
            y_h, y_d, y_a = 1.0, 0.0, 0.0
            actual_cls = 0
            true_p = p_home
        elif hg_i == ag_i:
            y_h, y_d, y_a = 0.0, 1.0, 0.0
            actual_cls = 1
            true_p = p_draw
        else:
            y_h, y_d, y_a = 0.0, 0.0, 1.0
            actual_cls = 2
            true_p = p_away

        briers[i] = (p_home - y_h) ** 2 + (p_draw - y_d) ** 2 + (p_away - y_a) ** 2
        log_losses[i] = -math.log(max(true_p, eps))

        if p_home >= p_draw and p_home >= p_away:
            picked = 0
        elif p_draw >= p_away:
            picked = 1
        else:
            picked = 2
        hits[i] = 1.0 if picked == actual_cls else 0.0

        # ---- Advance Elo (margin-of-victory + Heuer time-decay weight) ----
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

    return {
        "briers": briers,
        "hits": hits,
        "log_losses": log_losses,
        "probs": probs,
    }


# ---------------------------------------------------------------------------
# Paired bootstrap
# ---------------------------------------------------------------------------

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
            f"paired bootstrap requires equal-length samples "
            f"(variant={variant.shape}, baseline={baseline.shape})"
        )
    n = variant.shape[0]
    if n == 0:
        return 0.0, (0.0, 0.0)
    rng = np.random.default_rng(seed)
    diffs = variant - baseline
    boot_means = np.empty(reps, dtype=np.float64)
    for r in range(reps):
        idx = rng.integers(0, n, size=n)
        boot_means[r] = float(np.mean(diffs[idx]))
    point = float(np.mean(diffs))
    lo = float(np.percentile(boot_means, 2.5))
    hi = float(np.percentile(boot_means, 97.5))
    return point, (lo, hi)


# ---------------------------------------------------------------------------
# Audit DB logging — actuals resolved server-side, non-empty notes
# ---------------------------------------------------------------------------

def audit_log_variant(
    *,
    rank: int,
    params: dict[str, float],
    rows: list[dict[str, Any]],
    probs: list[tuple[float, float, float]],
    is_baseline: bool,
    n_scored: int,
) -> tuple[str, str, int]:
    """Log one variant's predictions to the audit DB.

    Returns (run_id, model_name, rows_logged). The DB lookup for the actual
    result is done by wc2026_db.log_prediction() via actual_for() — we never
    pass actual_score / actual_wdl into the call (per the WC2026 data-integrity
    guardrail in CLAUDE.md).
    """
    ts_tag = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if is_baseline:
        model_name = "elo_htr_batch1_baseline_wc2026_only"
        run_id = f"htr_batch1_baseline_{ts_tag}"
        notes = (
            "HTR batch-1 paired-bootstrap baseline: production Elo+bivariate-"
            "Poisson+Dixon-Coles params (k=40, ha=0.4, b=1.6, tau=-0.08, "
            "decay=365d) walked CHRONOLOGICALLY over the 30 verified WC2026 "
            "actuals only (NO historical CSV warmup; Elo seeds from "
            "BASELINE_ELO). Per-match Brier + winner-hit recorded for paired "
            "comparison with top-20 30k-search variants ranks 1..4."
        )
    else:
        p = params
        model_name = f"elo_htr_batch1_top{rank:02d}_wc2026_only"
        run_id = f"htr_batch1_top{rank:02d}_{ts_tag}"
        notes = (
            f"HTR batch-1 variant (30k-search top-{rank}): walk-forward grade "
            f"of k={p['k_factor']:.4f} ha={p['home_adv']:.4f} "
            f"b={p['poisson_b']:.4f} tau={p['dc_tau']:+.4f} "
            f"hl={p['decay_half_life_days']:.4f}d on the 30 verified WC2026 "
            f"actuals only (Elo seeds from BASELINE_ELO, no history warmup); "
            f"paired bootstrap reps={BOOTSTRAP_REPS} vs HTR batch-1 baseline "
            "(same regime, production params)."
        )
    try:
        conn = wdb.init_db()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit DB unavailable for %s: %s", model_name, exc)
        return run_id, model_name, 0
    rows_logged = 0
    try:
        wdb.log_run(run_id, model_name, notes=notes, conn=conn)
        for i, r in enumerate(rows):
            ph, pd_, pa = probs[i]
            if ph >= pd_ and ph >= pa:
                pred_wdl = "H"
                pred_score = "1-0"
            elif pd_ >= pa:
                pred_wdl = "D"
                pred_score = "1-1"
            else:
                pred_wdl = "A"
                pred_score = "0-1"
            try:
                wdb.log_prediction(
                    run_id,
                    model_name,
                    {
                        # Pass the canonicalised names so actual_for() (which
                        # also canonicalises) finds the actuals row reliably.
                        "home": r["home"],
                        "away": r["away"],
                        "match_date": r["date"],
                        "competition": "FIFA World Cup 2026",
                    },
                    {
                        "predicted_score": pred_score,
                        "predicted_wdl": pred_wdl,
                        "p_home": ph,
                        "p_draw": pd_,
                        "p_away": pa,
                        "source": f"wc2026_htr_batch1.{model_name}",
                    },
                    conn=conn,
                )
                rows_logged += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "log_prediction failed for %s vs %s under %s: %s",
                    r["home"], r["away"], model_name, exc,
                )
        wdb.finalize_run(run_id, {"notes": notes}, conn=conn)
    finally:
        conn.close()
    return run_id, model_name, rows_logged


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_top_variants() -> list[dict[str, Any]]:
    doc = json.loads(TOP20_JSON.read_text())
    top20 = doc.get("top_20") or []
    if len(top20) < max(RANKS):
        raise RuntimeError(
            f"need at least {max(RANKS)} variants in top_20, got {len(top20)}"
        )
    return [top20[r - 1] for r in RANKS]


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> dict:
    logger.info("loading top-20 from %s", TOP20_JSON.name)
    variants_raw = _load_top_variants()

    logger.info("loading WC2026-only corpus from %s", ACTUALS_JSON.name)
    rows = load_wc2026_only_rows()
    n = len(rows)
    if n == 0:
        raise RuntimeError("no verified WC2026 actuals found")
    logger.info("loaded %d verified WC2026 fixtures", n)

    # ---- Baseline (production params) under the SAME WC2026-only regime ----
    baseline_params = dict(ws.BASELINE_PARAMS)
    logger.info(
        "walking baseline (k=%.2f ha=%.2f b=%.2f tau=%+.3f hl=%.0fd)",
        baseline_params["k_factor"], baseline_params["home_adv"],
        baseline_params["poisson_b"], baseline_params["dc_tau"],
        baseline_params["decay_half_life_days"],
    )
    base_walk = backtest_wc2026_only(rows, **baseline_params)
    base_briers = base_walk["briers"]
    base_hits = base_walk["hits"]
    base_log_losses = base_walk["log_losses"]
    n_scored = int(np.isfinite(base_briers).sum())
    base_brier_mean = float(np.mean(base_briers))
    base_winner = float(np.mean(base_hits))
    base_log_loss = float(np.mean(base_log_losses))
    logger.info(
        "baseline: n=%d brier=%.6f winner_acc=%.4f log_loss=%.4f",
        n_scored, base_brier_mean, base_winner, base_log_loss,
    )

    base_run_id, base_model, base_rows_logged = audit_log_variant(
        rank=0,
        params=baseline_params,
        rows=rows,
        probs=base_walk["probs"],
        is_baseline=True,
        n_scored=n_scored,
    )

    # ---- Variants #1..#4 ----
    variant_payloads: list[dict[str, Any]] = []
    for offset, entry in enumerate(variants_raw):
        rank = RANKS[offset]
        params = dict(entry["params"])
        walk = backtest_wc2026_only(rows, **params)
        v_briers = walk["briers"]
        v_hits = walk["hits"]
        v_log_losses = walk["log_losses"]
        v_brier_mean = float(np.mean(v_briers))
        v_winner = float(np.mean(v_hits))
        v_log_loss = float(np.mean(v_log_losses))

        # Paired bootstrap on per-match Brier diff (variant - baseline).
        delta_point, (ci_lo, ci_hi) = paired_bootstrap_delta(
            v_briers, base_briers,
            reps=BOOTSTRAP_REPS,
            seed=BOOTSTRAP_SEED + rank,
        )
        real_lift = bool(ci_hi < 0.0)

        # Winner-hit bootstrap (variant - baseline), reported in percentage points.
        win_point, (win_lo, win_hi) = paired_bootstrap_delta(
            v_hits, base_hits,
            reps=BOOTSTRAP_REPS,
            seed=BOOTSTRAP_SEED + 100 + rank,
        )

        run_id, model_name, rows_logged = audit_log_variant(
            rank=rank,
            params=params,
            rows=rows,
            probs=walk["probs"],
            is_baseline=False,
            n_scored=n_scored,
        )

        variant_payloads.append({
            "rank": rank,
            "params": params,
            "n": n_scored,
            "brier": round(v_brier_mean, 6),
            "ci_95": [round(ci_lo, 6), round(ci_hi, 6)],
            "real_lift_brier": real_lift,
            "brier_delta_vs_baseline": round(delta_point, 6),
            "winner_acc": round(v_winner, 6),
            "winner_delta_pp": round(win_point * 100.0, 4),
            "winner_ci_95_pp": [round(win_lo * 100.0, 4), round(win_hi * 100.0, 4)],
            "log_loss": round(v_log_loss, 6),
            "search_brier_480": entry.get("brier"),
            "search_winner_acc": entry.get("winner_acc"),
            "audit_run_id": run_id,
            "audit_model": model_name,
            "audit_rows_logged": rows_logged,
        })
        logger.info(
            "rank=%d brier=%.6f delta=%+.6f ci=[%+.6f,%+.6f] real_lift=%s "
            "winner=%.4f (%+.2fpp)",
            rank, v_brier_mean, delta_point, ci_lo, ci_hi, real_lift,
            v_winner, win_point * 100.0,
        )

    payload = {
        "verified": True,
        "source": (
            "scripts/wc2026_htr_batch1.py walking the 30 verified WC2026 "
            "actuals (server/data/wc2026_actuals.json) chronologically; Elo "
            "seeds from BASELINE_ELO with NO historical CSV warmup; baseline "
            "params (k=40, ha=0.4, b=1.6, tau=-0.08, hl=365d) re-walked under "
            "the same regime so per-match Brier vectors pair with each "
            f"variant for paired bootstrap (reps={BOOTSTRAP_REPS}). Actuals "
            "resolved server-side via wc2026_db.actual_for()."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "actuals_path": str(ACTUALS_JSON),
        "search_results_path": str(TOP20_JSON),
        "n_wc2026_actuals": n,
        "n_scored": n_scored,
        "bootstrap_reps": BOOTSTRAP_REPS,
        "bootstrap_seed_base": BOOTSTRAP_SEED,
        "ranks_evaluated": list(RANKS),
        "baseline_params": baseline_params,
        "baseline": {
            "n": n_scored,
            "brier": round(base_brier_mean, 6),
            "winner_acc": round(base_winner, 6),
            "log_loss": round(base_log_loss, 6),
            "audit_run_id": base_run_id,
            "audit_model": base_model,
            "audit_rows_logged": base_rows_logged,
        },
        "variants": variant_payloads,
        "notes": (
            "Sign convention on brier_delta_vs_baseline = mean(variant_brier "
            "- baseline_brier) over the 30 paired WC2026 fixtures. "
            "real_lift_brier := ci_95[1] < 0 (95% paired-bootstrap CI on the "
            "Brier delta strictly excludes 0 on the favourable side). With "
            "n=30 the CI is wide; treat real_lift=true as a candidate signal "
            "rather than a final adoption decision."
        ),
    }
    _atomic_write(OUT_JSON, payload)
    logger.info("wrote %s", OUT_JSON)
    return payload


if __name__ == "__main__":
    out = main()
    # Print concise per-variant lines for the calling script to consume.
    print(json.dumps({
        "out_path": str(OUT_JSON),
        "baseline_brier": out["baseline"]["brier"],
        "n_scored": out["n_scored"],
        "variants": [
            {
                "rank": v["rank"],
                "n": v["n"],
                "brier": v["brier"],
                "ci_95": v["ci_95"],
                "real_lift_brier": v["real_lift_brier"],
            }
            for v in out["variants"]
        ],
    }, indent=2))
