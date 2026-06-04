"""Tests for real statistical-thermodynamics methods.

Each test verifies a method against a KNOWN published value with an explicit
tolerance and a citation. Constants are CODATA via scipy.constants.
"""
import math

import pytest
from scipy import constants as sc

from underworld.server.services.methods_statmech import (
    boltzmann_distribution,
    partition_function,
    heat_capacity_solid,
    entropy_microstates,
    equipartition_energy,
    stefan_boltzmann_power,
    fermi_bose_occupancy,
    maxwell_boltzmann_speed,
)


# 1. BOLTZMANN DISTRIBUTION ---------------------------------------------------
def test_boltzmann_population_ratio():
    """KNOWN: two-level population ratio = exp(-dE/kT) for equal degeneracies.
    Source: Wikipedia, Boltzmann distribution.
    """
    dE = 1.0 * sc.e  # 1 eV gap
    T = 300.0
    r = boltzmann_distribution(energy_gap_j=dE, temperature_k=T)
    expected = math.exp(-dE / (sc.k * T))
    assert r["population_ratio"] == pytest.approx(expected, rel=1e-12)
    assert r["boltzmann_factor"] == pytest.approx(expected, rel=1e-12)
    # Fractions normalise to 1.
    assert r["fraction_lower"] + r["fraction_upper"] == pytest.approx(1.0, rel=1e-12)
    # Upper level far less populated for kT << dE.
    assert r["fraction_upper"] < r["fraction_lower"]


# 2. PARTITION FUNCTION & AVERAGE ENERGY -------------------------------------
def test_partition_function_high_T_limit():
    """KNOWN: a two-level system at high T (kT >> dE) has Z -> 2 and
    <E> -> dE/2 (both states equally likely).
    Source: Wikipedia, Partition function / two-state system.
    """
    dE = 1.0 * sc.e
    # High temperature: kT >> dE.
    T_high = dE / sc.k * 1.0e4
    r = partition_function(energy_gap_j=dE, temperature_k=T_high)
    assert r["partition_function"] == pytest.approx(2.0, rel=1e-3)
    assert r["average_energy_over_gap"] == pytest.approx(0.5, rel=1e-3)
    # Low temperature: Z -> 1, <E> -> 0.
    T_low = dE / sc.k * 1.0e-2
    lo = partition_function(energy_gap_j=dE, temperature_k=T_low)
    assert lo["partition_function"] == pytest.approx(1.0, abs=1e-6)
    assert lo["average_energy_j"] == pytest.approx(0.0, abs=1e-30)


# 3. EINSTEIN / DEBYE HEAT CAPACITY ------------------------------------------
def test_heat_capacity_dulong_petit_limit():
    """KNOWN: Einstein and Debye models both -> Dulong-Petit 3R ~ 24.94
    J/mol/K at high temperature. Source: Wikipedia, Dulong-Petit law;
    Einstein solid; Debye model.
    """
    assert 3.0 * sc.R == pytest.approx(24.94, abs=0.01)
    # High T >> theta for both models -> 3R.
    ein = heat_capacity_solid(
        temperature_k=10000.0, characteristic_temperature_k=300.0, model="einstein"
    )
    deb = heat_capacity_solid(
        temperature_k=10000.0, characteristic_temperature_k=300.0, model="debye"
    )
    assert ein["heat_capacity_j_per_mol_k"] == pytest.approx(24.94, abs=0.05)
    assert deb["heat_capacity_j_per_mol_k"] == pytest.approx(24.94, abs=0.05)
    assert ein["fraction_of_dulong_petit"] == pytest.approx(1.0, abs=2e-3)
    # Low T: heat capacity falls well below 3R (modes freeze out).
    cold = heat_capacity_solid(
        temperature_k=10.0, characteristic_temperature_k=300.0, model="einstein"
    )
    assert cold["heat_capacity_j_per_mol_k"] < 1.0


# 4. BOLTZMANN ENTROPY FROM MICROSTATES --------------------------------------
def test_entropy_microstates_k_ln_W():
    """KNOWN: S = k ln W; for W = 2, S = k ln 2 ~ 9.5699e-24 J/K; W = 1 -> 0.
    Source: Wikipedia, Boltzmann's entropy formula.
    """
    r = entropy_microstates(num_microstates=2)
    assert r["entropy_j_per_k"] == pytest.approx(sc.k * math.log(2), rel=1e-12)
    assert r["entropy_j_per_k"] == pytest.approx(9.5699e-24, rel=1e-3)
    assert r["entropy_per_kb"] == pytest.approx(math.log(2), rel=1e-12)
    one = entropy_microstates(num_microstates=1)
    assert one["entropy_j_per_k"] == pytest.approx(0.0, abs=1e-30)


# 5. EQUIPARTITION THEOREM ----------------------------------------------------
def test_equipartition_half_kT_per_dof():
    """KNOWN: each quadratic DOF carries 1/2 kT; monatomic gas (3 DOF) has
    3/2 kT per atom. Source: Wikipedia, Equipartition theorem.
    """
    T = 300.0
    one = equipartition_energy(temperature_k=T, degrees_of_freedom=1)
    assert one["energy_per_dof_j"] == pytest.approx(0.5 * sc.k * T, rel=1e-12)
    three = equipartition_energy(temperature_k=T, degrees_of_freedom=3)
    assert three["average_energy_j"] == pytest.approx(1.5 * sc.k * T, rel=1e-12)
    assert three["molar_energy_j_per_mol"] == pytest.approx(1.5 * sc.R * T, rel=1e-12)


# 6. PLANCK BLACKBODY -> STEFAN-BOLTZMANN -------------------------------------
def test_stefan_boltzmann_sigma():
    """KNOWN: sigma = 2 pi^5 k^4/(15 h^3 c^2) = 5.6703744e-8 W/m^2/K^4,
    matching CODATA. Source: Wikipedia, Stefan-Boltzmann law.
    """
    r = stefan_boltzmann_power(temperature_k=300.0)
    assert r["sigma_w_per_m2_k4"] == pytest.approx(5.670374419e-8, rel=1e-7)
    assert r["sigma_w_per_m2_k4"] == pytest.approx(sc.Stefan_Boltzmann, rel=1e-12)
    # P = sigma T^4 for unit blackbody area at 300 K.
    assert r["radiated_power_w"] == pytest.approx(
        sc.Stefan_Boltzmann * 300.0 ** 4, rel=1e-12
    )


# 7. FERMI-DIRAC vs BOSE-EINSTEIN ---------------------------------------------
def test_fermi_bose_limits():
    """KNOWN: for (E-mu)/kT >> 1 both FD and BE -> Maxwell-Boltzmann exp(-x);
    FD <= 1 and FD(E=mu) = 1/2. Source: Wikipedia, Fermi-Dirac / Bose-Einstein
    statistics.
    """
    T = 300.0
    mu = 0.0
    # Dilute limit: x = 10 -> both approach exp(-x).
    E_hi = 10.0 * sc.k * T
    hi = fermi_bose_occupancy(energy_j=E_hi, chemical_potential_j=mu, temperature_k=T)
    assert hi["reduced_energy"] == pytest.approx(10.0, rel=1e-12)
    assert hi["fermi_dirac"] == pytest.approx(hi["maxwell_boltzmann"], rel=1e-3)
    assert hi["bose_einstein"] == pytest.approx(hi["maxwell_boltzmann"], rel=1e-3)
    # Fermi-Dirac never exceeds 1.
    assert hi["fermi_dirac"] <= 1.0
    # At E = mu, FD = 1/2 exactly.
    at_mu = fermi_bose_occupancy(energy_j=mu, chemical_potential_j=mu, temperature_k=T)
    assert at_mu["fermi_dirac"] == pytest.approx(0.5, rel=1e-12)


# 8. MAXWELL-BOLTZMANN MEAN SPEED --------------------------------------------
def test_maxwell_boltzmann_n2_mean_speed():
    """KNOWN: nitrogen (N2, M = 28.0134 g/mol) at 300 K has mean speed
    v_avg = sqrt(8kT/pi m) ~ 476 m/s. Source: Wikipedia, Maxwell-Boltzmann
    distribution.
    """
    r = maxwell_boltzmann_speed(temperature_k=300.0, molar_mass_kg_per_mol=28.0134e-3)
    assert r["mean_speed_m_s"] == pytest.approx(476.0, abs=1.0)
    # Ordering of characteristic speeds: v_p < v_avg < v_rms.
    assert r["most_probable_speed_m_s"] < r["mean_speed_m_s"] < r["rms_speed_m_s"]
    # Closed-form check against sqrt(8kT/pi m).
    m = 28.0134e-3 / sc.N_A
    assert r["mean_speed_m_s"] == pytest.approx(
        math.sqrt(8.0 * sc.k * 300.0 / (math.pi * m)), rel=1e-12
    )
