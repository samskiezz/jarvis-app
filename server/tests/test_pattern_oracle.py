"""Tests for the Pattern Oracle Self-Improvement cluster.

Covers: pattern discovery, learned forecasts, self-improvement loop,
Forge scheduler, and the extended predict routes.

Run:
    source .venv/bin/activate && python3 -m pytest server/tests/test_pattern_oracle.py -q
"""

import asyncio
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

os.environ["JARVIS_API_KEY"] = "test-key"
os.environ["JARVIS_REQUIRE_AUTH"] = "true"
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["PATTERN_ORACLE_DB"] = _db_path

import math  # noqa: E402

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server.main import app  # noqa: E402

client = TestClient(app)
HEADERS = {"Authorization": "Bearer test-key"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _synthetic_series(n: int = 60, seed: int = 42) -> list[float]:
    rng = np.random.default_rng(seed)
    trend = np.linspace(10, 20, n)
    seasonal = 3 * np.sin(2 * np.pi * np.arange(n) / 12)
    noise = rng.normal(0, 0.5, n)
    return [float(v) for v in trend + seasonal + noise]


def _series_with_jump(n: int = 60, jump_at: int = 30) -> list[float]:
    s = _synthetic_series(n)
    for i in range(jump_at, n):
        s[i] += 15.0
    return s


# ── 1. Pattern Discovery ──────────────────────────────────────────────────────


def test_patterns_import():
    from server.ml import patterns

    assert patterns is not None


def test_discover_patterns_motifs():
    from server.ml.patterns import discover_patterns

    s = _synthetic_series(80)
    result = asyncio.run(discover_patterns(s, window=12))
    assert "motifs" in result
    assert isinstance(result["motifs"], list)


def test_discover_patterns_discords():
    from server.ml.patterns import discover_patterns

    s = _synthetic_series(80)
    result = asyncio.run(discover_patterns(s, window=12))
    assert "discords" in result
    assert isinstance(result["discords"], list)


def test_discover_patterns_regimes():
    from server.ml.patterns import discover_patterns

    s = _series_with_jump(80)
    result = asyncio.run(discover_patterns(s, window=12))
    assert "regimes" in result
    assert isinstance(result["regimes"], list)
    if result["regimes"]:
        assert "centroid" in result["regimes"][0]


def test_discover_patterns_changepoints():
    from server.ml.patterns import discover_patterns

    s = _series_with_jump(80)
    result = asyncio.run(discover_patterns(s, window=12))
    assert "changepoints" in result
    assert isinstance(result["changepoints"], list)


def test_discover_patterns_anomalies():
    from server.ml.patterns import discover_patterns

    s = _synthetic_series(80)
    s[40] += 20.0  # spike
    result = asyncio.run(discover_patterns(s, window=12))
    assert "anomalies" in result
    assert isinstance(result["anomalies"], list)


def test_discover_patterns_short_series():
    from server.ml.patterns import discover_patterns

    result = asyncio.run(discover_patterns([1.0, 2.0], window=3))
    assert "error" in result


def test_discover_patterns_persistence():
    from server.ml.patterns import discover_patterns, _conn

    s = _synthetic_series(40)
    asyncio.run(discover_patterns(s, window=8))
    row = _conn().execute("SELECT COUNT(*) FROM pattern_discoveries").fetchone()
    assert row[0] >= 1


# ── 2. Learned Forecasts ──────────────────────────────────────────────────────


def test_forecast_import():
    from server.ml import forecast

    assert forecast is not None


def test_forecast_naive():
    from server.ml.forecast import forecast_learned

    s = _synthetic_series(30)
    result = asyncio.run(forecast_learned(s, horizon=5, model="naive"))
    assert len(result["forecast"]) == 5
    assert all(math.isfinite(v) for v in result["forecast"])


def test_forecast_theta():
    from server.ml.forecast import forecast_learned

    s = _synthetic_series(30)
    result = asyncio.run(forecast_learned(s, horizon=5, model="theta"))
    assert len(result["forecast"]) == 5


def test_forecast_enkf():
    from server.ml.forecast import forecast_learned

    s = _synthetic_series(30)
    result = asyncio.run(forecast_learned(s, horizon=5, model="enkf"))
    assert len(result["forecast"]) == 5


def test_forecast_conformal():
    from server.ml.forecast import forecast_learned

    s = _synthetic_series(30)
    result = asyncio.run(forecast_learned(s, horizon=5, model="conformal"))
    assert len(result["forecast"]) == 5
    assert result["confidence"] >= 0.9


def test_forecast_auto_select():
    from server.ml.forecast import forecast_learned

    s = _synthetic_series(30)
    result = asyncio.run(forecast_learned(s, horizon=5, model="auto"))
    assert "model" in result
    assert result["model"] is not None


def test_forecast_intervals_sane():
    from server.ml.forecast import forecast_learned

    s = _synthetic_series(30)
    result = asyncio.run(forecast_learned(s, horizon=5, model="theta"))
    for i in range(5):
        assert result["low"][i] <= result["forecast"][i] <= result["high"][i]


def test_forecast_persistence():
    from server.ml.forecast import forecast_learned, _conn

    s = _synthetic_series(20)
    asyncio.run(forecast_learned(s, horizon=3, model="naive"))
    row = _conn().execute("SELECT COUNT(*) FROM forecast_runs").fetchone()
    assert row[0] >= 1


# ── 3. Self-Improvement Loop ──────────────────────────────────────────────────


def test_self_improvement_import():
    from server.services import self_improvement

    assert self_improvement is not None


def test_evaluate_forecast():
    from server.ml.forecast import forecast_learned
    from server.services.self_improvement import evaluate_forecast

    s = _synthetic_series(20)
    f = asyncio.run(forecast_learned(s, horizon=5, model="naive"))
    fid = f.get("forecast_id")
    if fid is None:
        return
    actuals = [v + 0.1 for v in f["forecast"]]
    result = asyncio.run(evaluate_forecast(fid, actuals))
    assert "rmse" in result
    assert result["rmse"] >= 0


def test_should_retrain_no_history():
    from server.services.self_improvement import should_retrain

    result = asyncio.run(should_retrain("nonexistent_model"))
    assert result["retrain"] is True
    assert result["reason"] == "no score history"


def test_should_retrain_threshold():
    from server.services.self_improvement import should_retrain

    result = asyncio.run(should_retrain("test_model", threshold={"rmse": 0.0}))
    # With no history it still returns retrain=True
    assert result["retrain"] is True


def test_trigger_retrain():
    from server.services.self_improvement import trigger_retrain

    result = asyncio.run(trigger_retrain("test_model"))
    assert result["status"] == "pending"
    assert "retrain_id" in result


def test_upgrade_model_if_better():
    from server.services.self_improvement import upgrade_model_if_better

    result = asyncio.run(upgrade_model_if_better("missing-candidate"))
    assert result["upgraded"] is False


def test_improvement_status():
    from server.services.self_improvement import improvement_status

    result = asyncio.run(improvement_status())
    assert "model_scores" in result
    assert "pending_retrains" in result


# ── 4. Forge Scheduler ────────────────────────────────────────────────────────


def test_forge_scheduler_import():
    from server.services import forge_scheduler

    assert forge_scheduler is not None


def test_forge_scheduler_status():
    from server.services.forge_scheduler import forge_scheduler_status

    result = asyncio.run(forge_scheduler_status())
    assert "enabled" in result
    assert "dry_run" in result
    assert "total_runs" in result


def test_forge_scheduler_disabled_by_default():
    from server.services import forge_scheduler as fs

    assert fs.FORGE_SCHEDULE_ENABLED is False


# ── 5. Routes ─────────────────────────────────────────────────────────────────


def test_route_learned_forecast():
    s = _synthetic_series(20)
    r = client.post("/v1/predict/learned", headers=HEADERS, json={"series": s, "horizon": 3, "model": "naive"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["forecast"]) == 3


def test_route_patterns():
    s = _synthetic_series(40)
    r = client.get("/v1/predict/patterns", headers=HEADERS, params={"series": s, "window": 8})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "motifs" in body


def test_route_models():
    r = client.get("/v1/predict/models", headers=HEADERS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["models"], list)


def test_route_evaluate():
    s = _synthetic_series(20)
    fr = client.post("/v1/predict/learned", headers=HEADERS, json={"series": s, "horizon": 3, "model": "naive"})
    assert fr.status_code == 200, fr.text
    fid = fr.json().get("forecast_id")
    if fid is None:
        return
    r = client.post(
        "/v1/predict/evaluate",
        headers=HEADERS,
        json={"forecast_id": fid, "actuals": [v + 0.1 for v in fr.json()["forecast"]]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "rmse" in body or "error" in body


def test_route_improvement():
    r = client.get("/v1/predict/improvement", headers=HEADERS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "model_scores" in body
