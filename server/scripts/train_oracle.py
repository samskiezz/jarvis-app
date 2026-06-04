"""HEAVY-train the PATTERN ORACLE :class:`OracleModel` on a LARGE pooled
multi-asset dataset, save it, and print the HONEST scorecard.

The honest result this prints is NOT "99% directional". It is:
  * all-bars directional accuracy ~ 50-53% (a near-random-walk forced call),
  * directional accuracy RISING as you act only on HIGH-CONVICTION bars,
  * volatility (move-size) prediction R^2 in the genuinely-strong 0.5-0.8 range,
  * calibrated probabilities (Brier + reliability table).

Run from the repo root:

    CG_API_KEY=... python -m server.scripts.train_oracle \
        [--assets crypto|sp500|all] [--horizon N] [--max-names N]

(The CoinGecko key is not strictly required — crypto deep history comes from the
key-less CryptoCompare scraper and S&P names from key-less Yahoo Finance.)
"""

from __future__ import annotations

import argparse
import os
import time

from ..services.oracle_model import OracleDataset, OracleModel, evaluate
from ..services.scrapers import cryptocompare_full, yahoo_daily

# Crypto majors with deep daily history (CryptoCompare, key-less)
CRYPTO = ["BTC", "ETH", "XRP", "SOL", "ADA", "DOGE", "BNB", "TRX", "LTC", "LINK",
          "AVAX", "DOT", "MATIC", "XLM", "ATOM", "ETC", "BCH", "FIL", "APT", "ARB"]

# A liquid, diversified slice of the S&P 500 (key-less Yahoo daily, throttled).
SP500 = ["AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "JPM",
         "JNJ", "V", "PG", "XOM", "UNH", "HD", "MA", "BAC", "ABBV", "PFE", "KO",
         "PEP", "COST", "WMT", "DIS", "CSCO", "MRK", "ACN", "ADBE", "CRM", "NFLX",
         "INTC", "AMD", "QCOM", "TXN", "NKE", "ORCL", "IBM", "GE", "CAT", "BA",
         "MMM", "HON", "UNP", "LIN", "GS", "MS", "C", "WFC", "T", "VZ"]


def _fetch(args) -> dict[str, list]:
    series_map: dict[str, list] = {}

    def add_crypto():
        names = CRYPTO[: args.max_names] if args.max_names else CRYPTO
        for sym in names:
            s = cryptocompare_full(sym, max_calls=8)
            if len(s) >= 200:
                series_map[f"CRYPTO:{sym}"] = s
                print(f"  crypto {sym:<6} n={len(s)}")
            time.sleep(0.5)

    def add_sp500():
        names = SP500[: args.max_names] if args.max_names else SP500
        for sym in names:
            s = yahoo_daily(sym, rng="10y")
            if len(s) >= 200:
                series_map[f"SP500:{sym}"] = s
                print(f"  sp500  {sym:<6} n={len(s)}")
            time.sleep(1.2)  # throttle Yahoo

    print("Fetching deep history (throttled)...")
    if args.assets in ("crypto", "all"):
        add_crypto()
    if args.assets in ("sp500", "all"):
        add_sp500()
    return series_map


def _print_scorecard(rep: dict, sc: dict, horizon: int, n_assets: int) -> None:
    bar = "=" * 78
    print("\n" + bar)
    print("  PATTERN ORACLE — HONEST OUT-OF-SAMPLE SCORECARD")
    print(bar)
    print(f"  horizon={horizon} bar(s)   assets={n_assets}   "
          f"pooled test rows={sc['n_test']}")
    bp = rep.get("best_params", {})
    print(f"  best hyperparams (purged-CV): {bp}")
    print(f"  CV log-loss={rep.get('cv_best_logloss'):.4f}   "
          f"calibration={rep.get('calibration')}")
    print("-" * 78)
    print("  DIRECTION — the edge is SELECTIVE, not every-bar:")
    print(f"    all-bars dir-acc           : {sc['all_bars_dir_acc']*100:5.2f}%   "
          f"(forced call on every bar -> ~coin-flip, as expected)")
    print("    dir-acc at conviction thresholds (act only when conviction >= thr):")
    for r in sc["dir_acc_at_conviction"]:
        da = r["dir_acc"]
        da_s = f"{da*100:5.2f}%" if da == da else "  n/a"
        print(f"      thr>={r['threshold']:.1f}  acted-on={r['frac_acted']*100:5.1f}% "
              f"of bars (n={r['n_acted']:>5})  ->  dir-acc={da_s}")
    print("    dir-acc on TOP-conviction slices (headline 'act on top X%'):")
    for r in sc["dir_acc_top_conviction"]:
        print(f"      top {r['top_frac']*100:4.0f}% conviction (n={r['n']:>5})  ->  "
              f"dir-acc={r['dir_acc']*100:5.2f}%")
    print("-" * 78)
    print("  VOLATILITY (move size |fwd return|) — the genuinely-predictable head:")
    print(f"    R^2={sc['vol_r2']:.3f}   MAE={sc['vol_mae']:.5f}   "
          f"corr={sc['vol_corr']:.3f}")
    print("-" * 78)
    print("  PROBABILITY CALIBRATION:")
    print(f"    Brier score={sc['brier']:.4f}  (0.25=uninformative coin-flip; lower=better)")
    print("    reliability (pred P(up) vs empirical up-rate):")
    for r in sc["reliability"]:
        print(f"      bin {r['bin']}  n={r['n']:>5}  pred={r['pred_mean']:.3f}  "
              f"emp={r['emp_up_rate']:.3f}")
    print(bar)
    print("  READ: high accuracy comes from SELECTIVE (high-conviction) calls +")
    print("  volatility prediction, NOT from calling every move. ~50% all-bars is")
    print("  the honest baseline; the rising conviction curve is the real edge.")
    print(bar + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Heavy-train PATTERN ORACLE OracleModel")
    ap.add_argument("--assets", choices=["crypto", "sp500", "all"], default="all")
    ap.add_argument("--horizon", type=int, default=1)
    ap.add_argument("--max-names", type=int, default=0,
                    help="cap names per asset class (0 = all)")
    ap.add_argument("--test-fraction", type=float, default=0.2)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    t0 = time.time()
    series_map = _fetch(args)
    if not series_map:
        print("No data fetched (network?). Aborting.")
        return 1
    print(f"Fetched {len(series_map)} assets in {time.time()-t0:.0f}s.")

    print("Building pooled, leakage-safe dataset (global time sort)...")
    ds = OracleDataset.from_series_map(series_map, horizon_steps=args.horizon)
    print(f"  pooled rows={len(ds)}  features={ds.X.shape[1]}  "
          f"assets={len(series_map)}")
    if len(ds) < 500:
        print("Too few pooled rows for a heavy run.")
        return 1

    train_ds, test_ds = ds.time_split(test_fraction=args.test_fraction)
    print(f"  strict time split -> train={len(train_ds)}  test={len(test_ds)}")

    print("HEAVY training (purged-CV hyperparameter search ON)...")
    t1 = time.time()
    model = OracleModel(horizon_steps=args.horizon, act_threshold=0.2)
    rep = model.train(train_ds, hyperparam_search=True, ret_series_map=series_map)
    print(f"  trained in {time.time()-t1:.0f}s   status={rep.get('status')}")
    print("  hyperparameter search log:")
    for row in rep.get("search_log", []):
        print(f"    {row['params']}  cv_logloss={row['cv_logloss']:.4f}")

    out_path = args.out or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data", "oracle_model.joblib",
    )
    model.save(out_path)
    print(f"  saved model -> {out_path}")

    sc = evaluate(model, test_ds)
    _print_scorecard(rep, sc, args.horizon, len(series_map))
    print(f"Total wall time: {time.time()-t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
