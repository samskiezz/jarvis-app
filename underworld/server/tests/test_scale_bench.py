"""Tests for the full-richness scaling benchmark."""
from underworld.server.services import scale_bench as sb


def test_rich_tick_scales_and_is_complete():
    # the benchmark runs the full rich per-Minion math and returns sane throughput
    r = sb.benchmark(5000, ticks=3)
    assert r["minion_ticks_per_sec"] > 100_000      # comfortably fast even on CPU
    assert r["bytes_per_minion"] > 0


def test_throughput_is_roughly_linear():
    # vectorised work scales ~linearly in N (per-Minion-tick cost ~constant)
    small = sb.benchmark(10_000, ticks=3)["minion_ticks_per_sec"]
    big = sb.benchmark(100_000, ticks=3)["minion_ticks_per_sec"]
    assert big > small * 0.4                         # no superlinear blowup


def test_llm_capacity_staggered_deliberation_is_feasible():
    c = sb.llm_capacity(n_minions=1_000_000, deliberation_interval_ticks=100, gpus=32)
    assert c["llm_gens_needed_per_tick"] == 10_000
    assert c["feasible_realtime"] is True            # 32 GPUs sustain >1 tick/s


def test_llm_capacity_scales_with_interval_and_gpus():
    a = sb.llm_capacity(n_minions=1_000_000, deliberation_interval_ticks=50, gpus=8)
    b = sb.llm_capacity(n_minions=1_000_000, deliberation_interval_ticks=200, gpus=8)
    assert b["sustained_ticks_per_sec"] > a["sustained_ticks_per_sec"]
