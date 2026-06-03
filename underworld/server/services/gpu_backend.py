"""GPU backend selector — one rich tick, runs on GPU or CPU unchanged.

The rich per-Minion tick is written against a single array namespace `xp`. At
runtime we bind `xp` to CuPy (NVIDIA GPU) when a GPU + CuPy are present, else to
NumPy (CPU). CuPy is a near-drop-in for NumPy, so the *identical* rich logic runs
on a vast.ai GPU at GPU speed or on a laptop CPU — no separate code path, no loss
of richness.

  backend = get_backend()            # auto: cupy if a GPU is here, else numpy
  xp = backend.xp
  a = xp.zeros((n, 4))               # lives on GPU under cupy, on CPU under numpy

PyTorch is also viable (and adds autograd for distilling the LLM into the policy);
CuPy is chosen as the primary because it is a true NumPy API drop-in.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Backend:
    xp: Any                  # the array module (cupy or numpy)
    name: str                # "cupy" | "numpy"
    device: str              # human-readable device label
    is_gpu: bool

    def asnumpy(self, a):
        """Bring an array back to host NumPy (no-op under numpy)."""
        if self.name == "cupy":
            return self.xp.asnumpy(a)
        return a

    def synchronize(self):
        """Block until queued GPU work finishes (for honest timing)."""
        if self.name == "cupy":
            self.xp.cuda.runtime.deviceSynchronize()

    def rng(self, seed: int = 0):
        """A Generator on the right device (numpy + modern cupy both support
        default_rng)."""
        return self.xp.random.default_rng(seed)


def get_backend(prefer: str = "auto") -> Backend:
    """Bind the array backend. prefer: 'auto' | 'cupy' | 'numpy'.

    'auto' uses CuPy only if a CUDA GPU is actually present, so the same call
    transparently uses the vast.ai GPU in production and NumPy in dev/CI.
    """
    if prefer in ("auto", "cupy"):
        try:
            import cupy as xp  # type: ignore
            ndev = xp.cuda.runtime.getDeviceCount()
            if ndev > 0:
                props = xp.cuda.runtime.getDeviceProperties(0)
                name = props["name"].decode() if isinstance(props["name"], bytes) else str(props["name"])
                return Backend(xp=xp, name="cupy", device=f"{name} (+{ndev - 1} more)" if ndev > 1 else name, is_gpu=True)
        except Exception:
            if prefer == "cupy":
                raise RuntimeError("CuPy/GPU requested but unavailable")

    import numpy as xp  # type: ignore
    return Backend(xp=xp, name="numpy", device="cpu", is_gpu=False)


def available_backends() -> dict:
    """Report what this machine can run on — useful before launching on vast.ai."""
    out = {"numpy": True, "cupy": False, "torch_cuda": False, "gpus": 0, "devices": []}
    try:
        import cupy  # type: ignore
        n = cupy.cuda.runtime.getDeviceCount()
        out["cupy"] = n > 0
        out["gpus"] = n
        for i in range(n):
            p = cupy.cuda.runtime.getDeviceProperties(i)
            nm = p["name"].decode() if isinstance(p["name"], bytes) else str(p["name"])
            out["devices"].append(nm)
    except Exception:
        pass
    try:
        import torch  # type: ignore
        out["torch_cuda"] = bool(torch.cuda.is_available())
        if out["gpus"] == 0 and out["torch_cuda"]:
            out["gpus"] = torch.cuda.device_count()
            out["devices"] = [torch.cuda.get_device_name(i) for i in range(out["gpus"])]
    except Exception:
        pass
    return out
