"""Tests for the unified prediction engine — fully offline / deterministic.

All data is supplied via ``params`` so NO network or API key is required. Run:
    python3 -m pytest server/tests/test_prediction.py -q
"""

import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ["JARVIS_API_KEY"] = "test-key"
os.environ.pop("KIMI_API_KEY", None)  # force the regex fallback (no LLM)

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402
from server.services import prediction as P  # noqa: E402

client = TestClient(app)
HEADERS = {"Authorization": "Bearer test-key"}


def _synthetic_prices(n=120, p0=2.0, mu=0.001, sigma=0.02, seed=7):
    """A deterministic seeded GBM-like price series (no network)."""
    rng = np.random.default_rng(seed)
    rets = rng.normal(mu, sigma, n)
    prices = p0 * np.exp(np.cumsum(rets))
    t0 = 1_700_000_000_000  # ms
    return [{"t": t0 + i * 86_400_000, "v": float(v)} for i, v in enumerate(prices)]


# ── (a) crypto: numeric point estimate + interval low<point<high + P in [0,1] ──
def test_crypto_prediction_offline():
    series = _synthetic_prices()
    res = P.predict(
        "what will xrp be worth in 7 days?",
        {"domain": "crypto", "target": "xrp", "series": series, "horizon_hours": 24 * 7},
    )
    assert res["domain"] == "crypto"
    pred = res["prediction"]
    pe = pred["point_estimate"]
    assert isinstance(pe, (int, float)) and math.isfinite(pe)
    lo, hi = pred["interval"]["low"], pred["interval"]["high"]
    assert lo < pe < hi, f"expected low<point<high, got {lo} {pe} {hi}"
    assert 0.0 <= pred["probability"] <= 1.0
    assert 0.0 <= pred["interval"]["confidence"] <= 1.0
    assert res["used_llm"] is False
    assert "geometric_brownian_motion_montecarlo" in res["method"]["models_used"]
    assert res["assumptions"] and res["caveats"]


def test_crypto_via_endpoint_offline():
    series = _synthetic_prices()
    r = client.post(
        "/functions/predict",
        headers=HEADERS,
        json={"question": "btc price in 2 days", "params": {"domain": "crypto", "target": "btc", "series": series}},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["prediction"]["point_estimate"] is not None
    assert body["prediction"]["interval"]["low"] < body["prediction"]["interval"]["high"]


# ── (b) seismic: probability in [0,1] ─────────────────────────────────────────
def test_seismic_probability_offline():
    rng = np.random.default_rng(3)
    # exponential magnitude distribution above Mc=2.5, true b ~ 1.0
    mags = list(2.5 + rng.exponential(1.0 / (1.0 * math.log(10)), 800))
    res = P.predict(
        "chance of a magnitude 5 earthquake in the next 30 days?",
        {"domain": "seismic", "magnitudes": mags, "magnitude": 5.0, "catalog_days": 30.0, "horizon_hours": 24 * 30},
    )
    assert res["domain"] == "seismic"
    prob = res["prediction"]["probability"]
    assert 0.0 <= prob <= 1.0, prob
    assert res["drivers"]["b_value"] > 0
    # b-value of a true-b=1 synthetic catalog should land near 1.
    assert 0.7 < res["drivers"]["b_value"] < 1.4
    assert "poisson" in res["method"]["math"].lower()


def test_seismic_omori_aftershock():
    res = P.predict(
        "aftershock probability tomorrow",
        {"domain": "seismic", "mainshock_K": 200.0, "omori_c": 0.05, "omori_p": 1.1, "days_since_mainshock": 1.0, "horizon_hours": 24},
    )
    assert 0.0 <= res["prediction"]["probability"] <= 1.0
    assert "Omori" in res["method"]["name"]


# ── (c) trajectory: given state vector returns a plausible new lat/lng ─────────
def test_trajectory_great_circle():
    res = P.predict(
        "where will the flight be in 60 minutes?",
        {
            "domain": "trajectory",
            "lat": 0.0, "lng": 0.0, "alt_m": 10000.0,
            "speed_mps": 250.0, "heading_deg": 90.0, "vertical_rate_mps": 0.0,
            "horizon_hours": 1.0,
        },
    )
    assert res["domain"] == "trajectory"
    pt = res["prediction"]["point_estimate"]
    # heading 90 (east) from (0,0): lat stays ~0, lng increases.
    assert abs(pt["lat"]) < 0.5, pt
    assert pt["lng"] > 0.0, pt
    # 250 m/s * 3600 s = 900 km ~ 8.09 deg of longitude at the equator.
    assert 7.0 < pt["lng"] < 9.5, pt


def test_trajectory_orbital_reuse():
    res = P.predict("orbital period", {"domain": "trajectory", "semi_major_axis_km": 6678.0})
    assert res["prediction"]["value"] is not None
    assert 80 < res["prediction"]["value"] < 100  # LEO period ~ 90 min


# ── (d) growth: forecast with a confidence interval ───────────────────────────
def test_growth_forecast_with_ci():
    # logistic-ish adoption curve
    t = np.arange(20)
    K = 1000.0
    y = K / (1 + 50 * np.exp(-0.4 * t)) + np.random.default_rng(1).normal(0, 5, t.size)
    res = P.predict(
        "project user growth 5 steps out",
        {"domain": "growth", "values": list(y), "horizon_steps": 5, "unit": "users"},
    )
    assert res["domain"] == "growth"
    fc = res["data"]["forecast"]
    assert len(fc) == 5
    for pt in fc:
        assert pt["low"] <= pt["v"] <= pt["high"]
    pred = res["prediction"]
    assert pred["interval"]["low"] <= pred["point_estimate"] <= pred["interval"]["high"]
    assert pred["interval"]["confidence"] == 0.95


# ── robustness: never raises / never 500 on an unanswerable question ──────────
def test_insufficient_data_is_structured_not_error():
    res = P.predict("will it rain in tokyo next tuesday?", None)
    assert res["prediction"]["point_estimate"] is None
    assert res["caveats"]  # explains what's needed
    # endpoint must not 500 either
    r = client.post("/functions/predict", headers=HEADERS, json={"question": "is the moon made of cheese?"})
    assert r.status_code == 200


def test_classify_regex_fallback_no_llm():
    route = P.classify("forecast eth price in 48h")
    assert route["domain"] == "crypto"
    assert route["target"] == "eth"
    assert route["horizon_hours"] == 48.0
    assert route["used_llm"] is False
