"""OFFLINE tests for the SEARCH + ENTITY-RESOLUTION services and routes.

No network, no DB writes required. Exercises ranking, fuzzy fallback, suggest,
and entity-resolution near-duplicate vs clearly-different scoring.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ["JARVIS_API_KEY"] = "test-key"

from server.data.ontology import OBJECTS  # noqa: E402
from server.services import entity_resolution as er  # noqa: E402
from server.services import search as search_svc  # noqa: E402


# ── search ranking ────────────────────────────────────────────────────────────
def test_search_returns_ranked_hits_for_known_term():
    search_svc.reindex(None)  # build from the static ontology
    res = search_svc.search("pangani")
    assert res, "expected at least one hit for 'pangani'"
    assert res[0]["id"] == "pangani"
    assert res[0]["score"] > 0
    # scores must be sorted descending
    scores = [r["score"] for r in res]
    assert scores == sorted(scores, reverse=True)
    # snippet should surface something readable
    assert res[0]["snippet"]


def test_search_finds_term_in_props():
    search_svc.reindex(None)
    res = search_svc.search("solar")
    ids = [r["id"] for r in res]
    # "Project Solar Group" (label) and Defended Energy (props) reference solar.
    assert "psg" in ids


def test_search_type_filter():
    search_svc.reindex(None)
    res = search_svc.search("dubai", type="invest")
    assert res
    assert all(r["type"] == "invest" for r in res)
    # a non-matching type filter yields nothing
    assert search_svc.search("dubai", type="person") == []


def test_search_mark_filter():
    search_svc.reindex(None)
    res = search_svc.search("group", mark="FINANCIAL")
    assert all(r["mark"] == "FINANCIAL" for r in res)


# ── fuzzy fallback ────────────────────────────────────────────────────────────
def test_fuzzy_matches_a_typo():
    search_svc.reindex(None)
    # "panghani" / "panghani" is a typo of pangani
    res = search_svc.search("panghani")
    assert res, "fuzzy fallback should still return a hit for a typo"
    assert res[0]["id"] == "pangani"


def test_fuzzy_typo_on_solar():
    search_svc.reindex(None)
    res = search_svc.search("soler")  # typo of solar
    ids = [r["id"] for r in res]
    assert "psg" in ids


# ── suggest ───────────────────────────────────────────────────────────────────
def test_suggest_returns_prefixes():
    search_svc.reindex(None)
    out = search_svc.suggest("pan")
    assert any(lab.lower().startswith("pan") for lab in out)
    assert "Pangani TZ" in out


def test_suggest_token_prefix():
    search_svc.reindex(None)
    out = search_svc.suggest("zan")
    assert "Zanzibar Resort" in out


def test_suggest_empty_prefix_returns_labels():
    search_svc.reindex(None)
    out = search_svc.suggest("")
    assert len(out) > 0


# ── reindex with custom objects ──────────────────────────────────────────────
def test_reindex_with_custom_objects():
    custom = [
        {"id": "x", "label": "Quantum Reactor", "type": "asset", "props": {"k": "fusion"}},
    ]
    n = search_svc.reindex(custom)
    assert n == 1
    res = search_svc.search("quantum")
    assert res and res[0]["id"] == "x"
    # restore the default index for other tests
    search_svc.reindex(None)


# ── entity resolution ─────────────────────────────────────────────────────────
def test_entity_resolution_finds_near_duplicate_high():
    objects = [dict(o) for o in OBJECTS]
    # A near-duplicate of Harrison Vaubell: same name + same email.
    record = {
        "label": "Harrison Vaubell",
        "type": "person",
        "props": {"Email": "harrison@projectsolar.com.au", "Role": "Co-founder"},
    }
    cands = er.candidates(record, objects)
    assert cands
    top = cands[0]
    assert top["id"] == "harrison"
    assert top["score"] >= 0.8, f"expected high score, got {top['score']}"
    assert top["reasons"]


def test_entity_resolution_different_record_low():
    objects = [dict(o) for o in OBJECTS]
    record = {
        "label": "Completely Unrelated Widget Co",
        "type": "org",
        "props": {"Foo": "bar", "Baz": "qux"},
    }
    cands = er.candidates(record, objects)
    # the best candidate should be clearly weak
    best = cands[0]["score"] if cands else 0.0
    assert best < 0.5, f"expected low score for unrelated record, got {best}"


def test_score_pair_ordering():
    objects = {o["id"]: dict(o) for o in OBJECTS}
    rec = {"label": "Pangani Tanzania", "type": "invest",
           "props": {"Ask": "$175k USD"}}
    near = er.score_pair(rec, objects["pangani"])
    far = er.score_pair(rec, objects["sam"])
    assert near > far
    assert near > 0.5


def test_merge_unions_props_keeps_canonical():
    objects = [dict(o) for o in OBJECTS]
    # add a duplicate person with an extra prop
    dup = {"id": "harrison_dup", "label": "Harrison V", "type": "person",
           "props": {"Email": "h2@x.com", "LinkedIn": "harrison-v"}}
    objects.append(dup)
    out = er.merge("harrison", "harrison_dup", objects)
    assert out["ok"] is True
    merged = out["merged"]
    assert merged["id"] == "harrison"  # canonical kept
    # primary's Email wins on conflict
    assert merged["props"]["Email"] == "harrison@projectsolar.com.au"
    # dup-only prop is unioned in
    assert merged["props"]["LinkedIn"] == "harrison-v"
    assert "harrison_dup" in merged["absorbed_ids"]


# ── never-raise contracts ─────────────────────────────────────────────────────
def test_services_never_raise_on_bad_input():
    assert search_svc.search(None) == [] or isinstance(search_svc.search(None), list)
    assert isinstance(search_svc.suggest(None), list)
    assert er.candidates(None, OBJECTS) == []
    assert er.candidates({"label": "x"}, None) == []
    assert er.score_pair(None, None) == 0.0
    res = er.merge("nope", "also_nope", [])
    assert res["ok"] is False
