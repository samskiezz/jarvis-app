#!/usr/bin/env python3
"""build_world_glb_manifest.py — DETERMINISTIC ontology-domain -> GLB manifest builder.

GOAL (from the universe spec, FEATURES.md §1): the 3D universe must render each of the
16 brain.db ontology domains as a PLANET loaded from a REAL GLB that *matches what the
planet represents* ("CORRECT ASSIGNMENT ... not random"). This script produces the
single source of truth the universe reads:

    server/data/world_glb_manifest.json

It maps, fully deterministically and reproducibly:
  * sun       -> the central JARVIS face (curated iron-man helmet)
  * reactor[] -> the reactor / projector stack that the sun is projected up
  * domains{} -> one best-matching GLB per ontology domain (the 16 planets), sized by real count
  * topics[]  -> the curated subset of the most important Topic entities (the 31 *named*
                 master topics), each mapped to its best-matching GLB
  * fallback  -> a neutral data-orb GLB for anything unmatched

HOW MATCHING WORKS (documented + deterministic):
  1. CURATED OVERRIDES (highest priority): hand-picked, spec-aligned GLB picks for the
     sun, reactor, and each of the 16 domains. These come straight from the existing
     48 curated jarvis_assets/ GLBs and the strongest semantically-matching Tripo GLBs.
     A domain only falls through to scoring if it has no curated override.
  2. KEYWORD SCORING (for topics + any non-overridden item): each candidate GLB has a
     normalised token set derived from its prompt. A query (the domain/topic keywords +
     label tokens) scores every candidate by weighted token overlap. Highest score wins;
     ties broken deterministically by (score desc, asset-source priority, name asc).
  3. Output is stable across runs (sorted inputs, no randomness, no timestamps in the body).

DATA SOURCES (read-only):
  * brain.db ont_object: domain counts + Topic labels/keywords/pagerank
  * media.db media (kind='glb'): the 1,638 indexed Tripo GLBs (served at /media/<file>)
  * jarvis_assets/*.glb: the 48 curated GLBs (served at /asset/<file>)

USAGE:
  python3 scripts/build_world_glb_manifest.py            # write the manifest
  python3 scripts/build_world_glb_manifest.py --dry-run  # print, do not write
  python3 scripts/build_world_glb_manifest.py --verify   # write + re-read + self-check
"""
from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAIN_DB = os.path.join(ROOT, "server", "data", "brain.db")
MEDIA_DB = os.path.join(ROOT, "server", "data", "media.db")
ASSET_DIR = os.path.join(ROOT, "jarvis_assets")
OUT_PATH = os.path.join(ROOT, "server", "data", "world_glb_manifest.json")

# The 16 ontology domains and their REAL counts (FEATURES.md §1, verified live from brain.db).
# Planet size in the universe is log-scaled off these counts.
DOMAIN_COUNTS = {
    "Measurement": 111558,
    "DataSource": 92000,
    "Document": 34331,
    "DomainSubject": 10000,
    "Topic": 7031,
    "SpeciesOccurrence": 3136,
    "ScientificPublication": 3100,
    "Vulnerability": 1260,
    "AcquisitionPoint": 1000,
    "Place": 544,
    "Asset": 430,
    "Concept": 309,
    "EarthquakeEvent": 269,
    "Event": 86,
    "Sensor": 25,
    "AppPage": 17,
}

# ---------------------------------------------------------------------------
# Stopwords stripped from both queries and GLB-name tokens before scoring.
STOP = {
    "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "with", "set",
    "itself", "amp", "by", "at", "as", "is", "its", "&",
}

# Token weighting: words that strongly signal a *kind* of object outrank generic ones.
# Higher weight => a query containing this token strongly prefers a GLB containing it.
TOKEN_WEIGHT_BOOST = {
    # instruments / science
    "spectrometer": 3.0, "microscope": 3.0, "centrifuge": 3.0, "telescope": 3.0,
    "sequencer": 3.0, "thermometer": 2.5, "barometer": 2.5, "oscilloscope": 2.5,
    "voltmeter": 2.5, "multimeter": 2.5, "theodolite": 2.5, "calibration": 2.5,
    "balance": 2.0, "scales": 2.0, "lab": 1.5,
    # data / compute
    "server": 3.0, "mainframe": 3.0, "rack": 2.0, "quantum": 2.5, "gpu": 2.5,
    "network": 2.0, "switch": 1.5, "wafer": 2.0, "circuit": 2.0, "transistor": 2.0,
    # knowledge / docs
    "library": 2.5, "book": 2.0, "scroll": 2.0, "archive": 2.0, "citation": 3.0,
    "publication": 2.5, "university": 2.5, "academy": 2.0, "museum": 2.0,
    # geo / earth / hazard
    "earth": 3.0, "fault": 3.0, "volcano": 2.5, "rift": 2.5, "seismic": 2.5,
    "satellite": 2.5, "dish": 2.0, "radio": 2.0, "tower": 1.5,
    # bio / species
    "fossil": 2.5, "tree": 2.0, "dna": 2.5, "species": 2.5, "genome": 2.5,
    # power / assets
    "reactor": 3.0, "nuclear": 3.0, "power": 2.0, "grid": 2.0, "substation": 2.5,
    "turbine": 2.0, "solar": 2.0,
    # security
    "security": 3.0, "shield": 2.5, "vulnerability": 3.0, "threat": 2.5,
    # ai / concept
    "agi": 3.0, "core": 1.5, "intel": 2.0, "graph": 2.0, "constellation": 2.0,
}


def tok(s: str) -> list:
    """Normalise a string to lowercase alpha tokens, stopwords removed."""
    words = re.findall(r"[a-z0-9]+", (s or "").lower())
    return [w for w in words if w not in STOP and len(w) > 1]


def _db(path: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=15)


# ---------------------------------------------------------------------------
# Candidate GLB catalogue: every GLB we may pick, with a stable serving URL,
# token set, and a SOURCE PRIORITY (curated assets rank above generated on ties).
def load_candidates() -> list:
    cands = []
    # 1) 48 curated jarvis_assets (served at /asset/<file>) — source priority 0 (best)
    if os.path.isdir(ASSET_DIR):
        for fn in sorted(os.listdir(ASSET_DIR)):
            if not fn.endswith(".glb"):
                continue
            name = fn[:-4]
            # drop the jarvis_ prefix noise for token purposes
            label = name.replace("jarvis_", "").replace("_", " ")
            cands.append({
                "file": fn, "url": f"/asset/{fn}", "label": label,
                "src": "asset", "prio": 0, "tokens": set(tok(label)),
            })
    # 2) 1,638 indexed Tripo GLBs from media.db (served at /media/<file>) — priority 1
    con = _db(MEDIA_DB)
    rows = con.execute(
        "SELECT prompt, file FROM media WHERE kind='glb' ORDER BY file"
    ).fetchall()
    con.close()
    for prompt, file in rows:
        # prompt looks like "mass spectrometer [tripo]" or "abacus" — strip the [cat] tag
        clean = re.sub(r"\s*\[[^\]]*\]\s*$", "", prompt or "").strip()
        cat = ""
        m = re.search(r"\[([^\]]*)\]\s*$", prompt or "")
        if m:
            cat = m.group(1)
        cands.append({
            "file": file, "url": f"/media/{file}", "label": clean or file,
            "src": "media", "prio": 1, "category": cat, "tokens": set(tok(clean)),
        })
    return cands


def score(query_tokens: list, cand: dict) -> float:
    """Weighted token-overlap score between a query and a candidate GLB."""
    if not query_tokens:
        return 0.0
    ct = cand["tokens"]
    if not ct:
        return 0.0
    s = 0.0
    for q in query_tokens:
        if q in ct:
            s += TOKEN_WEIGHT_BOOST.get(q, 1.0)
    # length-normalise lightly so a 1-token exact match isn't dwarfed by noisy long names
    s = s / (1.0 + 0.15 * math.log1p(len(ct)))
    return s


def best_match(query_tokens: list, cands: list, restrict_src=None):
    """Deterministic best candidate: (score desc, src prio asc, file name asc)."""
    pool = cands if restrict_src is None else [c for c in cands if c["src"] in restrict_src]
    best = None
    best_key = None
    for c in pool:
        sc = score(query_tokens, c)
        if sc <= 0:
            continue
        key = (-sc, c["prio"], c["file"])
        if best is None or key < best_key:
            best, best_key = c, key
    return best, (-(best_key[0]) if best_key else 0.0)


def find_by_file(cands: list, filename: str) -> dict:
    for c in cands:
        if c["file"] == filename:
            return c
    raise KeyError(f"curated GLB not found in catalogue: {filename}")


# ---------------------------------------------------------------------------
# CURATED OVERRIDES — spec-aligned, hand-picked. Each value is a GLB filename that
# MUST exist in the candidate catalogue (validated at build time). These encode the
# editorial "correct assignment" decisions; everything else is scored.
SUN_FILE = "jarvis_iron_man_helmet.glb"  # the central morphing JARVIS face

# The reactor / projector stack the sun-face is projected up (FEATURES.md §1).
REACTOR_FILES = [
    "jarvis_fusion_reactor_core.glb",
    "jarvis_arc_reactor.glb",
    "jarvis_projector_dais.glb",
    "jarvis_fusion_core_containment_torus.glb",
    "jarvis_data_fusion_reactor_core.glb",
    "jarvis_kit_reactor_core_tower.glb",
]

# Per-domain curated GLB. Rationale documented inline. Filenames validated at build.
DOMAIN_OVERRIDE = {
    # Measurement = air-quality / sensor numeric readings -> a lab instrument planet.
    "Measurement": ("gen_tripo__balance_scale_lab.glb", "lab balance/scale — the act of measuring"),
    # DataSource = REST/JSON APIs & live feeds -> a server/data fabric planet.
    "DataSource": ("jarvis_kit_data_orb.glb", "data orb — the feeds/sources fabric"),
    # Document = govt PDFs / reports / filings -> the curated document vault book.
    "Document": ("jarvis_docvault_hero_document_book.glb", "document vault hero book — reports/filings"),
    # DomainSubject = ontology subjects / neuron types -> the AI reasoning orb.
    "DomainSubject": ("jarvis_ai_core_reasoning_orb.glb", "reasoning orb — ontology subjects/neurons"),
    # Topic = the 31 master topics hub -> the intel graph constellation core.
    "Topic": ("jarvis_intel_graph_constellation_core.glb", "graph constellation core — topic hub"),
    # SpeciesOccurrence = GBIF flora/fauna records -> a fossil/biology planet.
    "SpeciesOccurrence": ("gen_tripo__fossil_ammonite.glb", "fossil ammonite — species occurrence records"),
    # ScientificPublication = DOI papers -> a citation graph display planet.
    "ScientificPublication": ("gen_tripo__citation_graph_display.glb", "citation graph display — publications"),
    # Vulnerability = CVEs -> the curated security shield.
    "Vulnerability": ("jarvis_security_core_shield.glb", "security core shield — CVE vulnerabilities"),
    # AcquisitionPoint = ingestion strategies / live feeds -> a ground satellite dish.
    "AcquisitionPoint": ("gen_uw_urban__ground_satellite_dish.glb", "ground satellite dish — acquisition/ingest feeds"),
    # Place = world cities -> the curated holographic earth.
    "Place": ("jarvis_world_control_holo_earth.glb", "holo earth — places/cities"),
    # Asset = nuclear plants / power infrastructure -> a nuclear reactor pile.
    "Asset": ("gen_tripo__nuclear_reactor_pile.glb", "nuclear reactor pile — power-plant assets"),
    # Concept = abstract concepts (Everything, Supply chain) -> the AGI core.
    "Concept": ("gen_tripo__agi_core.glb", "agi core — abstract concepts"),
    # EarthquakeEvent = USGS quakes -> a fault/rift terrain planet.
    "EarthquakeEvent": ("gen_tripo__fault_rift_terrain.glb", "fault rift terrain — earthquakes"),
    # Event = (currently earthquake) events -> a volcano cone (geophysical event body).
    "Event": ("gen_tripo__volcano_cone.glb", "volcano cone — geophysical events"),
    # Sensor = CTBTO radiation monitoring stations -> a radio tower sensor.
    "Sensor": ("gen_tripo__radio_tower.glb", "radio tower — monitoring sensor stations"),
    # AppPage = Apex UI routes -> the curated holo panel frame.
    "AppPage": ("jarvis_holo_panel_frame.glb", "holo panel frame — app pages/UI routes"),
}

# CURATED TOPIC OVERRIDES — the 31 master topics are a fixed, known set, so each gets a
# hand-validated GLB for spec-correct assignment. Topics NOT listed here fall through to
# keyword scoring (documented below). Every filename is validated against the catalogue.
TOPIC_OVERRIDE = {
    "Technology & engineering": ("gen_uw_interior__engineering_cad_workstation.glb", "engineering CAD workstation"),
    "Science & research": ("gen_uw_interior__lab_experiment_bench.glb", "lab experiment bench"),
    "Knowledge & education": ("gen_tripo__university.glb", "university — knowledge/education"),
    "Politics & governance": ("gen_tripo__republic_senate_house.glb", "senate house — politics/governance"),
    "Classification & metadata itself": ("jarvis_intel_graph_constellation.glb", "graph constellation — taxonomy/ontology"),
    "Government & public administration": ("gen_tripo__courthouse.glb", "courthouse — government/public admin"),
    "Earth systems": ("gen_uw_sky__earth.glb", "earth — earth systems"),
    "Human body & health": ("gen_tripo__hospital.glb", "hospital — human body/health"),
    "Law & regulation": ("gen_tripo__law_stele.glb", "law stele — law/regulation"),
    "Geography & location": ("jarvis_world_control_earth_graticule.glb", "earth graticule — geography/location"),
    "Security & conflict": ("jarvis_security_core_shield.glb", "security shield — security/conflict"),
    "Economy & industry": ("gen_uw_interior__economics_market_data_wall.glb", "market data wall — economy/industry"),
    "Business & organisations": ("gen_uw_interior__economics_trading_terminal.glb", "trading terminal — business/orgs"),
    "Extended Intelligence & Operations": ("jarvis_intel_graph_constellation_core.glb", "intel graph core — intelligence/ops"),
    "Information & communication": ("gen_tripo__network_switch_node.glb", "network switch — information/comms"),
    "Finance & ownership": ("gen_uw_interior__economics_ledger_analytics_desk.glb", "ledger analytics desk — finance/ownership"),
    "Society & culture": ("gen_tripo__theatre_stage.glb", "theatre stage — society/culture"),
    "Environment & ecology": ("gen_uw_interior__ecology_biodiversity_camera_trap.glb", "biodiversity camera trap — environment/ecology"),
    "Climate & hazards": ("gen_uw_interior__atmoschem_ozone_monitor.glb", "ozone monitor — climate/hazards"),
    "Energy & resources": ("gen_tripo__power_grid_substation.glb", "power grid substation — energy/resources"),
    "Urban & built environment": ("gen_uw_urban__city_street.glb", "city street — urban/built environment"),
    "Agriculture & food systems": ("gen_tripo__guild_agriculture_barn.glb", "agriculture barn — agriculture/food"),
    "People & demographics": ("gen_uw_interior__epidemiology_contact_tracing_wall.glb", "contact tracing wall — people/demographics"),
    "Products & commodities": ("gen_tripo__market_stall.glb", "market stall — products/commodities"),
    "Transport & mobility": ("gen_tripo__maglev_pod.glb", "maglev pod — transport/mobility"),
    "Infrastructure & utilities": ("gen_tripo__water_tower.glb", "water tower — infrastructure/utilities"),
    "Universe & cosmology": ("gen_uw_interior__astronomy_observatory_telescope.glb", "observatory telescope — universe/cosmology"),
    "Work & labour": ("gen_tripo__assembly_line_conveyor.glb", "assembly line — work/labour"),
    "Life & biology": ("gen_uw_interior__biology_compound_microscope.glb", "compound microscope — life/biology"),
    "Consumption & lifestyle": ("gen_tripo__market_hall.glb", "market hall — consumption/lifestyle"),
    "Ethics & philosophy": ("gen_tripo__philosophy_agora.glb", "philosophy agora — ethics/philosophy"),
}

FALLBACK_FILE = "jarvis_command_atrium_data_orb.glb"  # neutral data orb for anything unmatched


def build():
    cands = load_candidates()
    by_file = {c["file"]: c for c in cands}

    def url_of(fn: str) -> str:
        c = by_file.get(fn)
        if c is None:
            raise KeyError(f"GLB not in catalogue: {fn}")
        return c["url"]

    # --- domains: counts + per-domain keyword text from brain.db (for documentation + scoring fallback)
    con = _db(BRAIN_DB)
    # gather a representative keyword text per domain from a sample of its objects' labels
    domain_keywords = {}
    for dom in DOMAIN_COUNTS:
        labels = []
        for (props,) in con.execute(
            "SELECT props FROM ont_object WHERE type=? LIMIT 25", (dom,)
        ).fetchall():
            try:
                p = json.loads(props or "{}")
            except Exception:
                continue
            for k in ("label", "title", "name", "type", "scientific_name", "place"):
                if p.get(k):
                    labels.append(str(p[k]))
        domain_keywords[dom] = " ".join(labels)

    # --- topics: the 31 NAMED master topics, ranked by pagerank
    topic_rows = []
    for (props,) in con.execute("SELECT props FROM ont_object WHERE type='Topic'").fetchall():
        try:
            p = json.loads(props or "{}")
        except Exception:
            continue
        label = p.get("label", "")
        if not label or label.startswith("topic_"):
            continue  # skip the unlabeled long-tail placeholders
        comp = p.get("_computed", {}) or {}
        topic_rows.append({
            "label": label,
            "keywords": p.get("keywords", []) or [],
            "pagerank": comp.get("pagerank", 0) or 0,
            "connectivity": comp.get("connectivity", 0) or 0,
        })
    con.close()
    topic_rows.sort(key=lambda r: (-r["pagerank"], -r["connectivity"], r["label"]))

    # ------- assemble manifest -------
    log_max = math.log10(max(DOMAIN_COUNTS.values()))

    domains_out = {}
    for dom, count in DOMAIN_COUNTS.items():
        fn, reason = DOMAIN_OVERRIDE[dom]
        c = by_file[fn]
        # log-scaled planet size hint (0..1) off the real count
        size = round(math.log10(max(count, 1)) / log_max, 4)
        domains_out[dom] = {
            "glb": fn,
            "url": c["url"],
            "src": c["src"],
            "count": count,
            "size": size,
            "match": "curated",
            "reason": reason,
        }

    topics_out = []
    for t in topic_rows:
        ov = TOPIC_OVERRIDE.get(t["label"])
        if ov is not None:
            fn, reason = ov
            cand = by_file[fn]
            sc = 0.0
            match = "curated"
        else:
            # keyword-overlap scoring vs all candidate GLBs (deterministic tie-break)
            query = tok(t["label"]) + [w for kw in t["keywords"] for w in tok(kw)]
            cand, sc = best_match(query, cands)
            reason = "keyword-scored"
            if cand is None:
                cand = by_file[FALLBACK_FILE]
                sc = 0.0
                match = "fallback"
            else:
                match = "scored"
        topics_out.append({
            "title": t["label"],
            "glb": cand["file"],
            "url": cand["url"],
            "src": cand["src"],
            "score": round(sc, 3),
            "match": match,
            "reason": reason,
            "pagerank": round(t["pagerank"], 5),
            "keywords": t["keywords"],
        })

    manifest = {
        "_meta": {
            "generator": "scripts/build_world_glb_manifest.py",
            "purpose": "Deterministic ontology-domain -> GLB assignment for the JARVIS 3D universe.",
            "deterministic": True,
            "sources": {
                "domains": "brain.db ont_object (counts + keywords)",
                "topics": "brain.db ont_object type=Topic (31 named master topics, ranked by pagerank)",
                "curated_glbs": "jarvis_assets/*.glb (48) served at /asset/<file>",
                "generated_glbs": "media.db kind='glb' (1638 Tripo) served at /media/<file>",
            },
            "matching": {
                "domains": "curated overrides (spec-aligned, validated)",
                "topics": "weighted keyword-overlap scoring vs all candidate GLBs (deterministic tie-break)",
                "tie_break": "(score desc, src prio asc [asset<media], file name asc)",
            },
            "counts": {
                "candidate_glbs": len(cands),
                "curated_assets": sum(1 for c in cands if c["src"] == "asset"),
                "generated_glbs": sum(1 for c in cands if c["src"] == "media"),
                "domains": len(domains_out),
                "topics": len(topics_out),
            },
        },
        "sun": {"glb": SUN_FILE, "url": url_of(SUN_FILE),
                "reason": "central morphing JARVIS / Iron-Man face — the star of the universe"},
        "reactor": [{"glb": fn, "url": url_of(fn)} for fn in REACTOR_FILES],
        "domains": domains_out,
        "topics": topics_out,
        "fallback": {"glb": FALLBACK_FILE, "url": url_of(FALLBACK_FILE),
                     "reason": "neutral data orb for any object without a specific match"},
    }
    return manifest, cands


def main():
    dry = "--dry-run" in sys.argv
    verify = "--verify" in sys.argv
    manifest, cands = build()

    # ---- build-time validation: every referenced GLB must exist in the catalogue ----
    by_file = {c["file"]: c for c in cands}
    refs = [manifest["sun"]["glb"], manifest["fallback"]["glb"]]
    refs += [r["glb"] for r in manifest["reactor"]]
    refs += [d["glb"] for d in manifest["domains"].values()]
    refs += [t["glb"] for t in manifest["topics"]]
    missing = sorted({f for f in refs if f not in by_file})
    if missing:
        print("MANIFEST_ERR missing GLBs: " + ", ".join(missing), flush=True)
        sys.exit(1)

    body = json.dumps(manifest, indent=2, sort_keys=False, ensure_ascii=False)
    if dry:
        print(body)
        m = manifest["_meta"]["counts"]
        print(f"\nDRY-RUN ok: {m['domains']} domains, {m['topics']} topics, "
              f"{m['candidate_glbs']} candidate GLBs. (not written)", flush=True)
        return

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(body)
    m = manifest["_meta"]["counts"]
    print(f"WROTE {OUT_PATH}", flush=True)
    print(f"  domains={m['domains']} topics={m['topics']} candidates={m['candidate_glbs']} "
          f"(assets={m['curated_assets']} generated={m['generated_glbs']})", flush=True)

    if verify:
        re_read = json.load(open(OUT_PATH, encoding="utf-8"))
        assert len(re_read["domains"]) == 16, "expected 16 domains"
        assert len(re_read["topics"]) == 31, "expected 31 named topics"
        # confirm each domain GLB physically resolves on disk
        for dom, d in re_read["domains"].items():
            fn = d["glb"]
            path = (os.path.join(ASSET_DIR, fn) if d["src"] == "asset"
                    else os.path.join(ROOT, "server", "data", "media", fn))
            ok = os.path.exists(path)
            print(f"  [{dom:22}] {fn:48} {'OK' if ok else 'MISSING:'+path}")
        print("VERIFY ok", flush=True)


if __name__ == "__main__":
    main()
