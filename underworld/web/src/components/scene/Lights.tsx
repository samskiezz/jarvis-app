import { useMemo } from "react";
import * as THREE from "three";

interface Props {
  tick: number;
  size: number;
}

interface Diurnal {
  sun: THREE.Vector3;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  fogColor: string;
  fogDensity: number;
  label: "day" | "dusk" | "night" | "dawn";
}

export function diurnal(tick: number, size: number): Diurnal {
  // 80-tick day. Sun arcs from east to west through the day.
  const cycle = ((tick % 80) + 80) % 80;
  // Phase in [0, 1] over 24h. Noon at 0.25, dusk 0.5, midnight 0.75, dawn 0.0.
  const phase = cycle / 80;
  const sunAngle = phase * Math.PI * 2 - Math.PI / 2; // sun rises in east
  const elev = Math.sin(sunAngle);
  const azim = Math.cos(sunAngle);
  const sun = new THREE.Vector3(azim * size, Math.abs(elev) * size + 4, -size * 0.6).multiplyScalar(0.7);

  if (cycle < 30) {
    // day
    return {
      sun,
      sunColor: "#fff4d8",
      sunIntensity: 1.2 + 0.3 * elev,
      ambientColor: "#a9c4e8",
      ambientIntensity: 0.5,
      hemiSky: "#aeddff",
      hemiGround: "#3a4a3c",
      fogColor: "#9bb6c8",
      fogDensity: 0.012,
      label: "day",
    };
  }
  if (cycle < 40) {
    return {
      sun,
      sunColor: "#ff8a3c",
      sunIntensity: 0.8,
      ambientColor: "#ffb27a",
      ambientIntensity: 0.45,
      hemiSky: "#ff9a55",
      hemiGround: "#2a2230",
      fogColor: "#a36a4a",
      fogDensity: 0.018,
      label: "dusk",
    };
  }
  if (cycle < 60) {
    return {
      sun,
      sunColor: "#4a5cff",
      sunIntensity: 0.15,
      ambientColor: "#22264a",
      ambientIntensity: 0.4,
      hemiSky: "#1c2452",
      hemiGround: "#070912",
      fogColor: "#0c1024",
      fogDensity: 0.025,
      label: "night",
    };
  }
  return {
    sun,
    sunColor: "#c8b0ff",
    sunIntensity: 0.55,
    ambientColor: "#8a7ec8",
    ambientIntensity: 0.5,
    hemiSky: "#9c8cd8",
    hemiGround: "#3a3a4a",
    fogColor: "#8a82b8",
    fogDensity: 0.02,
    label: "dawn",
  };
}

export default function Lights({ tick, size }: Props) {
  const d = useMemo(() => diurnal(tick, size), [tick, size]);
  return (
    <>
      <hemisphereLight args={[d.hemiSky, d.hemiGround, 0.6]} />
      <ambientLight color={d.ambientColor} intensity={d.ambientIntensity} />
      <directionalLight
        position={[d.sun.x, d.sun.y, d.sun.z]}
        color={d.sunColor}
        intensity={d.sunIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-near={0.5}
        shadow-camera-far={size * 4}
        shadow-bias={-0.0005}
      />
      <fog attach="fog" args={[d.fogColor, size * 0.6, size * 2.5]} />
      <color attach="background" args={[d.fogColor]} />
    </>
  );
}
