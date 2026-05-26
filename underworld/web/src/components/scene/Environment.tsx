import * as THREE from "three";
import type { Pois } from "./pois";

interface Props {
  pois: Pois;
  size: number;
  tick: number;
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

export default function WorldEnvironment({ pois, size, tick }: Props) {
  return (
    <group>
      <Obelisk position={pois.obelisk} tick={tick} />
      {pois.huts.map((h, i) => (
        <Hut key={`h${i}`} position={h.pos} rotation={h.rot} />
      ))}
      {pois.trees.map((t, i) => (
        <Tree key={`t${i}`} position={t.pos} scale={t.scale} />
      ))}
      {pois.rocks.map((r, i) => (
        <Rock key={`r${i}`} position={r.pos} scale={r.scale} rotation={r.rot} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#0a0f1a" roughness={1} />
      </mesh>
    </group>
  );
}
