#!/usr/bin/env python3
"""VAST KILL-SWITCH — auto-destroy any Vast instance that appears.

Background: an EXTERNAL service (kgik.base44.app) holds the same VAST_API_KEY and spawns instances on
its own schedule (every 60s 'clustering' pipeline tick). The user's VPS cannot stop those spawns at the
code level because they originate off-box. This kill-switch polls Vast every CHECK_INTERVAL_S seconds
and destroys every instance it finds.

Disable temporarily by setting env VAST_KILL_SWITCH_DISABLED=1, or whitelist specific instance ids via
VAST_KEEP_IDS=12345,67890 (comma-separated). The whitelist is how you keep a persistent base brain box
without it being killed: provision the brain, note its id, set VAST_KEEP_IDS and pm2 restart.
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
CHECK_INTERVAL_S = float(os.environ.get("VAST_KILL_INTERVAL_S", "30"))
LOG_PATH = os.environ.get("VAST_KILL_LOG", "/opt/jarvis-app-1/server/data/vast_kill_switch.log")
EVENTS_PATH = os.environ.get("VAST_EVENTS_LOG", "/opt/jarvis-app-1/server/data/vast_events.jsonl")
WHITELIST = set(s.strip() for s in os.environ.get("VAST_KEEP_IDS", "").split(",") if s.strip())
# LABEL whitelist — substring match on instance label. UE5 + pixelstream are explicitly preserved per
# owner rule: those rentals are intentional (cooked-build workers + WebRTC streamer). Add more via env
# VAST_KEEP_LABEL_SUBSTRINGS=foo,bar.
_DEFAULT_LABEL_KEEPS = ("ue5", "pixelstream", "jarvis-brain")
LABEL_KEEPS = tuple(s.strip().lower() for s in os.environ.get(
    "VAST_KEEP_LABEL_SUBSTRINGS", ",".join(_DEFAULT_LABEL_KEEPS)).split(",") if s.strip())
# Track the last-seen state of every instance id so we can detect first_seen / disappeared transitions
# and emit lifecycle events to the JSONL feed that the UE5 dashboard scrapes.
_SEEN: dict[str, dict] = {}


def _api_key() -> str:
    k = os.environ.get("VAST_API_KEY", "")
    if k:
        return k.strip()
    try:
        with open(KEY_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    except Exception:  # noqa: BLE001
        return ""


def _req(method: str, path: str, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(VAST_API + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + _api_key())
    if data is not None:
        r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        body = resp.read()
        return json.loads(body) if body else {}


def _log(msg: str):
    line = "[%s] %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), msg)
    sys.stdout.write(line); sys.stdout.flush()
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(line)
    except Exception:  # noqa: BLE001
        pass


def _emit_event(kind: str, inst: dict, **extra):
    """Append a structured lifecycle event to /server/data/vast_events.jsonl so the UE5 dashboard +
    other consumers can render the live Vast instance population without polling the Vast API directly.
    Kinds: 'first_seen' (new instance), 'killed' (we destroyed it), 'disappeared' (gone without our action)."""
    rec = {
        "ts": time.time(),
        "kind": kind,
        "id": str(inst.get("id")),
        "label": inst.get("label"),
        "gpu_name": inst.get("gpu_name"),
        "num_gpus": inst.get("num_gpus"),
        "disk_gb": inst.get("disk_space"),
        "dph_total": inst.get("dph_total"),
        "status": inst.get("actual_status"),
        "ssh_host": inst.get("ssh_host"),
        "ssh_port": inst.get("ssh_port"),
    }
    rec.update(extra)
    try:
        with open(EVENTS_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec) + "\n")
    except Exception:  # noqa: BLE001
        pass


def sweep_once() -> int:
    try:
        d = _req("GET", "/instances/")
        instances = d.get("instances") or []
    except Exception as e:  # noqa: BLE001
        _log(f"list failed: {str(e)[:120]}")
        return 0
    now_ids = set()
    killed = 0
    for inst in instances:
        iid = str(inst.get("id"))
        now_ids.add(iid)
        # first_seen — emit a lifecycle event the UE5 dashboard can render
        if iid not in _SEEN:
            _SEEN[iid] = {"first_seen_ts": time.time(), "inst": inst}
            _emit_event("first_seen", inst)
        if iid in WHITELIST:
            continue
        label = inst.get("label") or ""
        # Label-based whitelist (substring, case-insensitive). UE5 + pixelstream + brain stay.
        label_lc = label.lower()
        if any(k and k in label_lc for k in LABEL_KEEPS):
            continue
        status = inst.get("actual_status") or "?"
        try:
            _req("DELETE", f"/instances/{iid}/")
            lifetime_s = round(time.time() - _SEEN[iid]["first_seen_ts"], 1)
            _log(f"KILLED id={iid} label={label!r} status={status} lifetime={lifetime_s}s")
            _emit_event("killed", inst, lifetime_s=lifetime_s)
            killed += 1
        except Exception as e:  # noqa: BLE001
            _log(f"FAILED kill id={iid}: {str(e)[:120]}")
    # disappeared — instances we knew about that no longer exist (someone else destroyed them)
    for iid in list(_SEEN.keys()):
        if iid not in now_ids:
            cached = _SEEN.pop(iid)
            lifetime_s = round(time.time() - cached["first_seen_ts"], 1)
            _emit_event("disappeared", cached["inst"], lifetime_s=lifetime_s)
    return killed


def main():
    if os.environ.get("VAST_KILL_SWITCH_DISABLED", "") in ("1", "true", "yes"):
        _log("kill-switch DISABLED via env — exiting")
        return
    if not _api_key():
        _log("no VAST_API_KEY available — exiting")
        return
    if WHITELIST:
        _log(f"started; interval={CHECK_INTERVAL_S}s; WHITELIST={sorted(WHITELIST)}")
    else:
        _log(f"started; interval={CHECK_INTERVAL_S}s; whitelist=empty (will kill ALL instances)")
    while True:
        try:
            sweep_once()
        except Exception as e:  # noqa: BLE001
            _log(f"sweep crashed: {str(e)[:200]}")
        time.sleep(CHECK_INTERVAL_S)


if __name__ == "__main__":
    main()
