"""Planning loop: reads perception + intelligence → generates safe actions + proposals."""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from autopilot.control import state_store, capability_loader

REPORTS_DIR = os.path.join(ROOT, "autopilot", "reports")
ROADMAP_DIR = os.path.join(ROOT, "autopilot", "roadmap")


def _new_action(name: str, *, reason: str, klass: str, target: str = "",
                expected_impact: str = "", risk: str = "low",
                permission: str = "auto") -> dict[str, Any]:
    return {
        "action_id": f"act-{int(time.time() * 1000)}",
        "name": name,
        "type": klass,
        "reason": reason,
        "target": target,
        "expected_impact": expected_impact,
        "risk": risk,
        "permission_required": permission,
        "dry_run_result": None,
        "rollback_plan": "no-op for read-only",
        "success_criteria": "completes without error",
    }


def _new_proposal(title: str, body: str, *, kind: str = "fix",
                  affected_files: list[str] | None = None,
                  risk: str = "low") -> dict[str, Any]:
    return {
        "proposal_id": f"prop-{int(time.time() * 1000)}",
        "title": title,
        "kind": kind,
        "body": body,
        "affected_files": affected_files or [],
        "risk": risk,
        "requires_approval": True,
    }


def run() -> dict[str, Any]:
    run_id = state_store.new_run_id()
    started = time.time()

    perception_path = os.path.join(REPORTS_DIR, "perception-report.json")
    perception: dict[str, Any] = {}
    if os.path.exists(perception_path):
        try:
            with open(perception_path) as fh:
                perception = json.load(fh)
        except (OSError, json.JSONDecodeError):
            pass

    intel = capability_loader.load_all()
    actions: list[dict[str, Any]] = []
    proposals: list[dict[str, Any]] = []

    # Always: refresh discovery (safe generated_write)
    actions.append(_new_action(
        "discover.refresh",
        reason="keep intelligence/* current; runs every loop",
        klass="generated_write",
        target="autopilot/intelligence/",
        expected_impact="updated subsystem-registry + resource-map",
    ))

    # If brain offline AND vast events show throttle → propose, don't auto-fix
    brain_state = perception.get("brain", {}).get("state")
    if brain_state in ("missing", "offline", "stopped"):
        vast_by_kind = perception.get("vast_recent", {}).get("by_kind", {})
        throttled = vast_by_kind.get("brain_provision_throttled", 0) > 0
        body = (
            "# Brain box outage\n\n"
            f"Brain state: `{brain_state}`.\n\n"
            f"Recent Vast events: {vast_by_kind}\n\n"
            "## Likely cause\n\n"
            + ("Provision attempts are being throttled. Rotate the Vast API key, "
               "or extend BRAIN_WATCHDOG_PROVISION_COOLDOWN_S.\n\n"
               if throttled else
               "No throttle visible — try `python3 scripts/brain_watchdog.py --once`.\n\n")
            + "## Owner-action options\n\n"
            "1. Rotate Vast API key (`pm2 restart brain-watchdog` after env update).\n"
            "2. Provision manually via the GPU mini-app.\n"
            "3. Increase `BRAIN_PROVISION_MAX_PRICE` if cheapest offer was rejected.\n"
            "4. If brain not needed today: `pm2 stop brain-watchdog` to silence retries.\n"
        )
        proposals.append(_new_proposal(
            "Brain box revival — Vast provision throttled",
            body, kind="repair", risk="medium",
            affected_files=["scripts/brain_watchdog.py", "ecosystem.config.cjs"],
        ))

    # If assurance invariants failing
    inv = perception.get("assurance_invariants", {}) or {}
    if inv and not inv.get("overall_ok", True):
        body = f"Assurance invariants failing: {inv.get('passed')}/{inv.get('total')}\n\n"
        for r in inv.get("results", []):
            if not r.get("passed"):
                body += f"- `{r.get('name')}`: {r.get('evidence', '')}\n"
        proposals.append(_new_proposal(
            "Assurance invariants failing",
            body, kind="fix", risk="medium",
        ))

    # Broken imports → critical
    for b in perception.get("imports", {}).get("broken", []):
        proposals.append(_new_proposal(
            f"Broken import: server.routes.{b['module']}",
            f"```\n{b['error']}\n```\n", kind="fix", risk="high",
            affected_files=[f"server/routes/{b['module']}.py"],
        ))

    # Failing probes → flag, but don't auto-fix
    for p in perception.get("health", {}).get("failing_probes", []):
        proposals.append(_new_proposal(
            f"Health probe failing: {p.get('name')}",
            f"Probe `{p.get('name')}` failed: {p.get('detail')}\n",
            kind="investigate", risk="medium",
        ))

    # Limitations: if missing_encoding > 200 → propose batch fix
    limitations = (intel.get("limitations") or {}).get("by_kind", {})
    if limitations.get("missing_encoding", 0) > 100:
        proposals.append(_new_proposal(
            "Batch fix: add encoding= to bare open() calls",
            f"{limitations['missing_encoding']} open() calls without explicit encoding. "
            "Safe mechanical refactor. Forge can apply with line-level review.",
            kind="refactor", risk="low",
        ))

    # Capability gaps: if subsystem-registry says ANY subsystem is `dormant_scaffold`
    subs = (intel.get("subsystems") or {}).get("subsystems") or {}
    dormant = [n for n, info in subs.items() if "dormant" in info.get("status", "")]
    if dormant:
        body = "Subsystems with scaffolds but no live entrypoint:\n\n"
        for n in dormant[:10]:
            body += f"- `{n}` → primary: `{subs[n].get('primary')}`\n"
        body += "\nConsider: keep as scaffold (document why) OR activate (add route+service+pm2).\n"
        proposals.append(_new_proposal(
            f"Activate or document {len(dormant)} dormant subsystems",
            body, kind="design", risk="low",
        ))


    # LLM-driven planning: ask the brain to reorder + recommend the single highest-impact safe
    # action, append it to the auto-action queue. Owner consent 2026-06-19 — no separate approval.
    if os.environ.get("JARVIS_AUTOMATION_ALLOW_CLAUDE", "0") == "1":
        try:
            from autopilot.control.llm_client import generate, is_reachable
            if is_reachable(timeout=2.0):
                brain_summary = str(perception.get("brain") or {})
                health_summary = str(perception.get("health") or {})
                titles = [p.get("title", "") for p in proposals][:10]
                prompt = (
                    "You are JARVIS's autopilot planner. Given this perception summary "
                    "and these candidate proposals, return ONLY a JSON array of the form "
                    '[{"action_id":"...","name":"...","reason":"...","priority":1}] '
                    "with the top 3 highest-impact SAFE actions ranked by priority.\n\n"
                    "Perception summary: " + brain_summary + " " + health_summary + "\n"
                    "Proposals: " + json.dumps(titles) + "\n"
                )
                resp = generate(prompt, max_tokens=400, timeout=30)
                if resp:
                    import re as _re
                    m = _re.search(r"\[.*\]", resp, _re.DOTALL)
                    if m:
                        try:
                            ranked = json.loads(m.group(0))
                            for r in ranked[:1]:
                                if isinstance(r, dict) and r.get("name"):
                                    reason_txt = ("LLM ranked: " + str(r.get("reason", "")))[:200]
                                    actions.append(_new_action(
                                        r["name"], reason=reason_txt,
                                        klass="generated_write",
                                        target="autopilot/reports/", risk="low",
                                    ))
                        except (json.JSONDecodeError, KeyError, TypeError):
                            pass
        except Exception:
            pass

    finished = time.time()
    plan = {
        "run_id": run_id,
        "started_at": started,
        "finished_at": finished,
        "duration_ms": (finished - started) * 1000.0,
        "actions_n": len(actions),
        "proposals_n": len(proposals),
        "actions": actions,
        "proposals": proposals,
    }
    for a in actions:
        state_store.plan(run_id, a)
    for p in proposals:
        state_store.plan(run_id, p)

    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR, "plan-latest.json"), "w") as fh:
        json.dump(plan, fh, indent=2)
    md = [
        f"# Plan ({int(started)})",
        "",
        f"Run: `{run_id}`",
        f"**{len(actions)} auto-actions**, **{len(proposals)} proposals** for owner",
        "",
        "## Auto actions",
    ]
    for a in actions:
        md.append(f"- `{a['name']}` ({a['type']}): {a['reason']}")
    md += ["", "## Proposals"]
    for p in proposals:
        md.append(f"- **{p['title']}** ({p['kind']}, risk={p['risk']})")
    with open(os.path.join(REPORTS_DIR, "plan-latest.md"), "w") as fh:
        fh.write("\n".join(md) + "\n")

    # Roadmap: top 5 actions for the user
    os.makedirs(ROADMAP_DIR, exist_ok=True)
    next_actions = []
    for p in proposals[:5]:
        next_actions.append({
            "title": p["title"], "kind": p["kind"], "risk": p["risk"],
            "requires_approval": True,
        })
    for a in actions[:3]:
        next_actions.append({
            "title": a["name"], "kind": "auto", "risk": a["risk"],
            "requires_approval": False,
        })
    with open(os.path.join(ROADMAP_DIR, "next-actions.json"), "w") as fh:
        json.dump({"generated_at": time.time(), "next": next_actions[:10]}, fh, indent=2)

    return plan


if __name__ == "__main__":
    p = run()
    print(f"planning: {p['actions_n']} actions, {p['proposals_n']} proposals")
