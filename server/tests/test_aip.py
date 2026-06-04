"""Offline, deterministic tests for the AIP layer (``services.aip``).

NO network, NO Kimi key, stdlib/numpy only. Run from the repo root:

    python3 -m pytest server/tests/test_aip.py -q

Asserts:
  * retrieve returns ranked grounding for a known ontology term;
  * answer_grounded returns an answer + non-empty sources for an ontology question;
  * predict_tool returns the prediction schema for a supplied series (params);
  * skill_scorecard returns the summary shape;
  * oracle_signal is graceful when the joblib model / series is absent.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Ensure no Kimi key leaks in from the environment — these tests are OFFLINE.
os.environ.pop("KIMI_API_KEY", None)

import numpy as np  # noqa: E402

from server.services import aip  # noqa: E402


# ── helpers ───────────────────────────────────────────────────────────────────
def _price_series(n=400, seed=11):
    """A positive synthetic daily price series (GBM-ish) with timestamps, long
    enough to feed the prediction engine deterministically and offline."""
    rng = np.random.default_rng(seed)
    r = rng.normal(0.0005, 0.01, n)
    price = 100.0 * np.exp(np.cumsum(r))
    t0 = 1_600_000_000_000
    step = 86_400_000  # daily ms
    return [{"t": t0 + i * step, "v": float(price[i])} for i in range(n)]


# ── 1. retrieve ───────────────────────────────────────────────────────────────
def test_retrieve_ranks_known_term():
    hits = aip.retrieve("Project Solar", k=5)
    assert isinstance(hits, list) and hits, "expected grounding hits"
    assert len(hits) <= 5
    for h in hits:
        assert set(h) >= {"id", "label", "type", "snippet", "score"}
    # ranked: scores are non-increasing
    scores = [h["score"] for h in hits]
    assert scores == sorted(scores, reverse=True)
    # the known PSG object should ground the query
    assert any(h.get("id") == "psg" for h in hits), hits


def test_retrieve_graceful_on_garbage():
    # never raises; returns a (possibly fuzzy) list
    out = aip.retrieve("zzqqxx-not-a-real-term", k=3)
    assert isinstance(out, list)


# ── 2. answer_grounded ────────────────────────────────────────────────────────
def test_answer_grounded_has_answer_and_sources():
    res = aip.answer_grounded("Tell me about Pangani Tanzania")
    assert isinstance(res, dict)
    assert set(res) >= {"answer", "sources", "used"}
    assert isinstance(res["answer"], str) and res["answer"].strip()
    assert isinstance(res["sources"], list) and res["sources"], "sources must be non-empty"
    assert res["used"]["kimi"] is False  # OFFLINE: never used Kimi
    assert res["used"]["n_sources"] == len(res["sources"])
    assert any(s.get("id") == "pangani" for s in res["sources"]), res["sources"]
    # the linked risk signals for Pangani should surface in the answer body
    assert "RISK" in res["answer"].upper()


# ── 3. predict_tool ───────────────────────────────────────────────────────────
def test_predict_tool_returns_schema_for_supplied_series():
    series = _price_series()
    res = aip.predict_tool(
        "Predict BTC price next day",
        {"series": series, "lookback_days": 90},
    )
    assert isinstance(res, dict)
    # the prediction engine schema
    assert "prediction" in res and isinstance(res["prediction"], dict)
    pred = res["prediction"]
    assert "point_estimate" in pred or "value" in pred
    assert "interval" in pred and {"low", "high"} <= set(pred["interval"])
    assert "method" in res and "data" in res


# ── 4. skill_scorecard ────────────────────────────────────────────────────────
def test_skill_scorecard_shape(tmp_path, monkeypatch):
    # isolate the History Lake to an empty temp DB so the shape is deterministic
    monkeypatch.setenv("HISTORY_LAKE_DB", str(tmp_path / "hl.db"))
    res = aip.skill_scorecard()
    assert isinstance(res, dict)
    assert set(res) >= {"domain", "skill_summary", "scorecard"}
    summ = res["skill_summary"]
    assert set(summ) >= {"n_scored", "mae", "rmse", "coverage", "mean_skill_vs_baseline"}
    assert summ["n_scored"] == 0  # empty store


# ── 5. oracle_signal ──────────────────────────────────────────────────────────
def test_oracle_signal_graceful_without_model(monkeypatch):
    # point the loader at a non-existent joblib and reset the cache so the
    # missing-model path is exercised regardless of the shipped model file.
    monkeypatch.setenv("ORACLE_MODEL_PATH", "/nonexistent/oracle_model.joblib")
    monkeypatch.setattr(aip, "_ORACLE_CACHE", None, raising=False)
    res = aip.oracle_signal("bitcoin")
    assert isinstance(res, dict)
    assert res["status"] in ("no_model", "not_fitted", "insufficient_data", "error")


def test_oracle_signal_graceful_without_series(monkeypatch):
    # even if a model loads, an absent series must degrade gracefully (no network).
    monkeypatch.setattr(aip, "_ORACLE_CACHE", None, raising=False)
    res = aip.oracle_signal("definitely-not-an-asset", series=[])
    assert isinstance(res, dict)
    assert res["status"] in ("no_model", "not_fitted", "insufficient_data", "error")
