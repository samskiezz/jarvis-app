import { useMemo } from "react";
import * as THREE from "three";
import { elevationAt } from "./Terrain";

interface Props {
  grid: number[][];
  size: number;
  amplitude: number;
  seed: number;
  tick: number;
}

// A tiny deterministic PRNG so the same world always plants the same trees.
function mulberry32(seed: number) {
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

// Cone-roofed mud hut, low-poly.
function Hut({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.6, 0.65, 0.9, 8]} />
        <meshStandardMaterial color="#8a6a45" roughness={0.95} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.2, 0]}>
        <coneGeometry args={[0.85, 0.8, 8]} />
        <meshStandardMaterial color="#4a2e1c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.45, 0.61]}>
        <planeGeometry args={[0.25, 0.45]} />
        <meshStandardMaterial color="#1a0e07" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Tree({ position, scale }: { position: [number, number, number]; scale: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 0.9, 6]} />
        <meshStandardMaterial color="#3a2616" roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0, 1.3, 0]}>
        <coneGeometry args={[0.55, 1.4, 6]} />
        <meshStandardMaterial color="#2d6a3a" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

function Rock({ position, scale, rotation }: { position: [number, number, number]; scale: number; rotation: number }) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={[0, rotation, 0]} scale={scale}>
      <dodecahedronGeometry args={[0.4, 0]} />
      <meshStandardMaterial color="#5b5550" roughness={1} flatShading />
    </mesh>
  );
}

function Obelisk({ position, tick }: { position: [number, number, number]; tick: number }) {
  // Pulsing emissive intensity tied to tick for a "ley line" feel.
  const pulse = 0.6 + 0.4 * Math.sin(tick * 0.18);
  return (
    <group position={position}>
      {/* Plinth */}
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[2.4, 0.6, 2.4]} />
        <meshStandardMaterial color="#2a2530" roughness={0.5} metalness={0.4} flatShading />
      </mesh>
      {/* Main obelisk */}
      <mesh castShadow receiveShadow position={[0, 2.6, 0]}>
        <boxGeometry args={[0.9, 5.0, 0.9]} />
        <meshStandardMaterial color="#181620" roughness={0.4} metalness={0.6} flatShading />
      </mesh>
      {/* Pyramid cap */}
      <mesh castShadow position={[0, 5.4, 0]}>
        <coneGeometry args={[0.7, 1.0, 4]} />
        <meshStandardMaterial color="#1a1530" roughness={0.3} metalness={0.7} flatShading />
      </mesh>
      {/* Green glow ring around the obelisk */}
      <mesh position={[0, 2.5, 0]}>
        <torusGeometry args={[1.5, 0.10, 16, 48]} />
        <meshStandardMaterial
          color="#4ade80"
          emissive="#4ade80"
          emissiveIntensity={3 * pulse}
          toneMapped={false}
        />
      </mesh>
      {/* Vertical light beam */}
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 12, 8]} />
        <meshBasicMaterial color="#86efac" transparent opacity={0.7 * pulse} toneMapped={false} />
      </mesh>
      {/* Ground ring decal */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.62, 0]}>
        <ringGeometry args={[2.2, 2.45, 48]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.6} toneMapped={false} />
      </mesh>
      {/* Point light to lift surrounding scene */}
      <pointLight color="#4ade80" intensity={4 * pulse} distance={12} position={[0, 2, 0]} />
    </group>
  );
}

export default function WorldEnvironment({ grid, size, amplitude, seed, tick }: Props) {
  const half = size / 2;

  const features = useMemo(() => {
    const rng = mulberry32(seed);
    const huts: { pos: [number, number, number]; rot: number }[] = [];
    const trees: { pos: [number, number, number]; scale: number }[] = [];
    const rocks: { pos: [number, number, number]; scale: number; rot: number }[] = [];

    const tries = 240;
    for (let i = 0; i < tries; i++) {
      const nx = rng();
      const ny = rng();
      const e = elevationAt(grid, nx, ny);
      if (e < 0.43) continue; // skip water/shore
      const x = (nx - 0.5) * size;
      const z = (ny - 0.5) * size;
      const y = worldHeight(grid, nx, ny, amplitude);
      const kind = rng();
      if (e < 0.58 && kind < 0.15 && huts.length < 14) {
        // huts on grass
        huts.push({ pos: [x, y, z], rot: rng() * Math.PI * 2 });
      } else if (e > 0.50 && e < 0.78 && kind < 0.7 && trees.length < 90) {
        trees.push({ pos: [x, y, z], scale: 0.7 + rng() * 0.6 });
      } else if (e > 0.7 && rocks.length < 40) {
        rocks.push({ pos: [x, y, z], scale: 0.6 + rng() * 0.9, rot: rng() * Math.PI });
      }
    }
    return { huts, trees, rocks };
  }, [grid, size, amplitude, seed]);

  // Obelisk at world centre (or as close as we can get to dry land).
  const obeliskPos = useMemo<[number, number, number]>(() => {
    // search outward from centre for a dry cell
    for (let r = 0; r < 12; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (r !== 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = 0.5 + dx * 0.04;
          const ny = 0.5 + dy * 0.04;
          if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
          if (elevationAt(grid, nx, ny) >= 0.5) {
            return [
              (nx - 0.5) * size,
              worldHeight(grid, nx, ny, amplitude),
              (ny - 0.5) * size,
            ];
          }
        }
      }
    }
    return [0, 0, 0];
  }, [grid, size, amplitude]);

  return (
    <group>
      <Obelisk position={obeliskPos} tick={tick} />
      {features.huts.map((h, i) => (
        <Hut key={`h${i}`} position={h.pos} rotation={h.rot} />
      ))}
      {features.trees.map((t, i) => (
        <Tree key={`t${i}`} position={t.pos} scale={t.scale} />
      ))}
      {features.rocks.map((r, i) => (
        <Rock key={`r${i}`} position={r.pos} scale={r.scale} rotation={r.rot} />
      ))}
      {/* skirt to fade off-world edges */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#0a0f1a" roughness={1} />
      </mesh>
      {/* keep `half` in scope for parent lighting math without an unused-vars warning */}
      <group userData={{ half }} />
    </group>
  );
}
