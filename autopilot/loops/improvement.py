"""Improvement loop: synthesises safe improvements as proposals."""
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
from autopilot.control.action_runner import ActionRunner

REPORTS_DIR = os.path.join(ROOT, "autopilot", "reports")
ROADMAP_DIR = os.path.join(ROOT, "autopilot", "roadmap")


def run() -> dict[str, Any]:
    run_id = state_store.new_run_id()
    started = time.time()
    runner = ActionRunner()

    intel = capability_loader.load_all()
    improvements: list[dict[str, Any]] = []

    # Per-subsystem: any subsystem with missing route or missing service is
    # a candidate for a doc proposal.
    subs = (intel.get("subsystems") or {}).get("subsystems") or {}
    dormant_with_primary = [
        (n, info) for n, info in subs.items()
        if info.get("status", "").startswith("dormant") and info.get("primary_exists")
    ]
    for n, info in dormant_with_primary[:5]:
        title = f"Document subsystem: {n}"
        body = (f"Subsystem `{n}` is dormant_scaffold (no route or pm2 entry) "
                f"but its primary `{info['primary']}` exists.\n\n"
                f"Suggested doc: brief README explaining purpose, current state, "
                f"and activation path if any.\n")
        path = runner.propose(kind="doc", title=title, body=body, risk="low",
                              affected_files=[info["primary"]])
        improvements.append({"path": path, "title": title})

    # Limitations: missing_encoding > 200 → bulk wrapper script proposal
    lims = (intel.get("limitations") or {}).get("by_kind", {})
    if lims.get("missing_encoding", 0) > 100:
        title = "Batch wrapper: open() encoding shim"
        body = (
            "## Synthesised wrapper\n\n"
            "```python\n"
            "# scripts/open_encoding_shim.py — a refactor proposal, not auto-applied\n"
            "# Replaces:\n"
            "#   open(path)                  -> open(path, encoding='utf-8')\n"
            "#   open(path, 'r')             -> open(path, 'r', encoding='utf-8')\n"
            "# Skip if 'b' in mode or encoding= already present.\n"
            "```\n"
            f"\nAffects approximately {lims['missing_encoding']} call-sites. Forge can review per-file.\n"
        )
        path = runner.propose(kind="wrapper", title=title, body=body, risk="low")
        improvements.append({"path": path, "title": title})

    # Roadmap: append improvements
    roadmap_path = os.path.join(ROADMAP_DIR, "backlog.json")
    backlog = []
    if os.path.exists(roadmap_path):
        try:
            with open(roadmap_path) as fh:
                backlog = json.load(fh)
        except (OSError, json.JSONDecodeError):
            pass
    for imp in improvements:
        backlog.append({"title": imp["title"], "path": imp["path"],
                        "ts": time.time(), "kind": "improvement"})
    backlog = backlog[-100:]
    os.makedirs(ROADMAP_DIR, exist_ok=True)
    with open(roadmap_path, "w") as fh:
        json.dump(backlog, fh, indent=2)

    finished = time.time()
    out = {
        "run_id": run_id,
        "started_at": started,
        "finished_at": finished,
        "duration_ms": (finished - started) * 1000.0,
        "n_improvements": len(improvements),
        "improvements": improvements,
    }
    with open(os.path.join(REPORTS_DIR, "improvement-report.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    md = [f"# Improvements ({int(started)})", "",
          f"Run: `{run_id}`",
          f"**{len(improvements)} proposals synthesised**", ""]
    for imp in improvements:
        md.append(f"- [{imp['title']}](../{os.path.relpath(imp['path'], REPORTS_DIR)})")
    with open(os.path.join(REPORTS_DIR, "improvement-report.md"), "w") as fh:
        fh.write("\n".join(md) + "\n")
    return out


if __name__ == "__main__":
    o = run()
    print(f"improvement: {o['n_improvements']} proposals")
