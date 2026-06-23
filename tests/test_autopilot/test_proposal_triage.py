"""Triage closes resolved brain-revival proposals + applies low-risk docs."""
import os
import json
import autopilot.loops.proposal_triage as tri


def _seed(tmp_path, title, kind="repair", risk="medium"):
    p = tmp_path / f"{int(__import__('time').time()*1000)}-{title.split()[0]}.md"
    p.write_text(f"# {title}\n\n**Kind**: {kind}\n**Risk**: {risk}\n\nbody\n")
    return str(p)


def test_brain_revival_closed_when_alive(tmp_path, monkeypatch):
    monkeypatch.setattr(tri, "PROP_DIR", str(tmp_path))
    monkeypatch.setattr(tri, "_read_brain_state", lambda: "alive")
    _seed(tmp_path, "Brain box revival ROOT CAUSE")
    out = tri.run()
    assert out["closed"] >= 1


def test_doc_low_risk_marked_applied(tmp_path, monkeypatch):
    monkeypatch.setattr(tri, "PROP_DIR", str(tmp_path))
    monkeypatch.setattr(tri, "_read_brain_state", lambda: "alive")
    _seed(tmp_path, "Some unrelated doc", kind="doc", risk="low")
    out = tri.run()
    assert out["applied"] >= 1


def test_unresolved_kept(tmp_path, monkeypatch):
    monkeypatch.setattr(tri, "PROP_DIR", str(tmp_path))
    monkeypatch.setattr(tri, "_read_brain_state", lambda: "missing")
    _seed(tmp_path, "Unrelated medium-risk fix", kind="fix", risk="medium")
    out = tri.run()
    assert out["kept"] >= 1
