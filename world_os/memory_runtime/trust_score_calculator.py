from __future__ import annotations
from runtime_core.world_os_runtime.envelope import build_envelope, validate_envelope

def _execute_generic(module_name, *args, **kwargs):
    return build_envelope(source_id=module_name, record_type=module_name, payload={"args_count": len(args), "kwargs": kwargs})

def run(*args, **kwargs):
    return _execute_generic("trust_score_calculator.run", *args, **kwargs)

def validate(*args, **kwargs):
    return validate_envelope(_execute_generic("generic.validate", *args, **kwargs))

