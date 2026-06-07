"""ADMIN / OBSERVABILITY routes — metrics, deep health, platform summary, roles.

A ready-to-mount ``APIRouter`` exposing the operator surface for the
JARVIS/APEX backend. Reads of metrics/health are ``optional_bearer`` (public
unless ``JARVIS_REQUIRE_AUTH=true``, matching the rest of the read API); the
admin summary and role config require a valid bearer via ``require_bearer``.

Wire it in ``server/main.py`` with::

    from .routes import admin as admin_routes
    app.include_router(admin_routes.router)

Endpoints:
  * ``GET /v1/metrics``        — registry snapshot + system metrics (public read).
  * ``GET /v1/health/deep``    — per-component health checks (public read).
  * ``GET /v1/admin/summary``  — platform_summary() counts (bearer).
  * ``GET /v1/admin/roles``    — clearance/role config from security (bearer).

Every handler is graceful: a missing/broken service degrades to a safe shape
rather than a 500.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends

from ..auth import optional_bearer, require_bearer
from ..services import metrics as metrics_svc

router = APIRouter()


# ── metrics ──────────────────────────────────────────────────────────────────────
@router.get("/v1/metrics")
async def get_metrics(_token: str | None = Depends(optional_bearer)):
    """Full metrics snapshot plus cheap process/system facts."""
    try:
        snap = metrics_svc.snapshot()
    except Exception:  # noqa: BLE001
        snap = {"counters": [], "timers": []}
    try:
        system = metrics_svc.system_metrics()
    except Exception:  # noqa: BLE001
        system = {}
    return {"metrics": snap, "system": system}


# ── deep health ──────────────────────────────────────────────────────────────────
def _check_history_lake() -> bool:
    """history_lake reachable: open a connection and read the series catalog."""
    try:
        from ..services import history_lake

        history_lake.init_db()
        history_lake.list_series()
        return True
    except Exception:  # noqa: BLE001
        return False


def _check_ontology() -> bool:
    """ontology store reachable: query objects without error."""
    try:
        from ..services.ontology_store import query_objects

        query_objects(limit=1)
        return True
    except Exception:  # noqa: BLE001
        return False


def _check_science_bridge() -> bool:
    """science bridge available (underworld registry imported)."""
    try:
        from ..services import science_bridge

        return bool(science_bridge.available())
    except Exception:  # noqa: BLE001
        return False


def _check_gpu_configured() -> bool:
    """Legacy GPU tier configured (PREDICT_GPU_URL set)."""
    try:
        from ..services.gpu_client import gpu_configured

        return bool(gpu_configured())
    except Exception:  # noqa: BLE001
        return False


def _check_gpu_compute() -> dict:
    """New GPU compute tier status (SGLang or remote Ollama)."""
    import os

    result = {"configured": False, "status": {"ok": False, "checked_at": 0.0}}
    try:
        from ..services import gpu_compute as gc

        if gc.gpu_configured():
            result["configured"] = True
            result["status"] = gc.gpu_status()
            return result
    except Exception:  # noqa: BLE001
        pass

    # Also count remote Ollama as GPU tier
    ollama_host = os.environ.get("OLLAMA_HOST", "").strip()
    if ollama_host and "localhost" not in ollama_host and "127.0.0.1" not in ollama_host:
        result["configured"] = True
        result["status"] = {"ok": True, "reason": "remote_ollama_gpu", "url": ollama_host}
    return result


def health_deep() -> dict:
    """Run every component check and return a per-component boolean map plus an
    overall ``ok`` (logical AND of the *required* core components). Never raises.

    ``gpu_configured`` is informational only and does NOT gate ``ok`` (the GPU
    tier is optional by design).
    """
    components = {
        "history_lake": _check_history_lake(),
        "ontology": _check_ontology(),
        "science_bridge": _check_science_bridge(),
        "gpu_configured": _check_gpu_configured(),
        "gpu_compute": _check_gpu_compute(),
    }
    core_ok = components["history_lake"] and components["ontology"]
    return {"ok": bool(core_ok), "components": components}


@router.get("/v1/health/deep")
async def get_health_deep(_token: str | None = Depends(optional_bearer)):
    return health_deep()


# ── GPU tier endpoints ───────────────────────────────────────────────────────────
@router.get("/v1/gpu/status")
async def get_gpu_status(_token: str | None = Depends(optional_bearer)):
    """Live GPU compute tier status.
    Checks SGLang (GPU_BASE_URL) first, then remote Ollama (OLLAMA_HOST).
    Returns health, configured flag, and last-known models."""
    import os

    from ..services import gpu_compute as gc

    result = {
        "sglang": {
            "configured": gc.gpu_configured(),
            "health": await gc.health_check(),
            "status": gc.gpu_status(),
        },
        "ollama": {"configured": False, "health": {"ok": False}, "models": []},
    }

    ollama_host = os.environ.get("OLLAMA_HOST", "").strip()
    if ollama_host and "localhost" not in ollama_host and "127.0.0.1" not in ollama_host:
        result["ollama"]["configured"] = True
        try:
            import urllib.request

            req = urllib.request.Request(
                ollama_host.rstrip("/") + "/api/tags",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=10.0) as r:
                data = json.loads(r.read().decode("utf-8", errors="ignore"))
            models = [m.get("name") for m in data.get("models", [])]
            result["ollama"]["health"] = {"ok": True, "models": models}
            result["ollama"]["models"] = models
        except Exception as exc:  # noqa: BLE001
            result["ollama"]["health"] = {"ok": False, "reason": repr(exc)}

    return result


@router.post("/v1/gpu/infer")
async def post_gpu_infer(request: dict, _token: str = Depends(require_bearer)):
    """Direct GPU LLM inference. Body: {messages, model?, temperature?, max_tokens?}.
    Streams token chunks back. Requires bearer token."""
    from ..services import gpu_compute as gc

    messages = request.get("messages", [])
    if not messages:
        return {"status": "error", "reason": "messages required"}

    model = request.get("model", "Qwen/Qwen3-8B")
    temperature = float(request.get("temperature", 0.7))
    max_tokens = int(request.get("max_tokens", 2048))

    from fastapi.responses import StreamingResponse

    async def _stream():
        async for chunk in gc.llm_infer(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            yield chunk

    return StreamingResponse(_stream(), media_type="text/plain")


@router.post("/v1/gpu/embed")
async def post_gpu_embed(request: dict, _token: str = Depends(require_bearer)):
    """Direct GPU embedding. Body: {texts: [...], model?}.
    Returns list of float vectors. Requires bearer token."""
    from ..services import gpu_compute as gc

    texts = request.get("texts", [])
    if not texts:
        return {"status": "error", "reason": "texts required"}

    model = request.get("model", "")
    result = await gc.embed(texts, model=model)
    if result is None:
        return {"status": "error", "reason": "gpu_embed_failed"}
    return {"status": "ok", "embeddings": result, "count": len(result)}


# ── admin summary ────────────────────────────────────────────────────────────────
@router.get("/v1/admin/summary")
async def get_admin_summary(_token: str = Depends(require_bearer)):
    """Aggregated platform counts (ontology, datasets, alerts, cases, reports,
    audit length) plus system metrics. Bearer required."""
    try:
        summary = metrics_svc.platform_summary()
    except Exception:  # noqa: BLE001
        summary = {}
    try:
        system = metrics_svc.system_metrics()
    except Exception:  # noqa: BLE001
        system = {}
    return {"summary": summary, "system": system}


# ── roles ────────────────────────────────────────────────────────────────────────
@router.get("/v1/admin/roles")
async def get_admin_roles(_token: str = Depends(require_bearer)):
    """The clearance/role configuration from the security service, if importable.

    Returns the role → visible-classifications map plus the marks lattice and the
    default role. Degrades to an ``available: false`` stub if security can't be
    imported. Never raises.
    """
    try:
        from ..services import security as security_svc

        clearance: dict[str, Any] = dict(getattr(security_svc, "CLEARANCE", {}))
        return {
            "available": True,
            "roles": sorted(clearance.keys()),
            "clearance": clearance,
            "marks": list(getattr(security_svc, "ALL_MARKS", [])),
            "default_role": getattr(security_svc, "DEFAULT_ROLE", None),
        }
    except Exception:  # noqa: BLE001
        return {"available": False, "roles": [], "clearance": {}, "marks": [], "default_role": None}
