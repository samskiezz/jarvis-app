"""Tests for the tactical simulation engine.

These step the simulations directly (bypassing wall-clock so they are fast and
deterministic) and assert the enriched frame schema plus genuine gameplay
progression for both modes.
"""

from __future__ import annotations

import random

import pytest

from server.services.simulation import GameSim, get_game, snapshot

_CS_BOUNDS = {"de_dust2": {"minX": -2500, "maxX": 2500, "minY": -2000, "maxY": 2000}}
_PANO_BOUNDS = {"city_grid": {"minX": 0, "maxX": 100, "minY": 0, "maxY": 100}}


def _fresh_cs() -> GameSim:
    g = GameSim(
        key="cs_test",
        maps=list(_CS_BOUNDS),
        bounds=_CS_BOUNDS,
        teams=("CT", "T"),
        team_sizes=(5, 5),
        mode="counterstrike",
    )
    g.rng = random.Random(20260603)
    g._reset_match()
    return g


def _fresh_pano() -> GameSim:
    g = GameSim(
        key="pano_test",
        maps=list(_PANO_BOUNDS),
        bounds=_PANO_BOUNDS,
        teams=("AGENT", "INTRUDER"),
        team_sizes=(6, 3),
        mode="panopticon",
    )
    g.rng = random.Random(20260603)
    g._reset_match()
    return g


_COMMON_KEYS = {
    "map", "tick", "round", "bounds", "mode", "phase",
    "round_time", "round_max", "score", "events", "units",
}


def test_common_schema_keys_present():
    for g in (_fresh_cs(), _fresh_pano()):
        g._advance(10)
        f = g.frame()
        assert _COMMON_KEYS.issubset(f.keys())
        assert isinstance(f["score"], dict)
        assert isinstance(f["events"], list)
        assert isinstance(f["units"], list) and f["units"]


def test_counterstrike_schema_keys():
    g = _fresh_cs()
    g._advance(10)
    f = g.frame()
    assert f["mode"] == "counterstrike"
    assert "bombsites" in f and len(f["bombsites"]) == 2
    for s in f["bombsites"]:
        assert {"id", "x", "y", "r"}.issubset(s.keys())
    assert "bomb" in f
    assert {"state", "x", "y", "timer", "site"}.issubset(f["bomb"].keys())
    assert f["bomb"]["state"] in ("held", "planted", "defused", "exploded")
    assert set(f["score"].keys()) == {"CT", "T"}


def test_panopticon_schema_keys():
    g = _fresh_pano()
    g._advance(10)
    f = g.frame()
    assert f["mode"] == "panopticon"
    assert "objectives" in f and 3 <= len(f["objectives"]) <= 4
    for o in f["objectives"]:
        assert {"id", "x", "y", "state"}.issubset(o.keys())
        assert o["state"] in ("secure", "contested", "breached")
    assert f["alert_level"] in ("calm", "suspicious", "alarmed")
    assert isinstance(f["intrusions_stopped"], int)
    assert isinstance(f["breaches"], int)


def test_unit_fields():
    for g in (_fresh_cs(), _fresh_pano()):
        g._advance(20)
        for u in g.frame()["units"]:
            assert {
                "id", "team", "worldX", "worldY", "hp", "state",
                "weapon", "kills", "deaths", "aimX", "aimY", "firing",
            }.issubset(u.keys())
            assert isinstance(u["kills"], int)
            assert isinstance(u["deaths"], int)
            assert isinstance(u["firing"], bool)
            assert isinstance(u["state"], str) and u["state"]


def test_counterstrike_progresses():
    g = _fresh_cs()
    bomb_states = set()
    saw_round_advance = False
    saw_score = False
    start_round = g.round
    for _ in range(8000):
        g._advance(1)
        bomb_states.add(g.bomb["state"])
        if g.round > start_round:
            saw_round_advance = True
        if sum(g.score.values()) > 0:
            saw_score = True
        if saw_score and saw_round_advance:
            break
    # the round loop must turn over and produce a scoreboard change
    assert saw_round_advance, "round never advanced"
    assert saw_score, "score never changed"
    # and the bomb must have done something beyond being merely held
    assert bomb_states & {"planted", "defused", "exploded"}, bomb_states


def test_panopticon_progresses():
    g = _fresh_pano()
    saw_detect = False
    saw_breach = False
    for _ in range(8000):
        g._advance(1)
        kinds = {e["kind"] for e in g.events}
        if "detect" in kinds:
            saw_detect = True
        if "breach" in kinds or g.breaches > 0:
            saw_breach = True
        if saw_detect or saw_breach:
            break
    assert saw_detect or saw_breach, "no detect or breach ever occurred"
    f = g.frame()
    assert isinstance(f["intrusions_stopped"], int)
    assert isinstance(f["breaches"], int)
    assert f["alert_level"] in ("calm", "suspicious", "alarmed")


def test_events_capped_at_12():
    for g in (_fresh_cs(), _fresh_pano()):
        g._advance(8000)
        assert len(g.events) <= 12
        f = g.frame()
        assert len(f["events"]) <= 12


def test_registered_games_and_snapshot():
    cs = get_game("counterstrike")
    pano = get_game("panopticon")
    assert cs is not None and cs.teams == ("CT", "T") and cs.team_sizes == (5, 5)
    assert pano is not None and pano.teams == ("AGENT", "INTRUDER")
    assert pano.team_sizes == (6, 3)
    snap = snapshot("counterstrike")
    assert "maps" in snap and snap["maps"]
    assert snapshot("nope") == {"map": "", "units": [], "maps": []}


def test_set_map_respawns():
    g = get_game("counterstrike")
    g._advance(50)
    g.set_map("de_mirage")
    assert g.map_name == "de_mirage"
    assert g.round == 1
    assert g.units  # respawned
    # bombsites rebuilt within the new bounds
    b = g.bounds["de_mirage"]
    for s in g.bombsites:
        assert b["minX"] <= s["x"] <= b["maxX"]
        assert b["minY"] <= s["y"] <= b["maxY"]


def test_catchup_cap():
    g = _fresh_cs()
    g.last = 0.0  # ancient -> would imply a huge step count
    g.step_to_now(hz=8.0)
    # cap means tick stays bounded even after a long idle
    assert g.tick <= 600
