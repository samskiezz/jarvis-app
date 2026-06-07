#!/usr/bin/env python3
"""MASTER GLB LIST — cross-reference EVERY scene / storyline / ability / feature / capability
of Underworld Minions against the 3D assets it needs, then emit the full master GLB list to
build the complete UE5 world (covered vs must-author), in the modern-photoreal Sims4/GTA5 vibe.

It pulls the REAL enumerations from the code (no invented features):
  • 56 sciences × ~90 facets × 20 advance-steps         (story_engine)
  • 15 scene situations, 14 minion actions/abilities     (design_spec)
  • 18 social interactions, 11 saga archetypes           (story_engine / sagas)
  • 17 emotions, 7 moods, life-cycle events              (emotion / lifecycle / models)
  • 26 building functions × ~40 room types + furniture   (interiors)
  • 22 civic building types                              (civic_assets)
  • 11 guilds, 8 eras, weather/biomes/vfx                (story_engine / design_spec)
and maps each to the asset KINDS required, then checks coverage against asset_catalog.json.

Outputs (underworld/data/master/):
  feature_catalog.csv     — every feature/scene/story/ability/capability (the full inventory)
  scene_glb_xref.csv      — feature → required asset kind → category/role → covered?/example
  glb_master_list.csv     — THE master list: every GLB kind needed, covered vs author-next
  MASTER-GLB-LIST.md      — summary, counts, the modern-photoreal authoring backlog
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../underworld
sys.path.insert(0, os.path.dirname(ROOT))                            # repo root

from underworld.server.services import story_engine as SE      # noqa: E402
from underworld.server.services import design_spec as DS        # noqa: E402
from underworld.server.services import interiors as IN          # noqa: E402
from underworld.server.services import civic_assets as CA       # noqa: E402

CATALOG = os.path.join(ROOT, "web", "public", "models", "asset_catalog.json")
OUT = os.path.join(ROOT, "data", "master")

# ── curated requirement maps (the parts not derivable from code) ────────────────────
# science → the signature instrument/lab asset(s) needed to render its research scenes
SCIENCE_EQUIPMENT = {
    "astronomy": ["telescope", "observatory_dome"], "biology": ["microscope", "specimen_jar"],
    "chemistry": ["fume_hood", "beaker_set", "bunsen_burner"], "physics": ["particle_rig", "oscilloscope"],
    "medicine": ["operating_table", "mri_scanner", "iv_stand"], "robotics": ["robot_arm", "assembly_cell"],
    "electronics": ["oscilloscope", "circuit_bench", "soldering_station"], "metallurgy": ["furnace", "crucible"],
    "materials": ["press_machine", "test_rig"], "optics": ["laser_bench", "lens_array"],
    "nuclear": ["reactor_core", "control_console"], "qcomputing": ["quantum_cryostat", "server_rack"],
    "cs_ai": ["server_rack", "gpu_cluster", "workstation"], "agronomy": ["greenhouse", "tractor"],
    "geology": ["core_sampler", "rock_saw"], "ocean": ["research_buoy", "submersible"],
    "epidemiology": ["biosafety_cabinet", "centrifuge"], "pharmacology": ["pill_press", "lab_fridge"],
    "semiconductor": ["cleanroom_bench", "wafer_stepper"], "rf": ["antenna_array", "signal_analyzer"],
    "seismology": ["seismograph", "sensor_post"], "spectroscopy": ["spectrometer"],
    "photovoltaics": ["solar_panel", "test_array"], "neuro": ["eeg_cap", "brain_scanner"],
}
# scene situation → set-dressing/FX kinds beyond the per-asset vfx already in design_spec
SITUATION_SET = {
    "festival": ["stage", "string_lights", "food_stall", "crowd_barrier", "fireworks_fx"],
    "conflict": ["barricade", "debris", "smoke_fx"], "disaster": ["rubble", "fire_fx", "emergency_light"],
    "trade": ["market_stall", "crate_stack", "price_board"], "ritual": ["altar", "candles", "incense_fx"],
    "discovery": ["eureka_fx", "blueprint_table"], "harvest": ["crop_field", "harvest_basket"],
    "travel": ["road_sign", "bus_stop", "luggage"], "birth": ["crib", "balloon"], "death": ["grave", "wreath"],
    "rest": ["park_bench", "streetlight"], "research": ["whiteboard", "data_screen"],
    "build": ["scaffold", "crane", "toolbox"], "idle": ["bench", "planter"],
}
# social interaction → context props (two characters + a place to do it)
INTERACTION_CONTEXT = {
    "romance": ["park_bench", "cafe_table"], "trade": ["market_stall"], "debate": ["lectern"],
    "celebrate": ["table_setting"], "mentor": ["whiteboard"], "grieve": ["grave"],
    "conflict": ["none"], "console": ["sofa"], "gossip": ["water_cooler"], "recruit": ["desk"],
}
# life-cycle capability → required assets
LIFE_EVENT_REQ = {
    "birth": [("baby", "character"), ("crib", "furniture")],
    "child / aging / life-stages": [("child", "character"), ("elder", "character")],
    "death": [("grave", "prop"), ("coffin", "prop"), ("hearse", "vehicle")],
    "breeding / family": [("family_home", "residential")],
    "reincarnation / soul": [("soul_wisp_fx", "fx")],
}
# guild → identity assets
GUILD_REQ = {g: [(f"guild_{g}_hall", "civic"), (f"banner_{g}", "prop"), (f"tool_{g}", "prop")]
             for g in SE.GUILDS}
# modern-photoreal city essentials (GTA5/Sims4 vibe) the world needs regardless of feature
MODERN_CITY_KIT = [
    ("traffic_light", "prop"), ("street_sign", "prop"), ("fire_hydrant", "prop"),
    ("trash_bin", "prop"), ("bus_stop", "prop"), ("streetlight_modern", "prop"),
    ("billboard", "prop"), ("park_bench", "furniture"), ("crosswalk_decal", "floor"),
    ("manhole", "prop"), ("power_pole", "prop"), ("ac_unit", "prop"), ("parked_car", "vehicle"),
    ("sedan", "vehicle"), ("suv", "vehicle"), ("city_bus", "vehicle"), ("delivery_truck", "vehicle"),
    ("taxi", "vehicle"), ("ambulance", "vehicle"), ("police_car", "vehicle"), ("fire_truck", "vehicle"),
    ("glass_skyscraper", "tower"), ("modern_apartment_block", "residential"),
    ("retail_storefront", "commercial"), ("gas_station", "commercial"), ("parking_structure", "commercial"),
    ("metrohuman_civilian", "character"), ("metrohuman_worker", "character"),
]

# ── coverage matching against the real catalog ───────────────────────────────────────
def load_catalog():
    return json.load(open(CATALOG))

def catalog_index(catalog):
    names = []
    for u in catalog.get("assets", {}):
        names.append((os.path.basename(u).rsplit(".", 1)[0].lower(), u))
    return names

def covered(kind, idx):
    toks = set(re.split(r"[^a-z0-9]+", kind.lower()))
    toks = {t for t in toks if len(t) > 2}
    for name, url in idx:
        ntoks = set(re.split(r"[^a-z0-9]+", name))
        if toks & ntoks:
            return url
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    catalog = load_catalog()
    idx = catalog_index(catalog)

    # 1) FEATURE CATALOG — the full inventory of everything in the game
    features = []
    features.append(("science", "ALL", f"{len(SE.SCIENCES)} sciences × {len(SE.FACETS)} facets × {len(SE.ADVANCE_STEPS)} steps", len(SE.SCIENCES)*len(SE.FACETS)))
    for s in SE.SCIENCES: features.append(("science", s, "research domain", len(SE.FACETS)))
    for name, *_ in DS.SITUATIONS: features.append(("scene_situation", name, "scene/camera/sound/vfx", 1))
    for name, *_ in DS.ACTIONS: features.append(("ability_action", name, "minion action", 1))
    for name, *_ in SE.INTERACTIONS: features.append(("social_interaction", name, "minion↔minion", 1))
    for a in SE.ARCHETYPES: features.append(("saga_archetype", a, "5-beat storyline", 5))
    for f in SE.FEELINGS: features.append(("emotion", f, "appraisal emotion", 1))
    for m in SE.MOODS: features.append(("mood", m, "mood state", 1))
    for fn in IN._PROGRAMS: features.append(("building_function", fn, "interior program", len(IN._program(fn,'civic'))))
    for rt in sorted(set(IN._ROOM_FURNITURE)): features.append(("room_type", rt, "interior room", 1))
    for ct in CA.CIVIC_TYPES: features.append(("civic_building", ct, "city building type", 1))
    for g in SE.GUILDS: features.append(("guild", g, "faction", 1))
    for e in SE.ERAS: features.append(("era", e, "architectural age", 1))

    with open(os.path.join(OUT, "feature_catalog.csv"), "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["type", "name", "detail", "variants"])
        w.writerows(features)

    # 2) CROSS-REFERENCE — feature → required asset kind → covered?
    xref = []  # (feature_type, feature, requires_kind, category, role, covered, example)
    def add(ftype, fname, kind, cat, role):
        ex = covered(kind, idx)
        xref.append((ftype, fname, kind, cat, role, 1 if ex else 0, os.path.basename(ex) if ex else ""))

    # buildings + interiors (programmatic, the bulk)
    for fn in IN._PROGRAMS:
        add("building_function", fn, fn, IN._CATEGORY_FALLBACK.get('civic', 'civic'), "building_shell")
        for rtype, *_ in IN._program(fn, "civic"):
            for kw in IN._ROOM_FURNITURE.get(rtype, ()):
                add("building_function", f"{fn}/{rtype}", kw, "furniture", "interior_prop")
    for ct in CA.CIVIC_TYPES:
        add("civic_building", ct, ct, "civic", "building_shell")
    # abilities (props/tools from design_spec ACTIONS vfx + curated)
    for name, anim, sfx, vfx, _deltas in DS.ACTIONS:
        if vfx: add("ability_action", name, vfx.replace("vfx_", ""), "fx", "vfx")
    # scenes set-dressing
    for name, *_ in DS.SITUATIONS:
        for kind in SITUATION_SET.get(name, []):
            cat = "fx" if kind.endswith("_fx") else "prop"
            add("scene_situation", name, kind, cat, "set_dressing")
    # social interactions
    for name, *_ in SE.INTERACTIONS:
        for kind in INTERACTION_CONTEXT.get(name, []):
            if kind != "none": add("social_interaction", name, kind, "furniture", "context_prop")
    # sciences → equipment
    for s in SE.SCIENCES:
        for kind in SCIENCE_EQUIPMENT.get(s, []):
            add("science", s, kind, "prop", "lab_equipment")
    # life-cycle
    for ev, reqs in LIFE_EVENT_REQ.items():
        for kind, cat in reqs: add("life_event", ev, kind, cat, "lifecycle_asset")
    # guilds
    for g, reqs in GUILD_REQ.items():
        for kind, cat in reqs: add("guild", g, kind, cat, "faction_identity")
    # modern city kit (the GTA5/Sims4 vibe baseline)
    for kind, cat in MODERN_CITY_KIT:
        add("modern_city_kit", "baseline", kind, cat, "urban_dressing")
    # characters per era (visual variety) + per guild
    for e in SE.ERAS:
        add("era", e, f"{e}_architecture_set", "tower", "era_style_kit")

    with open(os.path.join(OUT, "scene_glb_xref.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["feature_type", "feature", "requires_kind", "category", "role", "covered", "example"])
        w.writerows(xref)

    # 3) MASTER GLB LIST — dedup required kinds; covered vs author-next
    master = {}  # kind -> {category, roles, needed_by, covered, example}
    for ftype, fname, kind, cat, role, cov, ex in xref:
        m = master.setdefault(kind, {"category": cat, "roles": set(), "needed_by": set(),
                                     "covered": cov, "example": ex})
        m["roles"].add(role); m["needed_by"].add(ftype)
        if cov: m["covered"] = 1; m["example"] = ex or m["example"]

    rows = []
    for kind, m in sorted(master.items(), key=lambda kv: (-len(kv[1]["needed_by"]), kv[0])):
        rows.append([kind, m["category"], "|".join(sorted(m["roles"])),
                     len(m["needed_by"]), "|".join(sorted(m["needed_by"])),
                     "covered" if m["covered"] else "AUTHOR", m["example"]])
    with open(os.path.join(OUT, "glb_master_list.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["glb_kind", "category", "roles", "needed_by_count", "needed_by_types", "status", "example_existing"])
        w.writerows(rows)

    # 4) SUMMARY
    total = len(master); cov = sum(1 for m in master.values() if m["covered"]); auth = total - cov
    civ = CA.civic_coverage(catalog)
    md = [
        "# Underworld Minions — MASTER GLB LIST (full UE5 world)\n",
        "Auto-generated by `scripts/generate_master_glb_list.py`. Cross-references every scene, "
        "storyline, ability, interaction, emotion, life-event, building, room, civic type, guild "
        "and era against the GLBs it needs, then checks the real catalog.\n",
        f"## Totals\n",
        f"- **Features inventoried:** {len(features)} rows (sciences/scenes/abilities/interactions/"
        f"archetypes/emotions/buildings/rooms/civic/guilds/eras)\n",
        f"- **Distinct GLB kinds required:** {total}\n",
        f"- **Already covered by catalog:** {cov}  ·  **Must author (UE5 backlog):** {auth}\n",
        f"- **Cross-reference rows:** {len(xref)}\n",
        f"- **Civic buildings:** {len(civ['covered'])} real / {len(civ['fallback'])} stand-in / "
        f"{len(civ['missing'])} missing\n",
        "\n## The author-next backlog (status = AUTHOR), highest-demand first\n",
    ]
    auth_rows = [r for r in rows if r[5] == "AUTHOR"][:80]
    md.append("| GLB kind | category | needed by | roles |\n|---|---|---|---|\n")
    for r in auth_rows:
        md.append(f"| {r[0]} | {r[1]} | {r[3]} | {r[2]} |\n")
    md.append("\n*(full lists in glb_master_list.csv / scene_glb_xref.csv / feature_catalog.csv)*\n")
    md.append("\nAuthor these in the **modern-photoreal Sims4/GTA5 vibe** (see FIDELITY-TARGET.md ★M). "
              "Each maps to features that will render the moment the GLB lands — the importer + "
              "world spawner already consume them by name/category.\n")
    open(os.path.join(ROOT, "MASTER-GLB-LIST.md"), "w").write("".join(md))

    print(f"features inventoried : {len(features)}")
    print(f"xref rows            : {len(xref)}")
    print(f"distinct GLB kinds   : {total}")
    print(f"  covered            : {cov}")
    print(f"  AUTHOR (backlog)   : {auth}")
    print(f"outputs -> {OUT}/  + MASTER-GLB-LIST.md")


if __name__ == "__main__":
    main()
