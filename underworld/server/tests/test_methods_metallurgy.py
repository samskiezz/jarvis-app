"""Tests for real metallurgy & welding methods.

Each test asserts the implemented law against an INDEPENDENT published/known
reference value. Citations are inline next to each assertion.
"""
import math

import pytest

from underworld.server.services.methods_metallurgy import (
    CE_PREHEAT_THRESHOLD,
    avrami_jmak,
    avrami_time_for_fraction,
    carbon_equivalent_iiw,
    cooling_time_t85,
    heat_input,
    hall_petch_yield,
    hollomon_jaffe,
    ideal_critical_diameter,
    rosenthal_temperature,
    route,
    scheil_segregation,
)


# ── 1. IIW carbon equivalent (weldability / preheat) ─────────────────────────
def test_ce_iiw_4140_needs_preheat():
    """AISI 4140 low-alloy steel (C 0.40, Mn 0.875, Cr 0.95, Mo 0.20 wt%).
    IIW CE = C + Mn/6 + (Cr+Mo+V)/5 + (Ni+Cu)/15
           = 0.40 + 0.1458 + 0.23 = 0.776.
    Known: CE >> 0.45 -> preheat required (high cold-cracking risk).
    Ref: en.wikipedia.org/wiki/Equivalent_carbon_content (IIW formula);
    IIW preheat rule CE>0.45."""
    r = carbon_equivalent_iiw(C=0.40, Mn=0.875, Cr=0.95, Mo=0.20)
    assert r["carbon_equivalent"] == pytest.approx(0.776, abs=0.005)
    assert r["preheat_required"] is True
    assert CE_PREHEAT_THRESHOLD == 0.45


def test_ce_iiw_mild_steel_no_preheat():
    """Mild structural steel ~A36 (C 0.20, Mn 0.90). CE = 0.20 + 0.15 = 0.35.
    Known: CE < 0.45 -> readily weldable, no preheat needed.
    Ref: IIW carbon equivalent guidance."""
    r = carbon_equivalent_iiw(C=0.20, Mn=0.90)
    assert r["carbon_equivalent"] == pytest.approx(0.35, abs=0.005)
    assert r["preheat_required"] is False


# ── 2. Rosenthal moving point heat source (3-D) ──────────────────────────────
def test_rosenthal_trailing_cooler_than_pool():
    """Rosenthal 3-D: T = T0 + Q/(2 pi k R) exp(-v(R+xi)/2alpha).
    For a fixed material point, as the arc moves away (R grows, xi becomes more
    negative i.e. further behind) the temperature must FALL -> cooling.
    Verify: a far trailing point is cooler than a near trailing point.
    Steel: Q=2000 W, v=2 mm/s, k=25 W/mK, alpha=5e-6 m^2/s.
    Ref: Rosenthal solution, ScienceDirect Topics 'Rosenthal Solution'."""
    common = dict(Q=2000.0, v=0.002, k=25.0, alpha=5e-6, T0=25.0)
    near = rosenthal_temperature(R=0.003, xi=-0.003, **common)
    far = rosenthal_temperature(R=0.008, xi=-0.008, **common)
    assert far["temperature_c"] < near["temperature_c"]  # cooling with distance
    # singular at source
    with pytest.raises(ValueError):
        rosenthal_temperature(R=0.0, xi=0.0, **common)


def test_rosenthal_trail_hotter_than_lead():
    """At equal radial distance, the point behind the arc (xi<0) is hotter than
    the point ahead (xi>0): the deposited-heat trailing field. This produces the
    teardrop weld-pool asymmetry. Same parameters as above."""
    common = dict(Q=2000.0, v=0.002, k=25.0, alpha=5e-6, T0=25.0)
    behind = rosenthal_temperature(R=0.005, xi=-0.005, **common)
    ahead = rosenthal_temperature(R=0.005, xi=+0.005, **common)
    assert behind["temperature_c"] > ahead["temperature_c"]


# ── 3. Cooling time t8/5 (800->500 C), 3-D ───────────────────────────────────
def test_t85_value_and_heat_input_trend():
    """SEW/EN 1011-2 3-D thick-plate cooling time:
    t8/5 = (6700-5*Tp)*Q*(1/(500-Tp)-1/(800-Tp))*F3.
    At Tp=20 C, F3=1, Q=1.0 kJ/mm:
       (6700-100)*1*(1/480 - 1/780) = 6600*(0.0020833-0.0012821) = 5.29 s.
    Known trend: HIGHER heat input -> LONGER t8/5 (slower cooling).
    Ref: migal.co 'cooling-rate-t8/5' explanation (3-D heat flux formula)."""
    r1 = cooling_time_t85(Q_kj_mm=1.0, Tp_c=20.0)
    assert r1["t8_5_s"] == pytest.approx(5.29, abs=0.05)
    r2 = cooling_time_t85(Q_kj_mm=2.0, Tp_c=20.0)
    assert r2["t8_5_s"] > r1["t8_5_s"]  # more heat -> slower cooling
    # higher preheat also slows cooling
    r3 = cooling_time_t85(Q_kj_mm=1.0, Tp_c=150.0)
    assert r3["t8_5_s"] > r1["t8_5_s"]


def test_heat_input_helper():
    """Q = eta*U*I/v. eta=0.8, U=24 V, I=200 A, v=4 mm/s
       = 0.8*24*200/4 / 1000 = 0.96 kJ/mm. Ref: EN 1011-1 heat input."""
    r = heat_input(eta=0.8, voltage_v=24.0, current_a=200.0,
                   travel_speed_mm_s=4.0)
    assert r["heat_input_kj_mm"] == pytest.approx(0.96, abs=1e-3)


# ── 4. Hollomon-Jaffe / Larson-Miller tempering parameter ────────────────────
def test_hollomon_jaffe_value_and_tradeoff():
    """HP = T(K) * (C + log10 t[h]), C=20.
    T=600 C = 873.15 K, t=1 h: HP = 873.15*(20+0) = 17463.
    Known equivalence: longer time trades for lower temperature (same HP).
    Ref: en.wikipedia.org/wiki/Larson-Miller_relation (C~20 for steels)."""
    r = hollomon_jaffe(T_c=600.0, t_hours=1.0)
    assert r["tempering_parameter"] == pytest.approx(17463.0, abs=1.0)
    assert r["tempering_parameter_x1000"] == pytest.approx(17.463, abs=0.01)
    # higher T and longer t both raise HP (more tempering / softening)
    assert hollomon_jaffe(700.0, 1.0)["tempering_parameter"] > r["tempering_parameter"]
    assert hollomon_jaffe(600.0, 10.0)["tempering_parameter"] > r["tempering_parameter"]


# ── 5. Scheil-Gulliver microsegregation ──────────────────────────────────────
def test_scheil_last_liquid_enrichment():
    """Scheil: Cl = C0 (1-fs)^(k-1), Cs = k*Cl. Al-Cu k=0.17.
    As fs -> 1 the residual liquid is strongly enriched (interdendritic
    eutectic / microsegregation). At fs=0.9: (0.1)^(0.17-1)=(0.1)^-0.83=6.76,
    so Cl/C0 ~= 6.76. Ref: doitpoms.ac.uk Scheil; en.wikipedia Scheil_equation,
    Al-Cu k = 5.7/33 = 0.17."""
    early = scheil_segregation(C0=1.0, k=0.17, fs=0.1)
    late = scheil_segregation(C0=1.0, k=0.17, fs=0.9)
    assert late["enrichment_ratio_liquid"] == pytest.approx(6.76, abs=0.05)
    assert late["C_liquid"] > early["C_liquid"]  # liquid enriches as it freezes
    # solute-rejecting (k<1) solid stays leaner than the liquid it grew from
    assert late["C_solid"] < late["C_liquid"]
    with pytest.raises(ValueError):
        scheil_segregation(C0=1.0, k=0.17, fs=1.0)


# ── 6. Avrami / JMAK ──────────────────────────────────────────────────────────
def test_avrami_sigmoidal_and_halftime():
    """X = 1 - exp(-k t^n). Sigmoidal: X(0)=0, X(inf)->1.
    Choose n=2.5 and k so that t_half=100 s (k=ln2/100^2.5). Then X(100)=0.5
    exactly. Ref: en.wikipedia.org/wiki/Avrami_equation (half-time relation)."""
    n = 2.5
    t_half = 100.0
    k = math.log(2.0) / t_half ** n
    assert avrami_jmak(t=0.0, k=k, n=n)["fraction_transformed"] == pytest.approx(0.0)
    mid = avrami_jmak(t=t_half, k=k, n=n)
    assert mid["fraction_transformed"] == pytest.approx(0.5, abs=1e-6)
    assert mid["t_half"] == pytest.approx(100.0, rel=1e-6)
    # monotone rise toward 1
    assert avrami_jmak(t=10.0, k=k, n=n)["fraction_transformed"] < 0.5
    assert avrami_jmak(t=1000.0, k=k, n=n)["fraction_transformed"] > 0.99


def test_avrami_inversion_round_trip():
    """Inverting for the time to reach a given fraction must round-trip with the
    forward JMAK equation."""
    k, n = 1e-3, 2.0
    t = avrami_time_for_fraction(X=0.9, k=k, n=n)["time"]
    assert avrami_jmak(t=t, k=k, n=n)["fraction_transformed"] == pytest.approx(0.9, abs=1e-9)


# ── 7. Grossmann ideal critical diameter (hardenability) ─────────────────────
def test_grossmann_multiplying_factors_and_hardenability_trend():
    """ASTM A255 multiplying factors (1 + m*%X): Mn slope 3.333, Cr slope 2.16.
    Known: Mn 0.80% -> 3.667; Cr 0.43% -> 1.929.
    Ref: mxteen hardenability-calculation (ASTM A255 worked factors)."""
    r = ideal_critical_diameter(C=0.40, grain_size_astm=7, Mn=0.80, Cr=0.43)
    f = r["multiplying_factors"]
    assert f["Mn"] == pytest.approx(3.667, abs=0.002)
    assert f["Cr"] == pytest.approx(1.929, abs=0.002)


def test_grossmann_base_di_and_alloy_increases_hardenability():
    """Base carbon term D_IC = 0.54*sqrt(%C) inch at ASTM grain size 7.
    C=0.40 -> D_IC = 0.54*0.6325 = 0.3415 in.
    Known trend: adding alloying elements (positive factors) raises D_I, i.e.
    greater hardenability. Ref: Grossmann D_I, ASTM A255."""
    plain = ideal_critical_diameter(C=0.40, grain_size_astm=7)
    assert plain["D_IC_base_inch"] == pytest.approx(0.3415, abs=0.001)
    assert plain["D_I_inch"] == pytest.approx(0.3415, abs=0.001)  # no alloy = base
    alloyed = ideal_critical_diameter(C=0.40, grain_size_astm=7, Mn=0.8, Cr=0.5, Mo=0.2)
    assert alloyed["D_I_inch"] > plain["D_I_inch"]  # alloying -> more hardenable
    assert alloyed["D_I_mm"] == pytest.approx(alloyed["D_I_inch"] * 25.4, rel=1e-9)


# ── 8. Hall-Petch yield strengthening ─────────────────────────────────────────
def test_hall_petch_brass_known_value():
    """70Cu-30Zn brass (Callister Fig. 7.15 / Eq. 7.7): sigma_0 = 25 MPa,
    k_y = 12.5 MPa*mm^0.5. For grain size d = 0.01 mm:
        sigma_y = 25 + 12.5/sqrt(0.01) = 25 + 125 = 150 MPa.
    Our k_y is in MPa*m^0.5, so k_y = 12.5*sqrt(1e-3) = 0.3953.
    Ref: Callister, Materials Science & Engineering, Hall-Petch brass example."""
    k_y_m = 12.5 * math.sqrt(1e-3)  # MPa*m^0.5
    r = hall_petch_yield(sigma_0=25.0, k_y=k_y_m, grain_size_m=0.01e-3)
    assert r["yield_strength_mpa"] == pytest.approx(150.0, abs=0.5)


def test_hall_petch_finer_grain_stronger():
    """Hall-Petch: finer grain (smaller d) -> higher yield strength."""
    k_y_m = 12.5 * math.sqrt(1e-3)
    coarse = hall_petch_yield(sigma_0=25.0, k_y=k_y_m, grain_size_m=0.1e-3)
    fine = hall_petch_yield(sigma_0=25.0, k_y=k_y_m, grain_size_m=0.005e-3)
    assert fine["yield_strength_mpa"] > coarse["yield_strength_mpa"]
    with pytest.raises(ValueError):
        hall_petch_yield(sigma_0=25.0, k_y=k_y_m, grain_size_m=0.0)


# ── route table ───────────────────────────────────────────────────────────────
def test_route_table():
    assert route("carbon_equiv") is carbon_equivalent_iiw
    assert route("check weldability") is carbon_equivalent_iiw
    assert route("rosenthal model") is rosenthal_temperature
    assert route("cooling_rate t8/5") is cooling_time_t85
    assert route("tempering parameter") is hollomon_jaffe
    assert route("scheil segregation") is scheil_segregation
    assert route("avrami") is avrami_jmak
    assert route("jmak kinetics") is avrami_jmak
    assert route("hardenability jominy") is ideal_critical_diameter
    assert route("hall-petch grain") is hall_petch_yield
    assert route("metallurgy domain") is carbon_equivalent_iiw
    assert route("totally unrelated xyz") is None
