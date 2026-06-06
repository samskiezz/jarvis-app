"""Auto-sync to GitHub: gated, commits only on change, never raises."""

from __future__ import annotations

from server.services import jarvis_gitsync as gs


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("GIT_AUTOSYNC", raising=False)
    assert gs.enabled() is False
    out = gs.sync()
    assert out["ok"] is False and "GIT_AUTOSYNC" in out["skipped"]


def test_no_changes_does_not_commit(monkeypatch):
    monkeypatch.setenv("GIT_AUTOSYNC", "1")
    calls = []

    def fake_git(args, timeout=120.0):
        calls.append(args[0])
        if args[0] == "config":
            return {"ok": True, "out": "x"}
        if args[0] == "add":
            return {"ok": True}
        if args[0] == "diff":
            return {"ok": True, "code": 0}  # nothing staged
        return {"ok": True, "out": ""}

    monkeypatch.setattr(gs, "_git", fake_git)
    monkeypatch.setattr(gs.os.path, "exists", lambda p: True)
    out = gs.sync()
    assert out.get("no_changes") is True
    assert "commit" not in calls and "push" not in calls


def test_commits_and_pushes_on_change(monkeypatch):
    monkeypatch.setenv("GIT_AUTOSYNC", "1")
    seq = []

    def fake_git(args, timeout=120.0):
        seq.append(args[0])
        if args[0] == "diff":
            return {"ok": True, "code": 1}     # changes staged
        if args[0] == "rev-parse":
            return {"ok": True, "out": "main"}
        return {"ok": True, "out": "x"}

    monkeypatch.setattr(gs, "_git", fake_git)
    monkeypatch.setattr(gs.os.path, "exists", lambda p: True)
    out = gs.sync(message="test sync")
    assert out["ok"] is True and out["pushed"] is True and out["branch"] == "main"
    assert "commit" in seq and "push" in seq


def test_status_redacts_token(monkeypatch):
    monkeypatch.setattr(gs, "_git", lambda a, timeout=120.0: {
        "ok": True, "out": "https://ghp_secret@github.com/o/r.git" if a[0] == "remote" else "abc"})
    s = gs.status()
    assert "ghp_secret" not in s["remote"] and "***" in s["remote"]
