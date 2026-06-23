"""Burst-brain orchestrator — the missing link between tiered_llm and launch_disposable.

When tiered_llm.complete(tier="strong"|"heavy") asks for a model that does not fit on the
always-on basic brain (current 12GB), this module:

  1. Reuses a live burst box if one is already alive for the tier.
  2. Otherwise rents a right-sized Vast.ai instance via gpu_instances.launch_disposable,
     waits for it to come up + Ollama to serve + the model to load, returns the endpoint.
  3. Tracks last-used timestamps in server/data/burst_brain_state.json so a separate
     reaper (burst_watcher.py) can safe_dispose any burst box idle longer than ttl_s.

Returning None is always safe — tiered_llm falls back to the next tier (heavy→strong→base)
with a logged note. This module never raises.

Cost protection (per CLAUDE.md financial gate): bursting is OFF by default. Owner enables
specific tiers via JARVIS_BURST_ENABLED="strong,heavy" + JARVIS_BURST_MAX_DPH per tier.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_PATH = os.path.join(ROOT, "server", "data", "burst_brain_state.json")
EVENTS_PATH = os.path.join(ROOT, "server", "data", "vast_events.jsonl")

# The canonical JARVIS LLM ladder is a 6-tier system. Three self-hosted Ollama tiers
# escalate by model size, each on a right-sized burst box:
#
#   micro    llama3.2:1b      local CPU, free
#   base     llama3.1:8b      basic brain or local CPU
#   strong   qwen2.5:14b      burst — 14GB box, ≤$0.30/hr
#   pro      qwen2.5:32b      burst — 27GB box, ≤$0.60/hr   ← the 32b slot
#   heavy    llama3.3:70b     burst — 54GB box, ≤$1.50/hr
#   claude   claude-sonnet…   Anthropic SaaS, billed per token
#
# Sizing is Q4_K_M plus ~5GB KV/context headroom. min_vram_gb is derived per call from the
# current model name via _vram_for_model, so flipping any *_MODEL env auto-resizes the next
# burst box. Owner overrides:
#   OLLAMA_STRONG_MODEL=qwen2.5:14b
#   OLLAMA_PRO_MODEL=qwen2.5:32b
#   HEAVY_MODEL=llama3.3:70b
_DEFAULT_STRONG = "qwen2.5:14b"
_DEFAULT_PRO = "qwen2.5:32b"
_DEFAULT_HEAVY = "llama3.3:70b"

# Static price/ttl shape; the actual model + sizing are resolved fresh per call via _resolve_plan.
TIER_PLAN: dict[str, dict[str, Any]] = {
    "strong": {"min_vram_gb": 16, "default_max_dph": 0.30, "ttl_s": 300},
    "pro":    {"min_vram_gb": 32, "default_max_dph": 0.60, "ttl_s": 300},
    "heavy":  {"min_vram_gb": 48, "default_max_dph": 1.50, "ttl_s": 300},
}


def _vram_for_model(model: str) -> int:
    """Min VRAM for a quantized Ollama model. 5GB KV/context headroom on top of Q4_K_M model size."""
    import re as _re
    m = _re.search(r"(\d+(?:\.\d+)?)\s*b\b", (model or "").lower())
    if not m:
        return 16
    params = float(m.group(1))
    return max(8, int(params * 0.7) + 5)   # 0.7GB/Bp at Q4 + ~5GB KV


def _resolve_plan(tier: str) -> dict[str, Any]:
    """Tier plan with model + min_vram_gb resolved fresh from env each call."""
    if tier == "strong":
        model = os.environ.get("OLLAMA_STRONG_MODEL", _DEFAULT_STRONG)
    elif tier == "pro":
        model = os.environ.get("OLLAMA_PRO_MODEL", _DEFAULT_PRO)
    elif tier == "heavy":
        model = os.environ.get("HEAVY_MODEL", _DEFAULT_HEAVY)
    else:
        return {}
    shape = TIER_PLAN.get(tier) or {}
    return {
        "model": model,
        "min_vram_gb": _vram_for_model(model),
        "default_max_dph": shape.get("default_max_dph", 0.50),
        "ttl_s": shape.get("ttl_s", 300),
    }

_STATE_LOCK = threading.Lock()
_LAUNCH_LOCK = threading.Lock()  # prevent two threads racing to rent the same tier


def _truthy(s: str | None) -> bool:
    return (s or "").strip().lower() in ("1", "true", "yes", "on")


def _enabled_tiers() -> set[str]:
    raw = os.environ.get("JARVIS_BURST_ENABLED", "")
    return {t.strip().lower() for t in raw.split(",") if t.strip()}


def _max_dph(tier: str) -> float:
    env = os.environ.get(f"JARVIS_BURST_MAX_DPH_{tier.upper()}")
    if env:
        try:
            return float(env)
        except ValueError:
            pass
    return float(TIER_PLAN[tier]["default_max_dph"])


def _ttl_s(tier: str) -> int:
    env = os.environ.get(f"JARVIS_BURST_TTL_S_{tier.upper()}")
    if env:
        try:
            return int(env)
        except ValueError:
            pass
    return int(TIER_PLAN[tier]["ttl_s"])


def _load_state() -> dict:
    try:
        with open(STATE_PATH, encoding="utf-8") as fp:
            return json.load(fp) or {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_state(state: dict) -> None:
    try:
        os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
        tmp = STATE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fp:
            json.dump(state, fp)
        os.replace(tmp, STATE_PATH)
    except OSError:
        pass


def _log_event(kind: str, payload: dict) -> None:
    try:
        with open(EVENTS_PATH, "a", encoding="utf-8") as fp:
            fp.write(json.dumps({"ts": time.time(), "kind": f"burst.{kind}", **payload}) + "\n")
    except OSError:
        pass


def _endpoint_alive(ep: str, timeout: float = 3.0) -> bool:
    """Hit /api/tags on the burst box's Ollama. Cheap probe."""
    try:
        base = ep[:-3] if ep.endswith("/v1") else ep
        req = urllib.request.Request(base.rstrip("/") + "/api/tags")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status == 200
    except (urllib.error.URLError, urllib.error.HTTPError, OSError):
        return False


def _model_ready(ep: str, model: str, timeout: float = 3.0) -> bool:
    """Has the model finished pulling? /api/tags lists resident models."""
    try:
        base = ep[:-3] if ep.endswith("/v1") else ep
        req = urllib.request.Request(base.rstrip("/") + "/api/tags")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode() or "{}")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
        return False
    names = {(m.get("name") or m.get("model") or "") for m in (data.get("models") or [])}
    bare = model.split(":")[0]
    return any(n == model or n.startswith(model + ":") or n.split(":")[0] == bare for n in names)


def _launch_burst(tier: str, plan: dict) -> dict | None:
    """Rent a fresh box sized for the tier's model, install Ollama, pull the model.
    Returns {instance_id, endpoint, started_ts} or None on failure."""
    try:
        from . import gpu_instances as GI  # noqa: PLC0415
    except ImportError:
        return None
    model = plan["model"]
    min_vram = float(plan["min_vram_gb"])
    max_dph = _max_dph(tier)
    onstart = (
        "set -e; "
        "if ! command -v ollama >/dev/null 2>&1; then "
        "  curl -fsSL https://ollama.com/install.sh | sh; "
        "fi; "
        "mkdir -p /workspace; "
        "nohup ollama serve > /workspace/ollama.log 2>&1 & "
        "sleep 8; "
        f"ollama pull {model} && echo done > /workspace/.done"
    )
    res = GI.launch_disposable(
        task_cmd=onstart, max_price=max_dph,
        image="ollama/ollama:latest",
        label=f"jarvis-burst-{tier}",
    )
    if not res.get("ok"):
        _log_event("launch_failed", {"tier": tier, "reason": res.get("error") or "unknown",
                                     "vram_needed_gb": res.get("vram_needed_gb")})
        return None
    inst_id = res.get("new_contract") or res.get("id")
    if not inst_id:
        return None
    _log_event("launch_started", {"tier": tier, "instance_id": inst_id, "model": model,
                                  "vram_needed_gb": min_vram, "max_dph": max_dph})
    return {"instance_id": int(inst_id), "endpoint": None, "model": model,
            "started_ts": time.time(), "last_used_ts": time.time()}


def _await_endpoint(tier: str, slot: dict, deadline_s: float) -> str | None:
    """Poll Vast until the burst box has an ssh_host:port mapping for :11434, then
    poll Ollama on it until the model finishes pulling. Returns endpoint or None."""
    try:
        from . import gpu_instances as GI  # noqa: PLC0415
    except ImportError:
        return None
    inst_id = int(slot["instance_id"])
    model = slot["model"]
    end = time.time() + deadline_s
    endpoint: str | None = None
    while time.time() < end:
        inst = next((i for i in (GI.list_instances().get("instances") or [])
                     if i.get("id") == inst_id), None)
        if not inst:
            time.sleep(5)
            continue
        # Try to find the host:port that maps to container :11434 (direct port preferred).
        ports = inst.get("ports") or {}
        m11434 = ports.get("11434/tcp") or []
        if m11434 and inst.get("public_ipaddr"):
            host_port = m11434[0].get("HostPort")
            if host_port:
                endpoint = f"http://{inst['public_ipaddr']}:{host_port}"
        if endpoint and _endpoint_alive(endpoint, timeout=2.0) and _model_ready(endpoint, model, timeout=2.0):
            return endpoint
        time.sleep(10)
    _log_event("warmup_timeout", {"tier": tier, "instance_id": inst_id,
                                  "endpoint_seen": bool(endpoint)})
    return None


def resolve_endpoint_sync(tier: str, *, max_wait_s: int | None = None) -> str | None:
    """Return an OpenAI-compatible base URL ("http://host:port") for the tier's model,
    launching a burst box if none is alive. Returns None on disabled/timeout/error so
    the caller can fall back gracefully."""
    tier = (tier or "").lower()
    if tier not in TIER_PLAN:
        return None
    if tier not in _enabled_tiers():
        return None  # bursting disabled for this tier — fall through to next tier

    plan = _resolve_plan(tier)
    with _STATE_LOCK:
        state = _load_state()
        slot = state.get(tier)

    # 1) Reuse a live burst box if its endpoint still answers.
    if slot and slot.get("endpoint") and _endpoint_alive(slot["endpoint"]):
        with _STATE_LOCK:
            state = _load_state()
            slot = state.get(tier) or slot
            slot["last_used_ts"] = time.time()
            state[tier] = slot
            _save_state(state)
        return slot["endpoint"]

    # 2) Don't let two callers race to rent boxes for the same tier.
    with _LAUNCH_LOCK:
        # Re-check after acquiring the launch lock — another thread may have just rented.
        state = _load_state()
        slot = state.get(tier)
        if slot and slot.get("endpoint") and _endpoint_alive(slot["endpoint"]):
            slot["last_used_ts"] = time.time()
            state[tier] = slot
            _save_state(state)
            return slot["endpoint"]

        # Drop stale slot (instance gone or unreachable).
        if slot:
            _log_event("slot_dropped", {"tier": tier, "instance_id": slot.get("instance_id"),
                                        "endpoint": slot.get("endpoint")})
            state.pop(tier, None)
            _save_state(state)

        new_slot = _launch_burst(tier, plan)
        if not new_slot:
            return None
        state[tier] = new_slot
        _save_state(state)

    # 3) Wait for endpoint + model ready. Default 10min cap on first-pull (70b is 43GB).
    cap = int(max_wait_s) if max_wait_s else int(os.environ.get(
        f"JARVIS_BURST_WARMUP_S_{tier.upper()}", "600"))
    endpoint = _await_endpoint(tier, new_slot, cap)
    if not endpoint:
        return None
    with _STATE_LOCK:
        state = _load_state()
        slot = state.get(tier) or new_slot
        slot["endpoint"] = endpoint
        slot["last_used_ts"] = time.time()
        state[tier] = slot
        _save_state(state)
    _log_event("ready", {"tier": tier, "instance_id": new_slot["instance_id"],
                         "endpoint": endpoint, "warmup_s": int(time.time() - new_slot["started_ts"])})
    return endpoint


def reap_idle() -> dict:
    """Called periodically by burst_watcher. Dispose any burst slot whose
    last_used_ts is older than its tier's TTL. Returns a summary."""
    try:
        from . import gpu_instances as GI  # noqa: PLC0415
    except ImportError:
        return {"ok": False, "reason": "gpu_instances not importable"}
    now = time.time()
    disposed: list[dict] = []
    with _STATE_LOCK:
        state = _load_state()
    for tier, slot in list(state.items()):
        ttl = _ttl_s(tier)
        last = float(slot.get("last_used_ts") or slot.get("started_ts") or 0)
        age = now - last
        if age < ttl:
            continue
        inst_id = int(slot.get("instance_id") or 0)
        if not inst_id:
            with _STATE_LOCK:
                state = _load_state()
                state.pop(tier, None)
                _save_state(state)
            continue
        try:
            res = GI.safe_dispose(inst_id, force=False)
        except Exception as exc:  # noqa: BLE001
            _log_event("reap_error", {"tier": tier, "instance_id": inst_id,
                                      "error": str(exc)[:200]})
            continue
        _log_event("reaped", {"tier": tier, "instance_id": inst_id,
                              "idle_s": int(age), "ok": bool(res.get("ok"))})
        disposed.append({"tier": tier, "instance_id": inst_id, "idle_s": int(age)})
        with _STATE_LOCK:
            state = _load_state()
            state.pop(tier, None)
            _save_state(state)
    return {"ok": True, "disposed": disposed, "ts": int(now)}


def status() -> dict:
    """Snapshot of the live burst slots (read-only). Used by the GPU mini-app + diagnostics."""
    with _STATE_LOCK:
        state = _load_state()
    out: dict[str, Any] = {}
    for tier, slot in state.items():
        out[tier] = {
            "instance_id": slot.get("instance_id"),
            "model": slot.get("model"),
            "endpoint_set": bool(slot.get("endpoint")),
            "alive": _endpoint_alive(slot["endpoint"]) if slot.get("endpoint") else False,
            "age_s": int(time.time() - float(slot.get("started_ts") or time.time())),
            "idle_s": int(time.time() - float(slot.get("last_used_ts") or time.time())),
            "ttl_s": _ttl_s(tier),
        }
    return {"ok": True, "tiers": out, "enabled": sorted(_enabled_tiers())}
