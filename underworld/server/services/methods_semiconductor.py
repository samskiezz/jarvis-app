"""Real semiconductor-device physics simulations.

Each function is a distinct, named semiconductor method (not a shared engine
reused), implemented with numpy/math and verified against a KNOWN published or
analytically exact value in the companion tests. Domains: intrinsic carrier
statistics, Fermi-Dirac/Boltzmann carrier density & Fermi level, the Shockley
diode equation, pn-junction electrostatics (built-in potential, depletion
width, junction capacitance), drift conductivity from carrier mobility, the
Hall effect, and the Varshni bandgap temperature dependence.

UNITS: lengths/areas/volumes are in cm, cm^2, cm^3 (the customary device-physics
units); concentrations in cm^-3; energies in eV; charge in coulombs; voltages in
volts; magnetic field in tesla; current in amps. Permittivity is handled in SI
internally (F/m) and converted to F/cm where capacitances/widths are reported in
cm. Each docstring states the units it uses.

References are inline in each docstring. KNOWN values are reproduced in
server/tests/test_methods_semiconductor.py.
"""
from __future__ import annotations

import math

import numpy as np

# ── Fundamental physical constants (SI / eV) ──────────────────────────────────
Q = 1.602176634e-19          # elementary charge, C (CODATA exact)
K_B = 1.380649e-23           # Boltzmann constant, J/K (CODATA exact)
K_B_EV = 8.617333262e-5      # Boltzmann constant, eV/K
EPS0_F_PER_M = 8.8541878128e-12   # vacuum permittivity, F/m
EPS0_F_PER_CM = EPS0_F_PER_M / 100.0  # vacuum permittivity, F/cm

# ── Silicon material parameters at 300 K ──────────────────────────────────────
#   Ref: eesemi.com / HTE Labs Si properties; Sze, "Physics of Semiconductor
#   Devices". Nc, Nv in cm^-3; mobilities in cm^2/(V*s); Eg in eV; eps_r unitless.
SI_NC_300 = 2.8e19           # conduction-band effective DOS, cm^-3
SI_NV_300 = 1.04e19          # valence-band effective DOS, cm^-3
SI_EG_300 = 1.12             # bandgap at 300 K, eV
SI_EPS_R = 11.7              # relative permittivity (dielectric constant)
SI_MU_N = 1350.0             # electron mobility, cm^2/(V*s)
SI_MU_P = 480.0              # hole mobility, cm^2/(V*s)

# Varshni parameters for silicon (Eg(0)=1.166 eV, alpha, beta).
#   Ref: Varshni (1967); Sze. Eg0 in eV, alpha in eV/K, beta in K.
SI_VARSHNI_EG0 = 1.166       # eV (bandgap extrapolated to 0 K)
SI_VARSHNI_ALPHA = 4.73e-4   # eV/K
SI_VARSHNI_BETA = 636.0      # K


# ── 1. Intrinsic carrier concentration ni(T) ──────────────────────────────────
def intrinsic_carrier_concentration(T: float = 300.0,
                                    *, Nc_300: float = SI_NC_300,
                                    Nv_300: float = SI_NV_300,
                                    Eg_eV: float = SI_EG_300) -> dict:
    """Intrinsic carrier concentration from the effective densities of states
    and the bandgap (non-degenerate, Boltzmann statistics):
        Nc(T) = Nc_300 (T/300)^(3/2),  Nv(T) = Nv_300 (T/300)^(3/2)
        ni(T) = sqrt(Nc Nv) exp(-Eg / (2 kT))
    UNITS: T in K, Nc/Nv in cm^-3, Eg in eV -> ni in cm^-3.
    KNOWN: silicon ni(300 K) ~= 1.0e10 cm^-3 (consensus value).

    Ref: Sze, "Physics of Semiconductor Devices"; eesemi.com Si properties.
    """
    scale = (T / 300.0) ** 1.5
    Nc = Nc_300 * scale
    Nv = Nv_300 * scale
    kT = K_B_EV * T  # eV
    ni = math.sqrt(Nc * Nv) * math.exp(-Eg_eV / (2.0 * kT))
    return {
        "ni_cm3": ni,
        "Nc_cm3": Nc,
        "Nv_cm3": Nv,
        "kT_eV": kT,
        "T_K": T,
        "Eg_eV": Eg_eV,
    }


# ── 2. Carrier density & Fermi level (Boltzmann / Fermi-Dirac) ─────────────────
def carrier_density_fermi(Ec_minus_Ef_eV: float, T: float = 300.0,
                          *, Nc_300: float = SI_NC_300,
                          Nv_300: float = SI_NV_300,
                          Eg_eV: float = SI_EG_300,
                          use_fermi_dirac: bool = False) -> dict:
    """Electron/hole density from the position of the Fermi level below the
    conduction band, (Ec - Ef):
        Boltzmann:    n = Nc exp(-(Ec-Ef)/kT)
        Fermi-Dirac:  n = Nc * F_{1/2}(eta) / (sqrt(pi)/2),  eta=-(Ec-Ef)/kT
    Holes follow from p = Nv exp(-(Ef-Ev)/kT) with Ev = Ec - Eg, and the
    mass-action law n*p = ni^2 is satisfied in the Boltzmann limit.
    UNITS: energies in eV, T in K -> densities in cm^-3.
    KNOWN: at the intrinsic level (Ef ~ midgap) Boltzmann gives n = ni; and
    n*p = ni^2 holds exactly in the non-degenerate (Boltzmann) regime.

    Ref: Sze, "Physics of Semiconductor Devices", ch.1; Blakemore F_{1/2}.
    """
    scale = (T / 300.0) ** 1.5
    Nc = Nc_300 * scale
    Nv = Nv_300 * scale
    kT = K_B_EV * T
    eta_c = -Ec_minus_Ef_eV / kT          # (Ef - Ec)/kT
    Ef_minus_Ev = Eg_eV - Ec_minus_Ef_eV  # since Ev = Ec - Eg
    eta_v = -Ef_minus_Ev / kT             # (Ev - Ef)/kT

    if use_fermi_dirac:
        # Blakemore analytic approximation to the Fermi-Dirac integral F_{1/2}.
        # n = Nc * (2/sqrt(pi)) * F_{1/2}(eta); approximation valid for eta<~1.3.
        def F_half(eta: float) -> float:
            return 1.0 / (math.exp(-eta) + 0.27)
        n = Nc * F_half(eta_c)
        p = Nv * F_half(eta_v)
    else:
        n = Nc * math.exp(eta_c)
        p = Nv * math.exp(eta_v)

    ni = math.sqrt(Nc * Nv) * math.exp(-Eg_eV / (2.0 * kT))
    return {
        "n_cm3": n,
        "p_cm3": p,
        "np_product_cm6": n * p,
        "ni_cm3": ni,
        "ni2_cm6": ni * ni,
        "Nc_cm3": Nc,
        "Nv_cm3": Nv,
        "kT_eV": kT,
    }


# ── 3. Shockley diode equation I(V) ───────────────────────────────────────────
def shockley_diode(V: float, I_s: float, T: float = 300.0,
                   *, n_ideality: float = 1.0) -> dict:
    """Ideal-diode (Shockley) current-voltage relation:
        I = I_s [ exp(V / (n V_T)) - 1 ],   V_T = kT / q
    UNITS: V in volts, I_s in amps, T in K -> I in amps; V_T in volts.
    KNOWN: thermal voltage V_T = kT/q ~= 0.02585 V at 300 K; at V=0, I=0; for
    large reverse bias I -> -I_s (saturation).

    Ref: Shockley (1949); Sze, "Physics of Semiconductor Devices".
    """
    VT = K_B * T / Q  # volts
    I = I_s * (math.exp(V / (n_ideality * VT)) - 1.0)
    # small-signal dynamic conductance g = dI/dV
    g = I_s / (n_ideality * VT) * math.exp(V / (n_ideality * VT))
    return {
        "I_A": I,
        "thermal_voltage_V": VT,
        "dynamic_conductance_S": g,
        "T_K": T,
        "ideality": n_ideality,
    }


# ── 4. Built-in potential of a pn junction ────────────────────────────────────
def built_in_potential(Na: float, Nd: float, T: float = 300.0,
                       *, ni: float = 1.0e10) -> dict:
    """Built-in (contact) potential of an abrupt pn junction from doping:
        V_bi = (kT/q) ln(Na Nd / ni^2)
    UNITS: Na, Nd, ni in cm^-3, T in K -> V_bi in volts.
    KNOWN: for silicon Na=Nd=1e17 cm^-3, ni=1e10 cm^-3 at 300 K,
    V_bi ~= 0.0259 * ln(1e34/1e20) ~= 0.0259*32.24 ~= 0.835 V.

    Ref: Sze, "Physics of Semiconductor Devices", ch.2.
    """
    VT = K_B * T / Q
    Vbi = VT * math.log(Na * Nd / (ni * ni))
    return {
        "Vbi_V": Vbi,
        "thermal_voltage_V": VT,
        "Na_cm3": Na,
        "Nd_cm3": Nd,
        "ni_cm3": ni,
    }


# ── 5. Depletion width & junction capacitance ─────────────────────────────────
def depletion_width(Na: float, Nd: float, V_applied: float = 0.0,
                    T: float = 300.0, *, eps_r: float = SI_EPS_R,
                    ni: float = 1.0e10, area_cm2: float = 1.0) -> dict:
    """Depletion-region width and junction capacitance of an abrupt pn junction
    under bias V_applied (positive = forward, reduces depletion):
        V_bi = (kT/q) ln(Na Nd / ni^2)
        W = sqrt( 2 eps (V_bi - V) / q * (1/Na + 1/Nd) )
        Cj = eps A / W   (parallel-plate form; Cj per area = eps/W)
    UNITS: Na, Nd, ni in cm^-3, area in cm^2 -> W in cm, Cj in F. Permittivity
    eps = eps_r*eps0 handled in F/cm so all lengths stay in cm.
    KNOWN: for Si one-sided/symmetric junctions W is sub-micron (~1e-5 cm) and
    Cj = eps*A/W; the depletion approximation Cj = eps A / W is exact here.

    Ref: Sze, "Physics of Semiconductor Devices", ch.2; abrupt-junction theory.
    """
    VT = K_B * T / Q
    Vbi = VT * math.log(Na * Nd / (ni * ni))
    eps = eps_r * EPS0_F_PER_CM  # F/cm
    # densities are cm^-3 and q is in C; q in these mixed units stays consistent
    # because W^2 ~ (F/cm * V) / (C * cm^-3) = (C/V/cm * V) / (C/cm^3) = cm^2.
    W = math.sqrt(2.0 * eps * (Vbi - V_applied) / Q * (1.0 / Na + 1.0 / Nd))
    # one-sided fractions of the depletion width
    xn = W * Na / (Na + Nd)
    xp = W * Nd / (Na + Nd)
    Cj = eps * area_cm2 / W              # F
    Cj_per_area = eps / W                # F/cm^2
    return {
        "W_cm": W,
        "W_um": W * 1.0e4,
        "xn_cm": xn,
        "xp_cm": xp,
        "Cj_F": Cj,
        "Cj_per_area_F_cm2": Cj_per_area,
        "Vbi_V": Vbi,
        "eps_F_per_cm": eps,
    }


# ── 6. Conductivity from carrier mobility ─────────────────────────────────────
def drift_conductivity(n: float, p: float,
                       *, mu_n: float = SI_MU_N, mu_p: float = SI_MU_P) -> dict:
    """Drift conductivity (and resistivity) from carrier concentrations and
    mobilities:
        sigma = q (n mu_n + p mu_p),   rho = 1/sigma
    UNITS: n, p in cm^-3, mu in cm^2/(V*s) -> sigma in (ohm*cm)^-1, rho in ohm*cm.
    KNOWN: for n-type Si with n=1e16 cm^-3, mu_n=1350 cm^2/Vs,
    sigma = 1.602e-19 * 1e16 * 1350 ~= 2.16 (ohm*cm)^-1, rho ~= 0.46 ohm*cm.

    Ref: Sze, "Physics of Semiconductor Devices", ch.1; drift transport.
    """
    sigma = Q * (n * mu_n + p * mu_p)   # (ohm*cm)^-1
    rho = math.inf if sigma == 0.0 else 1.0 / sigma
    return {
        "sigma_S_per_cm": sigma,
        "resistivity_ohm_cm": rho,
        "n_cm3": n,
        "p_cm3": p,
        "mu_n": mu_n,
        "mu_p": mu_p,
    }


# ── 7. Hall effect carrier concentration & Hall voltage ───────────────────────
def hall_effect(I: float, B: float, thickness_cm: float,
                *, n: float | None = None, V_H: float | None = None,
                carrier_sign: int = -1) -> dict:
    """Hall effect relating current I, magnetic field B (perpendicular), sample
    thickness t, Hall voltage V_H and carrier density n:
        R_H = 1/(n q),   V_H = R_H I B / t = I B / (n q t)
    Provide n to predict V_H, or provide V_H to recover n:
        n = I B / (q t V_H)
    UNITS: I in A, B in T, t in cm, n in cm^-3, V_H in volts. R_H is computed in
    SI (m^3/C) by converting t,n; V_H returns in volts.
    KNOWN: V_H = I B / (n q t); the sign of V_H follows the carrier sign
    (electrons vs holes). Self-consistency: feeding the predicted V_H back
    recovers the input n.

    Ref: Hall (1879); Sze, "Physics of Semiconductor Devices"; OpenStax Univ.
    Physics II, "The Hall Effect".
    """
    t_m = thickness_cm / 100.0          # m
    out: dict = {"I_A": I, "B_T": B, "thickness_cm": thickness_cm}
    if n is not None:
        n_si = n * 1.0e6                # cm^-3 -> m^-3
        R_H = 1.0 / (n_si * Q)         # m^3/C
        V_H = carrier_sign * R_H * I * B / t_m  # volts (sign from carrier type)
        out.update({
            "V_H_V": V_H,
            "R_H_m3_per_C": R_H,
            "n_cm3": n,
            "carrier_sign": carrier_sign,
        })
    elif V_H is not None:
        n_si = abs(I * B / (Q * t_m * V_H))   # m^-3
        n_cm3 = n_si / 1.0e6
        R_H = 1.0 / (n_si * Q)
        out.update({
            "n_cm3": n_cm3,
            "R_H_m3_per_C": R_H,
            "V_H_V": V_H,
        })
    else:
        raise ValueError("provide either n (to get V_H) or V_H (to get n)")
    return out


# ── 8. Varshni bandgap temperature dependence ─────────────────────────────────
def varshni_bandgap(T: float = 300.0, *, Eg0_eV: float = SI_VARSHNI_EG0,
                    alpha_eV_per_K: float = SI_VARSHNI_ALPHA,
                    beta_K: float = SI_VARSHNI_BETA) -> dict:
    """Empirical Varshni temperature dependence of the semiconductor bandgap:
        Eg(T) = Eg(0) - alpha T^2 / (T + beta)
    UNITS: T, beta in K, Eg0/alpha in eV (alpha in eV/K) -> Eg in eV.
    KNOWN: for silicon (Eg0=1.166 eV, alpha=4.73e-4 eV/K, beta=636 K),
    Eg(300 K) ~= 1.166 - 4.73e-4*300^2/(300+636) ~= 1.166 - 0.0455 ~= 1.1205 eV;
    Eg(0) = Eg0 = 1.166 eV; Eg decreases monotonically with T.

    Ref: Varshni, Physica 34, 149 (1967); Sze, "Physics of Semiconductor Devices".
    """
    Eg = Eg0_eV - alpha_eV_per_K * T * T / (T + beta_K)
    return {
        "Eg_eV": Eg,
        "Eg0_eV": Eg0_eV,
        "alpha_eV_per_K": alpha_eV_per_K,
        "beta_K": beta_K,
        "T_K": T,
    }
