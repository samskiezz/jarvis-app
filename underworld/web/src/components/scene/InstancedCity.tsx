import { useMemo } from "react";
import { Instances, Instance } from "@react-three/drei";

// GPU-instanced city. Instead of one draw call per building/tree/rock (what was
// killing mobile), every building body is ONE InstancedMesh, every roof one,
// trees two (foliage + trunk), rocks one — so a 1000-unit city of thousands of
// objects renders in ~6 draw calls and runs on a phone GPU. Procedural low-poly
// (RuneScape-style) geometry, coloured per district, lit by the scene lights.

export interface CityBuilding {
  pos: [number, number, number];
  rot: number;
  zone: "residential" | "commercial" | "skyscraper";
  civic?: { name: string; icon: string; color: string };
}
export interface CityTree { pos: [number, number, number]; scale: number }
export interface CityRock { pos: [number, number, number]; scale: number; rot: number }

interface Props {
  buildings: CityBuilding[];
  trees: CityTree[];
  rocks: CityRock[];
}

const ZONE = {
  skyscraper: { w: 9, h: 34, color: "#5b6b8c" },
  commercial: { w: 9, h: 16, color: "#7c8aa5" },
  residential: { w: 8, h: 9, color: "#c8b89a" },
} as const;

function hash(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export default function InstancedCity({ buildings, trees, rocks }: Props) {
  // Pre-compute per-building dimensions/colour so the instanced meshes can be
  // laid out in one pass. Civic landmarks are rendered as detailed GLBs by the
  // Environment layer (hybrid), so they're excluded from the instanced bulk.
  const built = useMemo(() => buildings.filter((b) => !b.civic).map((b) => {
    const z = ZONE[b.zone];
    const jitter = hash(b.pos[0], b.pos[2]);
    const h = z.h * (0.8 + jitter * 0.6) * (b.civic ? 1.4 : 1);
    const w = z.w * (0.85 + jitter * 0.3);
    const color = b.civic ? b.civic.color : z.color;
    return { ...b, h, w, color, pitched: b.zone !== "skyscraper" };
  }), [buildings]);

  const pitched = useMemo(() => built.filter((b) => b.pitched), [built]);

  return (
    <group>
      {/* Building bodies — one instanced box mesh for the whole city. */}
      {built.length > 0 && (
        <Instances limit={built.length} range={built.length} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.85} metalness={0.05} />
          {built.map((b, i) => (
            <Instance
              key={i}
              position={[b.pos[0], b.pos[1] + b.h / 2, b.pos[2]]}
              scale={[b.w, b.h, b.w]}
              rotation={[0, b.rot, 0]}
              color={b.color}
            />
          ))}
        </Instances>
      )}

      {/* Pitched roofs (cones) for residential/commercial — gives a town look. */}
      {pitched.length > 0 && (
        <Instances limit={pitched.length} range={pitched.length} castShadow>
          <coneGeometry args={[0.8, 0.5, 4]} />
          <meshStandardMaterial color="#7a4a3a" roughness={0.9} />
          {pitched.map((b, i) => (
            <Instance
              key={i}
              position={[b.pos[0], b.pos[1] + b.h + b.w * 0.25, b.pos[2]]}
              scale={[b.w * 1.15, b.w * 0.6, b.w * 1.15]}
              rotation={[0, b.rot + Math.PI / 4, 0]}
            />
          ))}
        </Instances>
      )}

      {/* Tree foliage + trunks — two instanced meshes for the whole map. */}
      {trees.length > 0 && (
        <>
          <Instances limit={trees.length} range={trees.length} castShadow>
            <coneGeometry args={[1, 1, 6]} />
            <meshStandardMaterial color="#3f7d3a" roughness={1} />
            {trees.map((t, i) => {
              const s = 3.5 * t.scale;
              return <Instance key={i} position={[t.pos[0], t.pos[1] + s * 1.4, t.pos[2]]}
                scale={[s, s * 2.2, s]} color={hash(t.pos[0], t.pos[2]) > 0.5 ? "#3f7d3a" : "#4f9d46"} />;
            })}
          </Instances>
          <Instances limit={trees.length} range={trees.length} castShadow>
            <cylinderGeometry args={[0.4, 0.5, 1, 5]} />
            <meshStandardMaterial color="#6b4a2f" roughness={1} />
            {trees.map((t, i) => {
              const s = 3.5 * t.scale;
              return <Instance key={i} position={[t.pos[0], t.pos[1] + s * 0.7, t.pos[2]]} scale={[s * 0.5, s * 1.4, s * 0.5]} />;
            })}
          </Instances>
        </>
      )}

      {/* Rocks — one instanced low-poly mesh. */}
      {rocks.length > 0 && (
        <Instances limit={rocks.length} range={rocks.length} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#8a8d92" roughness={1} flatShading />
          {rocks.map((r, i) => {
            const s = 2.4 * r.scale;
            return <Instance key={i} position={[r.pos[0], r.pos[1] + s * 0.4, r.pos[2]]}
              scale={[s, s * 0.8, s]} rotation={[0, r.rot, hash(r.pos[0], r.pos[2]) * 0.5]} />;
          })}
        </Instances>
      )}
    </group>
  );
}
