"""Action loop: executes only policy-approved actions; writes results."""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from autopilot.control import state_store
from autopilot.control.action_runner import ActionRunner

REPORTS_DIR = os.path.join(ROOT, "autopilot", "reports")


def _do_discover_refresh() -> dict[str, Any]:
    """Re-run all discover modules. Safe (generated_write to intelligence/)."""
    out: dict[str, Any] = {"steps": {}}
    for mod_name in (
        "autopilot.discover.plane_walker",
        "autopilot.discover.subsystem_extractor",
        "autopilot.discover.resource_scanner",
        "autopilot.discover.db_cataloguer",
        "autopilot.discover.capability_extractor",
        "autopilot.discover.integration_mapper",
        "autopilot.discover.unknown_finder",
        "autopilot.discover.limitation_finder",
    ):
        try:
            __import__(mod_name)
            m = sys.modules[mod_name]
            intel = os.path.join(ROOT, "autopilot", "intelligence")
            state = os.path.join(ROOT, "autopilot", "state")
            if hasattr(m, "write_outputs"):
                try:
                    m.write_outputs(intel, state)
                except TypeError:
                    m.write_outputs(intel)
                out["steps"][mod_name] = "ok"
            else:
                out["steps"][mod_name] = "no write_outputs()"
        except Exception as exc:  # noqa: BLE001
            out["steps"][mod_name] = f"err: {type(exc).__name__}: {exc}"
    return out


def run() -> dict[str, Any]:
    run_id = state_store.new_run_id()
    started = time.time()
    runner = ActionRunner()

    plan_path = os.path.join(REPORTS_DIR, "plan-latest.json")
    plan: dict[str, Any] = {}
    if os.path.exists(plan_path):
        with open(plan_path) as fh:
            plan = json.load(fh)

    results: list[dict[str, Any]] = []
    for action in plan.get("actions", []):
        name = action.get("name", "")
        if name == "discover.refresh":
            res = _do_discover_refresh()
            results.append({
                "action_id": action["action_id"], "name": name,
                "ok": all(v == "ok" for v in res["steps"].values()),
                "detail": res,
            })
            state_store.act(run_id, {"action_id": action["action_id"], "name": name})
            state_store.result(run_id, action["action_id"],
                                {"ok": all(v == "ok" for v in res["steps"].values()),
                                 "detail": res})
        else:
            # Route through ActionRunner
            r = runner.execute(name=name, dry_run=True)
            results.append({
                "action_id": action["action_id"], "name": name,
                "ok": r.get("ok"), "detail": r,
            })
            state_store.act(run_id, {"action_id": action["action_id"], "name": name})
            state_store.result(run_id, action["action_id"], r)

    # Write proposals as markdown
    proposals_written = 0
    for prop in plan.get("proposals", []):
        path = runner.propose(
            kind=prop["kind"], title=prop["title"],
            body=prop["body"], affected_files=prop.get("affected_files"),
            risk=prop["risk"],
        )
        proposals_written += 1
        state_store.act(run_id, {"proposal_id": prop["proposal_id"],
                                  "title": prop["title"], "path": path})

    finished = time.time()
    out = {
        "run_id": run_id,
        "started_at": started,
        "finished_at": finished,
        "duration_ms": (finished - started) * 1000.0,
        "actions_attempted": len(plan.get("actions", [])),
        "actions_ok": sum(1 for r in results if r.get("ok")),
        "proposals_written": proposals_written,
        "results": results,
    }
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR, "action-report.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    md = [
        f"# Action Report  ({int(started)})",
        "",
        f"Run: `{run_id}`",
        f"**Actions**: {out['actions_ok']}/{out['actions_attempted']} ok",
        f"**Proposals written**: {proposals_written}",
        "",
        "## Action outcomes",
    ]
    for r in results:
        mark = "✓" if r.get("ok") else "✗"
        md.append(f"- {mark} `{r['name']}`")
    with open(os.path.join(REPORTS_DIR, "action-report.md"), "w") as fh:
        fh.write("\n".join(md) + "\n")
    return out


if __name__ == "__main__":
    o = run()
    print(f"action: {o['actions_ok']}/{o['actions_attempted']} ok, "
          f"{o['proposals_written']} proposals written")
