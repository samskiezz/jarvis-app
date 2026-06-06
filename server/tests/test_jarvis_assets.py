"""Asset pipeline: library/wire/search/gaps + Tripo client degradation (no network)."""

from __future__ import annotations

from server.services import jarvis_assets as assets
from server.services import tripo_client as tc


def test_library_and_status_shapes():
    lib = assets.library()
    assert isinstance(lib, list)
    s = assets.status()
    for k in ("library_models", "wired_models", "gaps", "tripo_generation"):
        assert k in s


def test_search_library_matches_keywords():
    # the real 677-model library is present in this repo
    if not assets.library():
        return
    hits = assets.search_library("crystal")
    assert all("crystal" in h.replace("_", " ") for h in hits) or hits == []


def test_wire_rejects_unknown_model():
    out = assets.wire("definitely_not_a_real_model_xyz")
    assert out["ok"] is False


def test_gaps_have_generation_prompts():
    for g in assets.gaps():
        assert g["gen"] in tc.GAP_PROMPTS


def test_tripo_requires_key(monkeypatch):
    monkeypatch.delenv("TRIPO_API_KEY", raising=False)
    assert tc.available() is False
    out = tc.submit("an iron man helmet")
    assert out["ok"] is False and "TRIPO_API_KEY" in out["reason"]
    g = tc.generate("a globe", "globe_test")
    assert g["ok"] is False
