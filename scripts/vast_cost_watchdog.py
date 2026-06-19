#!/usr/bin/env python3
"""Polls Vast user-info, computes monthly projection, emits cost.alert on threshold."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

INTERVAL_S = int(os.environ.get("VAST_COST_INTERVAL_S", "1800"))
ALERT_MONTHLY_USD = float(os.environ.get("VAST_COST_ALERT_MONTHLY_USD", "50"))
LOW_CREDIT_USD = float(os.environ.get("VAST_LOW_CREDIT_USD", "5"))
REPORT_DIR = os.path.join(ROOT, "autopilot", "reports")
STATE_PATH = os.path.join(ROOT, "autopilot", "state", "vast-cost.json")


def _api_key() -> str:
    k = os.environ.get("VAST_API_KEY", "").strip()
    if k:
        return k
    try:
        return open("/opt/jarvis-app-1/server/data/.vast_key").read().strip()
    except OSError:
        return ""


def fetch() -> dict:
    key = _api_key()
    if not key:
        return {"ok": False, "error": "no_api_key"}
    try:
        req = urllib.request.Request("https://console.vast.ai/api/v0/users/current/")
        req.add_header("Authorization", f"Bearer {key}")
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read())
        return {"ok": True, "data": d}
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
        return {"ok": False, "error": str(exc)[:160]}


def _emit_alert(kind: str, detail: dict) -> None:
    try:
        from assurance.events.bus import get_bus
        from assurance.events.types import Event
        get_bus().append(Event(name=f"cost.{kind}", actor="vast_cost_watchdog",
                               source="scripts.vast_cost_watchdog",
                               payload=detail))
    except Exception:  # noqa: BLE001
        pass
    os.makedirs(REPORT_DIR, exist_ok=True)
    ts = int(time.time())
    path = os.path.join(REPORT_DIR, f"cost-alert-{kind}-{ts}.md")
    try:
        with open(path, "w") as fh:
            fh.write(f"# Cost alert: {kind}\n\n")
            fh.write(f"At {ts} (Unix): {json.dumps(detail, indent=2)}\n")
    except OSError:
        pass


def run_once() -> dict:
    res = fetch()
    if not res.get("ok"):
        return res
    d = res["data"]
    credit = float(d.get("credit") or 0)
    per_hour = float(d.get("current_billed_per_hour") or 0)
    monthly = per_hour * 24 * 30
    alerts: list[str] = []
    if monthly > ALERT_MONTHLY_USD:
        alerts.append("over_threshold")
        _emit_alert("over_threshold", {
            "monthly_projection_usd": round(monthly, 2),
            "threshold_usd": ALERT_MONTHLY_USD,
            "current_billed_per_hour": per_hour,
        })
    if credit < LOW_CREDIT_USD:
        alerts.append("low_credit")
        _emit_alert("low_credit", {"credit_usd": credit, "threshold_usd": LOW_CREDIT_USD})
    state = {"ts": time.time(), "credit": credit,
             "per_hour": per_hour, "monthly": monthly, "alerts": alerts}
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w") as fh:
        json.dump(state, fh, indent=2)
    return state


def main() -> int:
    while True:
        try:
            s = run_once()
            print(f"[vast-cost] credit=${s.get('credit', 0):.2f} "
                  f"per_hour=${s.get('per_hour', 0):.4f} "
                  f"monthly=${s.get('monthly', 0):.2f} "
                  f"alerts={s.get('alerts', [])}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[vast-cost] err: {exc}", flush=True)
        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    sys.exit(main())
