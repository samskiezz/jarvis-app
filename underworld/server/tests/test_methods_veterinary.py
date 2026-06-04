"""Veterinary & animal-science methods verified against KNOWN reference values.

Researched (WebSearch) sources documented in methods_veterinary.py.
"""
import math

from underworld.server.services.methods_veterinary import (
    kleiber_metabolic_rate,
    allometric_dose,
    von_bertalanffy_growth,
    heart_rate_mass,
    gestation_period,
    feed_conversion,
    thermoneutral_zone,
    herd_logistic_growth,
)


# ------------------------------------------------------------------ 1 Kleiber
def test_kleiber_20kg_dog_known():
    # KNOWN: 70·20^0.75 ≈ 662 kcal/day (worked example, study.com / Wikipedia)
    r = kleiber_metabolic_rate(mass_kg=20.0)
    assert abs(r["bmr_kcal_day"] - 662.0) < 2.0


def test_kleiber_100kg_known():
    # KNOWN: 70·100^0.75 = 70·31.623 ≈ 2213.6 kcal/day (100^0.75 = 10^1.5)
    r = kleiber_metabolic_rate(mass_kg=100.0)
    assert abs(r["bmr_kcal_day"] - 2213.59) < 1.0


def test_kleiber_exponent_is_three_quarters():
    # Verify the canonical 3/4 scaling exponent
    assert kleiber_metabolic_rate(mass_kg=10.0)["exponent"] == 0.75


# ------------------------------------------------- 2 allometric drug dosing
def test_allometric_dose_bsa_exponent():
    # KNOWN: doubling mass at BSA exponent 0.67 → scale 2^0.67 ≈ 1.591
    r = allometric_dose(ref_dose_mg=100.0, ref_mass_kg=10.0, target_mass_kg=20.0)
    assert abs(r["scale_factor"] - 2 ** 0.67) < 1e-4
    assert abs(r["target_dose_mg"] - 100.0 * 2 ** 0.67) < 1e-3


def test_allometric_dose_identity():
    # Same mass → identical dose (scale factor 1)
    r = allometric_dose(ref_dose_mg=50.0, ref_mass_kg=5.0, target_mass_kg=5.0)
    assert abs(r["target_dose_mg"] - 50.0) < 1e-6


# ------------------------------------------------------- 3 von Bertalanffy
def test_von_bertalanffy_asymptote():
    # KNOWN: as t→∞, L→L_inf. At large t, fraction ≈ 1.
    r = von_bertalanffy_growth(t=100.0, L_inf=120.0, k=0.3, t0=0.0)
    assert abs(r["length"] - 120.0) < 1e-6
    assert abs(r["fraction_of_asymptote"] - 1.0) < 1e-6


def test_von_bertalanffy_one_time_constant():
    # KNOWN: at k(t-t0)=1, L = L_inf·(1 - e^-1) = 0.6321·L_inf
    r = von_bertalanffy_growth(t=1.0, L_inf=100.0, k=1.0, t0=0.0)
    assert abs(r["length"] - 100.0 * (1 - math.exp(-1))) < 1e-3
    assert abs(r["fraction_of_asymptote"] - (1 - math.exp(-1))) < 1e-5


def test_von_bertalanffy_zero_at_t0():
    # At t=t0 length is 0
    assert abs(von_bertalanffy_growth(t=2.0, L_inf=80.0, k=0.4, t0=2.0)["length"]) < 1e-9


# --------------------------------------------------- 4 heart-rate allometry
def test_heart_rate_400kg_horse_known():
    # KNOWN: 241·400^(-0.25) ≈ 53.9 bpm (resting horse range)
    r = heart_rate_mass(mass_kg=400.0)
    assert abs(r["heart_rate_bpm"] - 53.9) < 0.5


def test_heart_rate_negative_exponent():
    # Verify negative (-1/4) exponent: bigger mass → slower heart rate
    assert heart_rate_mass(mass_kg=10.0)["exponent"] == -0.25
    big = heart_rate_mass(mass_kg=500.0)["heart_rate_bpm"]
    small = heart_rate_mass(mass_kg=0.5)["heart_rate_bpm"]
    assert big < small


def test_heart_rate_1kg_equals_coeff():
    # At M=1 kg, HR = 241 bpm (the prefactor)
    assert abs(heart_rate_mass(mass_kg=1.0)["heart_rate_bpm"] - 241.0) < 1e-6


# ------------------------------------------------------- 5 gestation period
def test_gestation_scaling_exponent():
    # Verify metabolic-theory 0.25 exponent
    assert gestation_period(mass_kg=50.0, coeff=100.0)["exponent"] == 0.25


def test_gestation_known_calibration():
    # Calibrate to a 500 kg cow (~283 days gestation): coeff = 283/500^0.25.
    # KNOWN: model must reproduce the reference at the calibration mass.
    coeff = 283.0 / 500.0 ** 0.25
    r = gestation_period(mass_kg=500.0, coeff=coeff)
    assert abs(r["gestation_days"] - 283.0) < 0.5
    # quadrupling mass → gestation scales by 4^0.25 = sqrt(2) ≈ 1.414
    r2 = gestation_period(mass_kg=2000.0, coeff=coeff)
    assert abs(r2["gestation_days"] / r["gestation_days"] - 2 ** 0.5) < 1e-3


# ------------------------------------------------- 6 feed conversion ratio
def test_fcr_broiler_known():
    # KNOWN: broiler ≈ 1.6 kg feed per kg gain (Wikipedia FCR)
    r = feed_conversion(feed_intake_kg=1.6, weight_gain_kg=1.0)
    assert abs(r["fcr"] - 1.6) < 1e-9


def test_fcr_efficiency_reciprocal():
    r = feed_conversion(feed_intake_kg=8.0, weight_gain_kg=4.0)
    assert abs(r["fcr"] - 2.0) < 1e-9
    assert abs(r["feed_efficiency"] - 0.5) < 1e-9


# ------------------------------------------------------- 7 thermoneutral zone
def test_thermoneutral_lct_known():
    # KNOWN balance: LCT = Tb - BMR_flux·insulation.
    # Tb=38C, basal flux 50 W, insulation 0.2 C/W → LCT = 38 - 10 = 28 C
    r = thermoneutral_zone(body_temp_c=38.0, basal_heat_flux_w=50.0,
                           insulation_c_per_w=0.2)
    assert abs(r["lower_critical_temp_c"] - 28.0) < 1e-6


def test_thermoneutral_heat_loss_balances_at_lct():
    # At ambient == LCT, sensible heat loss equals basal production (no extra heat).
    r = thermoneutral_zone(body_temp_c=38.0, basal_heat_flux_w=50.0,
                           insulation_c_per_w=0.2, ambient_temp_c=28.0)
    assert abs(r["heat_loss_w"] - 50.0) < 1e-6
    assert abs(r["extra_heat_needed_w"]) < 1e-6
    assert r["below_lct"] is False


def test_thermoneutral_below_lct_needs_extra_heat():
    # Colder than LCT → extra metabolic heat required.
    r = thermoneutral_zone(body_temp_c=38.0, basal_heat_flux_w=50.0,
                           insulation_c_per_w=0.2, ambient_temp_c=18.0)
    # heat loss = (38-18)/0.2 = 100 W; extra = 100 - 50 = 50 W
    assert abs(r["heat_loss_w"] - 100.0) < 1e-6
    assert abs(r["extra_heat_needed_w"] - 50.0) < 1e-6
    assert r["below_lct"] is True


# ------------------------------------------------- 8 herd logistic growth
def test_herd_logistic_approaches_carrying_capacity():
    # KNOWN: as t→∞, N→K (carrying capacity).
    r = herd_logistic_growth(N0=10.0, r=0.5, K=1000.0, t=100.0)
    assert abs(r["population"] - 1000.0) < 1.0
    assert abs(r["fraction_of_K"] - 1.0) < 1e-3


def test_herd_logistic_starts_at_N0():
    # At t=0, N = N0
    r = herd_logistic_growth(N0=25.0, r=0.4, K=500.0, t=0.0)
    assert abs(r["population"] - 25.0) < 1e-6


def test_herd_logistic_equilibrium_at_K():
    # Starting exactly at K → stays at K, growth rate 0
    r = herd_logistic_growth(N0=300.0, r=0.6, K=300.0, t=10.0)
    assert abs(r["population"] - 300.0) < 1e-6
    assert abs(r["growth_rate"]) < 1e-6


def test_herd_logistic_known_midpoint():
    # KNOWN: closed form. N0=50, K=1000, r=0.3, t=5:
    # A=(1000-50)/50=19; N=1000/(1+19·e^-1.5)=1000/(1+19·0.22313)=1000/5.2395≈190.86
    r = herd_logistic_growth(N0=50.0, r=0.3, K=1000.0, t=5.0)
    expected = 1000.0 / (1.0 + 19.0 * math.exp(-1.5))
    assert abs(r["population"] - expected) < 1e-2
