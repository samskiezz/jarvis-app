import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { CARS } from "./assets";
import { mulberry32 } from "./pois";

interface Props {
  size: number;
  seed: number;
  /** Loops the cars circle around. Provide a couple per car density target. */
  loops: { center: [number, number]; radius: number; clockwise: boolean }[];
}

CARS.forEach((u) => useGLTF.preload(u));

interface CarState {
  url: string;
  loopIdx: number;
  phase: number;
  speed: number;
  scale: number;
  yOffset: number;
}

// Cars drive in lazy circular loops on the road network — purely cosmetic
// motion that makes the city feel alive without needing a path-finder.
export default function Vehicles({ size, seed, loops }: Props) {
  const rng = useMemo(() => mulberry32(seed ^ 0xC4),  [seed]);

  const cars = useMemo(() => {
    if (loops.length === 0) return [] as CarState[];
    const out: CarState[] = [];
    const total = Math.min(24, Math.floor(size / 14));
    for (let i = 0; i < total; i++) {
      out.push({
        url: CARS[Math.floor(rng() * CARS.length)],
        loopIdx: i % loops.length,
        phase: rng() * Math.PI * 2,
        speed: 0.15 + rng() * 0.20,
        scale: 1.5 + rng() * 0.4,
        yOffset: 0.05,
      });
    }
    return out;
  }, [size, loops.length, rng]);

  return (
    <>
      {cars.map((c, i) => (
        <Car key={`car${i}`} state={c} loop={loops[c.loopIdx]} />
      ))}
    </>
  );
}

function Car({ state, loop }: { state: CarState; loop: Props["loops"][number] }) {
  const { scene } = useGLTF(state.url) as unknown as { scene: THREE.Group };
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; }
    });
    return c;
  }, [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef(state.phase);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    phaseRef.current += dt * state.speed * (loop.clockwise ? 1 : -1);
    const a = phaseRef.current;
    const x = loop.center[0] + Math.cos(a) * loop.radius;
    const z = loop.center[1] + Math.sin(a) * loop.radius;
    g.position.set(x, state.yOffset, z);
    // Face direction of motion: tangent to the circle.
    const heading = a + (loop.clockwise ? Math.PI / 2 : -Math.PI / 2);
    g.rotation.y = heading;
  });

  return (
    <group ref={groupRef}>
      <primitive object={clone} scale={state.scale} />
    </group>
  );
}
