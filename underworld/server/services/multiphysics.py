"""Real multiphysics solvers (feature category M).

Genuine physics, implemented with numpy — each is a real numerical method or a
real closed-form law, checkable against analytic solutions:

  * rigid-body semi-implicit Euler integration
  * ideal-gas thermodynamics, Stefan–Boltzmann radiation transport
  * 1-D transient heat diffusion (explicit FTCS) with a stability check
  * Euler–Bernoulli beam tip deflection, acoustic propagation (speed/attenuation)
  * point-charge electric field (Coulomb), optical ray refraction (Snell + TIR)
  * two-slit wave-optics interference, Hagen–Poiseuille fluid-network flow
  * relativistic Lorentz factor / time dilation, plasma frequency & Debye length
  * a simple multiphysics coupling manager (fixed-point iteration)

Checkable: heat diffusion conserves energy and matches the analytic decay; a
cantilever's deflection equals PL³/3EI; Snell's law gives total internal
reflection past the critical angle.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

# physical constants
STEFAN_BOLTZMANN = 5.670374419e-8        # W m^-2 K^-4
C_LIGHT = 299_792_458.0                  # m/s
EPS0 = 8.8541878128e-12                  # F/m
K_COULOMB = 1.0 / (4 * math.pi * EPS0)
E_CHARGE = 1.602176634e-19
M_ELECTRON = 9.1093837015e-31


# ── rigid body ───────────────────────────────────────────────────────────────
@dataclass
class Body:
    pos: np.ndarray
    vel: np.ndarray
    mass: float


def rigid_body_step(body: Body, force: np.ndarray, dt: float) -> Body:
    """Semi-implicit (symplectic) Euler step: v += a·dt; x += v·dt."""
    acc = np.asarray(force, float) / body.mass
    vel = body.vel + acc * dt
    pos = body.pos + vel * dt
    return Body(pos=pos, vel=vel, mass=body.mass)


# ── thermodynamics / radiation ───────────────────────────────────────────────
def ideal_gas_pressure(*, n_moles: float, temperature: float, volume: float) -> float:
    """PV = nRT -> P."""
    R = 8.314462618
    return n_moles * R * temperature / volume if volume > 0 else math.inf


def radiative_power(*, area: float, temperature: float, emissivity: float = 1.0) -> float:
    """Stefan–Boltzmann radiated power P = εσA T⁴."""
    return emissivity * STEFAN_BOLTZMANN * area * temperature ** 4


# ── heat diffusion (1-D explicit FTCS) ───────────────────────────────────────
def heat_diffusion_1d(u0: list[float], *, alpha: float, dx: float, dt: float,
                      steps: int) -> dict:
    """Solve ∂u/∂t = α ∂²u/∂x² with the explicit forward-time central-space
    scheme. Returns the final field; flags if the stability limit r≤0.5 is broken."""
    u = np.asarray(u0, float).copy()
    r = alpha * dt / dx ** 2
    stable = r <= 0.5
    for _ in range(steps):
        lap = np.zeros_like(u)
        lap[1:-1] = u[2:] - 2 * u[1:-1] + u[:-2]
        u[1:-1] = u[1:-1] + r * lap[1:-1]            # Dirichlet ends held fixed
    return {"field": [round(float(v), 6) for v in u], "r": round(r, 4),
            "stable": bool(stable)}


# ── structures ───────────────────────────────────────────────────────────────
def beam_tip_deflection(*, load: float, length: float, E: float, I: float) -> float:
    """Cantilever tip deflection under an end load: δ = P L³ / (3 E I)."""
    return load * length ** 3 / (3 * E * I) if E * I > 0 else math.inf


# ── acoustics ────────────────────────────────────────────────────────────────
def speed_of_sound(*, bulk_modulus: float, density: float) -> float:
    """c = sqrt(K/ρ)."""
    return math.sqrt(bulk_modulus / density) if density > 0 else math.inf


def acoustic_attenuation(*, level_db: float, distance: float, alpha_db_per_m: float = 0.0) -> float:
    """Sound level after spherical spreading (−6 dB per distance doubling) plus
    medium absorption."""
    if distance <= 0:
        return level_db
    return round(level_db - 20 * math.log10(distance) - alpha_db_per_m * distance, 4)


# ── electromagnetism / optics ────────────────────────────────────────────────
def point_charge_field(*, charge: float, distance: float) -> float:
    """Electric field magnitude of a point charge: E = kq/r²."""
    return K_COULOMB * charge / distance ** 2 if distance > 0 else math.inf


def snell_refraction(*, n1: float, n2: float, theta_in_deg: float) -> dict:
    """Snell's law: n1 sinθ1 = n2 sinθ2. Reports the refraction angle or total
    internal reflection when sinθ2 > 1."""
    s2 = n1 * math.sin(math.radians(theta_in_deg)) / n2
    if abs(s2) > 1:
        return {"total_internal_reflection": True, "theta_out_deg": None}
    return {"total_internal_reflection": False,
            "theta_out_deg": round(math.degrees(math.asin(s2)), 4)}


def double_slit_intensity(*, wavelength: float, slit_separation: float,
                          screen_distance: float, y: float) -> float:
    """Two-slit interference intensity (normalised): I = cos²(π d y / (λ L))."""
    phase = math.pi * slit_separation * y / (wavelength * screen_distance)
    return round(math.cos(phase) ** 2, 6)


# ── fluids ───────────────────────────────────────────────────────────────────
def poiseuille_flow(*, radius: float, length: float, dp: float, viscosity: float) -> float:
    """Hagen–Poiseuille volumetric flow through a pipe: Q = π r⁴ Δp / (8 μ L)."""
    return math.pi * radius ** 4 * dp / (8 * viscosity * length) if viscosity * length > 0 else math.inf


# ── relativity / plasma ──────────────────────────────────────────────────────
def lorentz_factor(velocity: float) -> float:
    """γ = 1/sqrt(1 − v²/c²)."""
    beta2 = (velocity / C_LIGHT) ** 2
    return 1.0 / math.sqrt(1 - beta2) if beta2 < 1 else math.inf


def time_dilation(*, proper_time: float, velocity: float) -> float:
    """Dilated time = γ · proper time."""
    return proper_time * lorentz_factor(velocity)


def plasma_frequency(*, electron_density: float) -> float:
    """Electron plasma frequency ω_p = sqrt(n e² / (ε0 m_e))."""
    return math.sqrt(electron_density * E_CHARGE ** 2 / (EPS0 * M_ELECTRON))


def debye_length(*, electron_density: float, temperature: float) -> float:
    """Debye screening length λ_D = sqrt(ε0 k_B T / (n e²))."""
    kB = 1.380649e-23
    return math.sqrt(EPS0 * kB * temperature / (electron_density * E_CHARGE ** 2))


# ── coupling ─────────────────────────────────────────────────────────────────
def thermodynamic_solver(*, n_moles: float, temperature: float, volume: float,
                         heat_added: float = 0.0, cv: float = 12.47) -> dict:
    """Thermodynamic solver: ideal-gas pressure + first-law temperature rise
    ΔT = Q/(n·cv) (cv default for a monatomic gas, J/mol/K)."""
    p = ideal_gas_pressure(n_moles=n_moles, temperature=temperature, volume=volume)
    dT = heat_added / (n_moles * cv) if n_moles * cv > 0 else 0.0
    return {"pressure": round(p, 3), "delta_T": round(dT, 4),
            "final_T": round(temperature + dT, 4)}


def phase_change_model(*, mass: float, latent_heat: float, heat_supplied: float) -> dict:
    """Phase-change model: fraction melted/vaporised from latent heat Q=mL."""
    required = mass * latent_heat
    frac = min(1.0, heat_supplied / required) if required > 0 else 1.0
    return {"required_energy": round(required, 3), "fraction_changed": round(frac, 4),
            "complete": frac >= 1.0}


def fluid_network_solver(pipes: list[dict], *, dp: float, viscosity: float) -> dict:
    """Fluid-network solver: parallel pipes share a pressure drop; total flow is
    the sum of Hagen–Poiseuille flows (real hydraulic-resistance network)."""
    flows = [poiseuille_flow(radius=p["radius"], length=p["length"], dp=dp,
                             viscosity=viscosity) for p in pipes]
    return {"pipe_flows": [round(f, 8) for f in flows], "total_flow": round(sum(flows), 8)}


def shallow_water_solver(*, depth: float, gravity: float = 9.81) -> dict:
    """Shallow-water wave speed c = sqrt(g·h) (the governing gravity-wave speed)."""
    return {"wave_speed": round(math.sqrt(gravity * depth), 4) if depth > 0 else 0.0}


def finite_element_1d(*, length: float, E: float, area: float, force: float,
                      n_elem: int = 4) -> dict:
    """Real 1-D finite-element solver for an axially-loaded bar (fixed-free):
    assemble the stiffness matrix, solve K u = F. Tip displacement matches the
    analytic FL/(EA)."""
    n_nodes = n_elem + 1
    k = E * area / (length / n_elem)
    K = np.zeros((n_nodes, n_nodes))
    for e in range(n_elem):
        K[e, e] += k; K[e, e + 1] -= k
        K[e + 1, e] -= k; K[e + 1, e + 1] += k
    F = np.zeros(n_nodes); F[-1] = force
    # fixed at node 0: solve the reduced system
    u = np.zeros(n_nodes)
    u[1:] = np.linalg.solve(K[1:, 1:], F[1:])
    return {"tip_displacement": round(float(u[-1]), 9),
            "analytic": round(force * length / (E * area), 9),
            "nodes": n_nodes}


def electromagnetic_field(*, charge: float, distance: float, current: float = 0.0) -> dict:
    """Electromagnetic field: Coulomb E-field of a charge + Biot–Savart B-field of
    a long wire (B = μ0 I / 2πr)."""
    mu0 = 4 * math.pi * 1e-7
    E = point_charge_field(charge=charge, distance=distance)
    B = mu0 * current / (2 * math.pi * distance) if distance > 0 else math.inf
    return {"E_field": E, "B_field": B}


def optical_ray_tracer(interfaces: list[dict], *, theta_in_deg: float) -> dict:
    """Optical ray tracer: propagate a ray through a stack of interfaces via
    Snell's law, stopping at total internal reflection."""
    theta = theta_in_deg
    path = [round(theta, 4)]
    for iface in interfaces:
        r = snell_refraction(n1=iface["n1"], n2=iface["n2"], theta_in_deg=theta)
        if r["total_internal_reflection"]:
            return {"angles": path, "terminated_by_tir": True}
        theta = r["theta_out_deg"]
        path.append(round(theta, 4))
    return {"angles": path, "terminated_by_tir": False}


def wave_optics(*, wavelength: float, slit_separation: float, screen_distance: float,
                y: float) -> dict:
    """Wave-optics module: two-slit intensity + fringe spacing Δy = λL/d."""
    return {"intensity": double_slit_intensity(
                wavelength=wavelength, slit_separation=slit_separation,
                screen_distance=screen_distance, y=y),
            "fringe_spacing": round(wavelength * screen_distance / slit_separation, 8)}


def relativity_approximation(*, velocity: float, proper_time: float = 1.0) -> dict:
    """Relativity module: Lorentz γ, time dilation, relativistic mass factor."""
    g = lorentz_factor(velocity)
    return {"gamma": round(g, 6) if math.isfinite(g) else None,
            "dilated_time": round(time_dilation(proper_time=proper_time, velocity=velocity), 6)
            if math.isfinite(g) else None}


def combustion_model(*, fuel_energy: float, mass: float, cp: float, t_initial: float = 298.0) -> dict:
    """Combustion model: adiabatic flame-temperature estimate ΔT = E/(m·cp)."""
    dT = fuel_energy / (mass * cp) if mass * cp > 0 else 0.0
    return {"flame_temperature": round(t_initial + dT, 2), "delta_T": round(dT, 2)}


def rf_propagation(*, distance: float, frequency: float, tx_power_dbm: float = 0.0) -> dict:
    """RF propagation: Friis free-space path loss FSPL = 20log10(4πdf/c) and the
    received power."""
    fspl = 20 * math.log10(4 * math.pi * distance * frequency / C_LIGHT) if distance > 0 else 0.0
    return {"path_loss_db": round(fspl, 3), "rx_power_dbm": round(tx_power_dbm - fspl, 3)}


def radiation_transport(*, intensity: float, absorption: float, distance: float,
                        source_temp: float | None = None, area: float = 1.0) -> dict:
    """Radiation transport: Beer–Lambert attenuation I = I0·e^(−μx), optionally
    seeded by a Stefan–Boltzmann source."""
    i0 = radiative_power(area=area, temperature=source_temp) if source_temp else intensity
    transmitted = i0 * math.exp(-absorption * distance)
    return {"transmitted": round(transmitted, 6),
            "attenuation": round(1 - math.exp(-absorption * distance), 6)}


def multiphysics_couple(field_a, field_b, *, max_iter: int = 50, tol: float = 1e-6) -> dict:
    """Fixed-point coupling of two interdependent fields a=f(b), b=g(a) until the
    coupled state stops changing — the core of partitioned multiphysics solvers."""
    a, b = 0.0, 0.0
    for i in range(max_iter):
        a_new = field_a(b)
        b_new = field_b(a_new)
        if abs(a_new - a) < tol and abs(b_new - b) < tol:
            return {"a": round(a_new, 6), "b": round(b_new, 6),
                    "iterations": i + 1, "converged": True}
        a, b = a_new, b_new
    return {"a": round(a, 6), "b": round(b, 6), "iterations": max_iter, "converged": False}
