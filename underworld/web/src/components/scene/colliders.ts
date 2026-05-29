// Cheap distance-based collider list. Built once per (pois, seed) by the
// scene and passed to the avatars. Avatars test `clampToFree(x, z, ...)`
// in every frame's movement step — if the next position would be inside
// any collider, the call returns a position pushed back along the
// surface normal so the avatar slides along the obstacle instead of
// walking through it.
//
// A real physics engine (Rapier, Cannon) would be overkill here — we
// have ~200 static obstacles, no dynamic objects, no rotation. AABB
// math at 60 fps with 200 obstacles and ~150 minions is sub-millisecond.

export interface Collider {
  /** World-space centre (X, Z). Y is ignored — we only collide on the ground plane. */
  x: number;
  z: number;
  /** Footprint radius. Avatar is treated as a point. */
  r: number;
}

/** Push (newX, newZ) out of any collider it would intersect, considering
 *  the avatar's own radius. Returns the corrected position. */
export function clampToFree(
  newX: number,
  newZ: number,
  avatarRadius: number,
  colliders: readonly Collider[],
): [number, number] {
  let x = newX;
  let z = newZ;
  // Two-pass push so adjacent obstacles don't trap us in a corner — the
  // first push may shove us into a neighbouring collider, the second
  // pushes us back out.
  for (let pass = 0; pass < 2; pass++) {
    let pushed = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const minDist = c.r + avatarRadius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist * minDist) {
        const d = Math.sqrt(d2);
        if (d < 1e-4) {
          // Coincident → push out in any direction.
          x = c.x + minDist;
          z = c.z;
        } else {
          const k = minDist / d;
          x = c.x + dx * k;
          z = c.z + dz * k;
        }
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return [x, z];
}
