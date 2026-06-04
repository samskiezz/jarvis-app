"""Clinical-grade medicine & physiology simulation methods.

Eight named, real physiology / clinical methods, each computed from its
canonical published formula and each verified in the test suite against a
KNOWN published value:

  1. cardiac_output            — CO = HR * SV (resting ~5 L/min)
  2. poiseuille_blood_flow     — Hagen-Poiseuille flow / vascular resistance
                                 (resistance ~ 1/r^4)
  3. oxygen_hemoglobin_saturation — Hill equation O2-Hb curve (P50 ~26.7 mmHg)
  4. creatinine_clearance      — Cockcroft-Gault eGFR (mL/min)
  5. basal_metabolic_rate      — Mifflin-St Jeor / Harris-Benedict BMR (kcal/day)
  6. body_metrics              — BMI + Du Bois body-surface-area
  7. dose_response             — Emax/EC50 pharmacodynamics (half-effect at EC50)
  8. mean_arterial_pressure    — MAP = DBP + 1/3 (SBP - DBP) (Frank-Starling)

Sources (published references):
  - Cardiac output: Guyton & Hall, Textbook of Medical Physiology
    (resting CO ~5 L/min = ~70 bpm * ~70 mL).
  - Hagen-Poiseuille / vascular resistance ~ 1/r^4: standard hemodynamics.
  - Oxygen-hemoglobin Hill curve: P50 ~= 26.7 mmHg, Hill coefficient n ~= 2.7
    for normal human blood (en.wikipedia.org/wiki/Oxygen-hemoglobin_dissociation_curve).
  - Cockcroft-Gault: CrCl = (140-age)*wt*(0.85 if female)/(72*sCr)  [mg/dL]
    (mdcalc.com/calc/43).
  - Mifflin-St Jeor BMR: 10*wt + 6.25*ht - 5*age + (5 male / -161 female);
    Harris-Benedict (revised, imperial) (en.wikipedia.org/wiki/Harris-Benedict_equation).
  - Du Bois BSA = 0.007184 * wt^0.425 * ht^0.725 (kg, cm)
    (ncbi.nlm.nih.gov/books/NBK559005).
  - MAP = DBP + 1/3 (SBP - DBP) (en.wikipedia.org/wiki/Mean_arterial_pressure).
"""
from __future__ import annotations

import numpy as np


# 1. CARDIAC OUTPUT -----------------------------------------------------------
def cardiac_output(*, heart_rate_bpm: float = 70.0,
                   stroke_volume_ml: float = 70.0) -> dict:
    """Cardiac output CO = HR * SV and cardiac index (per body surface area).

    CO [mL/min] = heart rate [beats/min] * stroke volume [mL/beat].

    Known check: at HR=70 bpm and SV=70 mL, CO = 4900 mL/min ~= 4.9 L/min,
    matching the textbook resting cardiac output of ~5 L/min
    (Guyton & Hall, Medical Physiology).
    """
    if heart_rate_bpm <= 0 or stroke_volume_ml <= 0:
        raise ValueError("heart rate and stroke volume must be positive")
    co_ml_min = heart_rate_bpm * stroke_volume_ml
    co_l_min = co_ml_min / 1000.0
    return {
        "cardiac_output_ml_min": float(co_ml_min),
        "cardiac_output_l_min": float(co_l_min),
        "heart_rate_bpm": float(heart_rate_bpm),
        "stroke_volume_ml": float(stroke_volume_ml),
    }


# 2. POISEUILLE BLOOD FLOW / VASCULAR RESISTANCE ------------------------------
def poiseuille_blood_flow(*, radius_m: float = 1.5e-3,
                          length_m: float = 0.1,
                          pressure_drop_pa: float = 1000.0,
                          viscosity_pa_s: float = 3.5e-3) -> dict:
    """Hagen-Poiseuille laminar blood flow and vascular resistance.

    Resistance  R = 8 * mu * L / (pi * r^4)
    Flow        Q = dP / R = pi * r^4 * dP / (8 * mu * L)

    Blood dynamic viscosity ~ 3.5e-3 Pa*s (whole blood, ~37 C).

    Known check: resistance scales as 1/r^4 -> doubling the radius cuts
    resistance by a factor of 2^4 = 16, and flow rises by 16x.
    """
    if radius_m <= 0 or length_m <= 0 or viscosity_pa_s <= 0:
        raise ValueError("radius, length, viscosity must be positive")
    resistance = 8.0 * viscosity_pa_s * length_m / (np.pi * radius_m ** 4)
    flow = pressure_drop_pa / resistance
    return {
        "resistance_pa_s_m3": float(resistance),
        "flow_m3_s": float(flow),
        "flow_ml_min": float(flow * 1e6 * 60.0),
        "radius_m": float(radius_m),
    }


# 3. OXYGEN-HEMOGLOBIN DISSOCIATION (HILL EQUATION) ---------------------------
def oxygen_hemoglobin_saturation(*, po2_mmhg: float = 26.7,
                                 p50_mmhg: float = 26.7,
                                 hill_n: float = 2.7) -> dict:
    """Oxygen-hemoglobin dissociation curve via the Hill equation.

    Fractional saturation  S = (PO2^n) / (P50^n + PO2^n)

    Normal human blood: P50 ~= 26.7 mmHg, Hill coefficient n ~= 2.7.

    Known checks: the curve is sigmoid and passes through 50% saturation at
    PO2 = P50 (~26.7 mmHg); high arterial PO2 (~100 mmHg) -> ~97-98% saturated.
    """
    if po2_mmhg < 0 or p50_mmhg <= 0:
        raise ValueError("PO2 must be >= 0 and P50 > 0")
    num = po2_mmhg ** hill_n
    sat = num / (p50_mmhg ** hill_n + num)
    return {
        "saturation_fraction": float(sat),
        "saturation_percent": float(sat * 100.0),
        "po2_mmhg": float(po2_mmhg),
        "p50_mmhg": float(p50_mmhg),
        "hill_n": float(hill_n),
    }


# 4. RENAL CLEARANCE / GFR (COCKCROFT-GAULT) ----------------------------------
def creatinine_clearance(*, age_years: float = 40.0,
                         weight_kg: float = 72.0,
                         serum_creatinine_mg_dl: float = 1.0,
                         is_female: bool = False) -> dict:
    """Estimated creatinine clearance (eGFR) via the Cockcroft-Gault equation.

    CrCl [mL/min] = (140 - age) * weight * (0.85 if female else 1.0)
                    / (72 * serum_creatinine[mg/dL])

    Known check: a 40-year-old, 72 kg male with sCr = 1.0 mg/dL has
    CrCl = (140-40)*72 / (72*1.0) = 100 mL/min (a normal/healthy GFR).
    """
    if serum_creatinine_mg_dl <= 0 or weight_kg <= 0 or age_years < 0:
        raise ValueError("creatinine, weight must be positive; age >= 0")
    sex_factor = 0.85 if is_female else 1.0
    crcl = ((140.0 - age_years) * weight_kg * sex_factor) / (72.0 * serum_creatinine_mg_dl)
    return {
        "creatinine_clearance_ml_min": float(crcl),
        "sex_factor": float(sex_factor),
        "age_years": float(age_years),
    }


# 5. BASAL METABOLIC RATE (MIFFLIN-ST JEOR / HARRIS-BENEDICT) ------------------
def basal_metabolic_rate(*, weight_kg: float = 70.0,
                         height_cm: float = 178.0,
                         age_years: float = 30.0,
                         is_female: bool = False) -> dict:
    """Basal metabolic rate (kcal/day) via Mifflin-St Jeor and Harris-Benedict.

    Mifflin-St Jeor: BMR = 10*wt[kg] + 6.25*ht[cm] - 5*age + s
                     s = +5 (male), -161 (female)
    Harris-Benedict (revised, imperial form converted to metric):
                     male:   88.362 + 13.397*wt + 4.799*ht - 5.677*age
                     female: 447.593 + 9.247*wt + 3.098*ht - 4.330*age

    Known check: a 30-year-old, 70 kg, 178 cm male -> Mifflin BMR = 1667.5
    kcal/day (within the normal adult-male resting range of ~1500-1800 kcal).
    """
    if weight_kg <= 0 or height_cm <= 0 or age_years < 0:
        raise ValueError("weight, height must be positive; age >= 0")
    if is_female:
        mifflin = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age_years - 161.0
        harris = 447.593 + 9.247 * weight_kg + 3.098 * height_cm - 4.330 * age_years
    else:
        mifflin = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age_years + 5.0
        harris = 88.362 + 13.397 * weight_kg + 4.799 * height_cm - 5.677 * age_years
    return {
        "bmr_mifflin_kcal_day": float(mifflin),
        "bmr_harris_benedict_kcal_day": float(harris),
        "is_female": bool(is_female),
    }


# 6. BODY METRICS — BMI + DU BOIS BODY SURFACE AREA ---------------------------
def body_metrics(*, weight_kg: float = 70.0, height_cm: float = 178.0) -> dict:
    """Body Mass Index and Du Bois body-surface-area.

    BMI = weight[kg] / (height[m])^2
    Du Bois BSA = 0.007184 * weight[kg]^0.425 * height[cm]^0.725  (m^2)

    Known checks: 70 kg @ 178 cm -> BMI ~= 22.1 kg/m^2 (normal range 18.5-25),
    and Du Bois BSA ~= 1.87 m^2 (typical adult ~1.7-1.9 m^2).
    """
    if weight_kg <= 0 or height_cm <= 0:
        raise ValueError("weight and height must be positive")
    height_m = height_cm / 100.0
    bmi = weight_kg / (height_m ** 2)
    bsa = 0.007184 * (weight_kg ** 0.425) * (height_cm ** 0.725)
    return {
        "bmi_kg_m2": float(bmi),
        "bsa_du_bois_m2": float(bsa),
        "height_m": float(height_m),
    }


# 7. PHARMACODYNAMICS — Emax / EC50 DOSE-RESPONSE -----------------------------
def dose_response(*, dose: float = 10.0, emax: float = 100.0,
                  ec50: float = 10.0, hill_n: float = 1.0) -> dict:
    """Sigmoidal Emax pharmacodynamic dose-response model.

    Effect E = Emax * dose^n / (EC50^n + dose^n)

    Known check: at dose = EC50, the effect is exactly Emax/2 (half-maximal
    response) for any Hill coefficient n -> the defining property of EC50.
    """
    if dose < 0 or ec50 <= 0 or emax < 0:
        raise ValueError("dose >= 0, EC50 > 0, Emax >= 0 required")
    num = dose ** hill_n
    effect = emax * num / (ec50 ** hill_n + num)
    return {
        "effect": float(effect),
        "fraction_of_emax": float(effect / emax) if emax else 0.0,
        "dose": float(dose),
        "ec50": float(ec50),
    }


# 8. MEAN ARTERIAL PRESSURE (FRANK-STARLING CONTEXT) --------------------------
def mean_arterial_pressure(*, systolic_mmhg: float = 120.0,
                           diastolic_mmhg: float = 80.0,
                           heart_rate_bpm: float = 70.0,
                           stroke_volume_ml: float = 70.0) -> dict:
    """Mean arterial pressure and the Frank-Starling pressure relation.

    MAP = DBP + 1/3 (SBP - DBP)   (the diastole-weighted time-average)
    Pulse pressure = SBP - DBP.
    Also returns cardiac output (CO = HR * SV) which, with systemic vascular
    resistance, sets MAP (MAP ~= CO * SVR), the Frank-Starling link.

    Known check: for a 120/80 mmHg reading, MAP = 80 + 1/3*(120-80) = 93.3 mmHg.
    """
    if systolic_mmhg < diastolic_mmhg:
        raise ValueError("systolic must be >= diastolic")
    pulse_pressure = systolic_mmhg - diastolic_mmhg
    map_mmhg = diastolic_mmhg + pulse_pressure / 3.0
    co_l_min = heart_rate_bpm * stroke_volume_ml / 1000.0
    return {
        "map_mmhg": float(map_mmhg),
        "pulse_pressure_mmhg": float(pulse_pressure),
        "cardiac_output_l_min": float(co_l_min),
        "systolic_mmhg": float(systolic_mmhg),
        "diastolic_mmhg": float(diastolic_mmhg),
    }
