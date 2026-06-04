"""CLI: predict a stock/crypto price 5 minutes into the future + skill scorecard.

    python -m server.scripts.predict_5min --asset xrp

Fetches the live ~5-minute series (CoinGecko market_chart?days=1, free/keyless
for crypto), trains the ShortHorizonForecaster, prints the predicted price 5
minutes ahead with its conformal interval and prob_up, then runs a walk-forward
backtest and prints the skill scorecard (MAE / RMSE / directional accuracy /
interval coverage / skill-vs-persistence).

Honest by design: if the live series is unavailable it falls back to a
synthetic series and says so. Pure-numpy engine; no sklearn/torch.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

# allow `python server/scripts/predict_5min.py` as well as `-m`
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from server.services.backtest import five_minute_test  # noqa: E402


def _fmt(x, nd=6):
    if x is None:
        return "n/a"
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return "n/a"
    return f"{x:.{nd}f}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="5-minute price prediction + backtest")
    ap.add_argument("--asset", default="xrp", help="ticker (xrp, btc, eth, ...)")
    ap.add_argument("--horizon-steps", type=int, default=1,
                    help="steps ahead; 1 step ~ 5 min on the days=1 series")
    ap.add_argument("--train-window", type=int, default=150)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--confidence", type=float, default=0.9)
    ap.add_argument("--max-origins", type=int, default=60)
    args = ap.parse_args(argv)

    res = five_minute_test(
        asset=args.asset,
        horizon_steps=args.horizon_steps,
        train_window=args.train_window,
        step=args.step,
        confidence=args.confidence,
        max_origins=args.max_origins,
    )

    line = "=" * 64
    print(line)
    print(f"  5-MINUTE PREDICTION  -  asset={res['asset']}")
    print(line)
    print(f"  data source         : {res['source']}")
    if res.get("honest_note"):
        print(f"  NOTE                : {res['honest_note']}")
    print(f"  points              : {res['n_points']}")
    si = res.get("sampling_interval_seconds")
    print(f"  sampling interval   : {_fmt(si, 1)} s"
          + (f"  (~{si/60:.1f} min/step)" if si else ""))
    print(f"  horizon             : {res['horizon_label']}")
    print()

    lp = res.get("live_prediction")
    if lp and lp.get("status") == "ok":
        last = lp["last_value"]
        pt = lp["point"]
        iv = lp["interval"]
        move = pt - last
        pct = (move / last * 100.0) if last else 0.0
        print("  PREDICTED PRICE (next 5 min)")
        print(f"    last price        : {_fmt(last)}")
        print(f"    point forecast    : {_fmt(pt)}   ({move:+.6f}, {pct:+.3f}%)")
        print(f"    {int(iv['confidence']*100)}% interval      : "
              f"[{_fmt(iv['low'])}, {_fmt(iv['high'])}]")
        print(f"    prob(up)          : {_fmt(lp['prob_up'], 3)}")
        print(f"    members           : ridge={_fmt(lp['members']['ridge'])}  "
              f"gbm={_fmt(lp['members']['gbm'])}")
        w = lp["weight"]
        print(f"    ensemble weights  : ridge={_fmt(w.get('ridge'),3)}  "
              f"gbm={_fmt(w.get('gbm'),3)}")
    else:
        print("  PREDICTED PRICE: insufficient data to forecast.")
        if lp:
            print(f"    reason: {lp.get('reason')}")
    print()

    bt = res.get("backtest", {})
    print(line)
    print("  SKILL SCORECARD  (walk-forward, rolling-origin, no leakage)")
    print(line)
    if bt.get("status") == "ok":
        m = bt["metrics"]
        print(f"    origins scored    : {bt['n_origins']}  "
              f"(train_window={bt['train_window']}, step={bt['step']})")
        print(f"    MAE               : {_fmt(m['mae'])}   "
              f"(persistence {_fmt(m['mae_persistence'])})")
        print(f"    RMSE              : {_fmt(m['rmse'])}   "
              f"(persistence {_fmt(m['rmse_persistence'])})")
        print(f"    directional acc.  : {_fmt(m['directional_accuracy'], 3)}")
        print(f"    interval coverage : {_fmt(m['coverage'], 3)}  "
              f"(nominal {_fmt(m['nominal_coverage'], 2)}, "
              f"err {m['coverage_error']:+.3f})")
        print(f"    mean PI width     : {_fmt(m['mean_interval_width'])}")
        print(f"    skill vs persist. : {_fmt(m['skill_score_mse'], 4)}  (MSE)   "
              f"{_fmt(m['skill_score_mae'], 4)}  (MAE)")
        ss = m["skill_score_mse"]
        verdict = ("BEATS persistence" if isinstance(ss, float) and ss > 0
                   else "does NOT beat persistence")
        print(f"    verdict           : {verdict}")
    else:
        print(f"    backtest unavailable: {bt.get('reason')}")
    print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
