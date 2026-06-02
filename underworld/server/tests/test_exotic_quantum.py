from underworld.server.services import exotic_quantum as eq
def test_floquet_subharmonic_period():
    r = eq.floquet_subharmonic(drive_period=2, steps=256, imperfection=0.02)
    assert r["response_period"] > 0
def test_ising_chain_energy():
    aligned = eq.ising_chain_energy([1,1,1,1], j=1, h=0)["energy"]
    anti = eq.ising_chain_energy([1,-1,1,-1], j=1, h=0)["energy"]
    assert aligned < anti                       # aligned ferromagnet lower energy
def test_mbl_localised_vs_thermal():
    assert eq.many_body_localisation(disorder=10, interaction=1)["localised"] is True
    assert eq.many_body_localisation(disorder=0.5, interaction=1)["thermal"] is True
def test_symmetry_breaking():
    assert eq.symmetry_breaking(0.8)["symmetry_broken"] is True
    assert eq.symmetry_breaking(0.01)["symmetry_broken"] is False
def test_topological_winding():
    import math
    phases = [i * 2*math.pi/8 for i in range(9)]   # one full loop
    assert eq.topological_invariant(phases)["topological"] is True
def test_superfluid_and_bec_fraction():
    assert eq.superfluid_fraction(temperature=0, t_critical=2)["superfluid_fraction"] > 0.9
    assert eq.bec_condensate_fraction(temperature=3, t_critical=2)["condensed"] is False
def test_quantum_metrology_heisenberg():
    ent = eq.quantum_metrology(n_probes=100, entangled=True)
    cls = eq.quantum_metrology(n_probes=100, entangled=False)
    assert ent["precision"] < cls["precision"]   # entangled beats SQL
