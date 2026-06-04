"""NASA-grade fluid-dynamics & aerodynamics simulation methods.

Eight named, real fluid/aero methods, each computed from its canonical
published formula and each verified in the test suite against a KNOWN
published value:

  1. bernoulli_pressure        — incompressible energy conservation
                                 (p + 1/2 rho v^2 + rho g h = const)
  2. lift_coefficient_force    — aerodynamic lift  L = 1/2 rho v^2 S C_L
  3. drag_terminal_velocity    — drag force + terminal velocity of a sphere
                                 v_t = sqrt(2 m g / (rho A C_d))  (~85 m/s)
  4. reynolds_number           — Re = rho v D / mu; pipe transition Re ~ 2300
  5. blasius_boundary_layer    — laminar flat-plate layer  delta ~ 5 x / sqrt(Re_x)
  6. speed_of_sound_mach       — a = sqrt(gamma R T) ~ 343 m/s (air, 20 C); Mach
  7. normal_shock_relations    — Rankine-Hugoniot + Prandtl-Meyer
                                 (M=2, gamma=1.4 -> p2/p1 = 4.5, nu = 26.38 deg)
  8. hagen_poiseuille_flow     — laminar pipe flow rate  Q = pi dP r^4 / (8 mu L)

Sources: Wikipedia (Bernoulli's principle, Lift coefficient, Terminal velocity,
Reynolds number, Blasius boundary layer, Speed of sound, Normal shock tables,
Prandtl-Meyer function, Hagen-Poiseuille equation); NASA Glenn Research Center
Beginner's Guide to Aeronautics; standard compressible-flow / gas-dynamics tables.
"""
from __future__ import annotations

import numpy as np

# --- Published reference constants (SI) -------------------------------------
G0 = 9.80665                  # standard gravity, m/s^2
GAMMA_AIR = 1.4               # ratio of specific heats for air (diatomic)
R_SPECIFIC_AIR = 287.05       # specific gas constant for dry air, J/(kg*K)
RHO_AIR_SEALEVEL = 1.225      # ISA sea-level air density, kg/m^3
MU_AIR_20C = 1.81e-5          # dynamic viscosity of air at ~20 C, Pa*s
RHO_WATER = 1000.0            # density of water, kg/m^3
MU_WATER_20C = 1.002e-3       # dynamic viscosity of water at ~20 C, Pa*s


# 1. BERNOULLI EQUATION -------------------------------------------------------
def bernoulli_pressure(*, pressure1_pa: float, velocity1_ms: float,
                       velocity2_ms: float, density_kg_m3: float = RHO_AIR_SEALEVEL,
                       height1_m: float = 0.0, height2_m: float = 0.0) -> dict:
    """Bernoulli's equation for steady, incompressible, inviscid flow.

    p1 + 1/2 rho v1^2 + rho g h1 = p2 + 1/2 rho v2^2 + rho g h2

    Solving for the downstream static pressure p2.

    Known check: with rho=1.225, p1=101325 Pa, v1=0, v2=50 m/s on a level
    streamline, the dynamic pressure 1/2 rho v2^2 = 1531.25 Pa, so the static
    pressure drops by exactly that amount -> p2 = 99793.75 Pa.
    """
    rho = density_kg_m3
    total_head1 = (pressure1_pa + 0.5 * rho * velocity1_ms ** 2
                   + rho * G0 * height1_m)
    pressure2 = (total_head1 - 0.5 * rho * velocity2_ms ** 2
                 - rho * G0 * height2_m)
    dynamic_pressure1 = 0.5 * rho * velocity1_ms ** 2
    dynamic_pressure2 = 0.5 * rho * velocity2_ms ** 2
    return {
        "pressure2_pa": float(pressure2),
        "dynamic_pressure1_pa": float(dynamic_pressure1),
        "dynamic_pressure2_pa": float(dynamic_pressure2),
        "total_head_pa": float(total_head1),
        "stagnation_pressure_pa": float(pressure1_pa + dynamic_pressure1),
    }


# 2. LIFT COEFFICIENT / LIFT FORCE -------------------------------------------
def lift_coefficient_force(*, density_kg_m3: float, velocity_ms: float,
                           wing_area_m2: float, lift_coefficient: float) -> dict:
    """Aerodynamic lift force from the lift equation.

    L = 1/2 rho v^2 S C_L          (dynamic pressure q = 1/2 rho v^2)

    Known check: rho=1.225, v=50 m/s, S=16.2 m^2, C_L=1.0 ->
    q = 1531.25 Pa, L = 1531.25 * 16.2 = 24806.25 N.
    """
    dynamic_pressure = 0.5 * density_kg_m3 * velocity_ms ** 2
    lift_force = dynamic_pressure * wing_area_m2 * lift_coefficient
    return {
        "dynamic_pressure_pa": float(dynamic_pressure),
        "lift_force_n": float(lift_force),
    }


# 3. DRAG FORCE & TERMINAL VELOCITY ------------------------------------------
def drag_terminal_velocity(*, mass_kg: float, diameter_m: float,
                           density_kg_m3: float = RHO_AIR_SEALEVEL,
                           drag_coefficient: float = 0.47,
                           velocity_ms: float | None = None) -> dict:
    """Quadratic drag force and the terminal velocity of a falling sphere.

    Drag force        F_d = 1/2 rho v^2 C_d A         (A = pi d^2 / 4)
    Terminal velocity v_t = sqrt(2 m g / (rho C_d A)) (drag == weight)

    Known check (drag-balance identity): at terminal velocity the drag force
    must exactly equal the weight m g.  A dense steel sphere (rho_steel=7850)
    of d=0.0381 m (1.5 in, m=0.2273 kg) in air (rho=1.225, C_d=0.5) has
    v_t ~= 80 m/s (HyperPhysics-class steel-ball value, order ~85 m/s).
    """
    area = np.pi * (diameter_m ** 2) / 4.0
    v_terminal = np.sqrt(2.0 * mass_kg * G0 /
                         (density_kg_m3 * drag_coefficient * area))
    out = {
        "frontal_area_m2": float(area),
        "terminal_velocity_ms": float(v_terminal),
        "weight_n": float(mass_kg * G0),
    }
    if velocity_ms is not None:
        drag = 0.5 * density_kg_m3 * velocity_ms ** 2 * drag_coefficient * area
        out["drag_force_n"] = float(drag)
    else:
        # drag at terminal velocity must equal the weight
        drag_at_vt = (0.5 * density_kg_m3 * v_terminal ** 2
                      * drag_coefficient * area)
        out["drag_force_at_terminal_n"] = float(drag_at_vt)
    return out


# 4. REYNOLDS NUMBER & TRANSITION --------------------------------------------
def reynolds_number(*, velocity_ms: float, length_m: float,
                    density_kg_m3: float = RHO_WATER,
                    dynamic_viscosity_pa_s: float = MU_WATER_20C,
                    transition_re: float = 2300.0) -> dict:
    """Reynolds number Re = rho v L / mu and the laminar/turbulent regime.

    For internal pipe flow the laminar -> turbulent transition is taken at
    the classical critical value Re ~ 2300.

    Known check: water (rho=1000, mu=1.002e-3) at v=0.1 m/s in a D=0.02306 m
    pipe gives Re = 1000*0.1*0.02306/1.002e-3 ~= 2301 (right at transition);
    and Re < 2300 is reported as 'laminar'.
    """
    re = density_kg_m3 * velocity_ms * length_m / dynamic_viscosity_pa_s
    if re < transition_re:
        regime = "laminar"
    elif re < 4000.0:
        regime = "transitional"
    else:
        regime = "turbulent"
    return {
        "reynolds_number": float(re),
        "regime": regime,
        "transition_reynolds": float(transition_re),
        "is_laminar": bool(re < transition_re),
    }


# 5. BLASIUS LAMINAR BOUNDARY LAYER ------------------------------------------
def blasius_boundary_layer(*, distance_m: float, freestream_velocity_ms: float,
                           density_kg_m3: float = RHO_AIR_SEALEVEL,
                           dynamic_viscosity_pa_s: float = MU_AIR_20C) -> dict:
    """Laminar flat-plate boundary-layer thickness (Blasius solution).

    Local Reynolds number  Re_x = rho U x / mu
    99% thickness          delta = 5.0 x / sqrt(Re_x)

    Known check: air (rho=1.225, mu=1.81e-5) at U=1 m/s, x=1 m gives
    Re_x = 67680, sqrt(Re_x) ~= 260.2, delta = 5/260.2 ~= 0.01922 m,
    i.e. delta/x = 5/sqrt(Re_x) -> delta ~ 19.2 mm.
    """
    re_x = density_kg_m3 * freestream_velocity_ms * distance_m \
        / dynamic_viscosity_pa_s
    delta = 5.0 * distance_m / np.sqrt(re_x)
    # displacement and momentum thickness (Blasius coefficients)
    delta_star = 1.7208 * distance_m / np.sqrt(re_x)
    theta = 0.664 * distance_m / np.sqrt(re_x)
    return {
        "reynolds_x": float(re_x),
        "boundary_layer_thickness_m": float(delta),
        "boundary_layer_thickness_mm": float(delta * 1000.0),
        "displacement_thickness_m": float(delta_star),
        "momentum_thickness_m": float(theta),
    }


# 6. SPEED OF SOUND & MACH NUMBER --------------------------------------------
def speed_of_sound_mach(*, temperature_k: float = 293.15,
                        velocity_ms: float = 0.0,
                        gamma: float = GAMMA_AIR,
                        gas_constant_j_kg_k: float = R_SPECIFIC_AIR) -> dict:
    """Speed of sound in an ideal gas and the Mach number of a flow.

    Speed of sound  a = sqrt(gamma R T)
    Mach number     M = v / a

    Known check: dry air (gamma=1.4, R=287.05) at T=293.15 K (20 C) ->
    a ~= 343 m/s.
    """
    a = np.sqrt(gamma * gas_constant_j_kg_k * temperature_k)
    mach = velocity_ms / a
    if mach < 0.8:
        regime = "subsonic"
    elif mach < 1.2:
        regime = "transonic"
    elif mach < 5.0:
        regime = "supersonic"
    else:
        regime = "hypersonic"
    return {
        "speed_of_sound_ms": float(a),
        "mach_number": float(mach),
        "flow_regime": regime,
    }


# 7. NORMAL SHOCK RELATIONS / PRANDTL-MEYER ----------------------------------
def normal_shock_relations(*, mach1: float, gamma: float = GAMMA_AIR) -> dict:
    """Rankine-Hugoniot normal-shock jump relations plus the Prandtl-Meyer
    expansion angle for a supersonic flow.

    Pressure ratio       p2/p1 = (2 gamma M1^2 - (gamma-1)) / (gamma+1)
    Downstream Mach       M2^2 = (1 + (gamma-1)/2 M1^2) /
                                 (gamma M1^2 - (gamma-1)/2)
    Density ratio    rho2/rho1 = ((gamma+1) M1^2) / ((gamma-1) M1^2 + 2)
    Prandtl-Meyer  nu(M) = sqrt((g+1)/(g-1)) atan( sqrt((g-1)/(g+1)(M^2-1)) )
                            - atan( sqrt(M^2-1) )

    Known check: M1=2, gamma=1.4 -> p2/p1 = 4.5, M2 ~= 0.5774,
    rho2/rho1 ~= 2.667, and the Prandtl-Meyer angle nu(2) ~= 26.38 deg.
    """
    if mach1 < 1.0:
        raise ValueError("normal shock requires supersonic upstream flow (M1 > 1)")
    g = gamma
    m1sq = mach1 * mach1
    pressure_ratio = (2.0 * g * m1sq - (g - 1.0)) / (g + 1.0)
    m2sq = (1.0 + 0.5 * (g - 1.0) * m1sq) / (g * m1sq - 0.5 * (g - 1.0))
    mach2 = np.sqrt(m2sq)
    density_ratio = ((g + 1.0) * m1sq) / ((g - 1.0) * m1sq + 2.0)
    temperature_ratio = pressure_ratio / density_ratio  # ideal-gas T2/T1
    # Prandtl-Meyer function (radians -> degrees)
    msq_m1 = m1sq - 1.0
    nu = (np.sqrt((g + 1.0) / (g - 1.0))
          * np.arctan(np.sqrt((g - 1.0) / (g + 1.0) * msq_m1))
          - np.arctan(np.sqrt(msq_m1)))
    return {
        "pressure_ratio": float(pressure_ratio),
        "mach2": float(mach2),
        "density_ratio": float(density_ratio),
        "temperature_ratio": float(temperature_ratio),
        "prandtl_meyer_deg": float(np.degrees(nu)),
    }


# 8. HAGEN-POISEUILLE PIPE FLOW ----------------------------------------------
def hagen_poiseuille_flow(*, radius_m: float, length_m: float,
                          pressure_drop_pa: float,
                          dynamic_viscosity_pa_s: float = MU_WATER_20C) -> dict:
    """Volumetric flow rate of laminar, incompressible flow in a round pipe.

    Q = pi dP r^4 / (8 mu L)            (Hagen-Poiseuille equation)
    Mean velocity  v = Q / (pi r^2)

    Known check: water (mu=1.002e-3) in a pipe r=0.005 m, L=1 m, dP=100 Pa:
    Q = pi*100*(0.005^4)/(8*1.002e-3*1) ~= 2.448e-5 m^3/s (~24.5 mL/s).
    """
    q = (np.pi * pressure_drop_pa * radius_m ** 4
         / (8.0 * dynamic_viscosity_pa_s * length_m))
    area = np.pi * radius_m ** 2
    mean_velocity = q / area
    return {
        "flow_rate_m3_s": float(q),
        "flow_rate_ml_s": float(q * 1e6),
        "mean_velocity_ms": float(mean_velocity),
    }
