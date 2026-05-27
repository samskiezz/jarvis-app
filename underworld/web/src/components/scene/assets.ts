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

// One distinct blocky-character per guild. 18 characters available; we pick
// 11 visually different ones (skipping near-duplicates).
const CHARACTER_BY_GUILD: Record<Guild, string> = {
  maths:       "/models/kenney/blocky-characters/character-a.glb",
  physics:     "/models/kenney/blocky-characters/character-b.glb",
  electrical:  "/models/kenney/blocky-characters/character-c.glb",
  mechanical:  "/models/kenney/blocky-characters/character-d.glb",
  civil:       "/models/kenney/blocky-characters/character-e.glb",
  materials:   "/models/kenney/blocky-characters/character-f.glb",
  computing:   "/models/kenney/blocky-characters/character-g.glb",
  energy:      "/models/kenney/blocky-characters/character-h.glb",
  agriculture: "/models/kenney/blocky-characters/character-i.glb",
  patent:      "/models/kenney/blocky-characters/character-j.glb",
  safety:      "/models/kenney/blocky-characters/character-k.glb",
};

export function characterModelFor(guild: Guild): string {
  return CHARACTER_BY_GUILD[guild] ?? CHARACTER_BY_GUILD.computing;
}

export const ALL_CHARACTER_MODELS: readonly string[] = Object.values(CHARACTER_BY_GUILD);

// Suburban houses A..P from Kenney.
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
