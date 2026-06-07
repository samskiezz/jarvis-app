"""ARCHITECTURE / MODULAR KIT — the walls, floors, roofs, doors, windows, stairs and exterior
structures that build every room and building. These were wrongly dropped from the focused
list. One unique generation each (no colour duplication), futuristic-avatar × Sims4 × GTA5.
"""
from __future__ import annotations

WALLS = ["interior_wall_panel", "glass_curtain_wall", "brick_wall_section", "concrete_wall_panel",
         "partition_wall", "accent_feature_wall", "exterior_cladding_panel", "retaining_wall",
         "half_wall_divider", "living_green_wall", "led_media_wall", "soundproof_wall_panel"]
FLOORS = ["wood_plank_floor", "polished_concrete_floor", "marble_tile_floor", "carpet_section",
          "vinyl_floor_tile", "checkerboard_floor", "industrial_grate_floor", "rug_area_floor",
          "epoxy_floor", "raised_access_floor"]
CEILINGS = ["ceiling_panel", "drop_ceiling_grid", "exposed_beam_ceiling", "skylight_panel",
            "coffered_ceiling", "led_ceiling_strip", "vaulted_ceiling_section"]
DOORS = ["single_door", "double_door", "sliding_glass_door", "automatic_sliding_door",
         "garage_roller_door", "revolving_door", "security_door", "barn_door_interior",
         "pocket_door", "airlock_door_futuristic"]
WINDOWS = ["single_window", "bay_window", "floor_to_ceiling_window", "picture_window",
           "skylight_window", "porthole_window", "storefront_window", "louvre_window",
           "curved_panoramic_window"]
STAIRS = ["straight_staircase", "spiral_staircase", "floating_staircase", "switchback_stairs",
          "exterior_stoop_stairs", "escalator", "wheelchair_ramp", "grand_entrance_stairs"]
RAILINGS = ["glass_balustrade", "metal_handrail", "balcony_railing", "cable_railing",
            "stair_banister", "rooftop_safety_rail"]
COLUMNS = ["round_column", "square_pillar", "support_beam", "decorative_pilaster",
           "structural_truss", "cantilever_beam"]
ROOFS = ["flat_roof_section", "sloped_roof_section", "dome_roof", "saucer_rooftop_crown",
         "rooftop_garden_deck", "solar_roof_panel", "skylight_roof", "helipad_roof_deck",
         "curved_white_roof_shell"]
FACADE = ["facade_panel_modular", "cantilevered_balcony", "awning_canopy", "entrance_portico",
          "glass_atrium_section", "brise_soleil_screen", "neon_signage_facade", "holo_billboard_facade"]
OUTDOOR = ["perimeter_fence", "security_gate", "pedestrian_bridge_section", "vehicle_bridge_span",
           "pergola", "gazebo", "planter_wall", "boundary_hedge_wall", "retaining_terrace_wall",
           "outdoor_staircase", "loading_dock", "courtyard_paving_module"]
# extra terrains/ground beyond the nature set (exterior design surfaces)
GROUND = ["plaza_paving", "road_segment", "sidewalk_segment", "crosswalk_segment",
          "parking_lot_surface", "park_path", "cobble_street", "bike_lane_segment",
          "town_square_floor", "waterfront_boardwalk"]


def all_architecture():
    """(base_item, category) for the modular kit — category drives the layout binding."""
    out = []
    for it in WALLS: out.append((it, "wall"))
    for it in FLOORS + GROUND: out.append((it, "floor"))
    for it in CEILINGS: out.append((it, "roof"))
    for it in DOORS + WINDOWS: out.append((it, "prop"))
    for it in STAIRS: out.append((it, "stairs"))
    for it in RAILINGS + COLUMNS: out.append((it, "prop"))
    for it in ROOFS: out.append((it, "roof"))
    for it in FACADE: out.append((it, "building_shell"))
    for it in OUTDOOR: out.append((it, "bridge"))
    # dedup
    seen, uniq = set(), []
    for it, c in out:
        if it in seen: continue
        seen.add(it); uniq.append((it, c))
    return uniq
