"""Auto-close resolved proposals + auto-apply low-risk doc/wrapper ones.

Runs FIRST in the cognitive cycle so subsequent loops see a clean queue.
Owner consent 2026-06-19: no separate approval needed; the assurance gate
chain is the safety floor.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from autopilot.control import state_store

PROP_DIR = os.path.join(ROOT, "autopilot", "reports", "proposals")
RES_PATH = os.path.join(ROOT, "autopilot", "state", "proposal-resolutions.jsonl")


def _read_brain_state() -> str:
    p = os.path.join(ROOT, "server", "data", "brain_health.json")
    if not os.path.exists(p):
        return "unknown"
    try:
        with open(p) as fh:
            return json.load(fh).get("state", "unknown")
    except (OSError, json.JSONDecodeError):
        return "unknown"


def _resolved_condition(title: str, brain_state: str) -> str | None:
    t = title.lower()
    if "brain" in t and "revival" in t and brain_state == "alive":
        return "brain alive"
    if "brain" in t and "offline" in t and brain_state == "alive":
        return "brain alive"
    if "ollama_local" in t and brain_state == "alive":
        return "ollama reachable"
    if "vast-provision" in t.replace(" ", "-") and brain_state == "alive":
        return "brain alive"
    if "root-cause" in t.replace(" ", "-") and brain_state == "alive":
        return "brain alive"
    return None


def _parse_meta(content: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in re.finditer(r"\*\*([A-Za-z_]+)\*\*:\s*([^\n]+)", content):
        out[m.group(1).strip().lower()] = m.group(2).strip()
    return out


def _record_resolution(name: str, action: str, reason: str) -> None:
    os.makedirs(os.path.dirname(RES_PATH), exist_ok=True)
    try:
        with open(RES_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"ts": time.time(), "name": name,
                                  "action": action, "reason": reason}) + "\n")
    except OSError:
        pass


def run() -> dict[str, Any]:
    run_id = state_store.new_run_id()
    started = time.time()
    out: dict[str, Any] = {"run_id": run_id, "started_at": started,
                            "closed": 0, "applied": 0, "kept": 0,
                            "details": []}
    if not os.path.isdir(PROP_DIR):
        out["finished_at"] = time.time(); return out

    brain_state = _read_brain_state()
    for fname in sorted(os.listdir(PROP_DIR)):
        if not fname.endswith(".md"):
            continue
        path = os.path.join(PROP_DIR, fname)
        try:
            with open(path) as fh:
                content = fh.read()
        except OSError:
            continue
        # 1st line is `# <title>`
        title = (content.split("\n", 1)[0] or "").lstrip("# ").strip()
        meta = _parse_meta(content)

        # Auto-close if condition resolved
        reason = _resolved_condition(title, brain_state)
        if reason:
            try:
                os.remove(path)
                _record_resolution(fname, "closed", reason)
                state_store.act(run_id, {"action": "proposal_closed",
                                          "name": fname, "reason": reason})
                out["closed"] += 1
                out["details"].append({"name": fname, "action": "closed",
                                        "reason": reason})
                continue
            except OSError:
                pass

        # Auto-apply if Kind=doc|wrapper AND Risk=low
        kind = meta.get("kind", "").lower()
        risk = meta.get("risk", "").lower()
        if kind in ("doc", "wrapper") and risk == "low":
            # The proposal IS the doc — just mark applied (it's already on disk
            # under autopilot/, which is in allowed_write_paths).
            _record_resolution(fname, "applied", f"kind={kind}, risk={risk}")
            state_store.act(run_id, {"action": "proposal_applied",
                                      "name": fname, "kind": kind})
            out["applied"] += 1
            out["details"].append({"name": fname, "action": "applied",
                                    "kind": kind})
            continue

        out["kept"] += 1

    out["finished_at"] = time.time()
    out["duration_ms"] = (out["finished_at"] - started) * 1000.0
    # report
    reports_dir = os.path.join(ROOT, "autopilot", "reports")
    with open(os.path.join(reports_dir, "triage-report.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    return out


if __name__ == "__main__":
    o = run()
    print(f"triage: closed={o['closed']} applied={o['applied']} kept={o['kept']}")
