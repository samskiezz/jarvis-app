"""Autopilot CLI — `python -m autopilot.cli <subcommand>`."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def _run_module(name: str) -> int:
    """Import + run a discover or loop module's main if present."""
    try:
        mod = __import__(name, fromlist=["*"])
        if hasattr(mod, "write_outputs"):
            intel = os.path.join(ROOT, "autopilot", "intelligence")
            state = os.path.join(ROOT, "autopilot", "state")
            try:
                mod.write_outputs(intel, state)
            except TypeError:
                mod.write_outputs(intel)
            return 0
        if hasattr(mod, "run"):
            mod.run()
            return 0
        print(f"module {name} has no entrypoint", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        print(f"{name} failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


def cmd_discover() -> int:
    rc = 0
    for m in (
        "autopilot.discover.plane_walker",
        "autopilot.discover.subsystem_extractor",
        "autopilot.discover.resource_scanner",
        "autopilot.discover.db_cataloguer",
        "autopilot.discover.capability_extractor",
        "autopilot.discover.integration_mapper",
        "autopilot.discover.unknown_finder",
        "autopilot.discover.limitation_finder",
    ):
        rc |= _run_module(m)
    print("discover: done")
    return rc


def cmd_map() -> int:
    return _run_module("autopilot.discover.plane_walker") | \
           _run_module("autopilot.discover.subsystem_extractor")


def cmd_graph() -> int:
    return _run_module("autopilot.discover.integration_mapper")


def cmd_status() -> int:
    from autopilot.control.report_writer import write_system_status
    p = write_system_status()
    print(f"status written: {p}")
    return 0


def cmd_health() -> int:
    from autopilot.control.report_writer import write_health_score
    p = write_health_score()
    print(f"health written: {p}")
    return 0


def cmd_verify() -> int:
    rc = 0
    # pytest assurance
    r = subprocess.run([os.path.join(ROOT, ".venv/bin/python"), "-m", "pytest",
                        "tests/test_assurance/", "-q"], cwd=ROOT)
    rc |= r.returncode
    # invariants
    r = subprocess.run([os.path.join(ROOT, ".venv/bin/python"), "-m",
                        "assurance.invariants.runner", "--once",
                        "--fail-on-violation"], cwd=ROOT)
    rc |= r.returncode
    # theme lock
    if os.path.exists(os.path.join(ROOT, "scripts", "check_ui_theme_lock.py")):
        r = subprocess.run(["python3", "scripts/check_ui_theme_lock.py"], cwd=ROOT)
        rc |= r.returncode
    # import sanity
    r = subprocess.run([os.path.join(ROOT, ".venv/bin/python"), "-c",
                        "import server.main; print('server.main OK')"], cwd=ROOT)
    rc |= r.returncode
    return rc


def cmd_test() -> int:
    r = subprocess.run([os.path.join(ROOT, ".venv/bin/python"), "-m", "pytest",
                        "tests/test_autopilot/", "tests/test_assurance/", "-q"],
                       cwd=ROOT)
    return r.returncode


def cmd_build() -> int:
    # sanity check only - no deploy
    return _run_module("autopilot.discover.subsystem_extractor")


def cmd_run_safe() -> int:
    """Perception + planning + action (safe class only)."""
    rc = _run_module("autopilot.loops.perception")
    rc |= _run_module("autopilot.loops.planning")
    rc |= _run_module("autopilot.loops.autonomic")
    rc |= _run_module("autopilot.loops.action")
    return rc


def cmd_repair_safe() -> int:
    rc = _run_module("autopilot.loops.perception")
    rc |= _run_module("autopilot.loops.planning")
    rc |= _run_module("autopilot.loops.action")
    rc |= _run_module("autopilot.loops.evaluation")
    return rc


def cmd_improve(args: argparse.Namespace) -> int:
    return _run_module("autopilot.loops.improvement")


def cmd_benchmark() -> int:
    try:
        from assurance.telemetry.snapshot import get_snapshot
        snap = get_snapshot()
        print(json.dumps({"health": snap.get("health"),
                          "metrics_n": len(snap.get("metrics", {}))}, indent=2))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"benchmark error: {exc}", file=sys.stderr)
        return 2


def cmd_report() -> int:
    from autopilot.control.report_writer import write_system_status, write_health_score
    write_system_status()
    write_health_score()
    print("reports regenerated")
    return 0


def cmd_full() -> int:
    rc = cmd_discover()
    rc |= cmd_graph()
    rc |= cmd_health()
    rc |= cmd_verify()
    rc |= cmd_run_safe()
    rc |= cmd_improve(argparse.Namespace())
    rc |= cmd_report()
    return rc


def cmd_loop(args: argparse.Namespace) -> int:
    interval = int(os.environ.get("AUTOPILOT_INTERVAL_S", "900"))
    once = args.once
    safe = args.safe
    n = 0
    while True:
        n += 1
        rc = _run_module("autopilot.loops.proposal_triage")
        rc |= _run_module("autopilot.loops.perception")
        rc |= _run_module("autopilot.loops.planning")
        rc |= _run_module("autopilot.loops.autonomic")
        if safe or not args.unsafe:
            rc |= _run_module("autopilot.loops.action")
            rc |= _run_module("autopilot.loops.evaluation")
            rc |= _run_module("autopilot.loops.improvement")
        cmd_report()
        if once:
            return rc
        print(f"[autopilot] loop iter={n} rc={rc}; sleeping {interval}s")
        time.sleep(interval)


def cmd_dry_run(args: argparse.Namespace) -> int:
    from autopilot.control.action_runner import ActionRunner
    runner = ActionRunner()
    r = runner.execute(name=args.target, dry_run=True)
    print(json.dumps(r, indent=2))
    return 0 if r.get("ok") else 2


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="autopilot",
                                  description="Repo-level autopilot CLI")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("discover", "map", "graph", "status", "health", "verify",
                  "test", "build", "run-safe", "repair-safe", "benchmark",
                  "report", "full"):
        sub.add_parser(name)
    imp = sub.add_parser("improve")
    imp.add_argument("--safe", action="store_true")
    imp.add_argument("--dry-run", action="store_true")
    imp.add_argument("--propose", action="store_true")
    lp = sub.add_parser("loop")
    lp.add_argument("--once", action="store_true")
    lp.add_argument("--continuous", action="store_true")
    lp.add_argument("--safe", action="store_true")
    lp.add_argument("--unsafe", action="store_true")
    dr = sub.add_parser("dry-run")
    dr.add_argument("target")

    args = p.parse_args(argv)
    cmd = args.cmd
    dispatch = {
        "discover": cmd_discover, "map": cmd_map, "graph": cmd_graph,
        "status": cmd_status, "health": cmd_health, "verify": cmd_verify,
        "test": cmd_test, "build": cmd_build, "run-safe": cmd_run_safe,
        "repair-safe": cmd_repair_safe, "benchmark": cmd_benchmark,
        "report": cmd_report, "full": cmd_full,
    }
    if cmd in dispatch:
        return dispatch[cmd]()
    if cmd == "improve":
        return cmd_improve(args)
    if cmd == "loop":
        return cmd_loop(args)
    if cmd == "dry-run":
        return cmd_dry_run(args)
    print(f"unknown subcommand: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
