// Catalog of CC0 GLB assets shipped in /public/models. Centralised so the
// scene can reference assets by symbolic name instead of brittle path strings.
//
// Sources:
//   /models/Robot/Michelle/Xbot       — Three.js examples (CC0, Mixamo)
//   /models/kenney/city-kit-suburban  — Kenney CC0 suburban building kit
//   /models/kenney/castle-kit         — Kenney CC0 castle/fortress kit
//   /models/kenney/nature-kit         — Kenney CC0 nature kit (trees, rocks, fences)
//   /models/polyhaven                 — Polyhaven CC0 PBR textures + HDRI

import type { Guild } from "@/lib/types";

// Per-guild character GLB. We have 3 animated humanoids → spread them
// across guilds by domain (research / engineering / field+reviewer).
const CHARACTER_BY_GUILD: Record<Guild, string> = {
  // Research → Michelle (Mixamo, female humanoid, multiple anims)
  maths:       "/models/Michelle.glb",
  physics:     "/models/Michelle.glb",
  computing:   "/models/Michelle.glb",
  // Engineering / construction → Xbot (Mixamo, mechanical humanoid)
  mechanical:  "/models/Xbot.glb",
  electrical:  "/models/Xbot.glb",
  civil:       "/models/Xbot.glb",
  energy:      "/models/Xbot.glb",
  // Field / governance → RobotExpressive (cute styled robot, full anim set)
  agriculture: "/models/RobotExpressive.glb",
  materials:   "/models/RobotExpressive.glb",
  patent:      "/models/RobotExpressive.glb",
  safety:      "/models/RobotExpressive.glb",
};

export function characterModelFor(guild: Guild): string {
  return CHARACTER_BY_GUILD[guild] ?? "/models/RobotExpressive.glb";
}

export const ALL_CHARACTER_MODELS: readonly string[] = [
  "/models/Michelle.glb",
  "/models/Xbot.glb",
  "/models/RobotExpressive.glb",
];

// Suburban houses A..U from Kenney.
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
