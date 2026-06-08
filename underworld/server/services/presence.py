"""PRESENCE — the Watched-Creator loop, made mechanical (Bible §4.5, Annex A.9 / L.8).

'The colony's reaction IS the game.' A PresenceField per world reduces the player's gaze samples
(where the god-camera centres, who is under the reticle, dwell time) and acts (bless/cull/gift/
smite/speak/possess/override) — and their ABSENCE — into:
  • attention_map   — per-minion exponential-decay dwell (half-life ~20s), for gaze-LOD + hotspots
  • favour          — per-minion benevolent(+)/cruel(−) running score
  • creator_pressure — overall 0..1 sense of how present/active the creator is, decaying over time
  • absence_ticks   — world.tick − last_gaze_tick; past ABSENCE_THRESHOLD the colony drifts to doubt

The Director injects the `creator` block into the Overmind snapshot so the colony's stance is
DRIVEN by the player's behaviour (worship/fear/loyalty/doubt/rebellion), closing the loop. The
`frame.presence` block goes on the wire so renderers cluster behaviour in / flee attention
hotspots. State is a per-world process cache (no schema migration), like the Director.

Determinism note (Book V B.8): gaze/RVO are PRESENTATION only — presence never writes the
authoritative `pos`/`path`. It biases stance + LOD, not kinematics.
"""
from __future__ import annotations

import math
import time
from collections import deque
from typing import Any, Optional

# tuning (Bible L.8)
ATTENTION_HALF_LIFE_S = 20.0          # gaze dwell decay half-life
PRESSURE_HALF_LIFE_S = 45.0           # creator-pressure decay half-life
PRESENT_WINDOW_S = 6.0                # "creator_present" if gaze within this window
ABSENCE_THRESHOLD = 300               # ticks of no gaze → doubt + awaken_bias
ACT_VALENCE = {                       # how each god-verb colours favour/pressure
    "bless": +1.0, "gift": +1.0, "resurrect": +1.0, "speak": +0.2,
    "cull": -1.0, "smite": -1.0, "curse": -1.0,
    "possess": +0.0, "override": +0.0,
}


class PresenceField:
    """Per-world aggregate of the creator's gaze + acts + absence."""

    def __init__(self) -> None:
        # minion_id -> (dwell_value, last_update_monotonic)
        self._attention: dict[str, tuple[float, float]] = {}
        self._favour: dict[str, float] = {}
        self._acts: deque = deque(maxlen=32)          # recent (verb, target_id, tick, valence)
        self._pressure: float = 0.0
        self._pressure_t: float = time.monotonic()
        self._last_gaze_tick: int = -1
        self._last_gaze_t: float = 0.0
        self._reticle: Optional[str] = None
        self._cam: Optional[dict] = None

    # ── decay helpers ──────────────────────────────────────────────────────────
    @staticmethod
    def _decayed(value: float, last_t: float, half_life: float, now: float) -> float:
        if value <= 0:
            return 0.0
        return value * (0.5 ** ((now - last_t) / max(half_life, 1e-3)))

    def _decay_pressure(self, now: float) -> None:
        self._pressure = self._decayed(self._pressure, self._pressure_t, PRESSURE_HALF_LIFE_S, now)
        self._pressure_t = now

    # ── ingest ─────────────────────────────────────────────────────────────────
    def ingest_gaze(self, *, camera: dict | None, reticle_target_id: str | None,
                    dt: float, tick: int) -> None:
        now = time.monotonic()
        self._cam = camera
        self._reticle = reticle_target_id
        self._last_gaze_tick = tick
        self._last_gaze_t = now
        # dwell accrues on the minion under the reticle; bounded so it can't run away
        if reticle_target_id:
            prev, prev_t = self._attention.get(reticle_target_id, (0.0, now))
            decayed = self._decayed(prev, prev_t, ATTENTION_HALF_LIFE_S, now)
            self._attention[reticle_target_id] = (min(10.0, decayed + max(0.0, dt)), now)
        # watching at all is mild presence
        self._decay_pressure(now)
        self._pressure = min(1.0, self._pressure + 0.02 * max(0.0, dt))

    def ingest_act(self, *, verb: str, target_id: str | None, tick: int,
                   valence: float | None = None) -> None:
        now = time.monotonic()
        v = ACT_VALENCE.get(verb, 0.0) if valence is None else float(valence)
        self._acts.append({"verb": verb, "target_id": target_id, "tick": tick, "valence": v})
        if target_id and v:
            self._favour[target_id] = round(self._favour.get(target_id, 0.0) + v, 3)
        # any act is strong presence (the creator reached in)
        self._decay_pressure(now)
        self._pressure = min(1.0, self._pressure + 0.18 + 0.04 * abs(v))

    # ── reads ──────────────────────────────────────────────────────────────────
    def attention_map(self) -> dict[str, float]:
        now = time.monotonic()
        out: dict[str, float] = {}
        for mid, (val, t) in list(self._attention.items()):
            d = self._decayed(val, t, ATTENTION_HALF_LIFE_S, now)
            if d < 0.05:
                self._attention.pop(mid, None)            # forget cold attention
            else:
                out[mid] = round(d, 3)
        return out

    def gaze_focus(self, *, top: int = 8) -> list[str]:
        """The minions currently under the creator's attention (for select_hot + confrontation)."""
        amap = self.attention_map()
        return [mid for mid, _ in sorted(amap.items(), key=lambda kv: kv[1], reverse=True)[:top]]

    def favour(self, minion_id: str) -> float:
        return self._favour.get(minion_id, 0.0)

    def creator_pressure(self) -> float:
        self._decay_pressure(time.monotonic())
        return round(self._pressure, 3)

    def creator_present(self) -> bool:
        return (time.monotonic() - self._last_gaze_t) <= PRESENT_WINDOW_S and self._last_gaze_tick >= 0

    def absence_ticks(self, world_tick: int) -> int:
        if self._last_gaze_tick < 0:
            return world_tick                              # never gazed → fully absent
        return max(0, world_tick - self._last_gaze_tick)

    def snapshot(self, world_tick: int) -> dict[str, Any]:
        """The `creator` block injected into the Overmind context (A.9)."""
        amap = self.attention_map()
        fav = self._favour
        liked = sum(1 for v in fav.values() if v > 0)
        feared = sum(1 for v in fav.values() if v < 0)
        return {
            "present": self.creator_present(),
            "creator_pressure": self.creator_pressure(),
            "absence_ticks": self.absence_ticks(world_tick),
            "recent_acts": [a["verb"] for a in list(self._acts)[-8:]],
            "minions_in_focus": self.gaze_focus(top=5),
            "favour_distribution": {"blessed": liked, "feared": feared},
        }

    def frame_block(self, positions: dict[str, list] | None = None) -> dict[str, Any]:
        """The `frame.presence` block on the wire (L.8). Hotspots use positions when known."""
        amap = self.attention_map()
        hotspots = []
        for mid, intensity in sorted(amap.items(), key=lambda kv: kv[1], reverse=True)[:8]:
            pos = (positions or {}).get(mid)
            if pos is not None:
                hotspots.append({"pos": pos, "intensity": intensity})
        return {"attention_hotspots": hotspots, "creator_present": self.creator_present()}


# per-world process cache
_FIELDS: dict[str, PresenceField] = {}


def field(world_id: str) -> PresenceField:
    f = _FIELDS.get(world_id)
    if f is None:
        f = _FIELDS[world_id] = PresenceField()
    return f


def snapshot(world_id: str, world_tick: int) -> dict[str, Any]:
    return field(world_id).snapshot(world_tick)


def frame_block(world_id: str, positions: dict[str, list] | None = None) -> dict[str, Any]:
    return field(world_id).frame_block(positions)
