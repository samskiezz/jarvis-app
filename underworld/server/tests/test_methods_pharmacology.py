"""Verification tests for methods_pharmacology — each asserts a computed result
matches a KNOWN published pharmacology / toxicology value (tolerance + citation).
"""
import math

import numpy as np

from underworld.server.services.methods_pharmacology import (
    two_compartment_pk,
    pk_parameters,
    loading_dose,
    steady_state,
    therapeutic_index,
    emax_pkpd,
    michaelis_menten_elimination,
    probit_ld50,
)


def test_two_compartment_biexponential_decline():
    # KNOWN: IV-bolus two-compartment plasma curve is biexponential
    # C(t) = A e^{-alpha t} + B e^{-beta t} with alpha (distribution) > beta
    # (terminal), and C(0) = A + B = dose/V1  (Rowland & Tozer).
    out = two_compartment_pk(dose_mg=100.0, v1_l=10.0,
                             k10_per_h=0.5, k12_per_h=1.0, k21_per_h=0.4)
    # alpha and beta solve  s^2 - (k10+k12+k21)s + k10*k21 = 0 (Vieta):
    ksum, kprod = 0.5 + 1.0 + 0.4, 0.5 * 0.4
    assert abs(out["alpha_per_h"] + out["beta_per_h"] - ksum) < 1e-9
    assert abs(out["alpha_per_h"] * out["beta_per_h"] - kprod) < 1e-9
    # distribution faster than terminal elimination
    assert out["alpha_per_h"] > out["beta_per_h"]
    # C(0) = A + B = dose/V1 = 10 mg/L
    assert abs(out["a_coef_mg_l"] + out["b_coef_mg_l"] - 10.0) < 1e-9
    assert abs(out["concentrations_mg_l"][0] - 10.0) < 1e-9
    # genuinely biexponential (both exponentials contribute)
    assert out["a_coef_mg_l"] > 0 and out["b_coef_mg_l"] > 0
    # curve declines monotonically after the bolus
    c = out["concentrations_mg_l"]
    assert all(b <= a + 1e-12 for a, b in zip(c, c[1:]))


def test_half_life_known_ncbi_example():
    # KNOWN: t1/2 = 0.693*Vd/CL. Vd=40 L, CL=2.0 L/h -> 13.86 h (~14 h)
    # (NCBI StatPearls Elimination Half-Life of Drugs).
    out = pk_parameters(clearance_l_h=2.0, volume_distribution_l=40.0)
    assert abs(out["half_life_h"] - 13.8629436) < 1e-4        # 0.693*40/2
    assert abs(out["half_life_h"] - 14.0) < 0.2               # ~14 h
    # k = CL/Vd = 0.05 /h, and t1/2 = ln2/k consistency
    assert abs(out["elimination_rate_constant_per_h"] - 0.05) < 1e-12
    assert abs(out["half_life_h"] - math.log(2.0) /
               out["elimination_rate_constant_per_h"]) < 1e-9


def test_loading_dose_css_times_vd():
    # KNOWN: loading dose = Css*Vd / F. Css=10 mg/L, Vd=50 L, F=1 -> 500 mg.
    out = loading_dose(target_css_mg_l=10.0, volume_distribution_l=50.0,
                       bioavailability=1.0)
    assert abs(out["loading_dose_mg"] - 500.0) < 1e-9         # Css*Vd
    # halving bioavailability doubles the oral loading dose
    oral = loading_dose(target_css_mg_l=10.0, volume_distribution_l=50.0,
                        bioavailability=0.5)
    assert abs(oral["loading_dose_mg"] - 1000.0) < 1e-9


def test_steady_state_accumulation_ratio():
    # KNOWN: Rac = 1/(1-e^{-k*tau}); dosing every half-life (k*tau = ln2)
    # gives Rac = 1/(1-0.5) = 2.0 (Wikipedia drug accumulation ratio).
    # Vd=40, CL=2.0 -> k=0.05/h, t1/2 = 13.863 h; set tau = t1/2.
    half_life = math.log(2.0) / 0.05
    out = steady_state(dose_mg=100.0, clearance_l_h=2.0,
                       volume_distribution_l=40.0, tau_h=half_life)
    assert abs(out["accumulation_ratio"] - 2.0) < 1e-9       # exactly 2-fold
    # Css_avg = F*Dose/(CL*tau)
    expected_css = 100.0 / (2.0 * half_life)
    assert abs(out["css_avg_mg_l"] - expected_css) < 1e-9
    # long interval (tau >> t1/2) -> no accumulation (Rac -> 1)
    far = steady_state(dose_mg=100.0, clearance_l_h=2.0,
                       volume_distribution_l=40.0, tau_h=10 * half_life)
    assert abs(far["accumulation_ratio"] - 1.0) < 1e-2


def test_therapeutic_index_known_example():
    # KNOWN: TI = TD50/ED50; TD50=150, ED50=10 -> 15 (Wikipedia therapeutic index).
    out = therapeutic_index(td50=150.0, ed50=10.0)
    assert abs(out["therapeutic_index"] - 15.0) < 1e-9       # 150/10
    # second textbook case TD50=200, ED50=20 -> 10
    out2 = therapeutic_index(td50=200.0, ed50=20.0)
    assert abs(out2["therapeutic_index"] - 10.0) < 1e-9
    # margin of safety LD1/ED99
    out3 = therapeutic_index(td50=150.0, ed50=10.0, ld1=100.0, ed99=25.0)
    assert abs(out3["margin_of_safety"] - 4.0) < 1e-9


def test_emax_pkpd_half_effect_at_ec50():
    # KNOWN: sigmoid Emax model -> E = Emax/2 exactly when C = EC50 (definition
    # of EC50), for any Hill coefficient (Holford & Sheiner PK-PD).
    out = emax_pkpd(concentration=10.0, emax=100.0, ec50=10.0, hill_n=1.0)
    assert abs(out["drug_effect"] - 50.0) < 1e-9             # half of Emax
    assert abs(out["fraction_of_emax"] - 0.5) < 1e-12
    steep = emax_pkpd(concentration=10.0, emax=100.0, ec50=10.0, hill_n=3.0)
    assert abs(steep["fraction_of_emax"] - 0.5) < 1e-12      # holds for any n
    # saturating: very high concentration -> approaches Emax
    hi = emax_pkpd(concentration=1e6, emax=100.0, ec50=10.0)
    assert abs(hi["drug_effect"] - 100.0) < 1e-2
    # baseline E0 adds on top
    base = emax_pkpd(concentration=10.0, emax=100.0, ec50=10.0, e0=20.0)
    assert abs(base["effect"] - 70.0) < 1e-9


def test_michaelis_menten_half_vmax_at_km():
    # KNOWN: rate = Vmax*C/(Km+C); rate = Vmax/2 exactly at C = Km (the
    # defining Michaelis-Menten half-saturation property).
    out = michaelis_menten_elimination(concentration=5.0, vmax=10.0, km=5.0)
    assert abs(out["elimination_rate"] - 5.0) < 1e-9         # Vmax/2
    assert abs(out["fraction_of_vmax"] - 0.5) < 1e-12
    # C >> Km -> zero-order, rate -> Vmax
    sat = michaelis_menten_elimination(concentration=1e6, vmax=10.0, km=5.0)
    assert abs(sat["elimination_rate"] - 10.0) < 1e-3
    # C << Km -> first-order, rate ~ (Vmax/Km)*C
    lo = michaelis_menten_elimination(concentration=0.001, vmax=10.0, km=5.0)
    assert abs(lo["elimination_rate"] - (10.0 / 5.0) * 0.001) < 1e-6


def test_probit_ld50_recovers_known_ld50():
    # KNOWN: probit = 5 at 50% mortality; LD50 is the dose at probit=5
    # (Bliss 1934 / Finney Probit Analysis; evs.institute probit analysis).
    # Construct an exact probit-linear dataset with LD50 = 100:
    #   probit = 5 + slope*(log10(dose) - log10(100)) -> p = Phi(probit-5).
    true_ld50, slope = 100.0, 2.0
    doses = np.array([25.0, 50.0, 100.0, 200.0, 400.0])
    probits = 5.0 + slope * (np.log10(doses) - np.log10(true_ld50))
    from scipy import stats as _st
    fracs = _st.norm.cdf(probits - 5.0)
    out = probit_ld50(doses=doses, responses=fracs)
    assert abs(out["ld50"] - 100.0) < 1e-6                   # recovers LD50
    assert abs(out["slope"] - slope) < 1e-6
    assert out["r_squared"] > 0.999                          # exact linear fit
    assert out["probit_at_ld50"] == 5.0

    # also works from death counts / group totals
    totals = np.array([100, 100, 100, 100, 100], dtype=float)
    counts = np.round(fracs * totals)
    out2 = probit_ld50(doses=doses, responses=counts, totals=totals)
    assert abs(out2["ld50"] - 100.0) < 5.0                   # ~100 (rounding)
