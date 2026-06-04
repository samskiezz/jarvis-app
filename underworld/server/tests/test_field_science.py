"""Every niche field must route to a REAL simulation producing real data."""
import random

from underworld.server.services import field_science as FS
from underworld.server.services import taxonomy as T
from underworld.server.services import structure_folding as SF


def test_folding_is_real():
    r = SF.nussinov("GGGAAAUCCC")          # a hairpin: stem should pair
    assert r["base_pairs"] >= 2 and r["structure"].count("(") == r["structure"].count(")")
    p = SF.protein_secondary_structure("AAAAAEEEEE")
    assert 0 <= p["helix_fraction"] <= 1


def test_every_field_has_a_real_engine():
    # all ~198 taxonomy fields route to a concrete engine (never the void)
    for f in T.ALL_FIELDS:
        assert callable(FS.engine_for(f))


def test_sample_of_fields_simulate_with_real_data():
    rng = random.Random(0)
    sample = rng.sample(list(T.ALL_FIELDS), min(25, len(T.ALL_FIELDS)))
    for f in sample:
        r = FS.simulate(f, seed=7)
        assert r["grounded"], f"{f} did not ground: {r['summary']}"
        assert isinstance(r["data"], dict) and 0.0 <= r["quality"] <= 1.0


def test_specific_routings():
    assert FS.engine_for("crop_genetics").__name__ == "_genetics"
    assert FS.engine_for("quantum_field_theory").__name__ == "_quantum_phys"
    assert FS.engine_for("metallurgy").__name__ == "_thermo_md"
    assert FS.engine_for("number_theory").__name__ == "_maths"
    assert FS.engine_for("astrophysics").__name__ == "_astro"
    assert FS.engine_for("fluid_dynamics").__name__ == "_fluids"


def test_genetics_field_runs_crispr_and_fold():
    r = FS.simulate("crop_genetics", seed=3)
    assert "folded_pairs" in r["data"] and "crispr_edited" in r["data"]
