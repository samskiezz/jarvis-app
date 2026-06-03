"""Food-science methods verified against KNOWN published values.

Known values used:
  D=0.21 min, z=10°C, 12D botulinum cook F0 = 2.52 min at 121.1°C
  Kf water = 1.86 °C·kg/mol (1 molal sucrose -> -1.86°C; NaCl i=2 -> 3.72°C)
  Maillard Ea ≈ 92 kJ/mol -> 150->160°C rate ratio ≈ 1.83
  Q10 = 2 -> doubling per 10°C (8 wk@40°C -> 32 wk@20°C)
  Brix↔SG NBS polynomial: 20 °Bx <-> SG ≈ 1.0829
"""
import math

from underworld.server.services.methods_foodscience import (
    arrhenius_rate,
    ball_process_time,
    bet_monolayer,
    boiling_point_elevation,
    brix_mass_sugar,
    brix_to_sg,
    come_up_time_correction,
    f0_from_d12,
    f0_sterilization,
    freezing_point_depression,
    gab_sorption,
    heat_penetration_temp,
    maillard_extent,
    maillard_rate_ratio,
    q10_from_rates,
    q10_shelf_life,
    sg_to_brix,
    thermal_death,
    water_activity_raoult,
    z_value_from_two_d,
    ROUTE_TABLE,
)


# 1. Thermal death D-value / z-value / log reduction --------------------------
def test_12d_log_reduction():
    # D=0.21 min held for 2.52 min -> exactly 12 log reductions (botulinum cook)
    r = thermal_death(d_value_min=0.21, time_min=2.52)
    assert abs(r["log_reduction"] - 12.0) < 1e-6
    assert abs(r["survival_fraction"] - 1e-12) < 1e-14


def test_d_value_z_shift():
    # raising temperature by z=10°C must cut the D-value tenfold
    r = thermal_death(d_value_min=0.21, time_min=0.21, z_value_c=10.0,
                      d_ref_value_min=0.21, d_ref_temp_c=121.1, temp_c=131.1)
    assert abs(r["d_at_temp_min"] - 0.021) < 1e-6


def test_z_value_from_two_points():
    # D drops 0.21->0.021 over a 10°C rise -> z = 10°C (known)
    z = z_value_from_two_d(d1_min=0.21, t1_c=121.1, d2_min=0.021, t2_c=131.1)
    assert abs(z["z_value_c"] - 10.0) < 1e-6


# 2. F0 sterilization value ---------------------------------------------------
def test_f0_at_reference_temp():
    # held entirely at 121.1°C for 2.52 min -> F0 = 2.52 min (12D cook)
    profile = [121.1] * 252         # 252 steps of 0.01 min = 2.52 min
    r = f0_sterilization(temp_profile_c=profile, dt_min=0.01)
    assert abs(r["f0_min"] - 2.52) < 1e-6


def test_f0_lethality_doubles_per_z():
    # +10°C (one z) above reference -> 10x lethal rate
    one = f0_sterilization(temp_profile_c=[121.1], dt_min=1.0)["f0_min"]
    ten = f0_sterilization(temp_profile_c=[131.1], dt_min=1.0)["f0_min"]
    assert abs(ten / one - 10.0) < 1e-6


def test_f0_target_12d():
    assert abs(f0_from_d12()["f0_target_min"] - 2.52) < 1e-9


# 3. Water activity & moisture sorption --------------------------------------
def test_water_activity_raoult_known():
    # 1 mol sucrose in 1 kg (55.51 mol) water -> aw ≈ 0.982
    r = water_activity_raoult(mol_solute=1.0, mol_water=1000.0 / 18.01528)
    assert abs(r["water_activity"] - 0.982) < 0.001


def test_gab_zero_at_dry():
    assert gab_sorption(aw=0.0, m0=0.1, c=10.0, k=0.9)["moisture_dry_basis"] == 0.0


def test_bet_monolayer_consistency():
    # BET and GAB coincide at the monolayer when k=1; both finite & positive
    g = gab_sorption(aw=0.2, m0=0.08, c=15.0, k=1.0)["moisture_dry_basis"]
    b = bet_monolayer(aw=0.2, m0=0.08, c=15.0)["moisture_dry_basis"]
    assert abs(g - b) < 1e-9 and b > 0


# 4. Freezing-point depression (Kf = 1.86) -----------------------------------
def test_freezing_point_1molal_sucrose():
    r = freezing_point_depression(molality=1.0, i_vant_hoff=1.0)
    assert abs(r["delta_tf_c"] - 1.86) < 1e-9
    assert abs(r["freezing_point_c"] + 1.86) < 1e-9


def test_freezing_point_nacl_dissociates():
    # NaCl i=2 -> ΔTf = 3.72°C (known)
    r = freezing_point_depression(molality=1.0, i_vant_hoff=2.0)
    assert abs(r["delta_tf_c"] - 3.72) < 1e-9


def test_boiling_point_elevation_known():
    # 1 molal nonelectrolyte -> +0.512°C -> bp 100.512°C
    r = boiling_point_elevation(molality=1.0)
    assert abs(r["boiling_point_c"] - 100.512) < 1e-3


# 5. Maillard / Arrhenius browning -------------------------------------------
def test_maillard_rate_ratio_known():
    # Ea = 92 kJ/mol, 150->160°C -> k2/k1 ≈ 1.83
    r = maillard_rate_ratio(ea_j_mol=92000.0, t1_c=150.0, t2_c=160.0)
    assert abs(r["rate_ratio"] - 1.83) < 0.02
    assert r["rate_ratio"] > 1.0      # browning accelerates with temperature


def test_arrhenius_increases_with_temp():
    k1 = arrhenius_rate(a_pre=1e14, ea_j_mol=92000.0, temp_c=150.0)["k"]
    k2 = arrhenius_rate(a_pre=1e14, ea_j_mol=92000.0, temp_c=160.0)["k"]
    # ratio matches the closed-form Arrhenius ratio
    expected = maillard_rate_ratio(ea_j_mol=92000.0, t1_c=150.0, t2_c=160.0)["rate_ratio"]
    assert abs(k2 / k1 - expected) < 1e-3


def test_maillard_extent_linear():
    assert abs(maillard_extent(k_min=0.017, time_min=10.0)["browning_extent"] - 0.17) < 1e-9


# 6. Heat penetration / come-up time -----------------------------------------
def test_come_up_correction_058():
    # Ball: 0.58 × CUT credited; CUT=10 -> 5.8 min
    assert abs(come_up_time_correction(cut_min=10.0)["effective_cut_min"] - 5.8) < 1e-9


def test_heat_penetration_one_decade_at_fh():
    # at t = fh the temperature deficit drops by exactly one decade
    full = heat_penetration_temp(retort_c=121.1, initial_c=21.1, fh_min=20.0, jh=1.0, time_min=0.0)
    one_fh = heat_penetration_temp(retort_c=121.1, initial_c=21.1, fh_min=20.0, jh=1.0, time_min=20.0)
    assert abs(full["deficit_c"] / one_fh["deficit_c"] - 10.0) < 1e-6


def test_ball_process_time_roundtrip():
    # process time to reach a target then re-evaluate temperature -> matches
    t = ball_process_time(retort_c=121.1, initial_c=21.1, target_c=120.0,
                          fh_min=20.0, jh=1.0)["process_time_min"]
    temp = heat_penetration_temp(retort_c=121.1, initial_c=21.1, fh_min=20.0,
                                 jh=1.0, time_min=t)["product_temp_c"]
    assert abs(temp - 120.0) < 1e-3


# 7. Shelf-life Q10 model -----------------------------------------------------
def test_q10_doubling_per_10c():
    # 8 wk at 40°C, Q10=2 -> 32 wk at 20°C (two 10°C steps, ×4)
    r = q10_shelf_life(shelf_life_ref=8.0, t_ref_c=40.0, t_new_c=20.0, q10=2.0)
    assert abs(r["shelf_life"] - 32.0) < 1e-6


def test_q10_single_step_halves_rate():
    # +10°C halves shelf life when Q10=2
    r = q10_shelf_life(shelf_life_ref=10.0, t_ref_c=20.0, t_new_c=30.0, q10=2.0)
    assert abs(r["shelf_life"] - 5.0) < 1e-6


def test_q10_from_rates_known():
    # rate doubles over a 10°C rise -> Q10 = 2
    r = q10_from_rates(rate1=1.0, t1_c=20.0, rate2=2.0, t2_c=30.0)
    assert abs(r["q10"] - 2.0) < 1e-9


# 8. Brix sugar concentration & density --------------------------------------
def test_sg_to_brix_known():
    # SG 1.0829 -> ≈20 °Bx (NBS polynomial)
    assert abs(sg_to_brix(sg=1.0829)["brix"] - 20.0) < 0.05


def test_brix_to_sg_known():
    # 20 °Bx -> SG ≈ 1.0829
    assert abs(brix_to_sg(brix=20.0)["specific_gravity"] - 1.0829) < 0.001


def test_brix_to_sg_roundtrip():
    sg = brix_to_sg(brix=15.0)["specific_gravity"]
    assert abs(sg_to_brix(sg=sg)["brix"] - 15.0) < 0.01


def test_brix_mass_sugar():
    # 20 °Bx of 500 g solution -> 100 g sucrose
    assert abs(brix_mass_sugar(brix=20.0, solution_mass_g=500.0)["sugar_mass_g"] - 100.0) < 1e-9


# Route table -----------------------------------------------------------------
def test_route_table_maps_keywords_to_callables():
    assert ROUTE_TABLE[("d_value", "z_value", "thermal_death")] is thermal_death
    assert ROUTE_TABLE[("pasteuriz", "steriliz", "f0")] is f0_sterilization
    assert ROUTE_TABLE[("freezing_point", "cryoscopic")] is freezing_point_depression
    assert ROUTE_TABLE[("maillard", "browning", "arrhenius")] is maillard_rate_ratio
    assert ROUTE_TABLE[("shelf_life", "q10")] is q10_shelf_life
    assert ROUTE_TABLE[("brix", "sugar", "density")] is sg_to_brix
    assert ROUTE_TABLE[("food_science",)] is f0_from_d12
    assert all(callable(v) for v in ROUTE_TABLE.values())
