from underworld.server.services import graph_extras as ge
def test_citation_graph_pagerank():
    r = ge.citation_graph([("b", "a"), ("c", "a"), ("c", "b")])
    assert r["most_influential"] == "a"          # most cited
def test_cross_domain_analogy():
    a = ge.cross_domain_analogy({"flow", "resistance", "potential"}, {"flow", "resistance", "pressure"})
    assert a["transferable"] is True
def test_idea_mutation_novelty():
    m = ge.idea_mutation({"a", "b"}, add={"c"})
    assert "c" in m["mutated_idea"] and m["novelty"] > 0
def test_idea_recombination():
    r = ge.idea_recombination({"a"}, {"b"})
    assert r["novel_combination"] is True and set(r["hybrid"]) == {"a", "b"}
