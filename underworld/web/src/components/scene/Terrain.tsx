import { useMemo } from "react";
import * as THREE from "three";
import { usePbrTexture } from "./usePbrTexture";

interface Props {
  grid: number[][];
  size: number;
  amplitude: number;
}

// Per-biome tint multiplied with the grass PBR texture. Keeps the surface
// detail (normal map + roughness) consistent but colours each cell so the
// world reads as a varied landscape rather than a uniform lawn.
const BIOMES: { max: number; color: [number, number, number] }[] = [
  { max: 0.28, color: [0.04, 0.08, 0.20] }, // deep water — barely visible under water plane
  { max: 0.36, color: [0.08, 0.18, 0.42] }, // ocean
  { max: 0.42, color: [0.30, 0.50, 0.65] }, // shore
  { max: 0.46, color: [1.50, 1.30, 0.80] }, // sand — bright yellow tint over green
  { max: 0.58, color: [1.00, 1.00, 0.95] }, // grass — natural
  { max: 0.72, color: [0.70, 0.85, 0.65] }, // forest — slightly deeper
  { max: 0.86, color: [0.85, 0.80, 0.75] }, // rock — desaturate
  { max: 1.01, color: [1.40, 1.45, 1.55] }, // snow — washes texture white
];

function biomeColor(e: number): [number, number, number] {
  for (const b of BIOMES) if (e <= b.max) return b.color;
  return BIOMES[BIOMES.length - 1].color;
}

export function elevationAt(grid: number[][], nx: number, ny: number): number {
  const cells = grid.length;
  const fx = Math.max(0, Math.min(cells - 1.0001, nx * (cells - 1)));
  const fy = Math.max(0, Math.min(cells - 1.0001, ny * (cells - 1)));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = grid[y0][x0];
  const b = grid[y0][x0 + 1];
  const c = grid[y0 + 1][x0];
  const d = grid[y0 + 1][x0 + 1];
  return (
    a * (1 - tx) * (1 - ty) +
    b * tx * (1 - ty) +
    c * (1 - tx) * ty +
    d * tx * ty
  );
}

export default function Terrain({ grid, size, amplitude }: Props) {
  const grass = usePbrTexture("grass", Math.max(8, Math.round(size / 5)));

  const geom = useMemo(() => {
    const cells = grid.length;
    const segs = (cells - 1) * 2; // double the geometry density for smoother shadows
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    g.rotateX(-Math.PI / 2);

    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = (x / size) + 0.5;
      const ny = (z / size) + 0.5;
      const e = elevationAt(grid, nx, ny);
      const waterFlat = e < 0.42;
      const yWorld = waterFlat ? 0 : (e - 0.42) * amplitude;
      pos.setY(i, yWorld);
      const c = biomeColor(e);
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [grid, size, amplitude]);

  return (
    <group>
      <mesh geometry={geom} receiveShadow>
        <meshStandardMaterial
          map={grass.diff}
          normalMap={grass.norm}
          roughnessMap={grass.rough}
          vertexColors
          envMapIntensity={0.6}
          roughness={1.0}
          metalness={0.0}
        />
      </mesh>
      {/* Sea-level water — a separate plane with its own glossy material. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
        <planeGeometry args={[size * 1.4, size * 1.4]} />
        <meshPhysicalMaterial
          color="#1a3a72"
          transparent
          opacity={0.78}
          roughness={0.12}
          metalness={0.05}
          transmission={0.4}
          ior={1.33}
          envMapIntensity={1.2}
        />
      </mesh>
    </group>
  );
}
