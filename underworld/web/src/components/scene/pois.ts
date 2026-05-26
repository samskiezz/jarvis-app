// Points of interest in the 3D scene. Computed once per (grid, seed) and
// consumed by both the environment renderer (placing the geometry) and the
// avatar navigation (picking destinations based on action).

import { elevationAt } from "./Terrain";

export interface Pois {
  obelisk: [number, number, number];
  huts: { pos: [number, number, number]; rot: number }[];
  trees: { pos: [number, number, number]; scale: number }[];
  rocks: { pos: [number, number, number]; scale: number; rot: number }[];
  /** Open meeting spots — flattish dry cells without trees nearby. Used for
   *  socialise / teach / seek_partner so minions don't pile on the obelisk. */
  plazas: [number, number, number][];
}

export function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function worldHeight(grid: number[][], nx: number, ny: number, amplitude: number): number {
  const e = elevationAt(grid, nx, ny);
  if (e < 0.42) return 0;
  return (e - 0.42) * amplitude;
}

export function computePois(
  grid: number[][],
  size: number,
  amplitude: number,
  seed: number,
): Pois {
  const rng = mulberry32(seed);
  const huts: Pois["huts"] = [];
  const trees: Pois["trees"] = [];
  const rocks: Pois["rocks"] = [];
  const plazas: Pois["plazas"] = [];

  const tries = 600;
  for (let i = 0; i < tries; i++) {
    const nx = rng();
    const ny = rng();
    const e = elevationAt(grid, nx, ny);
    if (e < 0.43) continue;
    const x = (nx - 0.5) * size;
    const z = (ny - 0.5) * size;
    const y = worldHeight(grid, nx, ny, amplitude);
    const kind = rng();
    // Reserve a 14u "skirt" around the central monument for it to breathe.
    const inCentre = Math.hypot(x, z) < 14;
    if (!inCentre && e >= 0.45 && e < 0.72 && kind < 0.35 && huts.length < 30) {
      // Houses span grass through to light-forest elevations.
      huts.push({ pos: [x, y, z], rot: rng() * Math.PI * 2 });
    } else if (e > 0.50 && e < 0.86 && kind < 0.78 && trees.length < 140) {
      trees.push({ pos: [x, y, z], scale: 0.7 + rng() * 0.6 });
    } else if (e > 0.7 && rocks.length < 60) {
      rocks.push({ pos: [x, y, z], scale: 0.6 + rng() * 0.9, rot: rng() * Math.PI });
    } else if (e > 0.46 && e < 0.6 && plazas.length < 10) {
      plazas.push([x, y, z]);
    }
  }

  // Obelisk at world centre, walking outward until we hit dry land.
  let obelisk: [number, number, number] = [0, 0, 0];
  outer: for (let r = 0; r < 12; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (r !== 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = 0.5 + dx * 0.04;
        const ny = 0.5 + dy * 0.04;
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
        if (elevationAt(grid, nx, ny) >= 0.5) {
          obelisk = [(nx - 0.5) * size, worldHeight(grid, nx, ny, amplitude), (ny - 0.5) * size];
          break outer;
        }
      }
    }
  }

  return { obelisk, huts, trees, rocks, plazas };
}

// Action → destination kind. The scene resolves the kind into a concrete POI.
const ACTION_DEST: Record<string, "obelisk" | "hut" | "tree" | "plaza" | "home" | "still"> = {
  propose_invention: "obelisk",
  fork_self: "obelisk",
  study: "obelisk",
  search_patents: "obelisk",
  kb_lookup: "obelisk",
  teach: "plaza",
  socialise: "plaza",
  seek_partner: "plaza",
  eat: "hut",
  drink: "hut",
  rest: "hut",
  meditate: "tree",
  // Stationary actions
};

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function destinationForAction(
  minionId: string,
  action: string | undefined,
  pois: Pois,
  homePos: [number, number, number],
): { target: [number, number, number] | null; kind: string } {
  const kind = action ? ACTION_DEST[action] : null;
  if (!kind || kind === "still") return { target: null, kind: "still" };
  if (kind === "home") return { target: homePos, kind: "home" };

  const h = hash(minionId);
  if (kind === "obelisk") return { target: pois.obelisk, kind: "obelisk" };
  if (kind === "hut" && pois.huts.length) {
    return { target: pois.huts[h % pois.huts.length].pos, kind: "hut" };
  }
  if (kind === "tree" && pois.trees.length) {
    return { target: pois.trees[h % pois.trees.length].pos, kind: "tree" };
  }
  if (kind === "plaza" && pois.plazas.length) {
    return { target: pois.plazas[h % pois.plazas.length], kind: "plaza" };
  }
  return { target: null, kind: "still" };
}
