"""Tests for the GPU/CPU backend selector."""
import numpy as np
from underworld.server.services import gpu_backend as gb


def test_auto_falls_back_to_numpy_without_gpu():
    b = gb.get_backend("auto")
    assert b.name in ("numpy", "cupy")
    if not b.is_gpu:
        assert b.name == "numpy" and b.device == "cpu"


def test_numpy_backend_is_functional():
    b = gb.get_backend("numpy")
    a = b.xp.zeros((4, 3))
    assert a.shape == (4, 3)
    assert b.asnumpy(a).shape == (4, 3)              # host transfer is a no-op
    b.synchronize()                                  # no-op on CPU, must not raise


def test_rng_is_deterministic():
    b = gb.get_backend("numpy")
    r1 = b.rng(7).random(5)
    r2 = b.rng(7).random(5)
    assert np.allclose(r1, r2)


def test_available_backends_reports_hardware():
    info = gb.available_backends()
    assert info["numpy"] is True
    assert "gpus" in info and "devices" in info


def test_same_rich_tick_runs_on_selected_backend():
    # the identical rich tick runs unchanged on whatever backend is bound
    from underworld.server.services import scale_bench as sb
    r = sb.benchmark(2000, ticks=2, prefer="auto")
    assert r["minion_ticks_per_sec"] > 0
    assert r["backend"] in ("numpy", "cupy")
