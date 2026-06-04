"""Verification tests for methods_medicine — each asserts a computed result
matches a KNOWN published value (with tolerance + citation).
"""
import numpy as np

from underworld.server.services.methods_medicine import (
    cardiac_output,
    poiseuille_blood_flow,
    oxygen_hemoglobin_saturation,
    creatinine_clearance,
    basal_metabolic_rate,
    body_metrics,
    dose_response,
    mean_arterial_pressure,
)


def test_cardiac_output_resting_5_l_min():
    # KNOWN: resting cardiac output ~5 L/min (Guyton & Hall, Medical Physiology).
    # HR=70 bpm, SV=70 mL -> CO = 4900 mL/min = 4.9 L/min.
    out = cardiac_output(heart_rate_bpm=70.0, stroke_volume_ml=70.0)
    assert abs(out["cardiac_output_l_min"] - 4.9) < 1e-9     # 4.9 L/min
    assert abs(out["cardiac_output_l_min"] - 5.0) < 0.2      # ~5 L/min resting
    # CO scales linearly: doubling SV doubles CO.
    out2 = cardiac_output(heart_rate_bpm=70.0, stroke_volume_ml=140.0)
    assert abs(out2["cardiac_output_l_min"] - 2.0 * out["cardiac_output_l_min"]) < 1e-9


def test_poiseuille_resistance_scales_inverse_r4():
    # KNOWN: vascular resistance R = 8*mu*L/(pi*r^4) ~ 1/r^4 (hemodynamics).
    # Doubling the radius should drop resistance by 2^4 = 16x.
    small = poiseuille_blood_flow(radius_m=1.0e-3)
    big = poiseuille_blood_flow(radius_m=2.0e-3)
    ratio = small["resistance_pa_s_m3"] / big["resistance_pa_s_m3"]
    assert abs(ratio - 16.0) < 1e-6                          # 2^4 = 16
    # flow rises by the same 16x factor (Q = dP / R).
    assert abs(big["flow_m3_s"] / small["flow_m3_s"] - 16.0) < 1e-6


def test_oxygen_hemoglobin_p50_half_saturation_and_sigmoid():
    # KNOWN: O2-Hb Hill curve has P50 ~= 26.7 mmHg (50% saturation there);
    # the curve is sigmoid (Wikipedia: oxygen-hemoglobin dissociation curve).
    at_p50 = oxygen_hemoglobin_saturation(po2_mmhg=26.7, p50_mmhg=26.7)
    assert abs(at_p50["saturation_fraction"] - 0.5) < 1e-9   # 50% at P50
    # arterial PO2 ~100 mmHg -> ~97% saturated (high-affinity plateau).
    arterial = oxygen_hemoglobin_saturation(po2_mmhg=100.0)
    assert arterial["saturation_percent"] > 95.0
    # sigmoid: monotonically increasing across the physiological range.
    pts = [oxygen_hemoglobin_saturation(po2_mmhg=p)["saturation_fraction"]
           for p in (10, 26.7, 40, 60, 100)]
    assert all(b > a for a, b in zip(pts, pts[1:]))
    # venous (~40 mmHg) below P50-region arterial -> still substantial O2 reserve
    assert oxygen_hemoglobin_saturation(po2_mmhg=40.0)["saturation_percent"] > 70.0


def test_creatinine_clearance_cockcroft_gault_known():
    # KNOWN: Cockcroft-Gault CrCl = (140-age)*wt*(0.85 if F)/(72*sCr).
    # 40 y, 72 kg male, sCr=1.0 mg/dL -> exactly 100 mL/min (mdcalc.com/calc/43).
    out = creatinine_clearance(age_years=40.0, weight_kg=72.0,
                               serum_creatinine_mg_dl=1.0, is_female=False)
    assert abs(out["creatinine_clearance_ml_min"] - 100.0) < 1e-9   # 100 mL/min
    # female multiplier is 0.85.
    fem = creatinine_clearance(age_years=40.0, weight_kg=72.0,
                               serum_creatinine_mg_dl=1.0, is_female=True)
    assert abs(fem["creatinine_clearance_ml_min"] - 85.0) < 1e-9    # 0.85*100


def test_bmr_mifflin_male_in_range():
    # KNOWN: Mifflin-St Jeor BMR = 10*wt+6.25*ht-5*age+5 (male).
    # 70 kg, 178 cm, 30 y male -> 1667.5 kcal/day (Wikipedia: Harris-Benedict eqn).
    out = basal_metabolic_rate(weight_kg=70.0, height_cm=178.0,
                               age_years=30.0, is_female=False)
    assert abs(out["bmr_mifflin_kcal_day"] - 1667.5) < 1e-6         # 1667.5
    # within normal adult-male resting range ~1500-1800 kcal.
    assert 1500.0 < out["bmr_mifflin_kcal_day"] < 1800.0
    # Harris-Benedict agrees with Mifflin to within ~5%.
    assert abs(out["bmr_harris_benedict_kcal_day"] - out["bmr_mifflin_kcal_day"]) \
        / out["bmr_mifflin_kcal_day"] < 0.05


def test_body_metrics_bmi_and_du_bois_bsa():
    # KNOWN: BMI = wt/ht^2; 70 kg @ 1.78 m -> ~22.1 kg/m^2 (normal).
    # Du Bois BSA = 0.007184*wt^0.425*ht^0.725 -> ~1.87 m^2 (ncbi NBK559005).
    out = body_metrics(weight_kg=70.0, height_cm=178.0)
    assert abs(out["bmi_kg_m2"] - 22.09) < 0.05               # ~22.1
    assert 18.5 < out["bmi_kg_m2"] < 25.0                     # normal range
    assert abs(out["bsa_du_bois_m2"] - 1.87) < 0.02          # ~1.87 m^2


def test_dose_response_half_effect_at_ec50():
    # KNOWN: Emax model -> effect = Emax/2 exactly when dose = EC50 (definition).
    out = dose_response(dose=10.0, emax=100.0, ec50=10.0, hill_n=1.0)
    assert abs(out["effect"] - 50.0) < 1e-9                   # half of Emax=100
    assert abs(out["fraction_of_emax"] - 0.5) < 1e-12
    # holds for any Hill coefficient.
    steep = dose_response(dose=10.0, emax=100.0, ec50=10.0, hill_n=2.5)
    assert abs(steep["fraction_of_emax"] - 0.5) < 1e-12
    # saturating: very high dose -> approaches Emax.
    hi = dose_response(dose=1e6, emax=100.0, ec50=10.0)
    assert abs(hi["effect"] - 100.0) < 1e-2


def test_mean_arterial_pressure_120_over_80():
    # KNOWN: MAP = DBP + 1/3(SBP-DBP); 120/80 -> 93.3 mmHg (Wikipedia: MAP).
    out = mean_arterial_pressure(systolic_mmhg=120.0, diastolic_mmhg=80.0)
    assert abs(out["map_mmhg"] - 93.333333) < 1e-3            # ~93 mmHg
    assert abs(out["pulse_pressure_mmhg"] - 40.0) < 1e-9      # 120-80
    # Frank-Starling link: cardiac output (HR*SV) is reported.
    assert abs(out["cardiac_output_l_min"] - 4.9) < 1e-9
