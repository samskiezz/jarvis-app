from underworld.server.services import temporal_nodes as tn
def _nodes():
    return [tn.TemporalNode("v1", "theoryX", 0, 10, version=1),
            tn.TemporalNode("v2", "theoryX", 10, None, version=2, supersedes="v1")]
def test_temporal_query_slice():
    nodes = _nodes()
    assert "v1" in tn.temporal_query(nodes, 5)
    assert "v2" in tn.temporal_query(nodes, 15)
def test_theory_versions_ordered():
    v = tn.theory_versions(_nodes(), "theoryX")
    assert [x["version"] for x in v] == [1, 2]
def test_forgotten_knowledge():
    nodes = [tn.TemporalNode("lost", "old", 0, 5)]   # lapsed, not superseded
    assert "lost" in tn.forgotten_knowledge(nodes, 10)
def test_rediscovery_path():
    nodes = [tn.TemporalNode("lost", "tech", 0, 5),
             tn.TemporalNode("redis", "tech", 20, None)]
    r = tn.rediscovery_path(nodes, "lost", 25)
    assert r["rediscoverable"] is True and r["gap_ticks"] == 15
def test_causal_chain():
    edges = [tn.CausalEdge("a", "b"), tn.CausalEdge("b", "c")]
    assert tn.causal_chain(edges, "a") == ["a", "b", "c"]
def test_counterfactual_fork():
    f = tn.counterfactual_fork({"x": 1, "y": 2}, {"x": 5})
    assert f["n_changes"] == 1 and f["forked_state"]["x"] == 5
def test_anomaly_trigger():
    assert tn.anomaly_trigger(10, expected=5, tolerance=2)["triggered"] is True
def test_discovery_lineage_and_evidence():
    lin = tn.discovery_lineage([("c", "b"), ("b", "a")], "c")
    assert "a" in lin and "b" in lin
    ev = tn.evidence_chain([{"weight": 5, "supports": True}, {"weight": 1, "supports": False}])
    assert ev["established"] is True
