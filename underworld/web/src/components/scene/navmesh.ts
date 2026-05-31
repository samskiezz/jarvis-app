// Lightweight navmesh: a coarse occupancy grid over the world + A* pathfinding
// with line-of-sight string-pulling. Replaces the old "walk straight + push out
// of obstacles" behaviour — minions now route AROUND buildings, rocks and the
// monument along real paths. Pure TS (no WASM/recast dep), recomputed only when
// a minion's destination changes.

import type { Collider } from "./colliders";

const CELL = 6;          // world units per grid cell
const AGENT_R = 1.4;     // minion clearance

function buildGrid(size: number, colliders: readonly Collider[]) {
  const half = size / 2;
  const n = Math.ceil(size / CELL);
  const blocked = new Uint8Array(n * n);
  for (let gz = 0; gz < n; gz++) {
    for (let gx = 0; gx < n; gx++) {
      const wx = (gx + 0.5) * CELL - half;
      const wz = (gz + 0.5) * CELL - half;
      for (const c of colliders) {
        if (Math.hypot(c.x - wx, c.z - wz) < c.r + AGENT_R) {
          blocked[gz * n + gx] = 1;
          break;
        }
      }
    }
  }
  return { n, half, blocked };
}

function lineClear(
  ax: number, az: number, bx: number, bz: number,
  colliders: readonly Collider[],
): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const c of colliders) {
      if (Math.hypot(c.x - x, c.z - z) < c.r + AGENT_R) return false;
    }
  }
  return true;
}

/** A* over the occupancy grid from start→goal, returned as world-space waypoints
 *  (string-pulled so straight runs aren't a staircase). Falls back to a direct
 *  line when no path exists or the route is already clear. */
export function findPath(
  start: [number, number],
  goal: [number, number],
  colliders: readonly Collider[],
  size: number,
): [number, number][] {
  if (lineClear(start[0], start[1], goal[0], goal[1], colliders)) return [goal];

  const { n, half, blocked } = buildGrid(size, colliders);
  const cell = (x: number, z: number): [number, number] => [
    Math.max(0, Math.min(n - 1, Math.floor((x + half) / CELL))),
    Math.max(0, Math.min(n - 1, Math.floor((z + half) / CELL))),
  ];
  const world = (gx: number, gz: number): [number, number] => [
    (gx + 0.5) * CELL - half, (gz + 0.5) * CELL - half,
  ];
  const id = (gx: number, gz: number) => gz * n + gx;

  const [sx, sz] = cell(start[0], start[1]);
  const [gx, gz] = cell(goal[0], goal[1]);
  const sId = id(sx, sz);
  const gId = id(gx, gz);

  const open = new Set<number>([sId]);
  const came = new Map<number, number>();
  const g = new Map<number, number>([[sId, 0]]);
  const h = (a: number) => {
    const az = Math.floor(a / n), ax = a % n;
    return Math.hypot(ax - gx, az - gz);
  };
  const f = new Map<number, number>([[sId, h(sId)]]);

  let guard = 0;
  while (open.size && guard++ < 6000) {
    let cur = -1, best = Infinity;
    for (const o of open) { const fv = f.get(o) ?? Infinity; if (fv < best) { best = fv; cur = o; } }
    if (cur === gId) break;
    open.delete(cur);
    const cz = Math.floor(cur / n), cx = cur % n;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        if (blocked[id(nx, nz)]) continue;
        if (dx && dz && (blocked[id(cx + dx, cz)] || blocked[id(cx, cz + dz)])) continue; // no corner-cutting
        const nId = id(nx, nz);
        const tentative = (g.get(cur) ?? Infinity) + (dx && dz ? 1.414 : 1);
        if (tentative < (g.get(nId) ?? Infinity)) {
          came.set(nId, cur);
          g.set(nId, tentative);
          f.set(nId, tentative + h(nId));
          open.add(nId);
        }
      }
    }
  }

  if (!came.has(gId) && sId !== gId) return [goal];  // unreachable → best effort

  // Reconstruct grid path.
  const cells: number[] = [gId];
  let c = gId;
  while (came.has(c)) { c = came.get(c)!; cells.unshift(c); }
  const pts: [number, number][] = cells.map((cId) => world(cId % n, Math.floor(cId / n)));
  pts.push(goal);

  // String-pull: drop waypoints we can see past.
  const out: [number, number][] = [];
  let anchor: [number, number] = start;
  for (let i = 0; i < pts.length; i++) {
    const next = pts[i + 1];
    if (!next || !lineClear(anchor[0], anchor[1], next[0], next[1], colliders)) {
      out.push(pts[i]);
      anchor = pts[i];
    }
  }
  if (!out.length || out[out.length - 1][0] !== goal[0] || out[out.length - 1][1] !== goal[1]) {
    out.push(goal);
  }
  return out;
}
