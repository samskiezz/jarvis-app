from underworld.server.services import society as so
def test_labour_market_shortage_raises_wage():
    assert so.labour_market(demand=200, supply=100)["shortage"] is True
def test_expert_scarcity():
    assert so.expert_scarcity(experts=5, positions=10)["scarce"] is True
def test_funding_allocation_within_budget():
    r = so.funding_allocation([{"id": "p1", "merit": 0.9, "request": 50},
                               {"id": "p2", "merit": 0.3, "request": 50}], budget=100)
    assert sum(r["allocations"].values()) <= 100 + 1e-6
    assert "p1" in r["funded"]
def test_institution_forms_and_credibility():
    assert so.institution_formation(members=10, shared_knowledge=0.8)["forms"] is True
    assert so.institutional_credibility([True, True, True, True])["trusted"] is True
def test_knowledge_transfer_closes_gap():
    r = so.knowledge_transfer(teacher_skill=1.0, student_skill=0.5)
    assert r["student_new_skill"] > 0.5
def test_credentialing():
    assert so.credentialing(demonstrated_skills={"a", "b"}, required_skills={"a"})["credentialed"] is True
    assert so.credentialing(demonstrated_skills={"a"}, required_skills={"a", "c"})["credentialed"] is False
def test_academic_politics_and_peer_network():
    assert so.academic_politics({"x": 90, "y": 10})["dominant"] == "x"
    net = so.peer_review_network([("a", "b"), ("b", "a")])
    assert net["conflicts"] == 1
