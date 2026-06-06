"""JARVIS FEATURES — the Palantir feature catalogue + code-presence audit.

Compares Palantir's real feature set (Workshop widgets, layout primitives, Gotham/
Foundry/Apollo capabilities — sourced from the scraped Palantir docs) against THIS
codebase, and marks each implemented / partial / missing by scanning src/ + routes.
The missing ones are the build list; they flow into the UI builder so each gets a
window + a GLB/WebGL render.

stdlib only; never raises.
"""

from __future__ import annotations

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src")

# feature -> (plane, evidence regex in src/, render keywords for the GLB)
CATALOG = {
    # ── Workshop widgets ─────────────────────────────────────────────────────────
    "Object Table":      ("foundry", r"ObjectExplorer|ObjectSets|<table|DataState.*table", "data table console"),
    "Object View":       ("foundry", r"ObjectView|ObjectExplorer", "blueprint table"),
    "Property List":     ("foundry", r"PropertyList|KV\b|props\b", "ledger panel"),
    "Links / Graph":     ("gotham",  r"GraphCanvas|LineageGraph|Links\b|constellation", "network node graph"),
    "Map":               ("gotham",  r"Globe3D|GlobeMap|LiveTactical|Map\b", "globe console"),
    "Timeline":          ("gotham",  r"Timeline|GraphTimeline", "time crystal rig"),
    "Gantt":             ("apollo",  r"Gantt", "assembly conveyor"),
    "Chart XY":          ("foundry", r"Chart|histogram|sparkline", "chart panel"),
    "Pie Chart":         ("foundry", r"PieChart|pie\b", "pie gauge"),
    "Pivot Table":       ("foundry", r"Pivot|PivotTable", "pivot matrix"),
    "Metric Card":       ("jarvis",  r"StatTile|MetricCard", "metric tile"),
    "Markdown":          ("foundry", r"Markdown|markdown", "document scroll"),
    "Filter List":       ("foundry", r"FilterList|Filter\b|typeFilter", "filter rack"),
    "Object Dropdown":   ("foundry", r"select|Dropdown", "selector dial"),
    "Date/Time Picker":  ("foundry", r"DatePicker|datetime|Date.*Picker", "clock tower"),
    "Inline Action":     ("apollo",  r"InlineAction|apply_action|ActionApproval", "robot arm"),
    "Button Group":      ("jarvis",  r"Btn\b|ButtonGroup|button", "control deck"),
    "Comments":          ("gotham",  r"Comments|comment", "comment board"),
    "Tabs":              ("jarvis",  r"Tabs\b|tab\b", "tab rack"),
    "Media Uploader":    ("foundry", r"Uploader|upload|MediaUploader", "intake bay"),
    "Embedded Modules":  ("jarvis",  r"Embedded|iframe|EmbeddedModule", "module frame"),
    # ── Layout primitives ────────────────────────────────────────────────────────
    "Header (persistent)": ("jarvis", r"AppLayout|DomainRail|header", "command header"),
    "Pages":               ("jarvis", r"pageRegistry|PageShell", "page canvas"),
    "Sections (columns/rows/tabs)": ("jarvis", r"Section|Grid\b|PanelCard", "section frame"),
    "Overlays (drawers/modals)": ("jarvis", r"Drawer|Modal|Overlay|CommandPalette", "drawer panel"),
    # ── Gotham / Foundry / Apollo capabilities ───────────────────────────────────
    "Common Operating Picture": ("gotham", r"CommonOperating|COP\b|GlobalIntel", "command globe table"),
    "Targeting / decision workflow": ("gotham", r"Targeting|kill.?chain|ApprovalQueue|approvals", "targeting reticle"),
    "Sensor / connector tasking": ("gotham", r"Sensor|connector|dispatch|SourceCatalogue", "sensor array satellite"),
    "Ontology (objects/links/actions)": ("foundry", r"ontolog|ont_object|OntologyManager", "ontology core"),
    "Pipeline builder / lineage": ("foundry", r"Pipeline|Lineage|pipeline_builder", "pipeline rig"),
    "Workshop app builder": ("jarvis", r"Workshop|AutoConsole|ui_builder", "workshop bench"),
    "Apollo delivery / rollout": ("apollo", r"Apollo|Rollout|FleetHealth|release", "delivery rig"),
    "Vector / GraphRAG search": ("aip", r"VectorMemory|retrieve|semantic|GraphRAG", "vector lattice"),
    "Agent / AIP tool-use": ("aip", r"agent|aip_tools|JarvisAssistant", "neural mesh"),
}


def _src_blob() -> str:
    parts = []
    for base, _d, files in os.walk(SRC):
        if "node_modules" in base:
            continue
        for f in files:
            if f.endswith((".jsx", ".js", ".ts", ".tsx")):
                try:
                    parts.append(open(os.path.join(base, f), encoding="utf-8", errors="ignore").read())
                except OSError:
                    pass
    return "\n".join(parts)


def audit() -> dict:
    """Implemented / partial / missing per Palantir feature, with render targets."""
    blob = _src_blob()
    rows = []
    for feat, (plane, rx, kw) in CATALOG.items():
        hits = len(re.findall(rx, blob, re.I))
        status = "implemented" if hits >= 2 else "partial" if hits == 1 else "missing"
        rows.append({"feature": feat, "plane": plane, "status": status,
                     "evidence": hits, "render": kw})
    by = {"implemented": 0, "partial": 0, "missing": 0}
    for r in rows:
        by[r["status"]] += 1
    return {"total": len(rows), "summary": by,
            "missing": [r["feature"] for r in rows if r["status"] == "missing"],
            "partial": [r["feature"] for r in rows if r["status"] == "partial"],
            "features": sorted(rows, key=lambda r: (r["status"] != "missing", r["plane"], r["feature"])),
            "note": "Sourced from scraped Palantir docs; missing+partial are the build list."}
