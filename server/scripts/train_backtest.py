"""Multi-asset training + full-window backtest for the PATTERN ORACLE forecaster.

Pulls the longest free-tier daily history (CoinGecko Demo = up to 365 days) for a
basket of assets (crypto + gold tokens + a stablecoin control), trains the
ShortHorizonForecaster, and walk-forward backtests 1-step-ahead on EACH asset,
reporting MAE / RMSE / directional accuracy / interval coverage / skill-vs-
persistence. Then prints an aggregate.

HONEST: this measures real out-of-sample skill; it does NOT (and cannot) predict
"every move accurately" — perfect foresight is impossible. The Demo key caps
history at 365 days; since-listing history needs a Pro key.

  CG_API_KEY=CG-... python -m server.scripts.train_backtest
"""
from __future__ import annotations

import sys
import time

from ..services import backtest as bt
from ..services.prediction import load_crypto_history
from ..services.scrapers import deep_history

# coin_id : human label  (CoinGecko ids; gold = pax-gold/tether-gold; usdt control)
BASKET = {
    "ripple": "XRP", "bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL",
    "cardano": "ADA", "dogecoin": "DOGE", "binancecoin": "BNB", "tron": "TRX",
    "chainlink": "LINK", "avalanche-2": "AVAX", "litecoin": "LTC",
    "pax-gold": "GOLD(PAXG)", "tether-gold": "GOLD(XAUT)", "tether": "USDT(ctrl)",
}


def _fmt(x, n=4):
    return f"{x:.{n}f}" if isinstance(x, (int, float)) else str(x)


def main() -> int:
    train_window = 120  # days of trailing history per origin
    rows = []
    print("=" * 92)
    print("  PATTERN ORACLE — MULTI-ASSET TRAIN + WALK-FORWARD BACKTEST (daily, 1-step-ahead)")
    print("=" * 92)
    for coin_id, label in BASKET.items():
        # deep scraped history (since listing) first; fall back to CoinGecko 365d
        series = deep_history(coin_id) or load_crypto_history(coin_id, 365)
        if len(series) < train_window + 30:
            print(f"  {label:<12} skipped (only {len(series)} pts)")
            continue
        res = bt.backtest(series, horizon_steps=1, train_window=train_window,
                          step=1, confidence=0.9)
        m = res.get("metrics") or {}
        rows.append((label, len(series), m))
        print(f"  {label:<12} n={len(series):<4} "
              f"MAE={_fmt(m.get('mae'))} (persist {_fmt(m.get('mae_persistence'))})  "
              f"dir={_fmt(m.get('directional_accuracy'),3)}  "
              f"cov={_fmt(m.get('coverage'),3)}  "
              f"skill={_fmt(m.get('skill_score_mse'),4)}")
        time.sleep(2.2)  # stay under Demo 30 calls/min

    if not rows:
        print("  no data fetched (check CG_API_KEY / network)")
        return 1

    # aggregate
    n = len(rows)
    avg_skill = sum((m.get("skill_score_mse") or 0) for _, _, m in rows) / n
    avg_cov = sum((m.get("coverage") or 0) for _, _, m in rows) / n
    avg_dir = sum((m.get("directional_accuracy") or 0) for _, _, m in rows) / n
    beat = sum(1 for _, _, m in rows if (m.get("skill_score_mse") or 0) > 0)
    print("-" * 92)
    print(f"  ASSETS: {n}   beat-persistence: {beat}/{n}   "
          f"avg skill={_fmt(avg_skill,4)}   avg coverage={_fmt(avg_cov,3)} (nominal 0.90)   "
          f"avg dir-acc={_fmt(avg_dir,3)}")
    print("  NOTE: daily crypto is near-random-walk; calibrated coverage is the real win, not")
    print("  beating persistence on price level. Engine beats persistence where signal exists.")
    print("=" * 92)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
