import { useMemo } from "react";
import * as THREE from "three";

interface Props {
  grid: number[][];
  size: number;        // world units across
  amplitude: number;   // peak elevation in world units
}

const BIOMES: { max: number; color: [number, number, number] }[] = [
  { max: 0.28, color: [0.04, 0.08, 0.20] }, // deep water
  { max: 0.36, color: [0.08, 0.18, 0.42] }, // ocean
  { max: 0.42, color: [0.20, 0.40, 0.60] }, // shore
  { max: 0.46, color: [0.85, 0.76, 0.48] }, // sand
  { max: 0.58, color: [0.32, 0.66, 0.30] }, // grass — bumped saturation
  { max: 0.72, color: [0.15, 0.42, 0.20] }, // forest — deeper green
  { max: 0.86, color: [0.45, 0.42, 0.38] }, // rock
  { max: 1.01, color: [0.94, 0.96, 1.00] }, // snow
];

function biomeColor(e: number): [number, number, number] {
  for (const b of BIOMES) if (e <= b.max) return b.color;
  return BIOMES[BIOMES.length - 1].color;
}

export function elevationAt(grid: number[][], nx: number, ny: number): number {
  // Bilinear sample. nx, ny in [0, 1].
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
  const geom = useMemo(() => {
    const cells = grid.length;
    const segs = cells - 1;
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    g.rotateX(-Math.PI / 2);

    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const i = y * cells + x;
        const e = grid[y][x];
        // Push water down so beaches and grass sit above sea level naturally.
        const waterFlat = e < 0.42;
        const yWorld = waterFlat ? 0 : (e - 0.42) * amplitude;
        pos.setY(i, yWorld);
        const c = biomeColor(e);
        colors[i * 3] = c[0];
        colors[i * 3 + 1] = c[1];
        colors[i * 3 + 2] = c[2];
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [grid, size, amplitude]);

  return (
    <group>
      {/* Ground mesh */}
      <mesh geometry={geom} receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.95}
          metalness={0}
          flatShading
        />
      </mesh>
      {/* Water plane at sea level — semi-transparent, slightly emissive. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
        <planeGeometry args={[size * 1.1, size * 1.1]} />
        <meshStandardMaterial
          color="#1f3870"
          transparent
          opacity={0.55}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>
    </group>
  );
}
