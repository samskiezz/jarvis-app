"""Offline tests for PREDICTION-IN-CHAT (P9 #66).

Fully offline + fast: ``prediction.predict`` is monkeypatched so no network is
touched and the formatting/routing logic is exercised deterministically. Run:
    python3 -m pytest server/tests/test_chat_predict.py -q
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.routes import chat_predict as chat_predict_routes  # noqa: E402
from server.services import chat_predict as CP  # noqa: E402

# The chat_predict router is delivered ready-to-mount (main.py is not edited),
# so the route tests mount it here to exercise the HTTP surface offline.
if not any(getattr(r, "path", "").startswith("/v1/chat/predict") for r in app.router.routes):
    app.include_router(chat_predict_routes.router)

client = TestClient(app)
HEADERS = {"Authorization": "Bearer test-key"}


# A deterministic fake prediction-engine result (crypto shape).
_FAKE_PRED = {
    "question": "predict bitcoin in 24 hours",
    "domain": "crypto",
    "target": "bitcoin",
    "horizon": "24h",
    "prediction": {
        "value": 65000.0,
        "unit": "USD",
        "point_estimate": 65000.0,
        "interval": {"low": 60000.0, "high": 70000.0, "confidence": 0.90},
        "probability": 0.55,
    },
    "method": {"name": "GBM Monte-Carlo + Holt blend", "family": "time_series"},
    "drivers": {"conviction": 0.42},
    "caveats": ["Not financial advice."],
}


# ── intent detection ────────────────────────────────────────────────────────────
def test_detect_intent_true_on_predict_bitcoin():
    is_pred, extracted = CP.detect_prediction_intent("predict bitcoin in 24 hours")
    assert is_pred is True
    assert extracted["target"] == "bitcoin"
    # 24 hours -> ~24h horizon.
    assert extracted["horizon_hours"] == 24.0


def test_detect_intent_false_on_hello():
    is_pred, extracted = CP.detect_prediction_intent("hello")
    assert is_pred is False
    assert extracted["target"] is None


def test_detect_intent_asset_with_horizon_no_verb():
    # An asset + horizon clause is itself a forecast request even without a verb.
    is_pred, _ = CP.detect_prediction_intent("btc in 24h")
    assert is_pred is True


def test_detect_intent_false_on_plain_lookup():
    is_pred, _ = CP.detect_prediction_intent("what is PSG?")
    assert is_pred is False


# ── answer_with_prediction ──────────────────────────────────────────────────────
def test_answer_with_prediction_handled_and_honesty(monkeypatch):
    monkeypatch.setattr(CP._prediction, "predict", lambda q, params=None: _FAKE_PRED)
    out = CP.answer_with_prediction("predict bitcoin in 24 hours")
    assert out["handled"] is True
    assert out["prediction"] == _FAKE_PRED
    ans = out["answer"]
    # honesty line present, and explicitly NOT a 99% directional claim.
    assert CP.HONESTY_LINE in ans
    assert "99%" in CP.HONESTY_LINE and "NOT" in CP.HONESTY_LINE
    # grounded numbers surfaced.
    assert "65,000" in ans
    assert "60,000" in ans and "70,000" in ans
    assert "90%" in ans  # confidence


def test_answer_with_prediction_not_handled_on_chitchat(monkeypatch):
    # predict must NOT be called when intent is false.
    def _boom(*a, **k):
        raise AssertionError("predict should not be called for non-prediction")

    monkeypatch.setattr(CP._prediction, "predict", _boom)
    out = CP.answer_with_prediction("hello there")
    assert out["handled"] is False


def test_answer_with_prediction_insufficient_data(monkeypatch):
    insufficient = {
        "domain": "crypto",
        "target": "bitcoin",
        "horizon": "24h",
        "prediction": {
            "value": None,
            "point_estimate": None,
            "interval": {"low": None, "high": None, "confidence": 0.0},
            "probability": None,
        },
        "method": {"name": "insufficient_data"},
        "caveats": ["Insufficient data to answer. Needs: a price series."],
    }
    monkeypatch.setattr(CP._prediction, "predict", lambda q, params=None: insufficient)
    out = CP.answer_with_prediction("forecast bitcoin in 24 hours")
    assert out["handled"] is True
    assert "Insufficient data" in out["answer"]
    assert CP.HONESTY_LINE in out["answer"]


def test_answer_passes_extracted_target_horizon(monkeypatch):
    captured = {}

    def _capture(q, params=None):
        captured["params"] = params
        return _FAKE_PRED

    monkeypatch.setattr(CP._prediction, "predict", _capture)
    CP.answer_with_prediction("predict btc in 1 week")
    assert captured["params"]["target"] == "btc"
    assert captured["params"]["horizon_hours"] == 24.0 * 7.0


# ── route classifier ────────────────────────────────────────────────────────────
def test_route_classifies_prediction():
    r = CP.route("predict bitcoin in 24 hours")
    assert r["intent"] == "prediction"
    assert r["is_prediction"] is True
    assert r["target"] == "bitcoin"


def test_route_classifies_other():
    r = CP.route("hello")
    assert r["intent"] == "other"
    assert r["is_prediction"] is False


# ── HTTP route layer (offline) ──────────────────────────────────────────────────
def test_route_endpoint_predict(monkeypatch):
    monkeypatch.setattr(CP._prediction, "predict", lambda q, params=None: _FAKE_PRED)
    r = client.post("/v1/chat/predict", json={"message": "predict bitcoin in 24 hours"}, headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["handled"] is True
    assert CP.HONESTY_LINE in body["answer"]


def test_route_endpoint_route():
    r = client.post("/v1/chat/route", json={"message": "hello"}, headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["intent"] == "other"

    r = client.post("/v1/chat/route", json={"message": "forecast eth in 2 days"}, headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["intent"] == "prediction"
