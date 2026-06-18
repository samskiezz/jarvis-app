"""Smoke test that the fuzz harness runs and doesn't crash."""
import subprocess
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_fuzz_smoke_no_crashes():
    # 50 iterations is enough for CI; no crash + clean exit.
    cmd = [sys.executable, "-m", "assurance.fuzz.api_fuzzer", "--seed", "7", "--iter", "50"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=ROOT)
    # Exit 0 means no crashes/secret leaks/inv violations even if some commands fail (expected).
    assert r.returncode == 0, f"fuzz failed: stdout={r.stdout[-400:]} stderr={r.stderr[-400:]}"
    assert "crashes" in r.stdout
