"""Technology/patent discovery: novel inventions, a real citation graph, and
patents that expand on prior art."""
from underworld.server.services import discovery_tech as DT


def test_invent_is_deterministic_and_structured():
    a = DT.invent("materials", seed=3)
    b = DT.invent("materials", seed=3)
    assert a == b                                      # deterministic per seed
    assert a["mechanism"] in DT.MECHANISMS and a["material"] in DT.MATERIALS
    assert len(a["claims"]) == 3


def test_novel_space_is_millions():
    assert DT._space_size(200) > 1_000_000


def test_file_rejects_duplicates_keeps_novel():
    office = DT.PatentOffice()
    t = DT.invent("physics", seed=1)
    assert office.file(t)["filed"] is True
    assert office.file(t)["filed"] is False            # same title -> not novel


def test_expand_builds_on_prior_art_with_citation():
    office = DT.PatentOffice()
    parent = DT.invent("energy", seed=2)
    office.file(parent)
    child = office.expand(parent["id"], seed=2)
    assert child["filed"] and child["improves"] == parent["id"]
    # the citation edge exists: child -> parent
    assert office.graph.has_edge(child["id"], parent["id"])


def test_citation_metrics_and_dag():
    office = DT.PatentOffice()
    ids = []
    for s in range(8):
        t = DT.invent("computing", seed=s)
        if office.file(t)["filed"]:
            ids.append(t["id"])
    # everyone cites the first patent -> it becomes the most-cited foundational one
    for pid in ids[1:]:
        office.graph.add_edge(pid, ids[0])
    m = office.metrics()
    assert m["patents"] >= 1 and m["is_dag"]
    assert m["novel_space_size"] > 1_000_000
    if m["most_cited"]:
        assert m["most_cited"][0]["id"] == ids[0]
