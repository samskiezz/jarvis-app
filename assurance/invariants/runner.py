"""Invariant runner with JSON report output."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any

from pydantic import BaseModel

from .registry import REGISTRY, build_snapshot

REPORT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "server", "data", "assurance", "reports",
)
os.makedirs(REPORT_DIR, exist_ok=True)


class InvariantResult(BaseModel):
    name: str
    passed: bool
    evidence: str


class InvariantReport(BaseModel):
    started_at: float
    finished_at: float
    duration_ms: float
    total: int
    passed: int
    failed: int
    overall_ok: bool
    results: list[InvariantResult]


def run_all(snapshot: dict[str, Any] | None = None) -> InvariantReport:
    started = time.time()
    snap = snapshot if snapshot is not None else build_snapshot()
    results: list[InvariantResult] = []
    for name, fn in REGISTRY.items():
        try:
            passed, evidence = fn(snap)
        except Exception as exc:  # noqa: BLE001
            passed, evidence = False, f"runner_error: {type(exc).__name__}: {exc}"
        results.append(InvariantResult(name=name, passed=bool(passed), evidence=str(evidence)))
    finished = time.time()
    passed_n = sum(1 for r in results if r.passed)
    return InvariantReport(
        started_at=started,
        finished_at=finished,
        duration_ms=(finished - started) * 1000.0,
        total=len(results),
        passed=passed_n,
        failed=len(results) - passed_n,
        overall_ok=(passed_n == len(results)),
        results=results,
    )


def latest_report_path() -> str:
    return os.path.join(REPORT_DIR, "latest_invariants.json")


def write_report(report: InvariantReport) -> str:
    path = latest_report_path()
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(report.model_dump(), fh, separators=(",", ":"))
    except OSError:
        pass
    return path


def read_latest_report() -> dict | None:
    path = latest_report_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def main() -> int:
    p = argparse.ArgumentParser(description="Run all assurance invariants.")
    p.add_argument("--once", action="store_true", help="run once and exit (default).")
    p.add_argument("--loop", type=int, default=0, help="loop forever, sleeping N s between runs.")
    p.add_argument("--json", action="store_true", help="print full report JSON.")
    p.add_argument("--fail-on-violation", action="store_true",
                   help="exit non-zero if any invariant fails.")
    args = p.parse_args()

    def _once() -> int:
        rep = run_all()
        write_report(rep)
        if args.json:
            print(json.dumps(rep.model_dump(), separators=(",", ":")))
        else:
            print(f"[invariants] overall_ok={rep.overall_ok} "
                  f"passed={rep.passed}/{rep.total} duration_ms={rep.duration_ms:.2f}")
            for r in rep.results:
                mark = "PASS" if r.passed else "FAIL"
                print(f"  {mark}  {r.name}: {r.evidence}")
        return 0 if (rep.overall_ok or not args.fail_on_violation) else 2

    if args.loop > 0:
        rc = 0
        while True:
            rc = _once()
            time.sleep(args.loop)
        return rc  # unreachable
    return _once()


if __name__ == "__main__":
    sys.exit(main())
