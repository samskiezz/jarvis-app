import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import GlbModel from "./GlbModel";
import { FOUNTAIN, LANTERN, SKYSCRAPERS, TEXTURE_SETS } from "./assets";
import InstancedCity from "./InstancedCity";
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

// The civic institutions of every world — mapped onto the buildings nearest the
// monument, each labelled + beaconed so the city reads as a real civilisation.
const CIVIC_ROSTER = [
  { name: "Town Hall", icon: "🏛", color: "#fbbf24" },
  { name: "University", icon: "🎓", color: "#38bdf8" },
  { name: "Hospital", icon: "🏥", color: "#fb7185" },
  { name: "Library", icon: "📚", color: "#a78bfa" },
  { name: "Market", icon: "🏪", color: "#34d399" },
  { name: "Observatory", icon: "🔭", color: "#818cf8" },
  { name: "Power Plant", icon: "⚡", color: "#facc15" },
  { name: "Physics Guild", icon: "⚛", color: "#38bdf8" },
  { name: "Maths Guild", icon: "∑", color: "#a78bfa" },
  { name: "Computing Guild", icon: "💻", color: "#34d399" },
  { name: "Materials Guild", icon: "🧱", color: "#f472b6" },
  { name: "Energy Guild", icon: "🔋", color: "#facc15" },
  { name: "Patent Office", icon: "⚖", color: "#c084fc" },
  { name: "Safety Board", icon: "🛡", color: "#fb7185" },
] as const;


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
  // Buildings, zoned by distance from the monument into civic core → commercial
  // → residential. The nearest are the named civic institutions. Bodies are
  // rendered by InstancedCity (one draw call each); here we only compute the
  // layout + civic identities (labels/beacons rendered below).
  const buildings = useMemo(() => {
    const civicMap = new Map<number, (typeof CIVIC_ROSTER)[number]>();
    pois.huts
      .map((h, i) => ({ i, d: Math.hypot(h.pos[0] - pois.obelisk[0], h.pos[2] - pois.obelisk[2]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, CIVIC_ROSTER.length)
      .forEach((o, k) => civicMap.set(o.i, CIVIC_ROSTER[k]));

    return pois.huts.map((h, i) => {
      const distFromCenter = Math.hypot(h.pos[0] - pois.obelisk[0], h.pos[2] - pois.obelisk[2]);
      const civic = civicMap.get(i);
      const zone: "residential" | "commercial" | "skyscraper" =
        civic || distFromCenter < size * 0.12 ? "skyscraper"
        : distFromCenter < size * 0.32 ? "commercial"
        : "residential";
      return { pos: h.pos, rot: h.rot, zone, civic };
    });
  }, [pois.huts, pois.obelisk, seed, size]);

  // Roads from the tower to each plaza & to a handful of buildings.
  const roads = useMemo(() => {
    const out: { from: [number, number, number]; to: [number, number, number] }[] = [];
    for (const p of pois.plazas) out.push({ from: pois.obelisk, to: p });
    for (const b of buildings.slice(0, 8)) out.push({ from: pois.obelisk, to: b.pos });
    return out;
  }, [pois, buildings]);

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
      {/* The whole city/forest in ~6 GPU-instanced draw calls (mobile-friendly). */}
      <InstancedCity buildings={buildings} trees={pois.trees} rocks={pois.rocks} />
      <Suspense fallback={null}>
        {roads.map((r, i) => (
          <Road key={`r${i}`} from={r.from} to={r.to} />
        ))}
        {/* Civic institutions: a coloured beacon + a floating nameplate so the
            city reads as a real civilisation (guild halls, university, hospital). */}
        {buildings.filter((b) => b.civic).map((b, i) => (
          <group key={`civic${i}`} position={[b.pos[0], b.pos[1], b.pos[2]]}>
            {/* Hybrid: civic landmarks are detailed GLB buildings (not instanced),
                so the city core has real geometry while the bulk stays instanced. */}
            <GlbModel
              url={SKYSCRAPERS[hashSeed(seed, i * 7 + 3) % SKYSCRAPERS.length]}
              position={[0, 0, 0]} rotation={b.rot} scale={9} />
            <mesh position={[0, 28, 0]}>
              <cylinderGeometry args={[0.5, 0.5, 56, 6]} />
              <meshBasicMaterial color={b.civic!.color} transparent opacity={0.35} toneMapped={false} />
            </mesh>
            <Html position={[0, 40, 0]} center distanceFactor={140} style={{ pointerEvents: "none" }}>
              <div className="whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-semibold shadow-xl backdrop-blur"
                style={{ borderColor: b.civic!.color, color: b.civic!.color, background: "rgba(10,14,26,0.85)" }}>
                {b.civic!.icon} {b.civic!.name}
              </div>
            </Html>
          </group>
        ))}
        {fountains.map((f, i) => (
          <GlbModel key={`fn${i}`} url={FOUNTAIN} position={f.pos} rotation={f.rot} scale={3.5} />
        ))}
        {lanterns.slice(0, 48).map((p, i) => (
          <group key={`ln${i}`} position={p}>
            <GlbModel url={LANTERN} position={[0, 0, 0]} scale={3.2} />
            {i < 8 ? (
              <pointLight color="#ffd58a" intensity={3.0} distance={14} position={[0, 4.5, 0]} />
            ) : null}
          </group>
        ))}
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#0a0f1a" roughness={1} />
      </mesh>
    </group>
  );
}
