"""JARVIS UI BUILDER — the self-building interface.

As the platform scrapes + ingests, new object types and data appear in the
ontology. This generates a UI SPEC from the LIVE data: for every significant object
type it emits a "window" (module) with the right Palantir widgets, the interaction
buttons it needs, and a 3D render auto-assigned from the model library (or marked a
gap for Tripo to generate). The frontend renders this spec dynamically, so the
interface GROWS itself every time the data grows — no hand-built page per type.

Regenerated on every autobuild. stdlib + reuses jarvis_assets for GLB matching.
Never raises.
"""

from __future__ import annotations

import os
import re
import sqlite3
import time

try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        return os.environ.get("BRAIN_DB", "server/data/brain.db")

try:
    from . import jarvis_assets as assets
except Exception:  # noqa: BLE001
    assets = None  # type: ignore

# object type -> (plane, widgets, interaction buttons, GLB search keywords)
TYPE_SPEC = {
    "DomainSubject":        ("foundry", ["Object Table", "Links", "Metric Card"], ["Open", "Graph", "Search"], "crystal brain core"),
    "DataSource":           ("foundry", ["Object Table", "Filter List"], ["Open", "Fetch", "Search"], "server rack network node"),
    "Document":             ("foundry", ["Object Table", "Markdown", "Filter List"], ["Read", "Search", "Export"], "blueprint table book archive"),
    "AcquisitionPoint":     ("foundry", ["Object Table", "Map"], ["Open", "Task", "Map"], "satellite radio tower antenna"),
    "Topic":                ("gotham",  ["Object List", "Links"], ["Open", "Graph"], "light orb hologram crystal"),
    "EarthquakeEvent":      ("gotham",  ["Map", "Timeline", "Metric Card"], ["Map", "Timeline", "Alert"], "seismic energy core reactor"),
    "SpeciesOccurrence":    ("gotham",  ["Map", "Object Table"], ["Map", "Open"], "dna helix bioreactor"),
    "Vulnerability":        ("gotham",  ["Object Table", "Metric Card"], ["Open", "Alert", "Triage"], "shield vault"),
    "ScientificPublication":("gotham",  ["Object Table", "Markdown"], ["Read", "Search"], "blueprint table book"),
    "Person":               ("gotham",  ["Object View", "Links"], ["Open", "Graph"], "bust statue"),
    "Organisation":         ("gotham",  ["Object View", "Links"], ["Open", "Graph"], "guild crest plaque"),
    "Place":                ("gotham",  ["Map", "Object View"], ["Map", "Open"], "town gate watchtower"),
    "Action":               ("apollo",  ["Inline Action", "Button Group"], ["Run", "Approve"], "industrial robot arm"),
    "Workflow":             ("apollo",  ["Gantt", "Timeline"], ["Run", "Schedule"], "assembly line conveyor"),
    "ModelOutput":          ("aip",     ["Object View", "Metric Card"], ["Open", "Explain"], "quantum computer gpu pod"),
    "AuditRecord":          ("audit",   ["Object Table", "Timeline"], ["Open", "Verify"], "ledger vault"),
}

_DEFAULT = ("gotham", ["Object Table", "Metric Card"], ["Open", "Search"], "data core")


def _humanise(t: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", " ", t).strip()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_db_path(), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _assign_render(keywords: str) -> dict:
    """Auto-source a GLB for a type: best match in the library, else a Tripo gap."""
    if assets is not None:
        hits = assets.search_library(keywords, limit=1)
        if hits:
            return {"model": f"/models/{hits[0]}.glb", "source": "library", "name": hits[0]}
    return {"model": None, "source": "gap", "generate": keywords}


def build_spec(*, min_count: int = 1) -> dict:
    """Generate the live UI spec from current ontology data. Never raises."""
    modules = []
    try:
        c = _conn()
        try:
            rows = c.execute(
                "SELECT type, COUNT(*) n FROM ont_object GROUP BY type ORDER BY n DESC"
            ).fetchall()
        finally:
            c.close()
    except sqlite3.Error:
        rows = []

    for r in rows:
        t, n = r["type"], r["n"]
        if not t or n < min_count:
            continue
        plane, widgets, buttons, kw = TYPE_SPEC.get(t, _DEFAULT)
        modules.append({
            "id": f"win_{t.lower()}",
            "title": _humanise(t),
            "object_type": t,
            "plane": plane,
            "count": n,
            "widgets": widgets,
            "buttons": buttons,
            "render": _assign_render(kw),
            "query": f"/v1/jarvis/ontology/objects?type={t}",
        })

    # group by plane so the frontend can lay windows out under each plane
    planes: dict = {}
    for m in modules:
        planes.setdefault(m["plane"], []).append(m["id"])

    return {
        "generated_ts": int(time.time() * 1000),
        "object_types": len(modules),
        "total_objects": sum(m["count"] for m in modules),
        "renders_assigned": sum(1 for m in modules if m["render"]["model"]),
        "render_gaps": [m["render"].get("generate") for m in modules if not m["render"]["model"]],
        "planes": planes,
        "modules": modules,
        "note": "Self-built from live ontology data; regenerated on every autobuild as data grows.",
    }


_CACHE = {"spec": None, "ts": 0}


def spec(*, ttl: float = 30.0) -> dict:
    """Cached UI spec (rebuilds at most every ttl seconds)."""
    now = time.time()
    if _CACHE["spec"] is None or now - _CACHE["ts"] > ttl:
        _CACHE["spec"] = build_spec()
        _CACHE["ts"] = now
    return _CACHE["spec"]


def invalidate() -> None:
    _CACHE["ts"] = 0
