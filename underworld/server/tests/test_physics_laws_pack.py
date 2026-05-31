"""Expansion law bank — optics #51-56, materials/structures #24-30, fluids #36-39,
advanced/space/quantum #91-96."""

from __future__ import annotations

import math

from underworld.server.physics import engine


def _law(lid):
    law = engine.get_law(lid)
    assert law is not None, lid
    return law


def test_optics_laws():
    # symmetric conjugates: do=di=2f → f = do/2
    assert abs(_law("thin_lens").fn(do=1.0, di=1.0) - 0.5) < 1e-9
    # finer resolution with a bigger aperture
    assert _law("rayleigh_resolution").fn(lam=5e-7, D=0.1) < _law("rayleigh_resolution").fn(lam=5e-7, D=0.01)
    # critical angle below 90°, well defined for n1>n2
    assert 0 < _law("critical_angle").fn(n1=1.5, n2=1.0) < math.pi / 2
    # Beer-Lambert linear in concentration
    assert _law("beer_lambert").fn(eps=1e3, l=1, c=1e-3) == 1.0


def test_structure_and_material_laws():
    # smaller crack → higher critical stress (Griffith)
    assert _law("griffith_fracture").fn(E=2e11, gamma=10, a=1e-4) > \
        _law("griffith_fracture").fn(E=2e11, gamma=10, a=1e-2)
    # longer column buckles at a lower load (Euler)
    assert _law("euler_buckling").fn(E=2e11, I=1e-6, Kf=1, L=10) < \
        _law("euler_buckling").fn(E=2e11, I=1e-6, Kf=1, L=2)
    # finer grains → stronger (Hall-Petch)
    assert _law("hall_petch").fn(sigma0=2e8, k=1e5, d=1e-7) > \
        _law("hall_petch").fn(sigma0=2e8, k=1e5, d=1e-4)


def test_fluid_laws():
    # Poiseuille is hugely sensitive to radius (r^4)
    big = _law("poiseuille").fn(r=0.02, dp=1000, mu=1e-3, L=10)
    small = _law("poiseuille").fn(r=0.01, dp=1000, mu=1e-3, L=10)
    assert big > 10 * small
    # denser particle settles faster (Stokes)
    assert _law("stokes_settling").fn(r=1e-3, rho_p=8000, rho_f=1000, mu=1e-3) > 0


def test_space_and_quantum_laws():
    # rocket dv rises with mass ratio
    assert _law("tsiolkovsky").fn(ve=3000, m0=10000, mf=1000) > \
        _law("tsiolkovsky").fn(ve=3000, m0=2000, mf=1000)
    # Landauer bound rises with temperature
    assert _law("landauer").fn(T=600) > _law("landauer").fn(T=300)
    # diode passes ~no current at 0 V
    assert abs(_law("shockley_diode").fn(Is=1e-12, V=0.0, nq=1, Vt=0.0259)) < 1e-15


def test_law_count_grew():
    assert len(engine.list_laws()) >= 45    # the compendium is now substantial


def test_new_law_via_solve_route(client, headers):
    out = client.post("/physics/solve", headers=headers,
                     json={"law_id": "tsiolkovsky", "inputs": {"ve": 3000, "m0": 10000, "mf": 1000}}).json()
    assert out["value"] > 6000   # ve·ln(10) ≈ 6908 m/s
