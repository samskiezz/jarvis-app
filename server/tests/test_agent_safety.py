"""Agent OS destructive-operation safety hardening — verifies the P0 fixes:
real backup-before-destroy, append-only audit log, deeper hard-deny, and the
fail-closed approval gate (an unspecified high-risk step must REJECT, not auto-run).
"""
from __future__ import annotations

import json
import os

from server.agent import audit as A
from server.agent import core as C
from server.agent import permission as P
from server.agent import tools as T


# ─────────────────────────── real backups ───────────────────────────

def test_backup_paths_copies_bytes_before_destroy(tmp_path, monkeypatch):
    monkeypatch.setattr(T, "BACKUP_ROOT", str(tmp_path / "backups"))
    f = tmp_path / "orig.txt"
    f.write_text("ORIGINAL CONTENT", encoding="utf-8")
    res = T.backup_paths([str(f)], reason="unit")
    item = res["items"][0]
    assert item.get("backup") and os.path.isfile(item["backup"])
    assert open(item["backup"], encoding="utf-8").read() == "ORIGINAL CONTENT"


def test_backup_refuses_oversize(tmp_path, monkeypatch):
    monkeypatch.setattr(T, "BACKUP_ROOT", str(tmp_path / "backups"))
    monkeypatch.setattr(T, "BACKUP_MAX_BYTES", 4)
    f = tmp_path / "big.txt"
    f.write_text("way over the tiny cap", encoding="utf-8")
    res = T.backup_paths([str(f)])
    assert res["items"][0].get("skipped")  # refused rather than copied


def test_backup_skips_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(T, "BACKUP_ROOT", str(tmp_path / "backups"))
    res = T.backup_paths([str(tmp_path / "does-not-exist")])
    assert res["items"] == []  # nothing to back up, no crash


# ─────────────────────────── audit log ───────────────────────────

def test_audit_appends_jsonl(tmp_path, monkeypatch):
    log = tmp_path / "audit.jsonl"
    monkeypatch.setattr(A, "LOG_PATH", str(log))
    A.record("verdict", run_id="r1", tool="file.write", risk="safe_write")
    A.record("executed", run_id="r1", tool="file.write", result_summary="wrote 5 bytes")
    lines = log.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["event"] == "verdict"
    assert json.loads(lines[1])["result_summary"] == "wrote 5 bytes"


# ─────────────────────────── deeper hard-deny ───────────────────────────

def test_hard_deny_new_patterns():
    for cmd in ("git reset --hard HEAD~3", "rm -rf /opt/jarvis-app-1",
                "chmod -R 000 /opt", "git clean -fd"):
        v = P.decide("shell.exec", {"command": cmd})
        assert v["mode"] == "deny", f"{cmd!r} should be hard-denied, got {v}"


def test_benign_command_not_denied():
    v = P.decide("file.search", {"query": "rm something in a comment"})
    assert v["mode"] != "deny"


# ─────────────────────────── fail-closed approval gate ───────────────────────────

def test_continue_run_fails_closed_on_unspecified_destructive():
    """A destructive step with NO explicit approval must reject (fail closed),
    where the old behaviour auto-approved it."""
    reg = C._tools
    dest = next((t for t in reg.ids() if getattr(reg.get(t), "risk", None) == "destructive"), None)
    assert dest, "expected a destructive tool to be registered"
    run = C.CORE._new_run("verify", {
        "summary": "v", "source": "test",
        "steps": [{"tool": dest, "args": {"manifest": "server/agent/__init__.py"}, "why": "v"}],
    })
    C.CORE._save_run(run)
    C.CORE._process_step(run, run["steps"][0], auto_only=False)
    assert run["steps"][0]["status"] == "awaiting"          # gated to confirm
    rj = C.CORE.continue_run(run["run_id"], {})             # NO approval supplied
    assert rj["steps"][0]["status"] == "rejected"           # fail closed


def test_explicit_reject_still_rejects():
    reg = C._tools
    dest = next((t for t in reg.ids() if getattr(reg.get(t), "risk", None) == "destructive"), None)
    assert dest
    run = C.CORE._new_run("verify", {
        "summary": "v", "source": "test",
        "steps": [{"tool": dest, "args": {"manifest": "server/agent/__init__.py"}, "why": "v"}],
    })
    C.CORE._save_run(run)
    C.CORE._process_step(run, run["steps"][0], auto_only=False)
    rj = C.CORE.continue_run(run["run_id"], {0: False})
    assert rj["steps"][0]["status"] == "rejected"
