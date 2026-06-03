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
