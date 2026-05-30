// Catalog of CC0 GLB assets shipped in /public/models. Centralised so the
// scene can reference assets by symbolic name instead of brittle path strings.
//
// Sources (all CC0):
//   /models/kenney/blocky-characters  — 18 distinct rigid-hierarchy
//                                       characters (a..r) with shared anim
//                                       library (idle/walk/sit/die/emote-...).
//   /models/kenney/city-kit-suburban  — suburban building variants A..U.
//   /models/kenney/castle-kit         — tower segments / gates / walls / flags.
//   /models/kenney/fantasy-town       — fences, hedges, lanterns, fountains.
//   /models/kenney/nature-kit         — trees, rocks, flowers, mushrooms.
//   /models/polyhaven                 — PBR texture sets + HDRI.

import type { Guild } from "@/lib/types";

// One distinct mini-character per guild. The Kenney mini-characters kit
// ships 12 skinned humanoid GLBs (6 male + 6 female) with stylized costumes
// and the same anim library as the blocky kit, so each guild gets a real
// human silhouette instead of a cube. Pairs alternate gender so the
// population reads as varied.
const CHARACTER_BY_GUILD: Record<Guild, string> = {
  maths:       "/models/kenney/mini-characters/character-female-a.glb",
  physics:     "/models/kenney/mini-characters/character-male-a.glb",
  electrical:  "/models/kenney/mini-characters/character-female-b.glb",
  mechanical:  "/models/kenney/mini-characters/character-male-b.glb",
  civil:       "/models/kenney/mini-characters/character-female-c.glb",
  materials:   "/models/kenney/mini-characters/character-male-c.glb",
  computing:   "/models/kenney/mini-characters/character-female-d.glb",
  energy:      "/models/kenney/mini-characters/character-male-d.glb",
  agriculture: "/models/kenney/mini-characters/character-female-e.glb",
  patent:      "/models/kenney/mini-characters/character-male-e.glb",
  safety:      "/models/kenney/mini-characters/character-male-f.glb",
};

export function characterModelFor(guild: Guild): string {
  return CHARACTER_BY_GUILD[guild] ?? CHARACTER_BY_GUILD.computing;
}

export const ALL_CHARACTER_MODELS: readonly string[] = Object.values(CHARACTER_BY_GUILD);

// Suburban houses A..P from Kenney — residential outer ring.
export const CITY_BUILDINGS: readonly string[] = [
  "/models/kenney/city-kit-suburban/building-type-a.glb",
  "/models/kenney/city-kit-suburban/building-type-b.glb",
  "/models/kenney/city-kit-suburban/building-type-c.glb",
  "/models/kenney/city-kit-suburban/building-type-d.glb",
  "/models/kenney/city-kit-suburban/building-type-e.glb",
  "/models/kenney/city-kit-suburban/building-type-f.glb",
  "/models/kenney/city-kit-suburban/building-type-g.glb",
  "/models/kenney/city-kit-suburban/building-type-h.glb",
  "/models/kenney/city-kit-suburban/building-type-i.glb",
  "/models/kenney/city-kit-suburban/building-type-j.glb",
  "/models/kenney/city-kit-suburban/building-type-k.glb",
  "/models/kenney/city-kit-suburban/building-type-l.glb",
  "/models/kenney/city-kit-suburban/building-type-m.glb",
  "/models/kenney/city-kit-suburban/building-type-n.glb",
  "/models/kenney/city-kit-suburban/building-type-o.glb",
  "/models/kenney/city-kit-suburban/building-type-p.glb",
];

// Commercial shops + offices A..N — middle ring (markets, schools, libraries).
export const COMMERCIAL_BUILDINGS: readonly string[] = [
  "/models/kenney/city-kit-commercial/building-a.glb",
  "/models/kenney/city-kit-commercial/building-b.glb",
  "/models/kenney/city-kit-commercial/building-c.glb",
  "/models/kenney/city-kit-commercial/building-d.glb",
  "/models/kenney/city-kit-commercial/building-e.glb",
  "/models/kenney/city-kit-commercial/building-f.glb",
  "/models/kenney/city-kit-commercial/building-g.glb",
  "/models/kenney/city-kit-commercial/building-h.glb",
  "/models/kenney/city-kit-commercial/building-i.glb",
  "/models/kenney/city-kit-commercial/building-j.glb",
  "/models/kenney/city-kit-commercial/building-k.glb",
  "/models/kenney/city-kit-commercial/building-l.glb",
  "/models/kenney/city-kit-commercial/building-m.glb",
  "/models/kenney/city-kit-commercial/building-n.glb",
];

// Skyscrapers — inner ring around the obelisk. Universities, guild HQs.
export const SKYSCRAPERS: readonly string[] = [
  "/models/kenney/city-kit-commercial/building-skyscraper-a.glb",
  "/models/kenney/city-kit-commercial/building-skyscraper-b.glb",
  "/models/kenney/city-kit-commercial/building-skyscraper-c.glb",
  "/models/kenney/city-kit-commercial/building-skyscraper-d.glb",
  "/models/kenney/city-kit-commercial/building-skyscraper-e.glb",
];

// Road tiles for the street grid. All 4×4u in source; we lay them edge-to-edge.
export const ROAD_TILES = {
  straight:  "/models/kenney/city-kit-roads/road-straight.glb",
  bend:      "/models/kenney/city-kit-roads/road-bend.glb",
  crossroad: "/models/kenney/city-kit-roads/road-crossroad.glb",
  tjunction: "/models/kenney/city-kit-roads/road-intersection.glb",
  end:       "/models/kenney/city-kit-roads/road-end.glb",
} as const;

// Drivable vehicle GLBs — exclude debris/wheels/cones.
export const CARS: readonly string[] = [
  "/models/kenney/car-kit/sedan.glb",
  "/models/kenney/car-kit/sedan-sports.glb",
  "/models/kenney/car-kit/hatchback-sports.glb",
  "/models/kenney/car-kit/suv.glb",
  "/models/kenney/car-kit/suv-luxury.glb",
  "/models/kenney/car-kit/taxi.glb",
  "/models/kenney/car-kit/police.glb",
  "/models/kenney/car-kit/ambulance.glb",
  "/models/kenney/car-kit/firetruck.glb",
  "/models/kenney/car-kit/garbage-truck.glb",
  "/models/kenney/car-kit/van.glb",
  "/models/kenney/car-kit/delivery.glb",
  "/models/kenney/car-kit/truck.glb",
  "/models/kenney/car-kit/tractor.glb",
];

// Castle towers / monumental architecture for the centre.
export const CASTLE_BUILDINGS: readonly string[] = [
  "/models/kenney/castle-kit/tower-square-roof.glb",
  "/models/kenney/castle-kit/tower-square-arch.glb",
  "/models/kenney/castle-kit/tower-square-mid-windows.glb",
  "/models/kenney/castle-kit/tower-square-mid-door.glb",
  "/models/kenney/castle-kit/tower-square-base-border.glb",
  "/models/kenney/castle-kit/tower-hexagon-roof.glb",
  "/models/kenney/castle-kit/tower-hexagon-mid.glb",
  "/models/kenney/castle-kit/tower-hexagon-base.glb",
  "/models/kenney/castle-kit/gate.glb",
  "/models/kenney/castle-kit/wall.glb",
  "/models/kenney/castle-kit/flag-banner-long.glb",
  "/models/kenney/castle-kit/flag.glb",
];

export const NATURE_TREES: readonly string[] = [
  "/models/kenney/nature-kit/tree_thin.glb",
  "/models/kenney/nature-kit/tree_thin_dark.glb",
  "/models/kenney/nature-kit/tree_thin_fall.glb",
  "/models/kenney/nature-kit/tree_simple.glb",
  "/models/kenney/nature-kit/tree_pineDefaultA.glb",
  "/models/kenney/nature-kit/tree_pineDefaultB.glb",
  "/models/kenney/nature-kit/tree_default.glb",
  "/models/kenney/nature-kit/tree_oak.glb",
];

export const NATURE_ROCKS: readonly string[] = [
  "/models/kenney/nature-kit/rock_largeA.glb",
  "/models/kenney/nature-kit/rock_largeB.glb",
  "/models/kenney/nature-kit/rock_smallA.glb",
  "/models/kenney/nature-kit/rock_smallB.glb",
  "/models/kenney/nature-kit/stone_largeA.glb",
];

export const NATURE_DECOR: readonly string[] = [
  "/models/kenney/nature-kit/grass.glb",
  "/models/kenney/nature-kit/flower_purpleA.glb",
  "/models/kenney/nature-kit/flower_redA.glb",
  "/models/kenney/nature-kit/flower_yellowA.glb",
  "/models/kenney/nature-kit/mushroom_redGroup.glb",
  "/models/kenney/nature-kit/log.glb",
];

// Garden details from the fantasy-town kit.
export const FENCES: readonly string[] = [
  "/models/kenney/fantasy-town/fence.glb",
  "/models/kenney/fantasy-town/fence-curved.glb",
  "/models/kenney/fantasy-town/fence-gate.glb",
  "/models/kenney/fantasy-town/fence-broken.glb",
];

export const HEDGES: readonly string[] = [
  "/models/kenney/fantasy-town/hedge.glb",
  "/models/kenney/fantasy-town/hedge-curved.glb",
  "/models/kenney/fantasy-town/hedge-large.glb",
  "/models/kenney/fantasy-town/hedge-gate.glb",
];

export const LANTERN  = "/models/kenney/fantasy-town/lantern.glb";
export const FOUNTAIN = "/models/kenney/fantasy-town/fountain-round-detail.glb";

// Polyhaven textures (1k) — diffuse / normal / roughness triplets.
export const TEXTURE_SETS = {
  grass: {
    diff:  "/models/polyhaven/grass_diff_1k.jpg",
    norm:  "/models/polyhaven/grass_nor_gl_1k.jpg",
    rough: "/models/polyhaven/grass_rough_1k.jpg",
  },
  dirt: {
    diff:  "/models/polyhaven/dirt_diff_1k.jpg",
    norm:  "/models/polyhaven/dirt_nor_gl_1k.jpg",
    rough: "/models/polyhaven/dirt_rough_1k.jpg",
  },
  rock: {
    diff:  "/models/polyhaven/rock_diff_1k.jpg",
    norm:  "/models/polyhaven/rock_nor_gl_1k.jpg",
    rough: "/models/polyhaven/rock_rough_1k.jpg",
  },
  sand: {
    diff:  "/models/polyhaven/sand_diff_1k.jpg",
    norm:  "/models/polyhaven/sand_nor_gl_1k.jpg",
    rough: "/models/polyhaven/sand_rough_1k.jpg",
  },
} as const;

export const HDRI_SKY = "/models/polyhaven/sky_puresky_1k.hdr";
