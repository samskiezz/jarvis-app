"""Cover the Prometheus exporter + invariant-runner CLI."""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_prom_export_renders_each_kind():
    from assurance.telemetry.metrics import registry
    from assurance.telemetry.export import to_prometheus

    registry.counter("a_total").inc()
    registry.gauge("b").set(42)
    registry.histogram("c_seconds").observe(0.5)

    out = to_prometheus()
    assert "TYPE a_total counter" in out
    assert "TYPE b gauge" in out
    assert "TYPE c_seconds histogram" in out
    assert "c_seconds_count " in out
    assert "c_seconds_bucket" in out


def test_runner_cli_emits_json_report():
    r = subprocess.run(
        [sys.executable, "-m", "assurance.invariants.runner", "--once", "--json"],
        capture_output=True, text=True, timeout=30, cwd=ROOT,
    )
    assert r.returncode == 0, r.stderr
    # Last line is the JSON blob
    last = [ln for ln in r.stdout.strip().splitlines() if ln.strip()][-1]
    data = json.loads(last)
    assert data["total"] == 10
    assert "results" in data and len(data["results"]) == 10
    assert data["overall_ok"] in (True, False)


def test_runner_cli_text_format():
    r = subprocess.run(
        [sys.executable, "-m", "assurance.invariants.runner", "--once"],
        capture_output=True, text=True, timeout=30, cwd=ROOT,
    )
    assert r.returncode == 0, r.stderr
    assert "[invariants] overall_ok=" in r.stdout
    assert "PASS" in r.stdout or "FAIL" in r.stdout


def test_invariant_fuzz_cli_runs():
    r = subprocess.run(
        [sys.executable, "-m", "assurance.fuzz.invariant_fuzz", "--seed", "1", "--walks", "20"],
        capture_output=True, text=True, timeout=60, cwd=ROOT,
    )
    assert r.returncode == 0
    data = json.loads(r.stdout)
    for wf_name in ("claude_run", "gpu_lifecycle", "chat_request"):
        assert wf_name in data
        assert data[wf_name]["walks"] == 20


def test_redact_passes_through_complex_nested():
    from assurance.audit.redact import redact_value
    nested = {"outer": {"password": "p4ss", "list": [{"api_key": "sk-LEAK1234567890abcdefgh"}]}}
    out = redact_value(nested)
    assert out["outer"]["password"] == "***REDACTED***"
    assert out["outer"]["list"][0]["api_key"] == "***REDACTED***"


def test_runner_write_report_persists_json(tmp_path, monkeypatch):
    from assurance.invariants import runner
    runner.REPORT_DIR = str(tmp_path)
    monkeypatch.setattr(runner, "REPORT_DIR", str(tmp_path))
    monkeypatch.setattr(runner, "latest_report_path", lambda: str(tmp_path / "latest.json"))
    rep = runner.run_all()
    path = runner.write_report(rep)
    assert os.path.exists(path)
    data = runner.read_latest_report()
    assert data and data["total"] == 10
