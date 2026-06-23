"""JARVIS Nexus Phase 3 — the autonomous controller (the coordinating mind).

Runs as its own process (PM2: nexus-controller). On each tick it reads the whole
service registry, computes a cross-system snapshot, detects stale/dead services,
and PUBLISHES its findings onto the shared bus so the entire collective shares
one coordinated view instead of each loop running blind.

Safety scope: DETECT + REPORT + COORDINATE only. It does not restart, kill, or
act on anything by itself — remediation is operator-gated via /v1/control. This
is the self-aware nervous-system layer, not an autonomous actuator.
"""
from __future__ import annotations

import os
import time

from . import jarvis_events as bus
from . import registry_store

INTERVAL_S = 20
SELF_ID = "nexus-controller"
_LEDGER = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "audit", "MASTER_TASKLIST.md"))


def read_task_ledger() -> dict:
    """Self-awareness of its own task list (Item 6): count statuses in the master ledger."""
    try:
        with open(_LEDGER, "r", encoding="utf-8") as f:
            text = f.read()
    except Exception:  # noqa: BLE001
        return {"available": False}
    done = text.count("✅")          # ✅
    in_progress = text.count("\U0001F504")  # 🔄
    partial = text.count("\U0001F7E1")      # 🟡
    queued = text.count("⏳")            # ⏳
    return {
        "available": True, "done": done, "in_progress": in_progress,
        "partial": partial, "queued": queued,
        "total": done + in_progress + partial + queued,
    }


def tick() -> dict:
    svcs = registry_store.list_services()
    alive = [s for s in svcs if s.get("alive")]
    dead = [s for s in svcs if not s.get("alive")]

    ledger = read_task_ledger()
    if ledger.get("available"):
        bus.emit("tasks", "status", ledger, actor=SELF_ID)

    bus.emit("system", "snapshot", {
        "services": len(svcs),
        "alive": len(alive),
        "dead": len(dead),
        "alive_ids": [s["id"] for s in alive],
        "dead_ids": [s["id"] for s in dead],
    }, actor=SELF_ID)

    for s in dead:
        bus.emit("service", "down", {
            "id": s["id"], "port": s.get("port"), "role": s.get("role"),
            "last_seen": s.get("last_seen"),
        }, actor=SELF_ID)

    # keep ourselves fresh in the registry
    try:
        registry_store.heartbeat(SELF_ID, "ok", {"alive": len(alive), "dead": len(dead)})
    except Exception:  # noqa: BLE001
        pass

    return {"alive": len(alive), "dead": len(dead)}


def main() -> None:
    try:
        registry_store.upsert({
            "id": SELF_ID, "name": SELF_ID, "role": "orchestrator",
            "base_url": "", "health_path": "", "status": "ok",
            "routes": ["/v1/control/state"],
        })
    except Exception:  # noqa: BLE001
        pass
    print("[nexus-controller] online — coordinating the collective", flush=True)
    while True:
        try:
            r = tick()
            print(f"[nexus-controller] snapshot alive={r['alive']} dead={r['dead']}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[nexus-controller] tick error: {e}", flush=True)
        time.sleep(INTERVAL_S)


if __name__ == "__main__":
    main()
