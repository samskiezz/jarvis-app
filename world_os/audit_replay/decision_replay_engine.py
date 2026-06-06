from __future__ import annotations
from runtime_core.world_os_runtime.actions import execute_action

def _execute_module_action(action_name, *args, **kwargs):
    return execute_action(action_name, target_id=kwargs.get("target_id",""), actor=kwargs.get("actor","system"), purpose=kwargs.get("purpose","runtime_execution"), approval_id=kwargs.get("approval_id"), payload={"args_count": len(args), "kwargs": kwargs})

def run(*args, **kwargs):
    return _execute_module_action("decision_replay_engine.run", *args, **kwargs)

