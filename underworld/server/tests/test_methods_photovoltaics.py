"""Verification tests for methods_photovoltaics — each asserts a computed
result matches a KNOWN published photovoltaics value.
"""
import numpy as np

from underworld.server.services.methods_photovoltaics import (
    thermal_voltage,
    solar_cell_iv_curve,
    fill_factor_efficiency,
    shockley_queisser,
    shockley_queisser_optimum,
    maximum_power_point,
    air_mass_irradiance,
    voc_temperature_coeff,
    series_shunt_resistance,
    bandgap_wavelength,
)


def test_thermal_voltage_300k():
    # KNOWN: Vt = kT/q = 0.025852 V at 300 K.
    assert abs(thermal_voltage(300.0) - 0.025852) < 1e-5


# 1. SINGLE-DIODE I-V CURVE: Isc and Voc -------------------------------------
def test_solar_cell_iv_isc_and_voc():
    # KNOWN: Iph=3.0 A, I0=1e-9 A, n=1, T=300 K ->
    #   Isc = Iph = 3.0 A; Voc = Vt*ln(Iph/I0 + 1) ~= 0.5673 V.
    out = solar_cell_iv_curve(photocurrent_a=3.0, saturation_current_a=1e-9)
    assert abs(out["isc_a"] - 3.0) < 1e-12                     # Isc = Iph
    voc_expected = 0.025852 * np.log(3.0 / 1e-9 + 1.0)
    assert abs(out["voc_v"] - voc_expected) < 1e-4
    assert abs(out["voc_v"] - 0.564) < 3e-3                    # ~0.564 V
    # current goes from Isc at V=0 down to ~0 at V=Voc
    assert abs(out["current_a"][0] - 3.0) < 1e-9
    assert abs(out["current_a"][-1]) < 1e-3


# 2. FILL FACTOR & EFFICIENCY ------------------------------------------------
def test_fill_factor_and_efficiency():
    # KNOWN: FF = Pmax/(Voc*Isc) is in (0,1) and matches Green's empirical
    # estimate for an ideal cell (voc_n ~ 22 -> FF ~ 0.83). eta = Pmax/Pin.
    out = fill_factor_efficiency(
        photocurrent_a=3.0, saturation_current_a=1e-9,
        input_irradiance_w_m2=1000.0, cell_area_m2=0.01,
    )
    assert 0.0 < out["fill_factor"] < 1.0
    assert abs(out["fill_factor"] - out["fill_factor_green"]) < 0.01   # ~ Green
    assert abs(out["fill_factor"] - 0.83) < 0.02                       # ~0.83
    # eta = Pmax/Pin, must be a sensible positive fraction
    assert 0.0 < out["efficiency"] < 1.0
    assert abs(out["efficiency"] - out["pmax_w"] / out["pin_w"]) < 1e-12


# 3. SHOCKLEY-QUEISSER DETAILED-BALANCE LIMIT --------------------------------
def test_shockley_queisser_peak_near_1p34ev():
    # KNOWN: SQ detailed-balance limit peaks near Eg ~ 1.34 eV at ~33%.
    # The blackbody-spectrum model reproduces a peak in [1.1, 1.5] eV with
    # max efficiency ~0.30-0.34.
    out = shockley_queisser_optimum(eg_min_ev=1.0, eg_max_ev=1.6, n_points=25)
    assert 1.1 <= out["optimum_bandgap_ev"] <= 1.5            # near 1.34 eV
    assert 0.28 <= out["max_efficiency"] <= 0.36             # ~33%
    # a far-off bandgap is less efficient than the optimum
    low = shockley_queisser(bandgap_ev=0.5)["efficiency"]
    assert low < out["max_efficiency"]


# 4. MAXIMUM POWER POINT ------------------------------------------------------
def test_maximum_power_point():
    # KNOWN: Pmax = max(V*I) over the curve, and 0 < Pmax < Voc*Isc.
    out = maximum_power_point(photocurrent_a=3.0, saturation_current_a=1e-9)
    rect = out["voc_v"] * out["isc_a"]
    assert out["pmax_w"] == max(out["power_w"])               # Pmax is the max
    assert 0.0 < out["pmax_w"] < rect                         # below the rectangle
    assert 0.0 < out["vmp_v"] < out["voc_v"]
    assert 0.0 < out["imp_a"] < out["isc_a"]


# 5. AIR MASS / AM1.5 IRRADIANCE ---------------------------------------------
def test_air_mass_1p5_and_irradiance():
    # KNOWN: zenith 48.2 deg -> AM ~ 1.5; AM1.5G global ~ 1000 W/m^2.
    out = air_mass_irradiance(zenith_angle_deg=48.2)
    assert abs(out["air_mass"] - 1.5) < 0.05                  # AM ~ 1.5
    assert abs(out["am15g_global_w_m2"] - 1000.0) < 5.0       # ~1000 W/m^2
    # overhead sun -> AM ~ 1
    zenith = air_mass_irradiance(zenith_angle_deg=0.0)
    assert abs(zenith["air_mass"] - 1.0) < 1e-3


# 6. TEMPERATURE COEFFICIENT OF Voc ------------------------------------------
def test_voc_temperature_coefficient_silicon():
    # KNOWN: for silicon dVoc/dT ~ -2.2 mV/K, and Voc drops as T rises.
    out = voc_temperature_coeff(voc_ref_v=0.60, bandgap_ev=1.12)
    assert out["dvoc_dt_mv_per_k"] < 0.0                      # negative
    assert abs(out["dvoc_dt_mv_per_k"] - (-2.2)) < 0.4        # ~ -2.2 mV/K
    assert out["voc_drops_with_temperature"] is True
    assert out["voc_hot_v"] < out["voc_ref_v"]


# 7. SERIES / SHUNT RESISTANCE EFFECT ON FILL FACTOR -------------------------
def test_series_resistance_lowers_fill_factor():
    # KNOWN: adding series resistance reduces the fill factor.
    ideal = series_shunt_resistance(
        photocurrent_a=3.0, saturation_current_a=1e-9,
        series_resistance_ohm=0.0,
    )
    with_rs = series_shunt_resistance(
        photocurrent_a=3.0, saturation_current_a=1e-9,
        series_resistance_ohm=0.05,
    )
    assert with_rs["fill_factor"] < ideal["fill_factor"]      # FF drops with Rs


def test_shunt_resistance_lowers_fill_factor():
    # KNOWN: lowering the shunt resistance also reduces the fill factor.
    ideal = series_shunt_resistance(
        photocurrent_a=3.0, saturation_current_a=1e-9,
        shunt_resistance_ohm=np.inf,
    )
    with_rsh = series_shunt_resistance(
        photocurrent_a=3.0, saturation_current_a=1e-9,
        shunt_resistance_ohm=0.5,
    )
    assert with_rsh["fill_factor"] < ideal["fill_factor"]     # FF drops with low Rsh


# 8. BANDGAP <-> WAVELENGTH --------------------------------------------------
def test_bandgap_wavelength_silicon():
    # KNOWN: Si Eg = 1.1 eV -> cutoff wavelength ~ 1127 nm.
    out = bandgap_wavelength(bandgap_ev=1.1)
    assert abs(out["wavelength_nm"] - 1127.0) < 2.0           # ~1127 nm
    # inverse direction: 1127 nm -> ~1.1 eV
    inv = bandgap_wavelength(wavelength_nm=1127.0)
    assert abs(inv["bandgap_ev"] - 1.1) < 1e-3
