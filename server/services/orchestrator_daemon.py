"""ORCHESTRATOR DAEMON — non-stop live-data producer (bounded + crash-isolated).

Each cycle runs topic_orchestrator.run_all in a SUBPROCESS with a hard timeout, so a slow or hanging
external API can never wedge the box. Injects fresh live measurements every cycle (cities ×
weather/air/marine + earthquakes/flights/crypto) — the genuinely infinite data source that keeps the
"Measurements" number growing. Robust: timeouts + errors are caught and it simply retries next cycle.

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.services.orchestrator_daemon
Env:  ORCH_CITIES (default 60), ORCH_INTERVAL_S (default 600), ORCH_CYCLE_TIMEOUT (default 480)
"""
from __future__ import annotations

import os
import subprocess
import sys
import time

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CITIES = int(os.environ.get("ORCH_CITIES", "60"))
INTERVAL = int(os.environ.get("ORCH_INTERVAL_S", "600"))
CYCLE_TIMEOUT = int(os.environ.get("ORCH_CYCLE_TIMEOUT", "480"))
_CODE = f"from server.services import topic_orchestrator as TO; print('RESULT', TO.run_all(cities_limit={CITIES}))"


def run_forever() -> None:
    print(f"[orchestrator] starting — {CITIES} cities/cycle, every {INTERVAL}s, cycle cap {CYCLE_TIMEOUT}s",
          flush=True)
    while True:
        t = time.time()
        try:
            r = subprocess.run([sys.executable, "-u", "-c", _CODE], cwd=REPO,
                               timeout=CYCLE_TIMEOUT, capture_output=True, text=True)
            tail = next((ln for ln in reversed((r.stdout or "").splitlines()) if "RESULT" in ln),
                        (r.stderr or "").strip()[-160:] or "(no output)")
            print(f"[orchestrator] cycle {time.time()-t:.0f}s rc={r.returncode} | {tail[:200]}", flush=True)
        except subprocess.TimeoutExpired:
            print(f"[orchestrator] cycle hit {CYCLE_TIMEOUT}s cap — killed, retry next cycle", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[orchestrator] error: {str(e)[:160]}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    run_forever()
