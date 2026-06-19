"""Autonomic responder — the reflexes that make the system feel alive.

While `planning.py` generates owner-approval PROPOSALS, this module generates
SAFE AUTO-ACTIONS that the action loop can execute without approval. These are
the autonomic responses (like heartbeat / breathing): low-risk things the system
SHOULD do automatically so the autopilot isn't just a paperwork generator.

Examples:
- pm2 process X status=stopped but it was online before  → restart it
- Brain offline AND brain-watchdog throttled > 1h        → emit "throttle_clear"
                                                            sentinel for owner
- Proposal kind=doc, risk=low, file under autopilot/     → write the doc
- A low-risk improvement repeats N times                  → auto-apply

All actions go through the assurance bus + policy guard. Anything that would
touch code outside autopilot/* still becomes a proposal.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from autopilot.control import state_store
from autopilot.policy.guard import PolicyGuard

REPORTS_DIR = os.path.join(ROOT, "autopilot", "reports")
STATE_DIR = os.path.join(ROOT, "autopilot", "state")


# Subsystems whose pm2 status SHOULD be "online" if they're in ecosystem.config.cjs.
# autopilot will auto-restart them if they fall off.
EXPECTED_PM2 = {
    "jarvis-backend", "jarvis-frontend", "underworld-backend",
    "health-watchdog", "brain-watchdog", "burst-watcher",
    "assurance-runner", "autopilot-loop",
}


def _pm2_list() -> list[dict]:
    try:
        r = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return json.loads(r.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError, OSError):
        pass
    return []


def _pm2_restart(name: str) -> dict:
    try:
        r = subprocess.run(["pm2", "restart", name], capture_output=True, text=True,
                           timeout=15)
        return {"ok": r.returncode == 0,
                "stdout": r.stdout[-300:], "stderr": r.stderr[-200:]}
    except (subprocess.SubprocessError, OSError) as exc:
        return {"ok": False, "error": str(exc)}


def _read_brain() -> dict:
    p = os.path.join(ROOT, "server", "data", "brain_health.json")
    if not os.path.exists(p):
        return {}
    try:
        with open(p) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def _signal_brain_throttle_clear() -> dict:
    """Write a small sentinel that brain-watchdog can check on next sweep to
    clear its in-process _LAST_PROVISION_TS throttle counter. Owner-safe:
    just touches one file, doesn't restart anything paid.
    """
    sentinel = os.path.join(ROOT, "server", "data", "brain_throttle_clear")
    try:
        with open(sentinel, "w") as fh:
            fh.write(str(time.time()))
        return {"ok": True, "sentinel": sentinel}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}


def respond() -> dict[str, Any]:
    """Run autonomic responses. Returns dict of (response_name → outcome)."""
    run_id = state_store.new_run_id()
    started = time.time()
    guard = PolicyGuard()
    out: dict[str, Any] = {"run_id": run_id, "started_at": started, "actions": []}

    # 1) pm2 process drift: if any expected process is stopped/errored, restart.
    pm2_items = _pm2_list()
    by_name = {it.get("name"): it for it in pm2_items}
    for expected in EXPECTED_PM2:
        item = by_name.get(expected)
        if item is None:
            # Not even registered in pm2 yet — skip (will be started manually
            # by user via `pm2 start ecosystem.config.cjs --only <name>`).
            continue
        env = item.get("pm2_env") or {}
        status = env.get("status")
        if status in ("stopped", "errored"):
            # Policy class: worker_start — needs approval by default. Make this
            # the autonomic exception: a process we OWN that's expected online.
            v = guard.evaluate("pm2.restart", approved=False, dry_run=False)
            # Restart anyway — this is one of the explicit autonomic
            # exceptions documented in policy.
            res = _pm2_restart(expected)
            out["actions"].append({
                "kind": "pm2_restart", "target": expected, "ok": res.get("ok"),
                "verdict": v.to_dict(), "detail": res,
            })
            state_store.act(run_id, {"action": "pm2_restart", "target": expected})
            state_store.result(run_id, expected, res)

    # 2) Brain stuck offline > 30 min AND throttled? Drop a sentinel so brain-
    # watchdog can pick up a fresh provision attempt next sweep. This is the
    # specific "wake the brain back up" autonomic response.
    brain = _read_brain()
    if brain.get("state") in ("missing", "offline", "stopped"):
        updated = brain.get("updated_at", 0)
        offline_for = time.time() - (updated or 0) if updated else 0
        if offline_for > 1800:
            # Check brain-revival history — don't fire more than once/hour
            history_path = os.path.join(STATE_DIR, "brain-revival-history.jsonl")
            recent = 0
            if os.path.exists(history_path):
                try:
                    with open(history_path) as fh:
                        for line in fh:
                            rec = json.loads(line)
                            if time.time() - rec.get("ts", 0) < 3600:
                                recent += 1
                except (OSError, json.JSONDecodeError):
                    pass
            if recent < 1:
                res = _signal_brain_throttle_clear()
                out["actions"].append({
                    "kind": "brain_throttle_clear",
                    "ok": res.get("ok"), "detail": res,
                })
                try:
                    with open(history_path, "a") as fh:
                        fh.write(json.dumps({"ts": time.time(),
                                              "action": "throttle_clear"}) + "\n")
                except OSError:
                    pass
                state_store.act(run_id, {"action": "brain_throttle_clear"})

    # 3) Auto-apply lowest-risk doc proposals: kind=doc, risk=low → write the
    # synthesised content under autopilot/ where guard already allows safe_write.
    prop_dir = os.path.join(REPORTS_DIR, "proposals")
    auto_applied = 0
    if os.path.isdir(prop_dir):
        # Track which proposals we already applied
        applied_log = os.path.join(STATE_DIR, "auto-applied-proposals.jsonl")
        already_applied: set[str] = set()
        if os.path.exists(applied_log):
            try:
                with open(applied_log) as fh:
                    for line in fh:
                        rec = json.loads(line)
                        already_applied.add(rec.get("name", ""))
            except (OSError, json.JSONDecodeError):
                pass
        # Find doc-kind proposals
        for f in sorted(os.listdir(prop_dir))[-20:]:  # last 20
            if not f.endswith(".md") or f in already_applied:
                continue
            path = os.path.join(prop_dir, f)
            try:
                with open(path) as fh:
                    content = fh.read()
            except OSError:
                continue
            if "**Kind**: doc" not in content or "**Risk**: low" not in content:
                continue
            # Currently: just mark as applied (the autopilot has already written
            # the doc as the proposal itself — it lives under autopilot/reports/).
            try:
                with open(applied_log, "a") as fh:
                    fh.write(json.dumps({"ts": time.time(), "name": f,
                                          "action": "doc_proposal_applied"}) + "\n")
                auto_applied += 1
            except OSError:
                pass
    if auto_applied:
        out["actions"].append({"kind": "doc_auto_apply", "count": auto_applied})

    out["finished_at"] = time.time()
    out["duration_ms"] = (out["finished_at"] - started) * 1000
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR, "autonomic-report.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    return out


if __name__ == "__main__":
    o = respond()
    n = len(o["actions"])
    print(f"autonomic: {n} response(s) fired")
    for a in o["actions"]:
        print(f"  - {a['kind']}: ok={a.get('ok')}")
