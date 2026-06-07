"""WORLD SUBJECTS — the comprehensive distinct-subject taxonomy for the full Underworld world.

Thousands of DISTINCT subjects (no colour duplication) across every domain the world needs:
vehicles (cars/drones/planes/boats/rail/construction), sky & celestial (sun, moon phases,
planets, stars, weather), terrain & landforms, roads & infrastructure, wildlife, flora/crops,
and Underworld era/guild/saga props. Each becomes ONE futuristic-avatar×Sims4×GTA5 generation.
"""
from __future__ import annotations

VEHICLES = [
 # cars
 "sedan","coupe","hatchback","station_wagon","suv","compact_suv","crossover","pickup_truck",
 "muscle_car","sports_car","hypercar","supercar","ev_hatch","hybrid_sedan","classic_car",
 "vintage_roadster","limousine","convertible","minivan","microcar","hot_rod","rally_car",
 "off_roader","dune_buggy","go_kart","smart_car","taxi_cab","police_cruiser","sheriff_suv",
 # service/utility trucks
 "ambulance","fire_engine","fire_ladder_truck","tow_truck","garbage_truck","street_sweeper",
 "mail_van","delivery_van","box_truck","semi_truck","tanker_truck","cement_mixer","dump_truck",
 "flatbed_truck","food_truck","ice_cream_truck","armored_van","news_van","refrigerated_truck",
 # buses & rail
 "city_bus","double_decker_bus","articulated_bus","school_bus","coach_bus","shuttle_bus",
 "trolleybus","tram","light_rail_car","subway_train","commuter_train","high_speed_train",
 "freight_locomotive","freight_wagon","monorail_car","maglev_train","steam_locomotive","cable_car",
 # two-wheel & micro
 "bicycle","ebike","mountain_bike","road_bike","cargo_bike","motorcycle","sport_bike",
 "cruiser_bike","scooter","electric_scooter","moped","hoverboard","segway","hover_bike",
 # air
 "prop_plane","jet_airliner","private_jet","cargo_plane","biplane","seaplane","fighter_jet",
 "glider","vtol_aircraft","flying_car","air_taxi","helicopter","news_helicopter","gyrocopter",
 "blimp","hot_air_balloon","airship","cargo_drone","delivery_drone","surveillance_drone",
 "racing_drone","quadcopter","agricultural_drone","passenger_drone","firefighting_drone",
 # water
 "speedboat","motor_yacht","sailing_yacht","sailboat","catamaran","ferry","cargo_ship",
 "container_ship","cruise_ship","fishing_boat","tugboat","jet_ski","kayak","canoe","gondola",
 "hovercraft","submarine","research_submersible","barge","pontoon_boat","patrol_boat",
 # construction/agri/special
 "forklift","excavator","bulldozer","backhoe","mobile_crane","tower_crane","wheel_loader",
 "skid_steer","road_roller","asphalt_paver","trencher","tractor","combine_harvester","atv",
 "snowmobile","golf_cart","riding_mower","mech_walker","cargo_loader_mech",
]

CELESTIAL = [
 "sun","sun_corona","solar_eclipse","moon_full","moon_new","moon_waxing_crescent",
 "moon_first_quarter","moon_waxing_gibbous","moon_waning_gibbous","moon_last_quarter",
 "moon_waning_crescent","blood_moon","harvest_moon","lunar_eclipse",
 "mercury","venus","earth","mars","jupiter","saturn_ringed","uranus","neptune","pluto",
 "exoplanet","ringed_gas_giant","star_field","bright_star","binary_star","red_giant",
 "white_dwarf","neutron_star","supernova","shooting_star","constellation","pulsar",
 "spiral_galaxy","elliptical_galaxy","emission_nebula","dark_nebula","star_cluster",
 "milky_way_band","black_hole","wormhole","quasar","comet","meteor_shower","asteroid",
 "asteroid_belt","satellite","space_station","space_telescope","space_debris",
 "aurora_borealis","aurora_australis","rainbow","double_rainbow","sun_halo","sundog",
 "lightning_bolt","meteor","planet_rings","nebula_pillars",
]
SKY = [
 "sky_dawn","sky_sunrise","sky_noon","sky_golden_hour","sky_sunset","sky_dusk","sky_night",
 "sky_overcast","sky_storm","sky_clear","cumulus_cloud","cumulonimbus_cloud","stratus_cloud",
 "cirrus_cloud","altocumulus_cloud","lenticular_cloud","mammatus_cloud","fog_bank",
 "storm_supercell","cloud_layer_dawn","cloud_layer_dusk",
]

TERRAIN = [
 "grass_field","meadow","savanna","tundra","desert_sand","desert_rock","snow_field","ice_sheet",
 "mud_flat","marsh","swamp","bog","wetland","farmland","ploughed_field","cracked_earth",
 "volcanic_ash","lava_field","salt_flat","gravel_ground","scree_slope","forest_floor",
 "jungle_floor","moss_ground","beach_sand","pebble_beach","clay_ground","peat_ground",
]
LANDFORM = [
 "mountain_peak","mountain_range","hill","rolling_hills","plateau","mesa","butte","canyon",
 "gorge","ravine","cliff","sea_cliff","valley","glacial_valley","fjord","crater","sinkhole",
 "cave_entrance","cavern","rock_arch","hoodoo","sand_dune","dune_field","escarpment","ridge",
 "volcano","caldera","geyser","hot_spring","glacier","iceberg","ice_cave","island","atoll",
]
WATERBODY = [
 "ocean","sea","lake","pond","river","stream","creek","waterfall","cascade","rapids","delta",
 "estuary","lagoon","reservoir","oasis","spring_pool","tidal_pool","coral_reef","kelp_forest",
]

ROADS = [
 "highway_segment","freeway_interchange","city_street","residential_street","alley","dirt_road",
 "gravel_road","country_lane","boulevard","one_way_street","toll_plaza","road_bridge",
 "tunnel_entrance","tunnel_segment","overpass","underpass","flyover","roundabout","t_junction",
 "crossroads","on_ramp","off_ramp","cul_de_sac","parking_lot","multistorey_carpark","lay_by",
 "bus_lane","bike_path","pedestrian_crossing","zebra_crossing","speed_bump","median_strip",
 "guardrail","jersey_barrier","traffic_island","railway_track","railway_platform","train_yard",
]
INFRA = [
 "power_line","power_pylon","transformer_substation","wind_turbine","solar_farm_array",
 "water_tower","sewage_treatment","gas_pipeline","telecom_tower","ground_satellite_dish","dam",
 "canal_lock","pier","jetty","harbour_dock","lighthouse","breakwater","sea_wall","reservoir_dam",
 "street_light","traffic_signal","road_sign_gantry","highway_billboard","bus_shelter",
 "public_bench","public_bin","bollard","fire_hydrant","manhole","drain_grate","fire_escape",
 "construction_scaffold","construction_crane","roadworks_set","traffic_cone","construction_barrier",
]

WILDLIFE = [
 "dog","cat","horse","cow","pig","sheep","goat","chicken","rooster","duck","goose","rabbit",
 "deer","fox","wolf","bear","lion","tiger","elephant","giraffe","zebra","rhino","hippo","monkey",
 "gorilla","kangaroo","koala","panda","raccoon","squirrel","hedgehog","bat","mouse",
 "sparrow","pigeon","crow","owl","eagle","hawk","falcon","parrot","flamingo","peacock","swan",
 "seagull","penguin","ostrich","hummingbird","robin",
 "fish_shoal","shark","dolphin","whale","octopus","jellyfish","crab","lobster","sea_turtle",
 "seahorse","starfish","manta_ray",
 "butterfly","bee","dragonfly","beetle","ant_colony","spider","firefly","moth",
 "bioluminescent_creature","robotic_companion_pet","holo_pet","drone_pet",
]

FLORA = [
 "wheat_field","corn_stalks","rice_paddy","soybean_row","potato_row","tomato_plant","grape_vine",
 "cotton_plant","sugarcane","coffee_plant","tea_bush","bamboo_grove","orchard_row","vineyard_row",
 "rose_bush","tulip_bed","daffodil_cluster","sunflower","lavender_row","orchid","lily","lotus",
 "poppy_field","marigold","hydrangea","fern_cluster","mushroom_cluster","toadstool","bracket_fungus",
 "glowing_fungus","lilypad","reed_bed","kelp_strand","mangrove","cactus_saguaro","cactus_barrel",
 "succulent_garden","topiary_shape","hedge_maze_section","flower_meadow","moss_log",
]

# Underworld era kits (8 eras) — distinct architectural style props per age (the story spine)
ERA_KITS = []
for era in ["stone","bronze","iron","classical","medieval","industrial","modern","future"]:
    for piece in ["dwelling","workshop","monument","gathering_hall","market_stall","tool_set"]:
        ERA_KITS.append((f"{era}_{piece}", "building_shell" if piece in ("dwelling","workshop","gathering_hall") else "prop"))


def all_subjects():
    out = []
    for v in VEHICLES: out.append((v, "vehicle", "vehicle"))
    for c in CELESTIAL: out.append((c, "fx", "sky"))
    for s in SKY: out.append((s, "fx", "sky"))
    for t in TERRAIN: out.append((t, "floor", "nature"))
    for l in LANDFORM: out.append((l, "rock", "nature"))
    for w in WATERBODY: out.append((w, "water", "nature"))
    for r in ROADS: out.append((r, "floor", "urban"))
    for i in INFRA: out.append((i, "prop", "urban"))
    for a in WILDLIFE: out.append((a, "character", "wildlife"))
    for f in FLORA: out.append((f, "plant", "nature"))
    for name, cat in ERA_KITS: out.append((name, cat, "era"))
    seen, uniq = set(), []
    for it, cat, dom in out:
        if it in seen: continue
        seen.add(it); uniq.append((it, cat, dom))
    return uniq
