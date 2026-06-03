"""Tests for the Minion research dispatcher (real engines wired into lives)."""
from underworld.server.services import minion_research as mr


def test_every_technical_guild_runs_a_real_engine():
    for g in ("materials", "physics", "electrical", "mechanical", "civil",
              "computing", "energy", "maths", "agriculture"):
        r = mr.run_research(g, seed=7)
        assert r["grounded"] is True
        assert 0.0 <= r["quality"] <= 1.0
        assert r["summary"]


def test_computing_guild_really_runs_quantum_circuit():
    r = mr.run_research("computing", seed=1)
    assert "CHSH" in r["summary"]
    assert r["quality"] > 0.99                     # reaches the Tsirelson bound


def test_non_technical_guild_is_neutral_not_crashing():
    r = mr.run_research("patent", seed=1)
    assert r["grounded"] is False
    assert r["quality"] == 0.5


def test_deterministic_for_replay():
    a = mr.run_research("materials", seed=123)
    b = mr.run_research("materials", seed=123)
    assert a == b


def test_quality_varies_with_seed():
    qs = {mr.run_research("energy", seed=s)["quantity"] for s in range(5)}
    assert len(qs) > 1                              # real parameter dependence
