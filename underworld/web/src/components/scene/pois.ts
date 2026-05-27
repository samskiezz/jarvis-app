// Points of interest in the 3D scene. Computed once per (grid, seed) and
// consumed by both the environment renderer (placing the geometry) and the
// avatar navigation (picking destinations based on action).
//
// Placement uses Bridson's Poisson-disk sampling so buildings, trees, and
// rocks each maintain a guaranteed minimum spacing — no more clusters on
// top of each other.

import { elevationAt } from "./Terrain";

export interface Pois {
  obelisk: [number, number, number];
  huts: { pos: [number, number, number]; rot: number }[];
  trees: { pos: [number, number, number]; scale: number }[];
  rocks: { pos: [number, number, number]; scale: number; rot: number }[];
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

// Bridson's Poisson-disk sampler. `accept(x, z)` returns true if the cell is
// eligible (correct biome) — we reject samples outside the allowed band
// before they ever consume a spawn slot. `existing` is a list of pre-existing
// points that the new samples must also keep clear of.
function poissonSample(
  rng: () => number,
  size: number,
  minDist: number,
  maxPoints: number,
  k: number,
  accept: (x: number, z: number) => boolean,
  existing: [number, number][] = [],
): [number, number][] {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil(size / cellSize) + 1;
  const gridH = Math.ceil(size / cellSize) + 1;
  const grid: ([number, number] | null)[] = new Array(gridW * gridH).fill(null);
  const half = size / 2;

  const cellIdx = (x: number, z: number) => {
    const gx = Math.floor((x + half) / cellSize);
    const gz = Math.floor((z + half) / cellSize);
    return gz * gridW + gx;
  };
  const placeInGrid = (p: [number, number]) => { grid[cellIdx(p[0], p[1])] = p; };
  const farFromAll = (x: number, z: number): boolean => {
    const gx = Math.floor((x + half) / cellSize);
    const gz = Math.floor((z + half) / cellSize);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cx = gx + dx, cz = gz + dz;
        if (cx < 0 || cz < 0 || cx >= gridW || cz >= gridH) continue;
        const p = grid[cz * gridW + cx];
        if (p && Math.hypot(p[0] - x, p[1] - z) < minDist) return false;
      }
    }
    for (const p of existing) {
      if (Math.hypot(p[0] - x, p[1] - z) < minDist) return false;
    }
    return true;
  };

  const output: [number, number][] = [];
  const active: [number, number][] = [];

  // Seed with a random accepted sample.
  for (let tries = 0; tries < 50 && output.length === 0; tries++) {
    const x = (rng() - 0.5) * size;
    const z = (rng() - 0.5) * size;
    if (accept(x, z) && farFromAll(x, z)) {
      const p: [number, number] = [x, z];
      output.push(p); active.push(p); placeInGrid(p);
    }
  }

  while (active.length > 0 && output.length < maxPoints) {
    const i = Math.floor(rng() * active.length);
    const base = active[i];
    let placed = false;
    for (let j = 0; j < k; j++) {
      const theta = rng() * Math.PI * 2;
      const r = minDist * (1 + rng());
      const x = base[0] + Math.cos(theta) * r;
      const z = base[1] + Math.sin(theta) * r;
      if (x < -half || x > half || z < -half || z > half) continue;
      if (!accept(x, z) || !farFromAll(x, z)) continue;
      const p: [number, number] = [x, z];
      output.push(p); active.push(p); placeInGrid(p);
      placed = true;
      break;
    }
    if (!placed) active.splice(i, 1);
  }
  return output;
}

export function computePois(
  grid: number[][],
  size: number,
  amplitude: number,
  seed: number,
): Pois {
  const rng = mulberry32(seed);

  // Sample elevation at a world coord.
  const elevAt = (x: number, z: number): number => {
    const nx = (x / size) + 0.5;
    const ny = (z / size) + 0.5;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return 0;
    return elevationAt(grid, nx, ny);
  };

  // Obelisk first — at world centre, walking outward until we hit dry land.
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

  // 1. Buildings — generous spacing so houses don't pile on each other.
  //    Reserve a ~15u skirt around the obelisk for the plaza.
  const hutsXZ = poissonSample(rng, size, 14, 30, 30, (x, z) => {
    if (Math.hypot(x - obelisk[0], z - obelisk[2]) < 15) return false;
    const e = elevAt(x, z);
    return e >= 0.46 && e < 0.72;
  });

  // 2. Plazas — open meeting spots away from buildings.
  const hutsForExclusion = hutsXZ.map((p) => p as [number, number]);
  const plazasXZ = poissonSample(rng, size, 18, 8, 25, (x, z) => {
    const e = elevAt(x, z);
    return e >= 0.46 && e < 0.62;
  }, hutsForExclusion);

  // 3. Trees — tight spacing for a forested feel, but excluded from a small
  //    radius around every building & plaza so they don't grow through walls.
  const buildingsExclude: [number, number][] = hutsXZ.concat(plazasXZ).map((p) => [p[0], p[1]]);
  // Also exclude near the obelisk.
  buildingsExclude.push([obelisk[0], obelisk[2]]);
  const treesXZ = poissonSample(rng, size, 5.5, 200, 20, (x, z) => {
    if (Math.hypot(x - obelisk[0], z - obelisk[2]) < 18) return false;
    // Keep clear of building footprints (8u).
    for (const b of hutsXZ) if (Math.hypot(x - b[0], z - b[1]) < 8) return false;
    for (const p of plazasXZ) if (Math.hypot(x - p[0], z - p[1]) < 8) return false;
    const e = elevAt(x, z);
    return e > 0.50 && e < 0.86;
  });

  // 4. Rocks — sparse on the high ground.
  const rocksXZ = poissonSample(rng, size, 6, 50, 20, (x, z) => {
    if (Math.hypot(x - obelisk[0], z - obelisk[2]) < 20) return false;
    for (const b of hutsXZ) if (Math.hypot(x - b[0], z - b[1]) < 6) return false;
    const e = elevAt(x, z);
    return e > 0.7;
  });

  const liftY = (p: [number, number]): [number, number, number] => {
    const nx = (p[0] / size) + 0.5;
    const ny = (p[1] / size) + 0.5;
    return [p[0], worldHeight(grid, nx, ny, amplitude), p[1]];
  };

  return {
    obelisk,
    huts: hutsXZ.map((p) => ({ pos: liftY(p), rot: rng() * Math.PI * 2 })),
    trees: treesXZ.map((p) => ({ pos: liftY(p), scale: 0.85 + rng() * 0.5 })),
    rocks: rocksXZ.map((p) => ({ pos: liftY(p), scale: 0.7 + rng() * 0.8, rot: rng() * Math.PI })),
    plazas: plazasXZ.map((p) => liftY(p)),
  };
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
