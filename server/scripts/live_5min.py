"""Live 5-minute forward-test runner (real moving prices).

Each invocation:
  1. fetches the latest ~5-min CoinGecko bars for each asset,
  2. RESOLVES any pending prediction whose target bar has now closed — scoring it
     against the real realized price (level error, direction, interval coverage),
  3. ISSUES a fresh prediction for the next 5-min bar (trains the forecaster on the
     live series), persisting it,
  4. prints one live scorecard line (cumulative, since the state file was created).

State persists in JSON so a scheduler (Monitor) can call this every ~5 minutes and
the scorecard accumulates against genuinely out-of-sample, forward-in-time prices —
no look-ahead possible (we only ever score a bar after it has closed).

  CG_API_KEY=CG-... python -m server.scripts.live_5min
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from ..services.forecaster import ShortHorizonForecaster
from ..services.prediction import load_crypto_series

ASSETS = ["xrp", "bitcoin", "ethereum"]
STATE = Path(os.environ.get("LIVE5_STATE", "/tmp/live5min_state.json"))


def _load_state() -> dict:
    if STATE.exists():
        try:
            return json.loads(STATE.read_text())
        except Exception:  # noqa: BLE001
            pass
    return {"pending": {}, "tally": {}, "started": time.time()}


def _save_state(st: dict) -> None:
    STATE.write_text(json.dumps(st))


def main() -> int:
    st = _load_state()
    pend = st["pending"]
    tally = st["tally"]
    for a in ASSETS:
        series = load_crypto_series(a, 1)  # ~5-min granularity
        if len(series) < 80:
            continue
        last_t, last_v = int(series[-1]["t"]), float(series[-1]["v"])

        # 1+2. resolve a pending prediction if its target bar has closed
        p = pend.get(a)
        if p and last_t >= p["target_t"]:
            actual = last_v
            t = tally.setdefault(a, {"n": 0, "dir": 0, "cov": 0, "ape": 0.0})
            t["n"] += 1
            t["ape"] += abs(p["point"] - actual) / abs(actual)
            t["dir"] += int((p["point"] > p["from_v"]) == (actual > p["from_v"]))
            t["cov"] += int(p["low"] <= actual <= p["high"])
            pend.pop(a, None)

        # 3. issue a fresh prediction for the next bar (if none pending)
        if a not in pend:
            f = ShortHorizonForecaster()
            try:
                f.train(series, horizon_steps=1)
                o = f.predict_next(series, horizon_steps=1, confidence=0.9)
                if o.get("point") is not None:
                    iv = o.get("interval") or {}
                    step = (int(series[-1]["t"]) - int(series[-2]["t"])) or 300000
                    pend[a] = {
                        "from_v": last_v, "point": float(o["point"]),
                        "low": float(iv.get("low", o["point"])),
                        "high": float(iv.get("high", o["point"])),
                        "target_t": last_t + step, "issued": time.time(),
                    }
            except Exception:  # noqa: BLE001
                pass

    _save_state(st)

    # 4. cumulative live scorecard line
    parts = []
    tot_n = tot_dir = tot_cov = 0
    tot_ape = 0.0
    for a in ASSETS:
        t = tally.get(a)
        if not t or t["n"] == 0:
            continue
        tot_n += t["n"]; tot_dir += t["dir"]; tot_cov += t["cov"]; tot_ape += t["ape"]
        parts.append(f"{a}:n={t['n']} dir={t['dir']/t['n']*100:.0f}% lvl={ (1-t['ape']/t['n'])*100:.3f}%")
    age = (time.time() - st["started"]) / 60.0
    if tot_n:
        print(f"[live5m +{age:.0f}m] scored={tot_n}  "
              f"dir-acc={tot_dir/tot_n*100:.1f}%  level-acc={(1-tot_ape/tot_n)*100:.3f}%  "
              f"coverage={tot_cov/tot_n*100:.1f}%  | " + "  ".join(parts), flush=True)
    else:
        print(f"[live5m +{age:.0f}m] {len(pend)} prediction(s) issued, awaiting bar close to score",
              flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
