"""Tests for the Layered Cognitive Agent Memory System (#2, Layer 3)."""
from underworld.server.services.memory import (
    FORGETTING_THRESHOLD,
    MemoryTrace,
    MemoryType,
    classify,
    consolidate,
    decay_strength,
    dream_recombine,
    reinforce,
    salient_recall,
)


def _trace(
    tid: str,
    *,
    type: MemoryType = MemoryType.EPISODIC,
    content: str = "x",
    tick: int = 0,
    importance: float = 0.5,
    strength: float = 1.0,
    valence: float = 0.0,
    arousal: float = 0.0,
    last_recalled: int = 0,
) -> MemoryTrace:
    return MemoryTrace(
        id=tid,
        type=type,
        content=content,
        tick=tick,
        importance=importance,
        strength=strength,
        valence=valence,
        arousal=arousal,
        last_recalled=last_recalled,
    )


# ── classify ─────────────────────────────────────────────────────────────────
def test_classify_maps_social_betrayal():
    assert classify("Korin betrayed me at the river") == MemoryType.SOCIAL
    assert classify("Mira helped me carry the wood") == MemoryType.SOCIAL


def test_classify_maps_semantic_and_cultural_and_procedural():
    assert classify("I learned that fire needs dry wood") == MemoryType.SEMANTIC
    assert classify("our people believe the moon is a god") == MemoryType.CULTURAL
    assert classify("how to knap flint: first strike, then flake") == MemoryType.PROCEDURAL


def test_classify_falls_back_to_episodic_and_uses_hint():
    # No cue words → the honest default of "something happened".
    assert classify("the sky turned orange") == MemoryType.EPISODIC
    # DB hint is honoured when content is neutral.
    assert classify("...", kind_hint="thought") == MemoryType.SEMANTIC
    assert classify("a rock fell", kind_hint="soul") == MemoryType.SOUL


# ── decay engine (non-negotiable) ────────────────────────────────────────────
def test_decay_reduces_strength_over_time():
    t = _trace("a", strength=1.0, last_recalled=0)
    early = decay_strength(t, 10)
    late = decay_strength(t, 100)
    assert early < 1.0
    assert late < early


def test_high_arousal_decays_slower_than_low_arousal():
    calm = _trace("calm", strength=1.0, arousal=0.0, last_recalled=0)
    intense = _trace("intense", strength=1.0, arousal=1.0, last_recalled=0)
    # Same elapsed time: the charged memory must retain more strength.
    assert decay_strength(intense, 50) > decay_strength(calm, 50)


def test_decay_clamps_negative_elapsed():
    t = _trace("a", strength=0.8, last_recalled=20)
    # current_tick before last_recalled must not amplify strength.
    assert decay_strength(t, 5) == 0.8


# ── reinforce ────────────────────────────────────────────────────────────────
def test_reinforce_raises_strength_and_updates_clock():
    t = _trace("a", strength=0.2, last_recalled=0)
    r = reinforce(t, current_tick=42)
    assert r.strength > t.strength
    assert r.strength <= 1.0
    assert r.last_recalled == 42


# ── consolidate ──────────────────────────────────────────────────────────────
def test_consolidate_drops_subthreshold_and_keeps_important():
    weak_trivial = _trace("weak", strength=0.05, importance=0.0)
    important = _trace("keep", strength=0.4, importance=0.9)
    kept = consolidate([weak_trivial, important])
    ids = {t.id for t in kept}
    assert "weak" not in ids
    assert "keep" in ids
    # The important one was strengthened by the sleep pass.
    kept_important = next(t for t in kept if t.id == "keep")
    assert kept_important.strength > 0.4


def test_consolidate_respects_forgetting_threshold_constant():
    assert FORGETTING_THRESHOLD == 0.1
    # A trace pulled up above threshold by importance survives.
    rescued = _trace("r", strength=0.08, importance=1.0)
    kept = consolidate([rescued])
    assert len(kept) == 1
    assert kept[0].strength >= FORGETTING_THRESHOLD


# ── salient_recall ───────────────────────────────────────────────────────────
def test_salient_recall_returns_emotionally_similar_first():
    dark = _trace("dark", valence=-0.9, strength=1.0)
    bright = _trace("bright", valence=0.9, strength=1.0)
    neutral = _trace("neutral", valence=0.0, strength=1.0)
    out = salient_recall([bright, neutral, dark], context_valence=-0.8, k=3)
    assert out[0].id == "dark"
    assert out[-1].id == "bright"


def test_salient_recall_weights_by_strength():
    apt_faint = _trace("apt_faint", valence=-0.9, strength=0.1)
    less_apt_vivid = _trace("vivid", valence=-0.4, strength=1.0)
    out = salient_recall([apt_faint, less_apt_vivid], context_valence=-0.9, k=1)
    # The faint-but-apt memory loses to the vivid one.
    assert out[0].id == "vivid"


# ── dream_recombine ──────────────────────────────────────────────────────────
def test_dream_recombine_is_deterministic_given_seed():
    traces = [
        _trace("e1", type=MemoryType.EPISODIC, strength=0.9),
        _trace("s1", type=MemoryType.SEMANTIC, strength=0.85),
        _trace("p1", type=MemoryType.PROCEDURAL, strength=0.8),
        _trace("so1", type=MemoryType.SOCIAL, strength=0.95),
    ]
    a = dream_recombine(traces, rng_seed=7)
    b = dream_recombine(traces, rng_seed=7)
    assert a is not None
    assert a == b
    # The two recombined traces are unrelated (different types).
    assert a[0].type != a[1].type


def test_dream_recombine_returns_none_without_two_strong_distinct_types():
    # Only one strong trace.
    assert dream_recombine([_trace("a", strength=0.9)], rng_seed=1) is None
    # Two strong traces but the same type → not "unrelated".
    same_type = [
        _trace("a", type=MemoryType.EPISODIC, strength=0.9),
        _trace("b", type=MemoryType.EPISODIC, strength=0.9),
    ]
    assert dream_recombine(same_type, rng_seed=1) is None
