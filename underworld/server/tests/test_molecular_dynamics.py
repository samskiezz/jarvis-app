"""Real MD must conserve energy (NVE); Gillespie SSA must be a valid trajectory."""
from underworld.server.services import molecular_dynamics as MD


def test_md_conserves_energy():
    # velocity-Verlet on a Lennard-Jones fluid: total energy stays ~constant.
    r = MD.run_md(n=64, steps=300, dt=0.001, seed=1)
    assert r["atoms"] == 64
    assert r["conserves_energy"], f"energy fluctuation too high: {r['energy_fluctuation_frac']}"
    assert r["temperature"] > 0


def test_md_temperature_from_equipartition():
    r = MD.run_md(n=32, steps=50, temp=1.5, seed=2)
    assert 0.1 < r["temperature"] < 10        # sane reduced-unit temperature


def test_gillespie_decay_consumes_molecules():
    # A -> 0 (degradation): A should fall from 100 toward 0 stochastically.
    r = MD.gillespie({"A": 100}, [{"reactants": {"A": 1}, "products": {}, "rate": 1.0}],
                     t_max=8.0, seed=3)
    assert r["final_state"]["A"] < 100 and r["steps"] > 0


def test_gillespie_conversion_conserves_count():
    # A -> B: total A+B is conserved at every step.
    r = MD.gillespie({"A": 50, "B": 0},
                     [{"reactants": {"A": 1}, "products": {"B": 1}, "rate": 0.5}],
                     t_max=20.0, seed=4)
    assert r["final_state"]["A"] + r["final_state"]["B"] == 50


def test_gillespie_deterministic_given_seed():
    args = ({"A": 30}, [{"reactants": {"A": 1}, "products": {}, "rate": 1.0}])
    a = MD.gillespie(*args, t_max=5.0, seed=7)
    b = MD.gillespie(*args, t_max=5.0, seed=7)
    assert a["final_state"] == b["final_state"]
