"""Surfaces unknown / dangerous / dormant systems."""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _find_orphans() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    scripts_dir = os.path.join(ROOT, "scripts")
    if not os.path.isdir(scripts_dir):
        return out
    for f in os.listdir(scripts_dir):
        if not f.endswith(".py"):
            continue
        path = os.path.join(scripts_dir, f)
        # check if anything imports/references it
        base = f.rsplit(".", 1)[0]
        try:
            r = subprocess.run(
                ["grep", "-rl", "--include=*.py", "--include=*.cjs", "--include=*.json",
                 "--exclude-dir=.venv", "--exclude-dir=.venv-tts",
                 "--exclude-dir=node_modules", "--exclude-dir=vendor",
                 base, ROOT],
                capture_output=True, text=True, timeout=8,
            )
            refs = [ln for ln in r.stdout.splitlines() if ln and not ln.endswith(path)]
        except (subprocess.SubprocessError, OSError):
            refs = []
        if not refs:
            try:
                st = os.stat(path)
            except OSError:
                continue
            out.append({
                "kind": "orphan_script",
                "path": os.path.relpath(path, ROOT),
                "age_days": round((time.time() - st.st_mtime) / 86400.0, 1),
            })
    return out


_DANGEROUS_PATTERNS = [
    (r"\brm\s+-rf\b", "rm -rf"),
    (r"subprocess\.run\([^)]*shell\s*=\s*True", "subprocess shell=True"),
    (r"\bos\.system\(", "os.system"),
    (r"\beval\(", "eval()"),
    (r"\bexec\(", "exec()"),
    (r"git\s+reset\s+--hard", "git reset --hard"),
    (r"\bDROP\s+TABLE\b", "DROP TABLE"),
    (r"\bTRUNCATE\s+", "TRUNCATE"),
    (r"chmod\s+-R\s+", "chmod -R"),
]


def _scan_dangerous() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for d in ("scripts", "server"):
        abs_d = os.path.join(ROOT, d)
        if not os.path.isdir(abs_d):
            continue
        for r, dd, files in os.walk(abs_d):
            dd[:] = [x for x in dd if not x.startswith(".")
                     and x not in ("__pycache__",)]
            for f in files:
                if not f.endswith(".py"):
                    continue
                path = os.path.join(r, f)
                try:
                    with open(path, encoding="utf-8") as fh:
                        src = fh.read()
                except OSError:
                    continue
                for pat, label in _DANGEROUS_PATTERNS:
                    if re.search(pat, src):
                        out.append({
                            "kind": "dangerous_pattern",
                            "path": os.path.relpath(path, ROOT),
                            "pattern": label,
                        })
    return out


def find() -> dict[str, Any]:
    now = time.time()
    orphans = _find_orphans()
    dangerous = _scan_dangerous()
    # Brain offline
    brain_health_path = os.path.join(ROOT, "server", "data", "brain_health.json")
    brain_offline = False
    if os.path.exists(brain_health_path):
        try:
            with open(brain_health_path, encoding="utf-8") as fh:
                bh = json.load(fh)
            brain_offline = (bh.get("state") in ("missing", "offline", "stopped"))
        except (OSError, json.JSONDecodeError):
            pass
    out: dict[str, Any] = {
        "generated_at": now,
        "summary": {
            "orphan_scripts_n": len(orphans),
            "dangerous_patterns_n": len(dangerous),
            "brain_offline": brain_offline,
        },
        "orphan_scripts": orphans,
        "dangerous_patterns": dangerous,
    }
    return out


def write_outputs(intel_dir: str, state_dir: str) -> None:
    out = find()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "unknown-systems.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    s = out["summary"]
    lines = [
        "# Unknown Systems",
        "",
        f"**Orphan scripts**: {s['orphan_scripts_n']}",
        f"**Dangerous patterns**: {s['dangerous_patterns_n']}",
        f"**Brain offline**: {s['brain_offline']}",
        "",
        "## Orphan scripts (no references)",
        "| Path | Age (d) |",
        "|---|---|",
    ]
    for o in out["orphan_scripts"][:30]:
        lines.append(f"| `{o['path']}` | {o['age_days']} |")
    lines += [
        "",
        "## Dangerous-pattern matches (first 30)",
        "| Path | Pattern |",
        "|---|---|",
    ]
    for d in out["dangerous_patterns"][:30]:
        lines.append(f"| `{d['path']}` | `{d['pattern']}` |")
    with open(os.path.join(intel_dir, "unknown-systems.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    # Also write state/unknowns.json
    os.makedirs(state_dir, exist_ok=True)
    with open(os.path.join(state_dir, "unknowns.json"), "w") as fh:
        json.dump(out["summary"], fh, indent=2)


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    state = os.path.join(ROOT, "autopilot", "state")
    write_outputs(intel, state)
    print("unknown-systems written")
