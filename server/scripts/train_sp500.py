"""HIGH-SCALE pooled cross-sectional training + honest backtest across the ENTIRE
S&P 500 (all ~500 constituents, not the index).

Fetches the current S&P 500 constituents (Wikipedia scrape), pulls daily history
per name from Yahoo (throttled), pools every stock's causal feature rows
(reusing :class:`MLForecaster`'s feature engineering) into ONE cross-sectional
training set, fits ONE global gradient-boosted model + quantile members, and
reports the HONEST out-of-sample scorecard on the newest ~20% of the pooled
timeline (strict TIME-based split — no look-ahead, no same-day cross-ticker
leakage), plus a per-GICS-sector table.

HONESTY: pooled cross-sectional training improves robustness/generalization (far
more samples, signal that must generalize across names) but does NOT beat market
efficiency. Real 1-step daily directional accuracy lands ~50-55%; level accuracy
is barely better than (often tied with) persistence. We print the TRUE numbers —
never a fabricated 99% directional.

Usage::

    python -m server.scripts.train_sp500 [--max-names N] [--horizon 1] [--years 5]

``--max-names`` caps how many constituents are fetched (bounds runtime); omit it
to train on all ~500. Network fetches are throttled to respect Yahoo limits.
"""
from __future__ import annotations

import argparse
import sys
import time

from ..services.scrapers import sp500_constituents, yahoo_daily
from ..services.train_sp500 import build_dataset, evaluate_global, train_global


def _fmt(x, n=4):
    if x is None:
        return "  n/a "
    try:
        return f"{x:.{n}f}"
    except (TypeError, ValueError):
        return str(x)


def _pct(x, n=2):
    if x is None:
        return " n/a "
    try:
        return f"{100.0 * x:.{n}f}%"
    except (TypeError, ValueError):
        return str(x)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Train a pooled cross-sectional forecaster on the whole S&P 500."
    )
    ap.add_argument("--max-names", type=int, default=None,
                    help="cap number of constituents fetched (default: all ~500)")
    ap.add_argument("--horizon", type=int, default=1,
                    help="forecast horizon in trading days (default: 1)")
    ap.add_argument("--years", type=int, default=5,
                    help="years of daily history per name (default: 5)")
    ap.add_argument("--throttle", type=float, default=0.25,
                    help="seconds to sleep between Yahoo fetches (default: 0.25)")
    ap.add_argument("--fast", action="store_true",
                    help="shrink the boosting budget for a quicker run")
    args = ap.parse_args(argv)

    bar = "=" * 92
    print(bar)
    print("  PATTERN ORACLE — POOLED CROSS-SECTIONAL TRAIN + HONEST BACKTEST (S&P 500)")
    print(bar)

    t0 = time.time()
    print("  fetching current S&P 500 constituents (Wikipedia) ...")
    constituents = sp500_constituents()
    if not constituents:
        print("  ERROR: could not fetch S&P 500 constituents (network/parse). Aborting.")
        return 1
    n_all = len(constituents)
    if args.max_names is not None:
        constituents = constituents[: args.max_names]
    print(f"  constituents available: {n_all}   processing: {len(constituents)}"
          f"   horizon={args.horizon}d   years={args.years}")
    print("  fetching daily history per name from Yahoo (throttled) + pooling rows ...")

    # throttled fetcher around yahoo_daily
    rng = f"{max(1, int(args.years))}y"

    def fetcher(sym, r=rng):  # noqa: ANN001
        return yahoo_daily(sym, rng=r)

    dataset = build_dataset(
        constituents,
        horizon_steps=args.horizon,
        years=args.years,
        max_names=args.max_names,
        throttle=args.throttle,
        fetcher=fetcher,
        progress=True,
    )

    if dataset["n_stocks"] == 0 or dataset["n_rows"] == 0:
        print("  ERROR: no usable data pooled (all fetches failed/too short). Aborting.")
        return 1

    print("-" * 92)
    print(f"  POOLED DATASET: stocks={dataset['n_stocks']}  "
          f"(attempted {dataset['n_attempted']}, skipped {dataset['n_skipped']})  "
          f"total rows={dataset['n_rows']:,}  features={len(dataset['feature_names'])}")
    print(f"  TIME SPLIT (strict, no look-ahead): "
          f"train rows={dataset['n_train']:,}  test rows={dataset['n_test']:,}  "
          f"(newest ~20% held out)")

    print("  training ONE global HistGradientBoosting point model + quantile members ...")
    model = train_global(dataset, fast=args.fast)
    print(f"  trained on {model['n_fit']:,} pooled rows.")

    metrics = evaluate_global(dataset, model)

    # ── pooled out-of-sample scorecard ────────────────────────────────────────
    print(bar)
    print("  POOLED OUT-OF-SAMPLE SCORECARD (held-out NEWEST test rows, all stocks)")
    print(bar)
    print(f"  test rows           : {metrics['n_test']:,}")
    print(f"  level-acc (1-MAPE)  : {_pct(metrics['level_acc'])}   "
          f"persistence: {_pct(metrics['level_acc_persist'])}")
    print(f"  directional accuracy: {_pct(metrics['directional_acc'])}   "
          f"(coin-flip = 50%; market efficiency caps this ~50-55%)")
    print(f"  interval coverage   : {_pct(metrics['coverage'])}   (nominal 90%)")
    print(f"  skill vs persistence: {_fmt(metrics['skill_vs_persist'], 4)}   "
          f"(>0 beats persistence on the RETURN target; ~0 = tied)")

    # ── per-sector table ──────────────────────────────────────────────────────
    by_sector = metrics.get("by_sector") or {}
    if by_sector:
        print("-" * 92)
        print("  PER-SECTOR BREAKDOWN")
        print(f"  {'Sector':<26}{'n':>7}  {'level-acc':>10} {'persist':>9}  "
              f"{'dir-acc':>8}  {'cover':>7}  {'skill':>8}")
        for sec in sorted(by_sector):
            s = by_sector[sec]
            print(f"  {sec[:26]:<26}{s['n']:>7}  "
                  f"{_pct(s['level_acc']):>10} {_pct(s['level_acc_persist']):>9}  "
                  f"{_pct(s['directional_acc']):>8}  {_pct(s['coverage']):>7}  "
                  f"{_fmt(s['skill_vs_persist'], 4):>8}")

    print(bar)
    print("  HONEST NOTE: pooling all ~500 names improves ROBUSTNESS and GENERALIZATION")
    print("  (one model that works across the cross-section), but it does NOT beat market")
    print("  efficiency: 1-step daily directional accuracy stays ~50-55% and level accuracy")
    print("  is barely better than persistence. The real win is a single calibrated model")
    print("  that generalizes across stocks, NOT magical foresight.")
    print(f"  elapsed: {time.time() - t0:.1f}s")
    print(bar)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
