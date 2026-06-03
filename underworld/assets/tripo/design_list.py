"""The complete Underworld design catalogue — the full world, ordered for build.

Generated in PHASES so the world comes together coherently, exactly as specced:
  1 terrain    → ground, cliffs, water, roads, bridges, fences
  2 nature     → trees, bushes, flowers, crops, rocks
  3 building   → dwellings per epoch + a workshop/lab per guild
  4 civic      → library, university, hospital, market, town hall, observatory…
  5 interior   → modular floors/walls/doors/windows/stairs
  6 furniture  → beds, tables, chairs, kitchen, storage, decor
  7 instrument → microscopes, telescopes, lathes, furnaces, oscilloscopes… per guild
  8 vehicle    → cart → steam loco → car → hover
  9 monument   → obelisks, statues, clock towers, landmarks
 10 prop       → lamps, benches, barrels, market stalls, banners

Every prompt is written for a cohesive, high-fidelity, ray-tracing-friendly look:
clean game-ready topology, PBR materials, readable stylised forms (Sims-4-grade
warmth, not muddy realism). Tagged by epoch (stone→quantum) or 'any' (evergreen).

This is data only — `generate.py` turns each row into a Tripo3D job, dedupes by
id, and runs phases in order. Extend freely.
"""

_STYLE = "game-ready PBR, clean topology, high detail, soft warm lighting, stylised realism, ray-tracing friendly"

# (id, category, epoch_tag, prompt)   — categories drive PHASE order (see PHASE_ORDER)
DESIGNS: list[tuple[str, str, str, str]] = [
    # ── 1. TERRAIN / LANDSCAPE ────────────────────────────────────────────────
    ("ground_grass_tile", "terrain", "any", f"a modular grassy ground tile, seamless edges, {_STYLE}"),
    ("ground_dirt_tile", "terrain", "any", f"a modular dirt ground tile, seamless, {_STYLE}"),
    ("ground_stone_tile", "terrain", "any", f"a modular cobblestone ground tile, seamless, {_STYLE}"),
    ("ground_sand_tile", "terrain", "any", f"a modular sandy ground tile, seamless, {_STYLE}"),
    ("cliff_face", "terrain", "any", f"a rugged rocky cliff face section, modular, {_STYLE}"),
    ("hill_mound", "terrain", "any", f"a gentle grassy hill mound, {_STYLE}"),
    ("boulder_large", "terrain", "any", f"a large mossy boulder, {_STYLE}"),
    ("rock_outcrop", "terrain", "any", f"a natural rock outcrop formation, {_STYLE}"),
    ("riverbank", "terrain", "any", f"a curved riverbank section with reeds, modular, {_STYLE}"),
    ("waterfall", "terrain", "any", f"a small rocky waterfall over a cliff, {_STYLE}"),
    ("pond", "terrain", "any", f"a small natural pond with lily pads, {_STYLE}"),
    ("road_straight", "terrain", "any", f"a straight paved road tile, modular, {_STYLE}"),
    ("road_corner", "terrain", "any", f"a corner paved road tile, modular, {_STYLE}"),
    ("road_cross", "terrain", "any", f"a four-way crossroads paved road tile, modular, {_STYLE}"),
    ("dirt_path", "terrain", "any", f"a worn dirt footpath tile, modular, {_STYLE}"),
    ("stone_bridge", "terrain", "iron", f"an arched stone bridge over a river, {_STYLE}"),
    ("wooden_bridge", "terrain", "bronze", f"a simple wooden plank bridge, {_STYLE}"),
    ("fence_wood", "terrain", "any", f"a section of wooden post-and-rail fence, modular, {_STYLE}"),
    ("stone_wall", "terrain", "any", f"a section of dry-stone wall, modular, {_STYLE}"),
    ("town_gate", "terrain", "iron", f"a fortified town gate with timber doors, {_STYLE}"),

    # ── 2. NATURE ─────────────────────────────────────────────────────────────
    ("tree_oak", "nature", "any", f"a lush oak tree with rounded canopy, {_STYLE}"),
    ("tree_pine", "nature", "any", f"a tall pine tree, {_STYLE}"),
    ("tree_birch", "nature", "any", f"a slender birch tree, {_STYLE}"),
    ("tree_willow", "nature", "any", f"a drooping willow tree by water, {_STYLE}"),
    ("tree_palm", "nature", "any", f"a coastal palm tree, {_STYLE}"),
    ("tree_dead", "nature", "any", f"a bare twisted dead tree, {_STYLE}"),
    ("bush_round", "nature", "any", f"a rounded green shrub bush, {_STYLE}"),
    ("fern", "nature", "any", f"a leafy forest fern, {_STYLE}"),
    ("flower_red", "nature", "any", f"a cluster of red wildflowers, {_STYLE}"),
    ("flower_mixed_bed", "nature", "any", f"a colourful mixed flower bed, {_STYLE}"),
    ("grass_tuft", "nature", "any", f"a tuft of tall meadow grass, {_STYLE}"),
    ("crop_wheat", "nature", "bronze", f"a bundle of golden wheat stalks, {_STYLE}"),
    ("crop_corn", "nature", "bronze", f"a row of tall corn plants, {_STYLE}"),
    ("mushroom_cluster", "nature", "any", f"a cluster of forest mushrooms, {_STYLE}"),
    ("tree_stump", "nature", "any", f"a cut tree stump with rings, {_STYLE}"),
    ("log_fallen", "nature", "any", f"a fallen mossy log, {_STYLE}"),

    # ── 3. BUILDINGS: dwellings per epoch ─────────────────────────────────────
    ("hut_stone", "building", "stone", f"a stone-age thatched hut, {_STYLE}"),
    ("house_bronze", "building", "bronze", f"a bronze-age mud-brick house with courtyard, {_STYLE}"),
    ("cottage_iron", "building", "iron", f"an iron-age timber-and-stone cottage with tiled roof, {_STYLE}"),
    ("house_medieval", "building", "iron", f"a medieval half-timbered house, {_STYLE}"),
    ("townhouse_industrial", "building", "industrial", f"a Victorian brick townhouse with chimneys, {_STYLE}"),
    ("home_modern", "building", "information", f"a modern suburban family home with garden, {_STYLE}"),
    ("apartment_modern", "building", "information", f"a small modern low-rise apartment block, {_STYLE}"),
    ("habitat_quantum", "building", "quantum", f"a sleek near-future smart home with solar roof and glowing accents, {_STYLE}"),
    # ── 3b. BUILDINGS: a workshop/lab per guild ───────────────────────────────
    ("guild_physics_lab", "building", "industrial", f"a physics research laboratory building with tall windows, {_STYLE}"),
    ("guild_maths_academy", "building", "iron", f"a stately mathematics academy with columns, {_STYLE}"),
    ("guild_electrical_workshop", "building", "industrial", f"an electrical engineering workshop with cables and panels, {_STYLE}"),
    ("guild_mechanical_workshop", "building", "industrial", f"a mechanical workshop with a sawtooth factory roof, {_STYLE}"),
    ("guild_civil_yard", "building", "industrial", f"a civil-engineering yard with a site office and crane, {_STYLE}"),
    ("guild_materials_forge", "building", "iron", f"a materials foundry with a tall brick chimney, {_STYLE}"),
    ("guild_computing_hall", "building", "information", f"a modern computing data-hall with server cooling, {_STYLE}"),
    ("guild_energy_plant", "building", "industrial", f"an energy plant with cooling towers, {_STYLE}"),
    ("guild_agriculture_barn", "building", "bronze", f"a large farm barn with hayloft, {_STYLE}"),
    ("guild_patent_office", "building", "industrial", f"a dignified patent-office building with arched entrance, {_STYLE}"),
    ("guild_safety_station", "building", "industrial", f"a safety-inspection station with signage, {_STYLE}"),

    # ── 4. CIVIC ──────────────────────────────────────────────────────────────
    ("library", "civic", "industrial", f"a grand library with columns and warm interior light, {_STYLE}"),
    ("university", "civic", "industrial", f"a university hall with a domed roof, {_STYLE}"),
    ("hospital", "civic", "information", f"a clean modern hospital building, {_STYLE}"),
    ("market_hall", "civic", "iron", f"a covered market hall with stalls, {_STYLE}"),
    ("town_hall", "civic", "iron", f"an ornate town hall with a clock, {_STYLE}"),
    ("school", "civic", "industrial", f"a friendly schoolhouse with a bell, {_STYLE}"),
    ("temple", "civic", "bronze", f"an ancient stone temple with steps, {_STYLE}"),
    ("observatory", "civic", "industrial", f"an astronomical observatory with a domed telescope roof, {_STYLE}"),
    ("museum", "civic", "industrial", f"a museum building with a grand facade, {_STYLE}"),
    ("granary", "civic", "bronze", f"a round stone granary store, {_STYLE}"),
    ("water_tower", "civic", "industrial", f"a tall steel water tower, {_STYLE}"),

    # ── 5. INTERIOR (modular kit) ─────────────────────────────────────────────
    ("floor_wood", "interior", "any", f"a modular wooden plank floor tile, {_STYLE}"),
    ("floor_tile", "interior", "any", f"a modular ceramic tiled floor piece, {_STYLE}"),
    ("wall_plaster", "interior", "any", f"a modular plastered interior wall panel, {_STYLE}"),
    ("wall_brick", "interior", "any", f"a modular exposed-brick interior wall panel, {_STYLE}"),
    ("doorway_wood", "interior", "any", f"a wooden interior doorway with door, {_STYLE}"),
    ("window_frame", "interior", "any", f"a glazed window frame, {_STYLE}"),
    ("staircase", "interior", "any", f"a wooden interior staircase, {_STYLE}"),
    ("pillar", "interior", "iron", f"a stone interior support pillar, {_STYLE}"),
    ("roof_beams", "interior", "any", f"exposed wooden roof beams section, {_STYLE}"),
    ("fireplace", "interior", "iron", f"a brick fireplace with mantel, {_STYLE}"),

    # ── 6. FURNITURE ──────────────────────────────────────────────────────────
    ("bed_double", "furniture", "any", f"a cosy double bed with blankets, {_STYLE}"),
    ("bed_bunk", "furniture", "any", f"a wooden bunk bed, {_STYLE}"),
    ("table_dining", "furniture", "any", f"a round wooden dining table, {_STYLE}"),
    ("table_coffee", "furniture", "any", f"a low coffee table, {_STYLE}"),
    ("desk", "furniture", "any", f"a wooden writing desk, {_STYLE}"),
    ("chair_dining", "furniture", "any", f"a simple wooden dining chair, {_STYLE}"),
    ("chair_office", "furniture", "information", f"a modern office swivel chair, {_STYLE}"),
    ("armchair", "furniture", "any", f"a comfy upholstered armchair, {_STYLE}"),
    ("stool", "furniture", "any", f"a wooden stool, {_STYLE}"),
    ("sofa", "furniture", "industrial", f"a two-seater fabric sofa, {_STYLE}"),
    ("bookshelf", "furniture", "any", f"a tall bookshelf full of books, {_STYLE}"),
    ("wardrobe", "furniture", "any", f"a wooden wardrobe, {_STYLE}"),
    ("dresser", "furniture", "any", f"a chest of drawers, {_STYLE}"),
    ("kitchen_counter", "furniture", "any", f"a kitchen counter with sink and cabinets, {_STYLE}"),
    ("stove", "furniture", "industrial", f"a kitchen stove with oven, {_STYLE}"),
    ("fridge", "furniture", "information", f"a kitchen refrigerator, {_STYLE}"),
    ("bathtub", "furniture", "industrial", f"a clawfoot bathtub, {_STYLE}"),
    ("toilet", "furniture", "industrial", f"a ceramic toilet, {_STYLE}"),
    ("rug", "furniture", "any", f"a patterned floor rug, {_STYLE}"),
    ("lamp_floor", "furniture", "industrial", f"a standing floor lamp with warm glow, {_STYLE}"),
    ("lamp_desk", "furniture", "industrial", f"a desk lamp, {_STYLE}"),
    ("plant_pot", "furniture", "any", f"a potted indoor plant, {_STYLE}"),
    ("painting", "furniture", "any", f"a framed wall painting, {_STYLE}"),
    ("wall_clock", "furniture", "iron", f"a round wall clock, {_STYLE}"),

    # ── 7. INSTRUMENTS / GUILD EQUIPMENT (microscopes etc.) ───────────────────
    # microscopes + general lab
    ("microscope_light", "instrument", "industrial", f"a brass optical light microscope, {_STYLE}"),
    ("microscope_electron", "instrument", "information", f"a modern electron microscope console, {_STYLE}"),
    ("telescope_optical", "instrument", "industrial", f"a large optical telescope on a mount, {_STYLE}"),
    ("spectrometer", "instrument", "information", f"a benchtop spectrometer instrument, {_STYLE}"),
    ("centrifuge", "instrument", "information", f"a laboratory centrifuge, {_STYLE}"),
    ("fume_hood", "instrument", "information", f"a laboratory fume hood, {_STYLE}"),
    ("lab_bench", "instrument", "industrial", f"a laboratory bench with shelves of glassware, {_STYLE}"),
    ("beaker_set", "instrument", "iron", f"a set of glass beakers and flasks on a rack, {_STYLE}"),
    ("bunsen_burner", "instrument", "industrial", f"a bunsen burner with stand, {_STYLE}"),
    # physics
    ("optical_bench", "instrument", "industrial", f"a physics optical bench with lenses and laser, {_STYLE}"),
    ("vacuum_chamber", "instrument", "information", f"a steel vacuum chamber apparatus, {_STYLE}"),
    ("oscilloscope", "instrument", "industrial", f"a benchtop oscilloscope with screen, {_STYLE}"),
    ("pendulum_rig", "instrument", "iron", f"a tall pendulum experiment rig, {_STYLE}"),
    ("particle_detector", "instrument", "information", f"a cylindrical particle detector, {_STYLE}"),
    # maths
    ("chalkboard", "instrument", "iron", f"a large chalkboard on a stand covered in equations, {_STYLE}"),
    ("abacus", "instrument", "bronze", f"a wooden abacus, {_STYLE}"),
    ("calculating_machine", "instrument", "industrial", f"a brass mechanical calculating machine, {_STYLE}"),
    ("drafting_table", "instrument", "industrial", f"an angled drafting table with instruments, {_STYLE}"),
    # electrical
    ("multimeter", "instrument", "industrial", f"a handheld multimeter, {_STYLE}"),
    ("breadboard_rig", "instrument", "information", f"an electronics breadboard prototyping rig, {_STYLE}"),
    ("soldering_station", "instrument", "information", f"a soldering station with iron, {_STYLE}"),
    ("transformer_unit", "instrument", "industrial", f"an electrical transformer unit, {_STYLE}"),
    # mechanical
    ("lathe", "instrument", "industrial", f"a metalworking lathe machine, {_STYLE}"),
    ("milling_machine", "instrument", "industrial", f"a vertical milling machine, {_STYLE}"),
    ("drill_press", "instrument", "industrial", f"a floor-standing drill press, {_STYLE}"),
    ("workbench_vice", "instrument", "iron", f"a sturdy workbench with a metal vice, {_STYLE}"),
    ("gear_assembly", "instrument", "industrial", f"an interlocking brass gear assembly, {_STYLE}"),
    # civil
    ("theodolite", "instrument", "industrial", f"a surveyor's theodolite on a tripod, {_STYLE}"),
    ("concrete_mixer", "instrument", "industrial", f"a portable concrete mixer, {_STYLE}"),
    ("scaffolding", "instrument", "industrial", f"a section of metal scaffolding, {_STYLE}"),
    ("blueprint_table", "instrument", "industrial", f"a table covered with rolled blueprints, {_STYLE}"),
    # materials
    ("forge_furnace", "instrument", "iron", f"a glowing blacksmith forge furnace, {_STYLE}"),
    ("anvil", "instrument", "iron", f"a blacksmith's anvil on a stump, {_STYLE}"),
    ("crucible", "instrument", "iron", f"a ceramic smelting crucible with tongs, {_STYLE}"),
    ("tensile_tester", "instrument", "information", f"a materials tensile-testing machine, {_STYLE}"),
    ("xrd_machine", "instrument", "information", f"an X-ray diffractometer instrument, {_STYLE}"),
    # computing
    ("server_rack", "instrument", "information", f"a tall server rack with blinking lights, {_STYLE}"),
    ("workstation", "instrument", "information", f"a computer workstation with monitors, {_STYLE}"),
    ("mainframe", "instrument", "information", f"a vintage mainframe computer cabinet, {_STYLE}"),
    ("quantum_computer", "instrument", "quantum", f"a quantum computer with a golden dilution-fridge chandelier, {_STYLE}"),
    # energy
    ("wind_turbine", "instrument", "information", f"a tall white wind turbine, {_STYLE}"),
    ("solar_array", "instrument", "information", f"a tilted solar panel array, {_STYLE}"),
    ("battery_bank", "instrument", "information", f"a bank of industrial batteries, {_STYLE}"),
    ("generator", "instrument", "industrial", f"a diesel electrical generator unit, {_STYLE}"),
    ("reactor_model", "instrument", "quantum", f"a compact fusion reactor torus model, {_STYLE}"),
    # agriculture
    ("plough", "instrument", "bronze", f"a wooden ox plough, {_STYLE}"),
    ("irrigation_pump", "instrument", "industrial", f"a hand irrigation water pump, {_STYLE}"),
    ("greenhouse", "instrument", "industrial", f"a glass greenhouse with planting beds, {_STYLE}"),
    ("harvester", "instrument", "information", f"a small combine harvester, {_STYLE}"),

    # ── 8. VEHICLES ───────────────────────────────────────────────────────────
    ("cart_wooden", "vehicle", "bronze", f"a wooden two-wheel hand cart, {_STYLE}"),
    ("chariot", "vehicle", "iron", f"a two-wheeled war chariot, {_STYLE}"),
    ("bicycle", "vehicle", "industrial", f"a vintage bicycle, {_STYLE}"),
    ("steam_loco", "vehicle", "industrial", f"a charming small steam locomotive, {_STYLE}"),
    ("car_modern", "vehicle", "information", f"a friendly rounded modern compact car, {_STYLE}"),
    ("hover_pod", "vehicle", "quantum", f"a sleek near-future hover pod vehicle, {_STYLE}"),

    # ── 9. MONUMENTS / LANDMARKS ──────────────────────────────────────────────
    ("obelisk", "monument", "bronze", f"a carved stone obelisk, {_STYLE}"),
    ("hero_statue", "monument", "iron", f"a bronze hero statue on a plinth, {_STYLE}"),
    ("clock_tower", "monument", "industrial", f"a tall ornate town clock tower, {_STYLE}"),
    ("victory_arch", "monument", "iron", f"a triumphal stone arch, {_STYLE}"),
    ("lighthouse", "monument", "industrial", f"a striped coastal lighthouse, {_STYLE}"),
    ("fountain", "monument", "iron", f"a tiered stone town-square fountain, {_STYLE}"),

    # ── 10. PROPS ─────────────────────────────────────────────────────────────
    ("street_lamp", "prop", "industrial", f"an ornate cast-iron street lamp with warm light, {_STYLE}"),
    ("park_bench", "prop", "any", f"a wooden park bench, {_STYLE}"),
    ("signpost", "prop", "any", f"a wooden directional signpost, {_STYLE}"),
    ("barrel", "prop", "any", f"a wooden storage barrel, {_STYLE}"),
    ("crate", "prop", "any", f"a wooden shipping crate, {_STYLE}"),
    ("well", "prop", "bronze", f"a stone water well with a bucket, {_STYLE}"),
    ("market_stall", "prop", "bronze", f"a wooden market stall with striped awning and produce, {_STYLE}"),
    ("banner", "prop", "iron", f"a hanging guild banner, {_STYLE}"),
    ("brazier", "prop", "iron", f"an iron fire brazier, {_STYLE}"),
    ("haystack", "prop", "bronze", f"a round haystack, {_STYLE}"),
]

# Build order: terrain first, then the world fills in, instruments dress the labs.
PHASE_ORDER = ["terrain", "nature", "building", "civic", "interior",
               "furniture", "instrument", "vehicle", "monument", "prop"]


def designs_for(epoch_tag: str | None = None) -> list[tuple[str, str, str, str]]:
    """All designs (or one epoch + evergreens), sorted into build-phase order."""
    items = DESIGNS if epoch_tag is None else [d for d in DESIGNS if d[2] in (epoch_tag, "any")]
    return sorted(items, key=lambda d: (PHASE_ORDER.index(d[1]) if d[1] in PHASE_ORDER else 99, d[0]))
