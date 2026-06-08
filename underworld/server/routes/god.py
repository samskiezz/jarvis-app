"""GOD ROUTES — the creator's verbs (Bible §4.3/§4.6 System 6, Annex B-3 / L.8).

The ingress for the Watched-Creator loop and the god-powers:
  • POST /worlds/{id}/player/gaze  — gaze samples feed the PresenceField (attention/absence).
  • POST /worlds/{id}/player/act   — bless/gift/cull/smite/resurrect/speak/override, each routed
    through the single B-3 pipeline: authn → (authz) → dedup → rate-limit/cooldown → moderate →
    apply (Event kind=divine_act, append-only audit) → publish (feed presence + Overmind).

Per-verb rate/cooldown are the canonical B-3 numbers; a global per-world ceiling protects the
single sim coroutine. Enforced in-handler (cost-aware); the declarative gateway tier is I1.

Caveats tracked against Book V: world-ownership AUTHZ needs accounts/JWT-with-world-grants (EPIC
I1, not built) — this uses the existing bearer as authn and carries player_id now so multiplayer
arbitration can land later. The moderation here is a minimal gate; the real 4-gate launch-blocker
is EPIC I2 / Annex L.11.
"""
from __future__ import annotations

import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import CauseOfDeath, Event, Memory, Minion, World
from ..db.session import get_session
from ..services import director, override as override_mod, presence as presence_mod

router = APIRouter(prefix="/worlds", tags=["god"])

# ── B-3 canonical per-verb rate/cooldown ──────────────────────────────────────────────
#   verb_class -> (capacity, window_s, cooldown_s)
_LIMITS: dict[str, tuple[int, float, float]] = {
    "harm":      (5, 60.0, 3.0),     # cull / smite — grief/DoS + tick stall
    "resurrect": (3, 300.0, 10.0),   # narrative-cheapening + cost
    "favour":    (30, 60.0, 0.5),    # bless / gift — favour inflation
    "speak":     (10, 60.0, 2.0),    # LLM-cost + injection surface
    "override":  (20, 60.0, 0.5),
}
_VERB_CLASS = {"cull": "harm", "smite": "harm", "curse": "harm", "resurrect": "resurrect",
               "bless": "favour", "gift": "favour", "speak": "speak", "override": "override"}
_GLOBAL_CEIL_PER_S = 50          # per-world god-writes/s ceiling (protects the sim coroutine)

# in-process token buckets + idempotency cache (per-world, no schema migration)
_BUCKETS: dict[tuple[str, str], dict] = {}     # (world, verb_class) -> {tokens, last_refill, last_use}
_GLOBAL: dict[str, dict] = {}                   # world -> {count, sec}
_IDEMPOTENCY: dict[str, tuple[float, dict]] = {}   # key -> (ts, result)


def _rate_ok(world_id: str, verb_class: str) -> tuple[bool, str]:
    now = time.monotonic()
    cap, window, cooldown = _LIMITS.get(verb_class, (20, 60.0, 0.5))
    b = _BUCKETS.setdefault((world_id, verb_class), {"tokens": float(cap), "last_refill": now, "last_use": 0.0})
    # refill
    b["tokens"] = min(cap, b["tokens"] + (now - b["last_refill"]) * (cap / window))
    b["last_refill"] = now
    if now - b["last_use"] < cooldown:
        return False, f"cooldown ({cooldown}s) for {verb_class}"
    if b["tokens"] < 1.0:
        return False, f"rate limit ({cap}/{int(window)}s) for {verb_class}"
    # global per-world ceiling
    sec = int(now)
    g = _GLOBAL.setdefault(world_id, {"count": 0, "sec": sec})
    if g["sec"] != sec:
        g["sec"], g["count"] = sec, 0
    if g["count"] >= _GLOBAL_CEIL_PER_S:
        return False, "world god-write ceiling"
    b["tokens"] -= 1.0
    b["last_use"] = now
    g["count"] += 1
    return True, ""


def _moderate(text: str) -> tuple[bool, str]:
    """Minimal gate (the real 4-gate moderation is EPIC I2). Reject empty / over-long / LLM-error
    echoes; strip control chars. Never lets a '// LLM error' or '[STUB' string through (L.12)."""
    t = (text or "").strip()
    if not t:
        return False, ""
    if t.startswith("// LLM") or t.startswith("[STUB"):
        return False, ""
    t = "".join(ch for ch in t if ch == "\n" or ord(ch) >= 32)[:280]
    return True, t


class GazeRequest(BaseModel):
    camera: dict | None = None
    reticle_target_id: str | None = None
    dt: float = 0.5


class ActRequest(BaseModel):
    verb: str
    target_id: str | None = None
    params: dict[str, Any] = {}
    idempotency_key: str | None = None


async def _world_or_404(session: AsyncSession, world_id: str) -> World:
    w = await session.get(World, world_id)
    if not w:
        raise HTTPException(status_code=404, detail="world not found")
    return w


@router.post("/{world_id}/player/gaze")
async def player_gaze(
    world_id: str,
    body: GazeRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Feed the PresenceField a gaze sample (where the god-camera looks + who is under the
    reticle). Drives attention hotspots, gaze-LOD, confrontation gating, and absence."""
    world = await _world_or_404(session, world_id)
    presence_mod.field(world_id).ingest_gaze(
        camera=body.camera, reticle_target_id=body.reticle_target_id,
        dt=max(0.0, min(5.0, body.dt)), tick=world.tick)
    return {"ok": True, "tick": world.tick}


async def _apply_verb(session: AsyncSession, world: World, verb: str, target: Optional[Minion],
                      params: dict, player_id: str) -> dict[str, Any]:
    """Apply a god-verb's real effect. Returns the result payload. Visible acts write a
    high-importance divine_act memory on the target (A.7) so the colony remembers."""
    tick = world.tick
    valence = 0.0
    detail = ""
    if verb in ("cull", "smite"):
        if target is None:
            raise HTTPException(status_code=400, detail="target required")
        target.alive = False
        target.died_tick = tick
        target.cause_of_death = CauseOfDeath.PRUNED
        if verb == "smite":
            target.brain = {**(target.brain or {}), "smitten_tick": tick}
        valence, detail = -1.0, f"the creator {'smites' if verb=='smite' else 'culls'} {target.name}"
    elif verb == "resurrect":
        if target is None:
            raise HTTPException(status_code=400, detail="target required")
        target.alive = True
        target.died_tick = None
        target.cause_of_death = None
        valence, detail = 1.0, f"the creator raises {target.name} from death"
    elif verb == "bless":
        if target is None:
            raise HTTPException(status_code=400, detail="target required")
        target.reputation = (target.reputation or 1.0) + 0.5
        target.morale = min(1.0, (target.morale if target.morale is not None else 0.5) + 0.1)
        valence, detail = 1.0, f"the creator blesses {target.name}"
    elif verb == "gift":
        if target is None:
            raise HTTPException(status_code=400, detail="target required")
        target.karma = (target.karma or 0.0) + float(params.get("amount", 1.0))
        valence, detail = 1.0, f"the creator gifts {target.name}"
    elif verb == "speak":
        ok, text = _moderate(str(params.get("text", "")))
        if not ok:
            raise HTTPException(status_code=400, detail="empty or rejected message")
        detail, valence = f"the creator speaks: “{text}”", 0.2
        if target is not None:
            session.add(Memory(minion_id=target.id, tick=tick, kind="divine_word",
                               content=text, importance=0.95))
    elif verb == "override":
        # params: {scope, field, value, mode, ttl_ticks, visible}
        ov = override_mod.Override(
            scope=str(params.get("scope", "decision")), target_id=(target.id if target else ""),
            field=str(params.get("field", "")), value=params.get("value"),
            mode=str(params.get("mode", "set")), ttl_ticks=int(params.get("ttl_ticks", 30)),
            created_tick=tick, visible=bool(params.get("visible", True)),
            player_id=player_id, valence=float(params.get("valence", 0.0)))
        applied = override_mod.bus(world.id).apply(ov)
        if applied is None:
            raise HTTPException(status_code=400, detail="override rejected (bad scope/mode)")
        valence, detail = ov.valence, f"the creator overrides {ov.field or ov.scope}"
    else:
        raise HTTPException(status_code=400, detail=f"unknown verb '{verb}'")

    # visible benevolent/cruel acts on a minion become a remembered divine act (A.7).
    if target is not None and verb in ("bless", "gift", "cull", "smite", "resurrect"):
        session.add(Memory(minion_id=target.id, tick=tick, kind="divine_act",
                           content=detail, importance=0.95))
    return {"valence": valence, "detail": detail}


@router.post("/{world_id}/player/act")
async def player_act(
    world_id: str,
    body: ActRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
    x_player_id: str = Header(default="creator"),
):
    """A god-verb, through the B-3 pipeline. Authn (bearer) → dedup → rate-limit/cooldown →
    moderate (speak) → apply + audit Event(divine_act) → publish (presence + Overmind feed)."""
    verb = (body.verb or "").lower()
    verb_class = _VERB_CLASS.get(verb)
    if verb_class is None:
        raise HTTPException(status_code=400, detail=f"unknown verb '{verb}'")

    # dedup (idempotency within 60s)
    if body.idempotency_key:
        cached = _IDEMPOTENCY.get(body.idempotency_key)
        if cached and time.monotonic() - cached[0] < 60.0:
            return cached[1]

    # rate-limit / cooldown / global ceiling
    ok, why = _rate_ok(world_id, verb_class)
    if not ok:
        raise HTTPException(status_code=429, detail=why)

    world = await _world_or_404(session, world_id)
    target = await session.get(Minion, body.target_id) if body.target_id else None
    if body.target_id and target is None:
        raise HTTPException(status_code=404, detail="target minion not found")

    res = await _apply_verb(session, world, verb, target, body.params or {}, x_player_id)

    # append-only audit (Event kind=divine_act) — feeds the Overmind's recent_events (the loop).
    session.add(Event(world_id=world.id, tick=world.tick, kind="divine_act", actor_id=x_player_id,
                      payload={"verb": verb, "target_id": body.target_id,
                               "summary": res["detail"], "valence": res["valence"]}))
    await session.commit()

    # publish into the PresenceField (drives stance) + fire a God-beat if it forced a turning point.
    presence_mod.field(world.id).ingest_act(verb=verb, target_id=body.target_id,
                                            tick=world.tick, valence=res["valence"])
    result = {"ok": True, "verb": verb, "target_id": body.target_id,
              "summary": res["detail"], "tick": world.tick}
    if body.idempotency_key:
        _IDEMPOTENCY[body.idempotency_key] = (time.monotonic(), result)
    return result
