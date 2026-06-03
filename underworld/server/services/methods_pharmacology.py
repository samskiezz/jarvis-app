"""Real pharmacology & toxicology simulation methods.

Eight named, canonical pharmacology / toxicology methods, each computed from
its published formula and each verified in the test suite against a KNOWN
published value:

  1. two_compartment_pk      — IV-bolus two-compartment model: biexponential
                               plasma decline C(t) = A*e^(-alpha t) + B*e^(-beta t)
  2. pk_parameters           — clearance, volume of distribution, and elimination
                               half-life  t1/2 = 0.693 * Vd / CL
  3. loading_dose            — loading dose = Css * Vd  (/ bioavailability)
  4. steady_state            — repeated-dosing steady state + accumulation ratio
                               Rac = 1 / (1 - e^(-k*tau))
  5. therapeutic_index       — TI = TD50 / ED50 (and margin of safety LD1/ED99)
  6. emax_pkpd               — sigmoid Hill / Emax PK-PD: half effect at EC50
  7. michaelis_menten_elimination — saturable (Michaelis-Menten) elimination,
                               rate = Vmax*C/(Km+C); half Vmax at C = Km
  8. probit_ld50             — probit dose-response: LD50 where probit = 5 (50%)

Sources (published references):
  - Two-compartment biexponential IV bolus model: Rowland & Tozer, Clinical
    Pharmacokinetics; the plasma curve is a sum of two exponentials with
    alpha (distribution) > beta (terminal/elimination).
  - Half-life  t1/2 = 0.693*Vd/CL, where 0.693 = ln(2); worked example
    Vd=40 L, CL=2.0 L/h -> t1/2 = 13.86 h (~14 h)
    (ncbi.nlm.nih.gov/books/NBK554498 Elimination Half-Life of Drugs;
     derangedphysiology.com half-life chapter).
  - Loading dose = (Css * Vd) / F  (Goodman & Gilman; mdcalc loading dose).
  - Accumulation ratio Rac = 1/(1 - e^(-k*tau))
    (en.wikipedia.org/wiki/Drug_accumulation_ratio).
  - Therapeutic index TI = TD50/ED50; example TD50=150, ED50=10 -> TI=15
    (en.wikipedia.org/wiki/Therapeutic_index).
  - Sigmoid Emax / Hill PK-PD: E = Emax*C^n/(EC50^n + C^n); E = Emax/2 at
    C = EC50 (Holford & Sheiner; standard PK-PD).
  - Michaelis-Menten saturable elimination: rate = Vmax*C/(Km+C); rate = Vmax/2
    at C = Km (e.g. phenytoin, ethanol zero-order kinetics).
  - Probit analysis (Bliss 1934; Finney, Probit Analysis 1947): probit =
    5 + z, where z is the standard-normal quantile of the response fraction;
    at 50% mortality probit = 5 and dose = LD50
    (evs.institute probit analysis; AnalystSoft Finney probit).
"""
from __future__ import annotations

import math

import numpy as np
from scipy import stats


# 1. TWO-COMPARTMENT PHARMACOKINETICS ----------------------------------------
def two_compartment_pk(*, dose_mg: float = 100.0,
                       v1_l: float = 10.0,
                       k10_per_h: float = 0.5,
                       k12_per_h: float = 1.0,
                       k21_per_h: float = 0.4,
                       times_h=None) -> dict:
    """IV-bolus two-compartment model -> biexponential plasma decline.

    Plasma concentration after an IV bolus into the central compartment is the
    sum of two exponentials:

        C(t) = A * e^(-alpha t) + B * e^(-beta t)

    where the macro rate constants alpha (fast distribution) and beta (slow
    terminal elimination) are the roots of

        s^2 - (k10 + k12 + k21) s + k10*k21 = 0
        alpha + beta = k10 + k12 + k21
        alpha * beta = k10 * k21          (Vieta)

    Coefficients (central conc. C0 = dose/V1):
        A = C0 * (alpha - k21) / (alpha - beta)
        B = C0 * (k21 - beta)  / (alpha - beta)

    Known check: alpha > beta (distribution faster than terminal elimination)
    and at t=0 C(0) = A + B = dose/V1 (the initial central concentration).
    """
    if dose_mg <= 0 or v1_l <= 0:
        raise ValueError("dose and V1 must be positive")
    if min(k10_per_h, k12_per_h, k21_per_h) < 0:
        raise ValueError("rate constants must be non-negative")
    ksum = k10_per_h + k12_per_h + k21_per_h
    kprod = k10_per_h * k21_per_h
    disc = math.sqrt(max(ksum * ksum - 4.0 * kprod, 0.0))
    alpha = 0.5 * (ksum + disc)   # fast (distribution) macro constant
    beta = 0.5 * (ksum - disc)    # slow (terminal) macro constant
    c0 = dose_mg / v1_l
    if alpha == beta:
        a_coef = c0
        b_coef = 0.0
    else:
        a_coef = c0 * (alpha - k21_per_h) / (alpha - beta)
        b_coef = c0 * (k21_per_h - beta) / (alpha - beta)
    if times_h is None:
        times_h = [0.0, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 12.0]
    t = np.asarray(times_h, dtype=float)
    conc = a_coef * np.exp(-alpha * t) + b_coef * np.exp(-beta * t)
    return {
        "alpha_per_h": float(alpha),
        "beta_per_h": float(beta),
        "a_coef_mg_l": float(a_coef),
        "b_coef_mg_l": float(b_coef),
        "c0_mg_l": float(c0),
        "times_h": [float(x) for x in t],
        "concentrations_mg_l": [float(x) for x in conc],
        "terminal_half_life_h": float(math.log(2.0) / beta) if beta > 0 else float("inf"),
    }


# 2. CLEARANCE / VOLUME / HALF-LIFE ------------------------------------------
def pk_parameters(*, clearance_l_h: float = 2.0,
                  volume_distribution_l: float = 40.0) -> dict:
    """Core PK parameters: clearance, volume of distribution, half-life.

    Elimination rate constant   k = CL / Vd
    Elimination half-life        t1/2 = ln(2) * Vd / CL = 0.693 * Vd / CL

    Known check: Vd = 40 L, CL = 2.0 L/h -> t1/2 = 0.693*40/2 = 13.86 h
    (~14 h), the worked NCBI/StatPearls example.
    """
    if clearance_l_h <= 0 or volume_distribution_l <= 0:
        raise ValueError("clearance and volume of distribution must be positive")
    k = clearance_l_h / volume_distribution_l
    half_life = math.log(2.0) * volume_distribution_l / clearance_l_h
    return {
        "clearance_l_h": float(clearance_l_h),
        "volume_distribution_l": float(volume_distribution_l),
        "elimination_rate_constant_per_h": float(k),
        "half_life_h": float(half_life),
    }


# 3. LOADING DOSE ------------------------------------------------------------
def loading_dose(*, target_css_mg_l: float = 10.0,
                 volume_distribution_l: float = 50.0,
                 bioavailability: float = 1.0,
                 salt_factor: float = 1.0) -> dict:
    """Loading dose to immediately reach a target steady-state concentration.

        Loading dose = (Css * Vd) / (F * S)

    where Css is the target plasma concentration, Vd the volume of
    distribution, F the bioavailability and S the salt factor.

    Known check: Css = 10 mg/L, Vd = 50 L, F = 1 -> LD = 500 mg
    (Css * Vd; Goodman & Gilman loading-dose relation).
    """
    if target_css_mg_l <= 0 or volume_distribution_l <= 0:
        raise ValueError("target Css and Vd must be positive")
    if not (0.0 < bioavailability <= 1.0) or salt_factor <= 0:
        raise ValueError("bioavailability in (0,1]; salt factor > 0")
    dose = (target_css_mg_l * volume_distribution_l) / (bioavailability * salt_factor)
    return {
        "loading_dose_mg": float(dose),
        "target_css_mg_l": float(target_css_mg_l),
        "volume_distribution_l": float(volume_distribution_l),
        "bioavailability": float(bioavailability),
    }


# 4. STEADY STATE / ACCUMULATION RATIO ---------------------------------------
def steady_state(*, dose_mg: float = 100.0,
                 clearance_l_h: float = 2.0,
                 volume_distribution_l: float = 40.0,
                 tau_h: float = 12.0,
                 bioavailability: float = 1.0) -> dict:
    """Repeated-dosing steady state and the accumulation ratio.

    Elimination rate constant  k = CL / Vd.
    Accumulation ratio (multiple- vs single-dose):

        Rac = 1 / (1 - e^(-k*tau))

    Average steady-state concentration:

        Css_avg = F * Dose / (CL * tau)

    Known check: an interval tau equal to one half-life (k*tau = ln2) gives
    Rac = 1/(1 - 0.5) = 2.0 -> concentrations accumulate exactly two-fold,
    and Rac -> 1 (no accumulation) as tau >> half-life.
    """
    if dose_mg <= 0 or clearance_l_h <= 0 or volume_distribution_l <= 0:
        raise ValueError("dose, clearance, Vd must be positive")
    if tau_h <= 0 or not (0.0 < bioavailability <= 1.0):
        raise ValueError("tau > 0 and bioavailability in (0,1] required")
    k = clearance_l_h / volume_distribution_l
    rac = 1.0 / (1.0 - math.exp(-k * tau_h))
    css_avg = bioavailability * dose_mg / (clearance_l_h * tau_h)
    return {
        "elimination_rate_constant_per_h": float(k),
        "accumulation_ratio": float(rac),
        "css_avg_mg_l": float(css_avg),
        "half_life_h": float(math.log(2.0) / k),
        "tau_h": float(tau_h),
    }


# 5. THERAPEUTIC INDEX -------------------------------------------------------
def therapeutic_index(*, td50: float = 150.0, ed50: float = 10.0,
                      ld1: float = None, ed99: float = None) -> dict:
    """Therapeutic index and margin of safety.

        TI = TD50 / ED50

    (often LD50/ED50 in animal studies). The certain safety factor / margin of
    safety uses the curve extremes:  MOS = LD1 / ED99.

    Known check: TD50 = 150, ED50 = 10 -> TI = 15 (Wikipedia therapeutic index
    worked example); larger TI -> safer drug.
    """
    if td50 <= 0 or ed50 <= 0:
        raise ValueError("TD50 and ED50 must be positive")
    ti = td50 / ed50
    out = {
        "therapeutic_index": float(ti),
        "td50": float(td50),
        "ed50": float(ed50),
    }
    if ld1 is not None and ed99 is not None and ed99 > 0:
        out["margin_of_safety"] = float(ld1 / ed99)
    return out


# 6. SIGMOID Emax / HILL PK-PD ------------------------------------------------
def emax_pkpd(*, concentration: float = 10.0,
              emax: float = 100.0,
              ec50: float = 10.0,
              hill_n: float = 1.0,
              e0: float = 0.0) -> dict:
    """Sigmoid Hill / Emax pharmacodynamic model linking concentration -> effect.

        E = E0 + Emax * C^n / (EC50^n + C^n)

    Known check: at C = EC50 the drug-driven effect is exactly Emax/2 (the
    defining half-maximal-effect property) for every Hill coefficient n.
    """
    if concentration < 0 or ec50 <= 0 or emax < 0:
        raise ValueError("concentration >= 0, EC50 > 0, Emax >= 0 required")
    num = concentration ** hill_n
    drug_effect = emax * num / (ec50 ** hill_n + num)
    return {
        "effect": float(e0 + drug_effect),
        "drug_effect": float(drug_effect),
        "fraction_of_emax": float(drug_effect / emax) if emax else 0.0,
        "concentration": float(concentration),
        "ec50": float(ec50),
    }


# 7. MICHAELIS-MENTEN SATURABLE ELIMINATION ----------------------------------
def michaelis_menten_elimination(*, concentration: float = 10.0,
                                 vmax: float = 10.0,
                                 km: float = 5.0) -> dict:
    """Saturable (Michaelis-Menten) elimination kinetics.

        rate = Vmax * C / (Km + C)

    Low C (C << Km): rate ~ (Vmax/Km)*C -> first-order.
    High C (C >> Km): rate -> Vmax -> zero-order (saturated, e.g. phenytoin,
    ethanol).

    Known check: at C = Km the elimination rate is exactly Vmax/2 (the
    defining Michaelis-Menten half-saturation property).
    """
    if concentration < 0 or vmax <= 0 or km <= 0:
        raise ValueError("concentration >= 0, Vmax > 0, Km > 0 required")
    rate = vmax * concentration / (km + concentration)
    return {
        "elimination_rate": float(rate),
        "fraction_of_vmax": float(rate / vmax),
        "concentration": float(concentration),
        "vmax": float(vmax),
        "km": float(km),
        "saturation_fraction": float(concentration / (km + concentration)),
    }


# 8. PROBIT DOSE-RESPONSE / LD50 ---------------------------------------------
def probit_ld50(*, doses, responses, totals=None):
    """Probit dose-response analysis -> LD50 (median lethal dose).

    Bliss/Finney probit transform: each mortality fraction p is mapped to

        probit = 5 + Phi^-1(p)

    (the 5 offset historically avoids negative numbers). Probit is then a
    linear function of log10(dose); LD50 is the dose at probit = 5, i.e. where
    the modelled mortality is exactly 50%.

    `doses`     : sequence of administered doses (>0)
    `responses` : either mortality fractions in [0,1] OR, if `totals` given,
                  the number of deaths per group.
    `totals`    : optional group sizes (turns counts into fractions).

    Known check: probit = 5 corresponds to 50% response, and the back-solved
    LD50 reproduces the dose at which 50% mortality occurs.
    """
    doses = np.asarray(doses, dtype=float)
    resp = np.asarray(responses, dtype=float)
    if totals is not None:
        totals = np.asarray(totals, dtype=float)
        frac = resp / totals
    else:
        frac = resp
    if np.any(doses <= 0):
        raise ValueError("all doses must be positive")
    # keep only intermediate fractions (0 and 1 -> +/-inf probit)
    mask = (frac > 0.0) & (frac < 1.0)
    if mask.sum() < 2:
        raise ValueError("need >=2 partial-response points for probit regression")
    log_d = np.log10(doses[mask])
    probit = 5.0 + stats.norm.ppf(frac[mask])
    # linear regression probit = intercept + slope * log10(dose)
    slope, intercept, r_value, _, _ = stats.linregress(log_d, probit)
    # LD50: probit = 5  ->  log10(LD50) = (5 - intercept)/slope
    log_ld50 = (5.0 - intercept) / slope
    ld50 = 10.0 ** log_ld50
    return {
        "ld50": float(ld50),
        "slope": float(slope),
        "intercept": float(intercept),
        "r_squared": float(r_value ** 2),
        "probit_at_ld50": 5.0,
    }


# Convenience aliases for route keywords -------------------------------------
clearance = pk_parameters
half_life = pk_parameters
volume_of_distribution = pk_parameters
pkpd = emax_pkpd
michaelis_elimination = michaelis_menten_elimination
probit = probit_ld50
ld50 = probit_ld50
