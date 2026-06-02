"""Tests for the feature-reality auditor — the honest 500-feature census."""
from underworld.server.services import feature_audit as fa
from underworld.server.services.feature_catalog import CATEGORIES, FEATURES


def test_catalog_is_complete_500():
    assert len(FEATURES) == 500
    assert len(CATEGORIES) == 25
    assert {f["id"] for f in FEATURES} == set(range(1, 501))


def test_audit_covers_every_feature_with_valid_status():
    ev = fa.audit_all()
    assert len(ev) == 500
    assert all(e.status in ("PRESENT", "PARTIAL", "ABSENT") for e in ev)


def test_coverage_sums_to_total():
    r = fa.coverage_report()
    assert r["present"] + r["partial"] + r["absent"] == r["total_features"] == 500
    assert 0 <= r["present_pct"] <= 100


def test_genuinely_real_features_are_present():
    # things this repo actually implements must not read as ABSENT
    for fid, name in [(21, "Civilisation knowledge graph"),
                      (104, "Gaussian-process optimiser"),
                      (181, "Material truth database")]:
        e = fa.audit_feature(fid, "X", name)
        assert e.status == "PRESENT", (fid, name, e.status)


def test_hardware_features_are_honest_simulations_not_physical():
    # The former hardware/external-solver gaps are now provided as in-silico
    # digital twins so the fields can be studied in the simulated world. The
    # honesty guarantee is that they transparently declare themselves
    # SIMULATIONS, never physical hardware.
    from underworld.server.services import cfd_sim, robotic_lab, spice_sim
    pip = robotic_lab.robotic_pipetting(target_volume_ul=100)
    assert pip["simulation"] is True and pip["physical_hardware"] is False
    cfd = cfd_sim.cfd_simulate(n=8, steps=5)
    assert cfd["physical_hardware"] is False
    spice = spice_sim.circuit_simulate(
        [{"type": "V", "n1": 1, "n2": 0, "value": 5},
         {"type": "R", "n1": 1, "n2": 0, "value": 1000}], n_nodes=2)
    assert spice["physical_hardware"] is False


def test_gaps_lists_only_absent():
    g = fa.gaps()
    statuses = {e.feature_id: e.status for e in fa.audit_all()}
    assert all(statuses[item["id"]] == "ABSENT" for item in g)


def test_full_coverage_all_fields_studyable():
    # Every field is backed by real code or a physics-based in-silico digital
    # twin, so all 500 can be studied in the simulated world.
    r = fa.coverage_report()
    assert r["present"] == 500
    assert r["present_pct"] == 100.0
    assert r["absent"] == 0


def test_british_spelling_matches_american_code():
    # 'optimiser' must produce the American-spelled variant the code uses
    assert "optimizer" in fa._variants("optimiser")
    # and gerund/plural variants are generated
    assert "forecast" in fa._variants("forecasting")
