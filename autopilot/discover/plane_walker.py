"""Walks the 11 architecture plane directories and inventories each."""
from __future__ import annotations

import json
import os
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PLANES = [
    "control-plane", "data-plane", "ontology-plane", "aip-plane",
    "event-plane", "observability-plane", "security-plane",
    "entity-resolution-plane", "simulation-plane", "workflow-plane",
    "action-plane",
]


def _classify_plane(plane_dir: str) -> dict[str, Any]:
    """Inspect a plane dir: count files, find README, look for entrypoints."""
    abs_dir = os.path.join(ROOT, plane_dir)
    if not os.path.isdir(abs_dir):
        return {"exists": False}
    n_files = 0
    n_py = 0
    n_yaml = 0
    n_sql = 0
    n_md = 0
    has_readme = False
    has_dockerfile = False
    has_migrations = False
    entry_files: list[str] = []
    for r, dirs, files in os.walk(abs_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("__pycache__", "node_modules")]
        for f in files:
            n_files += 1
            lf = f.lower()
            if lf == "readme.md":
                has_readme = True
            if lf in ("dockerfile",) or lf.startswith("dockerfile."):
                has_dockerfile = True
            if "migration" in r.lower():
                has_migrations = True
            ext = os.path.splitext(f)[1].lower()
            if ext == ".py":
                n_py += 1
                if f in ("main.py", "__main__.py", "cli.py", "app.py", "server.py"):
                    rel = os.path.relpath(os.path.join(r, f), ROOT)
                    entry_files.append(rel)
            elif ext in (".yaml", ".yml"):
                n_yaml += 1
            elif ext == ".sql":
                n_sql += 1
            elif ext == ".md":
                n_md += 1
    # Status: ALIVE if has Python entries, DORMANT if only specs (yaml/sql), EMPTY otherwise
    if entry_files or n_py >= 3:
        status = "alive"
    elif n_yaml + n_sql > 0:
        status = "dormant_scaffold"
    elif n_files > 0:
        status = "dormant_docs"
    else:
        status = "empty"
    return {
        "exists": True,
        "n_files": n_files, "n_py": n_py, "n_yaml": n_yaml, "n_sql": n_sql, "n_md": n_md,
        "has_readme": has_readme,
        "has_dockerfile": has_dockerfile,
        "has_migrations": has_migrations,
        "entry_files": entry_files,
        "status": status,
    }


def walk() -> dict[str, Any]:
    out: dict[str, Any] = {"planes": {}, "n_planes": len(PLANES), "n_alive": 0, "n_dormant": 0}
    for p in PLANES:
        info = _classify_plane(p)
        out["planes"][p] = info
        if info.get("exists"):
            if info.get("status") == "alive":
                out["n_alive"] += 1
            elif info["status"].startswith("dormant"):
                out["n_dormant"] += 1
    # also include world_os/ as a meta-plane
    wo = _classify_plane("world_os")
    if wo.get("exists"):
        out["world_os"] = wo
    return out


def write_outputs(intel_dir: str) -> None:
    out = walk()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "plane-map.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    lines = [
        "# Architecture Planes",
        "",
        f"**Total**: {out['n_planes']} planes ({out['n_alive']} alive, {out['n_dormant']} dormant)",
        "",
        "| Plane | Status | Files | .py | .yaml | .sql | .md | README | Migrations | Entry |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for name, info in out["planes"].items():
        if not info.get("exists"):
            lines.append(f"| `{name}/` | **MISSING** | — | — | — | — | — | — | — | — |")
            continue
        entry = ", ".join(info.get("entry_files", [])[:2]) or "—"
        lines.append(
            f"| `{name}/` | {info['status']} | {info['n_files']} | {info['n_py']} | "
            f"{info['n_yaml']} | {info['n_sql']} | {info['n_md']} | "
            f"{'✓' if info['has_readme'] else '—'} | "
            f"{'✓' if info['has_migrations'] else '—'} | {entry} |"
        )
    if "world_os" in out:
        wo = out["world_os"]
        lines.append("")
        lines.append("## world_os/ (meta)")
        lines.append(f"- {wo['n_files']} files, {wo['n_py']} py, {wo['n_yaml']} yaml, {wo['n_sql']} sql")
    with open(os.path.join(intel_dir, "plane-map.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    write_outputs(intel)
    print(f"plane-map written to {intel}")
