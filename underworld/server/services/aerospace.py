"""Astrodynamics / propulsion — NASA-grade orbital mechanics from the canonical
equations (researched: Tsiolkovsky, vis-viva, Hohmann transfer). Verified against
known values: Earth escape ≈11.2 km/s, LEO circular ≈7.7 km/s, LEO→GEO Hohmann
≈3.9 km/s. Sources: Tsiolkovsky/Hohmann/vis-viva (Wikipedia, USU MAE-5540).
"""
from __future__ import annotations

import math

MU_EARTH = 398600.4418          # km^3/s^2  (standard gravitational parameter)
R_EARTH = 6378.137              # km
G0 = 9.80665                    # m/s^2


def tsiolkovsky(*, isp_s: float, mass_initial: float, mass_final: float) -> dict:
    """Δv = Isp·g0·ln(m0/mf) — the rocket equation (propellant → delta-v)."""
    dv = isp_s * G0 * math.log(mass_initial / mass_final)
    return {"delta_v_ms": round(dv, 2), "delta_v_kms": round(dv / 1000, 4),
            "mass_ratio": round(mass_initial / mass_final, 4)}


def vis_viva(*, r_km: float, a_km: float, mu: float = MU_EARTH) -> dict:
    """Orbital speed at radius r on an orbit of semi-major axis a: v²=μ(2/r−1/a)."""
    v = math.sqrt(mu * (2 / r_km - 1 / a_km))
    return {"speed_kms": round(v, 4)}


def circular_velocity(*, r_km: float, mu: float = MU_EARTH) -> dict:
    return {"speed_kms": round(math.sqrt(mu / r_km), 4)}


def escape_velocity(*, r_km: float = R_EARTH, mu: float = MU_EARTH) -> dict:
    """v_esc = sqrt(2μ/r). At Earth's surface ≈ 11.19 km/s."""
    return {"escape_velocity_kms": round(math.sqrt(2 * mu / r_km), 4)}


def orbital_period(*, a_km: float, mu: float = MU_EARTH) -> dict:
    """Kepler's third law: T = 2π√(a³/μ)."""
    T = 2 * math.pi * math.sqrt(a_km ** 3 / mu)
    return {"period_s": round(T, 2), "period_min": round(T / 60, 3)}


def hohmann_transfer(*, r1_km: float, r2_km: float, mu: float = MU_EARTH) -> dict:
    """Minimum-energy two-burn transfer between coplanar circular orbits.
    LEO(6678)→GEO(42164) gives total Δv ≈ 3.9 km/s."""
    a_t = (r1_km + r2_km) / 2
    v1 = math.sqrt(mu / r1_km)
    v2 = math.sqrt(mu / r2_km)
    v_p = math.sqrt(mu * (2 / r1_km - 1 / a_t))     # transfer perigee speed
    v_a = math.sqrt(mu * (2 / r2_km - 1 / a_t))     # transfer apogee speed
    dv1 = abs(v_p - v1)
    dv2 = abs(v2 - v_a)
    t_transfer = math.pi * math.sqrt(a_t ** 3 / mu)
    return {"dv1_kms": round(dv1, 4), "dv2_kms": round(dv2, 4),
            "total_dv_kms": round(dv1 + dv2, 4),
            "transfer_time_hr": round(t_transfer / 3600, 3),
            "transfer_sma_km": round(a_t, 1)}


def launch_budget(*, payload_kg: float, dry_kg: float, propellant_kg: float,
                  isp_s: float = 300.0) -> dict:
    """Does a stage deliver enough Δv to reach LEO (~9.4 km/s incl. losses)?"""
    m0 = payload_kg + dry_kg + propellant_kg
    mf = payload_kg + dry_kg
    dv = tsiolkovsky(isp_s=isp_s, mass_initial=m0, mass_final=mf)["delta_v_kms"]
    return {"delta_v_kms": dv, "reaches_leo": dv >= 9.4, "payload_kg": payload_kg}
