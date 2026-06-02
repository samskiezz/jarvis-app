"""Tests for real AI/ML-ops metrics."""
from underworld.server.services import ai_models as ai


def test_model_registry():
    r = ai.model_registry([{"id": "m1", "modality": "text"}, {"id": "m2", "modality": "vision"}])
    assert r["count"] == 2 and "text" in r["modalities"]


def test_evaluation_arena_perfect():
    r = ai.evaluation_arena([0, 1, 1, 0], [0, 1, 1, 0])
    assert r["accuracy"] == 1.0 and r["macro_f1"] == 1.0


def test_drift_detector_flags_shift():
    import numpy as np
    rng = np.random.default_rng(0)
    ref = rng.normal(0, 1, 1000).tolist()
    shifted = rng.normal(3, 1, 1000).tolist()
    same = rng.normal(0, 1, 1000).tolist()
    assert ai.drift_detector(ref, shifted)["drift"] is True
    assert ai.drift_detector(ref, same)["drift"] is False


def test_calibration_error():
    # perfectly calibrated: confidence == accuracy
    conf = [0.9] * 100
    correct = [True] * 90 + [False] * 10
    assert ai.calibration_error(conf, correct)["ece"] < 0.05


def test_hallucination_detector():
    assert ai.hallucination_detector(confidence=0.95, evidence_support=0.1)["likely_hallucination"] is True
    assert ai.hallucination_detector(confidence=0.9, evidence_support=0.85)["likely_hallucination"] is False


def test_bias_profile_gap():
    assert ai.bias_profile({"a": 0.9, "b": 0.5})["biased"] is True


def test_distillation_efficiency():
    assert ai.distillation(teacher_acc=0.9, student_acc=0.88, compression=4)["efficient"] is True


def test_uncertainty_and_capability_graph():
    assert ai.uncertainty_estimate([1.0, 1.0, 1.0])["confident"] is True
    g = ai.capability_graph({"m1": ["reason", "code"], "m2": ["vision"]})
    assert g["n_capabilities"] == 3
