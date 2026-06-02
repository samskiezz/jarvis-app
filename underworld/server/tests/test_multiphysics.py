"""Tests for real multiphysics solvers — assert against analytic solutions."""
import math

import numpy as np

from underworld.server.services import multiphysics as mp


def test_rigid_body_free_fall():
    b = mp.Body(pos=np.array([0.0, 0.0]), vel=np.array([0.0, 0.0]), mass=2.0)
    g = np.array([0.0, -9.81])
    for _ in range(100):                         # 1 s at dt=0.01
        b = mp.rigid_body_step(b, g * b.mass, 0.01)
    # symplectic Euler ~ analytic: v=-9.81, y~-0.5gt^2 within integration error
    assert abs(b.vel[1] + 9.81) < 1e-6
    assert -5.1 < b.pos[1] < -4.8


def test_ideal_gas_and_radiation():
    p = mp.ideal_gas_pressure(n_moles=1, temperature=273.15, volume=0.022414)
    assert abs(p - 101325) < 2000                # ~1 atm at STP
    # doubling T raises radiated power 16x (T^4)
    assert abs(mp.radiative_power(area=1, temperature=600) /
               mp.radiative_power(area=1, temperature=300) - 16) < 1e-6


def test_heat_diffusion_stability_and_decay():
    u0 = [0] * 10 + [100] + [0] * 10            # hot spike in the middle
    res = mp.heat_diffusion_1d(u0, alpha=1.0, dx=1.0, dt=0.2, steps=50)
    assert res["stable"] is True                 # r=0.2 <= 0.5
    assert max(res["field"]) < 100               # peak diffuses/decays
    unstable = mp.heat_diffusion_1d(u0, alpha=1.0, dx=1.0, dt=0.6, steps=1)
    assert unstable["stable"] is False           # r=0.6 > 0.5 flagged


def test_beam_deflection_matches_formula():
    d = mp.beam_tip_deflection(load=1000, length=2.0, E=200e9, I=1e-6)
    assert abs(d - 1000 * 8 / (3 * 200e9 * 1e-6)) < 1e-12


def test_speed_of_sound_and_attenuation():
    # water: K~2.2e9, rho~1000 -> ~1483 m/s
    assert abs(mp.speed_of_sound(bulk_modulus=2.2e9, density=1000) - 1483) < 10
    near = mp.acoustic_attenuation(level_db=100, distance=1)
    far = mp.acoustic_attenuation(level_db=100, distance=10)
    assert far < near


def test_snell_refraction_and_total_internal_reflection():
    r = mp.snell_refraction(n1=1.0, n2=1.5, theta_in_deg=30)
    assert r["total_internal_reflection"] is False and r["theta_out_deg"] < 30
    # glass->air past critical angle (~41.8 deg) -> TIR
    tir = mp.snell_refraction(n1=1.5, n2=1.0, theta_in_deg=60)
    assert tir["total_internal_reflection"] is True


def test_double_slit_central_maximum():
    # at y=0 the two slits are in phase -> full intensity
    assert abs(mp.double_slit_intensity(wavelength=5e-7, slit_separation=1e-4,
                                        screen_distance=1.0, y=0.0) - 1.0) < 1e-9


def test_poiseuille_scales_with_r4():
    q1 = mp.poiseuille_flow(radius=1e-3, length=1, dp=1000, viscosity=1e-3)
    q2 = mp.poiseuille_flow(radius=2e-3, length=1, dp=1000, viscosity=1e-3)
    assert abs(q2 / q1 - 16) < 1e-6              # r^4 scaling


def test_relativity_lorentz_and_dilation():
    assert abs(mp.lorentz_factor(0.0) - 1.0) < 1e-12
    g = mp.lorentz_factor(0.8 * mp.C_LIGHT)
    assert abs(g - 1.6666667) < 1e-4             # gamma at 0.8c
    assert mp.time_dilation(proper_time=1, velocity=0.8 * mp.C_LIGHT) > 1


def test_plasma_frequency_and_debye_positive():
    assert mp.plasma_frequency(electron_density=1e18) > 0
    assert mp.debye_length(electron_density=1e18, temperature=1e4) > 0


def test_multiphysics_coupling_converges():
    # a = 1 + 0.5 b ; b = 0.5 a  -> fixed point a=4/3, b=2/3
    res = mp.multiphysics_couple(lambda b: 1 + 0.5 * b, lambda a: 0.5 * a)
    assert res["converged"] is True
    assert abs(res["a"] - 4 / 3) < 1e-4


def test_finite_element_matches_analytic_bar():
    r = mp.finite_element_1d(length=2.0, E=200e9, area=1e-4, force=1000, n_elem=5)
    assert abs(r["tip_displacement"] - r["analytic"]) < 1e-9      # FEM == FL/EA


def test_fluid_network_sums_parallel_flows():
    r = mp.fluid_network_solver([{"radius": 1e-3, "length": 1},
                                 {"radius": 1e-3, "length": 1}], dp=1000, viscosity=1e-3)
    assert abs(r["total_flow"] - 2 * r["pipe_flows"][0]) < 1e-7   # 8-dp rounding


def test_rf_propagation_loss_grows_with_distance():
    near = mp.rf_propagation(distance=10, frequency=2.4e9)["path_loss_db"]
    far = mp.rf_propagation(distance=1000, frequency=2.4e9)["path_loss_db"]
    assert far > near


def test_optical_ray_tracer_traces_and_tirs():
    out = mp.optical_ray_tracer([{"n1": 1.0, "n2": 1.5}], theta_in_deg=30)
    assert out["terminated_by_tir"] is False
    tir = mp.optical_ray_tracer([{"n1": 1.5, "n2": 1.0}], theta_in_deg=70)
    assert tir["terminated_by_tir"] is True


def test_phase_change_and_combustion():
    pc = mp.phase_change_model(mass=1.0, latent_heat=334000, heat_supplied=167000)
    assert abs(pc["fraction_changed"] - 0.5) < 1e-6
    c = mp.combustion_model(fuel_energy=1e6, mass=1.0, cp=1000)
    assert c["flame_temperature"] > 298


def test_shallow_water_and_radiation_transport():
    assert abs(mp.shallow_water_solver(depth=10)["wave_speed"] - math.sqrt(98.1)) < 1e-3
    rt = mp.radiation_transport(intensity=100, absorption=0.5, distance=2)
    assert rt["transmitted"] < 100
