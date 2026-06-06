from __future__ import annotations
from runtime_core.world_os_runtime.quality import run_quality_gate

def check(envelope=None, **kwargs):
    return run_quality_gate("missingness_profile", envelope or {}, **kwargs)

def validate(envelope=None, **kwargs):
    return check(envelope or {}, **kwargs)

def run(envelope=None, **kwargs):
    return check(envelope or {}, **kwargs)
