"""Authoritative physical constants (SI), matching the compendium's
"Constants, units and dimensional reference" section.

These are the *real* CODATA/SI values. They define the world's limits: the
speed of light caps velocity, g sets fall, k_B/R drive thermodynamics, etc.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Constant:
    symbol: str
    name: str
    value: float
    unit: str


CONSTANTS: dict[str, Constant] = {
    "c": Constant("c", "Speed of light in vacuum", 299_792_458.0, "m/s"),
    "G": Constant("G", "Newtonian gravitation constant", 6.674_30e-11, "m^3 kg^-1 s^-2"),
    "g": Constant("g", "Standard gravity (Earth surface)", 9.806_65, "m/s^2"),
    "h": Constant("h", "Planck constant", 6.626_070_15e-34, "J s"),
    "hbar": Constant("hbar", "Reduced Planck constant", 1.054_571_817e-34, "J s"),
    "e": Constant("e", "Elementary charge", 1.602_176_634e-19, "C"),
    "k_B": Constant("k_B", "Boltzmann constant", 1.380_649e-23, "J/K"),
    "N_A": Constant("N_A", "Avogadro constant", 6.022_140_76e23, "1/mol"),
    "R": Constant("R", "Molar gas constant", 8.314_462_618, "J mol^-1 K^-1"),
    "sigma": Constant("sigma", "Stefan-Boltzmann constant", 5.670_374_419e-8, "W m^-2 K^-4"),
    "epsilon_0": Constant("epsilon_0", "Vacuum permittivity", 8.854_187_8128e-12, "F/m"),
    "mu_0": Constant("mu_0", "Vacuum permeability", 1.256_637_062_12e-6, "N/A^2"),
    "k_e": Constant("k_e", "Coulomb constant", 8.987_551_792_3e9, "N m^2 C^-2"),
    "m_e": Constant("m_e", "Electron mass", 9.109_383_7015e-31, "kg"),
    "m_p": Constant("m_p", "Proton mass", 1.672_621_923_69e-27, "kg"),
    "atm": Constant("atm", "Standard atmosphere", 101_325.0, "Pa"),
    "M_earth": Constant("M_earth", "Earth mass", 5.972e24, "kg"),
    "R_earth": Constant("R_earth", "Earth mean radius", 6.371e6, "m"),
}


# Convenience scalar accessors used across the engine.
C = CONSTANTS["c"].value
G = CONSTANTS["G"].value
GRAV = CONSTANTS["g"].value
H = CONSTANTS["h"].value
HBAR = CONSTANTS["hbar"].value
K_B = CONSTANTS["k_B"].value
R_GAS = CONSTANTS["R"].value
K_E = CONSTANTS["k_e"].value
PI = math.pi


def as_dicts() -> list[dict]:
    return [
        {"symbol": c.symbol, "name": c.name, "value": c.value, "unit": c.unit}
        for c in CONSTANTS.values()
    ]
