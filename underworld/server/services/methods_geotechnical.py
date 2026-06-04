"""Real geotechnical & soil-mechanics simulations.

Each function is a distinct, named soil-mechanics method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: shallow-foundation
bearing capacity (Terzaghi/Reissner/Prandtl/Meyerhof), lateral earth pressure
(Rankine), effective stress (Terzaghi's principle), seepage (Darcy), 1-D
consolidation settlement & time factor (Terzaghi), shear strength
(Mohr-Coulomb), infinite-slope stability, and density/void-ratio/porosity
relations.

All quantities are SI: lengths m, stresses Pa, unit weights N/m^3, k in m/s,
flows m^3/s, angles in degrees on the public interface. References are inline in
each docstring. KNOWN values are reproduced in
server/tests/test_methods_geotechnical.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Reference constants ───────────────────────────────────────────────────────
GAMMA_WATER = 9810.0       # unit weight of water, N/m^3 (rho_w*g = 1000*9.81)
G_STD = 9.81               # standard gravity, m/s^2
RHO_WATER = 1000.0         # density of water, kg/m^3


# ── 1. Terzaghi general bearing-capacity equation ─────────────────────────────
def terzaghi_bearing_capacity(cohesion_pa: float, gamma_n_m3: float,
                              depth_m: float, width_m: float,
                              phi_deg: float,
                              *, shape: str = "strip") -> dict:
    """Ultimate bearing capacity of a shallow footing (general shear failure):
        q_u = c*Nc + q*Nq + 0.5*gamma*B*Ngamma,      q = gamma*Df (surcharge)
    using the exact Reissner/Prandtl closed-form factors (also the basis of the
    Meyerhof set):
        Nq = e^(pi*tan(phi)) * tan^2(45 + phi/2)
        Nc = (Nq - 1) * cot(phi)                 (Prandtl 1921)
        Ngamma = (Nq - 1) * tan(1.4*phi)         (Meyerhof 1963)
    KNOWN: at phi=30 deg, Nq=18.40, Nc=30.14, Ngamma=15.67; at phi=0 the cohesion
    term reduces to Nc=5.14 (=2+pi), Nq=1, Ngamma=0.

    Ref: Terzaghi (1943); Prandtl (1921); Reissner (1924); Meyerhof (1963).
    """
    phi = math.radians(phi_deg)
    if abs(phi_deg) < 1e-12:
        Nq = 1.0
        Nc = 2.0 + math.pi                       # 5.14, the undrained limit
        Ngamma = 0.0
    else:
        Nq = math.exp(math.pi * math.tan(phi)) * math.tan(math.pi / 4.0 + phi / 2.0) ** 2
        Nc = (Nq - 1.0) / math.tan(phi)
        Ngamma = (Nq - 1.0) * math.tan(1.4 * phi)

    # shape factors (Terzaghi): strip=1; square/circular adjust c and gamma terms
    if shape == "strip":
        sc, sg = 1.0, 1.0
    elif shape == "square":
        sc, sg = 1.3, 0.8
    elif shape == "circular":
        sc, sg = 1.3, 0.6
    else:
        raise ValueError("shape must be 'strip', 'square', or 'circular'")

    surcharge = gamma_n_m3 * depth_m            # q = gamma * Df
    term_c = sc * cohesion_pa * Nc
    term_q = surcharge * Nq
    term_g = sg * 0.5 * gamma_n_m3 * width_m * Ngamma
    q_ult = term_c + term_q + term_g
    return {
        "q_ult_pa": q_ult,
        "q_ult_kpa": q_ult / 1000.0,
        "Nc": Nc, "Nq": Nq, "Ngamma": Ngamma,
        "surcharge_pa": surcharge,
        "term_cohesion_pa": term_c,
        "term_surcharge_pa": term_q,
        "term_gamma_pa": term_g,
        "shape": shape,
    }


# ── 2. Rankine active & passive earth-pressure coefficients ───────────────────
def rankine_earth_pressure(phi_deg: float, gamma_n_m3: float, height_m: float,
                           *, cohesion_pa: float = 0.0) -> dict:
    """Rankine lateral earth-pressure coefficients and resultant thrusts for a
    smooth vertical wall retaining a horizontal cohesionless/cohesive backfill:
        Ka = tan^2(45 - phi/2) = (1 - sin phi)/(1 + sin phi)
        Kp = tan^2(45 + phi/2) = (1 + sin phi)/(1 - sin phi) = 1/Ka
    Active/passive pressures at depth z (with cohesion c):
        sigma_a = Ka*gamma*z - 2c*sqrt(Ka),  sigma_p = Kp*gamma*z + 2c*sqrt(Kp)
    Resultant thrust on a wall of height H (cohesionless): P = 0.5*K*gamma*H^2.
    KNOWN: at phi=30 deg, Ka = 1/3 = 0.3333 and Kp = 3.0 (Ka*Kp = 1).

    Ref: Rankine (1857); Craig's Soil Mechanics; Das, Principles of Geotech. Eng.
    """
    phi = math.radians(phi_deg)
    Ka = (1.0 - math.sin(phi)) / (1.0 + math.sin(phi))
    Kp = (1.0 + math.sin(phi)) / (1.0 - math.sin(phi))
    sigma_a_base = Ka * gamma_n_m3 * height_m - 2.0 * cohesion_pa * math.sqrt(Ka)
    sigma_p_base = Kp * gamma_n_m3 * height_m + 2.0 * cohesion_pa * math.sqrt(Kp)
    # cohesionless resultant thrusts (per unit wall length)
    Pa = 0.5 * Ka * gamma_n_m3 * height_m ** 2
    Pp = 0.5 * Kp * gamma_n_m3 * height_m ** 2
    return {
        "Ka": Ka, "Kp": Kp,
        "sigma_active_base_pa": sigma_a_base,
        "sigma_passive_base_pa": sigma_p_base,
        "thrust_active_n_per_m": Pa,
        "thrust_passive_n_per_m": Pp,
        "thrust_active_resultant_height_m": height_m / 3.0,  # acts at H/3
    }


# ── 3. Terzaghi effective stress ──────────────────────────────────────────────
def effective_stress(layers: list, water_table_depth_m: float, depth_m: float,
                     *, gamma_water_n_m3: float = GAMMA_WATER) -> dict:
    """Terzaghi's principle of effective stress in a layered soil column:
        sigma  = sum(gamma_i * dz_i)   total vertical stress at depth z
        u      = gamma_w * (z - z_wt)  pore pressure (hydrostatic below WT)
        sigma' = sigma - u             effective (intergranular) stress
    `layers` is a list of (thickness_m, gamma_n_m3). Above the water table u=0.
    KNOWN: a uniform column gamma=18 kN/m^3, water table at the surface, at z=5 m:
        sigma = 90 kPa, u = 49.05 kPa, sigma' = 40.95 kPa.

    Ref: Terzaghi (1925/1943), principle of effective stress; Das, Ch. 9.
    """
    sigma = 0.0          # total stress, Pa
    remaining = depth_m
    z = 0.0
    for thickness, gamma in layers:
        dz = min(thickness, remaining)
        if dz <= 0.0:
            break
        sigma += gamma * dz
        remaining -= dz
        z += dz
        if remaining <= 0.0:
            break
    if remaining > 0.0:
        raise ValueError("layer stack does not reach the requested depth")

    head = max(0.0, depth_m - water_table_depth_m)   # height of water column
    u = gamma_water_n_m3 * head
    sigma_eff = sigma - u
    return {
        "total_stress_pa": sigma,
        "total_stress_kpa": sigma / 1000.0,
        "pore_pressure_pa": u,
        "pore_pressure_kpa": u / 1000.0,
        "effective_stress_pa": sigma_eff,
        "effective_stress_kpa": sigma_eff / 1000.0,
    }


# ── 4. Darcy seepage flow through soil ────────────────────────────────────────
def darcy_seepage(k_m_s: float, head_loss_m: float, length_m: float,
                  area_m2: float, *, porosity: float | None = None) -> dict:
    """One-dimensional seepage through a saturated soil via Darcy's law:
        i = dh/L                 (dimensionless hydraulic gradient)
        v = k*i                  (Darcy/discharge velocity, m/s)
        Q = v*A = k*i*A          (volumetric flow, m^3/s)
        v_s = v / n              (seepage/pore velocity, if porosity n given)
    KNOWN: k=1e-4 m/s, head loss 2 m over L=4 m, A=1 m^2 -> i=0.5,
        v=5e-5 m/s, Q=5e-5 m^3/s.

    Ref: Darcy (1856); Das, Ch. 7 (Permeability & Seepage).
    """
    if length_m <= 0.0:
        raise ValueError("length must be positive")
    i = head_loss_m / length_m
    v = k_m_s * i                       # discharge velocity
    Q = v * area_m2
    out = {
        "hydraulic_gradient": i,
        "discharge_velocity_m_s": v,
        "flow_rate_m3_s": Q,
        "flow_rate_m3_day": Q * 86400.0,
    }
    if porosity is not None:
        if not (0.0 < porosity < 1.0):
            raise ValueError("porosity must be in (0,1)")
        out["seepage_velocity_m_s"] = v / porosity
    return out


# ── 5. Terzaghi 1-D consolidation: settlement & time factor ───────────────────
def consolidation_settlement(Cc: float, e0: float, H_m: float,
                             sigma0_pa: float, dsigma_pa: float,
                             *, Cr: float | None = None,
                             sigma_pc_pa: float | None = None) -> dict:
    """Primary consolidation settlement of a clay layer (1-D oedometer theory):
        normally consolidated:  Sc = (Cc*H)/(1+e0) * log10((sigma0+dsigma)/sigma0)
    With a recompression index Cr and preconsolidation stress sigma_pc the
    over-consolidated two-segment form is used. Cc is the compression index
    (virgin-line slope of the e-log(sigma') curve).
    KNOWN: Cc=0.30, e0=0.80, H=3 m, sigma0=100 kPa, dsigma=100 kPa (NC):
        Sc = (0.30*3/1.8)*log10(200/100) = 0.5*0.30103 = 0.1505 m.

    Ref: Terzaghi (1943); Das, Ch. 11 (Compressibility of Soil).
    """
    sigma_f = sigma0_pa + dsigma_pa
    if Cr is None or sigma_pc_pa is None or sigma_pc_pa <= sigma0_pa:
        # normally consolidated (or treat as NC)
        Sc = (Cc * H_m / (1.0 + e0)) * math.log10(sigma_f / sigma0_pa)
        regime = "normally_consolidated"
    elif sigma_f <= sigma_pc_pa:
        # stays in the over-consolidated (recompression) range
        Sc = (Cr * H_m / (1.0 + e0)) * math.log10(sigma_f / sigma0_pa)
        regime = "over_consolidated"
    else:
        # crosses the preconsolidation stress: recompression + virgin
        Sc = (Cr * H_m / (1.0 + e0)) * math.log10(sigma_pc_pa / sigma0_pa) \
            + (Cc * H_m / (1.0 + e0)) * math.log10(sigma_f / sigma_pc_pa)
        regime = "over_consolidated_crossing"
    return {
        "settlement_m": Sc,
        "settlement_mm": Sc * 1000.0,
        "sigma_final_pa": sigma_f,
        "regime": regime,
    }


def consolidation_time_factor(U_percent: float | None = None,
                              *, cv_m2_s: float | None = None,
                              t_s: float | None = None,
                              H_dr_m: float | None = None) -> dict:
    """Terzaghi time factor Tv for 1-D consolidation. Either compute Tv from a
    target average degree of consolidation U (Terzaghi's series approximations):
        U <  60%:  Tv = (pi/4) * (U/100)^2
        U >= 60%:  Tv = 1.781 - 0.933*log10(100 - U%)
    or compute Tv from elapsed time:  Tv = cv*t / H_dr^2  (H_dr = drainage path).
    KNOWN: U=50% -> Tv=0.197; U=90% -> Tv=0.848.

    Ref: Terzaghi (1943); Das, Ch. 11 (Consolidation, U-Tv relationship).
    """
    out: dict = {}
    if U_percent is not None:
        if U_percent < 60.0:
            Tv = (math.pi / 4.0) * (U_percent / 100.0) ** 2
        else:
            Tv = 1.781 - 0.933 * math.log10(100.0 - U_percent)
        out["U_percent"] = U_percent
        out["Tv_from_U"] = Tv
    if cv_m2_s is not None and t_s is not None and H_dr_m is not None:
        Tv_t = cv_m2_s * t_s / H_dr_m ** 2
        out["Tv_from_time"] = Tv_t
    if not out:
        raise ValueError("provide U_percent or (cv, t, H_dr)")
    return out


# ── 6. Mohr-Coulomb shear strength ────────────────────────────────────────────
def mohr_coulomb_strength(cohesion_pa: float, phi_deg: float,
                          sigma_n_pa: float,
                          *, pore_pressure_pa: float = 0.0) -> dict:
    """Mohr-Coulomb failure criterion for soil shear strength:
        tau_f = c + sigma' * tan(phi)            (effective-stress form)
        sigma' = sigma_n - u                     (Terzaghi effective normal stress)
    KNOWN: c=10 kPa, phi=30 deg, sigma'=100 kPa ->
        tau_f = 10 + 100*tan(30) = 10 + 57.735 = 67.735 kPa.

    Ref: Coulomb (1776); Mohr (1900); Das, Ch. 10 (Shear Strength of Soil).
    """
    phi = math.radians(phi_deg)
    sigma_eff = sigma_n_pa - pore_pressure_pa
    tau_f = cohesion_pa + sigma_eff * math.tan(phi)
    return {
        "shear_strength_pa": tau_f,
        "shear_strength_kpa": tau_f / 1000.0,
        "effective_normal_stress_pa": sigma_eff,
        "friction_component_pa": sigma_eff * math.tan(phi),
        "cohesion_component_pa": cohesion_pa,
    }


# ── 7. Infinite-slope factor of safety ────────────────────────────────────────
def infinite_slope_fos(phi_deg: float, cohesion_pa: float, gamma_n_m3: float,
                       slope_angle_deg: float, depth_m: float,
                       *, gamma_water_n_m3: float = GAMMA_WATER,
                       m_seepage: float = 0.0) -> dict:
    """Factor of safety against translational sliding of an infinite slope of
    inclination beta, failure plane at depth z parallel to the surface:
        FS = [c' + (gamma*z*cos^2(beta) - m*gamma_w*z*cos^2(beta))*tan(phi')]
             / (gamma*z*sin(beta)*cos(beta))
    m is the fraction of the slice that is submerged (m=0 dry, m=1 seepage to the
    surface). For a dry cohesionless slope this reduces to FS = tan(phi)/tan(beta).
    KNOWN: dry cohesionless, phi=30 deg, beta=15 deg ->
        FS = tan(30)/tan(15) = 0.57735/0.26795 = 2.1547.

    Ref: Skempton & DeLory (1957); Das, Ch. (Slope Stability), infinite slope.
    """
    phi = math.radians(phi_deg)
    beta = math.radians(slope_angle_deg)
    cos_b, sin_b = math.cos(beta), math.sin(beta)
    driving = gamma_n_m3 * depth_m * sin_b * cos_b
    normal_eff = (gamma_n_m3 - m_seepage * gamma_water_n_m3) * depth_m * cos_b ** 2
    resisting = cohesion_pa + normal_eff * math.tan(phi)
    if driving == 0.0:
        raise ValueError("slope angle of 0 gives no driving stress")
    FS = resisting / driving
    return {
        "factor_of_safety": FS,
        "driving_stress_pa": driving,
        "resisting_stress_pa": resisting,
        "stable": FS >= 1.0,
    }


# ── 8. Phase relations: void ratio, porosity, relative density ────────────────
def soil_phase_relations(*, void_ratio: float | None = None,
                         porosity: float | None = None,
                         Gs: float = 2.65,
                         e_max: float | None = None,
                         e_min: float | None = None) -> dict:
    """Weight-volume (phase) relations for a soil element:
        n = e / (1 + e)                  porosity from void ratio
        e = n / (1 - n)                  void ratio from porosity
        gamma_d = Gs*gamma_w / (1 + e)   dry unit weight
        gamma_sat = (Gs + e)*gamma_w / (1 + e)   saturated unit weight
        Dr = (e_max - e) / (e_max - e_min)       relative density (if extremes given)
    KNOWN: e=0.5 -> n = 0.5/1.5 = 0.3333; with e_max=0.8, e_min=0.4 ->
        Dr = (0.8-0.5)/(0.8-0.4) = 0.75 (75%).

    Ref: Das, Ch. 3 (Weight-Volume Relationships); ASTM D4254 (relative density).
    """
    if void_ratio is None and porosity is None:
        raise ValueError("provide void_ratio or porosity")
    if void_ratio is None:
        if not (0.0 <= porosity < 1.0):
            raise ValueError("porosity must be in [0,1)")
        e = porosity / (1.0 - porosity)
    else:
        e = void_ratio
    n = e / (1.0 + e)
    gamma_dry = Gs * GAMMA_WATER / (1.0 + e)
    gamma_sat = (Gs + e) * GAMMA_WATER / (1.0 + e)
    out = {
        "void_ratio": e,
        "porosity": n,
        "dry_unit_weight_n_m3": gamma_dry,
        "saturated_unit_weight_n_m3": gamma_sat,
        "Gs": Gs,
    }
    if e_max is not None and e_min is not None:
        if e_max <= e_min:
            raise ValueError("e_max must exceed e_min")
        Dr = (e_max - e) / (e_max - e_min)
        out["relative_density"] = Dr
        out["relative_density_percent"] = Dr * 100.0
    return out
