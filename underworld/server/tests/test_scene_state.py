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
    assert scene["contract_version"] == 2
    assert all("position" in v and "anim" in v for v in scene["minions"])


def test_ue5_v2_contract_fields():
    """Every field the UE5 client's contract-v2 parser reads MUST be emitted by the backend, or
    the high-fidelity renderer silently loses a signal (Overmind, presence, awakening, …). This is
    the cross-renderer guard: server/services/scene_state.py ↔ deploy/ue5-project SceneStateClient.cpp.
    If you add a field on one side, add it here and on the other."""
    world = types.SimpleNamespace(id="w1", tick=42, era="iron", sim_year=200.0, weather="clear")
    seed = types.SimpleNamespace(seed_int=7, biome_hint="plains", elevation_bias=0.0)
    minions = [_minion(f"m{i}", brain={"awareness": 0.4, "awakened_tick": 3,
                                       "self_model": {"identity": "the doubter"},
                                       "dominant_drive": "purpose", "thought": "am I watched?"})
               for i in range(3)]
    scene = ss.build_scene_state(world, seed, minions, heightmap=[[0.5] * 8] * 8, weather="clear")

    # top-level
    for key in ("world_id", "tick", "era", "sim_year", "frame", "terrain", "minions",
                "population", "contract_version"):
        assert key in scene, f"top-level '{key}' missing"
    assert scene["contract_version"] == 2

    # frame — the AI-Director + Watched-Creator blocks the UE5 client parses
    frame = scene["frame"]
    for key in ("time_of_day", "weather", "biome", "overmind", "chatter", "god_beat",
                "possessed_id", "presence", "epoch"):
        assert key in frame, f"frame.{key} missing"
    assert isinstance(frame["time_of_day"], dict) and "fraction" in frame["time_of_day"]
    assert isinstance(frame["chatter"], list)
    presence = frame["presence"]
    assert "attention_hotspots" in presence and "creator_present" in presence

    # terrain — seed + the extras the UE5 client reads (elevation_bias/town_radius/heightmap_size)
    for key in ("seed", "biome", "elevation_bias", "town_radius", "heightmap_size"):
        assert key in scene["terrain"], f"terrain.{key} missing"

    # per-minion — the full v2 surface (incl. generation + behavior the UE5 client now reads)
    for v in scene["minions"]:
        for key in ("id", "name", "position", "velocity", "move_state", "speed", "facing",
                    "anim", "action", "target_building", "awareness", "awakened", "scale",
                    "needs", "mood", "guild", "role", "color", "drive", "identity", "thought",
                    "generation", "behavior"):
            assert key in v, f"minion field '{key}' missing"
        for need in ("hunger", "fatigue", "sanity"):
            assert need in v["needs"], f"needs.{need} missing"
        assert isinstance(v["awareness"], (int, float))
        assert isinstance(v["awakened"], bool)
