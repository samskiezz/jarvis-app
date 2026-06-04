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
    """GPU tier configured (PREDICT_GPU_URL set)."""
    try:
        from ..services.gpu_client import gpu_configured

        return bool(gpu_configured())
    except Exception:  # noqa: BLE001
        return False


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
    }
    core_ok = components["history_lake"] and components["ontology"]
    return {"ok": bool(core_ok), "components": components}


@router.get("/v1/health/deep")
async def get_health_deep(_token: str | None = Depends(optional_bearer)):
    return health_deep()


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
