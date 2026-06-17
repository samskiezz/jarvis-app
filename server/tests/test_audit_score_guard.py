"""The audit engine must REFUSE an unscorable diff (mostly-binary / oversized) with a distinct
'unscorable' signal instead of calling the judge and returning a confident all-zeros reject."""
from __future__ import annotations

import importlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
asc = importlib.import_module("audit_score")


def _binary_diff(n: int) -> str:
    out = []
    for i in range(n):
        out.append(f"diff --git a/server/data/media/x{i}.glb b/server/data/media/x{i}.glb")
        out.append(f"Binary files a/server/data/media/x{i}.glb and /dev/null differ")
    return "\n".join(out)


def test_is_unscorable_flags_mostly_binary():
    assert asc._is_unscorable(_binary_diff(20), [f"server/data/media/x{i}.glb" for i in range(20)])


def test_is_unscorable_flags_too_many_files():
    files = [f"server/services/m{i}.py" for i in range(80)]
    assert asc._is_unscorable("diff --git a/x b/x\n+code\n", files)


def test_is_unscorable_passes_normal_feature():
    diff = "diff --git a/server/routes/x.py b/server/routes/x.py\n+def f():\n+    return 1\n"
    assert asc._is_unscorable(diff, ["server/routes/x.py"]) == ""


def test_audit_score_refuses_unscorable_without_calling_judge(monkeypatch):
    """The real incident: 1,638 binary GLB deletions must short-circuit to unscorable, never the judge."""
    files = [f"server/data/media/x{i}.glb" for i in range(1638)]
    monkeypatch.setattr(asc, "_diff", lambda f: _binary_diff(1638))

    def _boom(*a, **k):
        raise AssertionError("the LLM judge must NOT be called on unscorable input")

    monkeypatch.setattr(asc, "_claude_judge", _boom)

    res = asc.audit_score({"title": "Quick Access Buttons"}, files, {"pass": True})
    assert res["unscorable"] is True
    assert res["merge_ok"] is False
    assert res["final_score"] == 0
    assert "unscorable_input" in res["error"]


def test_audit_score_still_judges_a_real_small_diff(monkeypatch):
    monkeypatch.setattr(asc, "_diff", lambda f: "diff --git a/server/routes/x.py b/server/routes/x.py\n+ok\n")
    called = {"judge": False}

    def fake_judge(prompt, model=asc.MODEL, timeout=360):
        called["judge"] = True
        # sums to 930 (>= 850 merge bar) so a clean judgment yields merge_ok
        return ('{"breakdown":{"product_improvement":140,"feature_completeness":95,"user_experience":95,'
                '"functional_correctness":115,"test_confidence":115,"security_permissions":115,'
                '"performance_reliability":70,"architecture_quality":70,"maintainability":45,'
                '"automation_intelligence":70},"penalties":[],"hard_blockers":[],'
                '"delta":{"before":1,"after":7,"capability":"x"},"automation_gain":5,'
                '"test_coverage_gain":8,"improvement_proven":"y","damage_risk":"low",'
                '"test_evidence":"tests","security_evidence":"ok","rollback_confidence":"high",'
                '"learning_value":"v","required_fixes":[],"next_action":"ship"}')

    monkeypatch.setattr(asc, "_claude_judge", fake_judge)
    res = asc.audit_score({"title": "real feature"}, ["server/routes/x.py"], {"pass": True})
    assert called["judge"] is True
    assert res.get("unscorable") is None
    assert res["final_score"] > 0
    assert res["merge_ok"] is True
