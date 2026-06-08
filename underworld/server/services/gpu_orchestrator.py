"""GPU ORCHESTRATION + DISPOSABLE BURST (Layers 8/10/14).

The always-on base engine is the existing Vast.ai Ollama box (2× RTX 4090, OpenAI-compatible /v1).
When a job hits a BURST tier (classify_tier(...)['burst'] — overmind/high_major/god_brain) and the
base box cannot serve the required heavy model (e.g. a 120B GGUF), the orchestrator spins a FRESH
disposable Vast instance, registers it, routes the job there, saves the output, and reaps it after
idle. The control plane (DB = truth) survives any worker death; live VRAM is never trusted.

SAFETY: every Vast mutation is gated behind VAST_API_KEY + VAST_AUTOPROVISION=1 and is best-effort —
with neither set, the orchestrator is a graceful no-op that just logs what it WOULD provision, so
this ships dormant and activates the moment you set the key. Resolving a disposable endpoint returns
None when none exists, so the caller always falls back to the base box (no behaviour change).

Env (set on the control box):
  VAST_API_KEY            enable real provisioning (else dry-run/no-op)
  VAST_AUTOPROVISION=1    allow spinning instances (default off — costs money)
  VAST_120B_MODEL         GGUF/Ollama tag for the ultra tier (default "llama3.1:120b" placeholder)
  VAST_GPU_QUERY          offer filter (default "gpu_ram>=80 num_gpus>=2 dph<2.0")
  UW_BASE_LLM_ENDPOINT    base box OpenAI /v1 (else derived from OLLAMA_HOST / llm_base_url)
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any, Optional

from sqlalchemy import select

from ..db.models import UwWorker
from ..db.session import session_scope

VAST_API = "https://console.vast.ai/api/v0"
BASE_WORKER_ID = "vast-base-ollama"


def _key() -> str:
    return os.environ.get("VAST_API_KEY", "")


def autoprovision_on() -> bool:
    return bool(_key()) and os.environ.get("VAST_AUTOPROVISION", "0").lower() in ("1", "true", "yes")


def _base_endpoint() -> str:
    ep = os.environ.get("UW_BASE_LLM_ENDPOINT") or os.environ.get("OLLAMA_HOST", "")
    if ep and "/v1" not in ep:
        ep = ep.rstrip("/") + "/v1"
    return ep


# ── registry ─────────────────────────────────────────────────────────────────────────
async def register_base() -> None:
    """Upsert the always-on base box into the registry (called on startup)."""
    try:
        async with session_scope() as s:
            w = await s.get(UwWorker, BASE_WORKER_ID)
            ep = _base_endpoint()
            if w is None:
                s.add(UwWorker(id=BASE_WORKER_ID, provider="vast", kind="base", endpoint=ep,
                               model_tier="70b", models=["llama3.1:8b", "llama3.2", "qwen2.5:32b"],
                               state="healthy", destroy_after_idle_s=0))
            else:
                w.endpoint, w.state, w.last_used_at = ep or w.endpoint, "healthy", _now()
    except Exception:  # noqa: BLE001
        pass


def _now():
    from datetime import datetime
    return datetime.utcnow()


async def healthy_disposable(model_tier: str) -> Optional[UwWorker]:
    try:
        async with session_scope() as s:
            return (await s.execute(
                select(UwWorker).where(UwWorker.kind == "disposable",
                                       UwWorker.model_tier == model_tier,
                                       UwWorker.state == "healthy"))).scalars().first()
    except Exception:  # noqa: BLE001
        return None


async def resolve_endpoint(tier: str, *, want_model_tier: str = "120b") -> Optional[str]:
    """A healthy disposable worker's /v1 endpoint for a burst tier, or None (→ caller uses base)."""
    w = await healthy_disposable(want_model_tier)
    if w:
        try:
            async with session_scope() as s:
                row = await s.get(UwWorker, w.id)
                if row:
                    row.last_used_at = _now()
        except Exception:  # noqa: BLE001
            pass
        return w.endpoint or None
    return None


# ── Vast.ai API client (real, but gated + untested without a key) ──────────────────────
def _vast(method: str, path: str, body: dict | None = None, timeout: int = 30) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{VAST_API}{path}", data=data, method=method)
    r.add_header("Authorization", f"Bearer {_key()}")
    if data is not None:
        r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _search_offer() -> Optional[dict]:
    """Cheapest offer matching VAST_GPU_QUERY (best-effort; returns the offer dict or None)."""
    q = os.environ.get("VAST_GPU_QUERY", "gpu_ram>=80 num_gpus>=2 dph<2.0 rentable=true")
    try:
        res = _vast("PUT", "/bundles/", {"q": q, "order": [["dph_total", "asc"]], "limit": 1})
        offers = res.get("offers") or []
        return offers[0] if offers else None
    except (urllib.error.URLError, KeyError, json.JSONDecodeError):
        return None


def _create_instance(offer_id: int) -> Optional[str]:
    """Launch a llama.cpp/Ollama server-cuda instance on an offer. Returns vast instance id."""
    model = os.environ.get("VAST_120B_MODEL", "llama3.1:120b")
    onstart = (f"ollama serve & sleep 8; ollama pull {model}; "
               "echo READY")
    body = {"client_id": "me", "image": "ollama/ollama:latest",
            "disk": 120, "label": "uw-burst-120b",
            "onstart": onstart, "env": {"OLLAMA_HOST": "0.0.0.0:8080"},
            "runtype": "ssh"}
    try:
        res = _vast("PUT", f"/asks/{offer_id}/", body)
        nid = res.get("new_contract") or res.get("instance_id")
        return str(nid) if nid else None
    except (urllib.error.URLError, KeyError, json.JSONDecodeError):
        return None


def _destroy_instance(instance_id: str) -> bool:
    try:
        _vast("DELETE", f"/instances/{instance_id}/")
        return True
    except (urllib.error.URLError, json.JSONDecodeError):
        return False


# ── burst on demand + reap ─────────────────────────────────────────────────────────────
async def ensure_burst_worker(model_tier: str = "120b") -> Optional[str]:
    """Ensure a disposable worker exists for an ultra/burst tier. Returns its endpoint or None.
    A graceful no-op (just logs intent) unless VAST_AUTOPROVISION + VAST_API_KEY are set."""
    existing = await resolve_endpoint("god_brain", want_model_tier=model_tier)
    if existing:
        return existing
    if not autoprovision_on():
        # dormant by default — record the unmet demand as a finding so it's visible/alertable.
        try:
            from ..tools import llm_pipeline as pipe
            await pipe.note_finding(
                kind="burst_demand", severity="info", source="orchestrator",
                detail=f"burst tier needs a {model_tier} worker; VAST_AUTOPROVISION is off "
                       f"(set VAST_API_KEY + VAST_AUTOPROVISION=1 to enable).")
        except Exception:  # noqa: BLE001
            pass
        return None
    offer = _search_offer()
    if not offer:
        return None
    nid = _create_instance(int(offer.get("id")))
    if not nid:
        return None
    try:
        async with session_scope() as s:
            s.add(UwWorker(id=f"vast-burst-{nid}", provider="vast", kind="disposable",
                           endpoint="", model_tier=model_tier, models=[os.environ.get("VAST_120B_MODEL", "llama3.1:120b")],
                           state="starting", vast_instance_id=nid,
                           destroy_after_idle_s=int(os.environ.get("VAST_IDLE_S", "600"))))
    except Exception:  # noqa: BLE001
        pass
    # NOTE: the instance's public endpoint must be discovered once Vast maps the port + the model
    # finishes pulling (a health-check step); until then resolve_endpoint returns None and callers
    # use the base box. That discovery step is the activation TODO when a real key is present.
    return None


async def reap_idle() -> int:
    """Destroy disposable workers idle past destroy_after_idle_s (cost control, Layer 13/14)."""
    reaped = 0
    try:
        async with session_scope() as s:
            workers = (await s.execute(
                select(UwWorker).where(UwWorker.kind == "disposable"))).scalars().all()
            now = _now()
            for w in workers:
                idle = (now - (w.last_used_at or now)).total_seconds()
                if w.destroy_after_idle_s and idle > w.destroy_after_idle_s and w.active_jobs == 0:
                    if w.vast_instance_id and _key():
                        _destroy_instance(w.vast_instance_id)
                    await s.delete(w)
                    reaped += 1
    except Exception:  # noqa: BLE001
        pass
    return reaped


def reaper_disabled() -> bool:
    return os.environ.get("GPU_REAPER_LOOP", "1").lower() in ("0", "false", "no")
