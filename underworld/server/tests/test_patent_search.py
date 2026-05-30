import pytest

from underworld.server.tools import patent_search


@pytest.mark.asyncio
async def test_offline_search_returns_results():
    records = await patent_search.search("display", limit=5)
    assert len(records) >= 1
    for r in records:
        assert r.expired is True
        assert r.cpc_class  # offline corpus has CPCs


@pytest.mark.asyncio
async def test_offline_search_filters_unsafe_cpcs(monkeypatch):
    # Pretend a chemistry CPC slipped into the offline corpus.
    bad = patent_search.PatentRecord(
        id="USFAKE",
        title="Synthesis route",
        abstract="...",
        cpc_class="C07D",
        grant_date="1990-01-01",
        expired=True,
        source="offline",
        raw={},
    )
    monkeypatch.setattr(
        patent_search,
        "_OFFLINE_CORPUS",
        list(patent_search._OFFLINE_CORPUS) + [bad],
    )
    records = await patent_search.search("anything", limit=20)
    assert all(r.id != "USFAKE" for r in records), "blocked CPC must be filtered"
