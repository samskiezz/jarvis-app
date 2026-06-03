"""Real polymer & soft-matter simulation methods.

Eight named, real polymer-physics methods, each computed from its canonical
published formula and each verified in the test suite against a KNOWN
published value or scaling law:

  1. radius_gyration         — ideal (Gaussian / freely-jointed) chain radius
                               of gyration  Rg = sqrt(N/6) * b.
                               (verify Rg scales as sqrt(N), i.e. Rg ~ N^0.5)
  2. flory_radius            — self-avoiding chain in a good solvent
                               R = b * N^nu with the Flory exponent nu = 3/5
                               (0.588 in 3D). (verify the fitted exponent ~ 0.6)
  3. mark_houwink            — Mark-Houwink-Sakurada intrinsic viscosity
                               [eta] = K * M^a. (verify the recovered exponent
                               equals the input a)
  4. flory_huggins          — Flory-Huggins free energy of mixing and the
                               critical interaction parameter chi_c. (verify a
                               symmetric small-molecule blend phase-separates
                               when chi > chi_c = 2)
  5. rubber_elastic          — affine network rubber elasticity nominal stress
                               sigma = n k T (lambda - 1/lambda^2). (verify
                               sigma = 0 at lambda = 1 and the sign of stress)
  6. wlf_shift               — Williams-Landel-Ferry time-temperature
                               superposition shift  log10(aT) =
                               -C1 (T-Tref) / (C2 + T-Tref). (verify aT = 1 at
                               Tref and the universal-constant value at Tg+C2)
  7. reptation_diffusion     — de Gennes / Doi-Edwards reptation diffusion
                               D = D0 * N^-2. (verify D scales as N^-2)
  8. glass_transition        — Fox equation for blend glass transition
                               1/Tg = w1/Tg1 + w2/Tg2. (verify Tg lies strictly
                               between the two component Tg values)

Sources:
  - Radius of gyration of an ideal chain:
    https://en.wikipedia.org/wiki/Radius_of_gyration
    https://en.wikipedia.org/wiki/Ideal_chain
  - Flory radius / self-avoiding walk and the Flory exponent:
    https://en.wikipedia.org/wiki/Flory_self-avoiding_walk
    https://en.wikipedia.org/wiki/Ideal_chain  (good-solvent scaling)
  - Mark-Houwink(-Sakurada) equation:
    https://en.wikipedia.org/wiki/Mark%E2%80%93Houwink_equation
  - Flory-Huggins solution theory:
    https://en.wikipedia.org/wiki/Flory%E2%80%93Huggins_solution_theory
  - Rubber elasticity (affine network model):
    https://en.wikipedia.org/wiki/Rubber_elasticity
  - Williams-Landel-Ferry equation (universal constants C1=17.44, C2=51.6 K):
    https://en.wikipedia.org/wiki/Williams%E2%80%93Landel%E2%80%93Ferry_equation
  - Reptation (de Gennes), D ~ N^-2:
    https://en.wikipedia.org/wiki/Reptation
  - Fox equation / glass transition of blends:
    https://en.wikipedia.org/wiki/Glass_transition  (Fox equation)
"""
from __future__ import annotations

import numpy as np
from scipy import constants as sc

# --- Published physical constants (CODATA via scipy.constants) --------------
K_B = sc.k            # Boltzmann constant, 1.380649e-23 J/K

# WLF universal constants (Williams, Landel, Ferry 1955), referenced to Tg.
WLF_C1_UNIVERSAL = 17.44
WLF_C2_UNIVERSAL = 51.6   # kelvin

# Flory exponent in 3 dimensions (good solvent). Flory mean-field value 3/5;
# the best modern estimate is nu ~ 0.588.
FLORY_EXPONENT_3D = 3.0 / 5.0


# 1. IDEAL-CHAIN RADIUS OF GYRATION ------------------------------------------
def radius_gyration(*, segments: int, bond_length: float = 1.0) -> dict:
    """Radius of gyration of an ideal (Gaussian / freely-jointed) chain.

    For a freely-jointed chain of ``N`` segments of length ``b`` the mean-square
    end-to-end distance is <R^2> = N b^2 and the radius of gyration is

        Rg = sqrt(N / 6) * b   (so <Rg^2> = N b^2 / 6).

    Known value (verified): Rg scales as sqrt(N); doubling N multiplies Rg by
    sqrt(2). For N = 600, b = 1 this gives Rg = sqrt(100) = 10.
    """
    if segments < 1:
        raise ValueError("segments (N) must be >= 1")
    if bond_length <= 0:
        raise ValueError("bond_length must be positive")
    rg = np.sqrt(segments / 6.0) * bond_length
    r_ee = np.sqrt(segments) * bond_length  # rms end-to-end distance
    return {
        "segments": int(segments),
        "bond_length": float(bond_length),
        "radius_of_gyration": float(rg),
        "rms_end_to_end": float(r_ee),
        "mean_square_rg": float(segments * bond_length ** 2 / 6.0),
        "scaling_exponent": 0.5,
    }


# 2. FLORY RADIUS (GOOD SOLVENT) ---------------------------------------------
def flory_radius(
    *,
    segments: int,
    bond_length: float = 1.0,
    exponent: float = FLORY_EXPONENT_3D,
) -> dict:
    """Size of a self-avoiding polymer chain in a good solvent (Flory).

    Excluded-volume (good-solvent) statistics swell the coil relative to the
    ideal chain:

        R = b * N^nu,   with the Flory exponent nu = 3/5 in 3D (~0.588).

    Known value (verified): the exponent recovered from R(N) over a range of
    N equals nu (~0.6), distinctly larger than the ideal-chain value 0.5.
    """
    if segments < 1:
        raise ValueError("segments (N) must be >= 1")
    if bond_length <= 0:
        raise ValueError("bond_length must be positive")
    r = bond_length * segments ** exponent
    # Recover the exponent from two sizes to demonstrate the scaling law.
    n2 = 2 * segments
    r2 = bond_length * n2 ** exponent
    recovered = float(np.log(r2 / r) / np.log(n2 / segments))
    return {
        "segments": int(segments),
        "bond_length": float(bond_length),
        "flory_radius": float(r),
        "flory_exponent": float(exponent),
        "recovered_exponent": recovered,
    }


# 3. MARK-HOUWINK INTRINSIC VISCOSITY ----------------------------------------
def mark_houwink(*, molar_mass: float, k: float, a: float) -> dict:
    """Mark-Houwink-Sakurada intrinsic viscosity.

        [eta] = K * M^a

    where ``K`` and ``a`` are empirical, polymer/solvent/temperature-specific
    constants. The exponent ``a`` reflects coil conformation: a = 0.5 in a
    theta solvent, 0.5 < a < 0.8 for flexible random coils in a good solvent,
    a -> 1+ for rigid rods.

    Known value (verified): for atactic polystyrene in tetrahydrofuran at 25 C
    (K = 1.14e-2 mL/g, a = 0.716) a sample of M = 1.0e5 g/mol gives
    [eta] ~ 43.3 mL/g; the exponent recovered from two molar masses equals a.
    """
    if molar_mass <= 0:
        raise ValueError("molar_mass must be positive")
    if k <= 0:
        raise ValueError("K must be positive")
    eta = k * molar_mass ** a
    # Recover the exponent from a second molar mass to prove the power law.
    m2 = 2.0 * molar_mass
    eta2 = k * m2 ** a
    recovered = float(np.log(eta2 / eta) / np.log(m2 / molar_mass))
    return {
        "molar_mass": float(molar_mass),
        "K": float(k),
        "a": float(a),
        "intrinsic_viscosity": float(eta),
        "recovered_exponent": recovered,
    }


# 4. FLORY-HUGGINS FREE ENERGY OF MIXING -------------------------------------
def flory_huggins(
    *,
    volume_fraction: float,
    chi: float,
    n1: int = 1,
    n2: int = 1,
) -> dict:
    """Flory-Huggins free energy of mixing (per lattice site, in units of kT).

        dG_mix / (kT) = (phi1/N1) ln phi1 + (phi2/N2) ln phi2 + chi phi1 phi2

    with phi2 = 1 - phi1. The critical interaction parameter (consolute point)
    for degrees of polymerization N1, N2 is

        chi_c = 0.5 * (1/sqrt(N1) + 1/sqrt(N2))^2.

    Known value (verified): for a symmetric small-molecule blend (N1 = N2 = 1)
    chi_c = 2; the mixture is unstable (negative curvature of dG_mix at the
    symmetric composition phi = 1/2) and phase-separates when chi > 2.
    """
    phi1 = volume_fraction
    if not 0.0 < phi1 < 1.0:
        raise ValueError("volume_fraction must be in (0,1)")
    if n1 < 1 or n2 < 1:
        raise ValueError("degrees of polymerization must be >= 1")
    phi2 = 1.0 - phi1
    dg_over_kt = (
        (phi1 / n1) * np.log(phi1)
        + (phi2 / n2) * np.log(phi2)
        + chi * phi1 * phi2
    )
    # Second derivative w.r.t. phi1 of dG/kT; <0 => locally unstable (spinodal).
    d2 = 1.0 / (n1 * phi1) + 1.0 / (n2 * phi2) - 2.0 * chi
    chi_c = 0.5 * (1.0 / np.sqrt(n1) + 1.0 / np.sqrt(n2)) ** 2
    return {
        "volume_fraction": float(phi1),
        "chi": float(chi),
        "free_energy_over_kt": float(dg_over_kt),
        "d2_free_energy": float(d2),
        "critical_chi": float(chi_c),
        "phase_separates": bool(d2 < 0.0),
    }


# 5. RUBBER ELASTICITY --------------------------------------------------------
def rubber_elastic(
    *,
    stretch: float,
    chain_density: float,
    temperature_k: float,
) -> dict:
    """Affine-network rubber elasticity (entropy elasticity).

    For uniaxial extension at stretch ratio ``lambda`` of an incompressible
    affine network with chain (crosslink-strand) number density ``n`` the
    nominal (engineering) stress is

        sigma = n k T (lambda - 1/lambda^2).

    Known value (verified): sigma = 0 at lambda = 1 (no force at rest length);
    sigma > 0 in extension (lambda > 1) and sigma < 0 in compression
    (lambda < 1). The small-strain Young's modulus is E = 3 n k T.
    """
    if stretch <= 0:
        raise ValueError("stretch (lambda) must be positive")
    if chain_density < 0:
        raise ValueError("chain_density must be non-negative")
    if temperature_k <= 0:
        raise ValueError("temperature must be positive")
    nkt = chain_density * K_B * temperature_k
    sigma = nkt * (stretch - 1.0 / stretch ** 2)
    youngs_modulus = 3.0 * nkt  # small-strain limit E = 3nkT
    return {
        "stretch": float(stretch),
        "nkt_pa": float(nkt),
        "nominal_stress_pa": float(sigma),
        "youngs_modulus_pa": float(youngs_modulus),
    }


# 6. WLF TIME-TEMPERATURE SUPERPOSITION --------------------------------------
def wlf_shift(
    *,
    temperature_k: float,
    reference_temperature_k: float,
    c1: float = WLF_C1_UNIVERSAL,
    c2: float = WLF_C2_UNIVERSAL,
) -> dict:
    """Williams-Landel-Ferry (WLF) time-temperature superposition shift factor.

        log10(aT) = -C1 (T - Tref) / (C2 + (T - Tref))

    where C1, C2 are material constants; referenced to Tg the "universal"
    values are C1 = 17.44 and C2 = 51.6 K, valid for Tg < T < Tg + 100 K.

    Known value (verified): aT = 1 (log aT = 0) at T = Tref, and at
    T = Tref + C2 the shift is log10(aT) = -C1/2 = -8.72 with the universal
    constants. aT < 1 (faster dynamics) above Tref, aT > 1 below.
    """
    if temperature_k <= 0 or reference_temperature_k <= 0:
        raise ValueError("temperatures must be positive")
    dt = temperature_k - reference_temperature_k
    denom = c2 + dt
    if denom == 0:
        raise ValueError("C2 + (T - Tref) must be nonzero")
    log_aT = -c1 * dt / denom
    return {
        "temperature_k": float(temperature_k),
        "reference_temperature_k": float(reference_temperature_k),
        "c1": float(c1),
        "c2": float(c2),
        "log10_shift_factor": float(log_aT),
        "shift_factor": float(10.0 ** log_aT),
    }


# 7. REPTATION DIFFUSION ------------------------------------------------------
def reptation_diffusion(*, segments: int, d0: float = 1.0) -> dict:
    """Reptation (de Gennes / Doi-Edwards) centre-of-mass self-diffusion.

    An entangled linear chain diffuses by reptation along its confining tube;
    the centre-of-mass diffusion coefficient scales as

        D = D0 * N^-2

    (in contrast to the unentangled Rouse result D ~ N^-1).

    Known value (verified): D scales as N^-2; multiplying N by 10 reduces D by
    a factor of 100. The recovered exponent is -2.
    """
    if segments < 1:
        raise ValueError("segments (N) must be >= 1")
    if d0 <= 0:
        raise ValueError("d0 must be positive")
    d = d0 * float(segments) ** (-2.0)
    n2 = 10 * segments
    d2 = d0 * float(n2) ** (-2.0)
    recovered = float(np.log(d2 / d) / np.log(n2 / segments))
    return {
        "segments": int(segments),
        "diffusion_coefficient": float(d),
        "scaling_exponent": -2.0,
        "recovered_exponent": recovered,
    }


# 8. GLASS TRANSITION (FOX EQUATION) -----------------------------------------
def glass_transition(
    *,
    weight_fraction_1: float,
    tg1_k: float,
    tg2_k: float,
) -> dict:
    """Fox equation for the glass transition temperature of a miscible blend.

        1/Tg = w1/Tg1 + w2/Tg2,    w2 = 1 - w1

    where w1, w2 are weight fractions and Tg1, Tg2 the component glass
    transition temperatures.

    Known value (verified): a 50/50 (by weight) blend of PMMA (Tg1 = 378 K)
    and poly(vinyl acetate) (Tg2 = 305 K) gives Tg ~ 337.5 K, which lies
    strictly between the two component Tg's (and below the linear average,
    337.5 < 341.5).
    """
    w1 = weight_fraction_1
    if not 0.0 <= w1 <= 1.0:
        raise ValueError("weight_fraction_1 must be in [0,1]")
    if tg1_k <= 0 or tg2_k <= 0:
        raise ValueError("glass transition temperatures must be positive")
    w2 = 1.0 - w1
    inv_tg = w1 / tg1_k + w2 / tg2_k
    tg = 1.0 / inv_tg
    linear = w1 * tg1_k + w2 * tg2_k  # rule-of-mixtures (for comparison)
    return {
        "weight_fraction_1": float(w1),
        "tg1_k": float(tg1_k),
        "tg2_k": float(tg2_k),
        "tg_blend_k": float(tg),
        "linear_average_k": float(linear),
    }
