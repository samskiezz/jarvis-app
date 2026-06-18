"""Builds an import graph across server/ + scripts/ + assurance/ + autopilot/
+ underworld/ + forge/. Reports cross-subsystem edges."""
from __future__ import annotations

import ast
import json
import os
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SCAN_DIRS = ["server", "scripts", "assurance", "autopilot", "underworld/server", "forge", "world_os"]


def _list_py(dirs: list[str]) -> list[str]:
    out: list[str] = []
    for d in dirs:
        abs_d = os.path.join(ROOT, d)
        if not os.path.isdir(abs_d):
            continue
        for r, dd, files in os.walk(abs_d):
            dd[:] = [x for x in dd if not x.startswith(".") and x not in (
                "__pycache__", "node_modules", ".venv", ".venv-tts", "vendor"
            )]
            for f in files:
                if f.endswith(".py"):
                    out.append(os.path.join(r, f))
    return out


def _module_imports(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
    except OSError:
        return []
    try:
        tree = ast.parse(src, filename=path)
    except SyntaxError:
        return []
    out: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for n in node.names:
                out.append(n.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.append(node.module)
    return out


def _module_name(path: str) -> str:
    rel = os.path.relpath(path, ROOT)
    rel = rel.replace(os.sep, ".").rsplit(".py", 1)[0]
    return rel


def _top(name: str) -> str:
    return name.split(".", 1)[0]


def build() -> dict[str, Any]:
    files = _list_py(SCAN_DIRS)
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, str]] = []
    edge_set: set[tuple[str, str]] = set()
    for f in files:
        mod = _module_name(f)
        top = _top(mod)
        nodes.setdefault(mod, {"top": top, "imports_n": 0})
        imports = _module_imports(f)
        nodes[mod]["imports_n"] = len(imports)
        for imp in imports:
            imp_top = _top(imp)
            if imp_top in ("os", "sys", "json", "re", "time", "typing", "collections",
                           "pathlib", "asyncio", "threading", "logging", "subprocess",
                           "ast", "uuid", "argparse", "hashlib", "datetime", "math",
                           "random", "string", "io", "tempfile", "functools",
                           "dataclasses", "abc", "enum", "contextlib", "fastapi",
                           "pydantic", "starlette", "uvicorn", "httpx", "requests",
                           "boto3", "sqlite3", "sqlalchemy", "numpy", "pandas",
                           "torch", "transformers", "ollama"):
                continue
            if (top, imp_top) in edge_set:
                continue
            edge_set.add((top, imp_top))
            edges.append({"from": top, "to": imp_top})
    # Cross-subsystem summary
    by_top: dict[str, int] = {}
    for mod, info in nodes.items():
        by_top[info["top"]] = by_top.get(info["top"], 0) + 1
    out_edges: dict[str, set[str]] = {}
    in_edges: dict[str, set[str]] = {}
    for e in edges:
        out_edges.setdefault(e["from"], set()).add(e["to"])
        in_edges.setdefault(e["to"], set()).add(e["from"])
    summary = []
    for top in sorted(by_top):
        summary.append({
            "subsystem": top,
            "modules": by_top[top],
            "outgoing_n": len(out_edges.get(top, set())),
            "incoming_n": len(in_edges.get(top, set())),
            "outgoing": sorted(out_edges.get(top, set())),
            "incoming": sorted(in_edges.get(top, set())),
        })
    return {
        "generated_at": time.time(),
        "n_modules": len(nodes),
        "n_edges": len(edges),
        "summary": summary,
    }


def write_outputs(intel_dir: str) -> None:
    out = build()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "integration-graph.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    lines = [
        "# Integration Graph",
        "",
        f"**Modules**: {out['n_modules']}",
        f"**Cross-subsystem edges**: {out['n_edges']}",
        "",
        "## Subsystems (modules + edges)",
        "| Subsystem | Modules | Out-edges | In-edges |",
        "|---|---|---|---|",
    ]
    for s in out["summary"]:
        lines.append(
            f"| `{s['subsystem']}` | {s['modules']} | "
            f"{s['outgoing_n']} ({', '.join(s['outgoing'][:5])}) | "
            f"{s['incoming_n']} ({', '.join(s['incoming'][:5])}) |"
        )
    with open(os.path.join(intel_dir, "integration-graph.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    write_outputs(intel)
    print(f"integration-graph written to {intel}")
