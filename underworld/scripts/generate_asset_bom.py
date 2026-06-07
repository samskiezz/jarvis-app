#!/usr/bin/env python3
"""GLB BILL OF MATERIALS — the exhaustive itemized asset list for the full UE5 world.

Not "kinds" (that's glb_master_list.csv) — this is every CONCRETE GLB to author/source, down
to the fork and the dining chair, for every room, plus the whole outside (terrain, flora, sky,
sun/moon/stars, weather). Sims-4-buy-catalog granularity: each base object expands across
style × swatch × LOD (and season for flora, era for buildings, age/build/outfit for people) —
the way a real AAA library is actually built. Target: 50,000+ rows.

Each row = one shippable GLB: id, domain, zone/room, base_item, style, swatch, lod, category,
covered?(in catalog), status, used_by. Output: data/master/glb_bom.csv (+ summary appended to
MASTER-GLB-LIST.md). Re-run anytime; deterministic.
"""
from __future__ import annotations
import csv, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(ROOT))
from underworld.server.services import story_engine as SE   # noqa: E402

CATALOG = os.path.join(ROOT, "web", "public", "models", "asset_catalog.json")
OUT = os.path.join(ROOT, "data", "master")

# ── variant axes (how a real library multiplies) ────────────────────────────────────
SWATCHES = ["oak", "walnut", "white", "black", "graphite", "steel", "navy", "sage"]   # 8
STYLES   = ["modern", "contemporary", "minimalist", "industrial", "scandi", "luxury"]  # 6
LODS     = ["lod0", "lod1", "lod2"]                                                     # 3
SEASONS  = ["spring", "summer", "autumn", "winter"]
ERAS     = SE.ERAS                                                                      # 8

# ── INTERIOR ITEMS per room — down to the cutlery (Sims buy-mode depth) ──────────────
TABLEWARE = ["fork", "dinner_fork", "salad_fork", "knife", "butter_knife", "steak_knife",
    "spoon", "teaspoon", "soup_spoon", "dinner_plate", "side_plate", "bowl", "soup_bowl",
    "pasta_bowl", "cup", "mug", "glass", "wine_glass", "tumbler", "champagne_flute",
    "napkin", "napkin_ring", "placemat", "salt_shaker", "pepper_mill", "sugar_bowl",
    "creamer", "teapot", "coffee_pot", "serving_platter", "gravy_boat", "candlestick",
    "table_runner", "centerpiece_vase", "chopsticks", "ramekin", "butter_dish"]
COOKWARE = ["pot", "saucepan", "stock_pot", "frying_pan", "skillet", "wok", "baking_tray",
    "casserole_dish", "kettle", "colander", "mixing_bowl", "measuring_cup", "measuring_jug",
    "ladle", "spatula", "whisk", "tongs", "wooden_spoon", "rolling_pin", "cutting_board",
    "knife_block", "chef_knife", "paring_knife", "grater", "peeler", "can_opener", "sieve",
    "spice_rack", "spice_jar", "oil_bottle", "salt_cellar", "dish_rack", "drying_mat",
    "tea_towel", "oven_mitt", "trivet", "apron", "scales"]
KITCHEN_FIX = ["stove", "range_hood", "oven", "microwave", "fridge", "freezer", "dishwasher",
    "kitchen_sink", "faucet", "kitchen_counter", "kitchen_island", "upper_cabinet",
    "lower_cabinet", "pantry", "toaster", "blender", "food_processor", "stand_mixer",
    "coffee_machine", "kettle_electric", "rice_cooker", "trash_bin", "recycling_bin",
    "paper_towel_holder", "knife_strip", "fruit_bowl", "bread_bin", "cookbook_stand"]
SEATING = ["dining_chair", "armchair", "accent_chair", "bar_stool", "bench", "stool",
    "office_chair", "recliner", "rocking_chair", "folding_chair", "ottoman", "pouffe",
    "loveseat", "two_seat_sofa", "three_seat_sofa", "corner_sofa", "chaise"]
TABLES = ["dining_table", "coffee_table", "side_table", "console_table", "desk", "writing_desk",
    "bar_table", "bedside_table", "dressing_table", "work_table", "drafting_table",
    "conference_table", "picnic_table", "folding_table", "nesting_tables"]
BEDROOM = ["single_bed", "double_bed", "queen_bed", "king_bed", "bunk_bed", "crib", "cot",
    "headboard", "nightstand", "wardrobe", "dresser", "chest_of_drawers", "blanket_box",
    "mirror_full", "vanity_mirror", "clothes_rail", "shoe_rack", "laundry_basket",
    "pillow", "bolster", "duvet", "blanket", "throw", "bed_runner", "alarm_clock", "rug_bedroom"]
BATHROOM = ["toilet", "bidet", "bathroom_sink", "vanity_unit", "bathtub", "shower_stall",
    "shower_head", "towel_rail", "heated_rail", "mirror_cabinet", "medicine_cabinet",
    "toilet_roll_holder", "toilet_brush", "soap_dispenser", "soap_dish", "toothbrush_holder",
    "bath_mat", "shower_curtain", "laundry_hamper", "scale_bathroom", "towel", "hand_towel"]
LIVING = ["tv", "tv_stand", "media_unit", "bookshelf", "shelving_unit", "display_cabinet",
    "floor_lamp", "table_lamp", "pendant_light", "ceiling_light", "wall_sconce", "rug_living",
    "curtains", "blinds", "picture_frame", "wall_art", "wall_clock", "mantel_clock",
    "vase", "plant_pot", "house_plant", "cushion", "throw_blanket", "magazine_rack",
    "record_player", "speaker", "fireplace", "fan", "air_conditioner", "router", "console_games"]
OFFICE = ["monitor", "dual_monitor", "keyboard", "mouse", "laptop", "desktop_pc", "server_rack",
    "printer", "scanner", "phone_desk", "desk_lamp", "filing_cabinet", "pinboard",
    "whiteboard", "monitor_arm", "desk_organiser", "stapler", "paper_tray", "shredder",
    "water_cooler", "coffee_station", "swivel_chair", "standing_desk", "cable_tray"]
CLASSROOM = ["student_desk", "student_chair", "teacher_desk", "chalkboard", "whiteboard_class",
    "projector", "projector_screen", "globe", "world_map_poster", "bookcase_class",
    "supply_cabinet", "pencil_pot", "clock_class", "locker_bank", "noticeboard", "easel"]
LAB = ["lab_bench", "fume_hood", "microscope", "centrifuge", "beaker", "flask", "test_tube",
    "test_tube_rack", "bunsen_burner", "pipette", "petri_dish", "lab_balance", "spectrometer",
    "incubator", "lab_fridge", "safety_shower", "eye_wash", "reagent_shelf", "lab_stool",
    "glove_box", "autoclave", "hotplate", "vacuum_pump", "oscilloscope", "specimen_jar"]
MEDICAL = ["hospital_bed", "gurney", "iv_stand", "heart_monitor", "operating_table",
    "surgical_light", "anaesthesia_machine", "defibrillator", "wheelchair", "crutches",
    "medicine_trolley", "exam_couch", "blood_pressure_unit", "x_ray_viewer", "scrub_sink",
    "medical_cabinet", "sharps_bin", "drip_bag", "ventilator", "stretcher", "first_aid_kit"]
RETAIL = ["shelf_unit", "gondola_shelf", "checkout_counter", "cash_register", "shopping_cart",
    "shopping_basket", "clothes_rack", "mannequin", "display_table", "price_tag", "barcode_scanner",
    "fridge_display", "freezer_chest", "product_box", "pallet", "shop_sign", "fitting_room"]
RESTAURANT = ["restaurant_table", "booth_seat", "bar_counter", "bar_stool_r", "menu_board",
    "menu_card", "cutlery_set", "wine_rack", "espresso_machine", "cake_display", "till",
    "tray", "condiment_caddy", "table_number", "high_chair", "serving_station"]
GYM = ["treadmill", "exercise_bike", "rowing_machine", "bench_press", "dumbbell_rack",
    "dumbbell", "barbell", "weight_plate", "kettlebell", "yoga_mat", "medicine_ball",
    "cable_machine", "squat_rack", "locker_gym", "water_fountain_gym", "wall_mirror_gym"]
WORSHIP = ["pew", "altar_table", "lectern", "pulpit", "candelabra", "offering_box",
    "icon_panel", "stained_glass_panel", "incense_burner", "prayer_mat", "font", "organ_pipe"]
INDUSTRIAL = ["workbench", "machine_press", "lathe", "cnc_machine", "conveyor", "forklift",
    "pallet_rack", "tool_chest", "tool_wall", "welding_rig", "air_compressor", "drum_barrel",
    "control_panel", "generator", "turbine", "pump", "pipe_assembly", "valve_wheel",
    "hazard_sign", "fire_extinguisher", "hard_hat", "cable_reel", "gas_cylinder"]
CIVIC_TRANSIT = ["waiting_bench", "ticket_machine", "turnstile", "departure_board", "platform_sign",
    "luggage_trolley", "vending_machine", "info_kiosk", "cctv_camera", "litter_bin_transit"]
DECOR = ["framed_photo", "abstract_painting", "wall_mirror", "indoor_palm", "fern_pot",
    "succulent", "flower_vase", "table_clock", "candle", "candle_holder", "book_stack",
    "decor_bowl", "sculpture_small", "rug_runner", "doormat", "coat_rack", "umbrella_stand",
    "wall_shelf", "string_lights_indoor", "diffuser", "tissue_box", "waste_basket"]

ROOMS = {
    "kitchen": TABLEWARE + COOKWARE + KITCHEN_FIX + DECOR,
    "dining": TABLEWARE + TABLES + SEATING + DECOR,
    "living": LIVING + SEATING + TABLES + DECOR,
    "bedroom": BEDROOM + DECOR, "bathroom": BATHROOM + DECOR,
    "office": OFFICE + SEATING + TABLES + DECOR, "openplan": OFFICE + SEATING + DECOR,
    "meeting": OFFICE + TABLES + SEATING, "breakroom": KITCHEN_FIX + SEATING + TABLES,
    "lobby": SEATING + DECOR + ["reception_desk", "sofa_lobby", "magazine_table"],
    "waiting": SEATING + DECOR, "classroom": CLASSROOM + DECOR, "hall": SEATING + DECOR,
    "library": ["bookshelf_tall", "library_table", "reading_lamp", "card_catalogue",
                "study_carrel", "ladder_rolling"] + SEATING, "stacks": ["bookshelf_tall"],
    "reading": ["reading_chair", "reading_lamp", "library_table"] + DECOR,
    "lab": LAB + DECOR, "ward": MEDICAL + DECOR, "surgery": MEDICAL, "exam": MEDICAL,
    "pharmacy": ["pharmacy_shelf", "dispensing_counter", "pill_bottle", "medicine_drawer"] + DECOR,
    "shopfloor": RETAIL, "storeroom": ["pallet_rack", "storage_box", "shelf_unit", "ladder_step"],
    "counter": RETAIL, "dining_r": RESTAURANT, "restaurant": RESTAURANT, "kitchen_r": COOKWARE + KITCHEN_FIX,
    "gym": GYM, "studio": GYM + ["yoga_mat", "speaker"], "locker": ["locker_gym", "bench"],
    "nave": WORSHIP, "altar": WORSHIP, "vestry": WORSHIP + DECOR,
    "cell": ["bunk_metal", "cell_toilet", "cell_sink", "cell_door"], "armory": ["weapon_rack", "locker_steel", "ammo_crate"],
    "floor": INDUSTRIAL, "control": INDUSTRIAL + OFFICE, "turbine_hall": INDUSTRIAL,
    "pump_hall": INDUSTRIAL, "loading": ["pallet", "forklift", "loading_dock", "roller_door"],
    "bay": ["fire_engine_bay", "hose_reel", "turnout_rack"], "dorm": BEDROOM,
    "concourse": CIVIC_TRANSIT, "platform": CIVIC_TRANSIT, "ticket": CIVIC_TRANSIT,
    "waiting_r": CIVIC_TRANSIT + SEATING,
}
STYLED = set(SEATING + TABLES + BEDROOM + LIVING + OFFICE + ["reception_desk", "sofa_lobby"])

# ── EXTERIOR — terrain, flora, sky, sun/moon/stars, weather ─────────────────────────
TREE_SPECIES = ["oak", "pine", "birch", "maple", "willow", "spruce", "cedar", "redwood",
    "palm", "cypress", "ash", "elm", "beech", "fir", "poplar", "magnolia", "jacaranda",
    "eucalyptus", "baobab", "cherry_blossom", "olive", "apple", "lemon", "banana", "bamboo",
    "acacia", "sequoia", "dogwood", "hawthorn", "rowan", "chestnut", "walnut_tree", "fig",
    "mango", "teak", "mahogany", "ginkgo", "larch", "juniper", "yew", "alder", "hazel",
    "sycamore", "linden", "hornbeam", "tamarind", "neem", "joshua", "mangrove", "cottonwood"]
PLANTS = ["fern", "bush_round", "hedge", "shrub_flower", "grass_tuft", "tall_grass", "reed",
    "cattail", "rose_bush", "tulip_bed", "daffodil", "sunflower", "lavender", "wildflower_patch",
    "cactus_barrel", "cactus_saguaro", "aloe", "hosta", "ivy_climb", "moss_patch", "lilypad",
    "clover_patch", "thistle", "bracken", "vine_hanging", "succulent_cluster", "ornamental_grass",
    "boxwood_topiary", "bamboo_clump", "banana_leaf", "tropical_fern", "seaweed", "kelp",
    "wheat_stalk", "corn_stalk", "vegetable_row", "vineyard_row", "berry_bush", "pumpkin_patch"]
ROCKS = ["boulder_small", "boulder_large", "rock_cluster", "cliff_face", "stone_slab",
    "pebble_scatter", "scree_slope", "rock_arch", "stalagmite", "crystal_cluster", "geode",
    "sandstone_mesa", "basalt_column", "limestone_outcrop", "river_stone", "gravel_patch"]
TERRAIN = ["grass", "dirt", "mud", "sand", "rock_ground", "snow_ground", "ice", "asphalt",
    "concrete", "cobblestone", "brick_paving", "gravel_path", "wood_deck", "marsh", "clay",
    "tundra", "savanna_grass", "desert_dune", "forest_floor", "beach_sand", "lava_rock",
    "salt_flat", "moss_ground", "farmland_tilled", "meadow", "wetland", "scrubland"]
WATER = ["ocean_surface", "lake", "river", "stream", "pond", "waterfall", "fountain_city",
    "canal", "reservoir", "puddle", "rapids", "estuary", "hot_spring", "wave_foam"]
CELESTIAL = ["sun_disc", "sun_corona", "moon_full", "moon_gibbous", "moon_half", "moon_crescent",
    "moon_new", "earth_planet", "mars_planet", "jupiter_planet", "saturn_ringed", "venus_planet",
    "star_field", "milky_way_band", "constellation_lines", "shooting_star", "comet", "nebula",
    "aurora_borealis", "aurora_australis", "eclipse_solar", "eclipse_lunar", "galaxy_spiral",
    "asteroid", "satellite_orbit", "space_station_orbit", "planet_rings", "binary_star"]
CLOUDS = ["cumulus", "stratus", "cirrus", "cumulonimbus", "altocumulus", "fog_bank",
    "storm_front", "wispy_high", "overcast_layer", "mammatus"]
WEATHER_FX = ["rain_light", "rain_heavy", "drizzle", "snow_light", "snow_blizzard", "hail",
    "fog", "mist", "sandstorm", "dust_devil", "lightning_bolt", "thunderhead", "rainbow",
    "falling_leaves", "pollen_drift", "ember_drift", "heat_haze", "frost_overlay",
    "puddle_ripple", "wind_gust_debris", "sleet", "ground_fog", "spray_sea", "smoke_plume"]
URBAN = ["traffic_light", "street_sign_stop", "street_sign_yield", "street_name_sign",
    "fire_hydrant", "trash_bin_street", "recycling_bin_street", "bus_stop_shelter",
    "bench_park", "streetlight", "lamppost", "billboard", "billboard_digital", "bollard",
    "planter_street", "tree_grate", "manhole_cover", "storm_drain", "power_pole", "transformer_box",
    "phone_box", "post_box", "newspaper_box", "atm_outdoor", "parking_meter", "bike_rack",
    "crosswalk_markings", "road_cone", "barrier_temp", "scaffolding", "construction_sign",
    "awning", "shop_sign_hanging", "neon_sign", "ac_condenser", "satellite_dish", "antenna_roof",
    "water_tank_roof", "fire_escape", "gutter_pipe", "vent_grille", "graffiti_decal",
    "flower_box_window", "park_fence", "playground_swing", "playground_slide", "park_gazebo",
    "picnic_table_park", "drinking_fountain", "dog_waste_station", "advertising_pillar"]
VEHICLES = ["sedan", "hatchback", "suv", "pickup_truck", "sports_car", "city_bus", "coach_bus",
    "delivery_van", "box_truck", "semi_truck", "taxi", "police_car", "ambulance", "fire_truck",
    "garbage_truck", "tow_truck", "motorcycle", "scooter", "bicycle", "e_bike", "tram", "subway_car",
    "train_locomotive", "train_carriage", "cargo_ship", "ferry", "speedboat", "helicopter",
    "small_plane", "forklift_v", "bulldozer", "excavator", "crane_truck", "cement_mixer",
    "limo", "convertible", "minivan", "food_truck", "ice_cream_van", "hearse"]
BUILDING_TYPES = ["glass_skyscraper", "office_tower", "apartment_block", "condo_tower", "townhouse",
    "suburban_house", "bungalow", "mansion", "cottage", "duplex", "retail_storefront",
    "shopping_mall", "supermarket", "department_store", "gas_station", "parking_garage",
    "hospital", "clinic", "school", "university", "library", "museum", "theatre", "cinema",
    "stadium", "gym_building", "hotel", "motel", "restaurant", "cafe", "bar", "nightclub",
    "bank", "post_office", "police_station", "fire_station", "courthouse", "city_hall",
    "church", "temple", "mosque", "factory", "warehouse", "power_plant", "water_treatment",
    "bus_terminal", "train_station", "subway_entrance", "airport_terminal", "lighthouse"]
CHARACTER_BUILDS = ["slim", "average", "athletic", "heavy", "tall", "short"]
CHARACTER_AGES = ["baby", "toddler", "child", "teen", "adult", "elder"]
OUTFITS = ["casual", "business", "labcoat", "scrubs", "overalls", "uniform_police", "uniform_fire",
    "chef", "athletic_wear", "formal", "winter_coat", "rain_coat", "hi_vis", "apron", "academic_robe"]

def slug(*p): return re.sub(r"[^a-z0-9]+", "_", "_".join(str(x) for x in p).lower()).strip("_")

def cat_index(catalog):
    return [(os.path.basename(u).rsplit(".",1)[0].lower(), u) for u in catalog.get("assets", {})]

def covered(base, idx):
    toks = {t for t in re.split(r"[^a-z0-9]+", base) if len(t) > 2}
    for name, _ in idx:
        if toks & set(re.split(r"[^a-z0-9]+", name)): return 1
    return 0

def main():
    os.makedirs(OUT, exist_ok=True)
    catalog = json.load(open(CATALOG)); idx = cat_index(catalog)
    rows = []
    def emit(domain, zone, base, style, swatch, lod, category, used_by):
        rows.append([slug(domain, zone, base, style, swatch, lod), domain, zone, base,
                     style, swatch, lod, category, covered(base, idx),
                     "covered" if covered(base, idx) else "AUTHOR", used_by])

    # interiors: base × (style if styled) × swatch × lod
    for room, items in ROOMS.items():
        for base in items:
            styles = STYLES if base in STYLED else ["std"]
            for st in styles:
                for sw in SWATCHES:
                    for lod in LODS:
                        emit("interior", room, base, st, sw, lod, "furniture", f"room:{room}")
    # exterior flora: species × season × lod
    for sp in TREE_SPECIES:
        for se_ in SEASONS:
            for lod in LODS: emit("nature", "forest", f"tree_{sp}", "std", se_, lod, "tree", "biome:flora")
    for pl in PLANTS:
        for se_ in SEASONS[:3]:
            for lod in LODS: emit("nature", "ground", pl, "std", se_, lod, "plant", "biome:flora")
    for rk in ROCKS:
        for lod in LODS: emit("nature", "ground", rk, "std", "natural", lod, "rock", "biome:geo")
    for tr in TERRAIN:
        for b in ["temperate","arid","tropical","polar","urban"]:
            emit("nature", "terrain", f"terrain_{tr}", "std", b, "lod0", "floor", "biome:terrain")
    for wa in WATER:
        for lod in LODS: emit("nature", "water", wa, "std", "default", lod, "water", "biome:water")
    # sky / celestial / weather
    for c in CELESTIAL: emit("sky", "celestial", c, "std", "default", "lod0", "fx", "scene:sky")
    for c in CLOUDS:
        for v in ["dawn","day","dusk","night"]: emit("sky", "clouds", c, "std", v, "lod0", "fx", "scene:sky")
    for w in WEATHER_FX: emit("sky", "weather", w, "std", "default", "lod0", "fx", "scene:weather")
    # urban dressing: × swatch(subset) × lod
    for u in URBAN:
        for sw in SWATCHES[:4]:
            for lod in LODS: emit("urban", "street", u, "modern", sw, lod, "prop", "city:dressing")
    # vehicles: × swatch × lod
    for v in VEHICLES:
        for sw in SWATCHES:
            for lod in LODS: emit("vehicle", "road", v, "modern", sw, lod, "vehicle", "city:traffic")
    # buildings: × era × variant × lod
    for b in BUILDING_TYPES:
        for er in ERAS:
            for var in ["a","b","c"]:
                for lod in LODS: emit("building", "city", b, er, var, lod, "building_shell", "city:skyline")
    # characters: build × age × outfit (+ guild flavour on adults)
    for bd in CHARACTER_BUILDS:
        for ag in CHARACTER_AGES:
            for ot in OUTFITS:
                emit("character", "people", f"human_{bd}_{ag}", "modern", ot, "lod0", "character", "crowd")
    for g in SE.GUILDS:
        for ot in ["uniform","formal","casual"]:
            emit("character", "people", f"guild_{g}_member", "modern", ot, "lod0", "character", f"guild:{g}")

    # write BOM
    with open(os.path.join(OUT, "glb_bom.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["glb_id","domain","zone","base_item","style","swatch","lod","category","covered","status","used_by"])
        w.writerows(rows)

    # summary by domain + coverage
    from collections import Counter
    dom = Counter(r[1] for r in rows); auth = sum(1 for r in rows if r[9]=="AUTHOR")
    base_kinds = len({r[3] for r in rows})
    lines = [f"total GLB rows       : {len(rows):,}",
             f"distinct base items  : {base_kinds:,}",
             f"covered              : {len(rows)-auth:,}",
             f"AUTHOR (to build)    : {auth:,}", "by domain:"]
    for d,c in dom.most_common(): lines.append(f"  {d:10s} {c:,}")
    summary = "\n".join(lines)
    print(summary)

    # append to MASTER-GLB-LIST.md
    md = os.path.join(ROOT, "MASTER-GLB-LIST.md")
    pre = open(md).read() if os.path.exists(md) else "# Underworld Minions — MASTER GLB LIST\n"
    block = ("\n\n## Full itemized BOM (glb_bom.csv) — Sims4/GTA5 granularity\n\n"
             f"Every concrete GLB to author/source for the full UE5 world, down to cutlery and "
             f"per-room furniture, plus the whole outside (terrain/flora/sky/sun/moon/stars/weather), "
             f"expanded across style × swatch × LOD (season for flora, era for buildings, "
             f"age/build/outfit for people).\n\n```\n{summary}\n```\n\n"
             "Columns: glb_id, domain, zone/room, base_item, style, swatch, lod, category, covered, "
             "status, used_by. The importer + world/interior spawners consume these by name/category, "
             "so each renders as soon as its GLB lands. Author in the modern-photoreal vibe.\n")
    open(md, "w").write(pre + block)

if __name__ == "__main__":
    main()
