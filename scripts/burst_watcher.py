#!/usr/bin/env python3
"""Burst-disposable watcher — auto-disposes burst Vast boxes after they signal completion.

The owner runs heavy ad-hoc tasks (70 B inference, 140 B fine-tune) via the existing
`gpu_instances.launch_disposable()` API. The box runs the task in /workspace, syncs results
to Wasabi, and writes /workspace/.done as a completion sentinel.

This watcher polls every BURST_WATCHER_INTERVAL_S seconds:
  1. Lists every Vast instance NOT labelled 'jarvis-brain*' or 'jarvis-ue5*'.
  2. SSH's to each, checks for /workspace/.done.
  3. If present, calls safe_dispose(id, force=False) → recoup + Wasabi + destroy.
  4. Otherwise: leaves it alone (still working).

Cost cap: same env-controlled cooldown as brain-watchdog so a flapping API can't loop.

Owner-safe defaults:
  - BURST_WATCHER_INTERVAL_S=60     poll cadence
  - BURST_DISPOSE_DRY_RUN=0         set =1 to log without disposing
  - BURST_PROTECTED_LABEL_SUBSTRINGS=jarvis-brain,jarvis-ue5,pixelstream  never touch these
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

CHECK_S = int(os.environ.get("BURST_WATCHER_INTERVAL_S", "60"))
DRY_RUN = os.environ.get("BURST_DISPOSE_DRY_RUN", "") in ("1", "true", "yes")
PROTECTED = tuple(s.strip().lower() for s in os.environ.get(
    "BURST_PROTECTED_LABEL_SUBSTRINGS",
    "jarvis-brain,jarvis-ue5,pixelstream",
).split(",") if s.strip())
SSH_TIMEOUT_S = int(os.environ.get("BURST_SSH_TIMEOUT_S", "15"))
DONE_PATH = os.environ.get("BURST_DONE_PATH", "/workspace/.done")

LOG_PATH = os.path.join(ROOT, "server", "data", "burst_watcher.log")
EVENTS_PATH = os.path.join(ROOT, "server", "data", "vast_events.jsonl")
JOBS_PATH = os.path.join(ROOT, "server", "data", "burst_jobs.jsonl")
SSH_KEY = os.environ.get("VAST_SSH_KEY", os.path.expanduser("~/.ssh/id_ed25519"))


def _log(msg: str):
    line = "[%s] %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), msg)
    sys.stdout.write(line); sys.stdout.flush()
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


def _emit_event(kind: str, **rec):
    rec = {"ts": time.time(), "kind": kind, **rec}
    for p in (EVENTS_PATH, JOBS_PATH):
        try:
            with open(p, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
        except Exception:
            pass


def _ssh_check_done(host: str, port: int) -> bool:
    """Returns True iff /workspace/.done exists on the box."""
    cmd = ["ssh", "-i", SSH_KEY, "-p", str(port),
           "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null",
           "-o", f"ConnectTimeout={SSH_TIMEOUT_S}", "root@" + host,
           f"test -f {DONE_PATH}"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=SSH_TIMEOUT_S + 5)
        return r.returncode == 0
    except Exception:
        return False


def sweep() -> dict:
    """One pass: list non-protected instances, SSH-check for .done, dispose if complete."""
    from server.services import gpu_instances as gi  # type: ignore

    try:
        instances = (gi.list_instances().get("instances") or [])
    except Exception as e:
        _log(f"list_instances failed: {str(e)[:140]}")
        return {"ok": False, "error": "list failed"}

    sweep_summary = {"checked": 0, "disposed": [], "still_working": [], "skipped_protected": []}
    for inst in instances:
        iid = int(inst.get("id") or 0)
        label = (inst.get("label") or "").lower()
        status = (inst.get("actual_status") or inst.get("status") or "").lower()
        host = inst.get("ssh_host")
        port = inst.get("ssh_port")

        if any(p and p in label for p in PROTECTED):
            sweep_summary["skipped_protected"].append({"id": iid, "label": label})
            continue
        if status not in ("running", "active"):
            continue
        if not host or not port:
            continue

        sweep_summary["checked"] += 1
        if not _ssh_check_done(host, int(port)):
            sweep_summary["still_working"].append({"id": iid, "label": label})
            continue

        if DRY_RUN:
            _log(f"DRY_RUN: would dispose burst id={iid} label={label!r}")
            sweep_summary["disposed"].append({"id": iid, "label": label, "dry_run": True})
            _emit_event("burst_dispose_dry_run", instance_id=iid, label=label)
            continue
        try:
            d = gi.safe_dispose(iid, force=False)
            _log(f"DISPOSED burst id={iid} label={label!r} → "
                 f"recoup_ok={d.get('recoup_ok')} wasabi={d.get('wasabi', {}).get('ok')}")
            sweep_summary["disposed"].append({"id": iid, "label": label, "result": {
                "recoup_ok": d.get("recoup_ok"),
                "wasabi_ok": d.get("wasabi", {}).get("ok"),
                "model_cache_ok": d.get("model_cache_wasabi", {}).get("ok"),
            }})
            _emit_event("burst_auto_disposed", instance_id=iid, label=label,
                        recoup_ok=d.get("recoup_ok"),
                        wasabi_uploaded=d.get("wasabi", {}).get("uploaded"))
        except Exception as e:
            _log(f"FAILED to dispose burst id={iid}: {str(e)[:140]}")
            sweep_summary["disposed"].append({"id": iid, "label": label, "error": str(e)[:120]})

    return sweep_summary


def main():
    _log(f"started; interval={CHECK_S}s dry_run={DRY_RUN} protected={PROTECTED}")
    while True:
        try:
            r = sweep()
            if r.get("checked") or r.get("disposed"):
                _log(f"sweep checked={r.get('checked')} disposed={len(r.get('disposed') or [])} "
                     f"still_working={len(r.get('still_working') or [])}")
        except Exception as e:
            _log(f"sweep crashed: {str(e)[:200]}")
        time.sleep(CHECK_S)


if __name__ == "__main__":
    main()
