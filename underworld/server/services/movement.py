"""MOVEMENT — the keystone. Server-tracked positions so minions WALK between buildings instead
of teleporting from a hash. Each minion carries a kinematic (pos/vel/path/state) in its brain
(persisted). Every movement tick, a minion steers toward the building its CURRENT ACTION
demands (the intent already computed by scene_state._action_target), at a walking speed; the
renderer reads the live position. Deterministic given (world seed, minion id) so the WebGL and
UE5 renderers agree. This replaces scene_state._position as the source of position.

Keystone v1: straight-line steering toward the target building slot with arrival + dwell, on
the φ-laid town. (A* over the road graph is the v2 refinement; v1 already makes the world walk.)
"""
from __future__ import annotations
import math
from typing import Any

from sqlalchemy.orm.attributes import flag_modified

WALK_SPEED = 3.2            # world units / second
ARRIVE_R = 1.5             # arrival radius
DWELL_TICKS = 4            # how long to occupy a building before re-targeting


def _h(*parts) -> int:
    h = 1469598103934665603
    for p in parts:
        for b in str(p).encode():
            h = ((h ^ b) * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return h


def home_pos(minion_id: str, seed_int: int, town_radius: float) -> tuple[float, float]:
    """A minion's home — the deterministic spawn spot (mirrors scene_state._position)."""
    h = _h(seed_int, minion_id)
    ang = (h % 360) * math.pi / 180.0
    r = town_radius * math.sqrt(((h >> 16) % 10000) / 10000.0)
    return round(math.cos(ang) * r, 2), round(math.sin(ang) * r, 2)


# building functions sit at deterministic spots in the town; civic core near centre,
# work/markets in a mid ring, homes are the minion's own spot.
_RING = {"obelisk": 0.0, "academy": 0.18, "market": 0.30, "monument": 0.16, "storehouse": 0.34,
         "workshop": 0.40, "guild_hq": 0.36, "well": 0.22, "farm": 0.62, "hospital": 0.26,
         "school": 0.24, "police": 0.28, "temple": 0.20, "shop": 0.32}


def building_pos(function: str, seed_int: int, town_radius: float) -> tuple[float, float]:
    """Deterministic position for a building FUNCTION so every visit to e.g. the academy goes
    to the same place (golden-angle placed in its ring)."""
    fn = (function or "home").lower()
    ringf = _RING.get(fn, 0.45)
    h = _h(seed_int, "bld", fn)
    ang = (h % 1000) / 1000.0 * 2 * math.pi
    r = town_radius * max(0.04, ringf)
    return round(math.cos(ang) * r, 2), round(math.sin(ang) * r, 2)


def _kin(m) -> dict:
    brain = m.brain if isinstance(m.brain, dict) else {}
    return brain.get("kin") or {}


def init_kin(m, seed_int: int, town_radius: float) -> dict:
    hx, hz = home_pos(m.id, seed_int, town_radius)
    return {"pos": [hx, hz], "vel": [0.0, 0.0], "target": [hx, hz],
            "state": "idle", "speed": WALK_SPEED, "dwell": 0, "target_fn": "home"}


def step_minion(m, *, seed_int: int, town_radius: float, dt: float,
                target_fn: str | None) -> bool:
    """Advance one minion toward the building its action demands. Returns True if it moved."""
    brain = m.brain if isinstance(m.brain, dict) else {}
    kin = brain.get("kin")
    if not kin:
        kin = init_kin(m, seed_int, town_radius)
    px, pz = kin["pos"]
    # choose / refresh the target when the action's building changed or after dwelling
    want_fn = (target_fn or "home").lower()
    if want_fn == "home":
        tx, tz = home_pos(m.id, seed_int, town_radius)
    else:
        tx, tz = building_pos(want_fn, seed_int, town_radius)
    if kin.get("target_fn") != want_fn:
        kin["target_fn"] = want_fn
        kin["target"] = [tx, tz]
        kin["state"] = "walk"
        kin["dwell"] = 0
    tx, tz = kin["target"]
    dx, dz = tx - px, tz - pz
    dist = math.hypot(dx, dz)
    moved = False
    if dist > ARRIVE_R:
        step = min(dist, kin["speed"] * dt)
        nx, nz = px + dx / dist * step, pz + dz / dist * step
        kin["vel"] = [round((nx - px) / max(dt, 1e-3), 3), round((nz - pz) / max(dt, 1e-3), 3)]
        kin["pos"] = [round(nx, 2), round(nz, 2)]
        kin["state"] = "walk"
        moved = True
    else:
        kin["vel"] = [0.0, 0.0]
        kin["state"] = "occupy" if want_fn != "home" else "idle"
        kin["dwell"] = int(kin.get("dwell", 0)) + 1
    brain["kin"] = kin
    m.brain = {**brain}      # new identity so the JSON column is detected as dirty
    try:
        flag_modified(m, "brain")
    except Exception:  # noqa: BLE001 - non-ORM object (tests); reassignment already suffices
        pass
    return moved


def kin_visual(m) -> dict | None:
    """The movement fields for the scene-state contract (None if not yet initialised)."""
    kin = _kin(m)
    if not kin or "pos" not in kin:
        return None
    return {"pos": kin["pos"], "vel": kin.get("vel", [0.0, 0.0]),
            "move_state": kin.get("state", "idle"), "speed": kin.get("speed", WALK_SPEED),
            "target": kin.get("target"), "target_fn": kin.get("target_fn", "home")}
