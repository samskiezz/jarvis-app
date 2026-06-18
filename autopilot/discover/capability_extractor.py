"""Extracts FastAPI route paths as capabilities with risk-class guesses."""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

VERB_PATTERNS = [
    (re.compile(r"@router\.(get|post|put|patch|delete|head|options)\(\s*[\"']([^\"']+)[\"']"),
     None),
]


def _classify_risk(method: str, path: str) -> str:
    m = method.lower()
    pl = path.lower()
    if m == "get":
        return "read_only"
    if any(x in pl for x in ("delete", "purge", "destroy", "dispose", "wipe")):
        return "destructive"
    if any(x in pl for x in ("approve", "release", "deploy", "publish")):
        return "deploy"
    if any(x in pl for x in ("send", "notify", "external", "webhook")):
        return "external_write"
    if m in ("post", "put", "patch"):
        return "safe_write"
    if m == "delete":
        return "destructive"
    return "safe_write"


def _scan_file(path: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
    except OSError:
        return out
    # Find prefix in APIRouter declaration
    m = re.search(r"APIRouter\([^)]*prefix\s*=\s*[\"']([^\"']+)[\"']", src)
    prefix = m.group(1) if m else ""
    # Find decorators
    for m in re.finditer(r"@router\.(get|post|put|patch|delete|head|options)\(\s*[\"']([^\"']+)[\"']", src):
        method = m.group(1).upper()
        sub = m.group(2)
        full_path = (prefix.rstrip("/") + "/" + sub.lstrip("/")) if prefix else sub
        out.append({
            "method": method,
            "path": full_path,
            "file": os.path.relpath(path, ROOT),
            "risk": _classify_risk(method, full_path),
        })
    return out


def extract() -> dict[str, Any]:
    routes_dir = os.path.join(ROOT, "server", "routes")
    out: dict[str, Any] = {"generated_at": time.time(), "capabilities": [], "by_risk": {}}
    if not os.path.isdir(routes_dir):
        return out
    for f in sorted(os.listdir(routes_dir)):
        if not f.endswith(".py") or f.startswith("_"):
            continue
        caps = _scan_file(os.path.join(routes_dir, f))
        out["capabilities"].extend(caps)
    for c in out["capabilities"]:
        r = c["risk"]
        out["by_risk"][r] = out["by_risk"].get(r, 0) + 1
    return out


def write_outputs(intel_dir: str) -> None:
    out = extract()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "capability-registry.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    lines = [
        "# Capability Registry",
        "",
        f"**Total endpoints**: {len(out['capabilities'])}",
        "",
        "## By risk class",
        "| Risk | Count |",
        "|---|---|",
    ]
    for r, c in sorted(out["by_risk"].items(), key=lambda kv: -kv[1]):
        lines.append(f"| {r} | {c} |")
    lines += [
        "",
        "## Sample (50 of total)",
        "| Method | Path | Risk | File |",
        "|---|---|---|---|",
    ]
    for c in out["capabilities"][:50]:
        lines.append(f"| {c['method']} | `{c['path']}` | {c['risk']} | `{c['file']}` |")
    with open(os.path.join(intel_dir, "capability-registry.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    write_outputs(intel)
    print(f"capability-registry written to {intel}")
