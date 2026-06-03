"""Each deep simulation method must reproduce its KNOWN physical result."""
from underworld.server.services import sim_methods as SM


def test_ising_orders_below_tc_disorders_above():
    cold = SM.ising_2d(n=16, temp=1.0, steps=60, seed=1)
    hot = SM.ising_2d(n=16, temp=4.0, steps=60, seed=1)
    assert cold["magnetisation"] > hot["magnetisation"]      # phase transition


def test_double_pendulum_is_chaotic():
    r = SM.double_pendulum(theta1=2.0, theta2=2.0, steps=2000)
    assert r["chaotic"] and r["amplification"] > 100         # sensitive dependence


def test_wave_equation_stable_under_cfl():
    r = SM.wave_1d(c=1.0, dt=0.5, dx=1.0, steps=300)
    assert r["stable"] and r["energy_finite"]


def test_hodgkin_huxley_fires_above_threshold():
    assert SM.hodgkin_huxley(I=10.0)["fired"]                 # supra-threshold spikes
    assert not SM.hodgkin_huxley(I=0.0)["fired"]              # rest -> silent


def test_brusselator_oscillates_above_hopf():
    assert SM.brusselator(a=1.0, b=3.0)["oscillates"]         # b>1+a^2 -> limit cycle
    assert not SM.brusselator(a=1.0, b=1.5)["oscillates"]     # below threshold -> steady


def test_decay_chain_halves_at_half_life():
    assert SM.decay_chain(half_life=5.0)["matches_half_life"]


def test_blackbody_wien_peak_for_sun():
    r = SM.blackbody(temp_k=5778.0)
    assert 480 < r["peak_wavelength_nm"] < 520 and r["in_visible"]   # ~500 nm


def test_logistic_map_chaos_vs_fixed_point():
    assert SM.logistic_map(r=3.9)["chaotic"]
    assert SM.logistic_map(r=2.5)["fixed_point"]


def test_tight_binding_band_width_is_4t():
    assert SM.tight_binding_1d(n=30, t=1.0)["matches_theory"]
