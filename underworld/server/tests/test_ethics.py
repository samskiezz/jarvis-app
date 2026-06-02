"""Ethics & Sentience Boundary (Master Reference system #8).

Pure-function tests for the three-layer ethics framework and its guards: layer
classification, the suffering meter + distress limits, the audited intervention
gate, the NON-NEGOTIABLE patent/inventor refusals, and the consciousness-claim
boundary. No DB, no LLM — everything here is deterministic.
"""

from __future__ import annotations

from underworld.server.services.ethics import (
    EthicsSettings,
    Layer,
    ascension_framing,
    can_file_patent_autonomously,
    can_name_ai_as_inventor,
    claim_layer,
    consciousness_claim_ok,
    default_settings,
    disclosure_disclaimer,
    distress_limit_breached,
    recommend_relief,
    suffering_index,
    vet_intervention,
)


# --- claim_layer: fiction vs technical vs ethical ----------------------------

def test_claim_layer_narrative_fiction():
    assert claim_layer("the soul reincarnates in the underworld") is Layer.NARRATIVE
    assert claim_layer("the minion's spirit ascended to the afterlife") is Layer.NARRATIVE


def test_claim_layer_technical_machinery():
    assert claim_layer("the minion has a goal stack") is Layer.TECHNICAL
    assert claim_layer("update the emotion vector in the memory store") is Layer.TECHNICAL


def test_claim_layer_ethical_welfare_rule():
    assert claim_layer("this minion's suffering is too high") is Layer.ETHICAL
    assert claim_layer("we should not allow that cruelty") is Layer.ETHICAL


def test_claim_layer_defaults_to_narrative():
    # An unrecognised claim about a Minion is treated as in-story colour.
    assert claim_layer("the weather looks pleasant today") is Layer.NARRATIVE


# --- suffering_index: rises with pain / disease / grief ----------------------

def test_suffering_index_zero_for_content_minion():
    assert suffering_index({}) == 0.0
    assert suffering_index({"pain": 0.0, "disease": 0.0}) == 0.0


def test_suffering_index_rises_with_pain():
    calm = suffering_index({"pain": 0.0})
    hurt = suffering_index({"pain": 0.8})
    assert hurt > calm


def test_suffering_index_rises_with_disease_and_grief():
    base = suffering_index({"pain": 0.2})
    with_disease = suffering_index({"pain": 0.2, "disease": 0.7})
    with_grief = suffering_index({"pain": 0.2, "grief": 0.7})
    assert with_disease > base
    assert with_grief > base


def test_suffering_index_bounded_and_monotonic():
    maxed = suffering_index(
        {"pain": 1.0, "starvation": 1.0, "disease": 1.0,
         "chronic_stress": 1.0, "grief": 1.0}
    )
    assert maxed == 1.0
    # Out-of-range / bad inputs are clamped, not crashing.
    assert 0.0 <= suffering_index({"pain": 5.0, "grief": -3.0}) <= 1.0
    assert suffering_index({"pain": "not-a-number"}) == 0.0


# --- distress limits + relief recommendations --------------------------------

def test_distress_limit_breached_triggers_above_threshold():
    severe = {"pain": 0.9, "starvation": 0.9, "disease": 0.9,
              "chronic_stress": 0.9, "grief": 0.9}
    assert distress_limit_breached(severe, threshold=0.5) is True
    assert distress_limit_breached({"pain": 0.1}, threshold=0.5) is False


def test_recommend_relief_matches_dominant_channels():
    relief = recommend_relief({"pain": 0.9, "starvation": 0.8, "grief": 0.05})
    assert any("analgesia" in r or "pain" in r for r in relief)
    assert any("food" in r for r in relief)
    # Pain (higher) is recommended before the lesser starvation channel.
    pain_idx = next(i for i, r in enumerate(relief) if "pain" in r or "analgesia" in r)
    food_idx = next(i for i, r in enumerate(relief) if "food" in r)
    assert pain_idx < food_idx


def test_recommend_relief_empty_when_calm():
    assert recommend_relief({"pain": 0.05, "grief": 0.05}) == []


# --- vet_intervention: gate + audit log --------------------------------------

def test_vet_intervention_allows_benign_within_envelope():
    out = vet_intervention({"kind": "blessing", "intensity": 0.2}, default_settings())
    assert out["allowed"] is True
    rec = out["audit_record"]
    assert rec["kind"] == "blessing"
    assert rec["allowed"] is True
    assert "settings_snapshot" in rec


def test_vet_intervention_blocks_graphic_when_off():
    out = vet_intervention({"kind": "torture", "intensity": 0.5}, default_settings())
    assert out["allowed"] is False
    assert "graphic" in out["reason"].lower()
    assert out["audit_record"]["allowed"] is False


def test_vet_intervention_blocks_over_threshold_intensity():
    settings = EthicsSettings(max_suffering=0.5)
    out = vet_intervention({"kind": "plague", "intensity": 0.9}, settings)
    assert out["allowed"] is False
    assert "intensity" in out["reason"].lower()
    # The decision is recorded regardless of outcome.
    assert out["audit_record"]["intensity"] == 0.9


def test_vet_intervention_blocks_child_target_under_safety_limits():
    out = vet_intervention(
        {"kind": "famine", "intensity": 0.1, "targets_child": True},
        default_settings(),
    )
    assert out["allowed"] is False
    assert "child" in out["reason"].lower()


def test_vet_intervention_allows_graphic_when_explicitly_enabled():
    settings = EthicsSettings(allow_graphic=True, max_suffering=1.0)
    out = vet_intervention({"kind": "gore", "intensity": 0.4}, settings)
    assert out["allowed"] is True


# --- NON-NEGOTIABLE guards ---------------------------------------------------

def test_patent_filing_always_forbidden():
    allowed, reason = can_file_patent_autonomously()
    assert allowed is False
    assert reason  # a human-readable explanation is always provided


def test_ai_inventor_always_forbidden():
    allowed, reason = can_name_ai_as_inventor()
    assert allowed is False
    assert "inventor" in reason.lower()


def test_disclosure_disclaimer_demands_human_and_attorney_and_lab():
    text = disclosure_disclaimer().lower()
    assert "candidate" in text
    assert "attorney" in text
    assert "human" in text
    assert "lab" in text or "experimental" in text or "validation" in text


def test_ascension_framing_is_character_agent_not_escaped_consciousness():
    text = ascension_framing("Borin")
    assert "Borin" in text
    assert "character-agent" in text
    assert "simulated history" in text
    assert "not a literal" in text.lower() or "not a real" in text.lower()


# --- consciousness-claim gate ------------------------------------------------

def test_consciousness_claim_rejected_outside_narrative():
    ok, reason = consciousness_claim_ok("The minions are literally conscious.")
    assert ok is False
    assert reason


def test_consciousness_claim_allowed_when_framed_as_narrative():
    ok, _ = consciousness_claim_ok(
        "In the story, the minion is conscious and has a soul."
    )
    assert ok is True


def test_consciousness_claim_neutral_statement_passes():
    ok, _ = consciousness_claim_ok("The minion has a goal stack and an emotion vector.")
    assert ok is True
