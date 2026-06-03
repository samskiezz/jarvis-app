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


# Build order: terrain first, then the world fills in, instruments dress the labs,
# daily-life props last. Every category appears here so `designs_for` sorts cleanly.
PHASE_ORDER = [
    "terrain", "nature", "building", "civic", "fx",          # stage 1: core world
    "interior", "furniture", "household", "family",           # stage 2: home & daily life
    "instrument", "object",                                   # stage 3: guild work & tools
    "community", "culture",                                   # stage 4: community & economy
    "medical", "agri", "infra", "safety",                     # stage 5: society systems
    "vehicle", "monument", "prop",                            # stage 6: movement & polish
]

# ── STAGES — the best order to complete generation in, as credit-sized waves ───
# Each stage is a coherent slice of the world that's *usable on its own*: finish
# stage 1 and you have a beautiful landscape + skyline; finish stage 2 and you can
# follow a Minion through her home; stage 3 makes the guilds work; and so on. This
# lets generation run one wave at a time, matched to how many credits are loaded.
STAGES: dict[int, dict] = {
    1: {"name": "Core World",          "categories": ["terrain", "nature", "building", "civic", "fx"]},
    2: {"name": "Home & Daily Life",   "categories": ["interior", "furniture", "household", "family"]},
    3: {"name": "Guild Work & Tools",  "categories": ["instrument", "object"]},
    4: {"name": "Community & Economy",  "categories": ["community", "culture"]},
    5: {"name": "Society Systems",     "categories": ["medical", "agri", "infra", "safety"]},
    6: {"name": "Movement & Polish",   "categories": ["vehicle", "monument", "prop"]},
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
