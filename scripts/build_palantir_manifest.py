#!/usr/bin/env python3
"""Build the A-Z Palantir-replica manifest.

Scans the WHOLE app — every frontend page (src/lib/pageRegistry.js) and every
backend route (the live FastAPI app) — and produces docs/PALANTIR_MANIFEST.json:
for each surface, the plane it belongs to, the Palantir Workshop widgets it should
use, and the NEW render/GLB it needs for the holo HUD (kept separate from the
Underworld Tripo set). This is the "massive list" of what must be built.

Run:  python scripts/build_palantir_manifest.py
"""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# Palantir Workshop widget catalogue (from docs/PALANTIR_RESEARCH.md).
WIDGETS = {
    "display": ["Object Table", "Object List", "Object View", "Property List", "Links", "Object Set Title"],
    "viz": ["Chart XY", "Map", "Gantt", "Pie", "Pivot Table", "Timeline", "Metric Card", "Markdown"],
    "filter": ["Filter List", "Object Dropdown", "String Selector", "Date/Time Picker", "Input", "User Select"],
    "events": ["Button Group", "Inline Action", "Comments", "Tabs", "Media Uploader"],
}

# plane -> the Palantir module it replicates + the NEW hero render it needs.
PLANE_SPEC = {
    "jarvis":  {"module": "Operator / AIP cockpit", "render": "jarvis_core_avatar"},
    "foundry": {"module": "Integration + Ontology (Foundry)", "render": "foundry_pipeline_rig"},
    "gotham":  {"module": "Common Operating Picture (Gotham)", "render": "gotham_command_globe"},
    "apollo":  {"module": "Production / delivery (Apollo)", "render": "apollo_delivery_rig"},
    "aip":     {"module": "AI mesh (AIP)", "render": "aip_neural_mesh"},
    "audit":   {"module": "Governance / lineage", "render": "audit_ledger_vault"},
}

# keyword -> Palantir widget hints, so each page gets a concrete widget set.
HINTS = [
    (r"graph|network|link|constellation|plane", ["Object View", "Links", "Map"]),
    (r"timeline|temporal|time|history|replay", ["Timeline", "Gantt"]),
    (r"map|geo|globe|world|earthquake|weather|tactical", ["Map", "Metric Card"]),
    (r"object|entity|ontolog|explorer|catalog|set", ["Object Table", "Object List", "Property List"]),
    (r"metric|status|overview|command|dashboard|intel|health", ["Metric Card", "Chart XY"]),
    (r"pipeline|monitor|lineage|flow|ingest", ["Gantt", "Object Table"]),
    (r"approval|action|governance|policy|agent", ["Inline Action", "Button Group", "Comments"]),
    (r"search|discover|vector|retriev|semantic", ["Filter List", "String Selector", "Object List"]),
    (r"fleet|rollout|release|apollo|desired", ["Metric Card", "Button Group", "Timeline"]),
    (r"report|audit|ledger", ["Markdown", "Object Table"]),
]


def widgets_for(name: str, label: str) -> list[str]:
    hay = f"{name} {label}".lower()
    out: list[str] = []
    for rx, ws in HINTS:
        if re.search(rx, hay):
            out += ws
    return sorted(set(out)) or ["Object View", "Metric Card"]


def scan_pages() -> list[dict]:
    path = os.path.join(ROOT, "src", "lib", "pageRegistry.js")
    txt = open(path, encoding="utf-8").read()
    pages = []
    # name + (optional) label + group on the same registry line block
    for m in re.finditer(r'name:\s*"([^"]+)"[^}]*?label:\s*"([^"]+)"[^}]*?group:\s*"([^"]+)"', txt, re.S):
        name, label, group = m.group(1), m.group(2), m.group(3)
        pages.append({"surface": name, "label": label, "plane": group,
                      "widgets": widgets_for(name, label),
                      "render": PLANE_SPEC.get(group, {}).get("render")})
    return pages


def scan_routes() -> list[str]:
    try:
        from server.main import create_app
        app = create_app()
        return sorted({getattr(r, "path", "") for r in app.routes if getattr(r, "path", "").startswith("/v1")})
    except Exception as e:  # noqa: BLE001
        return [f"(route scan failed: {e})"]


def main() -> None:
    pages = scan_pages()
    routes = scan_routes()
    planes = {}
    for p in pages:
        planes.setdefault(p["plane"], []).append(p["surface"])

    # NEW renders required for the Palantir replica (distinct from Underworld set).
    renders = [{"name": s["render"], "plane": pl, "module": s["module"],
                "namespace": "public/models/palantir/", "status": "to_generate",
                "via": "tripo_client (needs TRIPO_API_KEY)"}
               for pl, s in PLANE_SPEC.items()]

    manifest = {
        "thesis": "Integration -> Ontology -> Application -> Production. If it is not in production, it is not adding value.",
        "counts": {"pages": len(pages), "planes": len(planes),
                   "backend_routes": len([r for r in routes if r.startswith('/v1')]),
                   "renders_to_create": len(renders)},
        "planes": {pl: {"module": PLANE_SPEC.get(pl, {}).get("module"),
                        "render": PLANE_SPEC.get(pl, {}).get("render"),
                        "surfaces": s} for pl, s in sorted(planes.items())},
        "pages": sorted(pages, key=lambda x: (x["plane"], x["surface"])),
        "workshop_widgets": WIDGETS,
        "backend_routes": routes,
        "renders_to_create": renders,
        "note": ("Underworld Tripo GLBs are reserved for Underworld. Palantir replica "
                 "renders are NEW, generated into public/models/palantir/."),
    }
    out = os.path.join(ROOT, "docs", "PALANTIR_MANIFEST.json")
    json.dump(manifest, open(out, "w", encoding="utf-8"), indent=2)
    c = manifest["counts"]
    print(f"manifest: {c['pages']} pages · {c['planes']} planes · "
          f"{c['backend_routes']} routes · {c['renders_to_create']} renders -> {out}")


if __name__ == "__main__":
    main()
