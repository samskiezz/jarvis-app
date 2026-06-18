"""Perception loop: senses repo state into observations.jsonl + perception-report."""
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

REPORTS_DIR = os.path.join(ROOT, "autopilot", "reports")


def _git_status() -> dict[str, Any]:
    try:
        r = subprocess.run(["git", "status", "--short"], capture_output=True, text=True,
                           timeout=10, cwd=ROOT)
        lines = [ln for ln in r.stdout.splitlines() if ln.strip()]
        return {"changed_n": len(lines), "head_status": "dirty" if lines else "clean"}
    except (subprocess.SubprocessError, OSError):
        return {"changed_n": 0, "head_status": "unknown"}


def _read_health() -> dict[str, Any]:
    p = os.path.join(ROOT, "server", "data", "health.json")
    if not os.path.exists(p):
        return {}
    try:
        with open(p) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def _read_brain() -> dict[str, Any]:
    p = os.path.join(ROOT, "server", "data", "brain_health.json")
    if not os.path.exists(p):
        return {}
    try:
        with open(p) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def _tail_vast_events(n: int = 10) -> list[dict]:
    p = os.path.join(ROOT, "server", "data", "vast_events.jsonl")
    if not os.path.exists(p):
        return []
    try:
        with open(p) as fh:
            tail = fh.readlines()[-n:]
        return [json.loads(ln) for ln in tail if ln.strip()]
    except (OSError, json.JSONDecodeError):
        return []


def _check_imports() -> dict[str, Any]:
    """Try importing every server/routes/* module to detect broken imports."""
    routes_dir = os.path.join(ROOT, "server", "routes")
    if not os.path.isdir(routes_dir):
        return {"checked": 0, "broken": []}
    broken: list[dict] = []
    checked = 0
    for f in sorted(os.listdir(routes_dir)):
        if not f.endswith(".py") or f.startswith("_"):
            continue
        mod = f[:-3]
        checked += 1
        try:
            r = subprocess.run(
                [os.path.join(ROOT, ".venv/bin/python"), "-c",
                 f"import sys; sys.path.insert(0, '{ROOT}'); "
                 f"import server.routes.{mod}"],
                capture_output=True, text=True, timeout=15,
            )
            if r.returncode != 0:
                broken.append({"module": mod, "error": r.stderr[-300:]})
        except (subprocess.SubprocessError, OSError) as e:
            broken.append({"module": mod, "error": str(e)[:200]})
    return {"checked": checked, "broken": broken[:20]}


def _read_assurance_invariants() -> dict[str, Any]:
    p = os.path.join(ROOT, "server", "data", "assurance", "reports", "latest_invariants.json")
    if not os.path.exists(p):
        return {}
    try:
        with open(p) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def run() -> dict[str, Any]:
    run_id = state_store.new_run_id()
    started = time.time()

    git = _git_status()
    state_store.observe(run_id, "git.status", git)

    health = _read_health()
    state_store.observe(run_id, "health.snapshot", {
        "overall_ok": health.get("overall_ok"),
        "probes_n": len(health.get("probes") or []),
    })

    brain = _read_brain()
    state_store.observe(run_id, "brain.health", {"state": brain.get("state")})

    vast = _tail_vast_events()
    by_kind: dict[str, int] = {}
    for e in vast:
        by_kind[e.get("kind", "?")] = by_kind.get(e.get("kind", "?"), 0) + 1
    state_store.observe(run_id, "vast.recent", {"by_kind": by_kind, "n": len(vast)})

    inv = _read_assurance_invariants()
    if inv:
        state_store.observe(run_id, "assurance.invariants", {
            "overall_ok": inv.get("overall_ok"),
            "passed": inv.get("passed"),
            "total": inv.get("total"),
        })

    imports = _check_imports()
    state_store.observe(run_id, "imports.sanity", {
        "checked": imports["checked"],
        "broken_n": len(imports["broken"]),
    })

    finished = time.time()
    report = {
        "run_id": run_id,
        "started_at": started,
        "finished_at": finished,
        "duration_ms": (finished - started) * 1000.0,
        "git": git,
        "health": {
            "overall_ok": health.get("overall_ok"),
            "probes_n": len(health.get("probes") or []),
            "failing_probes": [p for p in (health.get("probes") or [])
                              if p.get("ok") is False][:10],
        },
        "brain": brain or {"state": "unknown"},
        "vast_recent": {"by_kind": by_kind, "events": vast[-5:]},
        "assurance_invariants": inv,
        "imports": imports,
    }
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR, "perception-report.json"), "w") as fh:
        json.dump(report, fh, indent=2)
    md = [
        f"# Perception Report  ({int(started)})",
        "",
        f"Run: `{run_id}`  Duration: {report['duration_ms']:.0f}ms",
        "",
        f"**Git**: {git['head_status']} ({git['changed_n']} changed)",
        f"**Health**: overall_ok={health.get('overall_ok')} ({len(health.get('probes') or [])} probes, "
        f"{len(report['health']['failing_probes'])} failing)",
        f"**Brain**: state={brain.get('state', 'unknown')}",
        f"**Vast (recent)**: {by_kind}",
        f"**Assurance**: overall_ok={inv.get('overall_ok')} {inv.get('passed', '?')}/{inv.get('total', '?')}",
        f"**Imports**: {imports['checked']} checked, {len(imports['broken'])} broken",
    ]
    if report["health"]["failing_probes"]:
        md.append("")
        md.append("## Failing probes")
        for p in report["health"]["failing_probes"]:
            md.append(f"- `{p.get('name')}`: {p.get('detail', '?')}")
    if imports["broken"]:
        md.append("")
        md.append("## Broken imports")
        for b in imports["broken"]:
            md.append(f"- `{b['module']}`: {b['error'][:120]}")
    with open(os.path.join(REPORTS_DIR, "perception-report.md"), "w") as fh:
        fh.write("\n".join(md) + "\n")
    state_store.write_kv("last-run.json", {"loop": "perception", "run_id": run_id,
                                             "finished_at": finished})
    return report


if __name__ == "__main__":
    rep = run()
    print(f"perception: brain={rep['brain'].get('state')}, "
          f"health_ok={rep['health']['overall_ok']}, "
          f"broken_imports={len(rep['imports']['broken'])}")
