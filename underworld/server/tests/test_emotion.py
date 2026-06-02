"""Tests for the appraisal-theory Emotion Layer (#2 Cognitive Agent)."""
from underworld.server.services.emotion import (
    Appraisal,
    Emotion,
    appraise,
    cognition_modifier,
    decay,
)


_NEUTRAL = {
    "openness": 0.5,
    "conscientiousness": 0.5,
    "extraversion": 0.5,
    "agreeableness": 0.5,
    "neuroticism": 0.5,
}


def test_congruent_self_agency_is_pride():
    emo, intensity = appraise(
        {"goal_relevance": 0.9, "goal_congruence": 0.8, "novelty": 0.2,
         "agency": "self", "certainty": 0.9},
        _NEUTRAL,
    )
    assert emo is Emotion.PRIDE
    assert 0.0 < intensity <= 1.0


def test_incongruent_other_agency_is_anger():
    emo, _ = appraise(
        {"goal_relevance": 0.9, "goal_congruence": -0.8, "novelty": 0.7,
         "agency": "other", "certainty": 0.5},
        _NEUTRAL,
    )
    assert emo is Emotion.ANGER


def test_incongruent_self_agency_is_shame():
    emo, _ = appraise(
        {"goal_relevance": 0.8, "goal_congruence": -0.6, "novelty": 0.2,
         "agency": "self", "certainty": 0.9},
        _NEUTRAL,
    )
    assert emo is Emotion.SHAME


def test_dull_certain_other_harm_is_resentment():
    emo, _ = appraise(
        {"goal_relevance": 0.7, "goal_congruence": -0.5, "novelty": 0.1,
         "agency": "other", "certainty": 0.9},
        _NEUTRAL,
    )
    assert emo is Emotion.RESENTMENT


def test_novel_world_good_is_awe():
    emo, _ = appraise(
        {"goal_relevance": 0.8, "goal_congruence": 0.7, "novelty": 0.9,
         "agency": "world", "certainty": 0.8},
        _NEUTRAL,
    )
    assert emo is Emotion.AWE


def test_attachment_loss_is_grief():
    emo, _ = appraise(
        {"kind": "loss", "goal_relevance": 0.9, "goal_congruence": -0.9,
         "novelty": 0.6, "agency": "world", "certainty": 1.0},
        _NEUTRAL,
    )
    assert emo is Emotion.GRIEF


def test_uncertain_future_threat_is_fear_certain_is_dread():
    fear, _ = appraise(
        {"goal_relevance": 0.8, "goal_congruence": -0.5, "novelty": 0.7,
         "agency": "world", "certainty": 0.3, "threat": True, "tense": "future"},
        _NEUTRAL,
    )
    dread, _ = appraise(
        {"goal_relevance": 0.8, "goal_congruence": -0.5, "novelty": 0.2,
         "agency": "world", "certainty": 0.9, "threat": True, "tense": "future"},
        _NEUTRAL,
    )
    assert fear is Emotion.FEAR
    assert dread is Emotion.DREAD


def test_novelty_without_threat_is_curiosity():
    emo, _ = appraise(
        {"goal_relevance": 0.4, "goal_congruence": 0.0, "novelty": 0.8,
         "agency": "world", "certainty": 0.5},
        _NEUTRAL,
    )
    assert emo is Emotion.CURIOSITY


def test_nothing_relevant_is_boredom():
    emo, intensity = appraise(
        {"goal_relevance": 0.0, "goal_congruence": 0.0, "novelty": 0.0,
         "agency": "world", "certainty": 0.5},
        _NEUTRAL,
    )
    assert emo is Emotion.BOREDOM
    assert intensity > 0.5  # boredom is *high* precisely when nothing happens


def test_neuroticism_amplifies_negative_emotion():
    event = {"goal_relevance": 0.8, "goal_congruence": -0.7, "novelty": 0.6,
             "agency": "other", "certainty": 0.5}
    calm = {**_NEUTRAL, "neuroticism": 0.1, "agreeableness": 0.5}
    anxious = {**_NEUTRAL, "neuroticism": 0.95, "agreeableness": 0.5}
    _, calm_i = appraise(event, calm)
    _, anxious_i = appraise(event, anxious)
    assert anxious_i > calm_i


def test_openness_amplifies_awe():
    event = {"goal_relevance": 0.8, "goal_congruence": 0.7, "novelty": 0.9,
             "agency": "world", "certainty": 0.8}
    closed = {**_NEUTRAL, "openness": 0.1}
    open_ = {**_NEUTRAL, "openness": 0.95}
    closed_emo, closed_i = appraise(event, closed)
    open_emo, open_i = appraise(event, open_)
    assert closed_emo is Emotion.AWE and open_emo is Emotion.AWE
    assert open_i > closed_i


def test_cognition_modifier_keys_per_emotion():
    fear = cognition_modifier(Emotion.FEAR, 1.0)
    assert "option_breadth" in fear and "risk_tolerance" in fear
    assert fear["option_breadth"] == 0.5 and fear["risk_tolerance"] == 0.3

    anger = cognition_modifier(Emotion.ANGER, 1.0)
    assert anger["confrontation"] == 0.4

    grief = cognition_modifier(Emotion.GRIEF, 1.0)
    assert grief["energy"] < 1.0  # energy is sapped

    curiosity = cognition_modifier(Emotion.CURIOSITY, 1.0)
    assert curiosity["exploration"] == 0.5

    shame = cognition_modifier(Emotion.SHAME, 1.0)
    assert shame["speech"] == -0.4

    awe = cognition_modifier(Emotion.AWE, 1.0)
    assert awe["religiosity"] == 0.3 and awe["philosophy"] == 0.3

    purpose = cognition_modifier(Emotion.PURPOSE, 1.0)
    assert purpose["persistence"] == 0.4

    dread = cognition_modifier(Emotion.DREAD, 1.0)
    assert dread["long_term_focus"] < 1.0


def test_cognition_modifier_scales_with_intensity():
    # At zero intensity, every key sits at its neutral value (1.0 mult / 0.0 add).
    zero = cognition_modifier(Emotion.FEAR, 0.0)
    assert zero["option_breadth"] == 1.0 and zero["risk_tolerance"] == 1.0
    # Half intensity lands halfway between neutral and full effect.
    half = cognition_modifier(Emotion.FEAR, 0.5)
    assert abs(half["option_breadth"] - 0.75) < 1e-6   # 1.0 -> 0.5
    assert abs(cognition_modifier(Emotion.ANGER, 0.5)["confrontation"] - 0.2) < 1e-6


def test_decay_is_monotonic_and_bounded():
    prev = 1.0
    for ticks in range(0, 50, 5):
        cur = decay(1.0, ticks, half_life=10.0)
        assert 0.0 <= cur <= 1.0
        assert cur <= prev
        prev = cur
    # one half-life halves intensity
    assert abs(decay(0.8, 10.0, half_life=10.0) - 0.4) < 1e-6
    # non-positive half_life decays fully
    assert decay(0.8, 5.0, half_life=0.0) == 0.0


def test_appraisal_dataclass_is_frozen():
    a = Appraisal(0.5, 0.2, 0.3, "self", 0.8)
    try:
        a.novelty = 0.9  # type: ignore[misc]
    except Exception as exc:  # FrozenInstanceError
        assert "frozen" in type(exc).__name__.lower() or "cannot" in str(exc).lower()
    else:
        raise AssertionError("Appraisal should be frozen")


def test_determinism():
    event = {"goal_relevance": 0.7, "goal_congruence": -0.4, "novelty": 0.5,
             "agency": "other", "certainty": 0.6}
    first = appraise(event, _NEUTRAL)
    for _ in range(5):
        assert appraise(event, _NEUTRAL) == first
