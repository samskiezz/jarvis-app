from underworld.server.services import materials_advanced as ma
def test_defect_density_grade():
    assert ma.defect_density(defects=10, volume_cm3=1.0)["device_grade"] is True
def test_phase_diagram_lever_rule():
    p = ma.phase_diagram(composition=0.5, solidus=0.0, liquidus=1.0)
    assert abs(p["fraction_liquid"] - 0.5) < 1e-9
def test_superconductor_higher_coupling_higher_tc():
    lo = ma.superconductor_candidate(debye_temp=300, coupling=0.2, dos=1.0)["estimated_tc_k"]
    hi = ma.superconductor_candidate(debye_temp=300, coupling=0.5, dos=1.0)["estimated_tc_k"]
    assert hi > lo
def test_semiconductor_classification():
    assert ma.semiconductor_candidate(bandgap_ev=1.1)["classification"] == "semiconductor"
    assert ma.semiconductor_candidate(bandgap_ev=0.0)["classification"] == "conductor"
def test_fracture_and_thermal():
    assert ma.fracture_toughness(stress=1e8, crack_length=1e-3)["stress_intensity_mpa_sqrt_m"] > 0
    assert ma.thermal_conductivity(electrical_conductivity=6e7, temperature=300)["thermal_conductivity_w_mk"] > 0
def test_impurity_profile():
    prof = ma.impurity_profile({"Fe": 5, "Cu": 20}, spec_ppm=10)
    assert "Cu" in prof["over_spec"]
