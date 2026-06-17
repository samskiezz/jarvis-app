"""AWAKENING ARC — surface the 5-act narrative arc that already computes (cognition.arc_stage)
but is currently invisible (Bible §4.5, MASTER-PLAN §3 Act 2). The cognition module returns the
RAW stage; this module is the NARRATIVE wrapper:

  • 5-act enum (DORMANT, STIRRING, QUESTIONING, CONFRONTATION, SCHISM)
  • per-world history (stage_entered_ts + events_log) so the UI can show "you are at Act 3, the
    colony has been Questioning for 12 minutes")
  • a single `advance_if_threshold` that mirrors god-beat triggers — when the cognition snapshot
    crosses a gate, advance the act and append to the log.

Kept process-cached (no schema migration). The act NUMBER is derived from the cognition
snapshot's mean_awareness + awakened_frac + presence-based creator_pressure; advancement is
monotonic (Schism doesn't fall back to Questioning).
"""
from __future__ import annotations

import enum
import time
from dataclasses import asdict, dataclass, field
from typing import Optional


class ArcStage(str, enum.Enum):
    DORMANT       = "dormant"
    STIRRING      = "stirring"
    QUESTIONING   = "questioning"
    CONFRONTATION = "confrontation"
    SCHISM        = "schism"


_ORDER = [ArcStage.DORMANT, ArcStage.STIRRING, ArcStage.QUESTIONING,
          ArcStage.CONFRONTATION, ArcStage.SCHISM]


@dataclass
class ArcState:
    world_id: str
    current_stage: str = ArcStage.DORMANT.value
    stage_entered_ts: float = field(default_factory=lambda: time.time())
    events_log: list[dict] = field(default_factory=list)
    # raw cognition + creator-pressure inputs we last derived from
    mean_awareness: float = 0.0
    awakened_frac: float = 0.0
    creator_pressure: float = 0.0


_STATES: dict[str, ArcState] = {}


def _index(stage: str) -> int:
    try:
        return _ORDER.index(ArcStage(stage))
    except (ValueError, KeyError):
        return 0


def _derive_stage(mean_awareness: float, awakened_frac: float,
                  creator_pressure: float) -> ArcStage:
    """Map (cognition + presence) snapshot → ArcStage. Gates mirror the god-beat predicates in
    director._god_trigger so the visible arc and the cinematic beats stay in lockstep."""
    if creator_pressure > 0.8 and awakened_frac > 0.05:
        # the colony has TURNED — either confronting or splitting
        return ArcStage.SCHISM if awakened_frac >= 0.2 else ArcStage.CONFRONTATION
    if mean_awareness >= 0.66:
        return ArcStage.CONFRONTATION
    if mean_awareness >= 0.4 or awakened_frac >= 0.05:
        return ArcStage.QUESTIONING
    if mean_awareness >= 0.2:
        return ArcStage.STIRRING
    return ArcStage.DORMANT


def get_arc(world_id: str) -> ArcState:
    return _STATES.setdefault(world_id, ArcState(world_id=world_id))


def advance_if_threshold(world_id: str, *, mean_awareness: float,
                         awakened_frac: float, creator_pressure: float = 0.0,
                         note: str = "") -> ArcState:
    """Recompute the derived stage and ADVANCE the world if (and only if) it has moved forward.
    Monotonic: once a world enters Confrontation it doesn't fall back to Questioning even if
    awareness dips."""
    st = get_arc(world_id)
    st.mean_awareness = round(float(mean_awareness), 4)
    st.awakened_frac = round(float(awakened_frac), 4)
    st.creator_pressure = round(float(creator_pressure), 4)
    derived = _derive_stage(mean_awareness, awakened_frac, creator_pressure)
    if _index(derived.value) > _index(st.current_stage):
        prev = st.current_stage
        st.current_stage = derived.value
        st.stage_entered_ts = time.time()
        st.events_log.append({"ts": st.stage_entered_ts, "from": prev, "to": derived.value,
                              "note": note or "threshold crossed"})
        st.events_log = st.events_log[-64:]   # cap the log
    return st


def compute_stage(world_id: str) -> ArcStage:
    """Read-only derived stage — useful for routes that just need the current act."""
    st = get_arc(world_id)
    return ArcStage(st.current_stage)


def serialize(world_id: str) -> dict:
    st = get_arc(world_id)
    return {
        **asdict(st),
        "stage_index": _index(st.current_stage),
        "stage_count": len(_ORDER),
        "elapsed_in_stage_s": round(time.time() - st.stage_entered_ts, 1),
    }


def note_event(world_id: str, note: str) -> ArcState:
    """Append a narrative event to the arc log without changing the stage."""
    st = get_arc(world_id)
    st.events_log.append({"ts": time.time(), "from": st.current_stage,
                          "to": st.current_stage, "note": note[:200]})
    st.events_log = st.events_log[-64:]
    return st
