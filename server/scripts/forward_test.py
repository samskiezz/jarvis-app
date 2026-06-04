"""CLI for the PATTERN ORACLE live forward-test loop (issue -> resolve -> score).

Two modes:

  * DEFAULT (live):  issue a forecast for a basket of assets at a horizon, score
    any matured forecasts, and print the rolling skill scorecard from the History
    Lake (n, MAE, RMSE, coverage, mean skill-vs-baseline, directional accuracy).
    This touches the network (live feeds) and the on-disk History Lake DB, so it
    is the operator-run command that actually accumulates live skill over time.

        python3 -m server.scripts.forward_test --assets xrp,bitcoin,sp500 --horizon 1

  * --simulate:  PROVE the full closed loop end-to-end WITHOUT waiting real time.
    Using deep history (or a deterministic synthetic series when offline), it
    replays a set of as-of dates T: issue a forecast AS-OF T training ONLY on data
    <= T, immediately resolve against the KNOWN T+horizon value, and record
    forecast + outcome + score in a TEMP History Lake DB — then print the
    accumulated live-style scorecard. Fully deterministic; the on-disk lake is
    never touched.

        python3 -m server.scripts.forward_test --simulate --assets xrp,bitcoin

Run from the repo root (``/home/user/jarvis-app``).
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys
import tempfile
from pathlib import Path

# Allow ``python3 server/scripts/forward_test.py`` as well as ``-m``.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

DEFAULT_ASSETS = ["xrp", "bitcoin", "sp500"]


# ── source inference + synthetic offline series ───────────────────────────────
def _infer_source(asset: str) -> str:
    """Stocks/indices resolve via scrapers; everything else via the crypto feed."""
    a = asset.lower().strip()
    if a in {"sp500", "s&p500", "spx", "nasdaq", "ndx", "dow", "djia"} or asset.startswith("^"):
        return "stock"
    if asset.isupper() and asset.isalpha() and len(asset) <= 5 and a not in {
        "xrp", "btc", "eth", "sol", "ada", "bnb", "trx", "ltc", "link",
    }:
        return "stock"
    return "crypto"


def _synthetic_series(asset: str, *, n: int = 320, seed: int = 0) -> list[dict]:
    """Deterministic GBM-like daily price series, used by --simulate when the live
    deep-history feed is unreachable (so the loop is always demonstrable offline)."""
    rng = random.Random(f"{asset}:{seed}")
    t0 = 1_600_000_000_000
    day = 86_400_000
    mu, sigma = 0.0006, 0.018
    v = 100.0 + 50.0 * rng.random()
    out = []
    for i in range(n):
        v *= math.exp(rng.gauss(mu, sigma))
        out.append({"t": t0 + i * day, "v": round(v, 6)})
    return out


def _print_scorecard(title: str, card: dict) -> None:
    def f(x, pct=False):
        if x is None:
            return "  n/a"
        return f"{x * 100:6.2f}%" if pct else f"{x:.6g}"

    print("=" * 78)
    print(f"  {title}")
    print("=" * 78)
    print(f"  n_scored            : {card.get('n_scored', 0)}")
    print(f"  MAE                 : {f(card.get('mae'))}")
    print(f"  RMSE                : {f(card.get('rmse'))}")
    print(f"  coverage            : {f(card.get('coverage'), pct=True)}")
    print(f"  mean skill-vs-base  : {f(card.get('mean_skill_vs_baseline'))}")
    print(f"  directional acc     : {f(card.get('directional_accuracy'), pct=True)}"
          f"   (n={card.get('n_directional', 0)})")
    print("=" * 78)


# ── modes ─────────────────────────────────────────────────────────────────────
def run_live(assets: list[str], *, horizon: int, model: str) -> int:
    from server.services import forward_test as ft
    from server.services import history_lake as hl

    hl.init_db()
    print(f"Issuing {len(assets)} forecast(s) at horizon={horizon} step(s)...")
    for asset in assets:
        source = _infer_source(asset)
        res = ft.issue_forecast(asset, horizon_steps=horizon, source=source, model=model)
        if res.get("status") == "ok":
            print(f"  + {asset:<10} [{source}] point={res['point']:.6g} "
                  f"id={res['id'][:8]} resolve_ts={res['resolve_ts']}")
        else:
            print(f"  - {asset:<10} skipped: {res.get('reason')}")

    out = ft.score_due()
    print(f"\nScored {out['scored']} matured forecast(s).")
    _print_scorecard("LIVE FORWARD-TEST SCORECARD (crypto domain)", out["skill_summary"])
    return 0


def run_simulate(assets: list[str], *, horizon: int, n_origins: int, model: str,
                 train_window: int) -> int:
    from server.services import forward_test as ft
    from server.services import history_lake as hl

    # temp History Lake DB so the on-disk lake is never touched
    tmpdir = tempfile.mkdtemp(prefix="ft_sim_")
    db_path = os.path.join(tmpdir, "sim_lake.db")
    os.environ["HISTORY_LAKE_DB"] = db_path
    hl.init_db(db_path)

    print(f"--simulate: replaying issue->resolve->score for {assets} "
          f"(horizon={horizon}, origins={n_origins}) in temp DB {db_path}")

    series_by_asset: dict[str, list[dict]] = {}
    for asset in assets:
        source = _infer_source(asset)
        try:
            from server.services.scrapers import deep_history

            s = deep_history(asset)
        except Exception:  # noqa: BLE001
            s = []
        if len(s) < train_window + horizon + 5:
            s = _synthetic_series(asset)
            print(f"  (offline) using synthetic series for {asset} (n={len(s)})")
        else:
            print(f"  using deep-history series for {asset} (n={len(s)})")
        series_by_asset[asset] = s

    out = ft.simulate_forward_test(
        assets,
        horizon_steps=horizon,
        n_origins=n_origins,
        train_window=train_window,
        model=model,
        db_path=db_path,
        series_by_asset=series_by_asset,
        fast=True,
    )
    print(f"\nIssued {out['issued']} forecast(s); scored {out['scored']} against "
          f"KNOWN realized values.")
    _print_scorecard("SIMULATED CLOSED-LOOP SCORECARD (deterministic replay)",
                     out["scorecard"])
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="PATTERN ORACLE live forward-test loop CLI")
    ap.add_argument("--assets", default=",".join(DEFAULT_ASSETS),
                    help="comma-separated basket (default: xrp,bitcoin,sp500)")
    ap.add_argument("--horizon", type=int, default=1, help="forecast horizon in steps")
    ap.add_argument("--model", default="ml", help="forecaster: ml | short")
    ap.add_argument("--simulate", action="store_true",
                    help="prove the closed loop deterministically (temp DB, no waiting)")
    ap.add_argument("--origins", type=int, default=8, help="[simulate] as-of dates per asset")
    ap.add_argument("--train-window", type=int, default=250,
                    help="[simulate] min points before the first origin")
    args = ap.parse_args(argv)

    assets = [a.strip() for a in args.assets.split(",") if a.strip()]
    if args.simulate:
        return run_simulate(assets, horizon=args.horizon, n_origins=args.origins,
                            model=args.model, train_window=args.train_window)
    return run_live(assets, horizon=args.horizon, model=args.model)


if __name__ == "__main__":
    raise SystemExit(main())
