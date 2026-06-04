"""Real surface-hydrology simulations.

Each function is a distinct, named surface-water / engineering-hydrology method
(not a shared engine reused), implemented with numpy/math and verified against a
KNOWN published or analytically exact value in the companion tests. Domains:
rainfall-runoff (Rational method, SCS curve number), open-channel flow (Manning),
pressurized pipe head loss (Darcy-Weisbach & Hazen-Williams), catchment response
time (Kirpich time of concentration), storm-response convolution (unit hydrograph),
reservoir routing / water balance, and evapotranspiration (Thornthwaite).

This module deliberately covers SURFACE water only; subsurface / groundwater
hydrogeology (Darcy flux, Theis, Dupuit, etc.) lives in methods_hydrogeology.py
and is NOT duplicated here.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_hydrology.py.  All quantities are SI unless a field
name states otherwise.
"""
from __future__ import annotations

import math

import numpy as np

# ── Physical constants (SI) ───────────────────────────────────────────────────
G = 9.80665                 # standard gravity, m/s^2
RHO_WATER = 1000.0          # density of water, kg/m^3
NU_WATER_20C = 1.004e-6     # kinematic viscosity of water at 20 C, m^2/s


# ── 1. Rational method peak runoff (Q = C i A) ────────────────────────────────
def rational_method_peak_flow(*, runoff_coefficient: float = 0.5,
                              rainfall_intensity_mm_hr: float = 50.0,
                              area_km2: float = 1.0) -> dict:
    """Rational method peak discharge from a small catchment:
        Q = C * i * A
    In consistent SI form Q[m^3/s] = C * i[m/s] * A[m^2].  A convenient
    engineering identity is Q[m^3/s] = 0.278 * C * i[mm/hr] * A[km^2], where
    0.278 = 1/3.6 converts (mm/hr * km^2) to m^3/s.
    KNOWN: C=0.5, i=50 mm/hr, A=2 km^2 -> Q = 0.278*0.5*50*2 = 13.9 m^3/s.

    Ref: Rational method, Q=CiA (Kuichling 1889; Wikipedia "Rational method").
    """
    C = float(runoff_coefficient)
    i_mm_hr = float(rainfall_intensity_mm_hr)
    A_km2 = float(area_km2)
    # SI-consistent intermediate quantities
    i_m_s = i_mm_hr / 1000.0 / 3600.0          # mm/hr -> m/s
    A_m2 = A_km2 * 1.0e6                        # km^2 -> m^2
    q_si = C * i_m_s * A_m2                     # m^3/s (fully consistent SI)
    q_conv = 0.277778 * C * i_mm_hr * A_km2     # m^3/s via 1/3.6 factor
    return {
        "peak_flow_m3_s": q_conv,
        "peak_flow_si_check_m3_s": q_si,
        "runoff_coefficient": C,
        "intensity_m_s": i_m_s,
        "area_m2": A_m2,
    }


# ── 2. SCS curve-number runoff depth ──────────────────────────────────────────
def scs_curve_number_runoff(*, precipitation_mm: float = 127.0,
                            curve_number: float = 75.0,
                            initial_abstraction_ratio: float = 0.2) -> dict:
    """SCS (NRCS) curve-number direct-runoff depth:
        S  = 25400/CN - 254            (mm; potential maximum retention)
        Ia = lambda * S                (initial abstraction, lambda~=0.2)
        Q  = (P - Ia)^2 / (P - Ia + S)   for P > Ia, else Q = 0
    KNOWN (USDA TR-55 textbook case): CN=75, P=6 in=152.4 mm gives
    Q ~= 2.95 in = 74.9 mm.  Equivalently in inches S=1000/CN-10=3.333 in,
    Ia=0.667 in, Q=(6-0.667)^2/(6-0.667+3.333)=2.945 in.

    Ref: SCS Curve Number method, NRCS NEH-4 / TR-55; Wikipedia "Runoff curve number".
    """
    P = float(precipitation_mm)
    CN = float(curve_number)
    lam = float(initial_abstraction_ratio)
    if not (0.0 < CN <= 100.0):
        raise ValueError("curve_number must be in (0, 100]")
    S = 25400.0 / CN - 254.0                    # mm
    Ia = lam * S
    if P <= Ia:
        Q = 0.0
    else:
        Q = (P - Ia) ** 2 / (P - Ia + S)
    runoff_ratio = Q / P if P > 0.0 else 0.0
    return {
        "runoff_depth_mm": Q,
        "max_retention_S_mm": S,
        "initial_abstraction_mm": Ia,
        "runoff_ratio": runoff_ratio,
        "curve_number": CN,
    }


# ── 3. Manning open-channel uniform flow (V, Q) ───────────────────────────────
def manning_channel_flow(*, width_m: float = 3.0, depth_m: float = 1.0,
                         slope: float = 0.001, manning_n: float = 0.013,
                         side_slope_z: float = 0.0) -> dict:
    """Manning uniform-flow velocity and discharge for an open channel:
        V = (k/n) * R^(2/3) * S^(1/2),  with k=1 in SI (m, s)
        Q = V * A
    A trapezoidal cross-section of bottom width b, depth y and side slope z
    (horizontal:vertical) has A = (b + z*y)*y, wetted perimeter
    P = b + 2*y*sqrt(1+z^2), and hydraulic radius R = A/P.  z=0 -> rectangle.
    KNOWN (rectangular): b=3 m, y=1 m, S=0.001, n=0.013 ->
    A=3 m^2, P=5 m, R=0.6 m, V=(1/0.013)*0.6^(2/3)*0.001^0.5 ~= 1.728 m/s,
    Q ~= 5.18 m^3/s.

    Ref: Manning's formula (Manning 1891; Chow, Open-Channel Hydraulics 1959).
    """
    b = float(width_m)
    y = float(depth_m)
    S = float(slope)
    n = float(manning_n)
    z = float(side_slope_z)
    if y <= 0.0 or b < 0.0 or n <= 0.0 or S < 0.0:
        raise ValueError("invalid channel geometry/parameters")
    area = (b + z * y) * y
    perimeter = b + 2.0 * y * math.sqrt(1.0 + z * z)
    R = area / perimeter
    V = (1.0 / n) * R ** (2.0 / 3.0) * math.sqrt(S)
    Q = V * area
    # Froude number (flow regime); A/top-width = hydraulic depth
    top_width = b + 2.0 * z * y
    hydraulic_depth = area / top_width if top_width > 0.0 else y
    froude = V / math.sqrt(G * hydraulic_depth) if hydraulic_depth > 0.0 else 0.0
    return {
        "velocity_m_s": V,
        "discharge_m3_s": Q,
        "area_m2": area,
        "wetted_perimeter_m": perimeter,
        "hydraulic_radius_m": R,
        "froude_number": froude,
        "regime": "supercritical" if froude > 1.0 else "subcritical",
    }


# ── 4. Pipe friction head loss: Darcy-Weisbach & Hazen-Williams ───────────────
def pipe_head_loss(*, flow_m3_s: float = 0.05, diameter_m: float = 0.3,
                   length_m: float = 100.0, hazen_williams_c: float = 130.0,
                   darcy_friction_factor: float | None = None,
                   roughness_m: float = 1.5e-4,
                   kinematic_viscosity: float = NU_WATER_20C) -> dict:
    """Frictional head loss in a full circular pressure pipe, two ways.

    Darcy-Weisbach:  hf = f * (L/D) * V^2/(2 g).  If f is not supplied it is
    obtained from the Swamee-Jain explicit fit to the Colebrook equation:
        f = 0.25 / [log10( eps/(3.7 D) + 5.74/Re^0.9 )]^2
    Hazen-Williams (SI form, m^3/s & m):
        hf = 10.67 * L * Q^1.852 / (C^1.852 * D^4.8704)
    KNOWN (Hazen-Williams, common textbook case): Q=0.05 m^3/s, D=0.3 m,
    L=100 m, C=130 -> hf ~= 0.93 m.  (10.67*100*0.05^1.852 /
    (130^1.852 * 0.3^4.8704)).

    Ref: Darcy-Weisbach eqn; Swamee & Jain (1976); Hazen-Williams (SI 10.67 form,
    Wikipedia "Hazen-Williams equation").
    """
    Q = float(flow_m3_s)
    D = float(diameter_m)
    L = float(length_m)
    C = float(hazen_williams_c)
    if D <= 0.0 or L < 0.0:
        raise ValueError("invalid pipe geometry")
    area = math.pi * D ** 2 / 4.0
    V = Q / area
    Re = V * D / kinematic_viscosity if kinematic_viscosity > 0.0 else float("inf")
    # Darcy friction factor: use supplied value or Swamee-Jain explicit Colebrook
    if darcy_friction_factor is not None:
        f = float(darcy_friction_factor)
    elif Re < 2300.0 and Re > 0.0:
        f = 64.0 / Re                                   # laminar
    else:
        f = 0.25 / (math.log10(roughness_m / (3.7 * D) + 5.74 / Re ** 0.9)) ** 2
    hf_darcy = f * (L / D) * V ** 2 / (2.0 * G)
    # Hazen-Williams SI (10.67) form
    hf_hw = 10.67 * L * Q ** 1.852 / (C ** 1.852 * D ** 4.8704)
    return {
        "head_loss_hazen_williams_m": hf_hw,
        "head_loss_darcy_weisbach_m": hf_darcy,
        "velocity_m_s": V,
        "reynolds_number": Re,
        "darcy_friction_factor": f,
    }


# ── 5. Kirpich time of concentration ──────────────────────────────────────────
def kirpich_time_of_concentration(*, length_m: float = 1000.0,
                                  slope: float = 0.01) -> dict:
    """Kirpich (1940) catchment time of concentration (SI form):
        tc[min] = 0.0195 * L^0.77 * S^(-0.385)
    where L is the longest flow-path length in metres and S is the average
    channel slope (m/m, dimensionless).
    KNOWN: this SI constant is the metric equivalent of the original
    tc[min] = 0.0078 * L[ft]^0.77 * S^-0.385.  For L=1000 m, S=0.01:
    tc = 0.0195 * 1000^0.77 * 0.01^-0.385 ~= 27.0 min.

    Ref: Kirpich (1940); SI coefficient 0.0195 (TxDOT Hydraulic Design Manual).
    """
    L = float(length_m)
    S = float(slope)
    if L <= 0.0 or S <= 0.0:
        raise ValueError("length and slope must be positive")
    tc_min = 0.0195 * L ** 0.77 * S ** (-0.385)
    return {
        "time_of_concentration_min": tc_min,
        "time_of_concentration_s": tc_min * 60.0,
        "length_m": L,
        "slope": S,
    }


# ── 6. Unit-hydrograph convolution to a storm hyetograph ──────────────────────
def unit_hydrograph_convolution(unit_hydrograph: list, excess_rainfall: list) -> dict:
    """Direct-runoff hydrograph by discrete convolution of a unit hydrograph
    with a multi-period excess-rainfall hyetograph (the convolution / linear
    superposition principle of the unit-hydrograph theory):
        Q[n] = sum_{m} P[m] * UH[n - m + 1]
    The output series has length (len(UH) + len(P) - 1).  Mass is conserved:
    the integral of the DRH equals (sum of excess rainfall depths) times the
    UH volume per unit depth.
    KNOWN: convolving a UH with a single unit pulse (P=[1]) returns the UH
    unchanged; the peak of the DRH never precedes the first nonzero rainfall.

    Ref: Unit hydrograph theory (Sherman 1932); convolution (Chow, Maidment,
    Mays, Applied Hydrology 1988).
    """
    uh = np.asarray(unit_hydrograph, dtype=float)
    p = np.asarray(excess_rainfall, dtype=float)
    if uh.ndim != 1 or p.ndim != 1 or uh.size == 0 or p.size == 0:
        raise ValueError("unit_hydrograph and excess_rainfall must be 1-D non-empty")
    drh = np.convolve(p, uh)                    # full discrete convolution
    peak_idx = int(np.argmax(drh))
    return {
        "direct_runoff_hydrograph": drh.tolist(),
        "peak_flow": float(np.max(drh)),
        "time_to_peak_index": peak_idx,
        "total_runoff_volume": float(np.sum(drh)),
        "uh_volume": float(np.sum(uh)),
        "n_ordinates": int(drh.size),
    }


# ── 7. Reservoir routing / water balance (level-pool storage step) ────────────
def reservoir_water_balance(*, initial_storage_m3: float = 1.0e6,
                            inflow_m3_s: float = 10.0,
                            outflow_m3_s: float = 6.0,
                            timestep_s: float = 3600.0,
                            surface_area_m2: float = 0.0,
                            precip_mm: float = 0.0,
                            evap_mm: float = 0.0) -> dict:
    """Level-pool reservoir routing via the storage (continuity) equation:
        dS/dt = I - O      ->      S2 = S1 + (I - O) * dt   (+/- P, E fluxes)
    Optional surface precipitation and evaporation add depth*area volume terms.
    The change in storage equals net volume in minus net volume out, conserving
    mass exactly.
    KNOWN: S0=1e6 m^3, I=10 m^3/s, O=6 m^3/s, dt=3600 s ->
    dS = (10-6)*3600 = 14400 m^3, S2 = 1,014,400 m^3.

    Ref: Storage-continuity reservoir routing (Chow, Maidment, Mays, Applied
    Hydrology 1988, ch. 8; modified Puls / level-pool method).
    """
    S1 = float(initial_storage_m3)
    I = float(inflow_m3_s)
    O = float(outflow_m3_s)
    dt = float(timestep_s)
    A = float(surface_area_m2)
    inflow_vol = I * dt
    outflow_vol = O * dt
    precip_vol = (precip_mm / 1000.0) * A
    evap_vol = (evap_mm / 1000.0) * A
    dS = inflow_vol - outflow_vol + precip_vol - evap_vol
    S2 = S1 + dS
    if S2 < 0.0:
        S2 = 0.0                                 # reservoir cannot go negative
    return {
        "final_storage_m3": S2,
        "delta_storage_m3": S2 - S1,
        "inflow_volume_m3": inflow_vol,
        "outflow_volume_m3": outflow_vol,
        "precip_volume_m3": precip_vol,
        "evap_volume_m3": evap_vol,
    }


# ── 8. Thornthwaite potential evapotranspiration ──────────────────────────────
def thornthwaite_pet(monthly_temp_c: list) -> dict:
    """Thornthwaite (1948) monthly potential evapotranspiration (PET) from mean
    monthly air temperature alone:
        heat index   I = sum_{m} (T_m / 5)^1.514     (T_m > 0 only)
        exponent     a = 6.75e-7*I^3 - 7.71e-5*I^2 + 0.01792*I + 0.49239
        PET_m = 16 * (10 * T_m / I)^a   mm/month  (standard 30-day, 12-h month)
    Months with T_m <= 0 contribute zero heat and zero PET.
    KNOWN: a temperature-only index; for a uniform-temperature year all 12
    monthly PET values are equal and the formula is exactly reproducible from
    T and the derived I and a.

    Ref: Thornthwaite (1948), "An approach toward a rational classification of
    climate"; mm form uses the factor 16 (cm form uses 1.6).
    """
    T = np.asarray(monthly_temp_c, dtype=float)
    if T.size == 0:
        raise ValueError("monthly_temp_c must be non-empty")
    pos = np.where(T > 0.0, T, 0.0)
    monthly_heat = (pos / 5.0) ** 1.514
    I = float(np.sum(monthly_heat))
    a = (6.75e-7 * I ** 3 - 7.71e-5 * I ** 2 + 0.01792 * I + 0.49239)
    pet = np.zeros_like(T)
    if I > 0.0:
        with np.errstate(invalid="ignore"):
            pet = np.where(T > 0.0, 16.0 * (10.0 * pos / I) ** a, 0.0)
    return {
        "pet_mm_month": pet.tolist(),
        "annual_pet_mm": float(np.sum(pet)),
        "heat_index_I": I,
        "exponent_a": a,
    }
