"""Tests for the Patent Intelligence Engine (#4) + Open Data Portal adapter.

Covers the pure analysis layer in `tools/patent_intelligence` (claims parsing,
requirement inference, comprehension prereqs, quality scoring, artifact
translation) and the offline-fallback resilience of `tools/open_data_portal`.
No DB / network: the ODP test asserts the no-key offline path.
"""

import pytest

from underworld.server.tools import open_data_portal, patent_intelligence as pi
from underworld.server.tools.patent_search import PatentRecord


_SEMICONDUCTOR = PatentRecord(
    id="US4055768A",
    title="Light-emitting diode display structure",
    abstract="A multi-character LED display with a semiconductor substrate and a translucent overlay focusing emitted light.",
    cpc_class="H01L",
    grant_date="1977-10-25",
    expired=True,
    source="offline",
    raw={},
)

_MECHANICAL = PatentRecord(
    id="US3192570A",
    title="Self-bearing roller skate apparatus",
    abstract="A roller skate having ball-bearing wheels arranged so the skate can pivot freely about a vertical axis.",
    cpc_class="B62B",
    grant_date="1965-07-06",
    expired=True,
    source="offline",
    raw={},
)


# ── parse_claims ─────────────────────────────────────────────────────────────
_CLAIMS = (
    "1. An apparatus comprising a substrate and a light source. "
    "2. The apparatus of claim 1, wherein the light source is a diode. "
    "3. The apparatus as in claim 1, further comprising a lens. "
    "4. A method according to any of claims 1 to 3, comprising assembling the substrate."
)


def test_parse_claims_identifies_independent_and_dependent():
    claims = pi.parse_claims(_CLAIMS)
    assert len(claims) == 4
    by_num = {c["number"]: c for c in claims}
    assert by_num[1]["kind"] == "independent"
    assert by_num[1]["depends_on"] == []
    assert by_num[2]["kind"] == "dependent"


def test_parse_claims_extracts_dependency_refs():
    claims = pi.parse_claims(_CLAIMS)
    by_num = {c["number"]: c for c in claims}
    assert by_num[2]["depends_on"] == [1]
    assert by_num[3]["depends_on"] == [1]
    # "claims 1 to 3" must expand to all three referenced claims.
    assert by_num[4]["depends_on"] == [1, 2, 3]


def test_parse_claims_empty_input_is_empty_list():
    assert pi.parse_claims("") == []
    assert pi.parse_claims("   ") == []


def test_parse_claims_never_self_references():
    claims = pi.parse_claims(_CLAIMS)
    for c in claims:
        assert c["number"] not in c["depends_on"]


# ── extract_requirements ─────────────────────────────────────────────────────
def test_extract_requirements_maps_semiconductor_to_silicon_and_lithography():
    req = pi.extract_requirements(_SEMICONDUCTOR)
    mats = " ".join(req["required_materials"]).lower()
    skills = " ".join(req["skills"]).lower()
    assert "silicon" in mats
    assert "lithograph" in skills
    assert 0.0 <= req["manufacturing_difficulty"] <= 1.0
    # Semiconductors are hard to build.
    assert req["manufacturing_difficulty"] >= 0.8


def test_extract_requirements_accepts_plain_dict():
    as_dict = {
        "title": _SEMICONDUCTOR.title,
        "abstract": _SEMICONDUCTOR.abstract,
        "cpc_class": _SEMICONDUCTOR.cpc_class,
        "id": _SEMICONDUCTOR.id,
    }
    req = pi.extract_requirements(as_dict)
    assert any("silicon" in m.lower() for m in req["required_materials"])


def test_extract_requirements_mechanical_is_easier_than_semiconductor():
    mech = pi.extract_requirements(_MECHANICAL)
    semi = pi.extract_requirements(_SEMICONDUCTOR)
    assert mech["manufacturing_difficulty"] < semi["manufacturing_difficulty"]


# ── comprehension_prerequisites ──────────────────────────────────────────────
def test_comprehension_prerequisites_returns_namespaced_ids():
    prereqs = pi.comprehension_prerequisites(_SEMICONDUCTOR)
    assert prereqs, "expected at least one prerequisite node id"
    assert all(":" in p for p in prereqs)
    namespaces = {p.split(":", 1)[0] for p in prereqs}
    assert namespaces <= {"principle", "material", "skill"}
    assert any(p.startswith("principle:") for p in prereqs)
    assert any(p.startswith("skill:") for p in prereqs)


# ── quality_score ────────────────────────────────────────────────────────────
def test_quality_score_fields_all_in_unit_range():
    score = pi.quality_score(_SEMICONDUCTOR)
    expected = {
        "practical_value",
        "manufacturability",
        "novelty_proxy",
        "clarity",
        "dependency_burden",
        "commercial_relevance",
        "overall",
    }
    assert expected.issubset(score.keys())
    for key in expected:
        assert 0.0 <= score[key] <= 1.0, f"{key} out of range: {score[key]}"


def test_quality_score_harder_build_is_less_manufacturable():
    semi = pi.quality_score(_SEMICONDUCTOR)
    mech = pi.quality_score(_MECHANICAL)
    assert mech["manufacturability"] >= semi["manufacturability"]


# ── to_artifact ──────────────────────────────────────────────────────────────
def test_to_artifact_has_required_keys():
    art = pi.to_artifact(_SEMICONDUCTOR)
    for key in (
        "required_materials",
        "required_tools",
        "required_knowledge",
        "energy",
        "prototype_reliability",
        "failure_modes",
    ):
        assert key in art, f"missing artifact key: {key}"
    assert isinstance(art["required_materials"], list)
    assert isinstance(art["failure_modes"], list) and art["failure_modes"]
    assert 0.0 <= art["prototype_reliability"] <= 1.0
    assert art["energy"] > 0


def test_to_artifact_knowledge_matches_prerequisites():
    art = pi.to_artifact(_SEMICONDUCTOR)
    assert art["required_knowledge"] == pi.comprehension_prerequisites(_SEMICONDUCTOR)


# ── open_data_portal offline fallback ────────────────────────────────────────
async def test_open_data_portal_falls_back_offline_without_key(monkeypatch):
    # Ensure no key is visible via settings or env.
    monkeypatch.setattr(open_data_portal, "_api_key", lambda: "")
    records = await open_data_portal.search("motor", limit=5)
    assert len(records) >= 1
    for r in records:
        assert isinstance(r, PatentRecord)
        assert r.expired is True
        assert r.source.startswith("open_data_portal")


async def test_open_data_portal_filters_unsafe_cpcs(monkeypatch):
    monkeypatch.setattr(open_data_portal, "_api_key", lambda: "")
    bad = PatentRecord(
        id="USBADCHEM",
        title="Organic synthesis route",
        abstract="...",
        cpc_class="C07D",
        grant_date="1990-01-01",
        expired=True,
        source="open_data_portal_offline",
        raw={},
    )
    monkeypatch.setattr(
        open_data_portal,
        "_OFFLINE_SAMPLE",
        list(open_data_portal._OFFLINE_SAMPLE) + [bad],
    )
    records = await open_data_portal.search("anything", limit=20)
    assert all(r.id != "USBADCHEM" for r in records)


async def test_open_data_portal_reuses_patent_search_record():
    # Reusing the exact PatentRecord class keeps the analysis layer uniform.
    from underworld.server.tools import patent_search
    assert open_data_portal.PatentRecord is patent_search.PatentRecord
