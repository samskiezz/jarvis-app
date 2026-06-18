"""pm2-friendly loop runner for the assurance invariant pass.

Runs `assurance.invariants.runner.run_all` every N seconds and writes the report.
"""
from __future__ import annotations

import os
import time

from assurance.invariants.runner import run_all, write_report

INTERVAL_S = int(os.environ.get("ASSURANCE_INTERVAL_S", "60"))


def main() -> int:
    while True:
        try:
            rep = run_all()
            write_report(rep)
            print(f"[assurance] overall_ok={rep.overall_ok} "
                  f"passed={rep.passed}/{rep.total} duration_ms={rep.duration_ms:.2f}",
                  flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[assurance] runner failed: {type(exc).__name__}: {exc}", flush=True)
        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    raise SystemExit(main())
