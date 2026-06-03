"""Discovery engines must create GENUINELY NEW artifacts (verified novel)."""
from underworld.server.services import discovery_color as DC
from underworld.server.services import discovery_molecule as DM
from underworld.server.services import discovery_astro as DA


# ── colours ───────────────────────────────────────────────────────────────────
def test_ciede2000_basics():
    black = DC.srgb_to_lab((0, 0, 0)); white = DC.srgb_to_lab((255, 255, 255))
    assert DC.ciede2000(black, black) < 1e-6           # identical -> 0
    assert DC.ciede2000(black, white) > 95             # max contrast -> ~100


def test_discovered_colours_are_perceptibly_new():
    cols = DC.discover_colors(n=6, min_delta_e=12.0, seed=1)
    assert len(cols) == 6
    for c in cols:
        assert c["delta_e_to_nearest"] > 12.0          # provably distinct from known
        assert c["hex"].startswith("#")


# ── molecules ──────────────────────────────────────────────────────────────────
def test_discovered_molecules_are_novel_and_valid():
    from rdkit import Chem
    mols = DM.discover_molecules(n=4, max_candidates=300, seed=2)
    known = DM._known_inchikeys()
    assert len(mols) >= 1
    for m in mols:
        assert m["inchikey"] not in known             # genuinely new compound
        assert Chem.MolFromSmiles(m["smiles"]) is not None   # a valid molecule
        assert m["mol_weight"] > 0


# ── astronomy ──────────────────────────────────────────────────────────────────
def test_track_planets_real_ephemeris():
    r = DA.track_planets("2026-06-03 22:00:00")
    assert set(["mars", "jupiter"]).issubset(r["planets"])
    assert r["planets"]["mars"]["distance_au"] > 0


def test_keplers_third_law():
    # a=1 AU -> period 1 year (Earth); a=4 -> 8 years
    assert abs(DA.propagate_orbit(a=1.0, e=0.0)["period_years"] - 1.0) < 1e-6
    assert abs(DA.propagate_orbit(a=4.0, e=0.0)["period_years"] - 8.0) < 1e-6


def test_neo_earth_crossing_detection():
    # a=1.5, e=0.4 -> perihelion 0.9 < 1 < aphelion 2.1 => Earth-crossing
    o = DA.propagate_orbit(a=1.5, e=0.4)
    assert o["earth_crossing"]
    assert o["perihelion_au"] < 1.0 < o["aphelion_au"]


def test_meteor_close_approach():
    approach = DA.meteor_close_approach(a=1.0, e=0.02)
    assert approach["min_orbit_intersection_au"] >= 0
    assert "hazardous" in approach
