"""Live tactical simulation engine.

Drives two self-contained simulations whose state advances with wall-clock time
so every SSE subscriber and the getLiveIntel snapshot observe a coherent world:

  * counterstrike — CT vs T agents on de_* maps, raw Source-engine-scale coords.
  * panopticon    — autonomous agents vs intruders on a 0..100 city grid.

Units steer toward rotating objective waypoints, engage when enemies are close,
take damage, and respawn — producing continuous, believable motion that the 2D
canvas and the Three.js LiveTactical3D panel both render.
"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Unit:
    id: str
    team: str
    x: float
    y: float
    tx: float
    ty: float
    hp: int = 100
    speed: float = 1.0
    spawn: tuple[float, float] = (0.0, 0.0)


@dataclass
class GameSim:
    key: str
    maps: list[str]
    bounds: dict[str, dict[str, float]]
    teams: tuple[str, str]
    team_sizes: tuple[int, int]
    map_name: str = ""
    units: list[Unit] = field(default_factory=list)
    tick: int = 0
    round: int = 1
    last: float = field(default_factory=time.time)
    rng: random.Random = field(default_factory=lambda: random.Random(1337))

    def __post_init__(self) -> None:
        if not self.map_name:
            self.map_name = self.maps[0]
        self._spawn_units()

    # ── geometry helpers ────────────────────────────────────────────────
    def _b(self) -> dict[str, float]:
        return self.bounds.get(self.map_name, next(iter(self.bounds.values())))

    def _rand_point(self, near: tuple[float, float] | None = None, spread: float = 0.35):
        b = self._b()
        w = b["maxX"] - b["minX"]
        h = b["maxY"] - b["minY"]
        if near is None:
            return (b["minX"] + self.rng.random() * w, b["minY"] + self.rng.random() * h)
        nx = min(b["maxX"], max(b["minX"], near[0] + (self.rng.random() - 0.5) * w * spread))
        ny = min(b["maxY"], max(b["minY"], near[1] + (self.rng.random() - 0.5) * h * spread))
        return (nx, ny)

    def _team_spawn(self, team: str) -> tuple[float, float]:
        b = self._b()
        # team A starts lower-left quadrant, team B upper-right.
        if team == self.teams[0]:
            return (b["minX"] + (b["maxX"] - b["minX"]) * 0.2, b["minY"] + (b["maxY"] - b["minY"]) * 0.2)
        return (b["minX"] + (b["maxX"] - b["minX"]) * 0.8, b["minY"] + (b["maxY"] - b["minY"]) * 0.8)

    def _spawn_units(self) -> None:
        self.units = []
        for ti, team in enumerate(self.teams):
            sx, sy = self._team_spawn(team)
            for i in range(self.team_sizes[ti]):
                px, py = self._rand_point((sx, sy), 0.12)
                tx, ty = self._rand_point()
                self.units.append(
                    Unit(
                        id=f"{team}{i+1}",
                        team=team,
                        x=px,
                        y=py,
                        tx=tx,
                        ty=ty,
                        hp=100,
                        speed=0.6 + self.rng.random() * 0.8,
                        spawn=(sx, sy),
                    )
                )

    # ── simulation step ─────────────────────────────────────────────────
    def _advance(self, steps: int) -> None:
        b = self._b()
        diag = math.hypot(b["maxX"] - b["minX"], b["maxY"] - b["minY"])
        step_len = diag * 0.004
        engage_range = diag * 0.06
        for _ in range(steps):
            self.tick += 1
            for u in self.units:
                dx, dy = u.tx - u.x, u.ty - u.y
                dist = math.hypot(dx, dy) or 1.0
                if dist < step_len * 2:
                    u.tx, u.ty = self._rand_point()
                else:
                    u.x += dx / dist * step_len * u.speed
                    u.y += dy / dist * step_len * u.speed
                u.x = min(b["maxX"], max(b["minX"], u.x))
                u.y = min(b["maxY"], max(b["minY"], u.y))

            # engagements: nearest enemy within range trades damage
            for u in self.units:
                if u.hp <= 0:
                    continue
                for v in self.units:
                    if v.team == u.team or v.hp <= 0:
                        continue
                    if math.hypot(u.x - v.x, u.y - v.y) < engage_range and self.rng.random() < 0.06:
                        v.hp -= self.rng.randint(8, 24)

            # respawn the fallen, advance the round when a side is wiped
            alive = {t: 0 for t in self.teams}
            for u in self.units:
                if u.hp <= 0:
                    u.x, u.y = self._rand_point(u.spawn, 0.12)
                    u.tx, u.ty = self._rand_point()
                    u.hp = 100
                else:
                    alive[u.team] += 1
            if min(alive.values()) == 0 and self.tick % 5 == 0:
                self.round += 1

    def step_to_now(self, hz: float = 8.0) -> None:
        now = time.time()
        steps = int((now - self.last) * hz)
        if steps <= 0:
            return
        steps = min(steps, 240)  # cap catch-up after idle
        self.last = now
        self._advance(steps)

    def set_map(self, map_name: str) -> None:
        if map_name in self.bounds and map_name != self.map_name:
            self.map_name = map_name
            self.round = 1
            self._spawn_units()

    # ── output ──────────────────────────────────────────────────────────
    def frame(self) -> dict[str, Any]:
        b = self._b()
        return {
            "map": self.map_name,
            "tick": self.tick,
            "round": self.round,
            "bounds": b,
            "units": [
                {
                    "id": u.id,
                    "team": u.team,
                    "worldX": round(u.x, 2),
                    "worldY": round(u.y, 2),
                    "hp": u.hp,
                }
                for u in self.units
            ],
        }


_CS_BOUNDS = {
    "de_dust2": {"minX": -2500, "maxX": 2500, "minY": -2000, "maxY": 2000},
    "de_mirage": {"minX": -3200, "maxX": 2100, "minY": -3300, "maxY": 1600},
    "de_inferno": {"minX": -2200, "maxX": 2900, "minY": -2200, "maxY": 2200},
    "de_nuke": {"minX": -3450, "maxX": 1800, "minY": -3400, "maxY": 1900},
}
_PANO_BOUNDS = {
    "city_grid": {"minX": 0, "maxX": 100, "minY": 0, "maxY": 100},
    "dockyard": {"minX": 0, "maxX": 100, "minY": 0, "maxY": 100},
    "industrial_zone": {"minX": 0, "maxX": 100, "minY": 0, "maxY": 100},
}

_GAMES: dict[str, GameSim] = {
    "counterstrike": GameSim(
        key="counterstrike",
        maps=list(_CS_BOUNDS),
        bounds=_CS_BOUNDS,
        teams=("CT", "T"),
        team_sizes=(5, 5),
    ),
    "panopticon": GameSim(
        key="panopticon",
        maps=list(_PANO_BOUNDS),
        bounds=_PANO_BOUNDS,
        teams=("CT", "T"),
        team_sizes=(6, 4),
    ),
}


def get_game(key: str) -> GameSim | None:
    return _GAMES.get(key)


def snapshot(key: str) -> dict[str, Any]:
    game = _GAMES.get(key)
    if not game:
        return {"map": "", "units": [], "maps": []}
    game.step_to_now()
    frame = game.frame()
    frame["maps"] = game.maps
    return frame
