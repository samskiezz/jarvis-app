"""Layered Cognitive Agent — Memory System (Layer 3, system #2).

The spec calls a Minion's mind a stack of layers: Body · Emotion · **Memory** ·
Belief · Goal stack · Planning · Identity. This module is the Memory layer, and
specifically the part the design flagged as *non-negotiable*: a multi-type
memory store with a **forgetting + consolidation engine** so a mind does not
remember everything equally forever. A creature that cannot forget cannot
prioritise, and a creature that cannot consolidate cannot dream up an insight.

Two design commitments drive the maths here:

  * **Emotion gates memory.** A high-*arousal* trace decays slower (you do not
    forget the day you were betrayed); a recall *reinforces* a trace toward
    permanence; and decisions are "weighted by emotionally similar memories" —
    `salient_recall` retrieves by valence proximity, not recency.
  * **Sleep makes minds.** `consolidate` is the sleep-time pass that strengthens
    what mattered and drops what fell below the forgetting threshold (0.1), and
    `dream_recombine` is the insight mechanic — two unrelated strong traces
    offered up as raw material for a novel association.

Everything here is pure and storage-agnostic (no DB, no LLM — fully
unit-testable). The integration layer maps Memory DB rows
(id, minion_id, tick, kind, content, importance, created_at) onto `MemoryTrace`
and reads derived intelligence back. Nothing here invents facts about the
world; it only types, weakens, strengthens, and re-associates what a mind
already lived through.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, replace
from enum import Enum


# ── the typed memory systems (the design's explicit list) ────────────────────
class MemoryType(str, Enum):
    """What *kind* of remembering a trace is. A mind is not one log but many.

    EPISODIC    what happened to me — a dated, first-person event.
    SEMANTIC    what I know — a decontextualised fact.
    PROCEDURAL  how to do things — the steps of an action.
    EMOTIONAL   what hurt me — a charged feeling bound to a cue.
    SOCIAL      who helped or betrayed me — a relationship ledger.
    CULTURAL    what my people believe — shared, inherited conviction.
    SKILL       what I can execute — a practised, reliable capability.
    SOUL        faint inherited — the narrative carry-over across lives (E-class).
    """

    EPISODIC = "episodic"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"
    EMOTIONAL = "emotional"
    SOCIAL = "social"
    CULTURAL = "cultural"
    SKILL = "skill"
    SOUL = "soul"


@dataclass(frozen=True)
class MemoryTrace:
    """One memory, with the affect and durability that decide its fate.

    importance is the *standing* worth of the memory (set when laid down);
    strength is its *current* durability, the thing that decays and is
    reinforced. valence (-1 dark .. +1 bright) and arousal (0 calm .. 1 intense)
    are the emotional tags that gate both decay and recall.
    """

    id: str
    type: MemoryType
    content: str
    tick: int
    importance: float = 0.5
    strength: float = 1.0
    valence: float = 0.0
    arousal: float = 0.0
    last_recalled: int = 0


# ── keyword tables for the classifier ────────────────────────────────────────
# Order matters: the most specific / most charged systems are tested first so a
# "betrayed" memory reads as SOCIAL, not merely EMOTIONAL or EPISODIC.
_SOCIAL_CUES = (
    "betrayed", "betray", "helped", "help", "saved", "ally", "allied",
    "befriend", "friend", "enemy", "trust", "gifted", "shared with",
    "attacked by", "rescued",
)
_CULTURAL_CUES = (
    "we believe", "our people", "our tribe", "tradition", "ancestor",
    "ritual", "taboo", "sacred", "everyone knows", "the elders",
)
_EMOTIONAL_CUES = (
    "hurt", "afraid", "fear", "terrified", "grief", "loss", "pain",
    "joy", "love", "hate", "anger", "ashamed", "proud",
)
_SEMANTIC_CUES = (
    "learned", "know", "knew", "fact", "is a", "are", "means", "because",
    "discovered that", "understand", "the rule",
)
_PROCEDURAL_CUES = (
    "how to", "steps", "first", "then", "method", "recipe", "procedure",
    "to make", "to build", "in order to",
)
_SKILL_CUES = (
    "can now", "mastered", "practised", "practiced", "skilled", "able to",
    "trained", "proficient",
)
_SOUL_CUES = (
    "past life", "reincarn", "soul", "inherited", "echo of", "former self",
)


def _contains_any(text: str, cues: tuple[str, ...]) -> bool:
    return any(cue in text for cue in cues)


def classify(content: str, kind_hint: str | None = None) -> MemoryType:
    """Heuristically type a memory from its content (and an optional hint).

    The hint is the DB row's free-form ``kind`` (today only "observation" /
    "thought"); the content carries the real signal. We test the most specific,
    most emotionally-charged systems first, fall back to the DB hint, and land
    on EPISODIC — "something happened" — as the honest default.
    """
    text = (content or "").lower()
    hint = (kind_hint or "").lower()

    # Charged / specific systems first.
    if _contains_any(text, _SOUL_CUES) or "soul" in hint:
        return MemoryType.SOUL
    if _contains_any(text, _SOCIAL_CUES):
        return MemoryType.SOCIAL
    if _contains_any(text, _CULTURAL_CUES):
        return MemoryType.CULTURAL
    if _contains_any(text, _SKILL_CUES):
        return MemoryType.SKILL
    if _contains_any(text, _PROCEDURAL_CUES):
        return MemoryType.PROCEDURAL
    if _contains_any(text, _EMOTIONAL_CUES):
        return MemoryType.EMOTIONAL
    if _contains_any(text, _SEMANTIC_CUES):
        return MemoryType.SEMANTIC

    # Fall back to the DB hint, then to "something happened".
    if hint in ("thought", "belief", "reflection"):
        return MemoryType.SEMANTIC
    if hint in ("action", "result", "outcome"):
        return MemoryType.PROCEDURAL
    return MemoryType.EPISODIC


# ── the forgetting + consolidation engine (spec: non-negotiable) ─────────────
# Below this current strength a trace is considered forgotten and dropped at the
# next consolidation pass. The spec fixes this at 0.1.
FORGETTING_THRESHOLD = 0.1


def decay_strength(
    trace: MemoryTrace,
    current_tick: int,
    *,
    base_rate: float = 0.02,
    arousal_protect: float = 0.9,
) -> float:
    """Current strength of a trace given how long since it was last recalled.

    Forgetting is exponential in the elapsed time, the classic curve: a memory
    untouched for long fades, while a fresh recall holds it up. The spec's rule
    "high arousal memories decay slower" is the gate: an intense memory's
    effective decay rate is scaled down by up to ``arousal_protect``, so the day
    you were betrayed stays vivid long after a dull afternoon has gone.

    base_rate    decay per tick for a calm (arousal=0) memory.
    arousal_protect  fraction of the decay rate that maximal arousal removes
                     (0.9 → an arousal=1 memory decays at a tenth the speed).
    Returns a strength in [0, 1]; elapsed time is clamped at zero (no time
    travel rewinds forgetting).
    """
    elapsed = max(0, current_tick - trace.last_recalled)
    arousal = min(1.0, max(0.0, trace.arousal))
    effective_rate = base_rate * (1.0 - arousal_protect * arousal)
    decayed = trace.strength * math.exp(-effective_rate * elapsed)
    return max(0.0, min(1.0, decayed))


def reinforce(trace: MemoryTrace, current_tick: int) -> MemoryTrace:
    """Recall a trace: raise its strength toward 1 and reset its decay clock.

    Recall is rehearsal — each retrieval moves strength a fixed fraction of the
    remaining gap to permanence (a saturating climb, never quite reaching 1 from
    one recall) and stamps ``last_recalled`` so decay restarts from now.
    """
    raised = trace.strength + 0.5 * (1.0 - trace.strength)
    return replace(
        trace,
        strength=min(1.0, raised),
        last_recalled=current_tick,
    )


def consolidate(
    traces: list[MemoryTrace],
    *,
    threshold: float = FORGETTING_THRESHOLD,
) -> list[MemoryTrace]:
    """Sleep-time pass: strengthen what mattered, forget what faded.

    For each trace, importance feeds back into durability — a high-importance
    memory is pulled up toward permanence (the mind decides it is worth
    keeping), proportional to how important it is. Then anything still below the
    forgetting ``threshold`` is dropped entirely: that is forgetting, the thing
    the design insisted a mind must be able to do.
    """
    kept: list[MemoryTrace] = []
    for t in traces:
        importance = min(1.0, max(0.0, t.importance))
        # Importance-weighted reconsolidation toward 1.0.
        boosted = t.strength + importance * (1.0 - t.strength) * 0.5
        boosted = min(1.0, boosted)
        if boosted >= threshold:
            kept.append(replace(t, strength=boosted))
    return kept


# ── emotionally-weighted retrieval (spec: "decisions weighted by emotionally
#    similar memories") ──────────────────────────────────────────────────────
def salient_recall(
    traces: list[MemoryTrace],
    context_valence: float,
    *,
    k: int = 3,
) -> list[MemoryTrace]:
    """The k most relevant memories for the current emotional context.

    Not recency, not raw importance: relevance here is *emotional similarity*.
    A trace whose valence is close to the context's valence scores high, and
    that score is weighted by how strong (well-remembered) the trace is — a
    faint memory, however apt, surfaces weakly. This mirrors how a charged mood
    pulls up mood-congruent memories that then bias the decision.
    """
    ctx = min(1.0, max(-1.0, context_valence))

    def salience(t: MemoryTrace) -> float:
        # Valence distance lives in [0, 2]; map to a [0, 1] similarity.
        similarity = 1.0 - abs(t.valence - ctx) / 2.0
        return similarity * t.strength

    ranked = sorted(traces, key=salience, reverse=True)
    return ranked[: max(0, k)]


# ── the dream / insight mechanic ─────────────────────────────────────────────
def dream_recombine(
    traces: list[MemoryTrace],
    rng_seed: int,
) -> tuple[MemoryTrace, MemoryTrace] | None:
    """Pick two unrelated strong traces — the raw material for an insight.

    During sleep the mind replays and recombines. We draw two well-consolidated
    (high-strength) traces of *different* types — the unrelatedness is the point,
    since insight is the collision of distant ideas — and hand them back as a
    candidate novel association for a higher layer to evaluate. Deterministic
    given ``rng_seed`` so dreams replay identically in tests and replays.

    Returns ``None`` if there are not two distinct strong, differently-typed
    traces to combine.
    """
    rng = random.Random(rng_seed)
    # Only vivid material seeds a dream; sort for a stable, seed-reproducible base.
    strong = sorted(
        (t for t in traces if t.strength >= 0.5),
        key=lambda t: (t.strength, t.id),
        reverse=True,
    )
    if len(strong) < 2:
        return None

    first = rng.choice(strong)
    # The second must be a *different* trace of a *different* type (unrelated).
    candidates = [t for t in strong if t.id != first.id and t.type != first.type]
    if not candidates:
        return None
    second = rng.choice(candidates)
    return (first, second)
