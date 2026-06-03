"""Tests for the canonical renderer-agnostic scene-state contract."""
import types
from underworld.server.services import scene_state as ss


def _minion(mid, guild="physics", mood="content", **kw):
    base = dict(id=mid, name="Ada", surname="Volt", guild=types.SimpleNamespace(value=guild),
                mood=types.SimpleNamespace(value=mood), generation=1, reputation=1.2,
                hunger=0.8, fatigue=0.7, sanity=0.9, alive=True, brain={})
    base.update(kw)
    return types.SimpleNamespace(**base)


def test_positions_are_deterministic_and_stable():
    m = _minion("m1")
    a = ss.minion_visual(m, seed_int=42)["position"]
    b = ss.minion_visual(m, seed_int=42)["position"]
    assert a == b                                    # identical on every client/frame


def test_different_minions_get_different_positions():
    p1 = ss.minion_visual(_minion("m1"), seed_int=42)["position"]
    p2 = ss.minion_visual(_minion("m2"), seed_int=42)["position"]
    assert p1 != p2


def test_guild_drives_appearance():
    v = ss.minion_visual(_minion("m1", guild="agriculture"), seed_int=1)
    assert v["role"] == "farmer" and v["color"]


def test_anim_state_reflects_simulation():
    exhausted = ss.minion_visual(_minion("m1", fatigue=0.1), seed_int=1)
    assert exhausted["anim"] == ss.ANIM_REST
    inspired = ss.minion_visual(_minion("m2", mood="inspired", fatigue=0.9), seed_int=1)
    assert inspired["anim"] in (ss.ANIM_STUDY, ss.ANIM_WORK)


def test_saga_surfaces_in_visual():
    m = _minion("m1", brain={"saga": {"title": "The Rise of Ada"}})
    assert ss.minion_visual(m, seed_int=1)["saga"] == "The Rise of Ada"


def test_time_of_day_cycles():
    noon = ss.time_of_day(12, day_length=24)
    midnight = ss.time_of_day(0, day_length=24)
    assert noon["is_night"] is False
    assert midnight["is_night"] is True
    assert -1.0 <= noon["sun_elevation"] <= 1.0


def test_build_scene_state_full_contract():
    world = types.SimpleNamespace(id="w1", tick=30, era="bronze", sim_year=120.0, weather="rain")
    seed = types.SimpleNamespace(seed_int=99, biome_hint="forest", elevation_bias=0.2)
    minions = [_minion(f"m{i}") for i in range(5)]
    scene = ss.build_scene_state(world, seed, minions, heightmap=[[0.5] * 8] * 8,
                                 weather="rain", epoch={"name": "Bronze Metallurgy"})
    assert scene["population"] == 5
    assert scene["frame"]["weather"] == "rain"
    assert len(scene["minions"]) == 5
    assert scene["contract_version"] == 1
    assert all("position" in v and "anim" in v for v in scene["minions"])
