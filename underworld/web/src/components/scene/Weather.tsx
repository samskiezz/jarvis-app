import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type WeatherKind = "clear" | "rain" | "snow";

interface Props {
  kind: WeatherKind;
  size: number;
  /** Vertical wind speed for raindrops, +Y descent for snow. */
}

export default function Weather({ kind, size }: Props) {
  if (kind === "clear") return null;
  return kind === "rain" ? <RainField size={size} /> : <SnowField size={size} />;
}

const COUNT = 1200;

function makePositions(size: number, height: number): Float32Array {
  const arr = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    arr[i * 3] = (Math.random() - 0.5) * size * 1.6;
    arr[i * 3 + 1] = Math.random() * height;
    arr[i * 3 + 2] = (Math.random() - 0.5) * size * 1.6;
  }
  return arr;
}

function RainField({ size }: { size: number }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => makePositions(size, 40), [size]);

  useFrame((_, dt) => {
    const p = points.current;
    if (!p) return;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const dropSpeed = 28 * dt;
    for (let i = 0; i < COUNT; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= dropSpeed;
      if (arr[yi] < 0) {
        arr[yi] = 40;
        arr[i * 3] = (Math.random() - 0.5) * size * 1.6;
        arr[i * 3 + 2] = (Math.random() - 0.5) * size * 1.6;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={COUNT}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial color="#cdd9ec" size={0.12} transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

function SnowField({ size }: { size: number }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => makePositions(size, 40), [size]);
  const drift = useRef(0);

  useFrame((_, dt) => {
    const p = points.current;
    if (!p) return;
    drift.current += dt;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const fall = 4.5 * dt;
    for (let i = 0; i < COUNT; i++) {
      const xi = i * 3;
      const yi = xi + 1;
      const zi = xi + 2;
      arr[yi] -= fall;
      // Sideways shimmer so flakes don't fall in straight lines.
      arr[xi] += Math.sin((drift.current + i * 0.1) * 1.5) * 0.02;
      arr[zi] += Math.cos((drift.current + i * 0.17) * 1.5) * 0.02;
      if (arr[yi] < 0) {
        arr[yi] = 40;
        arr[xi] = (Math.random() - 0.5) * size * 1.6;
        arr[zi] = (Math.random() - 0.5) * size * 1.6;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={COUNT}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.22} transparent opacity={0.8} depthWrite={false} sizeAttenuation />
    </points>
  );
}

// Pick a weather kind from the biome hint + tick. Snow biomes always snow;
// forest/plains rotate clear/rain on a multi-cycle interval.
export function weatherFor(biomeHint: string, tick: number): WeatherKind {
  if (biomeHint === "mountains" || biomeHint === "plateau") {
    // Snow caps + plateaus → snow flurries half the time
    return ((tick / 30) | 0) % 3 === 0 ? "snow" : "clear";
  }
  if (biomeHint === "forest" || biomeHint === "plains" || biomeHint === "hills") {
    // Rotate clear / rain / clear so we get bursts of weather
    const phase = ((tick / 25) | 0) % 4;
    return phase === 2 ? "rain" : "clear";
  }
  return "clear";
}
