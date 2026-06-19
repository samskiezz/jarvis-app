#!/usr/bin/env python3
"""Brain watchdog — owner-safe Vast brain monitor.

Reads the Vast instance list every CHECK_S seconds, finds the box labelled
'jarvis-brain*', and writes its health to server/data/brain_health.json so the
UI / orchestrator can render and alert.

Three actionable behaviours, each gated to STAY OWNER-SAFE:

1. **DETECT** (always on): writes brain_health.json with current state — alive,
   degraded (offline >5min), missing (no brain box exists), port_unmapped
   (11434/tcp not bound — protocol breach), unreachable (box up but ollama
   refuses).

2. **AUTO-DISPOSE** (default OFF — destroying a box is irreversible): when a
   brain has been `offline` for >DISPOSE_AFTER_S seconds AND ports/11434 is
   unmapped, destroy it to release the Vast slot reservation. Owner must
   explicitly opt in with BRAIN_WATCHDOG_ALLOW_DISPOSE=1 — an offline box may
   be one the owner intends to start later.

3. **AUTO-PROVISION** (default OFF — costs money): only if env
   BRAIN_WATCHDOG_AUTO_PROVISION=1 is explicitly set, the watchdog will call
   the local backend's /gpu/provisionbrain to launch a replacement basic brain
   when none is running. Otherwise it just alerts and lets the owner click
   "Provision" in the GPU mini-app.

Run as a pm2 process; logs to server/data/brain_watchdog.log.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

VAST_API = "https://console.vast.ai/api/v0"
KEY_FILE = os.environ.get("VAST_KEY_FILE", "/opt/jarvis-app-1/server/data/.vast_key")
HEALTH_PATH = "/opt/jarvis-app-1/server/data/brain_health.json"
LOG_PATH = "/opt/jarvis-app-1/server/data/brain_watchdog.log"
EVENTS_PATH = "/opt/jarvis-app-1/server/data/vast_events.jsonl"

CHECK_S = int(os.environ.get("BRAIN_WATCHDOG_INTERVAL_S", "60"))
DISPOSE_AFTER_S = int(os.environ.get("BRAIN_WATCHDOG_DISPOSE_AFTER_S", "300"))
LOCAL_DASH = os.environ.get("JARVIS_DASHBOARD_URL", "http://127.0.0.1:8095")
# Cost ceiling on auto-provision: minimum gap between provisioning attempts so a flapping API
# can't burn money. Default 900s = ≤4 provisions/hr.
PROVISION_COOLDOWN_S = int(os.environ.get("BRAIN_WATCHDOG_PROVISION_COOLDOWN_S", "900"))
# Per-attempt $/hr cap forwarded to /gpu/provisionbrain. Defaults match BRAIN_TIERS["standard"].
PROVISION_MAX_PRICE = float(os.environ.get("BRAIN_PROVISION_MAX_PRICE", "0.25"))
PROVISION_TIER = os.environ.get("BRAIN_DEFAULT_TIER", "standard")
# Last successful (or attempted) provision timestamp — used to enforce PROVISION_COOLDOWN_S.
_LAST_PROVISION_TS: float = 0.0
# Default OFF — destroying a Vast box is irreversible (you lose the slot reservation). The owner must
# explicitly opt in with BRAIN_WATCHDOG_ALLOW_DISPOSE=1. Even though Vast doesn't bill stopped boxes,
# an offline brain box may be one the owner intends to start later.
ALLOW_DISPOSE = os.environ.get("BRAIN_WATCHDOG_ALLOW_DISPOSE", "") in ("1", "true", "yes")
ALLOW_PROVISION = os.environ.get("BRAIN_WATCHDOG_AUTO_PROVISION", "") in ("1", "true", "yes")

# Per-instance offline-since timestamps — reset when state flips back to running.
_OFFLINE_SINCE: dict[str, float] = {}

# Newly-provisioned instances need grace before Vast boots them; suppress degraded alerts.
_PROVISION_PENDING: dict[str, float] = {}
PROVISION_GRACE_S = 600.0


def _in_provision_grace(instance_id: str) -> bool:
    ts = _PROVISION_PENDING.get(str(instance_id))
    if not ts:
        return False
    age = time.time() - ts
    if age > PROVISION_GRACE_S:
        _PROVISION_PENDING.pop(str(instance_id), None)
        return False
    return True


def _api_key() -> str:
    k = os.environ.get("VAST_API_KEY", "")
    if k:
        return k.strip()
    try:
        return open(KEY_FILE, encoding="utf-8").read().strip()
    except Exception:
        return ""


def _vast_req(method: str, path: str, timeout=20):
    r = urllib.request.Request(VAST_API + path, method=method)
    r.add_header("Authorization", "Bearer " + _api_key())
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        body = resp.read()
        return json.loads(body) if body else {}


def _log(msg: str):
    line = "[%s] %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), msg)
    sys.stdout.write(line); sys.stdout.flush()
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


def _emit_event(kind: str, **rec):
    try:
        with open(EVENTS_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": time.time(), "kind": kind, **rec}) + "\n")
    except Exception:
        pass


def _write_health(state: dict):
    state["updated_at"] = time.time()
    try:
        with open(HEALTH_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except Exception:
        pass


def _ports_ok(inst: dict) -> bool:
    """The brain protocol requires port 11434/tcp to be MAPPED (Ollama)."""
    ports = inst.get("ports") or {}
    p = ports.get("11434/tcp")
    return bool(p)  # must be a non-empty mapping, not None


def _local_brain_reachable() -> bool:
    try:
        req = urllib.request.Request(f"{LOCAL_DASH}/gpu/brain")
        with urllib.request.urlopen(req, timeout=5) as r:
            j = json.loads(r.read() or b"{}")
        return bool(j.get("brain"))
    except Exception:
        return False


def sweep() -> dict:
    try:
        d = _vast_req("GET", "/instances/")
        instances = d.get("instances") or []
    except Exception as e:
        _log(f"list failed: {str(e)[:140]}")
        return {"ok": False, "error": "vast list failed", "state": "unknown"}

    brains = [i for i in instances
              if "jarvis-brain" in (i.get("label") or "").lower()
              or "brain" in (i.get("label") or "").lower()]
    if not brains:
        _write_health({"ok": False, "state": "missing", "alert": "no brain box exists — click Provision in GPU mini-app"})
        _emit_event("brain_missing")
        if ALLOW_PROVISION:
            _try_provision()
        return {"state": "missing"}

    summaries = []
    now = time.time()
    for inst in brains:
        iid = str(inst.get("id"))
        status = (inst.get("actual_status") or inst.get("status") or "").lower()
        port_ok = _ports_ok(inst)
        running = status in ("running", "active")
        offline = status in ("offline", "stopped", "exited", "error")

        if running:
            _OFFLINE_SINCE.pop(iid, None)
        elif offline and iid not in _OFFLINE_SINCE:
            _OFFLINE_SINCE[iid] = now

        offline_for = (now - _OFFLINE_SINCE[iid]) if iid in _OFFLINE_SINCE else 0
        summary = {"id": iid, "label": inst.get("label"), "status": status,
                   "port_11434_mapped": port_ok, "gpu": inst.get("gpu_name"),
                   "offline_for_s": int(offline_for)}
        summaries.append(summary)

        # AUTO-DISPOSE rule: clearly-dead (offline >N min AND port unmapped) → destroy.
        if ALLOW_DISPOSE and offline and offline_for > DISPOSE_AFTER_S and not port_ok:
            try:
                _vast_req("DELETE", f"/instances/{iid}/")
                _log(f"AUTO-DISPOSED dead brain id={iid} label={inst.get('label')!r} "
                     f"offline_for={int(offline_for)}s ports_unmapped=true")
                _emit_event("brain_auto_disposed", id=iid, label=inst.get("label"),
                            offline_for_s=int(offline_for))
                summary["disposed"] = True
                _OFFLINE_SINCE.pop(iid, None)
            except Exception as e:
                _log(f"FAILED to dispose dead brain id={iid}: {str(e)[:140]}")
        # Vast slot reclaim guard: a "stopped" box (owner clicked Stop, or Vast reclaimed
        # the slot) MUST be auto-disposed — keeping it costs the slot reservation while
        # serving nothing. Per the protocol: "never Stop, always Dispose + re-provision".
        elif ALLOW_DISPOSE and status == "stopped":
            try:
                _vast_req("DELETE", f"/instances/{iid}/")
                _log(f"AUTO-DISPOSED stopped brain id={iid} label={inst.get('label')!r} "
                     f"(slot reclaim — protocol requires dispose, not stop)")
                _emit_event("brain_stopped_disposed", id=iid, label=inst.get("label"))
                summary["disposed"] = True
                _OFFLINE_SINCE.pop(iid, None)
            except Exception as e:
                _log(f"FAILED to dispose stopped brain id={iid}: {str(e)[:140]}")

    # Compute overall state
    has_running = any(s["status"] in ("running", "active") for s in summaries)
    any_port_ok = any(s["port_11434_mapped"] for s in summaries if s["status"] in ("running", "active"))
    reachable = _local_brain_reachable() if has_running else False

    if has_running and reachable:
        state = "alive"
        alert = None
    elif has_running and any_port_ok:
        warming = any(_in_provision_grace(s["id"]) for s in summaries if s["status"] in ("running", "active"))
        if warming:
            state = "warming_up"
            alert = None
        else:
            # Degraded: a running box exists with port mapped but local /llm/chat fails.
            # Try a tunnel/ollama re-establish via gpu_instances.ensure_brain_tunnel before
            # alerting. This is the canonical self-heal for proxy timeout + dead-ssh cases.
            state = "degraded"
            alert = "brain box is up but local dashboard cannot reach /llm/chat — check tunnel"
            try:
                # Local import: gpu_instances pulls FastAPI deps we don't want at module load.
                sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))
                from server.services import gpu_instances as gi  # type: ignore
                repair = gi.ensure_brain_tunnel()
                _log(f"BRAIN_TUNNEL_REPAIR attempted → {str(repair)[:200]}")
                _emit_event("brain_tunnel_repair", result=repair)
            except Exception as e:
                _log(f"tunnel-repair attempt failed: {str(e)[:140]}")
    elif has_running and not any_port_ok:
        state = "port_unmapped"
        alert = "brain box running but port 11434/tcp not mapped — protocol breach, re-provision required"
    else:
        state = "all_offline"
        alert = "every brain box is offline — provision a new one (default basic ~$0.05/hr)"

    health = {"ok": state == "alive", "state": state, "alert": alert, "brains": summaries,
              "dispose_enabled": ALLOW_DISPOSE, "auto_provision_enabled": ALLOW_PROVISION}
    _write_health(health)
    # Additive: run invariants pass + emit assurance event. Best-effort.
    try:
        import sys as _sys
        _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _root not in _sys.path:
            _sys.path.insert(0, _root)
        from assurance.invariants.runner import run_all as _run_inv, write_report as _write_rep  # type: ignore
        from assurance.events.bus import get_bus as _evt_bus  # type: ignore
        from assurance.events.types import Event as _Event  # type: ignore
        _rep = _run_inv()
        _write_rep(_rep)
        health["assurance_inv_ok"] = _rep.overall_ok
        _evt_bus().append(_Event(
            name="watchdog.invariants_checked",
            actor="brain_watchdog",
            source="scripts.brain_watchdog",
            payload={"overall_ok": _rep.overall_ok, "passed": _rep.passed, "total": _rep.total,
                     "brain_state": state},
        ))
    except Exception:  # noqa: BLE001
        pass
    return health


_UNAUTHORIZED_STREAK = 0
_UNAUTHORIZED_BACKOFF_UNTIL = 0.0
_UNAUTHORIZED_TRIP_AT = 3
_UNAUTHORIZED_BACKOFF_S = 6 * 3600


def _try_provision():
    """Owner-gated auto-provision via the local backend route. Honors cooldown + max-price.
    Circuit-breaks for 6h after 3 consecutive `unauthorized` responses so the watchdog
    stops hammering Vast when the API key needs rotation (audit/power/AFTER_OPTIMIZATION.md)."""
    global _LAST_PROVISION_TS, _UNAUTHORIZED_STREAK, _UNAUTHORIZED_BACKOFF_UNTIL
    now = time.time()
    if now < _UNAUTHORIZED_BACKOFF_UNTIL:
        wait = int(_UNAUTHORIZED_BACKOFF_UNTIL - now)
        _log(f"AUTO-PROVISION circuit-open (unauthorized backoff {wait}s remaining)")
        _emit_event("brain_provision_circuit_open", backoff_remaining_s=wait,
                    streak=_UNAUTHORIZED_STREAK)
        return
    if now - _LAST_PROVISION_TS < PROVISION_COOLDOWN_S:
        wait = int(PROVISION_COOLDOWN_S - (now - _LAST_PROVISION_TS))
        _log(f"AUTO-PROVISION throttled (cooldown {wait}s remaining; tier={PROVISION_TIER})")
        _emit_event("brain_provision_throttled", cooldown_remaining_s=wait)
        return
    _LAST_PROVISION_TS = now
    try:
        body = json.dumps({"tier": PROVISION_TIER, "max_price": PROVISION_MAX_PRICE}).encode()
        req = urllib.request.Request(f"{LOCAL_DASH}/gpu/provisionbrain", data=body,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=180) as r:
            j = json.loads(r.read() or b"{}")
        _log(f"AUTO-PROVISION tier={PROVISION_TIER} max_price=${PROVISION_MAX_PRICE}/hr → {str(j)[:240]}")
        _emit_event("brain_auto_provision_attempt", tier=PROVISION_TIER, max_price=PROVISION_MAX_PRICE, result=j)
        err = str(j.get("error") or "").lower()
        if "unauthorized" in err or "401" in err:
            _UNAUTHORIZED_STREAK += 1
            if _UNAUTHORIZED_STREAK >= _UNAUTHORIZED_TRIP_AT:
                _UNAUTHORIZED_BACKOFF_UNTIL = now + _UNAUTHORIZED_BACKOFF_S
                _log(f"AUTO-PROVISION circuit TRIPPED (unauthorized streak={_UNAUTHORIZED_STREAK}); "
                     f"backing off {_UNAUTHORIZED_BACKOFF_S//3600}h — rotate VAST_API_KEY")
                _emit_event("brain_provision_circuit_tripped",
                            streak=_UNAUTHORIZED_STREAK, backoff_s=_UNAUTHORIZED_BACKOFF_S)
        else:
            _UNAUTHORIZED_STREAK = 0
        new_id = j.get("instance_id") or j.get("id") or (j.get("instance") or {}).get("id")
        if new_id:
            _PROVISION_PENDING[str(new_id)] = time.time()
    except Exception as e:
        _log(f"AUTO-PROVISION failed: {str(e)[:140]}")


def main():
    if not _api_key():
        _log("no VAST_API_KEY — exiting (cannot watchdog without API access)")
        return
    _log(f"started; interval={CHECK_S}s dispose_after={DISPOSE_AFTER_S}s "
         f"dispose={'on' if ALLOW_DISPOSE else 'off'} "
         f"auto_provision={'on' if ALLOW_PROVISION else 'off'}")
    while True:
        try:
            h = sweep()
            _log(f"sweep state={h.get('state')} brains={len(h.get('brains') or [])}")
        except Exception as e:
            _log(f"sweep crashed: {str(e)[:200]}")
        time.sleep(CHECK_S)


if __name__ == "__main__":
    main()
