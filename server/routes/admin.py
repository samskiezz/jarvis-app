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


# ── PM2 fleet control (the operator's "manage while I sleep" panel) ────────────────
import json as _json
import shutil as _shutil
import subprocess as _subprocess


def _pm2_bin() -> str | None:
    return _shutil.which("pm2")


def _pm2_list() -> list[dict]:
    """Parse `pm2 jlist` into compact rows (name, status, cpu%, mem, uptime, restarts, pid)."""
    pm2 = _pm2_bin()
    if not pm2:
        return []
    try:
        out = _subprocess.run([pm2, "jlist"], capture_output=True, text=True, timeout=10)
        procs = _json.loads(out.stdout or "[]")
    except Exception:  # noqa: BLE001
        return []
    rows = []
    for p in procs:
        env = p.get("pm2_env", {}) or {}
        mon = p.get("monit", {}) or {}
        rows.append({
            "name": p.get("name"),
            "id": p.get("pm_id"),
            "status": env.get("status"),
            "cpu": mon.get("cpu"),
            "memory": mon.get("memory"),          # bytes
            "uptime": env.get("pm_uptime"),        # epoch ms when started
            "restarts": env.get("restart_time"),
            "pid": p.get("pid"),
            "unstable": env.get("unstable_restarts", 0),
        })
    rows.sort(key=lambda r: (r.get("name") or "").lower())
    return rows


@router.get("/v1/pm2")
async def pm2_list(_token: str | None = Depends(optional_bearer)):
    """Live fleet status — every pm2 process with cpu/mem/uptime/restarts. Read-only, never raises."""
    rows = _pm2_list()
    return {"available": _pm2_bin() is not None, "count": len(rows), "processes": rows}


# Only these may be toggled from the panel (never the API serving this request, to avoid self-kill).
_PM2_GUARDED = {"jarvis-backend"}
# SHARED services owned by ANOTHER product (the Underworld sim). The panel must NEVER control these —
# stopping/bouncing them is the one thing the build rules forbid. Deny ALL actions, deny-by-default.
_PM2_SHARED = {"underworld-backend"}
_PM2_ACTIONS = {"start", "stop", "restart", "reload"}


@router.post("/v1/pm2/{name}/{action}")
async def pm2_action(name: str, action: str, _token: str = Depends(require_bearer)):
    """Start/stop/restart/reload a pm2 process. Auth required (bearer). Refuses to touch a shared
    service, and refuses to stop the backend that serves this very request, so the operator can't
    accidentally take down the sim or lock themselves out."""
    pm2 = _pm2_bin()
    if not pm2:
        return {"ok": False, "error": "pm2 not found on PATH"}
    act = action.lower()
    if act not in _PM2_ACTIONS:
        return {"ok": False, "error": f"unknown action '{action}'"}
    if name in _PM2_SHARED:
        return {"ok": False, "error": f"'{name}' is a shared service (another product) — it cannot be controlled from this panel"}
    if name in _PM2_GUARDED and act in ("stop",):
        return {"ok": False, "error": f"'{name}' is guarded (it serves this API) — use restart instead"}
    try:
        r = _subprocess.run([pm2, act, name], capture_output=True, text=True, timeout=30)
        ok = r.returncode == 0
        return {"ok": ok, "name": name, "action": act,
                "detail": (r.stdout or r.stderr or "").strip()[-300:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "name": name, "action": act, "error": str(e)[:200]}


# ── UE5 render pipeline status (the background build→deploy→stream job) ────────────
@router.get("/v1/pipeline")
async def pipeline_status(_token: str | None = Depends(optional_bearer)):
    """Live status of the UE5 render pipeline (per-step status + ETA), read from the status file
    written by scripts/ue5_pipeline.py. Returns {running:false} when no pipeline has run."""
    import os as _os, time as _time
    path = "/opt/jarvis-app-1/ue5_pipeline_status.json"
    try:
        with open(path) as f:
            data = _json.load(f)
    except FileNotFoundError:
        return {"status": "idle", "steps": [], "overall_pct": 0, "eta_s": 0,
                "note": "no pipeline run yet"}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": str(e)[:200], "steps": []}
    # Staleness guard: a status file that says 'running' but whose process is gone (OOM/crash/reboot)
    # — or which hasn't heartbeated in >10min — would otherwise freeze the panel on a dead ETA and
    # keep LAUNCH disabled forever. Surface 'stalled' so the operator can see it died and relaunch.
    try:
        if data.get("status") == "running":
            pid = data.get("pid")
            alive = False
            if pid:
                try:
                    _os.kill(int(pid), 0); alive = True
                except OSError:
                    alive = False
            else:
                alive = bool(_os.popen("pgrep -f 'ue5_pipeline[.]py'").read().strip())
            stale = (_time.time() - float(data.get("updated_at", 0))) > 600
            if not alive or stale:
                data["status"] = "stalled"
                data["note"] = "pipeline process not running — status is stale (safe to relaunch)"
                for s in data.get("steps", []):
                    if s.get("status") == "running":
                        s["status"] = "stalled"
    except Exception:  # noqa: BLE001
        pass
    return data


@router.post("/v1/pipeline/start")
async def pipeline_start(_token: str = Depends(require_bearer)):
    """(Re)launch the UE5 render pipeline as a detached background job. Bearer-guarded. No-op if a
    pipeline process is already running."""
    import os as _os
    # Bracket the pattern so pgrep's own shell (whose cmdline contains the pattern) isn't self-matched.
    running = _os.popen("pgrep -f 'ue5_pipeline[.]py'").read().strip()
    if running:
        return {"ok": True, "already_running": True, "pids": running.split()}
    cmd = ("setsid nohup python3 /opt/jarvis-app-1/scripts/ue5_pipeline.py "
           "> /tmp/ue5_pipeline.log 2>&1 < /dev/null &")
    _os.system(cmd)
    return {"ok": True, "started": True}


@router.post("/v1/pipeline/deploy")
async def pipeline_deploy(_token: str = Depends(require_bearer)):
    """Run the GPU-deploy phase (ship build to Vast → free its VRAM/pause Ollama → Pixel-Stream on a
    4090). Touches the SHARED Vast box, so it's a SEPARATE explicit action from the local build."""
    import os as _os
    # NEVER kill an in-progress build to deploy — that orphans the multi-hour cook and can ship a
    # half-built tree to the shared GPU. The deploy button is only meant to fire once the local build
    # is DONE (the driver has exited). If any pipeline is still running, refuse.
    running = _os.popen("pgrep -f 'ue5_pipeline[.]py'").read().strip()
    if running:
        return {"ok": False, "pids": running.split(),
                "error": "a pipeline run is in progress — wait for the build (package step) to finish, then deploy"}
    cmd = ("setsid nohup env UE5_DEPLOY=1 python3 /opt/jarvis-app-1/scripts/ue5_pipeline.py "
           "> /tmp/ue5_pipeline.log 2>&1 < /dev/null &")
    _os.system(cmd)
    return {"ok": True, "deploying": True}
