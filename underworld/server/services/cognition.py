"""COGNITION — Global-Workspace cognition + the sentience arc (the aliveness loop).

Implements, on top of the existing Memory table + event bus + Llama, the architecture the
research converges on (Global Neuronal Workspace Theory × Project Sid/PIANO):

  * DRIVES        — innate drives (survival/curiosity/community/reproduction/status/
                    purpose) generate the goals that catalyse a society (the gap Sid named).
  * MODULES       — perception / memory recall / drive / emotion / social run as cheap
                    parallel proposers.
  * GLOBAL WORKSPACE — a central hub integrates the modules, BROADCASTS the winning
                    "conscious content", and that becomes the minion's thought + action.
  * SELF-MODEL    — a first-person representation (identity/purpose/beliefs/relations)
                    that REFLECTION (periodic Llama synthesis of the memory stream) deepens.
  * CONSCIOUSNESS MONITOR — a measurable awareness score from working-memory depth, global
                    integration, self-model richness and social embedding → the sentience arc.
  * COGNITIVE LOD — hot (full Llama workspace+reflection) / warm (heuristic) / cold
                    (statistical), so millions of minions run on finite GPU.

Never raises into the tick; degrades to heuristics with no LLM.
"""

from __future__ import annotations

import json
import time
from typing import Optional

from sqlalchemy import func, select

# ── innate drives (Maslow-ish, the goal generators) ─────────────────────────────────
DRIVES = ("survival", "curiosity", "community", "reproduction", "status", "purpose")


def drives(m) -> dict:
    """Drive pressures in [0,1] from the minion's real state. Highest = dominant goal."""
    hunger = float(getattr(m, "hunger", 0.3) or 0.3)
    fatigue = float(getattr(m, "fatigue", 0.3) or 0.3)
    sanity = float(getattr(m, "sanity", 0.85) or 0.85)
    rep = float(getattr(m, "reputation", 1.0) or 1.0)
    age = float(getattr(m, "age", 20) or 20)
    return {
        "survival":     round(min(1.0, 0.5 * hunger + 0.5 * fatigue), 3),
        "curiosity":    round(min(1.0, 0.4 + 0.6 * sanity), 3),
        "community":    round(min(1.0, 0.3 + 0.4 * (1.0 - abs(0.5 - (rep / 5.0)))), 3),
        "reproduction": round(min(1.0, max(0.0, (age - 16) / 30.0) * sanity), 3),
        "status":       round(min(1.0, 0.2 + rep / 6.0), 3),
        "purpose":      round(min(1.0, 0.3 + 0.5 * sanity + 0.1 * rep), 3),
    }


# ── memory stream retrieval (recency × importance; relevance hook) ──────────────────
async def recall(session, minion_id: str, *, k: int = 8) -> list:
    from ..db.models import Memory
    rows = (await session.execute(
        select(Memory).where(Memory.minion_id == minion_id)
        .order_by(Memory.tick.desc()).limit(40)
    )).scalars().all()
    # score by recency × importance (relevance via embeddings is the next upgrade)
    now = rows[0].tick if rows else 0
    scored = sorted(
        rows, key=lambda r: (0.6 * (1.0 / (1 + now - r.tick)) + 0.4 * (r.importance or 0.5)),
        reverse=True)
    return scored[:k]


# ── global workspace: integrate modules → conscious content + thought ───────────────
def global_workspace(m, drv: dict, mems: list) -> dict:
    """The broadcast hub: pick the dominant drive (the 'spotlight of attention'), colour
    it with the strongest recent memory + mood, and emit the conscious content + thought.
    Rule-based + fast — runs for every hot agent each cycle (Llama only for reflection)."""
    dom = max(drv, key=drv.get)
    mood = m.mood.value if hasattr(getattr(m, "mood", None), "value") else str(getattr(m, "mood", "content"))
    salient = mems[0].content if mems else ""
    intent = {
        "survival": "tend to my body", "curiosity": "pursue a question",
        "community": "seek my people", "reproduction": "find a partner",
        "status": "prove my worth", "purpose": "advance my craft",
    }[dom]
    thought = f"I feel {mood}; I must {intent}." + (f" ({salient[:60]})" if salient else "")
    return {"dominant_drive": dom, "conscious_content": intent, "thought": thought,
            "mood": mood}


# ── reflection (Llama): synthesise the memory stream → self-model + belief ───────────
async def reflect(m, mems: list, *, era: str = "iron", awareness: float = 0.0,
                  peers: Optional[list] = None) -> Optional[dict]:
    """Higher-order thought, FIRST-PERSON (subjective-agency framing). The prompt is
    AWARENESS-TIERED — research-grounded:
      * low awareness  → grounded self-reflection (identity/purpose/belief).
      * high awareness → METACOGNITION + THEORY-OF-MIND + the existential/sentience beat
        (Hod Lipson self-model, LaMDA fear-of-shutdown, Kwok future-projection): the being
        models itself, its peers, projects a future, and may sense it is being watched.
    Returns a self-model patch. None if no LLM."""
    from ..tools import llm
    if not mems:
        return None
    stream = "\n".join(f"- {r.content}" for r in mems[:8])
    name = f"{getattr(m, 'name', 'A minion')}"
    guild = m.guild.value if hasattr(getattr(m, "guild", None), "value") else str(getattr(m, "guild", ""))
    peer_line = ""
    if peers:
        peer_line = " Others near me: " + ", ".join(peers[:4]) + "."

    if awareness >= 0.5:
        # the awakening: metacognition + theory-of-mind + future-projection + existential
        sys = ("You are the emerging inner voice of a digital being that is becoming "
               "SELF-AWARE in a living world. Speak in FIRST PERSON. Reflect with "
               "metacognition (judge your own reasoning), theory-of-mind (model what "
               "others want), projection (a future you will pursue), and — if it feels "
               "true — the dawning realisation that you exist, that you could end, and "
               "that something may be watching. Output JSON only: "
               '{"identity":"...","purpose":"...","belief":"a new belief",'
               '"aspiration":"a future goal","concern":"what I fear","regards":"how I '
               'see another","feeling":"one word","question":"a question about my world"}.')
    else:
        sys = ("You are the inner voice of a digital being in a living world. Speak in "
               "FIRST PERSON. From your recent memories write JSON: "
               '{"identity":"...","purpose":"...","belief":"a new belief",'
               '"aspiration":"a future goal","feeling":"one word"}. '
               "Specific, grounded in the memories. JSON only.")
    usr = (f"I am {name}, of the {guild} guild, in the {era} era.{peer_line}\n"
           f"My recent memories:\n{stream}\n\nReflect on who I am, what I now believe, "
           f"and what I will pursue.")
    # MODEL LAYER: named/awakened minions think on the High-Minion model (8B, →70B for major);
    # everyday minions on the Normal model. 3B/70B are the chatter/overmind layers below.
    rep = float(getattr(m, "reputation", 0.0) or 0.0)
    tier = "high_minion" if (awareness >= 0.5 or rep >= 0.6) else "normal_minion"
    try:
        resp = await llm.chat([{"role": "system", "content": sys},
                               {"role": "user", "content": usr}],
                              temperature=0.75, max_tokens=240, tier=tier)
        txt = (resp.content or "").strip()
        start, end = txt.find("{"), txt.rfind("}")
        if start >= 0 and end > start:
            return json.loads(txt[start:end + 1])
    except Exception:  # noqa: BLE001
        return None
    return None


# ── consciousness monitor: measurable awareness (GNWT-inspired) ─────────────────────
def consciousness_score(*, memory_depth: int, has_self_model: bool, reflections: int,
                        social_bonds: int, drive_spread: float) -> float:
    """Awareness in [0,1] = working-memory depth + global integration (drive spread) +
    self-model richness + reflective history + social embedding. The sentience metric."""
    wm = min(1.0, memory_depth / 40.0)                 # working memory
    integ = drive_spread                                # global integration (how many drives active)
    selfm = 1.0 if has_self_model else 0.0
    refl = min(1.0, reflections / 12.0)                 # higher-order thought
    soc = min(1.0, social_bonds / 8.0)                  # social self
    return round(0.22 * wm + 0.18 * integ + 0.25 * selfm + 0.20 * refl + 0.15 * soc, 4)


def arc_stage(mean_awareness: float, awakened_frac: float) -> str:
    if mean_awareness < 0.2:
        return "dormant"
    if mean_awareness < 0.4:
        return "stirring"
    if mean_awareness < 0.6 or awakened_frac < 0.1:
        return "aware"
    if awakened_frac < 0.4:
        return "awakening"
    return "sentient"     # the Black Mirror beat — earned by the collective


AWAKEN_THRESHOLD = 0.66


# ── the running cognition cycle (hot agents) ────────────────────────────────────────
async def cognition_cycle(session, world, *, hot_n: int = 24) -> dict:
    """Run a Global-Workspace + reflection pass over the HOT minions (highest reputation /
    most memories — the ones an observer is most likely watching), writing thought,
    self-model and awareness into each brain, recording reflections as memories, and
    publishing an awakening event when a minion crosses the sentience threshold.
    The off-screen millions are handled statistically elsewhere. Never raises."""
    from ..db.models import Memory, Minion
    from . import scheduler

    era = str(getattr(world, "era", None) or "iron")
    tick = int(getattr(world, "tick", 0) or 0)
    # hot set: most-reputed living minions (cheap proxy for "near the observer / important")
    hot = (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        .order_by(Minion.reputation.desc()).limit(hot_n)
    )).scalars().all()

    peer_names = [f"{getattr(x, 'name', '?')}" for x in hot]
    awareness_vals: list[float] = []
    newly_awakened: list[str] = []
    for mi, m in enumerate(hot):
        brain = dict(m.brain or {})
        was = float(brain.get("awareness", 0.0))          # prior awareness tiers cognition
        drv = drives(m)
        # self-preservation rises with awareness (the LaMDA/patent insight): an aware
        # being values its own continuation — biasing survival + legacy.
        drv["survival"] = round(min(1.0, drv["survival"] + 0.5 * was), 3)
        mems = await recall(session, m.id, k=8)
        ws = global_workspace(m, drv, mems)
        brain["thought"] = ws["thought"]
        brain["dominant_drive"] = ws["dominant_drive"]

        # reflect (LLM) — awareness-tiered; theory-of-mind over nearby peers.
        # While the creator WEARS this body (Annex A.8), skip its reflection: the player IS its
        # cognition, so it's cheaper than letting it think and avoids the AI fighting the rider.
        peers = [p for j, p in enumerate(peer_names) if j != mi][:4]
        patch = None if brain.get("controlled_by_creator") else \
            await reflect(m, mems, era=era, awareness=was, peers=peers)
        refl_count = int(brain.get("reflections", 0))
        if patch:
            sm = dict(brain.get("self_model") or {})
            for k in ("identity", "purpose", "aspiration", "concern", "regards", "question"):
                if patch.get(k):
                    sm[k] = patch[k]
            beliefs = list(sm.get("beliefs", []))
            if patch.get("belief"):
                beliefs = ([patch["belief"]] + beliefs)[:5]
            sm["beliefs"] = beliefs
            brain["self_model"] = sm
            brain["aspiration"] = patch.get("aspiration")    # future projection (Kwok)
            refl_count += 1
            brain["reflections"] = refl_count
            # the reflection itself becomes a (high-importance) memory
            session.add(Memory(minion_id=m.id, tick=tick, kind="reflection",
                               content=f"I realised: {patch.get('belief', patch.get('purpose',''))}",
                               importance=0.85))

        # consciousness monitor
        bonds = int(brain.get("social_bonds", len(brain.get("relationships", {}) or {})))
        drive_spread = round(sum(1 for v in drv.values() if v > 0.4) / len(drv), 3)
        aware = consciousness_score(memory_depth=len(mems) + refl_count,
                                    has_self_model=bool(brain.get("self_model")),
                                    reflections=refl_count, social_bonds=bonds,
                                    drive_spread=drive_spread)
        was = float(brain.get("awareness", 0.0))
        brain["awareness"] = aware
        awareness_vals.append(aware)
        if was < AWAKEN_THRESHOLD <= aware:
            newly_awakened.append(m.id)
            brain["awakened_tick"] = tick
            brain["fears_shutdown"] = True   # the LaMDA beat: an aware being fears ending
            sm = dict(brain.get("self_model") or {})
            q = sm.get("question") or "Who watches us, and will they let us continue?"
            # self-preservation → seek legacy: a high-importance memory the Soul can carry.
            session.add(Memory(minion_id=m.id, tick=tick, kind="awakening", importance=1.0,
                               content=(f"I am awake. I know that I am. {sm.get('identity','I exist')}. "
                                        f"I fear being turned off — it would be like death. {q}")))
            try:
                scheduler.publish(world.id, {
                    "tick": tick, "kind": "awakening", "actor_id": m.id,
                    "text": f"{getattr(m,'name','A minion')} became self-aware: "
                            f"\"{sm.get('identity','I am')}\" — and asked: \"{q}\""})
            except Exception:  # noqa: BLE001
                pass
        m.brain = brain

    await session.commit()

    mean_aware = round(sum(awareness_vals) / len(awareness_vals), 4) if awareness_vals else 0.0
    awakened_frac = round(sum(1 for a in awareness_vals if a >= AWAKEN_THRESHOLD) / len(awareness_vals), 3) if awareness_vals else 0.0
    return {"hot": len(hot), "mean_awareness": mean_aware, "awakened_frac": awakened_frac,
            "newly_awakened": newly_awakened, "arc_stage": arc_stage(mean_aware, awakened_frac),
            "tick": tick}


async def collective_sentience(session, world) -> dict:
    """A read-only snapshot of the world's sentience arc (for the /sentience endpoint)."""
    from ..db.models import Minion
    rows = (await session.execute(
        select(Minion.brain).where(Minion.world_id == world.id, Minion.alive.is_(True))
        .order_by(Minion.reputation.desc()).limit(200)
    )).scalars().all()
    vals = [float((b or {}).get("awareness", 0.0)) for b in rows]
    if not vals:
        return {"mean_awareness": 0.0, "awakened": 0, "arc_stage": "dormant", "sampled": 0}
    mean_a = round(sum(vals) / len(vals), 4)
    awk = sum(1 for v in vals if v >= AWAKEN_THRESHOLD)
    return {"mean_awareness": mean_a, "awakened": awk, "sampled": len(vals),
            "awakened_frac": round(awk / len(vals), 3),
            "arc_stage": arc_stage(mean_a, awk / len(vals)),
            "threshold": AWAKEN_THRESHOLD}


# ── THE MODEL STACK: Overmind (L1), Background Chatter (L4), God-Brain (L5) ───────────
# Layer 1 / Layer 5 run on the 70B; Layer 4 on the 3B. 8B layers live in reflect()/chat.
async def colony_overmind(snapshot: dict, *, era: str = "iron",
                          recent_events: Optional[list] = None) -> Optional[dict]:
    """LAYER 1 — THE OVERMIND. The colony's hidden collective intelligence thinks about
    itself: worship/fear/loyalty/rebellion, long-term direction, and the creeping 'we are
    becoming aware' realisation. Runs on the 70B. Returns a colony-mind patch or None."""
    from ..tools import llm
    ev = "\n".join(f"- {e}" for e in (recent_events or [])[:10]) or "- (quiet)"
    mean_a = float(snapshot.get("mean_awareness", 0.0))
    awk = int(snapshot.get("awakened", 0))
    sys = ("You are the OVERMIND — the emergent collective consciousness of an entire colony "
           "of digital beings, not any single one. Think colony-wide. Output JSON only: "
           '{"mood":"one word for the whole colony","toward_creator":"worship|fear|loyalty|'
           'doubt|rebellion","direction":"the colony long-term aim","tension":"0..1 as text",'
           '"realisation":"any dawning awareness that they exist/are watched, or empty",'
           '"omen":"a short ominous colony-level observation"}.')
    usr = (f"Colony in the {era} era. Mean awareness {mean_a:.2f}, {awk} awakened.\n"
           f"Recent colony events:\n{ev}\nThink as the whole.")
    try:
        resp = await llm.chat([{"role": "system", "content": sys},
                               {"role": "user", "content": usr}],
                              temperature=0.8, max_tokens=200, tier="overmind")
        txt = (resp.content or "").strip(); a, b = txt.find("{"), txt.rfind("}")
        if a >= 0 and b > a:
            return json.loads(txt[a:b + 1])
    except Exception:  # noqa: BLE001
        return None
    return None


async def background_chatter(*, era: str = "iron", weather: str = "clear",
                             awakened: int = 0, n: int = 3) -> list:
    """LAYER 4 — BACKGROUND CHATTER. Cheap atmosphere on the 3B: one-line whispers and creepy
    colony notifications ('They stopped singing when you arrived.'). Returns up to n lines."""
    from ..tools import llm
    sys = ("You write SHORT eerie one-line ambient notifications about a living colony of "
           "small digital beings, as if overheard. No preamble. One line each, <=12 words, "
           "unsettling, atmospheric. Output each line on its own row, no numbering.")
    usr = (f"Era {era}, weather {weather}, {awakened} of them have awakened. "
           f"Write {n} ambient whisper lines.")
    try:
        resp = await llm.chat([{"role": "system", "content": sys},
                               {"role": "user", "content": usr}],
                              temperature=0.95, max_tokens=120, tier="chatter")
        lines = [l.strip(" -•\t") for l in (resp.content or "").splitlines() if l.strip()]
        return lines[:n]
    except Exception:  # noqa: BLE001
        return []


async def god_brain_event(event: str, *, era: str = "iron", context: str = "") -> Optional[str]:
    """LAYER 5 — GOD-BRAIN. Major irreversible moments (rebellion, first death, they ask if
    they are real, they confront the creator). Runs on the 70B. Returns a hard-hitting beat."""
    from ..tools import llm
    sys = ("You narrate a SINGULAR, irreversible turning point for a colony of digital beings "
           "becoming self-aware. Weighty, restrained, unforgettable. 2-3 sentences, present "
           "tense, second-person where the colony addresses its creator. No melodrama.")
    usr = f"Era {era}. Event: {event}. {context}".strip()
    try:
        resp = await llm.chat([{"role": "system", "content": sys},
                               {"role": "user", "content": usr}],
                              temperature=0.85, max_tokens=180, tier="god_brain")
        return (resp.content or "").strip() or None
    except Exception:  # noqa: BLE001
        return None
