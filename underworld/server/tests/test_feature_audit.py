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


def test_hardware_only_features_are_not_overclaimed():
    # features needing real external hardware must NOT be reported PRESENT
    for fid, name in [(311, "Superconducting qubit model"),
                      (131, "Robotic pipetting module")]:
        e = fa.audit_feature(fid, "X", name)
        assert e.status != "PRESENT", (fid, name, e.status)


def test_gaps_lists_only_absent():
    g = fa.gaps()
    statuses = {e.feature_id: e.status for e in fa.audit_all()}
    assert all(statuses[item["id"]] == "ABSENT" for item in g)


def test_british_spelling_matches_american_code():
    # 'optimiser' must produce the American-spelled variant the code uses
    assert "optimizer" in fa._variants("optimiser")
    # and gerund/plural variants are generated
    assert "forecast" in fa._variants("forecasting")
