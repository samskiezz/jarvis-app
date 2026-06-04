"""Multi-metric accuracy scorecard for the PATTERN ORACLE forecaster.

Reports, per asset (walk-forward, no leakage), the metrics that matter — and
deliberately shows BOTH the model and the persistence baseline on each, so the
numbers are honest:

  * LEVEL-ACC (1 - MAPE)  — the "99% accurate" headline metric. For low-volatility
    assets (e.g. S&P 500) the model AND persistence both score ~99%, proving this
    figure is a property of the price-level metric (tomorrow ≈ today), not skill.
  * within-1% / within-2%  — fraction of next-step forecasts inside ±1% / ±2% of
    the realized price (genuinely useful for risk/position sizing).
  * directional accuracy   — the HARD metric: did we get up/down right? Realistic
    range ~50-55%; this small edge is what real quant funds exploit at scale.
  * coverage               — fraction of realized values inside the conformal
    interval (calibration; target = confidence level).

  CG_API_KEY=CG-... python -m server.scripts.accuracy_scorecard
"""
from __future__ import annotations

import sys

import numpy as np

from ..services.forecaster import ShortHorizonForecaster
from ..services.scrapers import deep_history

ASSETS = [("xrp", "XRP"), ("bitcoin", "BTC"), ("ethereum", "ETH"),
          ("sp500", "S&P500"), ("nasdaq", "NASDAQ"), ("AAPL", "AAPL")]


def evaluate(series, *, train_window=250, step=25, horizon=1, conf=0.9):
    v = np.array([p["v"] for p in series], float)
    ape, pers_ape, w1, w2, dirh, cov = [], [], [], [], [], []
    for t in range(train_window, len(v) - horizon, step):
        hist = series[: t + 1]
        f = ShortHorizonForecaster()
        try:
            f.train(hist, horizon_steps=horizon)
            out = f.predict_next(hist, horizon_steps=horizon, confidence=conf)
        except Exception:  # noqa: BLE001
            continue
        point = out.get("point") if isinstance(out, dict) else None
        if point is None:
            continue
        actual, last = v[t + horizon], v[t]
        e = abs(point - actual) / abs(actual)
        ape.append(e); pers_ape.append(abs(last - actual) / abs(actual))
        w1.append(e <= 0.01); w2.append(e <= 0.02)
        dirh.append((point > last) == (actual > last))
        iv = out.get("interval") or {}
        lo, hi = iv.get("low"), iv.get("high")
        if lo is not None and hi is not None:
            cov.append(lo <= actual <= hi)
    if not ape:
        return None
    return dict(n=len(ape), model_lvl=1 - float(np.mean(ape)),
                pers_lvl=1 - float(np.mean(pers_ape)), w1=float(np.mean(w1)),
                w2=float(np.mean(w2)), d=float(np.mean(dirh)),
                c=float(np.mean(cov)) if cov else float("nan"))


def main() -> int:
    print("=" * 104)
    print("  PATTERN ORACLE — MULTI-METRIC ACCURACY (deep history, walk-forward, no leakage)")
    print("=" * 104)
    print(f"  {'asset':<8}{'n':>4}   {'MODEL lvl-acc':>13}  {'PERSIST lvl-acc':>15}"
          f"  {'within1%':>8}  {'within2%':>8}  {'direction':>9}  {'coverage':>8}")
    for sym, label in ASSETS:
        s = deep_history(sym)
        if len(s) < 400:
            print(f"  {label:<8} skip (n={len(s)})"); continue
        r = evaluate(s)
        if not r:
            print(f"  {label:<8} no result"); continue
        print(f"  {label:<8}{r['n']:>4}   {r['model_lvl']*100:>12.2f}%  {r['pers_lvl']*100:>14.2f}%"
              f"  {r['w1']*100:>7.1f}%  {r['w2']*100:>7.1f}%  {r['d']*100:>8.1f}%  {r['c']*100:>7.1f}%")
    print("=" * 104)
    print("  HONEST READING: model ~= persistence on level-acc => the '99%' is the price-level")
    print("  (MAPE) metric, not foresight. The real edge is directional ~50-55% + calibrated")
    print("  coverage. Real funds monetise that ~51-54% edge at scale; nobody has 99% foresight.")
    print("=" * 104)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
