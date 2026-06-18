"""Heuristics for self-limiting code patterns."""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


PATTERNS = [
    (r"timeout\s*=\s*([1-9])\b",            "hardcoded_low_timeout",
     "timeout < 10s — likely too aggressive"),
    (r"max_tokens\s*=\s*(\d{1,3})\b",        "hardcoded_low_max_tokens",
     "max_tokens < 1000 — may truncate"),
    (r"open\([^)]+\)(?![^=]*encoding)",      "missing_encoding",
     "open() without explicit encoding"),
    (r"\bprint\(",                            "print_left_in_code",
     "print() instead of logging"),
    (r"except\s+Exception\s*:\s*pass",       "swallowed_exception",
     "except Exception: pass — silent failure"),
    (r"#\s*TODO\b",                           "todo_marker", "TODO marker"),
    (r"#\s*FIXME\b",                          "fixme_marker", "FIXME marker"),
    (r"#\s*XXX\b",                            "xxx_marker", "XXX marker"),
    (r"\bsync\s*=\s*True\b",                  "sync_in_async", "sync=True flag"),
    (r"while\s+True\s*:[^\n]*\n[^\n]*sleep\(",
     "unbounded_loop", "while True without explicit break"),
]


def _scan(dirs: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    by_kind: dict[str, int] = {}
    for d in dirs:
        abs_d = os.path.join(ROOT, d)
        if not os.path.isdir(abs_d):
            continue
        for r, dd, files in os.walk(abs_d):
            dd[:] = [x for x in dd if not x.startswith(".")
                     and x not in ("__pycache__", ".venv", ".venv-tts", "node_modules", "vendor")]
            for f in files:
                if not f.endswith(".py"):
                    continue
                path = os.path.join(r, f)
                try:
                    with open(path, encoding="utf-8") as fh:
                        src = fh.read()
                except OSError:
                    continue
                for pat, kind, desc in PATTERNS:
                    matches = re.findall(pat, src)
                    if matches:
                        by_kind[kind] = by_kind.get(kind, 0) + len(matches)
                        out.append({
                            "path": os.path.relpath(path, ROOT),
                            "kind": kind,
                            "desc": desc,
                            "count": len(matches),
                        })
    return out


def find() -> dict[str, Any]:
    items = _scan(["server", "scripts", "autopilot", "underworld/server", "forge", "assurance"])
    by_kind: dict[str, int] = {}
    for it in items:
        by_kind[it["kind"]] = by_kind.get(it["kind"], 0) + it["count"]
    return {
        "generated_at": time.time(),
        "n_files_with_findings": len({it["path"] for it in items}),
        "by_kind": by_kind,
        "findings": items,
    }


def write_outputs(intel_dir: str) -> None:
    out = find()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "system-limitations.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    lines = [
        "# System Limitations",
        "",
        f"**Files with findings**: {out['n_files_with_findings']}",
        "",
        "## By kind",
        "| Kind | Count |",
        "|---|---|",
    ]
    for k, c in sorted(out["by_kind"].items(), key=lambda kv: -kv[1]):
        lines.append(f"| {k} | {c} |")
    lines += [
        "",
        "## Sample findings (top 40)",
        "| Kind | Path | Count |",
        "|---|---|---|",
    ]
    by_path: dict[str, dict] = {}
    for it in out["findings"]:
        key = (it["path"], it["kind"])
        by_path.setdefault(it["path"], {})[it["kind"]] = it["count"]
    seen = 0
    for path, kinds in sorted(by_path.items(), key=lambda kv: -sum(kv[1].values())):
        for k, c in kinds.items():
            lines.append(f"| {k} | `{path}` | {c} |")
            seen += 1
            if seen >= 40:
                break
        if seen >= 40:
            break
    with open(os.path.join(intel_dir, "system-limitations.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    write_outputs(intel)
    print("system-limitations written")
