"""Appraisal-Theory Emotion Layer (#2 Layered Cognitive Agent — Layer 2).

The existing `lifecycle.derive_mood` reduces raw needs to a coarse MoodKind +
stress scalar. That is a *body-state* signal. This module adds the design's
richer **Emotion Layer**: it appraises discrete *events* against a Minion's
goals and personality and produces a specific, named emotion with an intensity.

The crucial idea the spec emphasises is not the taxonomy itself but that
emotions *do something to cognition*. An emotion is not decoration; it is a
control signal that narrows or widens the option space, shifts risk tolerance,
biases toward confrontation or withdrawal, fuels exploration, or drains energy.
`cognition_modifier` is therefore the load-bearing export: the planner/decision
loop consumes those multipliers and deltas, not the emotion label.

Everything here is a pure function over plain dicts — no DB, no async, no LLM —
so the whole appraisal core is deterministic and unit-testable. It runs
*alongside* `derive_mood`, never replacing it: mood is the slow baseline,
emotion is the fast reaction to what just happened.

Theory: this follows cognitive appraisal theory (Lazarus / Scherer / OCC). An
event is scored on a handful of appraisal dimensions — is it relevant to a
goal, did it help or hurt that goal, how novel was it, who caused it, how
certain is it — and that *pattern* of appraisals selects the emotion. The same
event yields different emotions for different agents because both their goals
and their personalities differ.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


# ── the emotion taxonomy (the spec's full list) ──────────────────────────────
class Emotion(str, Enum):
    """Discrete emotions the appraisal core can produce.

    The first six are the Ekman "basic" emotions; the rest are the social,
    existential, and epistemic emotions the design calls out as what make an
    agent feel like a *person* in a civilisation rather than a thermostat.
    """

    JOY = "joy"
    FEAR = "fear"
    ANGER = "anger"
    SADNESS = "sadness"
    DISGUST = "disgust"
    SURPRISE = "surprise"
    GRIEF = "grief"            # loss of an attachment
    ATTACHMENT = "attachment"  # bonding to a person/place/thing
    SHAME = "shame"            # self-caused goal failure / norm violation
    PRIDE = "pride"            # self-caused goal success
    AWE = "awe"               # vast, novel, world-caused good
    TRUST = "trust"           # other-agency, goal-congruent, certain
    RESENTMENT = "resentment"  # slow-burn other-caused harm
    CURIOSITY = "curiosity"    # novelty without threat
    BOREDOM = "boredom"        # chronic absence of relevant events
    PURPOSE = "purpose"        # alignment with a long-term goal
    DREAD = "dread"           # certain future harm

    @property
    def is_negative(self) -> bool:
        """Negative-valence emotions — the ones neuroticism amplifies."""
        return self in _NEGATIVE


_NEGATIVE: frozenset[Emotion] = frozenset({
    Emotion.FEAR, Emotion.ANGER, Emotion.SADNESS, Emotion.DISGUST,
    Emotion.GRIEF, Emotion.SHAME, Emotion.RESENTMENT, Emotion.BOREDOM,
    Emotion.DREAD,
})

_POSITIVE: frozenset[Emotion] = frozenset({
    Emotion.JOY, Emotion.PRIDE, Emotion.AWE, Emotion.TRUST,
    Emotion.ATTACHMENT, Emotion.CURIOSITY, Emotion.PURPOSE,
})


# ── the appraisal dimensions ─────────────────────────────────────────────────
@dataclass(frozen=True)
class Appraisal:
    """A scored reading of an event along cognitive-appraisal dimensions.

    goal_relevance   0..1   how much this event touches any active goal at all;
                            the master gain on intensity — irrelevant events
                            barely register.
    goal_congruence -1..1   did the event help (+) or hurt (-) the goal; the
                            sign that splits positive from negative emotions.
    novelty          0..1   how unexpected/surprising; drives SURPRISE, CURIOSITY,
                            AWE and sharpens fear of the unknown.
    agency          str     who caused it — 'self' | 'other' | 'world'; the
                            dimension that separates SHAME (self) from ANGER
                            (other) from AWE/FEAR (world) on the same valence.
    certainty        0..1   how sure the appraisal is; low certainty about a
                            future harm is FEAR, high certainty is DREAD.
    """

    goal_relevance: float
    goal_congruence: float
    novelty: float
    agency: str
    certainty: float


_AGENCIES: frozenset[str] = frozenset({"self", "other", "world"})


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _read_appraisal(event: dict) -> Appraisal:
    """Build an Appraisal from a loose event dict, tolerating partial input.

    Callers describe an event with whatever they know; missing dimensions take
    neutral defaults so the appraisal core never raises on real-world data.
    """
    agency = str(event.get("agency", "world")).lower()
    if agency not in _AGENCIES:
        agency = "world"
    return Appraisal(
        goal_relevance=_clamp(float(event.get("goal_relevance", 0.0))),
        goal_congruence=_clamp(float(event.get("goal_congruence", 0.0)), -1.0, 1.0),
        novelty=_clamp(float(event.get("novelty", 0.0))),
        agency=agency,
        certainty=_clamp(float(event.get("certainty", 0.5))),
    )


# ── the appraisal → emotion mapping ──────────────────────────────────────────
def _select_emotion(a: Appraisal, event: dict) -> Emotion:
    """Map an appraisal pattern to a single discrete emotion.

    Ordering matters: the most specific / strongest signals are tested first.
    The structure mirrors the OCC tree — valence (congruence) splits the space,
    then agency and the special-case event flags (loss, threat) refine it.
    """
    # Special-cased event *kinds* the dimensions alone can't express.
    kind = str(event.get("kind", "")).lower()
    if kind in ("loss", "death", "bereavement") or event.get("attachment_lost"):
        return Emotion.GRIEF                       # losing a bond is grief, not mere sadness
    if kind in ("bond", "bonding") or event.get("attachment_formed"):
        return Emotion.ATTACHMENT
    if kind in ("revulsion", "contamination", "taboo") or event.get("disgusting"):
        return Emotion.DISGUST

    relevant = a.goal_relevance >= 0.15
    threat = bool(event.get("threat")) or (
        a.goal_congruence < 0 and str(event.get("tense", "")).lower() == "future"
    )

    # Nothing meaningful has happened for a while → boredom (its own signal).
    if not relevant and a.novelty < 0.2:
        return Emotion.BOREDOM

    # Anticipated harm: certainty splits dread (sure) from fear (unsure).
    if threat:
        if a.certainty >= 0.7:
            return Emotion.DREAD
        return Emotion.FEAR

    # Pure novelty with no goal threat is epistemic, not affective-negative.
    if a.novelty >= 0.6 and abs(a.goal_congruence) < 0.25:
        return Emotion.CURIOSITY

    if a.goal_congruence > 0.0:
        # Goal-congruent (something good happened).
        if a.agency == "self":
            return Emotion.PRIDE
        if a.agency == "other":
            return Emotion.TRUST
        # world-agency: vast + novel good is awe; sustained alignment is purpose.
        if a.novelty >= 0.55:
            return Emotion.AWE
        if str(event.get("tense", "")).lower() == "long_term" or event.get("mission"):
            return Emotion.PURPOSE
        return Emotion.JOY

    if a.goal_congruence < 0.0:
        # Goal-incongruent (something bad happened, already realised).
        if a.agency == "self":
            return Emotion.SHAME
        if a.agency == "other":
            # Fresh, high-novelty harm flares as anger; dull, certain, repeated
            # harm settles into resentment.
            if a.novelty >= 0.4 or a.certainty < 0.6:
                return Emotion.ANGER
            return Emotion.RESENTMENT
        return Emotion.SADNESS  # impersonal bad luck from the world

    # Goal-relevant but neutral congruence and notable novelty → surprise.
    if a.novelty >= 0.45:
        return Emotion.SURPRISE
    return Emotion.BOREDOM


def _personality(minion_state: dict) -> dict[str, float]:
    """Pull the Big-Five traits, defaulting to the neutral 0.5 midpoint."""
    return {
        trait: _clamp(float(minion_state.get(trait, 0.5)))
        for trait in (
            "openness", "conscientiousness", "extraversion",
            "agreeableness", "neuroticism",
        )
    }


def _modulate(emotion: Emotion, base: float, p: dict[str, float]) -> float:
    """Apply personality modulation to a raw intensity.

    The design's explicit examples: high neuroticism amplifies negative
    emotions (an anxious mind feels threats harder); high openness amplifies AWE
    and CURIOSITY (an open mind drinks in the new). Agreeableness softens anger,
    extraversion warms attachment/joy. All gains are gentle so personality
    *colours* rather than *overrides* the appraisal.
    """
    gain = 1.0
    if emotion.is_negative:
        gain *= 1.0 + 0.6 * (p["neuroticism"] - 0.5)
    if emotion in (Emotion.AWE, Emotion.CURIOSITY):
        gain *= 1.0 + 0.6 * (p["openness"] - 0.5)
    if emotion in (Emotion.ANGER, Emotion.RESENTMENT):
        gain *= 1.0 - 0.4 * (p["agreeableness"] - 0.5)
    if emotion in (Emotion.JOY, Emotion.ATTACHMENT, Emotion.PRIDE):
        gain *= 1.0 + 0.3 * (p["extraversion"] - 0.5)
    return _clamp(base * gain)


def appraise(event: dict, minion_state: dict) -> tuple[Emotion, float]:
    """Appraise an event for a Minion → (emotion, intensity in 0..1).

    Pure and deterministic: the same event + state always yields the same pair.
    Intensity scales with how relevant the event is to a goal and how strongly
    it moved (or how unexpectedly it arrived), then is modulated by personality.

    `event` is a loose dict; recognised keys are the Appraisal dimensions
    (goal_relevance, goal_congruence, novelty, agency, certainty) plus optional
    flavour flags (kind, threat, tense, mission, attachment_lost/formed,
    disgusting). `minion_state` supplies the Big-Five traits in 0..1.
    """
    a = _read_appraisal(event)
    emotion = _select_emotion(a, event)
    p = _personality(minion_state)

    # Base intensity: relevance is the master gain; the "movement" of the event
    # is the larger of how hard it hit a goal and how unexpected it was. Boredom
    # is the inverse — it grows precisely when nothing relevant is happening.
    if emotion is Emotion.BOREDOM:
        base = _clamp((1.0 - a.goal_relevance) * (1.0 - a.novelty))
    else:
        movement = max(abs(a.goal_congruence), a.novelty)
        base = _clamp((0.2 + 0.8 * a.goal_relevance) * (0.25 + 0.75 * movement))

    return emotion, round(_modulate(emotion, base, p), 4)


# ── the load-bearing export: emotion → cognition control signals ─────────────
# Per-emotion modifier templates. Values are *unit-intensity* effects; callers
# scale them by the live intensity. Multiplicative gates (option_breadth,
# risk_tolerance, energy, long_term_focus) are expressed as the value reached at
# full intensity; additive biases (confrontation, exploration, religiosity …)
# are deltas. `cognition_modifier` interpolates from the neutral default toward
# these by `intensity`. Keys are exactly what the planner/decision loop reads.
_MODIFIER_TEMPLATES: dict[Emotion, dict[str, float]] = {
    Emotion.FEAR: {"option_breadth": 0.5, "risk_tolerance": 0.3, "long_term_focus": 0.7},
    Emotion.DREAD: {"long_term_focus": 0.7, "risk_tolerance": 0.6, "persistence": 0.7},
    Emotion.ANGER: {"confrontation": 0.4, "risk_tolerance": 1.3, "option_breadth": 0.7},
    Emotion.RESENTMENT: {"confrontation": 0.25, "trust_bias": -0.4, "cooperation": -0.3},
    Emotion.GRIEF: {"energy": 0.6, "exploration": -0.4, "long_term_focus": 0.7},
    Emotion.SADNESS: {"energy": 0.8, "exploration": -0.2, "risk_tolerance": 0.8},
    Emotion.SHAME: {"speech": -0.4, "confrontation": -0.4, "risk_tolerance": 0.7},
    Emotion.DISGUST: {"approach": -0.5, "exploration": -0.3},
    Emotion.SURPRISE: {"option_breadth": 1.2, "exploration": 0.2},
    Emotion.CURIOSITY: {"exploration": 0.5, "option_breadth": 1.3, "risk_tolerance": 1.2},
    Emotion.AWE: {"religiosity": 0.3, "philosophy": 0.3, "exploration": 0.2},
    Emotion.JOY: {"energy": 1.3, "cooperation": 0.3, "risk_tolerance": 1.1},
    Emotion.PRIDE: {"confidence": 0.4, "persistence": 0.3, "speech": 0.3},
    Emotion.TRUST: {"cooperation": 0.4, "trust_bias": 0.4, "confrontation": -0.2},
    Emotion.ATTACHMENT: {"cooperation": 0.4, "protectiveness": 0.5, "trust_bias": 0.3},
    Emotion.PURPOSE: {"persistence": 0.4, "long_term_focus": 1.4, "energy": 1.2},
    Emotion.BOREDOM: {"exploration": 0.4, "risk_tolerance": 1.2, "persistence": -0.3},
}

# Which keys are multiplicative gates (interpolate from 1.0) vs additive biases
# (interpolate from 0.0). Keeping this explicit makes the consumer contract
# unambiguous for the planner.
_MULTIPLICATIVE: frozenset[str] = frozenset({
    "option_breadth", "risk_tolerance", "energy", "long_term_focus",
})


def cognition_modifier(emotion: Emotion, intensity: float) -> dict[str, float]:
    """How an emotion at a given intensity reshapes cognition.

    This is what the planner consumes. Multiplicative keys (option_breadth,
    risk_tolerance, energy, long_term_focus) return a factor around 1.0 to scale
    the corresponding planner parameter — e.g. FEAR at full intensity halves
    option_breadth (0.5) and cuts risk_tolerance to 0.3, so a frightened Minion
    considers fewer, safer plans. Additive keys (confrontation, exploration,
    religiosity, persistence, speech …) return a signed delta to bias a
    tendency. At intensity 0 every key sits at its neutral value (1.0 or 0.0),
    so a faint emotion barely perturbs cognition.
    """
    t = _clamp(intensity)
    template = _MODIFIER_TEMPLATES.get(emotion, {})
    out: dict[str, float] = {}
    for key, target in template.items():
        if key in _MULTIPLICATIVE:
            out[key] = round(1.0 + (target - 1.0) * t, 4)   # interpolate from 1.0
        else:
            out[key] = round(target * t, 4)                  # interpolate from 0.0
    return out


# ── emotional decay over time ────────────────────────────────────────────────
def decay(intensity: float, ticks: float, *, half_life: float) -> float:
    """Exponentially decay an emotion's intensity over `ticks` of simulation.

    Emotions are transient: a flare fades back toward baseline unless renewed.
    `half_life` is the number of ticks over which intensity halves. The result
    is monotonically non-increasing in `ticks` (for positive ticks) and never
    leaves 0..1, so it is safe to feed straight back into `cognition_modifier`.
    """
    if half_life <= 0:
        return 0.0
    if ticks <= 0:
        return _clamp(intensity)
    return _clamp(intensity * (0.5 ** (ticks / half_life)))
