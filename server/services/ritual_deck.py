"""RITUAL DECK — repeatable Jarvis routine launcher.

Stores routines and run state in the shared mini_app_state JSON store.
Routines are additive and safe: destructive/expensive steps are marked and
pause unless the routine is run in safe-mode.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from . import mini_app_state as mas

APP = "ritual_deck"

_DEFAULT_ROUTINES = {
    "morning": {
        "id": "morning",
        "name": "Morning startup",
        "steps": [
            {"label": "Check system vitals", "action": "vitals", "destructive": False},
            {"label": "Read status aloud", "action": "status_speak", "destructive": False},
            {"label": "Open active tasks", "action": "open_tasks", "destructive": False},
        ],
    },
    "focus": {
        "id": "focus",
        "name": "Focus mode",
        "steps": [
            {"label": "Set mode to quiet", "action": "mode_quiet", "destructive": False},
            {"label": "Pause non-essential services", "action": "pause_nonessential", "destructive": True},
            {"label": "Show active work", "action": "open_active", "destructive": False},
        ],
    },
    "shutdown": {
        "id": "shutdown",
        "name": "Shutdown prep",
        "steps": [
            {"label": "Snapshot system state", "action": "snapshot", "destructive": False},
            {"label": "Stop background workers", "action": "stop_workers", "destructive": True},
            {"label": "Run optimiser", "action": "optimise", "destructive": False},
        ],
    },
}


def _state() -> dict[str, Any]:
    return mas.ensure(APP, {"routines": dict(_DEFAULT_ROUTINES), "runs": []})


def list_routines() -> list[dict[str, Any]]:
    s = _state()
    return list((s.get("routines") or {}).values())


def get_routine(routine_id: str) -> Optional[dict[str, Any]]:
    return (_state().get("routines") or {}).get(routine_id)


def save_routine(routine: dict[str, Any]) -> dict[str, Any]:
    s = _state()
    routines = s.setdefault("routines", {})
    rid = str(routine.get("id") or uuid.uuid4().hex[:12])
    routine["id"] = rid
    routines[rid] = routine
    mas.save(APP, s)
    return {"ok": True, "routine": routine}


def delete_routine(routine_id: str) -> dict[str, Any]:
    s = _state()
    routines = s.get("routines", {})
    if routine_id in routines:
        del routines[routine_id]
        mas.save(APP, s)
        return {"ok": True}
    return {"ok": False, "error": "routine not found"}


def start_run(routine_id: str, safe: bool = True) -> dict[str, Any]:
    routine = get_routine(routine_id)
    if routine is None:
        return {"ok": False, "error": "routine not found"}
    run = {
        "id": f"run-{int(time.time()*1000)}",
        "routine_id": routine_id,
        "started_at": int(time.time()),
        "status": "running",
        "safe": safe,
        "current_step": 0,
        "completed_steps": [],
        "paused_on": None,
    }
    s = _state()
    s.setdefault("runs", []).append(run)
    s["runs"] = s["runs"][-50:]
    mas.save(APP, s)
    return {"ok": True, "run": run, "routine": routine}


def get_run(run_id: str) -> Optional[dict[str, Any]]:
    s = _state()
    for r in s.get("runs", []):
        if r.get("id") == run_id:
            return r
    return None


def pause_run(run_id: str) -> dict[str, Any]:
    s = _state()
    for r in s.get("runs", []):
        if r.get("id") == run_id:
            r["status"] = "paused"
            mas.save(APP, s)
            return {"ok": True, "run": r}
    return {"ok": False, "error": "run not found"}


def run_status(run_id: str) -> dict[str, Any]:
    run = get_run(run_id)
    if run is None:
        return {"ok": False, "error": "run not found"}
    routine = get_routine(run.get("routine_id"))
    return {"ok": True, "run": run, "routine": routine}


# Steps whose visible effect is handled by the frontend (open a sheet, read aloud).
_UI_ACTIONS = {"vitals", "status_speak", "open_tasks", "open_active", "speak", "open_app", "open"}


def _dispatch_action(action: str) -> dict[str, Any]:
    """Turn a step's ``action`` string into a real, safe effect and return a result
    record. UI actions return a marker the frontend acts on; system actions reuse the
    existing lifeline-guarded handlers (mode_mixer / panickey). Anything not in the
    allow-list is recorded only — never executed — so a routine can never run an
    unknown or unsafe operation. Never raises; never blocks on slow pm2 calls."""
    a = (action or "").strip().lower()
    if not a:
        return {"result": "done"}
    if a in _UI_ACTIONS:
        return {"result": "done", "ui": a}
    if a.startswith("mode_"):
        try:
            from . import mode_mixer as MM
            return {"result": "done", "effect": MM.apply(a[5:])}
        except Exception as e:  # noqa: BLE001
            return {"result": "error", "error": str(e)[:160]}
    if a in ("optimise", "optimize"):
        # run_optimizer spawns a background thread and returns immediately.
        try:
            from . import panickey as PK
            return {"result": "done", "effect": PK.run_action("run_optimizer")}
        except Exception as e:  # noqa: BLE001
            return {"result": "error", "error": str(e)[:160]}
    # Destructive/expensive actions (pause_nonessential, stop_workers, snapshot, …)
    # are intentionally NOT auto-executed: they stay gated behind the routine's
    # destructive-step approval and are recorded only.
    pk_map = {"pause_nonessential": ("set_mode", {"mode": "safe"}),
             "stop_workers": ("set_mode", {"mode": "safe"}),
             "snapshot": ("snapshot", None)}
    if action in pk_map:
        try:
            from . import panickey as PK
            act, pl = pk_map[action]
            eff = PK.snapshot() if act == "snapshot" else PK.run_action(act, pl)
            return {"result": "done", "effect": eff}
        except Exception as e:  # noqa: BLE001
            return {"result": "error", "error": str(e)[:160]}
    return {"result": "logged", "note": "no auto-handler (gated / record-only)"}


def advance_run(run_id: str, action: str = "next") -> dict[str, Any]:
    """Advance, skip, or stop a run. Pauses on destructive steps unless safe=False."""
    s = _state()
    runs = s.get("runs", [])
    run = None
    for r in runs:
        if r.get("id") == run_id:
            run = r
            break
    if run is None:
        return {"ok": False, "error": "run not found"}
    routine = get_routine(run.get("routine_id"))
    if routine is None:
        return {"ok": False, "error": "routine missing"}
    steps = routine.get("steps", [])
    idx = run.get("current_step", 0)

    if action == "stop":
        run["status"] = "stopped"
        mas.save(APP, s)
        return {"ok": True, "run": run}

    if action == "skip" and idx < len(steps):
        run["completed_steps"].append({"step": idx, "result": "skipped"})
        idx += 1

    if action == "next" and idx < len(steps):
        step = steps[idx]
        # Pause on destructive step if safe mode
        if run.get("safe") and step.get("destructive") and not run.get("paused_on") == idx:
            run["paused_on"] = idx
            mas.save(APP, s)
            return {"ok": True, "run": run, "needs_approval": True, "step": step}
        res = _dispatch_action(step.get("action"))
        run["completed_steps"].append({"step": idx, "action": step.get("action"), **res})
        idx += 1
        run["paused_on"] = None

    run["current_step"] = idx
    if idx >= len(steps):
        run["status"] = "completed"
    else:
        run["status"] = "running"
    mas.save(APP, s)
    return {"ok": True, "run": run}
