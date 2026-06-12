"""Tiny stdlib HTTP helper shared by dashboard proxies and service modules."""
from __future__ import annotations

import json
import urllib.error
import urllib.request


def external_json(method: str, url: str, payload: dict | None, headers: dict) -> dict:
    """Proxy a JSON request to an external service and return {ok, data, error?, detail?}."""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return {"ok": True, "data": json.loads(resp.read().decode("utf-8", "replace"))}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}", "detail": e.read().decode("utf-8", "replace")[:800]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
