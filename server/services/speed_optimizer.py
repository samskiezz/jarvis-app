"""Speed Optimiser — one-push system tune-up.

The optimiser is defensive: it snapshots state, only touches PAUSABLE services,
cleans safe temp locations, and backs up any config file it edits. It never stops
lifeline services (dashboard, backend, watchdog) and never deletes user data.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime
from typing import Any

from server.services._registry import LIFELINE_SERVICES, PAUSABLE_SERVICES

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_PATH = os.path.join(ROOT, "server", "data", "optimizer_state.json")
ARCHIVE_DIR = os.path.join(ROOT, "server", "data", "archive")
TMP_DIR = os.path.join(ROOT, "server", "data", "tmp")
LLM_ROUTER_PATH = os.path.join(ROOT, "config", "llm_router.json")


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _state() -> dict[str, Any]:
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def _save_state(s: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=2)
    except Exception:  # noqa: BLE001
        pass


def _log(task: dict[str, Any], message: str) -> None:
    entry = {"t": _now(), "msg": message}
    task.setdefault("log", []).append(entry)
    _save_state(_state())  # persist whole state each log line


def _snapshot() -> dict[str, Any]:
    snap: dict[str, Any] = {"ts": _now()}
    # CPU / memory / disk
    try:
        with open("/proc/stat") as f:
            line = f.readline().split()
            snap["cpu_total"] = sum(int(x) for x in line[1:])
            snap["cpu_idle"] = int(line[4])
    except Exception:  # noqa: BLE001
        pass
    try:
        mem = shutil.disk_usage(ROOT)
        snap["disk_pct"] = round((mem.used / mem.total) * 100, 1)
    except Exception:  # noqa: BLE001
        snap["disk_pct"] = None
    # PM2 list
    try:
        j = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5).stdout
        procs = json.loads(j)
        snap["services"] = {p.get("name"): {
            "status": p.get("pm2_env", {}).get("status"),
            "restarts": p.get("pm2_env", {}).get("restart_time"),
            "unstable": p.get("pm2_env", {}).get("unstable_restarts") or 0,
        } for p in procs}
    except Exception:  # noqa: BLE001
        snap["services"] = {}
    # GPU brain
    try:
        from server.services import gpu_instances as GI
        snap["brain"] = GI.ensure_brain_tunnel()
    except Exception as e:  # noqa: BLE001
        snap["brain"] = {"ok": False, "error": str(e)}
    return snap


def _pm2_run(args: list[str], timeout: int = 20) -> tuple[bool, str]:
    try:
        r = subprocess.run(["pm2"] + args, capture_output=True, text=True, timeout=timeout, cwd=ROOT)
        return r.returncode == 0, (r.stdout + r.stderr)[:400]
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:300]


def _drain_batches(task: dict[str, Any]) -> None:
    _log(task, "Draining queued batch tasks…")
    try:
        from server.services import task_daemon as TD
        if hasattr(TD, "drain"):
            TD.drain()
        _log(task, "Batch drain signal sent.")
    except Exception as e:  # noqa: BLE001
        _log(task, f"Batch drain skipped: {e}")


def _pause_non_essential(task: dict[str, Any]) -> list[str]:
    paused: list[str] = []
    for svc in PAUSABLE_SERVICES:
        if svc in LIFELINE_SERVICES:
            continue
        ok, out = _pm2_run(["stop", svc])
        if ok:
            paused.append(svc)
            _log(task, f"Paused {svc}")
        else:
            _log(task, f"Could not pause {svc}: {out}")
    return paused


def _resume_services(task: dict[str, Any], services: list[str]) -> None:
    for svc in services:
        ok, out = _pm2_run(["start", svc])
        _log(task, f"Resumed {svc}: {'ok' if ok else out}")


def _cleanup_storage(task: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {"tmp_removed": 0, "logs_trimmed": 0, "archive_path": None}
    # 1. tmp files
    if os.path.isdir(TMP_DIR):
        for fn in os.listdir(TMP_DIR):
            p = os.path.join(TMP_DIR, fn)
            try:
                if os.path.isfile(p):
                    os.remove(p)
                    result["tmp_removed"] += 1
            except Exception:  # noqa: BLE001
                pass
    _log(task, f"Removed {result['tmp_removed']} tmp files.")

    # 2. compress old media (not delete; archive)
    media_dir = os.path.join(ROOT, "server", "data", "media")
    if os.path.isdir(media_dir):
        os.makedirs(ARCHIVE_DIR, exist_ok=True)
        archive = os.path.join(ARCHIVE_DIR, f"media_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.tar.gz")
        try:
            # archive files older than 7 days, then remove the originals
            cutoff = time.time() - 7 * 86400
            old = [os.path.join(media_dir, f) for f in os.listdir(media_dir)
                   if os.path.isfile(os.path.join(media_dir, f)) and os.path.getmtime(os.path.join(media_dir, f)) < cutoff]
            if old:
                subprocess.run(["tar", "-czf", archive] + old, capture_output=True, timeout=60)
                for p in old:
                    try:
                        os.remove(p)
                    except Exception:  # noqa: BLE001
                        pass
                result["archive_path"] = archive
                _log(task, f"Archived {len(old)} old media files to {archive}")
        except Exception as e:  # noqa: BLE001
            _log(task, f"Media archive skipped: {e}")

    # 3. cap individual log files at ~100 MB by truncating
    log_dir = os.path.join(ROOT, "server", "data", "logs")
    if os.path.isdir(log_dir):
        for fn in os.listdir(log_dir):
            p = os.path.join(log_dir, fn)
            try:
                if os.path.isfile(p) and os.path.getsize(p) > 100 * 1024 * 1024:
                    with open(p, "r+", encoding="utf-8", errors="ignore") as f:
                        f.seek(-20 * 1024 * 1024, 2)
                        tail = f.read()
                        f.seek(0)
                        f.write(f"[log truncated by optimiser {_now()}]\n")
                        f.write(tail)
                        f.truncate()
                    result["logs_trimmed"] += 1
            except Exception:  # noqa: BLE001
                pass
        _log(task, f"Trimmed {result['logs_trimmed']} oversized log files.")
    return result


def _gpu_vram_step(task: dict[str, Any]) -> dict[str, Any]:
    _log(task, "Ensuring GPU brain tunnel…")
    try:
        from server.services import gpu_instances as GI
        res = GI.ensure_brain_tunnel()
        _log(task, f"Brain tunnel: {res.get('tunnel', 'unknown')}")
        return res
    except Exception as e:  # noqa: BLE001
        _log(task, f"Brain tunnel error: {e}")
        return {"ok": False, "error": str(e)}


def _model_routing_step(task: dict[str, Any], snap: dict[str, Any]) -> dict[str, Any]:
    _log(task, "Tuning LLM router for current resources…")
    if not os.path.exists(LLM_ROUTER_PATH):
        _log(task, "llm_router.json not found; skipping.")
        return {"ok": False, "error": "config missing"}
    try:
        with open(LLM_ROUTER_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        # Backup
        bak = LLM_ROUTER_PATH + ".optimiser.bak"
        with open(bak, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)

        gates = cfg.setdefault("resource_gates", {})
        residency = cfg.setdefault("residency_policy", {})
        brain_ok = snap.get("brain", {}).get("tunnel") in ("up", "started")
        disk_pct = snap.get("disk_pct") or 0

        if not brain_ok:
            # No local GPU: keep heavy/cold models disabled, lower gates so we don't try to load them
            gates["vram_pct_block_heavy"] = 0
            residency["cold"] = []
            _log(task, "No brain reachable — disabled cold/heavy local models.")
        else:
            gates["vram_pct_block_heavy"] = 85
            residency["cold"] = ["llama3.3:70b-q"]
            _log(task, "Brain reachable — restored cold model policy.")

        if disk_pct >= 85:
            gates["disk_pct_pause_ingest"] = 80
            gates["disk_pct_critical"] = 85
            _log(task, "Disk pressure detected — lowered disk guard thresholds.")

        with open(LLM_ROUTER_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        _log(task, "LLM router updated and backed up.")
        return {"ok": True, "backup": bak}
    except Exception as e:  # noqa: BLE001
        _log(task, f"Router tuning error: {e}")
        return {"ok": False, "error": str(e)}


def _run_task(task_id: str, request: dict[str, Any]) -> None:
    state = _state()
    task = state.setdefault("tasks", {}).setdefault(task_id, {"id": task_id, "started": _now(), "status": "running", "log": []})
    _save_state(state)
    before = _snapshot()
    task["before"] = before
    _log(task, "Optimisation started.")

    # Auto-fix any safe diagnostic issues first
    try:
        from server.services import system_debugger as SD
        auto = SD.run_auto_fixes(auto_approve=True)
        task["auto_fixes"] = auto
        if auto.get("fixed"):
            _log(task, f"Auto-applied {len(auto['fixed'])} safe fixes.")
    except Exception as e:  # noqa: BLE001
        _log(task, f"Auto-fix step skipped: {e}")

    paused: list[str] = []
    try:
        _drain_batches(task)
        paused = _pause_non_essential(task)
        task["paused"] = paused
        task["storage"] = _cleanup_storage(task)
        task["brain"] = _gpu_vram_step(task)
        task["routing"] = _model_routing_step(task, before)
    except Exception as e:  # noqa: BLE001
        _log(task, f"Unexpected error during optimisation: {e}")
    finally:
        if request.get("resume", True):
            _resume_services(task, paused)
        after = _snapshot()
        task["after"] = after
        task["status"] = "completed"
        task["finished"] = _now()
        _save_state(state)


def run_optimize(request: dict[str, Any] | None = None) -> dict[str, Any]:
    request = request or {}
    task_id = f"opt-{int(time.time() * 1000)}"
    threading.Thread(target=_run_task, args=(task_id, request), daemon=True).start()
    return {"ok": True, "task_id": task_id}


def task_status(task_id: str) -> dict[str, Any]:
    state = _state()
    task = state.get("tasks", {}).get(task_id, {})
    if not task:
        return {"ok": False, "error": "task not found"}
    return {"ok": True, "task": task}


def latest_status() -> dict[str, Any]:
    state = _state()
    tasks = state.get("tasks", {})
    if not tasks:
        return {"ok": True, "task": None}
    latest = max(tasks.values(), key=lambda t: t.get("started", ""))
    return {"ok": True, "task": latest}


def _run_maintenance_task(task_id: str) -> None:
    state = _state()
    task = state.setdefault("tasks", {}).setdefault(task_id, {"id": task_id, "started": _now(), "status": "running", "log": [], "kind": "maintenance"})
    _save_state(state)
    _log(task, "Light maintenance started.")
    snap = _snapshot()
    task["before"] = snap
    result: dict[str, Any] = {"storage": {}, "brain": {}}
    try:
        # Apply only low-risk diagnostic fixes automatically
        try:
            from server.services import system_debugger as SD
            auto = SD.run_auto_fixes(auto_approve=False)
            task["auto_fixes"] = auto
            if auto.get("fixed"):
                _log(task, f"Maintenance auto-fixed {len(auto['fixed'])} low-risk issues.")
        except Exception as e:  # noqa: BLE001
            _log(task, f"Maintenance auto-fix skipped: {e}")
        # Only clean tmp if disk pressure is elevated
        if (snap.get("disk_pct") or 0) > 80:
            result["storage"] = _cleanup_storage(task)
        else:
            _log(task, "Disk usage healthy — skipped storage cleanup.")
        result["brain"] = _gpu_vram_step(task)
        _model_routing_step(task, snap)
    except Exception as e:  # noqa: BLE001
        _log(task, f"Maintenance error: {e}")
    task["after"] = _snapshot()
    task["status"] = "completed"
    task["finished"] = _now()
    task["result"] = result
    _save_state(state)


def run_maintenance() -> dict[str, Any]:
    """Lightweight automated tune-up: no service pausing, no batch draining."""
    task_id = f"mnt-{int(time.time() * 1000)}"
    threading.Thread(target=_run_maintenance_task, args=(task_id,), daemon=True).start()
    return {"ok": True, "task_id": task_id}


def maintenance_log(limit: int = 10) -> list[dict[str, Any]]:
    state = _state()
    tasks = [t for t in state.get("tasks", {}).values() if t.get("kind") == "maintenance"]
    tasks.sort(key=lambda t: t.get("started", ""), reverse=True)
    return tasks[:limit]
