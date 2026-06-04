import { Suspense, useEffect, useMemo, useState } from "react";
import NormalizedGlb from "./NormalizedGlb";
import { groupByCategory, loadGeneratedAssets, type GenAsset } from "./generatedAssets";
import { mulberry32, type Pois } from "./pois";

interface Props {
  pois: Pois;
  size: number;
  seed: number;
}

interface Placement {
  key: string;
  url: string;
  position: [number, number, number];
  targetSize: number;
  rotation: number;
}

/**
 * Instantiates the account-owned Tripo3D GLBs as real placed objects, layered
 * on top of the Kenney `WorldEnvironment` base. Placement is deterministic
 * (seeded mulberry32) and driven entirely by the POIs, so we only ever place
 * as many instances as the world layout allows — never all 442 at once.
 *
 * If a needed category hasn't been generated yet it's simply skipped, leaving
 * the Kenney placeholders visible so the world is never empty.
 */
export default function GeneratedWorld({ pois, size, seed }: Props) {
  const [assets, setAssets] = useState<GenAsset[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGeneratedAssets().then((a) => {
      if (!cancelled) setAssets(a);
    });
    return () => { cancelled = true; };
  }, []);

  const placements = useMemo<Placement[]>(() => {
    if (!assets || assets.length === 0) return [];
    void size; // layout is POI-driven; size kept for API symmetry.
    const byCat = groupByCategory(assets);
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const out: Placement[] = [];

    // Deterministic cycling pick from a category list.
    const pick = (list: GenAsset[] | undefined, i: number): GenAsset | null =>
      list && list.length ? list[i % list.length] : null;

    // MONUMENT: the fountain (or any monument asset) marks the central plaza.
    const monument = byCat.monument;
    if (monument && monument.length) {
      const a = monument[0];
      out.push({
        key: `mon-${a.id}`,
        url: a.path,
        position: pois.obelisk,
        targetSize: 10,
        rotation: 0,
      });
    }

    // GUILD / CIVIC BUILDINGS: one real building per hut POI, cycling through
    // the combined building+civic list. These visually replace the Kenney huts.
    const structures = [...(byCat.building ?? []), ...(byCat.civic ?? [])];
    if (structures.length) {
      pois.huts.forEach((h, i) => {
        const a = pick(structures, i);
        if (!a) return;
        out.push({
          key: `bld-${i}-${a.id}`,
          url: a.path,
          position: h.pos,
          targetSize: 14,
          rotation: h.rot,
        });
      });
    }

    // NATURE: trees, bushes, flowers at the tree POIs, sized by the POI scale.
    const flora = [...(byCat.nature ?? []), ...(byCat.biome ?? [])];
    if (flora.length) {
      pois.trees.forEach((t, i) => {
        const a = pick(flora, i);
        if (!a) return;
        const targetSize = (4 + rng() * 3) * t.scale; // 4–7 * poi scale
        out.push({
          key: `nat-${i}-${a.id}`,
          url: a.path,
          position: t.pos,
          targetSize,
          rotation: rng() * Math.PI * 2,
        });
      });
    }

    // TERRAIN PROPS: boulders / cliffs at the rock POIs, sized by the POI scale.
    const terrain = byCat.terrain;
    if (terrain && terrain.length) {
      pois.rocks.forEach((r, i) => {
        const a = pick(terrain, i);
        if (!a) return;
        const targetSize = (3 + rng() * 3) * r.scale; // 3–6 * poi scale
        out.push({
          key: `ter-${i}-${a.id}`,
          url: a.path,
          position: r.pos,
          targetSize,
          rotation: r.rot,
        });
      });
    }

    // PLAZA PROPS: scatter a few small dressing items in a ring at each plaza.
    const props = [
      ...(byCat.furniture ?? []),
      ...(byCat.object ?? []),
      ...(byCat.community ?? []),
      ...(byCat.infra ?? []),
      ...(byCat.household ?? []),
    ];
    if (props.length) {
      pois.plazas.forEach((p, pi) => {
        const count = 3 + Math.floor(rng() * 2); // 3–4 items per plaza
        for (let j = 0; j < count; j++) {
          const a = pick(props, pi * 5 + j);
          if (!a) continue;
          const ang = rng() * Math.PI * 2;
          const radius = 4 + rng() * 5;
          out.push({
            key: `plz-${pi}-${j}-${a.id}`,
            url: a.path,
            position: [
              p[0] + Math.cos(ang) * radius,
              p[1],
              p[2] + Math.sin(ang) * radius,
            ],
            targetSize: 1.5 + rng() * 1.5, // 1.5–3
            rotation: rng() * Math.PI * 2,
          });
        }
      });
    }

    // VEHICLES: a handful parked around the world — beside plazas and beside a
    // few hut/building POIs (offset to the side so they never overlap a
    // structure). Capped so we only ever see a small, believable motor pool.
    const vehicles = byCat.vehicle;
    if (vehicles && vehicles.length) {
      const VEHICLE_CAP = 12;
      let vi = 0;
      // One near each plaza, parked off to the side.
      for (let pi = 0; pi < pois.plazas.length && vi < VEHICLE_CAP; pi++) {
        const a = pick(vehicles, vi);
        if (!a) break;
        const p = pois.plazas[pi];
        const ang = rng() * Math.PI * 2;
        const radius = 7 + rng() * 4;
        out.push({
          key: `veh-plz-${pi}-${a.id}`,
          url: a.path,
          position: [p[0] + Math.cos(ang) * radius, p[1], p[2] + Math.sin(ang) * radius],
          targetSize: 4 + rng() * 2, // 4–6
          rotation: rng() * Math.PI * 2,
        });
        vi++;
      }
      // The rest parked beside building/hut POIs, offset to one side.
      for (let hi = 0; hi < pois.huts.length && vi < VEHICLE_CAP; hi += 7) {
        const a = pick(vehicles, vi);
        if (!a) break;
        const h = pois.huts[hi];
        const ang = rng() * Math.PI * 2;
        const radius = 8 + rng() * 3;
        out.push({
          key: `veh-hut-${hi}-${a.id}`,
          url: a.path,
          position: [h.pos[0] + Math.cos(ang) * radius, h.pos[1], h.pos[2] + Math.sin(ang) * radius],
          targetSize: 4 + rng() * 2, // 4–6
          rotation: rng() * Math.PI * 2,
        });
        vi++;
      }
    }

    // CLUTTER PROPS: set-dressing scattered around plazas AND around a subset of
    // building/hut POIs for a lived-in look. Capped per spot and overall.
    const clutter = byCat.prop;
    if (clutter && clutter.length) {
      const PROP_CAP = 60;
      let ci = 0;
      // ~3 per plaza.
      for (let pi = 0; pi < pois.plazas.length && ci < PROP_CAP; pi++) {
        const p = pois.plazas[pi];
        for (let j = 0; j < 3 && ci < PROP_CAP; j++) {
          const a = pick(clutter, ci);
          if (!a) break;
          const ang = rng() * Math.PI * 2;
          const radius = 3 + rng() * 5;
          out.push({
            key: `prp-plz-${pi}-${j}-${a.id}`,
            url: a.path,
            position: [p[0] + Math.cos(ang) * radius, p[1], p[2] + Math.sin(ang) * radius],
            targetSize: 1.2 + rng() * 1.3, // 1.2–2.5
            rotation: rng() * Math.PI * 2,
          });
          ci++;
        }
      }
      // ~1 near every few huts (skip-step keeps the overall count sensible).
      for (let hi = 0; hi < pois.huts.length && ci < PROP_CAP; hi += 4) {
        const a = pick(clutter, ci);
        if (!a) break;
        const h = pois.huts[hi];
        const ang = rng() * Math.PI * 2;
        const radius = 5 + rng() * 3;
        out.push({
          key: `prp-hut-${hi}-${a.id}`,
          url: a.path,
          position: [h.pos[0] + Math.cos(ang) * radius, h.pos[1], h.pos[2] + Math.sin(ang) * radius],
          targetSize: 1.2 + rng() * 1.3, // 1.2–2.5
          rotation: rng() * Math.PI * 2,
        });
        ci++;
      }
    }

    // WEAPONS: a small, deliberate "armory display" ring near the central
    // obelisk/monument — displayed on the ground, never littered everywhere.
    const weapons = byCat.weapon;
    if (weapons && weapons.length) {
      const WEAPON_CAP = 6;
      const count = Math.min(WEAPON_CAP, weapons.length + 2);
      const baseAng = rng() * Math.PI * 2;
      for (let wi = 0; wi < count; wi++) {
        const a = pick(weapons, wi);
        if (!a) break;
        const ang = baseAng + (wi / count) * Math.PI * 2;
        const radius = 6 + rng() * 2;
        out.push({
          key: `wpn-${wi}-${a.id}`,
          url: a.path,
          position: [
            pois.obelisk[0] + Math.cos(ang) * radius,
            pois.obelisk[1],
            pois.obelisk[2] + Math.sin(ang) * radius,
          ],
          targetSize: 1.5 + rng() * 1.0, // 1.5–2.5
          rotation: rng() * Math.PI * 2,
        });
      }
    }

    return out;
  }, [assets, pois, seed, size]);

  if (!assets || placements.length === 0) return null;

  return (
    <Suspense fallback={null}>
      <group>
        {placements.map((p) => (
          <NormalizedGlb
            key={p.key}
            url={p.url}
            position={p.position}
            targetSize={p.targetSize}
            rotation={p.rotation}
          />
        ))}
      </group>
    </Suspense>
  );
}
