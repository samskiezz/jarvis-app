"""PROMPT ENGINE — a detailed, theme-blended Tripo3D prompt for EVERY asset.

Every prompt explicitly fuses the three references with concrete visual cues:
  • AVATAR (movie)  → bioluminescent organic futurism: glowing teal/violet accents, flowing
                       natural curves, ethereal floating light, living iridescence
  • THE SIMS 4      → warm readable charm: clean friendly silhouettes, cozy inviting materials,
                       soft plumbob-green highlights, approachable scale
  • GTA 5           → gritty grounded realism: weathered modern-urban surfaces, neon signage,
                       lived-in wear, photoreal materials
…then a SPECIFIC description of that exact object, its swatch (albedo), style, era/season, an
emissive clause where neon/holo applies, and a strict PBR/technical clause. Used by the base
generator and stamped onto all BOM rows so every single one is detailed + on-theme.
"""
from __future__ import annotations
import re

THEME = ("a seamless fusion of three styles: the bioluminescent organic futurism of the movie "
         "Avatar (glowing teal and violet accents, flowing natural curves, ethereal floating "
         "light), the warm readable charm of The Sims 4 (clean friendly silhouettes, cozy "
         "inviting materials, soft plumbob-green highlights), and the gritty grounded realism "
         "of GTA 5 (weathered modern-urban surfaces, neon signage, lived-in detail)")

PBR = ("physically based rendering, full PBR texture set (albedo, normal, roughness, metallic, "
       "ambient occlusion, emissive), real-world scale, clean game-ready topology, crisp UVs, "
       "Nanite-ready, photorealistic, studio product shot on plain white background")

# ── specific descriptions for high-frequency items (the fork-and-chair detail) ──────
ITEM_DETAIL = {
    # tableware / kitchen
    "fork": "a slender stainless-steel dinner fork with four polished tines and a balanced handle",
    "dinner_fork": "a full-size stainless dinner fork, mirror-polished, gently tapered tines",
    "knife": "a stainless table knife with a smooth edge and ergonomic handle",
    "spoon": "a stainless soup spoon with a deep rounded bowl and slim handle",
    "teaspoon": "a small stainless teaspoon, delicate and polished",
    "dinner_plate": "a round ceramic dinner plate with a subtle glazed rim",
    "bowl": "a ceramic bowl with smooth curved walls and a glazed interior",
    "mug": "a ceramic coffee mug with a comfortable looped handle",
    "wine_glass": "a thin-stemmed crystal wine glass, elegant bowl, faint refractive sparkle",
    "kettle": "a modern electric kettle with a matte body and illuminated water level",
    "stove": "a sleek induction cooktop with a glass surface and glowing touch controls",
    "fridge": "a tall modern refrigerator with a brushed-metal door and recessed handle",
    "kitchen_counter": "a modern kitchen counter with a stone worktop and handleless cabinets",
    "knife_block": "a wooden knife block holding a matched set of chef knives",
    # seating / tables
    "dining_chair": "an ergonomic dining chair with a contoured seat, curved backrest and tapered legs",
    "armchair": "a plush upholstered armchair with rounded arms and soft cushioning",
    "sofa": "a modern three-seat sofa with deep cushions and slim wooden feet",
    "two_seat_sofa": "a compact two-seat sofa with tufted cushions and clean lines",
    "office_chair": "an ergonomic swivel office chair with a mesh back and gas-lift base",
    "bar_stool": "a tall bar stool with a footrest ring and cushioned round seat",
    "dining_table": "a rectangular dining table with a solid top and sturdy legs",
    "coffee_table": "a low coffee table with a sleek top and slender frame",
    "desk": "a clean modern desk with a wide work surface and integrated cable tray",
    "conference_table": "a long boardroom table with a seamless top and power grommets",
    # bedroom / bath
    "double_bed": "a double bed with an upholstered headboard, plump duvet and pillows",
    "queen_bed": "a queen bed with a tall padded headboard and layered bedding",
    "nightstand": "a bedside nightstand with a single drawer and open shelf",
    "wardrobe": "a tall wardrobe with sliding doors and a matte finish",
    "toilet": "a modern wall-hung toilet with a sleek tank-less ceramic form",
    "bathtub": "a freestanding oval bathtub with smooth curved walls",
    "bathroom_sink": "a wall-mounted ceramic basin with a slim chrome faucet",
    "shower_stall": "a glass shower enclosure with a rainfall head and tiled base",
    # living / decor / office
    "tv": "a large flat-screen wall TV with an ultra-thin bezel and faint screen glow",
    "bookshelf": "a tall open bookshelf filled with assorted books and small objects",
    "floor_lamp": "a slim floor lamp with an arched neck and warm glowing shade",
    "house_plant": "a leafy potted house plant in a ceramic planter",
    "monitor": "a widescreen desktop monitor on a slim stand with a softly lit panel",
    "laptop": "an open thin-and-light laptop with a glowing screen and backlit keys",
    "whiteboard": "a wall whiteboard with a marker tray and faint ghosted writing",
    # medical / lab
    "hospital_bed": "an adjustable hospital bed with side rails and a control panel",
    "operating_table": "a stainless surgical table with articulated sections and a padded top",
    "microscope": "a laboratory microscope with an angled eyepiece and rotating objective turret",
    "centrifuge": "a benchtop centrifuge with a domed lid and digital readout",
    "iv_stand": "a wheeled IV stand with hanging drip bags and a slim pole",
    # retail / restaurant / gym
    "shelf_unit": "a retail shelving unit stocked with neatly faced products",
    "checkout_counter": "a store checkout counter with a register and conveyor strip",
    "restaurant_table": "a bistro restaurant table set for two with cutlery and a small vase",
    "treadmill": "a modern gym treadmill with a digital console and cushioned belt",
    "dumbbell": "a rubber-coated hex dumbbell with a knurled steel handle",
    # urban / vehicles / buildings
    "traffic_light": "a modern traffic light on a steel pole with glowing LED lamps",
    "fire_hydrant": "a cast-iron street fire hydrant with weathered paint",
    "billboard": "a large roadside billboard with a glowing advertising panel",
    "streetlight": "a tall city streetlight with a curved arm and warm LED head",
    "bus_stop_shelter": "a glass bus-stop shelter with a bench and lit route panel",
    "sedan": "a modern four-door sedan with smooth bodywork and LED headlights",
    "city_bus": "a long modern city bus with wide windows and a low floor",
    "police_car": "a modern police patrol car with a light bar and decals",
    "ambulance": "a modern ambulance with a boxy rear cabin and emergency markings",
    "glass_skyscraper": "a soaring glass skyscraper with a white curved crown and sky gardens",
    "apartment_block": "a mid-rise apartment block with stacked balconies and planted terraces",
}

# category → form scaffold for the fallback (still specific)
CAT_FORM = {
    "furniture": "a well-crafted {n} with tactile materials and sculpted, comfortable forms",
    "prop": "a detailed {n} prop with realistic materials and lived-in surface wear",
    "building_shell": ("a multi-storey {n}, white curved sci-fi shell with glass curtain walls "
                       "over a brick-and-concrete base, cascading planted rooftop terraces, a "
                       "holographic waterfall feature and neon plumbob signage, saucer "
                       "observation-deck crown"),
    "tower": "a tall {n} tower with a sleek white-and-glass facade and a glowing rooftop crown",
    "residential": "a modern {n} home exterior with warm windows, balconies and a planted yard",
    "commercial": "a modern {n} storefront with a glazed front, signage and street appeal",
    "civic": "a modern civic {n} building with a welcoming entrance and clean architectural lines",
    "industrial": "a functional {n} structure with exposed steel, ducting and weathered panels",
    "vehicle": "a sleek near-future {n} with aerodynamic bodywork, glowing light strips and realistic wear",
    "character": "a {n} game character with realistic proportions, an expressive face and a modular outfit, rigging-ready",
    "tree": "a {n} with detailed bark, layered wind-catching foliage and faint bioluminescent veins",
    "plant": "a {n} with lush leaves, delicate stems and natural variation",
    "rock": "a {n} natural rock with realistic erosion, lichen and mineral detail",
    "water": "a {n} water feature with rippling translucent surface and subtle caustics",
    "floor": "a {n} ground surface, tileable, with realistic material grain and wear",
    "fx": "a {n} effect element, luminous and volumetric, with soft glowing falloff",
}

# colour-finish phrasing (works on any material, not just wood)
SWATCH_DESC = {
    "oak": "in a warm honey-amber finish",
    "walnut": "in a rich dark-brown finish",
    "white": "in clean matte white",
    "black": "in deep matte black",
    "graphite": "in graphite grey",
    "steel": "in brushed metallic silver",
    "navy": "in deep navy blue",
    "sage": "in muted sage green",
}
STYLE_DESC = {
    "modern": "modern style", "contemporary": "contemporary style",
    "minimalist": "minimalist Scandinavian style, pared-back and clean",
    "industrial": "rugged industrial style with exposed metal and concrete",
    "scandi": "light Scandinavian style with pale wood",
    "luxury": "opulent luxury style with brass trim and premium materials",
}
ERA_DESC = {
    "stone": "primitive stone-age construction", "bronze": "early bronze-age build",
    "iron": "iron-age craftsmanship", "classical": "classical antiquity architecture",
    "medieval": "medieval architecture", "industrial": "industrial-revolution era",
    "modern": "present-day modern build", "future": "sleek far-future high-tech build",
}
SEASON_DESC = {
    "spring": "in fresh spring bloom", "summer": "in full summer green",
    "autumn": "in autumn amber and rust tones", "winter": "bare and frosted for winter",
}


def humanize(s): return re.sub(r"[_\-]+", " ", s).strip()


def base_clause(base_item, category, domain):
    if base_item in ITEM_DETAIL:
        return ITEM_DETAIL[base_item]
    n = humanize(base_item)
    form = CAT_FORM.get(category) or CAT_FORM.get(domain) or "a detailed {n}"
    return form.format(n=n)


def emissive_for(base_item, domain):
    kw = ("sign", "billboard", "neon", "hologram", "holo", "light", "lamp", "screen",
          "display", "led", "aurora", "star", "plasma", "monitor", "tv", "fx")
    return domain in ("sky", "urban") or any(k in base_item for k in kw)


def build_prompt(base_item, category, domain, *, style="modern", swatch="default",
                 lod="lod0", season=None, era=None, context=""):
    parts = [base_clause(base_item, category, domain)]
    if context:
        parts.append(context)   # Underworld function context, e.g. "for crystallography research"
    # variant modifiers (concrete)
    if style and style not in ("std", "modern", "default") and style in STYLE_DESC:
        parts.append(STYLE_DESC[style])
    if swatch in SWATCH_DESC:
        parts.append(SWATCH_DESC[swatch])
    if domain == "building" and era in ERA_DESC and era != "modern":
        parts.append(ERA_DESC[era])
    if domain == "nature" and (season in SEASON_DESC):
        parts.append(SEASON_DESC[season])
    obj = ", ".join(parts)
    obj = re.sub(r"^(a|an|the)\s+", "", obj)   # drop leading article so "Futuristic <obj>" reads right
    emissive = ", with glowing neon and holographic emissive accents" if emissive_for(base_item, domain) else ""
    return f"Futuristic {obj}{emissive}; futuristic design language, {THEME}; {PBR}"
