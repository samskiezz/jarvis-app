from underworld.server.services import patent_intel as pi
def test_cpc_classifier_routes_electric():
    assert pi.cpc_classify("a semiconductor circuit battery")["section"] == "H"
def test_chunk_and_independent_claims():
    claims = pi.chunk_claims("1. A device comprising X. 2. The device of claim 1 wherein Y.")
    assert len(claims) == 2
    assert pi.is_independent_claim(claims[0]) is True
    assert pi.is_independent_claim(claims[1]) is False
def test_dependent_linker():
    links = pi.link_dependent_claims(["A device.", "The device of claim 1."])
    assert links["links"][2] == 1 and links["independent"] == [1]
def test_obviousness_and_novelty():
    assert pi.obviousness_score(prior_art_overlap=0.9, combination_size=1, teaching_away=False)["likely_obvious"] is True
    assert pi.novelty_score(prior_art_matches=1, total_elements=10)["novel"] is True
def test_freedom_to_operate_blocks():
    fto = pi.freedom_to_operate([{"id": "p1", "features": ["a", "b"]}], {"a", "b", "c"})
    assert "p1" in fto["blocking_patents"]
def test_trl_and_bom_and_licensing():
    assert pi.trl_graph({1: True, 2: True, 3: True})["current_trl"] == 3
    assert pi.prototype_bom([{"qty": 2, "unit_cost": 5}])["total_cost"] == 10
    assert pi.licensing_scenario(royalty_rate=0.05, annual_revenue=1e6, years=3)["total_income"] > 0
def test_public_domain_miner():
    pd = pi.public_domain_miner([{"id": "old", "filing_year": 1990}], 2025)
    assert "old" in pd["public_domain"]
