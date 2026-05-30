"""Not-done phase, batch 1 — world substrate:

#4  materials database with accurate properties + alloys
#3  geologically-plausible resource distribution from the seed
#7  structural integrity model
"""

from __future__ import annotations

from underworld.server.knowledge import materials as mats
from underworld.server.physics import structures
from underworld.server.world import resources
from underworld.server.world.seed import derive_seed


# ── #4 materials ─────────────────────────────────────────────────────────────
def test_material_properties_are_physical():
    steel = mats.get("steel")
    wood = mats.get("wood")
    copper = mats.get("copper")
    assert steel and wood and copper
    assert steel.tensile_mpa > wood.tensile_mpa          # steel far stronger
    assert copper.conducts and not wood.conducts          # copper conducts, wood insulates
    assert mats.get("tungsten").melting_point_c > steel.melting_point_c
    assert mats.best_conductor().name == "silver"         # silver is the best conductor


def test_bronze_alloy_recipe_and_blend():
    bronze = mats.alloy("copper", "tin")
    assert bronze.name == "bronze"                        # known recipe
    assert bronze.tensile_mpa > mats.get("copper").tensile_mpa  # alloying strengthens
    # an unknown pair falls back to a rule-of-mixtures blend
    blend = mats.alloy("aluminium", "titanium", 0.5)
    lo, hi = sorted((mats.get("aluminium").density, mats.get("titanium").density))
    assert lo <= blend.density <= hi


# ── #3 resources ─────────────────────────────────────────────────────────────
def test_resource_distribution_is_deterministic_and_geological():
    # E-section (mining/mountains) is ore-rich; A-section (agriculture/plains)
    # leans to fuels + water.
    mountain = derive_seed("E21B")     # mining
    plains = derive_seed("A01B")       # agriculture
    s1 = resources.survey(mountain)
    s1b = resources.survey(mountain)
    assert s1 == s1b                                       # deterministic from seed
    plains_s = resources.survey(plains)
    ore_mtn = s1.get("iron_ore", {}).get("total", 0)
    ore_plains = plains_s.get("iron_ore", {}).get("total", 0)
    water_plains = plains_s.get("water", {}).get("total", 0)
    water_mtn = s1.get("water", {}).get("total", 0)
    assert ore_mtn > ore_plains                            # mountains → more ore
    assert water_plains > water_mtn                        # plains → more water


def test_richest_deposits_sorted():
    seed = derive_seed("H02J")
    deps = resources.richest_deposits(seed, limit=10)
    assert deps and all(deps[i].richness >= deps[i + 1].richness for i in range(len(deps) - 1))


# ── #7 structural integrity ──────────────────────────────────────────────────
def test_steel_beam_holds_where_wood_fails():
    steel = structures.evaluate("steel", member="beam", span_m=4.0, load_kn=50, size_m=0.2)
    wood = structures.evaluate("wood", member="beam", span_m=4.0, load_kn=50, size_m=0.2)
    assert steel.stable and steel.safety_factor > wood.safety_factor
    assert not wood.stable and wood.failure_mode == "bending fracture"


def test_longer_span_reduces_safety_and_max_span_is_consistent():
    short = structures.evaluate("steel", span_m=2.0, load_kn=20, size_m=0.15)
    long = structures.evaluate("steel", span_m=8.0, load_kn=20, size_m=0.15)
    assert short.safety_factor > long.safety_factor       # longer span → weaker

    # a beam right at max_safe_span sits at the safety-factor boundary
    L = structures.max_safe_span("steel", load_kn=20, size_m=0.15)
    at_limit = structures.evaluate("steel", span_m=L, load_kn=20, size_m=0.15)
    assert abs(at_limit.safety_factor - structures.DEFAULT_SAFETY_FACTOR) < 0.05


def test_column_crushing_mode():
    # a slender lead column under heavy axial load crushes
    r = structures.evaluate("lead", member="column", load_kn=500, size_m=0.05)
    assert not r.stable and r.failure_mode == "crushing"


# ── API routes ───────────────────────────────────────────────────────────────
def test_substrate_routes(client, headers):
    mats_resp = client.get("/substrate/materials?category=metal", headers=headers).json()
    assert mats_resp["count"] > 0 and all(m["category"] == "metal" for m in mats_resp["materials"])

    alloy = client.post("/substrate/materials/alloy",
                        headers=headers, json={"a": "copper", "b": "tin"}).json()
    assert alloy["name"] == "bronze"

    verdict = client.post("/substrate/structures/evaluate", headers=headers,
                          json={"material": "steel", "member": "beam",
                                "span_m": 4.0, "load_kn": 50, "size_m": 0.2}).json()
    assert verdict["stable"] is True

    survey = client.get("/substrate/resources?cpc_class=E21B&size=16", headers=headers).json()
    assert survey["cpc_class"] == "E21B" and "iron_ore" in survey["resources"]


# ── substrate wired into invention feasibility (#7/#54) ──────────────────────
def test_structural_soundness_grades_inventions():
    from underworld.server.physics import engine
    weak = engine.assess_invention("A giant tall tower built from wood, 200 m high.")
    strong = engine.assess_invention("A giant tall tower built from steel, 200 m high.")
    assert strong.feasibility > weak.feasibility
    assert any("unsound" in n.lower() for n in weak.notes)
    assert any("sound structural" in n.lower() for n in strong.notes)
    # a non-structural invention is unaffected by the structural rule
    neutral = engine.assess_invention("A new statistical method for sorting data.")
    assert all("structural" not in n.lower() for n in neutral.notes)
