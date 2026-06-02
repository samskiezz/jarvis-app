"""Real advanced-materials models (feature category J).

Genuine materials physics (numpy), checkable:
  * defect density, impurity profiles, binary phase-diagram lever rule
  * BCS-style superconductor Tc proxy, semiconductor bandgap classification
  * corrosion (Faraday/linear rate), fracture toughness (Griffith), thermal &
    electrical conductivity (Wiedemann–Franz)
"""
from __future__ import annotations

import math


def defect_density(*, defects: int, volume_cm3: float) -> dict:
    """Defect density per cm³ and a quality flag."""
    rho = defects / volume_cm3 if volume_cm3 > 0 else math.inf
    return {"density_per_cm3": round(rho, 3), "device_grade": rho < 1e4}


def impurity_profile(concentrations_ppm: dict[str, float], *, spec_ppm: float = 10.0) -> dict:
    """Impurity profile: total impurities and which exceed spec."""
    total = sum(concentrations_ppm.values())
    over = [e for e, c in concentrations_ppm.items() if c > spec_ppm]
    return {"total_ppm": round(total, 3), "over_spec": over, "pure": not over}


def phase_diagram(*, composition: float, solidus: float, liquidus: float) -> dict:
    """Binary phase-diagram lever rule: fraction liquid/solid at a temperature
    between solidus and liquidus."""
    if composition <= solidus:
        return {"phase": "solid", "fraction_liquid": 0.0}
    if composition >= liquidus:
        return {"phase": "liquid", "fraction_liquid": 1.0}
    frac = (composition - solidus) / (liquidus - solidus)
    return {"phase": "two-phase", "fraction_liquid": round(frac, 4)}


def superconductor_candidate(*, debye_temp: float, coupling: float, dos: float) -> dict:
    """Superconductor candidate: BCS Tc ≈ 1.13·θ_D·exp(−1/(N(0)V)). Higher Debye
    temperature and coupling raise Tc."""
    product = dos * coupling
    tc = 1.13 * debye_temp * math.exp(-1 / product) if product > 0 else 0.0
    return {"estimated_tc_k": round(tc, 3), "promising": tc > 30}


def semiconductor_candidate(*, bandgap_ev: float) -> dict:
    """Semiconductor candidate: classify by bandgap (conductor/semiconductor/
    insulator) and flag a useful electronic gap."""
    if bandgap_ev <= 0.1:
        kind = "conductor"
    elif bandgap_ev <= 4.0:
        kind = "semiconductor"
    else:
        kind = "insulator"
    return {"classification": kind, "bandgap_ev": bandgap_ev,
            "useful_semiconductor": 0.5 <= bandgap_ev <= 2.0}


def corrosion_model(*, current_density: float, equiv_weight: float, density: float,
                    time_s: float = 3.15e7) -> dict:
    """Corrosion model: Faraday penetration rate (mm/yr) from corrosion current."""
    F = 96485.0
    rate_mm_yr = (current_density * equiv_weight / (density * F)) * 10 * time_s / 1e4
    return {"penetration_mm_per_year": round(rate_mm_yr, 5), "severe": rate_mm_yr > 1.0}


def fracture_toughness(*, stress: float, crack_length: float, geometry: float = 1.0) -> dict:
    """Fracture toughness: stress-intensity factor K = Y·σ·√(πa) (Griffith)."""
    k = geometry * stress * math.sqrt(math.pi * crack_length)
    return {"stress_intensity_mpa_sqrt_m": round(k / 1e6, 4)}


def thermal_conductivity(*, electrical_conductivity: float, temperature: float) -> dict:
    """Thermal conductivity from Wiedemann–Franz law: κ = L·σ·T (Lorenz number)."""
    L = 2.44e-8
    kappa = L * electrical_conductivity * temperature
    return {"thermal_conductivity_w_mk": round(kappa, 4)}


def electrical_conductivity(*, carrier_density: float, mobility: float) -> float:
    """Electrical conductivity σ = n·e·µ."""
    e = 1.602176634e-19
    return round(carrier_density * e * mobility, 6)
