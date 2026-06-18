"""CLI: subcommand dispatch + dry-run output."""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _run(args, timeout=30):
    return subprocess.run(
        [sys.executable, "-m", "autopilot.cli", *args],
        capture_output=True, text=True, timeout=timeout, cwd=ROOT,
    )


def test_cli_status_writes_report():
    r = _run(["status"])
    assert r.returncode == 0
    assert "status written" in r.stdout


def test_cli_health_writes_report():
    r = _run(["health"])
    assert r.returncode == 0


def test_cli_map_runs():
    r = _run(["map"], timeout=60)
    assert r.returncode == 0


def test_cli_dry_run_safe_command():
    r = _run(["dry-run", "noop.echo"])
    # exit 0 and JSON payload printed
    assert r.returncode == 0
    parsed = json.loads(r.stdout)
    assert parsed["ok"] is True


def test_cli_dry_run_blocked_command():
    r = _run(["dry-run", "gpu.dispose"])
    # blocked → exit 2
    assert r.returncode == 2
    parsed = json.loads(r.stdout)
    assert parsed["ok"] is False
    assert parsed["verdict"]["blocked"] is True
