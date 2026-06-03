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

# ── 11. FX / HERO DETAIL — the "Avatar-grade" cinematic layer ─────────────────
# High-detail, glowing, exotic and floating set pieces that lift the world from
# "nice" to "cinematic". These are static high-poly GLBs with PBR + emissive
# materials; the volumetric glow, particles and ray-traced bounce come from the
# UE5 renderer on top (Lumen + Niagara) — these meshes give it something gorgeous
# to light.
_FX = "cinematic high detail, lush, intricate, PBR with subtle emissive glow, ray-tracing friendly, fantasy-sci-fi"
DESIGNS += [
    # bioluminescent flora
    ("fx_glowing_mushroom", "fx", "any", f"a cluster of bioluminescent glowing mushrooms, soft cyan light, {_FX}"),
    ("fx_spirit_tree", "fx", "any", f"a majestic ancient tree with glowing leaves and luminous bark, {_FX}"),
    ("fx_lumino_fern", "fx", "any", f"a luminous fern with softly glowing fronds, {_FX}"),
    ("fx_glow_flowers", "fx", "any", f"a bed of glowing exotic flowers with light-emitting petals, {_FX}"),
    ("fx_hanging_vines", "fx", "any", f"cascading hanging vines with tiny glowing buds, {_FX}"),
    ("fx_giant_lilypad", "fx", "any", f"oversized lily pads with bioluminescent veins on dark water, {_FX}"),
    ("fx_pod_plant", "fx", "any", f"an exotic alien seed-pod plant that glows from within, {_FX}"),
    # crystals + energy
    ("fx_crystal_cluster", "fx", "any", f"a cluster of glowing translucent crystals, refractive, {_FX}"),
    ("fx_floating_crystal", "fx", "quantum", f"a slowly hovering luminous crystal shard, {_FX}"),
    ("fx_energy_core", "fx", "quantum", f"a pulsing spherical energy core in a metal frame, {_FX}"),
    ("fx_geode", "fx", "any", f"a large split geode lined with glowing amethyst crystals, {_FX}"),
    ("fx_power_conduit", "fx", "quantum", f"a glowing energy conduit pillar with flowing light, {_FX}"),
    ("fx_rune_stone", "fx", "iron", f"a standing stone carved with softly glowing runes, {_FX}"),
    # floating / exotic terrain
    ("fx_floating_island", "fx", "quantum", f"a small floating island of rock with grass and a tiny waterfall, {_FX}"),
    ("fx_hover_boulder", "fx", "quantum", f"a large boulder hovering with glowing underside, {_FX}"),
    ("fx_rock_arch", "fx", "any", f"a dramatic natural rock arch with glowing moss, {_FX}"),
    ("fx_glowing_waterfall", "fx", "any", f"a tall waterfall over a cliff with luminous blue water and mist, {_FX}"),
    ("fx_mist_pool", "fx", "any", f"a glowing hot-spring pool with rising mist, {_FX}"),
    ("fx_giant_mushroom", "fx", "any", f"a giant fantasy mushroom the size of a tree, glowing cap, {_FX}"),
    # ornate hero buildings / landmarks
    ("fx_crystal_spire", "fx", "quantum", f"a soaring crystalline spire tower that catches the light, {_FX}"),
    ("fx_grand_palace", "fx", "industrial", f"an opulent grand palace with golden domes and ornate carvings, {_FX}"),
    ("fx_cathedral", "fx", "iron", f"a vast gothic cathedral with stained-glass windows glowing from within, {_FX}"),
    ("fx_wizard_tower", "fx", "iron", f"a tall crooked mage's tower topped with a glowing orb, {_FX}"),
    ("fx_temple_of_light", "fx", "bronze", f"an ancient temple with a beam of light from its apex, {_FX}"),
    ("fx_world_tree_hall", "fx", "quantum", f"a grand hall grown into a colossal glowing world-tree, {_FX}"),
    # atmospheric props / lighting
    ("fx_floating_lantern", "fx", "any", f"a glowing paper lantern floating in the air, warm light, {_FX}"),
    ("fx_light_orb", "fx", "quantum", f"a hovering orb of soft light on a delicate stand, {_FX}"),
    ("fx_fire_pit", "fx", "stone", f"a stone fire pit with glowing embers and flame, {_FX}"),
    ("fx_torch_brazier", "fx", "iron", f"an ornate wall brazier with bright flame, {_FX}"),
    ("fx_glow_lamppost", "fx", "industrial", f"an elegant lamppost with a warm glowing globe and filigree, {_FX}"),
    # sci-fi / high-tech set dressing
    ("fx_hologram", "fx", "quantum", f"a holographic projector emitting a glowing 3D display, {_FX}"),
    ("fx_energy_pylon", "fx", "quantum", f"a tall energy pylon arcing with electricity, {_FX}"),
    ("fx_antigrav_pad", "fx", "quantum", f"a circular anti-gravity platform glowing blue underneath, {_FX}"),
    ("fx_neon_sign", "fx", "information", f"a vibrant neon shop sign, {_FX}"),
    ("fx_plasma_lamp", "fx", "quantum", f"a plasma globe lamp with arcing tendrils of light, {_FX}"),
    # detailed nature set pieces
    ("fx_jungle_cluster", "fx", "any", f"a lush dense jungle plant cluster with broad leaves, {_FX}"),
    ("fx_flowering_wall", "fx", "any", f"a wall covered in cascading flowering vines, {_FX}"),
    ("fx_moss_statue", "fx", "iron", f"a weathered stone statue overgrown with glowing moss, {_FX}"),
    ("fx_dragon_statue", "fx", "iron", f"an ornate coiled stone dragon statue, intricate scales, {_FX}"),
    ("fx_ancient_roots", "fx", "any", f"a tangle of massive ancient tree roots with glowing sap, {_FX}"),
]

# ── 12. OBJECTS / HANDHELD TOOLS / CONSUMABLES (immersive interactions) ───────
# The things Minions actually pick up, read, eat and operate through a day —
# referenced by interactions.py so every action a Minion takes has a real prop.
DESIGNS += [
    ("meal_plate", "object", "any", f"a plate of cooked food with vegetables, {_STYLE}"),
    ("bread_loaf", "object", "any", f"a rustic loaf of bread, {_STYLE}"),
    ("fruit_bowl", "object", "any", f"a bowl of mixed fruit, {_STYLE}"),
    ("mug", "object", "any", f"a ceramic mug of hot drink, {_STYLE}"),
    ("book_open", "object", "any", f"an open hardcover book with visible pages, {_STYLE}"),
    ("scroll", "object", "iron", f"a partially unrolled parchment scroll, {_STYLE}"),
    ("keyboard", "object", "information", f"a computer keyboard, {_STYLE}"),
    ("laptop", "object", "information", f"an open laptop computer, {_STYLE}"),
    ("tablet_device", "object", "information", f"a handheld tablet device with a glowing screen, {_STYLE}"),
    ("hammer", "object", "iron", f"a blacksmith's hammer with a wooden handle, {_STYLE}"),
    ("wrench", "object", "industrial", f"a steel adjustable wrench, {_STYLE}"),
    ("screwdriver", "object", "industrial", f"a screwdriver, {_STYLE}"),
    ("magnifying_glass", "object", "industrial", f"a brass magnifying glass, {_STYLE}"),
    ("slide_rule", "object", "industrial", f"a vintage slide rule, {_STYLE}"),
    ("scythe", "object", "bronze", f"a farming scythe, {_STYLE}"),
    ("watering_can", "object", "bronze", f"a metal watering can, {_STYLE}"),
    ("trowel", "object", "industrial", f"a bricklayer's trowel, {_STYLE}"),
    ("clipboard", "object", "industrial", f"a clipboard with papers, {_STYLE}"),
    ("stamp", "object", "industrial", f"an official rubber stamp and ink pad, {_STYLE}"),
    ("hard_hat", "object", "industrial", f"a safety hard hat, {_STYLE}"),
    ("meditation_cushion", "object", "any", f"a round floor meditation cushion, {_STYLE}"),
    ("lectern", "object", "iron", f"a wooden lectern with an open book, {_STYLE}"),
    ("archive_cabinet", "object", "industrial", f"a wooden filing/archive cabinet, {_STYLE}"),
    ("patent_scanner", "object", "information", f"a futuristic desktop patent-scanner device with a glowing slot, {_STYLE}"),
    ("candle", "object", "iron", f"a lit candle in a holder, {_STYLE}"),
    ("quill_ink", "object", "iron", f"a quill pen and ink pot, {_STYLE}"),
]

# ── 13. HOUSEHOLD — cooking, washing, sleeping, hygiene, leisure ──────────────
DESIGNS += [
    ("cooking_pot", "household", "any", f"a cast-iron cooking pot on a hook, {_STYLE}"),
    ("frying_pan", "household", "any", f"a frying pan with a handle, {_STYLE}"),
    ("cutting_board", "household", "any", f"a wooden cutting board with a knife and vegetables, {_STYLE}"),
    ("cutlery_set", "household", "any", f"a fork, knife and spoon set, {_STYLE}"),
    ("water_glass", "household", "any", f"a glass of water, {_STYLE}"),
    ("kettle", "household", "industrial", f"a metal kettle, {_STYLE}"),
    ("cupboard", "household", "any", f"a kitchen cupboard with dishes, {_STYLE}"),
    ("sink_basin", "household", "industrial", f"a kitchen sink basin with a tap, {_STYLE}"),
    ("washbasin", "household", "iron", f"a ceramic washbasin and jug, {_STYLE}"),
    ("shower", "household", "information", f"a modern shower cubicle, {_STYLE}"),
    ("towel_rack", "household", "any", f"a towel rack with hanging towels, {_STYLE}"),
    ("mirror_stand", "household", "any", f"a standing mirror, {_STYLE}"),
    ("pillow_blanket", "household", "any", f"a pillow and folded blanket, {_STYLE}"),
    ("wardrobe_open", "household", "any", f"an open wardrobe with hanging clothes, {_STYLE}"),
    ("laundry_basket", "household", "any", f"a wicker laundry basket with clothes, {_STYLE}"),
    ("broom_bucket", "household", "any", f"a broom and cleaning bucket, {_STYLE}"),
    ("radio_set", "household", "industrial", f"a vintage wooden radio set, {_STYLE}"),
    ("television", "household", "information", f"a flat-screen television on a stand, {_STYLE}"),
    ("board_game", "household", "any", f"a board game laid out on a table, {_STYLE}"),
    ("guitar", "household", "industrial", f"an acoustic guitar, {_STYLE}"),

    # ── 14. COMMUNITY & ECONOMY ──────────────────────────────────────────────
    ("shop_counter", "community", "iron", f"a shop counter with a till, {_STYLE}"),
    ("coin_pile", "community", "bronze", f"a small pile of gold coins, {_STYLE}"),
    ("coin_purse", "community", "iron", f"a leather coin purse, {_STYLE}"),
    ("crate_goods", "community", "any", f"a crate of trade goods, {_STYLE}"),
    ("produce_basket", "community", "bronze", f"a basket of fresh produce, {_STYLE}"),
    ("tavern_bar", "community", "iron", f"a wooden tavern bar with mugs and barrels, {_STYLE}"),
    ("tavern_table", "community", "iron", f"a tavern table with benches and tankards, {_STYLE}"),
    ("notice_board", "community", "iron", f"a town notice board with pinned papers, {_STYLE}"),
    ("scales_balance", "community", "bronze", f"a merchant's brass balance scale, {_STYLE}"),
    ("stall_canopy", "community", "bronze", f"a striped market stall canopy with goods, {_STYLE}"),

    # ── 15. MEDICAL / HEALTH ─────────────────────────────────────────────────
    ("hospital_bed", "medical", "industrial", f"a hospital bed with rails, {_STYLE}"),
    ("medicine_cabinet", "medical", "industrial", f"a medicine cabinet with bottles, {_STYLE}"),
    ("iv_stand", "medical", "information", f"an IV drip stand, {_STYLE}"),
    ("stretcher", "medical", "industrial", f"a wheeled medical stretcher, {_STYLE}"),
    ("apothecary_shelf", "medical", "iron", f"an apothecary shelf of potion bottles and herbs, {_STYLE}"),
    ("surgical_table", "medical", "information", f"a stainless surgical table with a light, {_STYLE}"),
    ("first_aid_kit", "medical", "information", f"a first-aid kit, {_STYLE}"),
    ("petri_dish", "medical", "information", f"a stack of petri dishes with cultures, {_STYLE}"),
    ("pipette", "medical", "information", f"a laboratory pipette, {_STYLE}"),
    ("dna_sequencer", "medical", "information", f"a benchtop DNA sequencer, {_STYLE}"),

    # ── 16. AGRICULTURE / FOOD PRODUCTION ────────────────────────────────────
    ("seed_sack", "agri", "bronze", f"an open sack of grain seeds, {_STYLE}"),
    ("hay_bale", "agri", "bronze", f"a rectangular hay bale, {_STYLE}"),
    ("animal_pen", "agri", "bronze", f"a wooden livestock pen with a gate, {_STYLE}"),
    ("cow", "agri", "bronze", f"a standing dairy cow, {_STYLE}"),
    ("sheep", "agri", "bronze", f"a woolly sheep, {_STYLE}"),
    ("chicken", "agri", "bronze", f"a hen chicken, {_STYLE}"),
    ("water_trough", "agri", "bronze", f"a wooden water trough, {_STYLE}"),
    ("fishing_boat", "agri", "iron", f"a small wooden fishing boat with nets, {_STYLE}"),
    ("orchard_tree", "agri", "bronze", f"a fruit-laden apple orchard tree, {_STYLE}"),
    ("silo", "agri", "industrial", f"a tall metal grain silo, {_STYLE}"),

    # ── 17. CULTURE / RELIGION / ART ─────────────────────────────────────────
    ("altar", "culture", "bronze", f"a stone offering altar with candles, {_STYLE}"),
    ("idol_statue", "culture", "bronze", f"a carved religious idol statue, {_STYLE}"),
    ("painting_easel", "culture", "industrial", f"an artist's easel with a canvas and palette, {_STYLE}"),
    ("pottery_wheel", "culture", "bronze", f"a potter's wheel with clay, {_STYLE}"),
    ("loom", "culture", "bronze", f"a wooden weaving loom with thread, {_STYLE}"),
    ("drum", "culture", "stone", f"a hide hand drum, {_STYLE}"),
    ("lute", "culture", "iron", f"a wooden lute, {_STYLE}"),
    ("scroll_rack", "culture", "iron", f"a rack of stored scrolls, {_STYLE}"),
    ("statue_pedestal", "culture", "iron", f"an empty ornate statue pedestal, {_STYLE}"),
    ("incense_burner", "culture", "bronze", f"a hanging incense burner with smoke, {_STYLE}"),

    # ── 18. FAMILY / SCHOOL / CHILDREN ───────────────────────────────────────
    ("cradle", "family", "any", f"a wooden baby cradle, {_STYLE}"),
    ("toy_blocks", "family", "any", f"a pile of children's wooden toy blocks, {_STYLE}"),
    ("rocking_horse", "family", "iron", f"a wooden rocking horse, {_STYLE}"),
    ("school_desk", "family", "industrial", f"a child's school desk with a slate, {_STYLE}"),
    ("playground_swing", "family", "industrial", f"a playground swing set, {_STYLE}"),
    ("ball", "family", "any", f"a simple play ball, {_STYLE}"),

    # ── 19. COMMUNICATION / INFRASTRUCTURE / UTILITY ─────────────────────────
    ("telegraph", "infra", "industrial", f"a telegraph key and machine on a desk, {_STYLE}"),
    ("telephone_old", "infra", "industrial", f"a vintage candlestick telephone, {_STYLE}"),
    ("printing_press", "infra", "industrial", f"a cast-iron printing press, {_STYLE}"),
    ("mailbox", "infra", "industrial", f"a public post mailbox, {_STYLE}"),
    ("radio_tower", "infra", "information", f"a tall radio broadcast tower, {_STYLE}"),
    ("power_pole", "infra", "industrial", f"a wooden electrical power pole with wires, {_STYLE}"),
    ("water_pump_well", "infra", "industrial", f"a cast-iron street water pump, {_STYLE}"),
    ("windmill", "infra", "iron", f"a traditional windmill, {_STYLE}"),
    ("watermill", "infra", "iron", f"a watermill with a turning wheel, {_STYLE}"),
    ("dock_pier", "infra", "iron", f"a wooden harbour dock pier, {_STYLE}"),
    ("rowboat", "infra", "iron", f"a small wooden rowboat, {_STYLE}"),
    ("rail_track", "infra", "industrial", f"a section of railway track, modular, {_STYLE}"),
    ("carriage", "infra", "industrial", f"a horse-drawn passenger carriage, {_STYLE}"),
    ("solar_streetlight", "infra", "quantum", f"a modern solar-powered street light, {_STYLE}"),

    # ── 20. SAFETY / DEFENCE (safety guild) ──────────────────────────────────
    ("fire_extinguisher", "safety", "information", f"a red fire extinguisher, {_STYLE}"),
    ("warning_sign", "safety", "industrial", f"a hazard warning sign on a post, {_STYLE}"),
    ("barrier", "safety", "industrial", f"a striped safety barrier, {_STYLE}"),
    ("watchtower", "safety", "iron", f"a wooden guard watchtower, {_STYLE}"),
]

# ══════════════════════════════════════════════════════════════════════════════
# DEPTH PASS — every simulation system made visible. Each row is justified by a
# real symbol in the backend (cited in the comment), from a full audit of the
# guilds, instruments, actions, epochs, sagas, roles, biomes and lifecycle.
# ══════════════════════════════════════════════════════════════════════════════

# ── 21. GUILD IDENTITY — banners, crests, review (server/agents/guilds.py) ────
DESIGNS += [
    ("guild_banner_maths", "prop", "iron", f"a heraldic banner with a golden compass-and-pi mathematics emblem, {_STYLE}"),
    ("guild_banner_physics", "prop", "iron", f"a heraldic banner with an orbiting-atom physics emblem, {_STYLE}"),
    ("guild_banner_electrical", "prop", "iron", f"a heraldic banner with a lightning-bolt electrical emblem, {_STYLE}"),
    ("guild_banner_mechanical", "prop", "iron", f"a heraldic banner with a cog-and-piston mechanical emblem, {_STYLE}"),
    ("guild_banner_computing", "prop", "information", f"a heraldic banner with a circuit-tree computing emblem, {_STYLE}"),
    ("guild_banner_civil", "prop", "iron", f"a heraldic banner with an arch-and-compass civil-engineering emblem, {_STYLE}"),
    ("guild_banner_materials", "prop", "iron", f"a heraldic banner with a crucible-and-crystal materials emblem, {_STYLE}"),
    ("guild_banner_energy", "prop", "industrial", f"a heraldic banner with a sun-and-turbine energy emblem, {_STYLE}"),
    ("guild_banner_agriculture", "prop", "bronze", f"a heraldic banner with a wheat-sheaf agriculture emblem, {_STYLE}"),
    ("guild_banner_patent", "prop", "industrial", f"a heraldic banner with a quill-and-seal patent emblem, {_STYLE}"),
    ("guild_banner_safety", "prop", "industrial", f"a heraldic banner with a shield safety emblem, {_STYLE}"),
    ("guild_crest_plaque", "prop", "iron", f"a carved wall crest plaque mounted by a guild entrance, {_STYLE}"),
    ("guild_charter_scroll", "culture", "iron", f"a framed founding-charter scroll with wax seal, {_STYLE}"),
    ("peer_review_table", "community", "iron", f"a round peer-review table with verdict tokens and stacked papers, {_STYLE}"),
    ("safety_block_stamp", "object", "industrial", f"a heavy red safety-BLOCK rubber stamp and ink pad, {_STYLE}"),
]

# ── 22. INSTRUMENTS — canonical Instrument enum + domain benches ──────────────
# server/services/instruments.py::Instrument, feature_catalog.py categories N–U
DESIGNS += [
    ("ruler_calipers", "instrument", "bronze", f"a wooden ruler with brass vernier calipers, {_STYLE}"),
    ("balance_scale_lab", "instrument", "iron", f"a precision two-pan laboratory balance with weights, {_STYLE}"),
    ("thermometer_lab", "instrument", "industrial", f"a tall mercury laboratory thermometer on a stand, {_STYLE}"),
    ("barometer", "instrument", "industrial", f"a polished wall barometer, {_STYLE}"),
    ("voltmeter", "instrument", "industrial", f"an analog panel voltmeter with a needle dial, {_STYLE}"),
    ("chromatograph", "instrument", "information", f"a gas-chromatography column rig with tubing, {_STYLE}"),
    ("mass_spectrometer", "instrument", "information", f"a mass-spectrometer console with vacuum chamber, {_STYLE}"),
    ("genome_sequencer_bench", "instrument", "information", f"a benchtop genome sequencer with sample tray, {_STYLE}"),
    ("master_clock_instrument", "instrument", "iron", f"a precision pendulum regulator master clock, {_STYLE}"),
    ("photonics_bench", "instrument", "quantum", f"an optical photonics table with fibre, lenses and a laser, {_STYLE}"),
    ("cryostat_dewar", "instrument", "quantum", f"a quantum cryostat dilution dewar with gold plates, {_STYLE}"),
    ("protein_crystallography_rig", "instrument", "information", f"a protein crystallography diffraction bench, {_STYLE}"),
    ("bioreactor_vessel", "instrument", "information", f"a stirred glass bioreactor vessel with probes, {_STYLE}"),
    ("pcr_thermocycler", "instrument", "information", f"a PCR thermocycler machine with a sample block, {_STYLE}"),
    ("wafer_lithography_stepper", "instrument", "information", f"a semiconductor photolithography stepper, {_STYLE}"),
    ("probe_station", "instrument", "information", f"a semiconductor wafer probe station with micro-needles, {_STYLE}"),
    ("cfd_wind_tunnel", "instrument", "industrial", f"a wind-tunnel test section with a model inside, {_STYLE}"),
    ("spice_test_rig", "instrument", "information", f"an electronics breadboard SPICE test rig with probes, {_STYLE}"),
    ("calibration_standard_set", "object", "industrial", f"a boxed set of calibration weights and gauge standards, {_STYLE}"),
    ("clean_room_booth", "building", "information", f"a glass clean-room booth with an air shower, {_STYLE}"),
    ("time_crystal_rig", "fx", "quantum", f"a time-crystal experiment chamber with pulsing rings of light, {_FX}"),
]

# ── 23. ACTION SET-PIECES — minion.py::_ACTIONS without a unique prop ─────────
DESIGNS += [
    ("ascension_altar", "fx", "quantum", f"a glowing ascension shrine with a rising beam of light, {_FX}"),
    ("fork_pod", "fx", "quantum", f"a futuristic minion-duplication pod with glowing fluid, {_FX}"),
    ("collaboration_round_table", "community", "industrial", f"a large round collaboration table strewn with shared blueprints, {_STYLE}"),
    ("partner_courtship_bench", "prop", "any", f"a romantic garden courtship bench under a flowering arch, {_STYLE}"),
    ("prior_art_terminal", "instrument", "information", f"a patent prior-art search terminal with a glowing screen, {_STYLE}"),
]

# ── 24. EPOCH LADDER — the 65 milestones made visible (epochs.py::EPOCHS) ─────
# History you can see: each artifact marks how far the civilisation has climbed.
DESIGNS += [
    ("oldowan_tool", "epoch", "stone", f"a knapped stone Oldowan chopper tool, {_STYLE}"),
    ("cave_painting_wall", "epoch", "stone", f"a rock wall with ochre handprints and animal cave paintings, {_STYLE}"),
    ("burial_mound", "epoch", "stone", f"a ritual stone burial cairn mound, {_STYLE}"),
    ("bow_and_arrow", "epoch", "stone", f"a hunting bow with a quiver of arrows, {_STYLE}"),
    ("potters_kiln", "epoch", "bronze", f"a fired-pottery kiln with clay pots, {_STYLE}"),
    ("cuneiform_tablet", "epoch", "bronze", f"a clay tablet covered in cuneiform writing, {_STYLE}"),
    ("law_stele", "epoch", "bronze", f"a tall carved stone law stele with inscriptions, {_STYLE}"),
    ("iron_smelting_bloomery", "epoch", "iron", f"a clay bloomery furnace smelting iron with glowing ore, {_STYLE}"),
    ("coin_mint_die", "epoch", "iron", f"a coin-striking die with blank discs and struck coins, {_STYLE}"),
    ("philosophy_agora", "epoch", "iron", f"an open-air colonnaded agora for philosophical debate, {_STYLE}"),
    ("aqueduct_arch", "epoch", "iron", f"a Roman stone aqueduct arch span, {_STYLE}"),
    ("euclid_scroll_geometry", "epoch", "iron", f"a geometry proof scroll with a compass and straightedge, {_STYLE}"),
    ("paper_press_screen", "epoch", "iron", f"a papermaking vat with a deckle screen drying sheets, {_STYLE}"),
    ("mechanical_clock_movement", "epoch", "industrial", f"an exposed brass mechanical clock gear movement, {_STYLE}"),
    ("scientific_method_chart", "epoch", "industrial", f"a wall chart of the hypothesis-experiment scientific method, {_STYLE}"),
    ("vaccination_kit", "epoch", "industrial", f"an early vaccination lancet kit with vials, {_STYLE}"),
    ("faraday_induction_coil", "epoch", "industrial", f"a Faraday induction coil dynamo apparatus, {_STYLE}"),
    ("germ_theory_slides", "epoch", "industrial", f"a tray of stained microscope slides with a culture flask, {_STYLE}"),
    ("combustion_engine_cutaway", "epoch", "industrial", f"a cutaway internal-combustion engine model, {_STYLE}"),
    ("wright_flyer", "epoch", "industrial", f"an early wood-and-canvas powered biplane flyer, {_STYLE}"),
    ("nuclear_reactor_pile", "epoch", "information", f"an early graphite nuclear reactor pile, {_STYLE}"),
    ("transistor_replica", "epoch", "information", f"an oversized chrome transistor sculpture on a plinth, {_STYLE}"),
    ("dna_double_helix_model", "epoch", "information", f"a coloured DNA double-helix molecular model, {_STYLE}"),
    ("satellite_sputnik", "epoch", "information", f"an early metal satellite with antennae, {_STYLE}"),
    ("integrated_circuit_wafer", "epoch", "information", f"a silicon integrated-circuit wafer on a display stand, {_STYLE}"),
    ("network_switch_node", "epoch", "information", f"an early network router node with blinking link lights, {_STYLE}"),
    ("smartphone_device", "epoch", "information", f"a modern smartphone with a glowing touchscreen, {_STYLE}"),
    ("crispr_cas9_model", "epoch", "information", f"a CRISPR-Cas9 gene-editing molecular model, {_STYLE}"),
    ("foundation_model_gpu_pod", "epoch", "information", f"an AI training GPU server pod with glowing racks, {_STYLE}"),
    ("agi_core", "epoch", "quantum", f"a glowing spherical AGI reasoning core suspended in a frame, {_FX}"),
    ("longevity_pod", "epoch", "quantum", f"a medical longevity regeneration pod with soft light, {_STYLE}"),
    ("bci_headset", "epoch", "quantum", f"a sleek brain-computer-interface headset with electrodes, {_STYLE}"),
    ("self_driving_lab_cell", "epoch", "quantum", f"an autonomous robotic self-driving laboratory cell, {_STYLE}"),
    ("nanofab_assembler", "epoch", "quantum", f"an atomically-precise nanofabrication assembler glowing blue, {_FX}"),
    ("orbital_habitat_ring", "epoch", "quantum", f"a rotating orbital habitat ring station, {_FX}"),
    ("dyson_swarm_collector", "epoch", "quantum", f"a Dyson-swarm solar collector panel array glowing gold, {_FX}"),
    ("mind_upload_substrate", "epoch", "quantum", f"a mind-upload substrate column streaming light, {_FX}"),
    ("interstellar_ship", "epoch", "quantum", f"a sleek interstellar starship with glowing engines, {_FX}"),
    ("star_engine", "epoch", "quantum", f"a colossal stellar-engineering megastructure beside a star, {_FX}"),
]

# ── 25. SAGAS — narrative motifs/cast set-pieces (sagas.py::ARCHETYPES) ───────
DESIGNS += [
    ("mentor_apprentice_bench", "furniture", "iron", f"a shared workbench set for a mentor and apprentice, two stools, {_STYLE}"),
    ("rivalry_dueling_chalkboards", "instrument", "industrial", f"two competing chalkboards facing off, covered in rival equations, {_STYLE}"),
    ("discovery_eureka_lamp", "fx", "industrial", f"a desk with a brilliantly glowing eureka-moment lamp and notes, {_FX}"),
    ("prodigy_laurel", "culture", "iron", f"a prodigy's laurel wreath and medal on a display stand, {_STYLE}"),
    ("plague_sickbed_lamp", "medical", "iron", f"a sickbed studied by lamplight with medicine bottles, {_STYLE}"),
    ("renaissance_open_studio", "fx", "industrial", f"a flourishing open art-and-science studio cluster, glowing warmly, {_FX}"),
    ("wanderer_pack", "object", "iron", f"a traveller's leather pack with a bedroll and walking staff, {_STYLE}"),
    ("saga_memorial_plaque", "monument", "any", f"a bronze memorial plaque on a stone for a resolved saga, {_STYLE}"),
    ("legacy_portrait_gallery", "culture", "industrial", f"a wall gallery of ancestral lineage portraits in gilt frames, {_STYLE}"),
]

# ── 26. INVENTIONS / PATENTS — the discovery machinery (discovery.py etc.) ────
DESIGNS += [
    ("invention_prototype_bench", "instrument", "industrial", f"a workbench with a half-built mechanical invention prototype, {_STYLE}"),
    ("patent_archive_wall", "community", "industrial", f"a wall of labelled patent filing drawers, {_STYLE}"),
    ("discovery_ledger_book", "object", "iron", f"a heavy bound discovery provenance ledger with a ribbon, {_STYLE}"),
    ("peer_review_verdict_board", "community", "industrial", f"a review verdict board with PASS, REVISE and BLOCK cards, {_STYLE}"),
    ("replication_station", "instrument", "information", f"a replication-experiment station with paired apparatus, {_STYLE}"),
    ("patent_globe_kiosk", "object", "information", f"a prior-art world-map globe kiosk with pins, {_STYLE}"),
    ("tech_transfer_crate", "community", "industrial", f"a stencilled technology-transfer shipping crate, {_STYLE}"),
    ("citation_graph_display", "fx", "information", f"a holographic citation knowledge-graph display, glowing nodes, {_FX}"),
]

# ── 27. SOCIAL / CIVIC / GOVERNANCE (governance.py, civics.py, economy.py) ────
DESIGNS += [
    ("tribal_council_circle", "civic", "stone", f"a tribal council circle of log seats around a fire ring, {_STYLE}"),
    ("kings_throne_hall", "building", "iron", f"a grand throne hall with a raised royal throne, {_STYLE}"),
    ("republic_senate_house", "civic", "iron", f"a columned senate assembly chamber with tiered seats, {_STYLE}"),
    ("courthouse", "civic", "industrial", f"a dignified courthouse with columns and a pediment, {_STYLE}"),
    ("law_code_pillar", "monument", "bronze", f"a stone pillar inscribed with a codified law code, {_STYLE}"),
    ("constitution_display", "culture", "industrial", f"a framed constitution document under glass on a stand, {_STYLE}"),
    ("voting_booth", "civic", "industrial", f"a curtained ballot voting booth with a box, {_STYLE}"),
    ("mint_bank", "civic", "iron", f"a stately bank and treasury building with a vault door, {_STYLE}"),
    ("ore_stockpile", "community", "bronze", f"a stockpile of mixed copper, tin and iron ore chunks, {_STYLE}"),
    ("coal_pile", "community", "industrial", f"a heaped pile of black coal, {_STYLE}"),
    ("oil_barrel_stack", "community", "industrial", f"a stack of riveted oil barrels, {_STYLE}"),
    ("timber_stack", "community", "any", f"a neatly stacked pile of cut timber logs, {_STYLE}"),
    ("entertainment_arena", "civic", "iron", f"a small open-air contest arena with tiered stone seating, {_STYLE}"),
    ("theatre_stage", "civic", "industrial", f"a proscenium theatre stage with red curtains, {_STYLE}"),
    ("cinema_marquee", "building", "industrial", f"a cinema building with a lit marquee, {_STYLE}"),
    ("vr_arcade", "building", "information", f"a neon video-game and VR arcade hall, {_STYLE}"),
    ("race_track_post", "prop", "stone", f"a foot-race finish post with a ribbon, {_STYLE}"),
    ("sky_belief_totem", "culture", "stone", f"a carved totem venerating a glowing console in the sky, {_STYLE}"),
    ("prayer_circle_stones", "monument", "stone", f"a circle of standing prayer stones, {_STYLE}"),
    ("ethics_oath_lectern", "culture", "iron", f"an ornate lectern holding an open ethics oath book, {_STYLE}"),
    ("standards_master_gauge", "object", "industrial", f"a glass case holding a master reference gauge standard, {_STYLE}"),
]

# ── 28. BIOMES / WEATHER / WORLD (climate.py, seed.py, ecosystem.py …) ────────
DESIGNS += [
    ("desert_dune_tile", "biome", "any", f"a modular sand dune desert terrain tile, seamless, {_STYLE}"),
    ("cactus_succulent", "biome", "any", f"a cluster of desert cacti and succulents, {_STYLE}"),
    ("mountain_peak_tile", "biome", "any", f"a rocky snow-capped mountain peak terrain tile, {_STYLE}"),
    ("plateau_mesa", "biome", "any", f"a flat-topped desert mesa rock formation, {_STYLE}"),
    ("forest_floor_tile", "biome", "any", f"a leaf-litter forest floor terrain tile with roots, {_STYLE}"),
    ("rolling_hills_tile", "biome", "any", f"a grassy rolling-hills terrain tile, {_STYLE}"),
    ("plains_meadow_tile", "biome", "any", f"an open flower-dotted meadow plains tile, {_STYLE}"),
    ("alpine_pine_cluster", "biome", "any", f"a cluster of tall alpine conifer pines, {_STYLE}"),
    ("rain_puddle_decal", "biome", "any", f"a wet ground patch with rain puddles and ripples, {_STYLE}"),
    ("snow_drift", "biome", "any", f"a sculpted snow drift over snow-covered ground, {_STYLE}"),
    ("storm_debris", "biome", "any", f"scattered wind-blown storm debris and broken branches, {_STYLE}"),
    ("autumn_leaf_pile", "biome", "any", f"a pile of fallen autumn leaves in warm colours, {_STYLE}"),
    ("winter_bare_tree", "biome", "any", f"a snow-laden bare winter tree, {_STYLE}"),
    ("sun_disc", "fx", "any", f"a warm glowing sun disc billboard with soft rays, {_FX}"),
    ("moon_disc", "fx", "any", f"a pale glowing crescent moon billboard, {_FX}"),
    ("cloud_volume", "fx", "any", f"a soft stylised fluffy cloud set piece, {_FX}"),
    ("prey_deer_herd", "biome", "any", f"a small group of grazing deer, {_STYLE}"),
    ("predator_wolf", "biome", "any", f"a standing grey wolf predator, {_STYLE}"),
    ("hunting_blind", "biome", "stone", f"a camouflaged wooden hunter's blind hide, {_STYLE}"),
    ("fault_rift_terrain", "biome", "any", f"a cracked tectonic fault-rift terrain section, {_STYLE}"),
    ("volcano_cone", "biome", "any", f"a smoking volcanic cone with a glowing crater, {_STYLE}"),
    ("smog_haze_emitter", "fx", "industrial", f"a thick industrial smog haze set piece over rooftops, {_FX}"),
    ("slag_heap", "biome", "industrial", f"a dark industrial slag waste heap, {_STYLE}"),
]

# ── 29. NEEDS / LIFECYCLE / MOOD (lifecycle.py, emotion.py, MoodKind) ─────────
DESIGNS += [
    ("mood_emote_ring", "fx", "any", f"a floating ring of glowing mood emoji icons, {_FX}"),
    ("grave_headstone", "monument", "any", f"a weathered stone grave headstone, {_STYLE}"),
    ("funeral_pyre", "culture", "stone", f"a stacked wooden funeral pyre bier, {_STYLE}"),
    ("reincarnation_shrine", "fx", "quantum", f"a soul-reincarnation shrine with a rising swirl of light, {_FX}"),
    ("child_crib_mobile", "family", "any", f"a hanging crib mobile of little carved shapes, {_STYLE}"),
    ("nickname_charm", "object", "any", f"a small engraved birth-nickname charm token, {_STYLE}"),
    ("thirst_water_skin", "object", "stone", f"a leather water-skin flask, {_STYLE}"),
    ("exhaustion_bedroll", "furniture", "stone", f"a simple rolled-out woven bedroll, {_STYLE}"),
    ("wound_bandage_kit", "medical", "iron", f"a rolled bandage and wound-dressing kit, {_STYLE}"),
    ("soul_bond_token", "object", "any", f"a pair of matching soul-bond keepsake pendants, {_STYLE}"),
]

# ── 30. RESEARCH ROLES & PROJECT PIPELINE (roles.py::SwarmRoleKind) ───────────
DESIGNS += [
    ("role_literature_scout_carrel", "role", "industrial", f"a library study carrel piled with stacked research papers, {_STYLE}"),
    ("role_genome_analyst_station", "role", "information", f"a genome-analysis station with a wall of sequence screens, {_STYLE}"),
    ("role_protein_modeller_display", "role", "information", f"a glowing holographic 3D protein-fold display, {_FX}"),
    ("role_chemistry_generator_hood", "role", "information", f"a chemistry synthesis fume hood with reagent bottles, {_STYLE}"),
    ("role_toxicity_checker_cabinet", "role", "information", f"a toxicity-assay safety cabinet with hazard labels, {_STYLE}"),
    ("role_trial_simulator_console", "role", "information", f"an in-silico clinical-trial simulation console, {_STYLE}"),
    ("role_regulatory_reasoner_desk", "role", "industrial", f"a regulatory-review desk with stacked binders and stamps, {_STYLE}"),
    ("role_experimental_designer_board", "role", "industrial", f"an experiment-design planning board with pinned protocols, {_STYLE}"),
    ("role_formula_oracle_orb", "role", "iron", f"a glowing equation-filled formula oracle orb on a pedestal, {_FX}"),
    ("project_stage_kanban", "role", "information", f"a project-stage kanban board with cards across columns, {_STYLE}"),
]

# ── 31. PALEONTOLOGY / DEEP TIME (paleontology.py::_PREHISTORY) ───────────────
DESIGNS += [
    ("fossil_dig_site", "prop", "any", f"an excavation dig pit with brushes, pickaxe and exposed bones, {_STYLE}"),
    ("fossil_trilobite", "culture", "any", f"a trilobite fossil embedded in a stone slab, {_STYLE}"),
    ("fossil_ammonite", "culture", "any", f"a spiral ammonite fossil in rock, {_STYLE}"),
    ("fossil_tyrannosaur_skull", "monument", "any", f"a large mounted tyrannosaur fossil skull, {_STYLE}"),
    ("fossil_dimetrodon", "culture", "any", f"a sail-backed dimetrodon fossil skeleton, {_STYLE}"),
    ("fossil_mastodon_tusk", "culture", "any", f"a curved mastodon fossil tusk on a mount, {_STYLE}"),
    ("stromatolite_mound", "nature", "any", f"a layered stromatolite mound in shallow water, {_STYLE}"),
    ("drilling_rig_deep", "instrument", "industrial", f"a deep-strata core drilling rig, {_STYLE}"),
]

# ── 32. MANUFACTURING / FACTORY / SUPPLY (manufacturing.py::Process, grid.py) ─
DESIGNS += [
    ("casting_foundry_ladle", "instrument", "iron", f"a foundry casting ladle pouring molten metal into a mould, {_STYLE}"),
    ("heat_treat_furnace", "instrument", "industrial", f"an industrial heat-treatment furnace, {_STYLE}"),
    ("cnc_machining_center", "instrument", "information", f"an enclosed CNC machining centre, {_STYLE}"),
    ("industrial_robot_arm", "instrument", "information", f"an articulated industrial assembly robot arm, {_STYLE}"),
    ("printer_3d_additive", "instrument", "information", f"an additive 3D printer mid-print, {_STYLE}"),
    ("assembly_line_conveyor", "instrument", "industrial", f"a section of factory conveyor assembly line, {_STYLE}"),
    ("jig_fixture_table", "instrument", "industrial", f"a workholding jig-and-fixture table with clamps, {_STYLE}"),
    ("power_grid_substation", "infra", "industrial", f"an electrical grid substation with transformers, {_STYLE}"),
    ("supply_depot_warehouse", "building", "industrial", f"a supply-chain depot warehouse with loading bays, {_STYLE}"),
]


# Build order: terrain first, then the world fills in, instruments dress the labs,
# daily-life props last. Every category appears here so `designs_for` sorts cleanly.
PHASE_ORDER = [
    "terrain", "nature", "biome", "building", "civic", "fx",  # stage 1: core world + biomes
    "interior", "furniture", "household", "family",           # stage 2: home & daily life
    "instrument", "object", "role",                           # stage 3: guild work, tools & roles
    "community", "culture",                                   # stage 4: community & economy
    "medical", "agri", "infra", "safety",                     # stage 5: society systems
    "epoch",                                                  # stage 6: epoch ladder (history)
    "vehicle", "monument", "prop",                            # stage 7: movement & polish
]

# ── STAGES — the best order to complete generation in, as credit-sized waves ───
# Each stage is a coherent slice of the world that's *usable on its own*: finish
# stage 1 and you have a beautiful landscape + skyline; finish stage 2 and you can
# follow a Minion through her home; stage 3 makes the guilds work; and so on. This
# lets generation run one wave at a time, matched to how many credits are loaded.
STAGES: dict[int, dict] = {
    1: {"name": "Core World & Biomes", "categories": ["terrain", "nature", "biome", "building", "civic", "fx"]},
    2: {"name": "Home & Daily Life",   "categories": ["interior", "furniture", "household", "family"]},
    3: {"name": "Guild Work & Roles",  "categories": ["instrument", "object", "role"]},
    4: {"name": "Community & Economy",  "categories": ["community", "culture"]},
    5: {"name": "Society Systems",     "categories": ["medical", "agri", "infra", "safety"]},
    6: {"name": "Epoch Ladder",        "categories": ["epoch"]},
    7: {"name": "Movement & Polish",   "categories": ["vehicle", "monument", "prop"]},
}

# category → stage number (reverse index, for fast filtering)
STAGE_OF: dict[str, int] = {cat: n for n, s in STAGES.items() for cat in s["categories"]}


def designs_for(epoch_tag: str | None = None) -> list[tuple[str, str, str, str]]:
    """All designs (or one epoch + evergreens), sorted into build-phase order."""
    items = DESIGNS if epoch_tag is None else [d for d in DESIGNS if d[2] in (epoch_tag, "any")]
    return sorted(items, key=lambda d: (PHASE_ORDER.index(d[1]) if d[1] in PHASE_ORDER else 99, d[0]))


def designs_for_stage(stage: int) -> list[tuple[str, str, str, str]]:
    """Every design belonging to one completion stage, in build-phase order."""
    cats = set(STAGES.get(stage, {}).get("categories", ()))
    return [d for d in designs_for(None) if d[1] in cats]
