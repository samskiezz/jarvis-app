"""Real statistical-thermodynamics simulation methods.

Eight named, real statistical-mechanics methods, each computed from its
canonical published formula and each verified in the test suite against a
KNOWN published value:

  1. boltzmann_distribution    — two-level populations; population ratio
                                 n_upper/n_lower = (g_u/g_l) exp(-dE/kT)
                                 (verify ratio = exp(-dE/kT))
  2. partition_function        — partition function Z and average energy
                                 <E> of a two-level system; verify the
                                 high-T limit <E> -> dE/2 and Z -> 2
  3. heat_capacity_solid       — Einstein/Debye molar heat capacity of a
                                 solid; verify the high-T Dulong-Petit limit
                                 C_v -> 3R ~ 24.94 J/mol/K
  4. entropy_microstates       — Boltzmann entropy S = k ln(W) from a number
                                 of equiprobable microstates (verify k ln 2)
  5. equipartition_energy      — equipartition theorem, 1/2 kT per quadratic
                                 degree of freedom (verify 3/2 kT, etc.)
  6. stefan_boltzmann_power    — Planck blackbody integrated to total emitted
                                 power; verify sigma = 2 pi^5 k^4/(15 h^3 c^2)
                                 = 5.6703744e-8 W/m^2/K^4
  7. fermi_bose_occupancy      — Fermi-Dirac vs Bose-Einstein mean occupancy;
                                 verify both -> Maxwell-Boltzmann exp(-x) for
                                 (E-mu)/kT >> 1, and FD <= 1
  8. maxwell_boltzmann_speed   — Maxwell-Boltzmann mean speed
                                 v_avg = sqrt(8 k T / (pi m)); verify N2 at
                                 300 K ~ 476 m/s

All constants are CODATA published values via scipy.constants.

Sources:
  - Boltzmann distribution / two-level populations:
    https://en.wikipedia.org/wiki/Boltzmann_distribution
  - Partition function, two-level system, average energy:
    https://en.wikipedia.org/wiki/Partition_function_(statistical_mechanics)
    https://en.wikipedia.org/wiki/Two-state_quantum_system
  - Einstein / Debye heat capacity, Dulong-Petit law:
    https://en.wikipedia.org/wiki/Einstein_solid
    https://en.wikipedia.org/wiki/Debye_model
    https://en.wikipedia.org/wiki/Dulong%E2%80%93Petit_law
  - Boltzmann entropy S = k ln W:
    https://en.wikipedia.org/wiki/Boltzmann%27s_entropy_formula
  - Equipartition theorem:
    https://en.wikipedia.org/wiki/Equipartition_theorem
  - Planck's law and Stefan-Boltzmann law:
    https://en.wikipedia.org/wiki/Stefan%E2%80%93Boltzmann_law
    https://en.wikipedia.org/wiki/Planck%27s_law
  - Fermi-Dirac and Bose-Einstein statistics:
    https://en.wikipedia.org/wiki/Fermi%E2%80%93Dirac_statistics
    https://en.wikipedia.org/wiki/Bose%E2%80%93Einstein_statistics
  - Maxwell-Boltzmann distribution (mean speed):
    https://en.wikipedia.org/wiki/Maxwell%E2%80%93Boltzmann_distribution
"""
from __future__ import annotations

import numpy as np
from scipy import constants as sc
from scipy import integrate

# --- Published physical constants (CODATA via scipy.constants) --------------
K_B = sc.k                  # Boltzmann constant, 1.380649e-23 J/K
H = sc.h                    # Planck constant, 6.62607015e-34 J*s
C_LIGHT = sc.c              # speed of light, 299792458 m/s
R_GAS = sc.R                # molar gas constant, 8.314462618 J/mol/K
N_A = sc.N_A                # Avogadro constant, 6.02214076e23 /mol
E_CHARGE = sc.e             # elementary charge, 1.602176634e-19 C
STEFAN_BOLTZMANN = sc.Stefan_Boltzmann  # 5.670374419e-8 W/m^2/K^4

# Dulong-Petit value 3R ~ 24.94 J/mol/K
DULONG_PETIT = 3.0 * R_GAS


# 1. BOLTZMANN DISTRIBUTION ---------------------------------------------------
def boltzmann_distribution(
    *,
    energy_gap_j: float,
    temperature_k: float,
    degeneracy_lower: float = 1.0,
    degeneracy_upper: float = 1.0,
) -> dict:
    """Two-level Boltzmann population ratio.

    For two levels separated by ``dE`` at temperature ``T`` the ratio of
    occupation numbers is

        n_upper / n_lower = (g_u / g_l) exp(-dE / (k T)).

    With equal degeneracies this reduces to the canonical Boltzmann factor
    exp(-dE/kT). Fractional populations follow from normalisation.

    Known value (verified): population_ratio == exp(-dE/kT) when the
    degeneracies are equal.
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive")
    beta = 1.0 / (K_B * temperature_k)
    boltzmann_factor = np.exp(-energy_gap_j * beta)
    ratio = (degeneracy_upper / degeneracy_lower) * boltzmann_factor
    z = degeneracy_lower + degeneracy_upper * boltzmann_factor
    frac_lower = degeneracy_lower / z
    frac_upper = degeneracy_upper * boltzmann_factor / z
    return {
        "boltzmann_factor": float(boltzmann_factor),
        "population_ratio": float(ratio),
        "fraction_lower": float(frac_lower),
        "fraction_upper": float(frac_upper),
    }


# 2. PARTITION FUNCTION & AVERAGE ENERGY -------------------------------------
def partition_function(*, energy_gap_j: float, temperature_k: float) -> dict:
    """Canonical partition function and average energy of a two-level system.

    Taking the ground level at energy 0 and the excited level at ``dE`` (both
    non-degenerate):

        Z = 1 + exp(-dE / kT),
        <E> = dE exp(-dE/kT) / (1 + exp(-dE/kT)).

    Known value (verified): in the high-temperature limit (kT >> dE) the two
    states become equally likely, so Z -> 2 and <E> -> dE/2.
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive")
    beta = 1.0 / (K_B * temperature_k)
    factor = np.exp(-energy_gap_j * beta)
    z = 1.0 + factor
    avg_energy = energy_gap_j * factor / z
    return {
        "partition_function": float(z),
        "average_energy_j": float(avg_energy),
        "average_energy_over_gap": float(avg_energy / energy_gap_j),
    }


# 3. EINSTEIN / DEBYE HEAT CAPACITY ------------------------------------------
def heat_capacity_solid(
    *,
    temperature_k: float,
    characteristic_temperature_k: float,
    model: str = "einstein",
) -> dict:
    """Molar heat capacity of a crystalline solid (Einstein or Debye model).

    Einstein model (characteristic temperature = Einstein temperature
    theta_E):

        C_v = 3 R (theta_E/T)^2 exp(theta_E/T) / (exp(theta_E/T) - 1)^2.

    Debye model (characteristic temperature = Debye temperature theta_D):

        C_v = 9 R (T/theta_D)^3 \\int_0^{theta_D/T} x^4 e^x / (e^x - 1)^2 dx.

    Known value (verified): both models reduce to the classical Dulong-Petit
    law C_v -> 3R ~ 24.94 J/mol/K at high temperature (T >> theta).
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive")
    if characteristic_temperature_k <= 0:
        raise ValueError("characteristic temperature must be positive")
    m = model.lower()
    if m == "einstein":
        x = characteristic_temperature_k / temperature_k
        ex = np.exp(x)
        cv = 3.0 * R_GAS * (x ** 2) * ex / (ex - 1.0) ** 2
    elif m == "debye":
        xd = characteristic_temperature_k / temperature_k

        def integrand(x: float) -> float:
            ex = np.exp(x)
            return (x ** 4) * ex / (ex - 1.0) ** 2

        integral, _ = integrate.quad(integrand, 0.0, xd)
        cv = 9.0 * R_GAS * (temperature_k / characteristic_temperature_k) ** 3 * integral
    else:
        raise ValueError("model must be 'einstein' or 'debye'")
    return {
        "model": m,
        "heat_capacity_j_per_mol_k": float(cv),
        "dulong_petit_3R": float(DULONG_PETIT),
        "fraction_of_dulong_petit": float(cv / DULONG_PETIT),
    }


# 4. BOLTZMANN ENTROPY FROM MICROSTATES --------------------------------------
def entropy_microstates(*, num_microstates: float) -> dict:
    """Boltzmann entropy from a number of equiprobable microstates:

        S = k ln(W).

    Known value (verified): for W = 2 microstates S = k ln 2
    ~ 9.5699e-24 J/K; for one microstate (W = 1) S = 0.
    """
    if num_microstates < 1:
        raise ValueError("number of microstates must be >= 1")
    s = K_B * np.log(num_microstates)
    return {
        "num_microstates": float(num_microstates),
        "entropy_j_per_k": float(s),
        "entropy_per_kb": float(np.log(num_microstates)),  # = ln W
        "molar_entropy_j_per_mol_k": float(R_GAS * np.log(num_microstates)),
    }


# 5. EQUIPARTITION THEOREM ----------------------------------------------------
def equipartition_energy(
    *,
    temperature_k: float,
    degrees_of_freedom: int = 3,
) -> dict:
    """Equipartition theorem: each quadratic degree of freedom carries an
    average energy of 1/2 k T.

        <E> = (f/2) k T   (per particle),
        <E>_molar = (f/2) R T.

    Known value (verified): a monatomic ideal gas (f = 3 translational DOF)
    has <E> = 3/2 k T per atom; the energy per single DOF is exactly 1/2 k T.
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive")
    if degrees_of_freedom < 1:
        raise ValueError("degrees of freedom must be >= 1")
    energy_per_dof = 0.5 * K_B * temperature_k
    total = degrees_of_freedom * energy_per_dof
    return {
        "energy_per_dof_j": float(energy_per_dof),
        "average_energy_j": float(total),
        "molar_energy_j_per_mol": float(degrees_of_freedom * 0.5 * R_GAS * temperature_k),
    }


# 6. PLANCK BLACKBODY -> STEFAN-BOLTZMANN POWER ------------------------------
def stefan_boltzmann_power(
    *,
    temperature_k: float,
    area_m2: float = 1.0,
    emissivity: float = 1.0,
) -> dict:
    """Total power radiated by a blackbody, obtained by integrating Planck's
    law over all frequencies.

    Integrating the Planck spectral radiance over frequency and solid angle
    yields the Stefan-Boltzmann law

        P = epsilon sigma A T^4,   with
        sigma = 2 pi^5 k^4 / (15 h^3 c^2).

    Here ``sigma`` is computed from first principles via the published closed
    form (equivalently the integral int_0^inf x^3/(e^x-1) dx = pi^4/15).

    Known value (verified): sigma = 5.6703744e-8 W/m^2/K^4, matching the
    CODATA Stefan-Boltzmann constant.
    """
    if temperature_k < 0:
        raise ValueError("temperature must be non-negative")
    sigma = 2.0 * np.pi ** 5 * K_B ** 4 / (15.0 * H ** 3 * C_LIGHT ** 2)
    power = emissivity * sigma * area_m2 * temperature_k ** 4
    return {
        "sigma_w_per_m2_k4": float(sigma),
        "sigma_codata": float(STEFAN_BOLTZMANN),
        "radiated_power_w": float(power),
    }


# 7. FERMI-DIRAC vs BOSE-EINSTEIN OCCUPANCY ----------------------------------
def fermi_bose_occupancy(
    *,
    energy_j: float,
    chemical_potential_j: float,
    temperature_k: float,
) -> dict:
    """Mean occupation numbers for Fermi-Dirac and Bose-Einstein statistics.

    With x = (E - mu) / (k T):

        Fermi-Dirac:    n_FD = 1 / (exp(x) + 1),
        Bose-Einstein:  n_BE = 1 / (exp(x) - 1)   (requires x > 0),
        Maxwell-Boltzmann (classical):  n_MB = exp(-x).

    Known value (verified): for x >> 1 (dilute / non-degenerate limit) both
    n_FD and n_BE approach the Maxwell-Boltzmann value exp(-x); n_FD is always
    <= 1 (Pauli exclusion) and at E = mu, n_FD = 1/2 exactly.
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive")
    x = (energy_j - chemical_potential_j) / (K_B * temperature_k)
    fd = 1.0 / (np.exp(x) + 1.0)
    mb = np.exp(-x)
    be = None if x <= 0 else 1.0 / (np.exp(x) - 1.0)
    result = {
        "reduced_energy": float(x),
        "fermi_dirac": float(fd),
        "maxwell_boltzmann": float(mb),
    }
    if be is not None:
        result["bose_einstein"] = float(be)
    return result


# 8. MAXWELL-BOLTZMANN MEAN SPEED --------------------------------------------
def maxwell_boltzmann_speed(
    *,
    temperature_k: float,
    molar_mass_kg_per_mol: float,
) -> dict:
    """Characteristic speeds of the Maxwell-Boltzmann speed distribution.

    For a particle of mass m = M/N_A at temperature T:

        mean speed         v_avg = sqrt(8 k T / (pi m)),
        most probable speed v_p  = sqrt(2 k T / m),
        rms speed          v_rms = sqrt(3 k T / m).

    Known value (verified): nitrogen (N2, M = 28.0134 g/mol) at 300 K has a
    mean speed of ~476 m/s.
    """
    if temperature_k <= 0:
        raise ValueError("temperature must be positive")
    if molar_mass_kg_per_mol <= 0:
        raise ValueError("molar mass must be positive")
    m = molar_mass_kg_per_mol / N_A
    v_avg = np.sqrt(8.0 * K_B * temperature_k / (np.pi * m))
    v_p = np.sqrt(2.0 * K_B * temperature_k / m)
    v_rms = np.sqrt(3.0 * K_B * temperature_k / m)
    return {
        "particle_mass_kg": float(m),
        "mean_speed_m_s": float(v_avg),
        "most_probable_speed_m_s": float(v_p),
        "rms_speed_m_s": float(v_rms),
    }
