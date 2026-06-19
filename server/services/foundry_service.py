"""Foundry pipelines — YAML reader for world_os/foundry_pipelines/pipeline_templates."""
from __future__ import annotations

import os
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PIPELINES_DIR = os.path.join(ROOT, "world_os", "foundry_pipelines", "pipeline_templates")


def list_pipelines() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not os.path.isdir(PIPELINES_DIR):
        return out
    for f in sorted(os.listdir(PIPELINES_DIR)):
        if not f.endswith((".yaml", ".yml")):
            continue
        path = os.path.join(PIPELINES_DIR, f)
        try:
            st = os.stat(path)
            with open(path) as fh:
                content = fh.read()
            # extract `name:` line cheaply (no yaml dep required)
            name = f.rsplit(".", 1)[0]
            for line in content.splitlines()[:5]:
                if line.lstrip().startswith("name:"):
                    name = line.split(":", 1)[1].strip().strip("'\"")
                    break
            out.append({"file": f, "name": name, "size": st.st_size,
                        "mtime": st.st_mtime, "preview": content[:280]})
        except OSError:
            continue
    return out


def get_lineage(run_id: str) -> dict[str, Any]:
    # Stub: no real lineage runtime yet — just return a placeholder shape
    # matching the OpenLineage envelope at
    # world_os/foundry_runtime/lineage/openlineage_event_contract.json.
    return {"run_id": run_id, "status": "not_implemented",
            "note": "Foundry runtime not active — schemas in world_os/foundry_pipelines/ only."}
