import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment as DreiEnvironment, OrbitControls } from "@react-three/drei";
import {
  Bloom, EffectComposer, N8AO, SMAA, SSR, ToneMapping, Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { MinionListItem } from "@/lib/types";
import Lights, { diurnal } from "./Lights";
import Terrain, { elevationAt } from "./Terrain";
import WorldEnvironment from "./Environment";
import MinionAvatar from "./MinionAvatar";
import { computePois, destinationForAction } from "./pois";
import type { Collider } from "./colliders";
import Weather, { weatherFor, type WeatherKind } from "./Weather";
import Water from "./Water";
import CelestialBodies from "./CelestialBodies";
import Vehicles from "./Vehicles";
import CharacterController from "./CharacterController";
import { HDRI_SKY } from "./assets";

interface Props {
  grid: number[][];
  minions: MinionListItem[];
  tick: number;
  seed: number;
  onSelect: (id: string) => void;
  selectedId?: string | null;
  width?: number;
  height?: number;
  actionByMinion?: Record<string, string>;
  /** Map of minion_id → latest internal thought. Rendered as bubbles
   *  above each minion in the scene. Doc II.25 (visible monologue). */
  thoughtByMinion?: Record<string, string>;
  biomeHint?: string;
  /** Live backend weather (clear|cloudy|rain|storm|snow). When provided it drives
   *  the rendered weather so the scene matches the simulation, instead of a
   *  client-side guess. */
  weatherOverride?: string;
  /** Live climate readout for the HUD. */
  season?: string;
  temperature?: number;
}

/** Follow camera: when a minion is selected, smoothly track its live position so
 *  the camera pans with it. We translate both the orbit target and the camera by
 *  the same delta, so the user keeps full control of angle + zoom while the rig
 *  follows the minion around the world. */
function FollowRig({
  posRef, orbitRef, active,
}: {
  posRef: React.MutableRefObject<THREE.Vector3>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orbitRef: React.MutableRefObject<any>;
  active: boolean;
}) {
  const { camera } = useThree();
  useFrame(() => {
    const controls = orbitRef.current;
    if (!active || !controls) return;
    const want = new THREE.Vector3(posRef.current.x, posRef.current.y + 2.5, posRef.current.z);
    if (want.lengthSq() === 0) return;
    const next = controls.target.clone().lerp(want, 0.08);
    const delta = next.clone().sub(controls.target);
    controls.target.copy(next);
    camera.position.add(delta);
    controls.update();
  });
  return null;
}

/** Map the backend's 5 weather states onto the 3 the renderer supports. */
function mapWeather(w: string | undefined): WeatherKind | null {
  switch (w) {
    case "rain":
    case "storm": return "rain";
    case "snow": return "snow";
    case "clear":
    case "cloudy": return "clear";
    default: return null;
  }
}

const WORLD_SIZE = 240;      // 6× the original 40u → city-scale, room for districts
const AMPLITUDE = 14.0;      // taller hills + mountains in the outer ring
const ARRIVAL_RADIUS = 5.0;

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function placeMinion(
  id: string,
  grid: number[][],
  size: number,
  amplitude: number,
): [number, number, number] {
  const cells = grid.length;
  const h = hash(id);
  let gx = h % cells;
  let gy = (h >>> 8) % cells;
  if (grid[gy][gx] < 0.43) {
    outer: for (let r = 1; r < cells; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = (gx + dx + cells) % cells;
          const ty = (gy + dy + cells) % cells;
          if (grid[ty][tx] >= 0.43) {
            gx = tx;
            gy = ty;
            break outer;
          }
        }
      }
    }
  }
  const jx = ((h >>> 16) & 0xff) / 255 - 0.5;
  const jy = ((h >>> 24) & 0xff) / 255 - 0.5;
  const nx = (gx + 0.5 + jx * 0.8) / cells;
  const ny = (gy + 0.5 + jy * 0.8) / cells;
  const x = (nx - 0.5) * size;
  const z = (ny - 0.5) * size;
  const e = elevationAt(grid, nx, ny);
  const y = Math.max(0, (e - 0.42) * amplitude);
  return [x, y, z];
}

const ACTION_LABEL: Record<string, string> = {
  rest: "💤 resting",
  meditate: "🧘 meditating",
  eat: "🍎 eating",
  drink: "💧 drinking",
  socialise: "👋 socialising",
  teach: "📖 teaching",
  study: "📚 studying",
  search_patents: "🔎 searching",
  kb_lookup: "📑 reading",
  propose_invention: "💡 inventing!",
  seek_partner: "❤️ seeking",
  fork_self: "✨ forking",
};

export default function WorldScene3D({
  grid,
  minions,
  tick,
  seed,
  onSelect,
  selectedId,
  width = 720,
  height = 480,
  actionByMinion,
  thoughtByMinion,
  biomeHint,
  weatherOverride,
  season,
  temperature,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Shared refs the selected MinionAvatar mutates (its world position) and
  // the WASD listener mutates (a unit-vector control input). Both live as
  // refs because they update every frame and don't need React re-renders.
  const selectedPosRef = useRef(new THREE.Vector3());
  const controlInputRef = useRef(new THREE.Vector3());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbitRef = useRef<any>(null);
  // Track whether the user is actively driving the selected character; if
  // not, OrbitControls is in charge of the camera.
  const [controlMode, setControlMode] = useState(false);
  // ESC releases control. Selecting a different minion or deselecting also
  // exits the mode so the camera doesn't end up tracking nothing.
  useEffect(() => {
    if (!controlMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setControlMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlMode]);
  useEffect(() => {
    if (controlMode && !selectedId) setControlMode(false);
  }, [controlMode, selectedId]);

  const pois = useMemo(
    () => computePois(grid, WORLD_SIZE, AMPLITUDE, seed),
    [grid, seed],
  );

  // Static collider list — buildings, trees, rocks, central monument.
  // Radii roughly match the geometry scale set in Environment.tsx so the
  // avatar's clearance feels right (small buffer for "shoulder room").
  const colliders = useMemo<Collider[]>(() => {
    const out: Collider[] = [];
    for (const h of pois.huts)  out.push({ x: h.pos[0], z: h.pos[2], r: 5.5 });
    for (const t of pois.trees) out.push({ x: t.pos[0], z: t.pos[2], r: 1.8 });
    for (const r of pois.rocks) out.push({ x: r.pos[0], z: r.pos[2], r: 2.4 });
    // Central monument has the biggest footprint.
    out.push({ x: pois.obelisk[0], z: pois.obelisk[2], r: 7.0 });
    return out;
  }, [pois]);

  const placements = useMemo(
    () => minions.map((m) => {
      const home = placeMinion(m.id, grid, WORLD_SIZE, AMPLITUDE);
      const action = actionByMinion?.[m.id];
      const { target } = destinationForAction(m.id, action, pois, home, m.guild);
      return { minion: m, home, target };
    }),
    [minions, grid, pois, actionByMinion],
  );

  const tint = diurnal(tick, WORLD_SIZE);
  const weather: WeatherKind = useMemo(
    () => mapWeather(weatherOverride) ?? weatherFor(biomeHint ?? "plains", tick),
    [weatherOverride, biomeHint, tick],
  );

  // Tint the HDRI background to reflect day/night — multiplies the env tex.
  const isNight = tint.label === "night";
  const isDayish = tint.label === "day";

  // Normalised sun direction — Water's reflection shader wants a unit vector
  // pointing from the surface toward the light.
  const sunNorm: [number, number, number] = useMemo(() => {
    const len = Math.hypot(tint.sun.x, tint.sun.y, tint.sun.z) || 1;
    return [tint.sun.x / len, Math.max(0.05, tint.sun.y / len), tint.sun.z / len];
  }, [tint.sun.x, tint.sun.y, tint.sun.z]);

  return (
    <div style={{ position: "relative", width, height }}>
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap, enabled: true }}
        dpr={[1, 2]}
        gl={{
          antialias: false, // SMAA in post does this better
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: isNight ? 0.55 : isDayish ? 1.1 : 0.85,
          outputColorSpace: THREE.SRGBColorSpace,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
          stencil: false,
        }}
        camera={{
          // Lower, more cinematic angle. Closer to the ground = better SSAO read.
          position: [WORLD_SIZE * 0.45, WORLD_SIZE * 0.22, WORLD_SIZE * 0.55],
          fov: 48,
          near: 0.1,
          far: WORLD_SIZE * 12,
        }}
        style={{ width, height, borderRadius: 8, display: "block" }}
        onPointerMissed={() => onSelect("")}
      >
        <Suspense fallback={null}>
          {/* HDRI environment — provides skybox + image-based lighting for
              PBR materials. We dim the background at night via tone-mapping
              exposure rather than swapping textures, which would re-stream. */}
          <DreiEnvironment
            files={HDRI_SKY}
            background
            backgroundIntensity={isNight ? 0.15 : isDayish ? 1.0 : 0.55}
            environmentIntensity={isNight ? 0.2 : isDayish ? 1.0 : 0.7}
            backgroundRotation={[0, (tick % 80) / 80 * Math.PI * 2, 0]}
            environmentRotation={[0, (tick % 80) / 80 * Math.PI * 2, 0]}
          />
          {/* Atmospheric depth haze — tints to the sky and thickens at night /
              in storms, grounding the world with real aerial perspective. */}
          <fogExp2
            attach="fog"
            args={[isNight ? "#0a0e1a" : weather === "rain" ? "#9aa7b8" : "#b8c6dc",
                   weather === "rain" ? 0.0026 : isNight ? 0.0020 : 0.0014]}
          />
          <Lights tick={tick} size={WORLD_SIZE} />
          <CelestialBodies tick={tick} size={WORLD_SIZE} />
          <Terrain grid={grid} size={WORLD_SIZE} amplitude={AMPLITUDE} />
          <Water size={WORLD_SIZE} sunDirection={sunNorm} />
          <WorldEnvironment pois={pois} size={WORLD_SIZE} seed={seed} tick={tick} />
          <Vehicles
            size={WORLD_SIZE}
            seed={seed}
            loops={[
              { center: [pois.obelisk[0], pois.obelisk[2]], radius: 26, clockwise: true },
              { center: [pois.obelisk[0], pois.obelisk[2]], radius: 48, clockwise: false },
              { center: [pois.obelisk[0], pois.obelisk[2]], radius: 72, clockwise: true },
            ]}
          />
          <Weather kind={weather} size={WORLD_SIZE} />
          {placements.map((p) => {
            const dx = p.target ? p.target[0] - p.home[0] : 0;
            const dz = p.target ? p.target[2] - p.home[2] : 0;
            const at = !p.target || Math.hypot(dx, dz) < ARRIVAL_RADIUS;
            const isSelected = p.minion.id === selectedId;
            return (
              <MinionAvatar
                key={p.minion.id}
                minion={p.minion}
                basePosition={p.home}
                targetPosition={p.target}
                atDestination={at}
                actionName={actionByMinion?.[p.minion.id]}
                selected={isSelected}
                colliders={colliders}
                controlled={isSelected && controlMode}
                positionRef={isSelected ? selectedPosRef : undefined}
                controlInputRef={isSelected && controlMode ? controlInputRef : undefined}
                thought={p.minion.alive ? thoughtByMinion?.[p.minion.id] : undefined}
                actionLabel={
                  isSelected && actionByMinion?.[p.minion.id]
                    ? (ACTION_LABEL[actionByMinion[p.minion.id]] ?? actionByMinion[p.minion.id])
                    : undefined
                }
                onClick={(id) => {
                  onSelect(id);
                  setHoveredId(id);
                }}
              />
            );
          })}
          {controlMode && selectedId ? (
            <CharacterController
              selectedId={selectedId}
              position={selectedPosRef.current}
              controlInputRef={controlInputRef}
            />
          ) : null}
          {/* Selected-minion label + internal-monologue bubbles now render
              inside each MinionAvatar, so they track the moving avatar live
              (doc II.25) instead of floating over the minion's home. */}
          {!controlMode && (
            <OrbitControls
              ref={orbitRef}
              target={[0, 2, 0]}
              enablePan
              enableDamping
              dampingFactor={0.08}
              minDistance={WORLD_SIZE * 0.08}
              maxDistance={WORLD_SIZE * 1.6}
              maxPolarAngle={Math.PI * 0.48}
            />
          )}
          {/* Follow the selected minion (unless the user has taken WASD control,
              which uses its own chase camera). */}
          <FollowRig posRef={selectedPosRef} orbitRef={orbitRef} active={!!selectedId && !controlMode} />
          {/* Post stack — modern WebGL ceiling. N8AO grounds objects in
              their crevices, SSR adds screen-space reflections on the
              shinier materials (wet road, glass, water), DepthOfField
              gives the cinematic falloff Sims-style cameras have, SMAA
              cleans edges, bloom haloes the obelisk + sun, vignette + ACES
              finishes. */}
          <EffectComposer multisampling={0} enableNormalPass>
            <N8AO
              aoRadius={2.5}
              intensity={isNight ? 3 : 2.2}
              distanceFalloff={1}
              quality="high"
              halfRes={false}
              color="black"
            />
            <SSR
              intensity={0.45}
              maxRoughness={0.5}
              thickness={0.5}
              ior={1.45}
              jitter={0.7}
              jitterRough={0.5}
              MAX_STEPS={20}
              NUM_BINARY_SEARCH_STEPS={5}
              STRETCH_MISSED_RAYS={false}
              USE_NORMALMAP
              USE_ROUGHNESSMAP
            />
            {/* DoF reads as out-of-focus mush at orbit distance — only worth
                running in character-follow mode where there's a clear
                subject. Re-enable behind a flag if you want it. */}
            <Bloom
              luminanceThreshold={isNight ? 0.4 : 0.7}
              luminanceSmoothing={0.5}
              intensity={isNight ? 2.0 : 0.65}
              radius={0.9}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.15} darkness={isNight ? 0.55 : 0.35} />
            <SMAA />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} blendFunction={BlendFunction.NORMAL} />
          </EffectComposer>
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-300 backdrop-blur">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-glow-jade" title="live" />
        {tint.label} · t{tick}
        {season ? ` · ${season}` : ""}
        {temperature != null ? ` · ${Math.round(temperature)}°C` : ""}
        {weatherOverride && weatherOverride !== "clear" ? ` · ${weatherOverride}` : weather !== "clear" ? ` · ${weather}` : ""}
        {` · ${minions.filter((m) => m.alive).length} alive`}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] text-zinc-300 backdrop-blur">
        {controlMode
          ? "WASD/arrows move · Q/E rotate · ESC release"
          : "drag to orbit · scroll to zoom · click a minion to inspect"}
      </div>
      {/* Take-control button — enabled only when a minion is selected. */}
      {selectedId ? (
        <button
          type="button"
          onClick={() => setControlMode((v) => !v)}
          className="absolute bottom-3 right-3 rounded-md border border-glow-amber/40 bg-glow-amber/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-glow-amber backdrop-blur hover:bg-glow-amber/25"
        >
          {controlMode ? "release control" : "take control"}
        </button>
      ) : null}
      {hoveredId && hoveredId !== selectedId ? (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] text-zinc-300 backdrop-blur">
          selecting…
        </div>
      ) : null}
    </div>
  );
}
