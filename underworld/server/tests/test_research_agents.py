from underworld.server.services import research_agents as ra
def test_research_swarm_coverage():
    s = ra.research_swarm(["literature_miner", "experimentalist", "statistician"])
    assert s["coverage"] > 0 and "search" in s["skills_covered"]
def test_assign_tasks_matches_skill():
    agents = [ra.Agent("experimentalist", 0.9), ra.Agent("statistician", 0.8)]
    res = ra.assign_tasks([{"id": "t1", "skill": "experiment"}, {"id": "t2", "skill": "statistics"}], agents)
    assert res["assignments"]["t1"] == "experimentalist"
    assert res["assignments"]["t2"] == "statistician"
def test_assign_unassignable():
    res = ra.assign_tasks([{"id": "t1", "skill": "nonexistent"}], [ra.Agent("skeptic")])
    assert "t1" in res["unassigned"]
def test_consensus_accept_and_veto():
    assert ra.consensus([{"score": 0.9}, {"score": 0.8}])["decision"] == "accept"
    assert ra.consensus([{"score": 0.9, "veto": True}])["decision"] != "accept"
def test_red_team_score():
    assert ra.red_team_score(attack_surface=0.9, mitigations=0.1)["passes"] is False
    assert ra.red_team_score(attack_surface=0.3, mitigations=0.3)["passes"] is True
def test_pipeline_stage_provenance():
    out = ra.pipeline_stage("peer_reviewer", {"history": ["experimentalist"]})
    assert out["history"] == ["experimentalist", "peer_reviewer"]
