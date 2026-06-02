"""Tests for real synthetic-biology models."""
from underworld.server.services import synbio as sb


def test_gc_content():
    assert sb.gc_content("GCGC") == 1.0
    assert sb.gc_content("ATAT") == 0.0


def test_guide_rna_prefers_balanced_gc():
    good = sb.guide_rna_score("ACGTACGTACGTACGTACGT")      # 50% GC, len 20
    bad = sb.guide_rna_score("AAAAAAAAAAAAAAAAAAAA")       # 0% GC, homopolymer
    assert good["score"] > bad["score"]


def test_off_target_detects_close_match():
    risk = sb.off_target_risk("ACGTACGT", ["ACGTACGT", "ACGTACGA"])
    assert risk["off_targets"] >= 1
    assert risk["risky"] is True


def test_genetic_circuit_and_gate():
    on = sb.genetic_circuit({"a": 10, "b": 10}, "AND")
    off = sb.genetic_circuit({"a": 10, "b": 0}, "AND")
    assert on["output"] > off["output"]


def test_monod_growth_saturates():
    assert sb.monod_growth(substrate=100, mu_max=1, ks=1) > sb.monod_growth(substrate=0.1, mu_max=1, ks=1)


def test_fermentation_grows_biomass():
    r = sb.fermentation(s0=100, x0=1, mu_max=0.5, ks=5, yield_xs=0.5)
    assert r["final_biomass"] > 1


def test_delivery_vehicle_capacity():
    assert sb.delivery_vehicle(payload_size_kb=3.0, vector="AAV")["fits"] is True
    assert sb.delivery_vehicle(payload_size_kb=6.0, vector="AAV")["fits"] is False


def test_containment_and_biosecurity():
    risky = sb.containment_risk(gene_drive=True, environmental_release=True, kill_switch=False)
    safe = sb.containment_risk(gene_drive=False, environmental_release=False, kill_switch=True)
    assert risky["risk"] > safe["risk"]
    assert sb.biosecurity_screen("AAAHAZARDBBB", ["HAZARD"])["flagged"] is True
