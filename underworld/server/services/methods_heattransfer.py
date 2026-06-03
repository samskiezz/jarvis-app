"""Real heat & mass transfer (transport phenomena) simulations.

Each function is a distinct, named transport method (not a shared engine reused),
implemented with numpy/scipy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: steady conduction
(plane wall, radial/cylindrical), forced convection (Dittus-Boelter), thermal
radiation (Stefan-Boltzmann gray-body exchange), transient lumped-capacitance
cooling, extended-surface (fin) heat transfer, heat-exchanger sizing (LMTD), and
mass transfer (Fick's law diffusion flux & penetration depth).

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_heattransfer.py.

General refs:
- Incropera, DeWitt, Bergman & Lavine, "Fundamentals of Heat and Mass Transfer".
- Cengel, "Heat and Mass Transfer".
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants ────────────────────────────────────────────────────────
STEFAN_BOLTZMANN = 5.670374419e-8   # sigma, W/(m^2 K^4) (CODATA 2018)


# ── 1. Fourier conduction through a plane wall (series resistance) ─────────────
def plane_wall_conduction(layers: list, area_m2: float,
                          t_hot_k: float, t_cold_k: float) -> dict:
    """Steady 1-D Fourier conduction through a multi-layer plane wall.

    Fourier's law for a plane slab gives a conductive resistance per layer
        R_i = L_i / (k_i * A)
    Layers in series add: R_total = sum(R_i). The heat rate is then
        q = (T_hot - T_cold) / R_total            [W]
    and the interface temperatures follow from q*R cumulatively. ``layers`` is a
    list of (thickness_L_m, conductivity_k_W_per_mK) tuples.

    KNOWN: a single 0.1 m wall, k=1 W/mK, A=1 m^2, dT=100 K gives
        R = 0.1/(1*1) = 0.1 K/W and q = 100/0.1 = 1000 W (q'' = 1000 W/m^2).

    Ref: Incropera, "Fundamentals of Heat and Mass Transfer", plane-wall
    conduction & thermal-circuit (series resistance) analysis.
    """
    resistances = []
    for L, k in layers:
        if k <= 0.0 or area_m2 <= 0.0:
            raise ValueError("conductivity and area must be positive")
        resistances.append(L / (k * area_m2))
    r_total = float(sum(resistances))
    dT = t_hot_k - t_cold_k
    q = dT / r_total
    # interface temperatures, hot face -> cold face
    interface_temps = [t_hot_k]
    t = t_hot_k
    for R in resistances:
        t -= q * R
        interface_temps.append(t)
    return {
        "heat_rate_w": q,
        "heat_flux_w_m2": q / area_m2,
        "total_resistance_k_per_w": r_total,
        "layer_resistances_k_per_w": resistances,
        "interface_temps_k": interface_temps,
    }


# ── 2. Radial conduction through a cylindrical wall (log-mean) ─────────────────
def cylinder_conduction(k_w_per_mk: float, length_m: float,
                        r_inner_m: float, r_outer_m: float,
                        t_inner_k: float, t_outer_k: float) -> dict:
    """Steady radial Fourier conduction through a hollow cylinder (e.g. pipe wall
    or insulation). Integrating Fourier's law in cylindrical coordinates gives
        q = 2*pi*k*L*(T_i - T_o) / ln(r_o / r_i)            [W]
    The thermal resistance is R = ln(r_o/r_i)/(2*pi*k*L).

    KNOWN: k=15 W/mK, L=1 m, r_i=0.05 m, r_o=0.10 m, dT=100 K ->
        q = 2*pi*15*1*100/ln(2) = 9424.778/0.693147 = 13597.1 W (to 0.1 W).

    Ref: Incropera, "Fundamentals of Heat and Mass Transfer", radial conduction
    through a cylindrical wall (cylindrical thermal resistance).
    """
    if r_outer_m <= r_inner_m:
        raise ValueError("outer radius must exceed inner radius")
    r_cond = math.log(r_outer_m / r_inner_m) / (2.0 * math.pi * k_w_per_mk * length_m)
    dT = t_inner_k - t_outer_k
    q = dT / r_cond
    return {
        "heat_rate_w": q,
        "resistance_k_per_w": r_cond,
        "log_ratio": math.log(r_outer_m / r_inner_m),
    }


# ── 3. Forced-convection Nusselt correlation: Dittus-Boelter -> h ─────────────
def dittus_boelter_convection(reynolds: float, prandtl: float,
                              k_fluid_w_per_mk: float, diameter_m: float,
                              *, heating: bool = True) -> dict:
    """Turbulent internal forced-convection coefficient from the Dittus-Boelter
    correlation:
        Nu = 0.023 * Re^0.8 * Pr^n,   n = 0.4 (heating) / 0.3 (cooling)
    then the convection coefficient follows from Nu = h*D/k:
        h = Nu * k / D                                      [W/(m^2 K)]
    Valid for fully-developed turbulent flow (Re >~ 10000, 0.6 <~ Pr <~ 160).

    KNOWN: Re=10000, Pr=0.7, heating (n=0.4) ->
        Nu = 0.023 * 10000^0.8 * 0.7^0.4 = 0.023*1584.893*0.866956 = 31.60.

    Ref: Dittus & Boelter (1930); see Incropera "Fundamentals of Heat and Mass
    Transfer" and nuclear-power.com Dittus-Boelter correlation page.
    """
    n = 0.4 if heating else 0.3
    nu = 0.023 * reynolds ** 0.8 * prandtl ** n
    h = nu * k_fluid_w_per_mk / diameter_m
    return {
        "nusselt": nu,
        "h_w_per_m2k": h,
        "exponent_n": n,
        "reynolds": reynolds,
        "prandtl": prandtl,
    }


# ── 4. Stefan-Boltzmann radiative exchange between two gray surfaces ───────────
def radiative_exchange(t_hot_k: float, t_cold_k: float, area_m2: float,
                       *, emissivity: float = 1.0) -> dict:
    """Net thermal radiation exchange. For a small gray body of emissivity eps and
    area A radiating to large surroundings (or between large parallel surfaces of
    that effective emissivity), the net rate is
        q = eps * sigma * A * (T_hot^4 - T_cold^4)          [W]
    with sigma = 5.670374419e-8 W/(m^2 K^4) (Stefan-Boltzmann constant).

    KNOWN: a blackbody (eps=1) of A=1 m^2 at 1000 K radiating to 0 K emits
        q = sigma * 1000^4 = 5.670374419e-8 * 1e12 = 56703.7 W
    (the Stefan-Boltzmann law E_b = sigma*T^4 = 56.7 kW/m^2 at 1000 K).

    Ref: Stefan-Boltzmann law; Incropera "Fundamentals of Heat and Mass
    Transfer", radiation exchange between surfaces.
    """
    if not (0.0 < emissivity <= 1.0):
        raise ValueError("emissivity must be in (0, 1]")
    q = emissivity * STEFAN_BOLTZMANN * area_m2 * (t_hot_k ** 4 - t_cold_k ** 4)
    return {
        "net_radiative_w": q,
        "emissive_power_hot_w_m2": STEFAN_BOLTZMANN * t_hot_k ** 4,
        "emissive_power_cold_w_m2": STEFAN_BOLTZMANN * t_cold_k ** 4,
        "emissivity": emissivity,
    }


# ── 5. Transient lumped-capacitance cooling (Biot check) ──────────────────────
def lumped_capacitance_cooling(t_initial_k: float, t_inf_k: float,
                               h_w_per_m2k: float, area_m2: float,
                               volume_m3: float, density_kg_m3: float,
                               cp_j_per_kgk: float, time_s: float,
                               *, k_solid_w_per_mk: float | None = None) -> dict:
    """Transient cooling/heating of a body small enough to be spatially isothermal
    (lumped-capacitance model). The energy balance rho*V*cp dT/dt = -h*A*(T-Tinf)
    integrates to an exponential:
        theta(t)/theta_0 = (T(t)-Tinf)/(T0-Tinf) = exp(-t/tau)
        tau = rho*V*cp / (h*A)                              [s]
    Validity requires the Biot number Bi = h*Lc/k_solid < 0.1, with characteristic
    length Lc = V/A.

    KNOWN: with tau chosen so that t = tau, theta/theta0 = exp(-1) = 0.367879...,
    i.e. the body has cooled to 36.79% of its initial excess temperature in one
    time constant.

    Ref: Incropera "Fundamentals of Heat and Mass Transfer", transient conduction
    / lumped-capacitance method (Biot number criterion).
    """
    tau = density_kg_m3 * volume_m3 * cp_j_per_kgk / (h_w_per_m2k * area_m2)
    theta_ratio = math.exp(-time_s / tau)
    t_now = t_inf_k + (t_initial_k - t_inf_k) * theta_ratio
    Lc = volume_m3 / area_m2
    biot = None
    lumped_valid = None
    if k_solid_w_per_mk is not None:
        biot = h_w_per_m2k * Lc / k_solid_w_per_mk
        lumped_valid = biot < 0.1
    return {
        "temperature_k": t_now,
        "theta_ratio": theta_ratio,
        "time_constant_s": tau,
        "characteristic_length_m": Lc,
        "biot_number": biot,
        "lumped_valid": lumped_valid,
    }


# ── 6. Fin efficiency & heat rate (adiabatic-tip approximation) ───────────────
def fin_heat_transfer(k_w_per_mk: float, h_w_per_m2k: float,
                      length_m: float, thickness_m: float,
                      width_m: float, t_base_k: float, t_inf_k: float) -> dict:
    """Steady heat dissipation from a straight rectangular fin with an
    (approximately) adiabatic tip. With m = sqrt(h*P/(k*A_c)) the temperature
    profile is hyperbolic and the fin heat rate is
        q_f = sqrt(h*P*k*A_c) * (T_b - Tinf) * tanh(m*L)    [W]
    The fin efficiency (actual / ideal-isothermal-fin heat) is
        eta_f = tanh(m*L) / (m*L)
    Here P = 2(w+t) is the perimeter and A_c = w*t the cross-section.

    KNOWN: as m*L -> 0 the fin becomes isothermal and eta_f -> 1 (tanh(x)/x -> 1);
    for m*L = 1, eta_f = tanh(1)/1 = 0.761594...

    Ref: Incropera "Fundamentals of Heat and Mass Transfer", extended surfaces /
    fin efficiency (tanh(mL)/mL).
    """
    A_c = width_m * thickness_m
    P = 2.0 * (width_m + thickness_m)
    m = math.sqrt(h_w_per_m2k * P / (k_w_per_mk * A_c))
    mL = m * length_m
    q_fin = math.sqrt(h_w_per_m2k * P * k_w_per_mk * A_c) * (t_base_k - t_inf_k) * math.tanh(mL)
    eta = math.tanh(mL) / mL if mL != 0.0 else 1.0
    return {
        "fin_heat_rate_w": q_fin,
        "fin_efficiency": eta,
        "m_per_m": m,
        "mL": mL,
        "perimeter_m": P,
        "cross_section_m2": A_c,
    }


# ── 7. LMTD heat-exchanger duty (Q = U A LMTD) ────────────────────────────────
def lmtd_heat_exchanger(t_hot_in_k: float, t_hot_out_k: float,
                        t_cold_in_k: float, t_cold_out_k: float,
                        u_w_per_m2k: float, area_m2: float,
                        *, counterflow: bool = True) -> dict:
    """Heat-exchanger duty by the log-mean-temperature-difference method:
        LMTD = (dT_A - dT_B) / ln(dT_A / dT_B)
        Q = U * A * LMTD                                    [W]
    For counterflow the end approaches are dT_A = T_h,in - T_c,out and
    dT_B = T_h,out - T_c,in; for parallel flow they are taken at matching ends.

    KNOWN: counterflow hot 100->60 C, cold 20->50 C gives
        dT_A = 100-50 = 50, dT_B = 60-20 = 40,
        LMTD = (50-40)/ln(50/40) = 10/0.223144 = 44.814 C
    (the classic textbook value ~44.8 C).

    Ref: Logarithmic mean temperature difference (Wikipedia); Incropera
    "Fundamentals of Heat and Mass Transfer", LMTD heat-exchanger analysis.
    """
    if counterflow:
        dT_A = t_hot_in_k - t_cold_out_k
        dT_B = t_hot_out_k - t_cold_in_k
    else:  # parallel flow
        dT_A = t_hot_in_k - t_cold_in_k
        dT_B = t_hot_out_k - t_cold_out_k
    if dT_A <= 0.0 or dT_B <= 0.0:
        raise ValueError("temperature differences must be positive (check streams)")
    if abs(dT_A - dT_B) < 1e-12:
        lmtd = dT_A  # limit dT_A->dT_B
    else:
        lmtd = (dT_A - dT_B) / math.log(dT_A / dT_B)
    q = u_w_per_m2k * area_m2 * lmtd
    return {
        "lmtd_k": lmtd,
        "heat_duty_w": q,
        "delta_t_a_k": dT_A,
        "delta_t_b_k": dT_B,
        "counterflow": counterflow,
    }


# ── 8. Fick's law mass diffusion flux & penetration depth ─────────────────────
def fick_diffusion(diffusivity_m2_s: float, conc_high: float, conc_low: float,
                   length_m: float, time_s: float) -> dict:
    """Steady 1-D Fickian mass diffusion flux through a slab plus the transient
    diffusion penetration depth.
        J = -D * dC/dx = D * (C_high - C_low) / L           [mol/(m^2 s)]
    For a semi-infinite medium the diffusion (penetration) depth scales as
        delta = sqrt(D * t)                                  [m]
    (the characteristic distance a concentration front advances in time t).

    KNOWN: D=1e-9 m^2/s, dC=1 mol/m^3, L=1e-3 m -> J = 1e-9*1/1e-3 = 1e-6
    mol/(m^2 s); penetration depth at t=1000 s -> sqrt(1e-9*1000) = 1e-3 m.

    Ref: Fick's first law of diffusion; diffusion penetration depth ~ sqrt(D*t)
    (Incropera "Fundamentals of Heat and Mass Transfer", mass transfer chapter).
    """
    if length_m <= 0.0:
        raise ValueError("slab thickness must be positive")
    flux = diffusivity_m2_s * (conc_high - conc_low) / length_m
    penetration_depth = math.sqrt(diffusivity_m2_s * time_s)
    return {
        "flux_mol_per_m2s": flux,
        "concentration_gradient_per_m": (conc_high - conc_low) / length_m,
        "penetration_depth_m": penetration_depth,
        "diffusivity_m2_s": diffusivity_m2_s,
    }
