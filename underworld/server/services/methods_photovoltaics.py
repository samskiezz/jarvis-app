"""Photovoltaics & solar-energy simulation methods.

Eight named, real photovoltaic methods, each computed from its canonical
published formula and each verified in the test suite against a KNOWN
published value:

  1. solar_cell_iv_curve      — single-diode model I = Iph - I0*(exp(V/(n*Vt))-1)
                                (Isc ~= Iph; Voc = n*Vt*ln(Iph/I0 + 1))
  2. fill_factor_efficiency   — FF = Pmax/(Voc*Isc); eta = Pmax/Pin
                                (verify FF and eta against the I-V sweep)
  3. shockley_queisser        — detailed-balance limit; blackbody-spectrum SQ
                                (peak ~30-33% near Eg ~ 1.34 eV)
  4. maximum_power_point      — sweep the I-V curve for Pmax, Vmp, Imp
                                (verify Pmax = max over the curve)
  5. air_mass_irradiance      — Kasten-Young air mass + AM1.5 ~ 1000 W/m^2
                                (zenith 48.2 deg -> AM ~ 1.5; AM1.5G ~ 1000 W/m^2)
  6. voc_temperature_coeff    — dVoc/dT for silicon ~ -2.2 mV/K (Voc drops with T)
  7. series_shunt_resistance  — Rs/Rsh degrade the fill factor (FF drops)
  8. bandgap_wavelength       — Eg(eV) = 1239.84 / lambda(nm); Si 1.1 eV ~ 1127 nm

Sources (researched & verified):
  - Single-diode model, Isc=Iph, Voc=n*Vt*ln(Iph/I0+1):
    pveducation.org/pvcdrom/solar-cell-operation (Voc, Isc, IV-curve);
    en.wikipedia.org/wiki/Theory_of_solar_cells
  - Fill factor FF=Pmax/(Voc*Isc) and Green empirical FF(voc_n):
    pveducation.org/pvcdrom/solar-cell-operation/fill-factor
  - Shockley-Queisser detailed-balance limit ~33.7% at 1.34 eV (AM1.5):
    en.wikipedia.org/wiki/Shockley-Queisser_limit
  - Thermal voltage Vt = kT/q = 0.025852 V at 300 K: physical constants (CODATA).
  - Kasten-Young air mass; AM1.5 global ~ 1000 W/m^2 (ASTM G173):
    en.wikipedia.org/wiki/Air_mass_(solar_energy)
  - dVoc/dT ~ -2.2 mV/K for silicon:
    pveducation.org/pvcdrom/solar-cell-operation/effect-of-temperature
  - Series/shunt resistance lower FF:
    pveducation.org/pvcdrom/solar-cell-operation/series-resistance
  - Eg=1239.84/lambda (eV-nm), Si 1.1 eV ~ 1127 nm: standard photon energy relation.
"""
from __future__ import annotations

import numpy as np
from scipy import constants as const
from scipy import integrate, optimize

# physical constants
Q = const.e                  # elementary charge, C
K_B = const.k                # Boltzmann constant, J/K
H = const.h                  # Planck constant, J*s
C_LIGHT = const.c            # speed of light, m/s
HC_EV_NM = 1239.84193        # h*c in eV*nm (photon energy <-> wavelength)


def thermal_voltage(temperature_k: float = 300.0) -> float:
    """Thermal voltage Vt = kT/q (volts). At 300 K, Vt = 0.025852 V."""
    return K_B * temperature_k / Q


# 1. SINGLE-DIODE SOLAR-CELL I-V CURVE ---------------------------------------
def solar_cell_iv_curve(*, photocurrent_a: float, saturation_current_a: float,
                        ideality_factor: float = 1.0,
                        temperature_k: float = 300.0,
                        n_points: int = 400) -> dict:
    """Single-diode model I(V) = Iph - I0*(exp(V/(n*Vt)) - 1).

    Short-circuit current Isc = I(V=0) = Iph (exact for the ideal diode, no
    series/shunt resistance). Open-circuit voltage Voc solves I=0:
        Voc = n*Vt*ln(Iph/I0 + 1).

    Known check: Iph=3.0 A, I0=1e-9 A, n=1, T=300 K ->
        Isc = 3.0 A and Voc = 0.025852 * ln(3e9 + 1) ~= 0.5673 V.
    """
    vt = thermal_voltage(temperature_k)
    iph = photocurrent_a
    i0 = saturation_current_a
    n = ideality_factor

    isc = iph - i0 * (np.exp(0.0) - 1.0)          # = Iph at V=0
    voc = n * vt * np.log(iph / i0 + 1.0)

    v = np.linspace(0.0, voc, int(n_points))
    i = iph - i0 * (np.expm1(v / (n * vt)))
    return {
        "isc_a": float(isc),
        "voc_v": float(voc),
        "thermal_voltage_v": float(vt),
        "voltage_v": v.tolist(),
        "current_a": i.tolist(),
    }


# 2. FILL FACTOR & EFFICIENCY -------------------------------------------------
def fill_factor_efficiency(*, photocurrent_a: float, saturation_current_a: float,
                           ideality_factor: float = 1.0,
                           temperature_k: float = 300.0,
                           input_irradiance_w_m2: float = 1000.0,
                           cell_area_m2: float = 1.0,
                           n_points: int = 2000) -> dict:
    """Fill factor FF = Pmax/(Voc*Isc) and efficiency eta = Pmax/Pin.

    Pin = irradiance * area. Pmax is found from the I-V sweep. FF is the
    fraction of the Voc*Isc rectangle that the actual power curve fills.

    The Green empirical estimate FF0 = (voc_n - ln(voc_n + 0.72))/(voc_n + 1),
    with voc_n = Voc/(n*Vt), is returned for cross-checking the ideal cell.

    Known check: for an ideal cell with voc_n ~ 22, FF ~ 0.83 (matches Green).
    """
    iv = solar_cell_iv_curve(
        photocurrent_a=photocurrent_a,
        saturation_current_a=saturation_current_a,
        ideality_factor=ideality_factor,
        temperature_k=temperature_k,
        n_points=n_points,
    )
    v = np.asarray(iv["voltage_v"])
    i = np.asarray(iv["current_a"])
    p = v * i
    idx = int(np.argmax(p))
    pmax = float(p[idx])

    voc = iv["voc_v"]
    isc = iv["isc_a"]
    fill_factor = pmax / (voc * isc)

    vt = thermal_voltage(temperature_k)
    voc_n = voc / (ideality_factor * vt)
    ff_green = (voc_n - np.log(voc_n + 0.72)) / (voc_n + 1.0)

    pin = input_irradiance_w_m2 * cell_area_m2
    efficiency = pmax / pin if pin > 0 else 0.0
    return {
        "pmax_w": pmax,
        "vmp_v": float(v[idx]),
        "imp_a": float(i[idx]),
        "fill_factor": float(fill_factor),
        "fill_factor_green": float(ff_green),
        "efficiency": float(efficiency),
        "pin_w": float(pin),
    }


# 3. SHOCKLEY-QUEISSER DETAILED-BALANCE LIMIT --------------------------------
def _bb_photon_flux_above(eg_ev: float, temperature_k: float) -> float:
    """Blackbody photon number flux for photons with energy >= Eg (per m^2 s)."""
    eg_j = eg_ev * Q
    pref = 2.0 * np.pi / (H ** 3 * C_LIGHT ** 2)

    def integrand(e_j):
        x = e_j / (K_B * temperature_k)
        return e_j ** 2 / np.expm1(np.clip(x, 1e-12, 700.0))

    return pref * integrate.quad(integrand, eg_j, 30.0 * Q, limit=200)[0]


def _bb_power(temperature_k: float) -> float:
    """Total blackbody radiant exitance (W/m^2), via the photon-energy integral."""
    pref = 2.0 * np.pi / (H ** 3 * C_LIGHT ** 2)

    def integrand(e_j):
        x = e_j / (K_B * temperature_k)
        return e_j ** 3 / np.expm1(np.clip(x, 1e-12, 700.0))

    return pref * integrate.quad(integrand, 1e-23, 30.0 * Q, limit=200)[0]


def shockley_queisser(*, bandgap_ev: float, sun_temperature_k: float = 5778.0,
                      cell_temperature_k: float = 300.0,
                      incident_power_w_m2: float = 1000.0) -> dict:
    """Detailed-balance (Shockley-Queisser) efficiency for one bandgap.

    The sun is modelled as a blackbody scaled to `incident_power_w_m2` (~AM1.5,
    1000 W/m^2). The photogenerated current Jsc comes from all photons above
    Eg; radiative recombination sets the dark current J0 from the cell's own
    blackbody emission. The diode I-V is swept for the maximum power point and
    efficiency = Pmax / incident_power.

    Known check: the maximum efficiency over Eg lands near 1.34 eV with a peak
    of ~0.30-0.34 (the textbook SQ limit is 33.7% at 1.34 eV under AM1.5).
    """
    scale = incident_power_w_m2 / _bb_power(sun_temperature_k)
    jsc = Q * _bb_photon_flux_above(bandgap_ev, sun_temperature_k) * scale
    j0 = Q * _bb_photon_flux_above(bandgap_ev, cell_temperature_k)
    vt = thermal_voltage(cell_temperature_k)
    voc = vt * np.log(jsc / j0 + 1.0)

    def neg_power(v):
        return -(v * (jsc - j0 * np.expm1(np.clip(v / vt, 0.0, 700.0))))

    res = optimize.minimize_scalar(neg_power, bounds=(0.0, voc), method="bounded")
    pmax = -float(res.fun)
    efficiency = pmax / incident_power_w_m2
    return {
        "bandgap_ev": float(bandgap_ev),
        "jsc_a_m2": float(jsc),
        "j0_a_m2": float(j0),
        "voc_v": float(voc),
        "pmax_w_m2": float(pmax),
        "efficiency": float(efficiency),
    }


def shockley_queisser_optimum(*, eg_min_ev: float = 1.0, eg_max_ev: float = 1.6,
                              n_points: int = 25,
                              incident_power_w_m2: float = 1000.0) -> dict:
    """Scan bandgaps and return the SQ-optimum (max-efficiency) bandgap.

    Known check: optimum bandgap falls in ~[1.1, 1.5] eV with peak efficiency
    ~0.30-0.34 (literature: 33.7% at 1.34 eV).
    """
    egs = np.linspace(eg_min_ev, eg_max_ev, int(n_points))
    effs = np.array([
        shockley_queisser(bandgap_ev=e, incident_power_w_m2=incident_power_w_m2)["efficiency"]
        for e in egs
    ])
    idx = int(np.argmax(effs))
    return {
        "optimum_bandgap_ev": float(egs[idx]),
        "max_efficiency": float(effs[idx]),
        "bandgaps_ev": egs.tolist(),
        "efficiencies": effs.tolist(),
    }


# 4. MAXIMUM POWER POINT ------------------------------------------------------
def maximum_power_point(*, photocurrent_a: float, saturation_current_a: float,
                        ideality_factor: float = 1.0,
                        temperature_k: float = 300.0,
                        n_points: int = 5000) -> dict:
    """Maximum power point (MPPT) of the single-diode I-V curve.

    Sweeps V in [0, Voc] and returns Pmax with its (Vmp, Imp). Pmax must equal
    the maximum of V*I over the whole curve and lie strictly below Voc*Isc.

    Known check: Pmax == max(V*I) over the sweep and 0 < Pmax < Voc*Isc.
    """
    iv = solar_cell_iv_curve(
        photocurrent_a=photocurrent_a,
        saturation_current_a=saturation_current_a,
        ideality_factor=ideality_factor,
        temperature_k=temperature_k,
        n_points=n_points,
    )
    v = np.asarray(iv["voltage_v"])
    i = np.asarray(iv["current_a"])
    p = v * i
    idx = int(np.argmax(p))
    return {
        "pmax_w": float(p[idx]),
        "vmp_v": float(v[idx]),
        "imp_a": float(i[idx]),
        "voc_v": float(iv["voc_v"]),
        "isc_a": float(iv["isc_a"]),
        "power_w": p.tolist(),
    }


# 5. AIR MASS / AM1.5 IRRADIANCE ---------------------------------------------
AM15G_IRRADIANCE_W_M2 = 1000.37   # ASTM G173 AM1.5 global integrated irradiance


def air_mass_irradiance(*, zenith_angle_deg: float,
                        solar_constant_w_m2: float = 1361.0) -> dict:
    """Kasten-Young air mass and clear-sky direct irradiance.

    AM = 1 / (cos z + 0.50572*(96.07995 - z)^-1.6364), with z in degrees.
    At z=0 AM=1 (AM0 in space, ~1361 W/m^2); at z~48.2 deg AM~1.5, the
    reference terrestrial condition whose global spectrum AM1.5G integrates to
    ~1000 W/m^2.

    Known check: z = 48.2 deg -> AM ~= 1.5; AM1.5G ~= 1000 W/m^2.
    """
    z = zenith_angle_deg
    cos_z = np.cos(np.radians(z))
    air_mass = 1.0 / (cos_z + 0.50572 * (96.07995 - z) ** -1.6364)
    # simple atmospheric-transmittance model (Meinel) for direct beam
    direct = solar_constant_w_m2 * 0.7 ** (air_mass ** 0.678)
    return {
        "air_mass": float(air_mass),
        "direct_irradiance_w_m2": float(direct),
        "am15g_global_w_m2": float(AM15G_IRRADIANCE_W_M2),
    }


# 6. TEMPERATURE COEFFICIENT OF Voc ------------------------------------------
def voc_temperature_coeff(*, voc_ref_v: float = 0.60, bandgap_ev: float = 1.12,
                          ideality_factor: float = 1.0,
                          temperature_ref_k: float = 300.0,
                          delta_t_k: float = 25.0) -> dict:
    """Temperature coefficient dVoc/dT of a silicon cell.

    dVoc/dT = (Voc - Eg/q - (gamma)*Vt) / T, with gamma~3 from the T^3 prefactor
    of I0 ~ T^3 exp(-Eg/kT). The coefficient is negative: Voc falls as T rises.

    Known check: Si (Voc~0.6 V, Eg~1.12 eV) -> dVoc/dT ~ -2.2 mV/K (within a
    few tenths of a mV/K), and Voc(T+dT) < Voc(T).
    """
    vt = thermal_voltage(temperature_ref_k)
    gamma = 3.0
    dvoc_dt = (voc_ref_v - bandgap_ev - gamma * vt) / temperature_ref_k  # V/K
    voc_hot = voc_ref_v + dvoc_dt * delta_t_k
    return {
        "dvoc_dt_v_per_k": float(dvoc_dt),
        "dvoc_dt_mv_per_k": float(dvoc_dt * 1000.0),
        "voc_ref_v": float(voc_ref_v),
        "voc_hot_v": float(voc_hot),
        "voc_drops_with_temperature": bool(voc_hot < voc_ref_v),
    }


# 7. SERIES / SHUNT RESISTANCE EFFECT ON FILL FACTOR -------------------------
def series_shunt_resistance(*, photocurrent_a: float, saturation_current_a: float,
                            series_resistance_ohm: float = 0.0,
                            shunt_resistance_ohm: float = np.inf,
                            ideality_factor: float = 1.0,
                            temperature_k: float = 300.0,
                            n_points: int = 2000) -> dict:
    """Fill factor of the single-diode model with Rs and Rsh.

    Implicit model: I = Iph - I0*(exp((V+I*Rs)/(n*Vt)) - 1) - (V+I*Rs)/Rsh.
    Solved for I(V) by a scalar root-find at each voltage. Both finite series
    resistance and finite shunt resistance reduce the fill factor.

    Known check: adding Rs (or lowering Rsh) lowers FF vs the ideal cell.
    """
    vt = thermal_voltage(temperature_k)
    iph = photocurrent_a
    i0 = saturation_current_a
    n = ideality_factor
    rs = series_resistance_ohm
    rsh = shunt_resistance_ohm

    isc = iph
    voc = n * vt * np.log(iph / i0 + 1.0)

    def solve_i(v):
        def f(i):
            vd = v + i * rs
            shunt = vd / rsh if np.isfinite(rsh) else 0.0
            return iph - i0 * np.expm1(np.clip(vd / (n * vt), -700.0, 700.0)) - shunt - i
        # widen the bracket so finite shunt / series resistance never escapes it
        lo, hi = -10.0 * iph - 10.0, 10.0 * iph + 10.0
        return optimize.brentq(f, lo, hi, xtol=1e-12)

    v = np.linspace(0.0, voc, int(n_points))
    i = np.array([solve_i(vv) for vv in v])
    p = v * i
    idx = int(np.argmax(p))
    pmax = float(p[idx])
    fill_factor = pmax / (voc * isc)
    return {
        "fill_factor": float(fill_factor),
        "pmax_w": pmax,
        "vmp_v": float(v[idx]),
        "imp_a": float(i[idx]),
        "voc_v": float(voc),
        "isc_a": float(isc),
    }


# 8. BANDGAP <-> WAVELENGTH ---------------------------------------------------
def bandgap_wavelength(*, bandgap_ev: float | None = None,
                       wavelength_nm: float | None = None) -> dict:
    """Photon energy <-> wavelength: Eg(eV) = 1239.84 / lambda(nm).

    Provide exactly one of bandgap_ev or wavelength_nm; the other is returned.
    The cutoff wavelength is the longest wavelength a cell can absorb.

    Known check: silicon Eg = 1.1 eV -> lambda ~= 1127 nm (and inversely).
    """
    if (bandgap_ev is None) == (wavelength_nm is None):
        raise ValueError("provide exactly one of bandgap_ev or wavelength_nm")
    if bandgap_ev is not None:
        lam = HC_EV_NM / bandgap_ev
        eg = bandgap_ev
    else:
        lam = wavelength_nm
        eg = HC_EV_NM / wavelength_nm
    return {
        "bandgap_ev": float(eg),
        "wavelength_nm": float(lam),
        "cutoff_wavelength_nm": float(HC_EV_NM / eg),
    }
