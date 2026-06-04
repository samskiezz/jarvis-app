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

// Cool sky-fill colour for the bounce/ambient side, derived per phase so the
// shadowed faces never go dead-flat — the "filmic fill" opposite the warm key.
const FILL_COLOR: Record<Diurnal["label"], string> = {
  day: "#9fc4ff",
  dusk: "#6a78c8",
  night: "#2b3a78",
  dawn: "#8a96e0",
};

// Warm rim/back-light colour — a subtle kicker from behind to separate
// silhouettes from the sky (the classic three-point "rim").
const RIM_COLOR: Record<Diurnal["label"], string> = {
  day: "#fff0c8",
  dusk: "#ff7a3a",
  night: "#7088e0",
  dawn: "#ffd0b0",
};

export default function Lights({ tick, size }: Props) {
  const d = useMemo(() => diurnal(tick, size), [tick, size]);

  // Three-point rig positions derived from the sun so the whole setup tracks
  // the time-of-day arc cohesively.
  const fillPos = useMemo<[number, number, number]>(
    // Opposite azimuth + lower, simulating cool sky bounce from the far side.
    () => [-d.sun.x * 0.6, size * 0.5, -d.sun.z * 0.6],
    [d.sun.x, d.sun.z, size],
  );
  const rimPos = useMemo<[number, number, number]>(
    // Behind the subject relative to the key, slightly elevated, for a kicker.
    () => [-d.sun.x, d.sun.y * 0.5 + size * 0.2, -d.sun.z * 1.2],
    [d.sun.x, d.sun.y, d.sun.z, size],
  );

  // Shadow frustum: focus it on the dense play area (the city core + nearby
  // terrain) rather than the whole 4× ground plane. A tighter box means the
  // 4096² map resolves crisp contact shadows instead of smearing them across
  // the entire world. ~0.36·size half-extent comfortably covers the orbit
  // range the camera works in.
  const shadowExtent = size * 0.36;

  return (
    <>
      {/* Cool hemisphere + ambient — the global skylight base (image-based
          lighting from the HDRI handles the rest of the indirect term). */}
      <hemisphereLight args={[d.hemiSky, d.hemiGround, 0.55]} />
      <ambientLight color={d.ambientColor} intensity={d.ambientIntensity} />

      {/* KEY — the warm sun. Sole shadow caster (PCFSoft on the renderer). */}
      <directionalLight
        position={[d.sun.x, d.sun.y, d.sun.z]}
        color={d.sunColor}
        intensity={d.sunIntensity * 1.4}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={0.5}
        shadow-camera-far={size * 3}
        shadow-bias={-0.00012}
        shadow-normalBias={0.05}
        shadow-radius={4}
        shadow-blurSamples={16}
      />

      {/* FILL — cool, dimmer, opposite the key. No shadows: it only lifts the
          shadowed side so faces read with form instead of crushing to black. */}
      <directionalLight
        position={fillPos}
        color={FILL_COLOR[d.label]}
        intensity={d.sunIntensity * 0.35 + 0.2}
      />

      {/* RIM — a subtle warm kicker from behind for silhouette separation. */}
      <directionalLight
        position={rimPos}
        color={RIM_COLOR[d.label]}
        intensity={d.sunIntensity * 0.25 + 0.1}
      />
    </>
  );
}
