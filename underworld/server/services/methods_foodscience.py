"""Food-science simulations — real thermal-processing, preservation and physical
chemistry from the canonical equations. Researched and verified against KNOWN
published values.

Methods (each verified vs a known value):
  1. thermal_death        D-value & z-value, log reduction (Bigelow model)
  2. f0_sterilization     F0 lethality at 121.1°C reference (12D botulinum cook = 2.52 min)
  3. water_activity       water activity & moisture sorption (Raoult / GAB)
  4. freezing_point       freezing-point depression via molal Kf=1.86 °C·kg/mol
  5. maillard_arrhenius   Maillard/Arrhenius browning kinetics, rate vs T
  6. heat_penetration     Ball heat penetration / come-up time (0.58·CUT)
  7. shelf_life_q10        Q10 shelf-life model, doubling per 10°C
  8. brix_density         Brix sugar concentration & specific gravity (NBS polynomial)

Sources: Bigelow/Ball thermal death & F0 (D=0.21 min, z=10°C, 12D=2.52 min at
121.1°C; sciencedirect, priorclave, terrafoodtech); freezing-point depression
Kf water = 1.86 °C·kg/mol (LibreTexts); GAB/BET sorption (COST90); Maillard
Arrhenius Ea~92 kJ/mol (Stamp 1983, J. Food Sci.); Q10≈2 doubling per 10°C
(Wikipedia Q10); Brix↔SG NBS polynomial (Wikipedia Brix, RMS 0.0009 °Bx).
"""
from __future__ import annotations

import math

# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------
R_GAS = 8.314462618          # J/(mol·K) universal gas constant
KF_WATER = 1.86              # °C·kg/mol  molal freezing-point depression constant
KB_WATER = 0.512             # °C·kg/mol  molal boiling-point elevation constant
T_REF_STERIL = 121.1         # °C  reference sterilization temperature (250°F)
Z_REF = 10.0                 # °C  reference z-value for botulinum cook
MOL_WATER_PER_KG = 1000.0 / 18.01528   # ≈55.51 mol water per kg


def _c_to_k(t_c: float) -> float:
    return t_c + 273.15


# ---------------------------------------------------------------------------
# 1. Thermal death: D-value, z-value, log reduction (Bigelow model)
# ---------------------------------------------------------------------------
def thermal_death(*, d_value_min: float, time_min: float,
                  z_value_c: float | None = None,
                  d_ref_value_min: float | None = None,
                  d_ref_temp_c: float | None = None,
                  temp_c: float | None = None) -> dict:
    """Bigelow first-order thermal death.

    D-value = time for a 90% (1 log) reduction at a given temperature.
    log reduction over `time_min`:  N0/N = 10^(time/D)  ->  log10 = time/D.
    z-value = °C rise that cuts the D-value by a factor of 10:
        D(T) = D_ref · 10^((T_ref - T)/z)

    Verify: D=0.21 min held 2.52 min -> 12 log reductions (the 12D botulinum cook).
    """
    out: dict = {}
    log_reduction = time_min / d_value_min
    out["log_reduction"] = round(log_reduction, 4)
    out["survival_fraction"] = 10.0 ** (-log_reduction)
    out["d_value_min"] = d_value_min
    # Optional temperature-shifted D-value via z-value
    if z_value_c is not None and d_ref_value_min is not None \
            and d_ref_temp_c is not None and temp_c is not None:
        d_t = d_ref_value_min * 10.0 ** ((d_ref_temp_c - temp_c) / z_value_c)
        out["d_at_temp_min"] = round(d_t, 6)
        out["z_value_c"] = z_value_c
    return out


def z_value_from_two_d(*, d1_min: float, t1_c: float,
                       d2_min: float, t2_c: float) -> dict:
    """z-value from two (D, T) points: z = (T2 - T1) / (log10 D1 - log10 D2)."""
    z = (t2_c - t1_c) / (math.log10(d1_min) - math.log10(d2_min))
    return {"z_value_c": round(z, 4)}


# ---------------------------------------------------------------------------
# 2. F0 sterilization value at 121.1°C reference
# ---------------------------------------------------------------------------
def f0_sterilization(*, temp_profile_c: list[float], dt_min: float,
                     z_value_c: float = Z_REF,
                     t_ref_c: float = T_REF_STERIL) -> dict:
    """Accumulated lethality F0 = Σ 10^((T - 121.1)/z) · dt  (minutes).

    Lethal rate L = 10^((T - T_ref)/z); F0 is its time integral, expressed as
    equivalent minutes at 121.1°C.

    Verify: a hold entirely at 121.1°C for 2.52 min gives F0 = 2.52 min, the
    12D botulinum cook (12 × D121 of 0.21 min).
    """
    f0 = 0.0
    for t in temp_profile_c:
        f0 += 10.0 ** ((t - t_ref_c) / z_value_c) * dt_min
    return {"f0_min": round(f0, 4), "t_ref_c": t_ref_c, "z_value_c": z_value_c}


def f0_from_d12(*, d_ref_min: float = 0.21, n_decimal: float = 12.0) -> dict:
    """Target F0 for an n-log (n-decimal) process: F0 = n · D_ref.

    Verify: 12 × 0.21 = 2.52 min (botulinum cook)."""
    return {"f0_target_min": round(n_decimal * d_ref_min, 4),
            "decimal_reductions": n_decimal}


# ---------------------------------------------------------------------------
# 3. Water activity & moisture sorption
# ---------------------------------------------------------------------------
def water_activity_raoult(*, mol_solute: float, mol_water: float) -> dict:
    """Ideal-solution water activity (Raoult): aw = x_water = n_w/(n_w + n_s).

    Verify: 1 mol sucrose in 1 kg water (55.51 mol) -> aw ≈ 0.982.
    """
    aw = mol_water / (mol_water + mol_solute)
    return {"water_activity": round(aw, 4), "mole_fraction_water": round(aw, 4)}


def gab_sorption(*, aw: float, m0: float, c: float, k: float) -> dict:
    """GAB moisture sorption isotherm — equilibrium moisture content (dry basis):

        M = m0·C·K·aw / [ (1 - K·aw)(1 - K·aw + C·K·aw) ]

    m0 = monolayer moisture content. COST90-recommended model for foods.
    Verify: at aw->0 M->0; monolayer recovered consistently for typical params.
    """
    denom = (1 - k * aw) * (1 - k * aw + c * k * aw)
    m = m0 * c * k * aw / denom
    return {"moisture_dry_basis": round(m, 6), "monolayer_m0": m0}


def bet_monolayer(*, aw: float, m0: float, c: float) -> dict:
    """BET isotherm (valid aw<0.45): M = m0·C·aw / [(1-aw)(1+(C-1)aw)]."""
    m = m0 * c * aw / ((1 - aw) * (1 + (c - 1) * aw))
    return {"moisture_dry_basis": round(m, 6), "monolayer_m0": m0}


# ---------------------------------------------------------------------------
# 4. Freezing-point depression (colligative, molal Kf)
# ---------------------------------------------------------------------------
def freezing_point_depression(*, molality: float, kf: float = KF_WATER,
                              i_vant_hoff: float = 1.0) -> dict:
    """ΔTf = i · Kf · molality;  freezing point = 0 - ΔTf (°C for water).

    Verify: 1 molal sucrose (i=1) -> ΔTf = 1.86°C, FP = -1.86°C.
            1 molal NaCl (i=2)    -> ΔTf = 3.72°C.
    """
    dtf = i_vant_hoff * kf * molality
    return {"delta_tf_c": round(dtf, 4), "freezing_point_c": round(-dtf, 4),
            "kf": kf, "i": i_vant_hoff}


def boiling_point_elevation(*, molality: float, kb: float = KB_WATER,
                            i_vant_hoff: float = 1.0) -> dict:
    """ΔTb = i · Kb · molality;  boiling point = 100 + ΔTb (°C for water)."""
    dtb = i_vant_hoff * kb * molality
    return {"delta_tb_c": round(dtb, 4), "boiling_point_c": round(100 + dtb, 4)}


# ---------------------------------------------------------------------------
# 5. Maillard / Arrhenius browning kinetics
# ---------------------------------------------------------------------------
def arrhenius_rate(*, a_pre: float, ea_j_mol: float, temp_c: float) -> dict:
    """Arrhenius rate constant k = A·exp(-Ea/RT)."""
    k = a_pre * math.exp(-ea_j_mol / (R_GAS * _c_to_k(temp_c)))
    return {"k": k, "temp_k": round(_c_to_k(temp_c), 2)}


def maillard_rate_ratio(*, ea_j_mol: float, t1_c: float, t2_c: float) -> dict:
    """Browning rate ratio between two temperatures (Arrhenius):

        k2/k1 = exp[ -Ea/R · (1/T2 - 1/T1) ]

    Verify: Maillard Ea≈92 kJ/mol (glucose/aspartame, Stamp 1983), 150->160°C
    gives k2/k1 ≈ 1.83 (browning accelerates with temperature).
    """
    t1k, t2k = _c_to_k(t1_c), _c_to_k(t2_c)
    ratio = math.exp(-ea_j_mol / R_GAS * (1 / t2k - 1 / t1k))
    return {"rate_ratio": round(ratio, 4), "t1_c": t1_c, "t2_c": t2_c}


def maillard_extent(*, k_min: float, time_min: float) -> dict:
    """Zero-order browning extent (common for color/AGE development): B = k·t."""
    return {"browning_extent": round(k_min * time_min, 6)}


# ---------------------------------------------------------------------------
# 6. Heat penetration / come-up time (Ball method)
# ---------------------------------------------------------------------------
def come_up_time_correction(*, cut_min: float, factor: float = 0.58) -> dict:
    """Ball's correction: effective process time credits 0.58 × come-up time
    (CUT) toward lethality.

    Verify: CUT=10 min -> 5.8 effective min credited."""
    return {"effective_cut_min": round(factor * cut_min, 4),
            "cut_min": cut_min, "factor": factor}


def heat_penetration_temp(*, retort_c: float, initial_c: float,
                          fh_min: float, jh: float, time_min: float) -> dict:
    """Ball semi-log heating curve — product temperature at a given time:

        T_rt - T = jh · (T_rt - T0) · 10^(-t/fh)

    fh = time for the heating curve to traverse one log cycle; jh = lag factor.
    Verify: at t = fh the temperature deficit drops by exactly one decade.
    """
    deficit = jh * (retort_c - initial_c) * 10.0 ** (-time_min / fh_min)
    temp = retort_c - deficit
    return {"product_temp_c": round(temp, 4), "deficit_c": round(deficit, 6)}


def ball_process_time(*, retort_c: float, initial_c: float, target_c: float,
                      fh_min: float, jh: float) -> dict:
    """Solve Ball's heating curve for the time to reach `target_c`:

        t = fh · log10[ jh·(T_rt - T0) / (T_rt - T_target) ]
    """
    t = fh_min * math.log10(jh * (retort_c - initial_c) / (retort_c - target_c))
    return {"process_time_min": round(t, 4)}


# ---------------------------------------------------------------------------
# 7. Shelf-life Q10 model (doubling per 10°C)
# ---------------------------------------------------------------------------
def q10_shelf_life(*, shelf_life_ref: float, t_ref_c: float, t_new_c: float,
                   q10: float = 2.0) -> dict:
    """Q10 shelf-life prediction:

        SL(T) = SL_ref · Q10^((T_ref - T)/10)

    Lower temperature -> longer shelf life. Q10=2 means the deterioration rate
    doubles for each +10°C (so shelf life halves).

    Verify: 8 weeks at 40°C, Q10=2 -> 32 weeks at 20°C (two 10°C steps, ×4).
    """
    sl = shelf_life_ref * q10 ** ((t_ref_c - t_new_c) / 10.0)
    return {"shelf_life": round(sl, 4), "q10": q10,
            "t_ref_c": t_ref_c, "t_new_c": t_new_c}


def q10_from_rates(*, rate1: float, t1_c: float, rate2: float, t2_c: float) -> dict:
    """Q10 from two reaction rates: Q10 = (rate2/rate1)^(10/(T2-T1))."""
    q10 = (rate2 / rate1) ** (10.0 / (t2_c - t1_c))
    return {"q10": round(q10, 4)}


# ---------------------------------------------------------------------------
# 8. Brix sugar concentration & density
# ---------------------------------------------------------------------------
# NBS/ASBC apparent specific gravity (20°C/20°C) polynomial, RMS 0.0009 °Bx.
def brix_to_sg(*, brix: float) -> dict:
    """Brix -> apparent specific gravity (20/20°C) via Newton inversion of the
    NBS polynomial. Verify: 20 °Bx -> SG ≈ 1.0829.
    """
    # Invert  brix(sg) polynomial for sg via Newton-Raphson (analytic deriv).
    sg = 1.0 + brix / 250.0  # initial guess
    for _ in range(40):
        f = (182.46007 * sg ** 3 - 775.68212 * sg ** 2
             + 1262.7794 * sg - 669.56218) - brix
        df = 3 * 182.46007 * sg ** 2 - 2 * 775.68212 * sg + 1262.7794
        sg -= f / df
    return {"specific_gravity": round(sg, 4)}


def sg_to_brix(*, sg: float) -> dict:
    """Apparent specific gravity (20/20°C) -> °Brix (NBS polynomial).

    °Bx = 182.46007·SG³ - 775.68212·SG² + 1262.7794·SG - 669.56218
    Verify: SG 1.0829 -> ≈20 °Bx.
    """
    bx = (182.46007 * sg ** 3 - 775.68212 * sg ** 2
          + 1262.7794 * sg - 669.56218)
    return {"brix": round(bx, 4)}


def brix_mass_sugar(*, brix: float, solution_mass_g: float) -> dict:
    """°Brix = grams sucrose per 100 g solution (% w/w). Sugar mass in a batch.

    Verify: 20 °Bx of 500 g solution -> 100 g sugar.
    """
    sugar = brix / 100.0 * solution_mass_g
    return {"sugar_mass_g": round(sugar, 4), "brix": brix}


# ---------------------------------------------------------------------------
# Convenience dispatch table (keyword -> function)
# ---------------------------------------------------------------------------
ROUTE_TABLE: dict[tuple[str, ...], object] = {
    ("d_value", "z_value", "thermal_death"): thermal_death,
    ("pasteuriz", "steriliz", "f0"): f0_sterilization,
    ("water_activity", "sorption", "moisture"): water_activity_raoult,
    ("freezing_point", "cryoscopic"): freezing_point_depression,
    ("maillard", "browning", "arrhenius"): maillard_rate_ratio,
    ("heat_penetration", "come_up", "ball"): come_up_time_correction,
    ("shelf_life", "q10"): q10_shelf_life,
    ("brix", "sugar", "density"): sg_to_brix,
    ("food_science",): f0_from_d12,
}
