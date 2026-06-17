"""Adversarial safety tests for the self-improvement loop's blast-radius guards.

These exist because the loop once mis-attributed ~1,638 concurrently-deleted media files to a single
feature, fed the audit a binary garbage diff, and git-checkout-thrashed those files. The guards under
test (in_code_scope / scope_feature_files / is_polluted / discard) must make that impossible.
"""
from __future__ import annotations

import importlib
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
ai = importlib.import_module("auto_improve")


# ─────────────────────────── in_code_scope: allow ───────────────────────────

@pytest.mark.parametrize("path", [
    "server/routes/smart_reminders.py",
    "server/services/smart_reminders.py",
    "server/tests/test_smart_reminders.py",
    "server/jarvis_live.html",
    "server/main.py",
    "server/dashboard.py",
    "config/llm_router.json",
    "server/templates/foo.html",
    "server/static/app.css",
])
def test_code_paths_are_in_scope(path):
    assert ai.in_code_scope(path) is True


# ─────────────────────────── in_code_scope: deny ───────────────────────────

@pytest.mark.parametrize("path", [
    "server/data/media/gen_tripo__abacus.glb",
    "server/data/media/gen_tripo__abacus.glb.cloudref",
    "server/data/smart_reminders_state.json",
    "server/data/proactive.db",
    "server/data/auto_improve.log.jsonl",
    ".venv/lib/python3.12/site-packages/x.py",
    "node_modules/react/index.js",
    "underworld/deploy/ue5-project/Config/DefaultGame.ini",
    "server/services/__pycache__/x.cpython-312.pyc",
    "server/routes/foo.pyc",
    "notes.html",                       # stray top-level file, not a known code area
    "random_top_level_thing",
    "",
])
def test_noncode_and_asset_paths_are_denied(path):
    assert ai.in_code_scope(path) is False


def test_glb_is_denied_even_though_under_no_allow_prefix():
    # the exact files from the real incident
    assert ai.in_code_scope("server/data/media/gen_tripo__agi_core.glb") is False
    assert ai.in_code_scope("server/data/media/gen_tripo__agi_core.glb.cloudref") is False


# ─────────────────────────── scope_feature_files split ───────────────────────────

def test_scope_split_separates_code_from_assets():
    raw = [
        "server/routes/x.py", "server/jarvis_live.html",
        "server/data/media/a.glb", "server/data/media/b.glb.cloudref",
        "server/data/proactive.db",
    ]
    keep, reject = ai.scope_feature_files(raw)
    assert keep == ["server/jarvis_live.html", "server/routes/x.py"]
    assert reject == [
        "server/data/media/a.glb", "server/data/media/b.glb.cloudref", "server/data/proactive.db",
    ]


# ─────────────────────────── is_polluted ───────────────────────────

def test_the_real_incident_is_flagged_polluted():
    """1,638 media deletions + a stray code file must be POLLUTION, never one feature's diff."""
    media = [f"server/data/media/gen_tripo__{i:04d}.glb" for i in range(1638)]
    raw = sorted(["server/jarvis_live.html", *media])
    keep, reject = ai.scope_feature_files(raw)
    assert keep == ["server/jarvis_live.html"]
    assert len(reject) == 1638
    assert ai.is_polluted(raw, reject) is True


def test_clean_small_feature_is_not_polluted():
    raw = ["server/routes/x.py", "server/services/x.py", "server/tests/test_x.py"]
    keep, reject = ai.scope_feature_files(raw)
    assert reject == []
    assert ai.is_polluted(raw, reject) is False


def test_legit_full_feature_six_files_not_polluted():
    """A realistic complete mini-app (UI + route + service + test + 2 wiring files) must pass."""
    raw = sorted([
        "server/services/smart_reminders.py", "server/routes/smart_reminders.py",
        "server/tests/test_smart_reminders.py", "server/jarvis_live.html",
        "server/main.py", "server/dashboard.py",
    ])
    keep, reject = ai.scope_feature_files(raw)
    assert reject == []
    assert ai.is_polluted(raw, reject) is False


def test_a_few_out_of_scope_files_trip_pollution():
    raw = ["server/routes/x.py"] + [f"server/data/x{i}.db" for i in range(6)]
    keep, reject = ai.scope_feature_files(raw)
    assert len(reject) == 6
    assert ai.is_polluted(raw, reject) is True   # > MAX_OUT_OF_SCOPE (5)


def test_pollution_boundaries():
    # exactly at MAX_FEATURE_FILES of in-scope code -> not polluted
    at_cap = [f"server/services/m{i}.py" for i in range(ai.MAX_FEATURE_FILES)]
    assert ai.is_polluted(at_cap, []) is False
    # one over -> polluted
    over = at_cap + ["server/services/extra.py"]
    assert ai.is_polluted(over, []) is True
    # exactly MAX_OUT_OF_SCOPE out-of-scope -> not polluted; one more -> polluted
    base = ["server/routes/x.py"]
    oos = [f"server/data/x{i}.db" for i in range(ai.MAX_OUT_OF_SCOPE)]
    assert ai.is_polluted(base + oos, oos) is False
    assert ai.is_polluted(base + oos + ["server/data/extra.db"],
                          oos + ["server/data/extra.db"]) is True


# ─────────────────────────── discard never touches assets ───────────────────────────

def test_discard_never_runs_git_or_remove_on_assets(monkeypatch):
    calls = {"run": [], "remove": []}

    def fake_run(cmd, timeout=120, cwd=ai.ROOT, env=None):
        calls["run"].append(list(cmd))
        return 0, ""        # pretend every file is tracked (so os.remove path isn't taken)

    monkeypatch.setattr(ai, "run", fake_run)
    monkeypatch.setattr(ai.os, "remove", lambda p: calls["remove"].append(p))

    tainted = [
        "server/routes/x.py",
        "server/data/media/a.glb", "server/data/media/b.glb.cloudref",
        "server/data/proactive.db", "server/data/auto_improve.log.jsonl",
    ]
    ai.discard(tainted)

    flat = " ".join(" ".join(c) for c in calls["run"])
    for denied in ("a.glb", "b.glb.cloudref", "proactive.db", "auto_improve.log.jsonl",
                   "server/data/"):
        assert denied not in flat, f"discard leaked a denied path to a shell command: {denied}"
    assert all("server/data/" not in p and not p.endswith(".glb") for p in calls["remove"])
    # the one legitimate code file IS allowed through to git checkout
    assert "server/routes/x.py" in flat


def test_discard_skips_protected_files(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "run", lambda cmd, **k: (calls.append(list(cmd)) or (0, "")))
    monkeypatch.setattr(ai.os, "remove", lambda p: None)
    ai.discard(["scripts/auto_improve.py", "server/auth.py", "server/routes/ok.py"])
    flat = " ".join(" ".join(c) for c in calls)
    assert "scripts/auto_improve.py" not in flat
    assert "server/auth.py" not in flat
    assert "server/routes/ok.py" in flat
