"""Live tactical simulation engine.

Drives two self-contained, wall-clock-advanced simulations so every SSE
subscriber and the getLiveIntel snapshot observe one coherent, evolving world:

  * counterstrike — CT vs T on de_* maps with a real bomb round loop (buy /
    live / planted / over), line-of-sight combat, plant & defuse, and a
    rounds-won scoreboard.
  * panopticon    — autonomous AGENT security force vs INTRUDERs on a 0..100
    city grid: patrol routes, vision-cone detection, an escalating alert
    level, captures, and asset breaches.

The public API is intentionally narrow and stable:
  ``get_game(key)``, ``snapshot(key)``, ``GameSim.step_to_now``,
  ``GameSim.set_map``, ``GameSim.frame``.

``frame()`` emits an enriched-but-additive schema: the historical keys
(map / tick / round / bounds / units[].{id,team,worldX,worldY,hp}) are always
present, and ``snapshot()`` still appends ``maps``. Everything else layers on
top so the 2D canvas and the Three.js LiveTactical3D panel keep rendering.
"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from typing import Any

# ── shared tuning constants ─────────────────────────────────────────────────
_EVENT_CAP = 12
_CATCHUP_CAP = 600  # max steps replayed after the sim has been idle
_DEFAULT_HZ = 8.0

# ── counterstrike tuning (Source-engine-scale units; ~8 ticks/sec) ──────────
_CS_BUY_TICKS = 24  # freeze time (~3s)
_CS_LIVE_TICKS = 920  # ~115s
_CS_POST_PLANT_TICKS = 320  # ~40s bomb timer
_CS_OVER_TICKS = 24  # short end-of-round pause (~3s)
_CS_PLANT_TICKS = 24  # dwell on site to plant (~3s)
_CS_DEFUSE_TICKS = 40  # dwell on bomb to defuse (~5s)

# ── panopticon tuning (0..100 grid) ─────────────────────────────────────────
_PANO_BREACH_TICKS = 56  # uncaught dwell on an asset to breach it
_PANO_ASSET_RESET_TICKS = 120  # breached asset stays down this long
_PANO_RESPAWN_TICKS = 40  # captured intruder is offline this long
_PANO_ALERT_DECAY_TICKS = 96  # ticks of no contact before alert relaxes a notch
_PANO_CAPTURE_RADIUS = 4.0


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

    # combat / behaviour
    state: str = "hold"
    weapon: str = "rifle"
    kills: int = 0
    deaths: int = 0
    aimx: float = 0.0
    aimy: float = 0.0
    firing: bool = False

    # role flags / counters (meaning depends on the game mode)
    role: str = ""  # "carrier" for the CS bomb carrier, else ""
    timer: int = 0  # generic per-unit countdown (respawn / plant / defuse)
    wp: int = 0  # current patrol-waypoint index (panopticon)


@dataclass
class GameSim:
    key: str
    maps: list[str]
    bounds: dict[str, dict[str, float]]
    teams: tuple[str, str]
    team_sizes: tuple[int, int]
    mode: str = "counterstrike"
    map_name: str = ""
    units: list[Unit] = field(default_factory=list)
    tick: int = 0
    round: int = 1
    last: float = field(default_factory=time.time)
    rng: random.Random = field(default_factory=lambda: random.Random(1337))

    # match state ----------------------------------------------------------
    phase: str = "buy"
    round_time: int = 0  # ticks remaining in the current phase budget
    round_max: int = 0
    score: dict[str, int] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)

    # counterstrike state ---------------------------------------------------
    bombsites: list[dict[str, Any]] = field(default_factory=list)
    bomb: dict[str, Any] = field(default_factory=dict)

    # panopticon state ------------------------------------------------------
    objectives: list[dict[str, Any]] = field(default_factory=list)
    alert: int = 0  # 0 calm, 1 suspicious, 2 alarmed
    intrusions_stopped: int = 0
    breaches: int = 0
    _alert_cooldown: int = 0  # ticks since last contact

    def __post_init__(self) -> None:
        if not self.map_name:
            self.map_name = self.maps[0]
        self.score = {t: 0 for t in self.teams}
        self._reset_match()

    # ── geometry helpers ────────────────────────────────────────────────
    def _b(self) -> dict[str, float]:
        return self.bounds.get(self.map_name, next(iter(self.bounds.values())))

    def _diag(self) -> float:
        b = self._b()
        return math.hypot(b["maxX"] - b["minX"], b["maxY"] - b["minY"])

    def _lerp_point(self, fx: float, fy: float) -> tuple[float, float]:
        """Point at fractional position (fx, fy) inside the current bounds."""
        b = self._b()
        return (
            b["minX"] + (b["maxX"] - b["minX"]) * fx,
            b["minY"] + (b["maxY"] - b["minY"]) * fy,
        )

    def _clamp(self, x: float, y: float) -> tuple[float, float]:
        b = self._b()
        return (
            min(b["maxX"], max(b["minX"], x)),
            min(b["maxY"], max(b["minY"], y)),
        )

    def _rand_point(self, near: tuple[float, float] | None = None, spread: float = 0.35):
        b = self._b()
        w = b["maxX"] - b["minX"]
        h = b["maxY"] - b["minY"]
        if near is None:
            return (b["minX"] + self.rng.random() * w, b["minY"] + self.rng.random() * h)
        return self._clamp(
            near[0] + (self.rng.random() - 0.5) * w * spread,
            near[1] + (self.rng.random() - 0.5) * h * spread,
        )

    @staticmethod
    def _dist(a: Unit, bx: float, by: float) -> float:
        return math.hypot(a.x - bx, a.y - by)

    def _step_toward(self, u: Unit, tx: float, ty: float, step_len: float) -> bool:
        """Move u toward (tx,ty); return True once essentially arrived."""
        dx, dy = tx - u.x, ty - u.y
        dist = math.hypot(dx, dy)
        if dist < step_len * 1.5:
            u.x, u.y = self._clamp(tx, ty)
            return True
        u.x, u.y = self._clamp(u.x + dx / dist * step_len, u.y + dy / dist * step_len)
        return False

    def _push_event(self, kind: str, text: str) -> None:
        self.events.append({"tick": self.tick, "kind": kind, "text": text})
        if len(self.events) > _EVENT_CAP:
            del self.events[: len(self.events) - _EVENT_CAP]

    def _alive(self, team: str) -> list[Unit]:
        return [u for u in self.units if u.team == team and u.hp > 0]

    # ── match / map lifecycle ────────────────────────────────────────────
    def _reset_match(self) -> None:
        self.events = []
        self.tick = 0
        self.round = 1
        for t in self.teams:
            self.score.setdefault(t, 0)
        if self.mode == "counterstrike":
            self._build_bombsites()
            self._begin_cs_round(reset_carrier=True)
        else:
            self._build_objectives()
            self.alert = 0
            self._alert_cooldown = 0
            self._spawn_panopticon()
            self.phase = "patrol"
            self.round_max = 0
            self.round_time = 0

    def set_map(self, map_name: str) -> None:
        if map_name in self.bounds and map_name != self.map_name:
            self.map_name = map_name
            self._reset_match()

    # ════════════════════════════════════════════════════════════════════
    #  COUNTERSTRIKE
    # ════════════════════════════════════════════════════════════════════
    def _build_bombsites(self) -> None:
        diag = self._diag()
        r = diag * 0.10
        ax, ay = self._lerp_point(0.72, 0.74)
        bx, by = self._lerp_point(0.26, 0.30)
        self.bombsites = [
            {"id": "A", "x": round(ax, 1), "y": round(ay, 1), "r": round(r, 1)},
            {"id": "B", "x": round(bx, 1), "y": round(by, 1), "r": round(r, 1)},
        ]

    def _cs_spawn_point(self, team: str) -> tuple[float, float]:
        # T bottom-left staging, CT top-right staging.
        if team == "T":
            return self._lerp_point(0.16, 0.18)
        return self._lerp_point(0.84, 0.82)

    def _begin_cs_round(self, reset_carrier: bool = True) -> None:
        self.phase = "buy"
        self.round_max = _CS_BUY_TICKS
        self.round_time = _CS_BUY_TICKS
        site = self.rng.choice(self.bombsites)
        self.bomb = {
            "state": "held",
            "x": 0.0,
            "y": 0.0,
            "timer": 0,
            "site": None,
            "_target": site["id"],  # internal: T's chosen site this round
        }
        # (re)spawn everyone fresh
        if not self.units:
            for ti, team in enumerate(self.teams):
                for i in range(self.team_sizes[ti]):
                    sx, sy = self._cs_spawn_point(team)
                    self.units.append(
                        Unit(
                            id=f"{team}{i+1}",
                            team=team,
                            x=sx,
                            y=sy,
                            tx=sx,
                            ty=sy,
                            spawn=(sx, sy),
                            weapon="rifle",
                        )
                    )
        ts = [u for u in self.units if u.team == "T"]
        for u in self.units:
            u.hp = 100
            u.firing = False
            u.timer = 0
            u.state = "hold"
            u.role = ""
            sx, sy = self._cs_spawn_point(u.team)
            u.spawn = (sx, sy)
            u.x, u.y = self._rand_point((sx, sy), 0.08)
            u.tx, u.ty = u.x, u.y
        if ts:
            carrier = self.rng.choice(ts)
            carrier.role = "carrier"
            self.bomb["x"], self.bomb["y"] = carrier.x, carrier.y

    def _cs_carrier(self) -> Unit | None:
        for u in self.units:
            if u.role == "carrier" and u.hp > 0:
                return u
        return None

    def _cs_target_site(self) -> dict[str, Any]:
        tid = self.bomb.get("_target", self.bombsites[0]["id"])
        for s in self.bombsites:
            if s["id"] == tid:
                return s
        return self.bombsites[0]

    def _has_los(self, u: Unit, v: Unit) -> bool:
        """Cheap line-of-sight proxy: the midpoint must not fall inside the
        non-target bombsite 'cover' blob. Keeps combat from being perfectly
        omniscient without a full visibility mesh."""
        mx, my = (u.x + v.x) / 2.0, (u.y + v.y) / 2.0
        for s in self.bombsites:
            # treat the *other* site as a sightline blocker ~40% of the time
            if math.hypot(mx - s["x"], my - s["y"]) < s["r"] * 0.55:
                # blocked only sometimes so corners still matter
                return self.rng.random() > 0.45
        return True

    def _cs_combat(self) -> None:
        diag = self._diag()
        weapon_range = diag * 0.55
        for u in self.units:
            u.firing = False
            if u.hp <= 0:
                continue
            enemies = self._alive("CT" if u.team == "T" else "T")
            if not enemies:
                continue
            # nearest enemy within weapon range and rough LOS
            target: Unit | None = None
            best = weapon_range
            for v in enemies:
                d = math.hypot(u.x - v.x, u.y - v.y)
                if d < best and self._has_los(u, v):
                    best = d
                    target = v
            if target is None:
                continue
            u.aimx, u.aimy = target.x, target.y
            if u.state not in ("plant", "defuse"):
                u.state = "engage"
            # hit chance falls off with distance, penalised while moving
            close = 1.0 - min(1.0, best / weapon_range)
            base = 0.10 + 0.22 * close
            moving = math.hypot(u.x - target.x, u.y - target.y) and u.state == "engage"
            if u.state in ("push", "rotate"):
                base *= 0.55  # moving-and-shooting penalty
            if self.rng.random() < base:
                u.firing = True
                dmg = self.rng.randint(18, 42)
                target.hp -= dmg
                if target.hp <= 0:
                    target.hp = 0
                    u.kills += 1
                    target.deaths += 1
                    target.state = "dead"
                    target.firing = False
                    self._push_event(
                        "kill", f"{u.id} [{u.weapon}] eliminated {target.id}"
                    )

    def _advance_cs(self) -> None:
        diag = self._diag()
        step_len = diag * 0.012
        site = self._cs_target_site()
        carrier = self._cs_carrier()

        # ── per-phase movement intent ───────────────────────────────────
        for u in self.units:
            if u.hp <= 0:
                u.state = "dead"
                u.firing = False
                continue

            if u.team == "T":
                if u is carrier and self.bomb["state"] == "held":
                    if self._dist(u, site["x"], site["y"]) < site["r"] * 0.6:
                        u.state = "plant"
                        u.timer += 1
                    else:
                        u.state = "push"
                        moved = self._step_toward(u, site["x"], site["y"], step_len)
                        if not moved:
                            u.timer = 0
                    self.bomb["x"], self.bomb["y"] = u.x, u.y
                else:
                    # support: escort toward the target site, fan out a little
                    if u.state in ("hold", "rotate", ""):
                        u.state = "push"
                    tx, ty = self._rand_point((site["x"], site["y"]), 0.18)
                    self._step_toward(u, tx if u.tx == u.x else u.tx, ty if u.ty == u.y else u.ty, step_len)
                    if self._step_toward(u, u.tx, u.ty, step_len):
                        u.tx, u.ty = self._rand_point((site["x"], site["y"]), 0.18)

            else:  # CT
                if self.bomb["state"] == "planted":
                    bx, by = self.bomb["x"], self.bomb["y"]
                    if self._dist(u, bx, by) < self.bombsites[0]["r"] * 0.35:
                        u.state = "defuse"
                        u.timer += 1
                    else:
                        u.state = "rotate"
                        u.timer = 0
                        self._step_toward(u, bx, by, step_len)
                else:
                    # hold / rotate between the two sites
                    if u.state in ("hold", "", "engage"):
                        u.state = "hold"
                    if self._step_toward(u, u.tx, u.ty, step_len):
                        anchor = self.rng.choice(self.bombsites)
                        u.tx, u.ty = self._rand_point((anchor["x"], anchor["y"]), 0.22)

        # ── combat resolves after movement ──────────────────────────────
        if self.phase in ("live", "planted"):
            self._cs_combat()

        # ── plant / defuse resolution ───────────────────────────────────
        if self.phase == "live" and carrier and carrier.state == "plant":
            if carrier.timer >= _CS_PLANT_TICKS:
                self.bomb["state"] = "planted"
                self.bomb["site"] = site["id"]
                self.bomb["timer"] = _CS_POST_PLANT_TICKS
                self.bomb["x"], self.bomb["y"] = carrier.x, carrier.y
                self.phase = "planted"
                self.round_max = _CS_POST_PLANT_TICKS
                self.round_time = _CS_POST_PLANT_TICKS
                carrier.role = ""
                carrier.timer = 0
                self._push_event("plant", f"T planted the bomb at site {site['id']}")

        if self.phase == "planted":
            self.bomb["timer"] = max(0, self.bomb["timer"] - 1)
            # any CT that has dwelled long enough defuses
            for u in self._alive("CT"):
                if u.state == "defuse" and u.timer >= _CS_DEFUSE_TICKS:
                    self.bomb["state"] = "defused"
                    self._push_event("defuse", f"{u.id} defused the bomb")
                    self._end_cs_round("CT")
                    return
            if self.bomb["timer"] <= 0 and self.bomb["state"] == "planted":
                self.bomb["state"] = "exploded"
                self._push_event("round_win", "Bomb detonated — T win the round")
                self._end_cs_round("T")
                return

        # ── win by elimination ──────────────────────────────────────────
        t_alive = len(self._alive("T"))
        ct_alive = len(self._alive("CT"))
        if self.phase in ("live", "planted"):
            if t_alive == 0 and self.bomb["state"] != "planted":
                self._end_cs_round("CT")
                return
            if t_alive == 0 and self.bomb["state"] == "planted":
                # bomb still ticking; CTs must defuse or time out — handled above
                pass
            if ct_alive == 0:
                self._end_cs_round("T")
                return

        # ── phase clock ─────────────────────────────────────────────────
        self.round_time = max(0, self.round_time - 1)
        if self.phase == "buy" and self.round_time <= 0:
            self.phase = "live"
            self.round_max = _CS_LIVE_TICKS
            self.round_time = _CS_LIVE_TICKS
        elif self.phase == "live" and self.round_time <= 0:
            # time expired with no plant → CT win
            self._end_cs_round("CT")
        elif self.phase == "over" and self.round_time <= 0:
            self.round += 1
            self._begin_cs_round(reset_carrier=True)

    def _end_cs_round(self, winner: str) -> None:
        if self.phase == "over":
            return
        self.score[winner] = self.score.get(winner, 0) + 1
        self._push_event("round_win", f"{winner} win round {self.round}")
        self.phase = "over"
        self.round_max = _CS_OVER_TICKS
        self.round_time = _CS_OVER_TICKS
        for u in self.units:
            u.firing = False
            if u.hp <= 0:
                u.state = "dead"

    # ════════════════════════════════════════════════════════════════════
    #  PANOPTICON
    # ════════════════════════════════════════════════════════════════════
    def _build_objectives(self) -> None:
        pts = [(28.0, 30.0), (72.0, 34.0), (50.0, 68.0), (24.0, 74.0)]
        self.objectives = [
            {"id": f"OBJ{i+1}", "x": x, "y": y, "state": "secure", "_dwell": 0, "_down": 0}
            for i, (x, y) in enumerate(pts)
        ]

    def _patrol_route(self, idx: int) -> list[tuple[float, float]]:
        """A small per-agent rectangular beat around the objective cluster."""
        cx, cy = 50.0, 50.0
        ang0 = (idx / max(1, self.team_sizes[0])) * 2 * math.pi
        ring = 22.0 + (idx % 3) * 8.0
        return [
            (cx + ring * math.cos(ang0 + k * math.pi / 2),
             cy + ring * math.sin(ang0 + k * math.pi / 2))
            for k in range(4)
        ]

    def _intruder_spawn(self) -> tuple[float, float]:
        edge = self.rng.randint(0, 3)
        p = self.rng.random() * 100.0
        return [(p, 1.0), (p, 99.0), (1.0, p), (99.0, p)][edge]

    def _spawn_panopticon(self) -> None:
        self.units = []
        agents, intruders = self.team_sizes
        for i in range(agents):
            route = self._patrol_route(i)
            x, y = route[0]
            self.units.append(
                Unit(
                    id=f"AGENT{i+1}",
                    team="AGENT",
                    x=x,
                    y=y,
                    tx=route[1 % len(route)][0],
                    ty=route[1 % len(route)][1],
                    spawn=(x, y),
                    weapon="taser",
                    state="patrol",
                    wp=1,
                )
            )
        for i in range(intruders):
            x, y = self._intruder_spawn()
            self.units.append(
                Unit(
                    id=f"INTRUDER{i+1}",
                    team="INTRUDER",
                    x=x,
                    y=y,
                    tx=x,
                    ty=y,
                    spawn=(x, y),
                    weapon="cutter",
                    state="breach",
                )
            )

    def _alert_name(self) -> str:
        return ("calm", "suspicious", "alarmed")[self.alert]

    def _nearest_open_asset(self, u: Unit) -> dict[str, Any] | None:
        best = None
        bestd = 1e9
        for o in self.objectives:
            if o["state"] == "breached":
                continue
            d = math.hypot(u.x - o["x"], u.y - o["y"])
            if d < bestd:
                bestd = d
                best = o
        return best

    def _advance_pano(self) -> None:
        step = 1.1
        intr_step = 0.95
        vision = 16.0
        contact_this_tick = False
        agents = [u for u in self.units if u.team == "AGENT"]
        intruders = [u for u in self.units if u.team == "INTRUDER"]

        # ── intruder movement & breaching ───────────────────────────────
        for u in intruders:
            if u.hp <= 0:  # captured & cooling down
                u.timer -= 1
                u.state = "captured"
                if u.timer <= 0:
                    u.hp = 100
                    u.x, u.y = self._intruder_spawn()
                    u.spawn = (u.x, u.y)
                    u.state = "breach"
                continue
            target = self._nearest_open_asset(u)
            if target is None:
                u.state = "flee"
                self._step_toward(u, u.spawn[0], u.spawn[1], intr_step)
                continue
            u.aimx, u.aimy = target["x"], target["y"]
            on_asset = math.hypot(u.x - target["x"], u.y - target["y"]) < 5.0
            if on_asset:
                u.state = "breach"
                target["_dwell"] += 1
                if target["state"] == "secure":
                    target["state"] = "contested"
                if target["_dwell"] >= _PANO_BREACH_TICKS and target["state"] != "breached":
                    target["state"] = "breached"
                    target["_down"] = _PANO_ASSET_RESET_TICKS
                    target["_dwell"] = 0
                    self.breaches += 1
                    self._push_event("breach", f"{u.id} breached {target['id']}")
            else:
                u.state = "breach"
                self._step_toward(u, target["x"], target["y"], intr_step)

        # ── agent perception & movement ─────────────────────────────────
        for a in agents:
            detected: Unit | None = None
            bestd = vision
            for it in intruders:
                if it.hp <= 0:
                    continue
                d = math.hypot(a.x - it.x, a.y - it.y)
                if d > bestd:
                    continue
                # roughly "in front": aim vector aligned with bearing to intruder
                fx, fy = a.aimx - a.x, a.aimy - a.y
                bx, by = it.x - a.x, it.y - a.y
                flen = math.hypot(fx, fy)
                blen = math.hypot(bx, by) or 1.0
                facing = 1.0 if flen < 1e-6 else (fx * bx + fy * by) / (flen * blen)
                # alarmed agents have 360° awareness; calm need a frontal cone
                if self.alert >= 2 or facing > 0.1 or d < _PANO_CAPTURE_RADIUS * 1.5:
                    bestd = d
                    detected = it

            if detected is not None:
                contact_this_tick = True
                if a.state not in ("pursue",):
                    self._push_event("detect", f"{a.id} detected {detected.id}")
                a.state = "pursue"
                a.aimx, a.aimy = detected.x, detected.y
                if math.hypot(a.x - detected.x, a.y - detected.y) <= _PANO_CAPTURE_RADIUS:
                    detected.hp = 0
                    detected.deaths += 1
                    detected.timer = _PANO_RESPAWN_TICKS
                    detected.state = "captured"
                    a.kills += 1
                    self.intrusions_stopped += 1
                    self._push_event("detect", f"{a.id} neutralised {detected.id}")
                else:
                    self._step_toward(a, detected.x, detected.y, step)
            else:
                # converge on the global alert if alarmed, else patrol the beat
                if self.alert >= 1 and intruders:
                    # head toward the most-threatened open asset
                    threat = min(
                        (o for o in self.objectives if o["state"] != "breached"),
                        key=lambda o: min(
                            (math.hypot(o["x"] - it.x, o["y"] - it.y) for it in intruders if it.hp > 0),
                            default=1e9,
                        ),
                        default=None,
                    )
                    if threat is not None:
                        a.state = "investigate"
                        a.aimx, a.aimy = threat["x"], threat["y"]
                        self._step_toward(a, threat["x"], threat["y"], step)
                    else:
                        a.state = "patrol"
                else:
                    a.state = "patrol"
                    route = self._patrol_route(int(a.id.replace("AGENT", "")) - 1)
                    a.aimx, a.aimy = route[a.wp % len(route)]
                    if self._step_toward(a, route[a.wp % len(route)][0], route[a.wp % len(route)][1], step):
                        a.wp = (a.wp + 1) % len(route)

        # ── asset recovery ──────────────────────────────────────────────
        for o in self.objectives:
            if o["state"] == "breached":
                o["_down"] -= 1
                if o["_down"] <= 0:
                    o["state"] = "secure"
                    o["_dwell"] = 0
            else:
                # if no intruder is sitting on it, it cools back to secure
                occupied = any(
                    it.hp > 0 and math.hypot(it.x - o["x"], it.y - o["y"]) < 5.0
                    for it in intruders
                )
                if not occupied:
                    o["_dwell"] = max(0, o["_dwell"] - 1)
                    if o["_dwell"] == 0 and o["state"] == "contested":
                        o["state"] = "secure"

        # ── alert level escalation / decay ──────────────────────────────
        if contact_this_tick:
            self._alert_cooldown = 0
            if self.alert < 2:
                # escalate one notch when a contact happens
                if self.tick % 3 == 0:
                    self.alert = min(2, self.alert + 1)
        else:
            self._alert_cooldown += 1
            if self._alert_cooldown >= _PANO_ALERT_DECAY_TICKS and self.alert > 0:
                self.alert -= 1
                self._alert_cooldown = 0

        self.phase = ("patrol", "suspicious", "alarmed")[self.alert]
        self.score = {"AGENT": self.intrusions_stopped, "INTRUDER": self.breaches}

    # ── simulation step driver ───────────────────────────────────────────
    def _advance(self, steps: int) -> None:
        for _ in range(steps):
            self.tick += 1
            if self.mode == "counterstrike":
                self._advance_cs()
            else:
                self._advance_pano()

    def step_to_now(self, hz: float = _DEFAULT_HZ) -> None:
        now = time.time()
        steps = int((now - self.last) * hz)
        if steps <= 0:
            return
        steps = min(steps, _CATCHUP_CAP)
        self.last = now
        self._advance(steps)

    # ── output ────────────────────────────────────────────────────────────
    def _unit_frame(self, u: Unit) -> dict[str, Any]:
        return {
            "id": u.id,
            "team": u.team,
            "worldX": round(u.x, 2),
            "worldY": round(u.y, 2),
            "hp": u.hp,
            "state": u.state,
            "weapon": u.weapon,
            "kills": u.kills,
            "deaths": u.deaths,
            "aimX": round(u.aimx, 2),
            "aimY": round(u.aimy, 2),
            "firing": bool(u.firing),
        }

    def frame(self) -> dict[str, Any]:
        b = self._b()
        out: dict[str, Any] = {
            "map": self.map_name,
            "tick": self.tick,
            "round": self.round,
            "bounds": b,
            "mode": self.mode,
            "phase": self.phase,
            "round_time": round(self.round_time / _DEFAULT_HZ, 1),
            "round_max": round(self.round_max / _DEFAULT_HZ, 1),
            "score": dict(self.score),
            "events": [dict(e) for e in self.events],
            "units": [self._unit_frame(u) for u in self.units],
        }
        if self.mode == "counterstrike":
            out["bombsites"] = [dict(s) for s in self.bombsites]
            out["bomb"] = {
                "state": self.bomb.get("state", "held"),
                "x": round(self.bomb.get("x", 0.0), 2),
                "y": round(self.bomb.get("y", 0.0), 2),
                "timer": round(self.bomb.get("timer", 0) / _DEFAULT_HZ, 1),
                "site": self.bomb.get("site"),
            }
        else:
            out["objectives"] = [
                {"id": o["id"], "x": o["x"], "y": o["y"], "state": o["state"]}
                for o in self.objectives
            ]
            out["alert_level"] = self._alert_name()
            out["intrusions_stopped"] = self.intrusions_stopped
            out["breaches"] = self.breaches
        return out


# ── map bounds ───────────────────────────────────────────────────────────────
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
        mode="counterstrike",
    ),
    "panopticon": GameSim(
        key="panopticon",
        maps=list(_PANO_BOUNDS),
        bounds=_PANO_BOUNDS,
        teams=("AGENT", "INTRUDER"),
        team_sizes=(6, 3),
        mode="panopticon",
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
