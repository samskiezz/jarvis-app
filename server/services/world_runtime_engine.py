"""WORLD RUNTIME ENGINE — adapter from the platform to the world_os runtime_core.

The pack ships a real engine (runtime_core.world_os_runtime) whose connectors
enforce a built-in gate: nothing fetches unless terms_approved AND
live_fetch_allowed; otherwise a blocked/planned envelope. This adapter derives
terms_approved from the legal gate (cleared sources only) and audits every run.
"""
from __future__ import annotations
import urllib.parse
try:
    from runtime_core.world_os_runtime import connectors as _C
except Exception:  # noqa: BLE001
    _C = None  # type: ignore
try:
    from . import world_dispatch as wd
except Exception:  # noqa: BLE001
    wd = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore

def available() -> bool:
    return _C is not None

def _host(u: str) -> str:
    try:
        return urllib.parse.urlparse(u or "").netloc.lower()
    except Exception:  # noqa: BLE001
        return ""

def _terms_approved(url: str) -> bool:
    if wd is None:
        return False
    return _host(url) in getattr(wd, "CLEARED", {})

def run(connector_type: str, source_id: str, url: str, *, live_fetch: bool = False, **kwargs) -> dict:
    if not available():
        return {"ok": False, "error": "runtime_core unavailable"}
    approved = _terms_approved(url)
    res = _C.generic_connector(connector_type, source_id=source_id, url=url,
                               terms_approved=approved,
                               live_fetch_allowed=bool(live_fetch and approved), **kwargs)
    if jos is not None:
        jos.audit("runtime.connector.run", actor="world-runtime-engine", target=source_id,
                  meta={"connector": connector_type, "host": _host(url),
                        "terms_approved": approved, "ok": res.get("ok"), "blocked": res.get("blocked")})
    return res

def connector_types() -> list[str]:
    if not available():
        return []
    return [n.replace("_fetch","").replace("_query","").replace("_read","")
            for n in dir(_C) if any(n.endswith(s) for s in ("_fetch","_query","_read"))] or \
           ["rest_json","ckan","socrata","sparql","rss","document"]
