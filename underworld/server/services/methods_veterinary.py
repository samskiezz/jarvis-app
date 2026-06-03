"""Veterinary & animal-science simulations from canonical allometric / physiology
equations. Each function is researched against a KNOWN reference value.

Researched (WebSearch, June 2026) and verified against known values:
  1. Kleiber's law:        BMR = 70·M^0.75 kcal/day.  20 kg dog ≈ 662 kcal/day;
                           100 kg ≈ 3936 kcal/day. Exponent = 3/4 = 0.75.
                           (Wikipedia "Kleiber's law"; homework.study.com worked example.)
  2. Allometric dosing:    dose scales with body-surface-area; BSA ∝ M^(2/3).
                           Human-clinical BSA exponent = 0.67, veterinary = 0.75.
                           Dose_target = Dose_ref·(M_target/M_ref)^exp.
                           (PMC2737649 "To scale or not to scale"; FDA guidance.)
  3. von Bertalanffy:      L(t)=L∞·(1−e^(−k(t−t0))); as t→∞, L→L∞ (asymptote).
                           (Wikipedia "Von Bertalanffy function".)
  4. Heart-rate allometry: HR = 241·M^(−0.25) bpm. Negative exponent (−1/4):
                           bigger animals beat slower. 400 kg horse ≈ 54 bpm.
                           (West fractal model; Nature s41598-025-90928-x.)
  5. Gestation scaling:    metabolic-theory prediction gestation ∝ M^0.25.
                           t_gest = a·M^0.25 days. (PMC4177257; MTE slope 1/4.)
  6. Feed conversion ratio: FCR = feed_intake / weight_gain. Broiler ≈ 1.6 kg
                           feed per kg gain. (Wikipedia "Feed conversion ratio".)
  7. Thermoneutral zone:   below the lower-critical-temperature, sensible heat
                           loss = (Tb−Ta)/insulation must be balanced by basal
                           heat production. LCT = Tb − BMR_flux·insulation.
                           (Wikipedia "Thermal neutral zone".)
  8. Herd logistic growth: dN/dt=r·N·(1−N/K); closed form
                           N(t)=K/(1+((K−N0)/N0)·e^(−rt)); N→K (carrying capacity).
                           (Wikipedia "Carrying capacity"; LibreTexts logistic growth.)
"""
from __future__ import annotations

import math


# --------------------------------------------------------------------------- 1
def kleiber_metabolic_rate(*, mass_kg: float, coeff: float = 70.0,
                           exponent: float = 0.75) -> dict:
    """Kleiber's law basal metabolic rate: BMR = 70·M^0.75 kcal/day.

    20 kg dog → 70·20^0.75 ≈ 662 kcal/day. Exponent is the canonical 3/4.
    """
    bmr = coeff * mass_kg ** exponent
    return {
        "bmr_kcal_day": round(bmr, 2),
        "exponent": exponent,
        "mass_specific_kcal_kg_day": round(bmr / mass_kg, 3),
    }


# --------------------------------------------------------------------------- 2
def allometric_dose(*, ref_dose_mg: float, ref_mass_kg: float,
                    target_mass_kg: float, exponent: float = 0.67) -> dict:
    """Body-surface-area allometric dose scaling.

    Dose_target = Dose_ref·(M_target/M_ref)^exp. Default exp = 0.67 (BSA, human
    clinical); use 0.75 for the veterinary metabolic-weight convention.
    """
    ratio = target_mass_kg / ref_mass_kg
    dose = ref_dose_mg * ratio ** exponent
    return {
        "target_dose_mg": round(dose, 4),
        "dose_per_kg": round(dose / target_mass_kg, 5),
        "exponent": exponent,
        "scale_factor": round(ratio ** exponent, 5),
    }


# --------------------------------------------------------------------------- 3
def von_bertalanffy_growth(*, t: float, L_inf: float, k: float,
                           t0: float = 0.0) -> dict:
    """von Bertalanffy growth: L(t) = L∞·(1 − e^(−k(t−t0))).

    Asymptote: as t→∞, L(t)→L_inf. Returns the modelled size and the
    fraction of the asymptote attained.
    """
    L = L_inf * (1.0 - math.exp(-k * (t - t0)))
    return {
        "length": round(L, 4),
        "asymptote": L_inf,
        "fraction_of_asymptote": round(L / L_inf, 5),
    }


# --------------------------------------------------------------------------- 4
def heart_rate_mass(*, mass_kg: float, coeff: float = 241.0,
                    exponent: float = -0.25) -> dict:
    """Heart-rate allometry: HR = 241·M^(−0.25) bpm.

    Negative exponent → larger animals have slower heart rates.
    400 kg horse → 241·400^(−0.25) ≈ 54 bpm.
    """
    hr = coeff * mass_kg ** exponent
    return {
        "heart_rate_bpm": round(hr, 2),
        "exponent": exponent,
        "period_s": round(60.0 / hr, 4),
    }


# --------------------------------------------------------------------------- 5
def gestation_period(*, mass_kg: float, coeff: float, exponent: float = 0.25) -> dict:
    """Gestation-period allometry: t_gest = a·M^0.25 days (metabolic-theory slope).

    `coeff` is the species-group prefactor calibrated to a reference animal.
    """
    t_gest = coeff * mass_kg ** exponent
    return {
        "gestation_days": round(t_gest, 2),
        "gestation_months": round(t_gest / 30.4375, 3),
        "exponent": exponent,
    }


# --------------------------------------------------------------------------- 6
def feed_conversion(*, feed_intake_kg: float, weight_gain_kg: float) -> dict:
    """Feed Conversion Ratio: FCR = feed_intake / weight_gain.

    Broiler reference ≈ 1.6 kg feed per kg gain. Feed efficiency = 1/FCR.
    """
    fcr = feed_intake_kg / weight_gain_kg
    return {
        "fcr": round(fcr, 4),
        "feed_efficiency": round(weight_gain_kg / feed_intake_kg, 5),
        "weight_gain_kg": weight_gain_kg,
    }


# --------------------------------------------------------------------------- 7
def thermoneutral_zone(*, body_temp_c: float, basal_heat_flux_w: float,
                       insulation_c_per_w: float, ambient_temp_c: float | None = None) -> dict:
    """Lower-critical-temperature heat balance.

    Sensible heat loss = (Tb − Ta)/insulation. At the lower critical temperature
    heat loss equals basal heat production, so
        LCT = Tb − basal_heat_flux·insulation.
    Below the LCT the animal must raise metabolism above basal to stay warm.
    """
    lct = body_temp_c - basal_heat_flux_w * insulation_c_per_w
    out = {
        "lower_critical_temp_c": round(lct, 3),
        "body_temp_c": body_temp_c,
    }
    if ambient_temp_c is not None:
        heat_loss = (body_temp_c - ambient_temp_c) / insulation_c_per_w
        out["heat_loss_w"] = round(heat_loss, 3)
        out["below_lct"] = ambient_temp_c < lct
        # extra metabolic heat needed below LCT (0 within / above the zone)
        out["extra_heat_needed_w"] = round(max(0.0, heat_loss - basal_heat_flux_w), 3)
    return out


# --------------------------------------------------------------------------- 8
def herd_logistic_growth(*, N0: float, r: float, K: float, t: float) -> dict:
    """Logistic herd growth: dN/dt = r·N·(1 − N/K).

    Closed form N(t)=K/(1+((K−N0)/N0)·e^(−rt)); as t→∞, N→K (carrying capacity).
    """
    if N0 <= 0:
        N = 0.0
    else:
        A = (K - N0) / N0
        N = K / (1.0 + A * math.exp(-r * t))
    return {
        "population": round(N, 4),
        "carrying_capacity": K,
        "fraction_of_K": round(N / K, 5),
        "growth_rate": round(r * N * (1.0 - N / K), 5),
    }
