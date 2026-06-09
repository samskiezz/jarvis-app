"""ASSET MAP — deterministic ontology-domain -> real GLB mapping for the JARVIS universe.

PARALLEL, non-conflicting asset pipeline. Reads (never writes) the paid brain.db ontology
(server/data/brain.db, ont_object) and the two real GLB sources already on disk:

  * CURATED  : jarvis_assets/*.glb            served at /asset/<file>   (48 hero bodies)
  * GENERATED: server/data/media/*.glb (==media.db kind='glb', 1,638)  served at /media/<file>

It produces a stable manifest so the universe renders the 16 ontology domains (planets) and
their entities (moons/satellites) from REAL GLBs, with CORRECT, deterministic assignment
(FEATURES.md §1: "each object mapped to the RIGHT GLB ... not random"). No generation, no keys,
no network — pure indexing over what exists. Generation (Asset Forge / gpt-image-2 -> Tripo)
lives in media_gen.py and is only used to FILL GAPS when a TRIPO_API_KEY is present.

CLI:
  python -m server.services.asset_map build          # write server/data/asset_map.json
  python -m server.services.asset_map domain Sensor  # show one domain's mapping
  python -m server.services.asset_map verify         # report coverage / missing files
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BRAIN_DB = os.path.join(ROOT, "server", "data", "brain.db")
MEDIA_DB = os.path.join(ROOT, "server", "data", "media.db")
MEDIA_DIR = os.path.join(ROOT, "server", "data", "media")
ASSET_DIR = os.path.join(ROOT, "jarvis_assets")
OUT = os.path.join(ROOT, "server", "data", "asset_map.json")

# The 16 ontology domains = the major planets, with real counts (FEATURES.md §1) for log-sizing.
DOMAIN_COUNTS = {
    "Measurement": 111558, "DataSource": 92000, "Document": 34331, "DomainSubject": 10000,
    "Topic": 7031, "SpeciesOccurrence": 3136, "ScientificPublication": 3100, "Vulnerability": 1260,
    "AcquisitionPoint": 1000, "Place": 544, "Asset": 430, "Concept": 309, "EarthquakeEvent": 269,
    "Event": 86, "Sensor": 25, "AppPage": 17,
}

# HERO planet: a curated /asset GLB that best represents the domain (deterministic, hand-picked
# from the 48 curated bodies in FEATURES.md §1). file -> served at /asset/<file>.
DOMAIN_HERO = {
    "Measurement":           "jarvis_analytics_observatory_hero_globe.glb",
    "DataSource":            "jarvis_command_atrium_data_orb.glb",
    "Document":              "jarvis_docvault_hero_document_book.glb",
    "DomainSubject":         "jarvis_ai_core_reasoning_orb.glb",
    "Topic":                 "jarvis_kit_data_orb.glb",
    "SpeciesOccurrence":     "jarvis_simulation_branching_tree.glb",
    "ScientificPublication": "jarvis_document_vault_book.glb",
    "Vulnerability":         "jarvis_security_core_shield.glb",
    "AcquisitionPoint":      "jarvis_intel_graph_primary_entity_ring.glb",
    "Place":                 "jarvis_world_control_holo_earth.glb",
    "Asset":                 "jarvis_war_room_mission_table.glb",
    "Concept":               "jarvis_intel_graph_constellation_core.glb",
    "EarthquakeEvent":       "jarvis_world_control_earth_graticule.glb",
    "Event":                 "jarvis_world_control_equatorial_ring.glb",
    "Sensor":                "jarvis_kit_holo_shield.glb",
    "AppPage":               "jarvis_holo_panel_frame.glb",
}

# Keyword priorities to pick the GENERATED-GLB pool for each domain's moons/entities. Ordered:
# earlier keywords are stronger matches. Stems are matched against the cleaned GLB filename.
DOMAIN_KEYWORDS = {
    "Measurement":           ["meter", "gauge", "instrument", "sensor", "monitor", "scale", "dial"],
    "DataSource":            ["server", "rack", "dish", "antenna", "satellite", "data", "feed", "stack"],
    "Document":              ["book", "scroll", "document", "archive", "library", "ledger", "tome"],
    "DomainSubject":         ["brain", "neuron", "crystal", "orb", "node", "knowledge"],
    "Topic":                 ["crystal", "orb", "cluster", "node", "shard"],
    "SpeciesOccurrence":     ["plant", "tree", "leaf", "mushroom", "coral", "fish", "animal", "fungus", "flower"],
    "ScientificPublication": ["book", "scroll", "paper", "journal", "tome", "document"],
    "Vulnerability":         ["shield", "lock", "vault", "guard", "barrier", "alarm"],
    "AcquisitionPoint":      ["dish", "antenna", "satellite", "node", "beacon", "tower", "target"],
    "Place":                 ["city", "tower", "building", "house", "dwelling", "map", "place"],
    "Asset":                 ["reactor", "power_plant", "facility", "rig", "turbine", "generator", "machine", "tank", "plant"],
    "Concept":               ["crystal", "node", "graph", "orb", "shard", "bulb"],
    "EarthquakeEvent":       ["volcano", "fault", "rock", "fossil", "crater", "seismic"],
    "Event":                 ["flag", "beacon", "banner", "marker", "pin", "post"],
    "Sensor":                ["sensor", "antenna", "dish", "node", "monitor", "gauge", "satellite"],
    "AppPage":               ["screen", "monitor", "panel", "display", "board", "wall"],
}

POOL_SIZE = 24  # max GLBs kept per domain pool (moons cycle through these deterministically)


def _conn(path: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=15)


def _generated_glbs() -> list[str]:
    """All generated GLB filenames from media.db (served at /media/<file>)."""
    try:
        c = _conn(MEDIA_DB)
        rows = c.execute("SELECT file FROM media WHERE kind='glb' ORDER BY id").fetchall()
        c.close()
        return [r[0] for r in rows]
    except Exception:  # noqa: BLE001
        # fall back to a directory scan if media.db is unavailable
        return sorted(f for f in os.listdir(MEDIA_DIR) if f.endswith(".glb")) if os.path.isdir(MEDIA_DIR) else []


def _stem(fname: str) -> str:
    """Cleaned, lowercase keyword-search surface of a generated GLB filename."""
    s = fname.lower()
    for pre in ("gen_uw_interior__", "gen_uw_urban__", "gen_uw_era__", "gen_uw_sky__",
                "gen_uw__", "gen_tripo__", "gen_x__", "gen_"):
        if s.startswith(pre):
            s = s[len(pre):]
            break
    return s[:-4] if s.endswith(".glb") else s


def _pool_for(domain: str, glbs: list[str], stems: dict[str, str]) -> list[str]:
    """Rank generated GLBs for a domain by keyword priority; deterministic, dedup, capped."""
    kws = DOMAIN_KEYWORDS.get(domain, [])
    scored: list[tuple[int, str, str]] = []
    for f in glbs:
        st = stems[f]
        best = None
        for i, kw in enumerate(kws):
            if kw in st:
                best = i
                break
        if best is not None:
            scored.append((best, st, f))
    scored.sort(key=lambda t: (t[0], t[1]))  # priority, then alpha (stable)
    return [f for _, _, f in scored[:POOL_SIZE]]


def build() -> dict:
    glbs = _generated_glbs()
    stems = {f: _stem(f) for f in glbs}
    have_asset = set(os.listdir(ASSET_DIR)) if os.path.isdir(ASSET_DIR) else set()

    domains = {}
    used_total = 0
    for dom, count in DOMAIN_COUNTS.items():
        hero = DOMAIN_HERO.get(dom, "")
        pool = _pool_for(dom, glbs, stems)
        used_total += len(pool)
        domains[dom] = {
            "count": count,
            # hero planet body (curated) — served at /asset/<file>
            "hero_glb": hero,
            "hero_url": f"/asset/{hero}" if hero else "",
            "hero_present": hero in have_asset,
            # moon / sub-entity pool (generated) — served at /media/<file>
            "pool": pool,
            "pool_urls": [f"/media/{f}" for f in pool],
        }

    manifest = {
        "version": 1,
        "generated_by": "server/services/asset_map.py",
        "asset_route": "/asset/<file>",
        "media_route": "/media/<file>",
        "counts": {
            "curated_glbs": len([f for f in have_asset if f.endswith(".glb")]),
            "generated_glbs": len(glbs),
            "domains": len(domains),
            "pool_glbs_assigned": used_total,
        },
        "domains": domains,
    }
    with open(OUT, "w") as fh:
        json.dump(manifest, fh, indent=2)
    return manifest


def glb_for_entity(domain: str, entity_id: str, manifest: dict | None = None) -> str:
    """Deterministically pick ONE generated GLB url for a specific entity (stable across runs).

    Same (domain, entity_id) always returns the same GLB -> moons never flicker / reshuffle.
    """
    m = manifest or (json.load(open(OUT)) if os.path.exists(OUT) else build())
    d = m["domains"].get(domain)
    if not d or not d["pool_urls"]:
        return d["hero_url"] if d else ""
    h = int(hashlib.sha1(f"{domain}:{entity_id}".encode()).hexdigest(), 16)
    return d["pool_urls"][h % len(d["pool_urls"])]


def verify() -> dict:
    m = build()
    missing_hero = [d for d, v in m["domains"].items() if v["hero_glb"] and not v["hero_present"]]
    empty_pool = [d for d, v in m["domains"].items() if not v["pool"]]
    missing_files = []
    for d, v in m["domains"].items():
        for f in v["pool"]:
            if not os.path.exists(os.path.join(MEDIA_DIR, f)):
                missing_files.append(f)
    return {
        "counts": m["counts"],
        "missing_hero_assets": missing_hero,
        "domains_with_empty_pool": empty_pool,
        "pool_files_missing_on_disk": missing_files[:20],
        "pool_files_missing_count": len(missing_files),
    }


if __name__ == "__main__":
    import sys
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "domain" and len(sys.argv) > 2:
        m = build()
        print(json.dumps(m["domains"].get(sys.argv[2], {"error": "unknown domain"}), indent=2))
    elif cmd == "verify":
        print(json.dumps(verify(), indent=2))
    else:
        m = build()
        print(json.dumps(m["counts"], indent=2))
        print("WROTE " + OUT)
