from __future__ import annotations
from runtime_core.world_os_runtime.connectors import generic_connector, to_envelope

def _execute_connector(*args, **kwargs):
    source_id = kwargs.pop("source_id", "sparql")
    url = kwargs.pop("url", kwargs.pop("endpoint", kwargs.pop("base_url", "")))
    return generic_connector("sparql", source_id=source_id, url=url, **kwargs)

def run(*args, **kwargs):
    return _execute_connector(*args, **kwargs)

def parse(*args, **kwargs):
    return to_envelope(_execute_connector(*args, **kwargs), record_type="sparql_connector_result")

def validate(*args, **kwargs):
    result = _execute_connector(*args, **kwargs)
    return {"valid": isinstance(result, dict), "ok": result.get("ok"), "blocked": result.get("blocked"), "reason": result.get("reason")}

