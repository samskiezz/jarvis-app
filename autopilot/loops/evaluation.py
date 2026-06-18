"""Evaluation loop: compares before/after; scores impact."""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from autopilot.control import state_store
from autopilot.control.report_writer import write_health_score

REPORTS_DIR = os.path.join(ROOT, "autopilot", "reports")


def run() -> dict[str, Any]:
    run_id = state_store.new_run_id()
    started = time.time()

    # Compare last_health vs current
    prev = state_store.read_kv("last-health.json", {})
    write_health_score()
    cur_path = os.path.join(REPORTS_DIR, "health-score.json")
    cur: dict[str, Any] = {}
    if os.path.exists(cur_path):
        with open(cur_path) as fh:
            cur = json.load(fh)
    delta = cur.get("health_score", 0) - prev.get("health_score", 0)
    state_store.observe(run_id, "evaluation.health_delta",
                         {"delta": delta, "now": cur.get("health_score"),
                          "prev": prev.get("health_score")})
    state_store.write_kv("last-health.json", cur)

    finished = time.time()
    out = {
        "run_id": run_id,
        "started_at": started,
        "finished_at": finished,
        "duration_ms": (finished - started) * 1000.0,
        "health_score_now": cur.get("health_score"),
        "health_score_prev": prev.get("health_score"),
        "delta": delta,
        "regressed": delta < 0,
    }
    if delta < 0:
        state_store.learn(run_id, f"health regressed by {abs(delta)} points")
    elif delta > 0:
        state_store.learn(run_id, f"health improved by {delta} points")
    with open(os.path.join(REPORTS_DIR, "evaluation-report.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    with open(os.path.join(REPORTS_DIR, "evaluation-report.md"), "w") as fh:
        fh.write(
            f"# Evaluation ({int(started)})\n\n"
            f"Health score: {out['health_score_now']} (prev: {out['health_score_prev']}, delta: {delta:+d})\n"
        )
    return out


if __name__ == "__main__":
    o = run()
    print(f"evaluation: health={o['health_score_now']} (delta={o['delta']:+d})")
