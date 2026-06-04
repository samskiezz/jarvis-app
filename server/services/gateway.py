"""HTTP gateway from the APEX/JARVIS backend to the underworld backend.

APEX already reaches the underworld *science registry* in-process via
``services.science_bridge`` (a direct Python import of the methods registry —
fast, no network). This gateway is the complementary path for underworld
capability that only lives over HTTP: the simulation/worlds API, the physics
solver, the science endpoints and health — i.e. anything served by the separate
``underworld.server`` FastAPI app rather than the importable registry.

The whole point is that the APEX frontend reaches both paths through ONE base
URL (the APEX server): the science console keeps hitting ``/functions/science/*``
(in-process bridge) and everything else proxies through ``/v1/underworld/*``.

Design rules (mirrors ``science_bridge``):
  * Best-effort networking only. Every public function is network-guarded with a
    small timeout and a broad ``except`` — it returns an honest error *dict*
    instead of raising. APEX boot/tests must never break or hang on the gateway.
  * No network at import time. ``underworld_configured()`` reports config/intent,
    not live reachability, so importing this module is free.

This is an HTTP reverse-proxy + the existing in-process bridge. Full API-gateway
features (rate limiting, request re-authentication / token exchange, per-route
authz, response caching, circuit breaking) are intentionally NOT implemented
here — they are a later step on pillar P16.
"""
from __future__ import annotations

import json as _json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

# httpx is a hard dep of this backend (used by services.live_intel). We still
# import defensively so the gateway degrades to stdlib urllib rather than
# breaking the whole process if it ever goes missing.
try:  # pragma: no cover - exercised both ways across environments
    import httpx  # type: ignore

    _HAS_HTTPX = True
except Exception:  # noqa: BLE001
    httpx = None  # type: ignore
    _HAS_HTTPX = False


_DEFAULT_URL = "http://127.0.0.1:8001"


def underworld_url() -> str:
    """Base URL of the underworld backend (no trailing slash).

    Read fresh from the env on each call so tests can monkeypatch
    ``UNDERWORLD_URL`` to a guaranteed-unreachable host without re-importing.
    """
    return os.environ.get("UNDERWORLD_URL", _DEFAULT_URL).rstrip("/")


def underworld_configured() -> bool:
    """Whether the gateway has a usable target configured.

    Honest and cheap: returns ``True`` when an explicit ``UNDERWORLD_URL`` is set
    OR the default is in effect (the gateway always has *a* target to try). This
    deliberately does NOT perform any network I/O — use :func:`underworld_health`
    to learn whether the target is actually reachable right now.
    """
    try:
        return bool(underworld_url())
    except Exception:  # noqa: BLE001 - never raise
        return False


def _normalise_path(path: str) -> str:
    if not path:
        return "/"
    return path if path.startswith("/") else "/" + path


def _build_url(path: str, params: dict | None) -> str:
    url = underworld_url() + _normalise_path(path)
    if params:
        query = urllib.parse.urlencode(
            {k: v for k, v in params.items() if v is not None}, doseq=True
        )
        if query:
            url = f"{url}?{query}"
    return url


def _decode_body(text: str):
    """Return parsed JSON if the body is JSON, else the raw text."""
    try:
        return _json.loads(text)
    except Exception:  # noqa: BLE001
        return None


def _ok_payload(status: int, text: str) -> dict:
    parsed = _decode_body(text)
    if parsed is not None:
        return {"ok": True, "status": status, "json": parsed}
    return {"ok": True, "status": status, "text": text}


def _unreachable(url: str, detail: str) -> dict:
    return {
        "ok": False,
        "status": 502,
        "error": "underworld unreachable",
        "url": url,
        "detail": detail,
    }


def proxy(
    method: str,
    path: str,
    params: dict | None = None,
    json_body: dict | None = None,
    timeout: float = 12,
) -> dict:
    """Forward an HTTP request to ``UNDERWORLD_URL + path``. Never raises.

    Uses httpx when importable, else falls back to stdlib urllib. On success
    returns ``{ok:True, status, json|text}``. On any failure (server offline /
    not running / timeout / bad response) returns the honest
    ``{ok:False, status:502, error:"underworld unreachable", url:...}`` shape.
    """
    method = (method or "GET").upper()
    url = _build_url(path, params)
    try:
        if _HAS_HTTPX:
            return _proxy_httpx(method, url, json_body, timeout)
        return _proxy_urllib(method, url, json_body, timeout)
    except Exception as exc:  # noqa: BLE001 - gateway must never raise
        return _unreachable(url, f"{type(exc).__name__}: {exc}")


def _proxy_httpx(method: str, url: str, json_body: dict | None, timeout: float) -> dict:
    try:
        with httpx.Client(timeout=timeout) as client:  # type: ignore[union-attr]
            resp = client.request(
                method,
                url,
                json=json_body if json_body is not None else None,
            )
        return _ok_payload(resp.status_code, resp.text)
    except Exception as exc:  # noqa: BLE001 - httpx.* errors + anything else
        return _unreachable(url, f"{type(exc).__name__}: {exc}")


def _proxy_urllib(method: str, url: str, json_body: dict | None, timeout: float) -> dict:
    data = None
    headers = {"Accept": "application/json"}
    if json_body is not None:
        data = _json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            body = resp.read().decode("utf-8", "replace")
            status = getattr(resp, "status", None) or resp.getcode()
            return _ok_payload(int(status), body)
    except urllib.error.HTTPError as exc:
        # The underworld server answered with a non-2xx — that's a *reachable*
        # server returning an error, so surface its status + body honestly.
        try:
            body = exc.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            body = ""
        return _ok_payload(int(exc.code), body)
    except Exception as exc:  # noqa: BLE001 - URLError, socket timeout, DNS, ...
        return _unreachable(url, f"{type(exc).__name__}: {exc}")


def underworld_health(timeout: float = 4) -> dict:
    """Lightweight reachability probe. Never raises.

    Tries ``GET /healthz`` (the underworld app's health route), falling back to
    ``GET /`` (its service descriptor). Returns
    ``{reachable: bool, status, latency_ms, url, transport, detail?}``.
    """
    started = time.perf_counter()
    base = underworld_url()
    transport = "httpx" if _HAS_HTTPX else "urllib"
    last_detail = ""
    for probe in ("/healthz", "/health", "/"):
        res = proxy("GET", probe, timeout=timeout)
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        if res.get("ok") and int(res.get("status", 0)) < 500:
            return {
                "reachable": True,
                "status": res.get("status"),
                "latency_ms": latency_ms,
                "url": base + probe,
                "transport": transport,
            }
        last_detail = res.get("detail") or res.get("error") or last_detail
    return {
        "reachable": False,
        "status": 502,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        "url": base,
        "transport": transport,
        "detail": last_detail or "no probe path responded",
    }


# A static-but-honest map of the underworld HTTP endpoints this gateway exposes,
# so the UI can discover them. Derived from underworld/server/routes/* (worlds,
# physics, science, knowledge) + the app health route. These are reached via the
# generic proxy at GET|POST /v1/underworld/proxy/{path}. The list is intentionally
# representative (the underworld app has many more world sub-routes) rather than
# exhaustive — it covers health + the headline capability of each router.
_CATALOG: list[dict] = [
    {"path": "/healthz", "method": "GET", "desc": "Underworld liveness/health probe"},
    {"path": "/", "method": "GET", "desc": "Underworld service descriptor"},
    # worlds — the simulation API
    {"path": "/worlds", "method": "GET", "desc": "List simulation worlds"},
    {"path": "/worlds", "method": "POST", "desc": "Create a new simulation world"},
    {"path": "/worlds/{world_id}", "method": "GET", "desc": "Fetch one world"},
    {"path": "/worlds/{world_id}/advance", "method": "POST", "desc": "Advance a world one or more ticks"},
    {"path": "/worlds/{world_id}/map", "method": "GET", "desc": "World map state"},
    {"path": "/worlds/{world_id}/population", "method": "GET", "desc": "World population stats"},
    {"path": "/worlds/{world_id}/discoveries", "method": "GET", "desc": "Discoveries made in a world"},
    {"path": "/worlds/{world_id}/multiphysics", "method": "POST", "desc": "Run a multiphysics simulation in a world"},
    {"path": "/worlds/{world_id}/quantum", "method": "POST", "desc": "Run a quantum simulation in a world"},
    # physics — the deterministic solver/kernel
    {"path": "/physics/laws", "method": "GET", "desc": "List physical laws"},
    {"path": "/physics/constants", "method": "GET", "desc": "Physical constants"},
    {"path": "/physics/solve", "method": "POST", "desc": "Solve a physics problem"},
    {"path": "/physics/assess", "method": "POST", "desc": "Assess a physics claim/result"},
    {"path": "/physics/kernel/feasibility", "method": "POST", "desc": "Feasibility check via the physics kernel"},
    {"path": "/physics/kernel/conserve", "method": "POST", "desc": "Conservation-law check"},
    {"path": "/physics/kernel/units", "method": "GET", "desc": "Known units for the kernel"},
    # science — Bayesian / measurement / formula tooling
    {"path": "/science/bayes", "method": "POST", "desc": "Bayesian update"},
    {"path": "/science/measurement", "method": "POST", "desc": "Measurement / uncertainty handling"},
    {"path": "/science/parse-formula", "method": "POST", "desc": "Parse a scientific formula"},
    {"path": "/science/prior-art", "method": "POST", "desc": "Prior-art lookup"},
    {"path": "/science/anomaly", "method": "POST", "desc": "Anomaly detection"},
    # knowledge — the seeded knowledge base
    {"path": "/knowledge/summary", "method": "GET", "desc": "Knowledge base summary"},
    {"path": "/knowledge/concepts", "method": "GET", "desc": "List knowledge concepts"},
    {"path": "/knowledge/formulas", "method": "GET", "desc": "List known formulas"},
    {"path": "/knowledge/oracle", "method": "POST", "desc": "Query the knowledge oracle"},
]


def catalog() -> list[dict]:
    """Discoverable map of underworld HTTP endpoints this gateway proxies.

    Each entry is ``{path, method, desc}``. Returns a copy so callers can't
    mutate the module-level list. Never raises.
    """
    return [dict(entry) for entry in _CATALOG]
