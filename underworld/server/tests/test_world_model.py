"""Tests for the hybrid World Model (#1): perception, imagination, counterfactual."""
from underworld.server.services.world_model import (
    Metric,
    best_imagined,
    counterfactual,
    imagine,
    perceive,
)


# ── Perception ───────────────────────────────────────────────────────────────
def test_high_acuity_perceives_near_truth():
    truth = {"food": 0.8, "water": 0.5}
    p = perceive(truth, acuity=1.0)
    assert abs(p["food"].perceived_value - 0.8) < 1e-6
    assert p["food"].uncertainty == 0.0


def test_low_acuity_is_uncertain_and_memory_biased():
    truth = {"food": 0.8}
    p = perceive(truth, acuity=0.2, memory_bias={"food": 0.2})
    # perception pulled toward the remembered 0.2, well away from truth 0.8
    assert p["food"].perceived_value < 0.8
    assert p["food"].uncertainty > 0.5
    assert "memory" in p["food"].bias_source


def test_fear_inflates_threat_readings():
    truth = {"predator_risk": 0.3}
    calm = perceive(truth, acuity=0.8, fear=0.0)
    afraid = perceive(truth, acuity=0.8, fear=1.0)
    assert afraid["predator_risk"].perceived_value > calm["predator_risk"].perceived_value
    assert "fear" in afraid["predator_risk"].bias_source


# ── Imagination ──────────────────────────────────────────────────────────────
def test_imagine_surfaces_side_effects():
    # Damming a river: big intended effect on irrigation, smaller side effects
    # on fish and the downstream village — the spec's worked example.
    model = {"dam_river": {"irrigation": 1.0, "fish": -0.2, "downstream_village": -0.3}}
    out = imagine("dam_river", {}, model, depth=1)
    assert out.effects["irrigation"] == 1.0
    assert "fish" in out.side_effects
    assert "downstream_village" in out.side_effects
    assert "irrigation" not in out.side_effects  # the primary effect isn't a side effect


def test_imagine_confidence_falls_with_depth():
    model = {"a": {"x": 0.5}}
    shallow = imagine("a", {}, model, depth=1)
    deep = imagine("a", {}, model, depth=4)
    assert deep.confidence < shallow.confidence
    # compounding forward rollout increases the magnitude of the effect
    assert abs(deep.effects["x"]) > abs(shallow.effects["x"])


def test_best_imagined_picks_goal_serving_action():
    model = {
        "study": {"knowledge": 0.6},
        "raid": {"food": 0.5, "war_risk": 0.8},
    }
    # Goal: gain knowledge, avoid war.
    action, score = best_imagined(
        ["study", "raid"], {}, model,
        {"knowledge": 1.0, "war_risk": -1.0},
    )
    assert action == "study"
    assert score > 0


# ── Counterfactual ───────────────────────────────────────────────────────────
def test_counterfactual_measures_divergence():
    baseline = {Metric.POPULATION.value: 100, Metric.KNOWLEDGE.value: 50}
    forked = {Metric.POPULATION.value: 140, Metric.KNOWLEDGE.value: 80}
    res = counterfactual(baseline, forked, label="library did not burn")
    assert res.divergence["population"] == 40
    assert res.divergence["knowledge"] == 30
    assert "library did not burn" in res.summary


def test_counterfactual_headline_picks_biggest_mover():
    baseline = {Metric.KNOWLEDGE.value: 50, Metric.MORTALITY.value: 0.2}
    forked = {Metric.KNOWLEDGE.value: 55, Metric.MORTALITY.value: 0.7}
    res = counterfactual(baseline, forked, label="plague hit engineers")
    # mortality moved most (+0.5) so it should headline
    assert "mortality" in res.summary
    assert "higher" in res.summary


def test_counterfactual_covers_all_metrics():
    res = counterfactual({}, {}, label="empty")
    assert set(res.divergence.keys()) == {m.value for m in Metric}
