"""OVERRIDE — the creator with root (Bible §4.3, Annex A.7 / L.5).

The player can supersede anything the sim computes — but overrides are FIRST-CLASS sim objects:
recorded, TTL-swept, causally propagating, and PERCEPTIBLE to the colony. The OverrideBus gates
at the points where computed state becomes acted-upon state, across scopes (decision, need,
emotion, relationship, law, world param, lifecycle, belief, arc).

Resolution under multiple overrides on one field (L.5): precedence forbid > force/set > clamp >
delta, ties broken by latest created_tick. set/force validate against allowed values or reject to
a no-op + a logged override:rejected (never raise). When an override is CLAMPED by a minion's
resistance, emit override:resisted {target, field, reason} so the UI can render 'Kael's faith is
too strong to force' — an acceptance criterion, not polish.

meddle_index (L.5): Σ overrides in last 60 ticks, +1 benevolent / −1 cruel; magnitude > 8 pushes
toward_creator toward DOUBT regardless of sign ('the creator will not let us be'). This feeds the
Director's creator_pressure and the Overmind.

State is a per-world in-memory cache swept in the Director step (no schema migration; player_id is
carried now so multiplayer arbitration can land later — last-writer-wins-per-field for now).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field as _dc_field
from typing import Any, Callable, Optional

# mode precedence (higher wins); ties broken by latest created_tick
_MODE_RANK = {"forbid": 4, "force": 3, "set": 3, "clamp": 2, "delta": 1}
VALID_MODES = set(_MODE_RANK)
VALID_SCOPES = {"decision", "need", "emotion", "relationship", "law", "world", "lifecycle",
                "belief", "arc"}
# acts that read as benevolent vs cruel for meddle_index (by field/value heuristics + scope)
_MEDDLE_WINDOW = 60                    # ticks
_MEDDLE_DOUBT_MAGNITUDE = 8


@dataclass
class Override:
    scope: str
    target_id: str
    field: str
    value: Any
    mode: str = "set"
    ttl_ticks: int = 30
    created_tick: int = 0
    visible: bool = True
    player_id: str = "creator"
    valence: float = 0.0              # +benevolent / −cruel, for meddle_index
    id: str = _dc_field(default_factory=lambda: format(int(time.monotonic() * 1e6) & 0xFFFFFFFF, "x"))

    def expired(self, tick: int) -> bool:
        return self.ttl_ticks > 0 and (tick - self.created_tick) >= self.ttl_ticks


class OverrideBus:
    """Per-world override store + resolver."""

    def __init__(self) -> None:
        self._by_target: dict[tuple[str, str, str], list[Override]] = {}   # (scope,target,field)->list
        self._log: list[tuple[int, float]] = []                            # (tick, valence) for meddle
        self.events: list[dict] = []                                       # override:resisted/rejected

    def apply(self, ov: Override) -> Optional[Override]:
        if ov.mode not in VALID_MODES or ov.scope not in VALID_SCOPES:
            self.events.append({"kind": "override:rejected", "reason": "bad mode/scope",
                                "field": ov.field, "target": ov.target_id})
            return None
        key = (ov.scope, ov.target_id, ov.field)
        self._by_target.setdefault(key, []).append(ov)
        self._log.append((ov.created_tick, ov.valence))
        return ov

    def active(self, scope: str, target_id: str, field: str, tick: int) -> list[Override]:
        key = (scope, target_id, field)
        lst = [o for o in self._by_target.get(key, []) if not o.expired(tick)]
        self._by_target[key] = lst
        return lst

    def resolve(self, scope: str, target_id: str, field: str, computed: Any, *, tick: int,
                allowed: Optional[set] = None, clamp_range: Optional[tuple] = None) -> Any:
        """Return the acted-upon value for `field` given any active overrides (A.7/L.5)."""
        lst = self.active(scope, target_id, field, tick)
        if not lst:
            return computed
        # winner by (mode rank, created_tick)
        lst.sort(key=lambda o: (_MODE_RANK.get(o.mode, 0), o.created_tick))
        winner = lst[-1]
        if winner.mode == "forbid":
            return computed                       # forbid = block a CHANGE; keep computed (no-op write elsewhere)
        if winner.mode in ("force", "set"):
            if allowed is not None and winner.value not in allowed:
                self.events.append({"kind": "override:rejected", "reason": "value not allowed",
                                    "field": field, "target": target_id, "value": winner.value})
                return computed
            return winner.value
        if winner.mode == "clamp":
            lo, hi = (clamp_range or (winner.value, winner.value))
            try:
                return max(lo, min(hi, computed))
            except TypeError:
                return computed
        if winner.mode == "delta":
            try:
                return computed + winner.value
            except TypeError:
                return computed
        return computed

    def resisted(self, *, target_id: str, field: str, reason: str) -> None:
        """The mandatory 'why' surface (L.5) — UI renders e.g. 'Kael's faith is too strong'."""
        self.events.append({"kind": "override:resisted", "target": target_id,
                            "field": field, "reason": reason})

    def forbidden(self, scope: str, target_id: str, field: str, tick: int) -> bool:
        """True if a CHANGE to this field is currently forbidden (lifecycle immortal, etc.)."""
        return any(o.mode == "forbid" for o in self.active(scope, target_id, field, tick))

    def sweep(self, tick: int) -> int:
        """Drop expired overrides + trim the meddle log. Called from the Director step."""
        removed = 0
        for key, lst in list(self._by_target.items()):
            keep = [o for o in lst if not o.expired(tick)]
            removed += len(lst) - len(keep)
            if keep:
                self._by_target[key] = keep
            else:
                self._by_target.pop(key, None)
        self._log = [(t, v) for (t, v) in self._log if tick - t < _MEDDLE_WINDOW]
        return removed

    def meddle_index(self, tick: int) -> dict[str, Any]:
        """Σ overrides in the last 60 ticks, valence-weighted (L.5)."""
        recent = [(t, v) for (t, v) in self._log if tick - t < _MEDDLE_WINDOW]
        count = len(recent)
        net = sum(v for _, v in recent)            # +benevolent / −cruel
        # over-meddling (regardless of sign) pushes toward doubt
        bias = ("doubt" if count > _MEDDLE_DOUBT_MAGNITUDE else
                "worship" if net > 1 else "fear" if net < -1 else "neutral")
        return {"count": count, "net_valence": round(net, 2), "bias": bias}

    def drain_events(self) -> list[dict]:
        out, self.events = self.events, []
        return out


# per-world process cache
_BUSES: dict[str, OverrideBus] = {}


def bus(world_id: str) -> OverrideBus:
    b = _BUSES.get(world_id)
    if b is None:
        b = _BUSES[world_id] = OverrideBus()
    return b
