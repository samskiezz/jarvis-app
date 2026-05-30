import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Guild } from "@/lib/types";

interface Props { guild: Guild }

// Each guild gets a small floating prop above the avatar that signals its
// domain. Procedural so we don't ship 11 distinct GLBs.

export default function GuildAccessory({ guild }: Props) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.8;
  });

  // Float a small prop above the avatar's head. Scale it up to ~2.5x so it
  // reads at scene distance, and position it above the world-space head.
  return (
    <group ref={ref} position={[0, 4.5, 0]} scale={2.4}>
      {renderProp(guild)}
    </group>
  );
}

function renderProp(guild: Guild): JSX.Element {
  switch (guild) {
    case "safety":
      // Heater shield
      return (
        <mesh castShadow>
          <cylinderGeometry args={[0.18, 0.14, 0.05, 12]} />
          <meshStandardMaterial color="#fb7185" emissive="#7f1d1d" emissiveIntensity={0.4} metalness={0.6} roughness={0.4} />
        </mesh>
      );
    case "patent":
      // Floating scroll: capsule
      return (
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.35, 12]} />
          <meshStandardMaterial color="#c084fc" emissive="#581c87" emissiveIntensity={0.3} roughness={0.7} />
        </mesh>
      );
    case "computing":
      // Tiny cube — laptop / CPU
      return (
        <mesh castShadow>
          <boxGeometry args={[0.22, 0.04, 0.22]} />
          <meshStandardMaterial color="#34d399" emissive="#022c22" emissiveIntensity={0.5} metalness={0.7} roughness={0.3} />
        </mesh>
      );
    case "materials":
      // Erlenmeyer flask: cone + cylinder
      return (
        <group>
          <mesh castShadow position={[0, 0.05, 0]}>
            <coneGeometry args={[0.16, 0.2, 8]} />
            <meshStandardMaterial color="#f472b6" transparent opacity={0.8} emissive="#831843" emissiveIntensity={0.3} />
          </mesh>
          <mesh castShadow position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.08, 8]} />
            <meshStandardMaterial color="#a3a3a3" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      );
    case "energy":
      // Lightning bolt zig-zag using two thin boxes
      return (
        <group>
          <mesh castShadow rotation={[0, 0, 0.6]} position={[-0.04, 0.06, 0]}>
            <boxGeometry args={[0.07, 0.22, 0.04]} />
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={2} toneMapped={false} />
          </mesh>
          <mesh castShadow rotation={[0, 0, -0.6]} position={[0.04, -0.06, 0]}>
            <boxGeometry args={[0.07, 0.22, 0.04]} />
            <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={2} toneMapped={false} />
          </mesh>
        </group>
      );
    case "physics":
      // Atom: nucleus + two orbital tori
      return (
        <group>
          <mesh castShadow>
            <icosahedronGeometry args={[0.08, 0]} />
            <meshStandardMaterial color="#38bdf8" emissive="#0c4a6e" emissiveIntensity={1} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.012, 8, 32]} />
            <meshBasicMaterial color="#38bdf8" toneMapped={false} />
          </mesh>
          <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
            <torusGeometry args={[0.2, 0.012, 8, 32]} />
            <meshBasicMaterial color="#38bdf8" toneMapped={false} />
          </mesh>
        </group>
      );
    case "agriculture":
      // Wheat stalk: a cone + small spheres
      return (
        <group>
          <mesh castShadow position={[0, 0.05, 0]}>
            <coneGeometry args={[0.06, 0.28, 6]} />
            <meshStandardMaterial color="#a3e635" emissive="#365314" emissiveIntensity={0.3} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0, 0.22, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#bef264" emissive="#365314" emissiveIntensity={0.3} />
          </mesh>
        </group>
      );
    case "civil":
      // Hammer: handle + head
      return (
        <group>
          <mesh castShadow rotation={[0, 0, Math.PI / 4]} position={[0, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.3, 8]} />
            <meshStandardMaterial color="#7c2d12" roughness={1} />
          </mesh>
          <mesh castShadow rotation={[0, 0, Math.PI / 4]} position={[0.11, 0.11, 0]}>
            <boxGeometry args={[0.12, 0.08, 0.08]} />
            <meshStandardMaterial color="#fb923c" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      );
    case "mechanical":
      // Gear: torus
      return (
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.16, 0.045, 8, 12]} />
          <meshStandardMaterial color="#d4d4d8" metalness={0.85} roughness={0.25} />
        </mesh>
      );
    case "electrical":
      // Plug-like cube with prong
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.16, 0.14, 0.12]} />
            <meshStandardMaterial color="#fbbf24" emissive="#78350f" emissiveIntensity={0.4} />
          </mesh>
          <mesh castShadow position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.1, 6]} />
            <meshStandardMaterial color="#a3a3a3" metalness={0.9} />
          </mesh>
        </group>
      );
    case "maths":
      // Three small floating cubes (∑-like cluster)
      return (
        <group>
          {[
            [0.0, 0.0, 0.0],
            [0.13, 0.08, 0.0],
            [-0.13, -0.08, 0.0],
          ].map(([x, y, z], i) => (
            <mesh key={i} castShadow position={[x, y, z]}>
              <boxGeometry args={[0.08, 0.08, 0.08]} />
              <meshStandardMaterial color="#a78bfa" emissive="#4c1d95" emissiveIntensity={0.4} />
            </mesh>
          ))}
        </group>
      );
    default:
      return <mesh />;
  }
}
