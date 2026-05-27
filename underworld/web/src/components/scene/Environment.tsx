import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import GlbModel from "./GlbModel";
import {
  CASTLE_BUILDINGS, CITY_BUILDINGS, FENCES, FOUNTAIN, HEDGES, LANTERN,
  NATURE_ROCKS, NATURE_TREES, NATURE_DECOR, TEXTURE_SETS,
} from "./assets";
import type { Pois } from "./pois";

interface Props {
  pois: Pois;
  size: number;
  seed: number;
  tick: number;
}

// Preload the obelisk-tower stack so the central building is ready when the
// scene mounts (everything else streams in).
useGLTF.preload("/models/kenney/castle-kit/tower-square-base-border.glb");
useGLTF.preload("/models/kenney/castle-kit/tower-square-mid-windows.glb");
useGLTF.preload("/models/kenney/castle-kit/tower-square-roof.glb");

function hashSeed(seed: number, salt: number): number {
  let s = (seed ^ salt) | 0;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  return ((s ^ (s >>> 14)) >>> 0);
}

// Central monument: stack three Kenney castle tower segments + a glowing
// torus + light beam, to mark the world's invention plaza.
function CentralTower({ position, tick }: { position: [number, number, number]; tick: number }) {
  const pulse = 0.55 + 0.45 * Math.sin(tick * 0.18);
  // Stack four Kenney castle segments. Each segment is ~1u tall in source —
  // scale 6 makes it a ~6u storey, so the tower is ~30u tall against a
  // 120u world. The flag sits on top.
  const S = 6;
  return (
    <group position={position}>
      <GlbModel url="/models/kenney/castle-kit/tower-square-base-border.glb" position={[0, 0, 0]} scale={S} />
      <GlbModel url="/models/kenney/castle-kit/tower-square-mid-windows.glb" position={[0, S * 1.0, 0]} scale={S} />
      <GlbModel url="/models/kenney/castle-kit/tower-square-mid-door.glb" position={[0, S * 2.0, 0]} scale={S} />
      <GlbModel url="/models/kenney/castle-kit/tower-square-roof.glb" position={[0, S * 3.0, 0]} scale={S} />
      <GlbModel url="/models/kenney/castle-kit/flag.glb" position={[0, S * 4.4, 0]} scale={S} />

      <mesh position={[0, S * 2.5, 0]}>
        <torusGeometry args={[S * 1.2, 0.30, 16, 64]} />
        <meshStandardMaterial
          color="#4ade80"
          emissive="#4ade80"
          emissiveIntensity={3.5 * pulse}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, S * 8, 0]}>
        <cylinderGeometry args={[0.30, 0.30, S * 12, 8]} />
        <meshBasicMaterial color="#86efac" transparent opacity={0.7 * pulse} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[S * 1.7, S * 1.9, 64]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <pointLight color="#4ade80" intensity={40 * pulse} distance={60} position={[0, S * 2, 0]} />
    </group>
  );
}

// Curved dirt path from A → B drawn on the ground as a textured ribbon.
function Road({ from, to, width = 1.8 }: { from: [number, number, number]; to: [number, number, number]; width?: number }) {
  const tex = useLoader(THREE.TextureLoader, [TEXTURE_SETS.dirt.diff, TEXTURE_SETS.dirt.norm, TEXTURE_SETS.dirt.rough]);
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.max(0.01, Math.hypot(dx, dz));
  const angle = Math.atan2(dx, dz);
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[2] + to[2]) / 2;
  const ty = Math.max(from[1], to[1]) + 0.06;

  // Clone the dirt textures per Road so each instance has its own repeat /
  // colorSpace settings. Without this, every Road and the splat-mapped
  // terrain (which loads the same URLs via the useLoader cache) would all
  // stomp on each other's tiling on every render.
  const local = useMemo(() => {
    const repeat = Math.max(1, len / 3);
    const clones = tex.map((t, i) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeat, 1);
      c.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      c.needsUpdate = true;
      return c;
    });
    return { diff: clones[0], norm: clones[1], rough: clones[2] };
  }, [tex, len]);

  // Release the cloned textures on unmount / dep change so re-seeding the
  // world doesn't accumulate orphaned road textures.
  useEffect(() => {
    return () => {
      local.diff.dispose();
      local.norm.dispose();
      local.rough.dispose();
    };
  }, [local]);

  return (
    <mesh
      position={[cx, ty, cz]}
      rotation={[-Math.PI / 2, 0, -angle]}
      receiveShadow
    >
      <planeGeometry args={[width, len]} />
      <meshStandardMaterial map={local.diff} normalMap={local.norm} roughnessMap={local.rough} roughness={1.0} />
    </mesh>
  );
}

export default function WorldEnvironment({ pois, size, seed, tick }: Props) {
  // Building variant + rotation per hut POI (stable per seed/index).
  // Kenney suburban buildings are ~1u tall in source; scale 5.5 makes a
  // ~5.5u-tall house, visible from anywhere in a 120u world.
  const buildings = useMemo(() =>
    pois.huts.map((h, i) => {
      const h0 = hashSeed(seed, i * 7 + 1);
      const variant = CITY_BUILDINGS[h0 % CITY_BUILDINGS.length];
      const scale = 5.5 + ((h0 >> 8) & 0x3f) / 60;
      return { url: variant, pos: h.pos, rot: h.rot, scale };
    }),
    [pois.huts, seed],
  );

  const trees = useMemo(() =>
    pois.trees.map((t, i) => {
      const h0 = hashSeed(seed, i * 11 + 2);
      const variant = NATURE_TREES[h0 % NATURE_TREES.length];
      return { url: variant, pos: t.pos, scale: t.scale * 4.5 };
    }),
    [pois.trees, seed],
  );

  const rocks = useMemo(() =>
    pois.rocks.map((r, i) => {
      const h0 = hashSeed(seed, i * 13 + 3);
      const variant = NATURE_ROCKS[h0 % NATURE_ROCKS.length];
      return { url: variant, pos: r.pos, scale: r.scale * 4.0, rot: r.rot };
    }),
    [pois.rocks, seed],
  );

  // Sprinkle small decor (flowers, grass tufts, mushrooms, logs) — purely
  // decorative, much cheaper than full buildings so we lay down a lot.
  const decor = useMemo(() => {
    const out: { url: string; pos: [number, number, number]; rot: number; scale: number }[] = [];
    const rng = (i: number) => ((Math.imul(hashSeed(seed, i * 41), 2654435761) >>> 0) / 4294967296);
    let i = 0;
    for (const t of pois.trees) {
      const count = 2 + Math.floor(rng(i++) * 4);
      for (let k = 0; k < count; k++) {
        const angle = rng(i++) * Math.PI * 2;
        const r = 3 + rng(i++) * 6;
        const url = NATURE_DECOR[Math.floor(rng(i++) * NATURE_DECOR.length)];
        out.push({
          url,
          pos: [t.pos[0] + Math.cos(angle) * r, t.pos[1], t.pos[2] + Math.sin(angle) * r],
          rot: rng(i++) * Math.PI * 2,
          scale: 2.5 + rng(i++) * 2.0,
        });
      }
    }
    return out.slice(0, 200);
  }, [pois.trees, seed]);

  // Roads from the tower to each plaza & to a handful of buildings, so the
  // landscape has visible structure linking the POIs.
  const roads = useMemo(() => {
    const out: { from: [number, number, number]; to: [number, number, number] }[] = [];
    for (const p of pois.plazas) out.push({ from: pois.obelisk, to: p });
    for (const b of buildings.slice(0, 8)) out.push({ from: pois.obelisk, to: b.pos });
    return out;
  }, [pois, buildings]);

  // Fences + hedges around each building, fountains in plazas, lanterns along
  // the road network at fixed intervals.
  const yards = useMemo(() => {
    const fences: { url: string; pos: [number, number, number]; rot: number }[] = [];
    const hedges: typeof fences = [];
    buildings.forEach((b, i) => {
      const baseRot = b.rot;
      // Four corner pegs per building.
      for (let k = 0; k < 4; k++) {
        const ang = baseRot + (k * Math.PI) / 2;
        const r = 5.5;
        const fx = b.pos[0] + Math.cos(ang) * r;
        const fz = b.pos[2] + Math.sin(ang) * r;
        const variant = (hashSeed(seed, i * 23 + k) % FENCES.length);
        fences.push({ url: FENCES[variant], pos: [fx, b.pos[1], fz], rot: ang + Math.PI / 2 });
      }
      // One hedge cluster per garden.
      const hedgeVariant = HEDGES[hashSeed(seed, i * 29) % HEDGES.length];
      hedges.push({
        url: hedgeVariant,
        pos: [b.pos[0] + 4.5, b.pos[1], b.pos[2] - 4.5],
        rot: baseRot,
      });
    });
    return { fences, hedges };
  }, [buildings, seed]);

  const lanterns = useMemo(() => {
    // Distribute lanterns along every road segment at ~10u spacing, offset
    // to alternating sides. Each road gets a hashed parity so the first
    // lantern of each spoke doesn't always cluster on the same side of the
    // central obelisk where every road starts.
    const out: [number, number, number][] = [];
    roads.forEach((r, ri) => {
      const len = Math.hypot(r.to[0] - r.from[0], r.to[2] - r.from[2]);
      const count = Math.max(2, Math.floor(len / 10));
      const parity = hashSeed(seed, ri * 17 + 5) & 1;
      const dx = r.to[0] - r.from[0];
      const dz = r.to[2] - r.from[2];
      const nx = -dz / Math.max(1e-3, len);
      const nz = dx / Math.max(1e-3, len);
      for (let i = 1; i < count; i++) {
        const t = i / count;
        const side = ((i + parity) % 2 === 0 ? 1.6 : -1.6);
        out.push([
          r.from[0] + dx * t + nx * side,
          Math.max(r.from[1], r.to[1]),
          r.from[2] + dz * t + nz * side,
        ]);
      }
    });
    return out;
  }, [roads, seed]);

  const fountains = useMemo(
    () => pois.plazas.map((p, i) => ({ pos: p, rot: (hashSeed(seed, i * 31) % 360) * Math.PI / 180 })),
    [pois.plazas, seed],
  );

  return (
    <group>
      <CentralTower position={pois.obelisk} tick={tick} />
      <Suspense fallback={null}>
        {roads.map((r, i) => (
          <Road key={`r${i}`} from={r.from} to={r.to} />
        ))}
        {buildings.map((b, i) => (
          <GlbModel key={`b${i}`} url={b.url} position={b.pos} rotation={b.rot} scale={b.scale} />
        ))}
        {yards.fences.map((f, i) => (
          <GlbModel key={`fc${i}`} url={f.url} position={f.pos} rotation={f.rot} scale={3.0} />
        ))}
        {yards.hedges.map((h, i) => (
          <GlbModel key={`hd${i}`} url={h.url} position={h.pos} rotation={h.rot} scale={3.0} />
        ))}
        {fountains.map((f, i) => (
          <GlbModel key={`fn${i}`} url={FOUNTAIN} position={f.pos} rotation={f.rot} scale={3.5} />
        ))}
        {lanterns.map((p, i) => (
          <group key={`ln${i}`} position={p}>
            <GlbModel url={LANTERN} position={[0, 0, 0]} scale={3.2} />
            {/* Only the first 8 lanterns get a real point light — most GPUs
                tank past ~16 simultaneous dynamic lights. The remainder rely
                on the bloom pass + the lantern's own emissive material to
                read as lit at night. */}
            {i < 8 ? (
              <pointLight color="#ffd58a" intensity={3.0} distance={14} position={[0, 4.5, 0]} />
            ) : null}
          </group>
        ))}
        {trees.map((t, i) => (
          <GlbModel key={`t${i}`} url={t.url} position={t.pos} scale={t.scale} />
        ))}
        {rocks.map((r, i) => (
          <GlbModel key={`rk${i}`} url={r.url} position={r.pos} scale={r.scale} rotation={r.rot} />
        ))}
        {decor.map((d, i) => (
          <GlbModel key={`d${i}`} url={d.url} position={d.pos} scale={d.scale} rotation={d.rot} castShadow={false} />
        ))}
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#0a0f1a" roughness={1} />
      </mesh>
    </group>
  );
}
