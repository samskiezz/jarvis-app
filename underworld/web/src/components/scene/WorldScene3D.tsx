import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment as DreiEnvironment, OrbitControls } from "@react-three/drei";
import {
  Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, SSR,
  ToneMapping, Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { MinionListItem } from "@/lib/types";
import Lights, { diurnal } from "./Lights";
import Terrain, { elevationAt } from "./Terrain";
import WorldEnvironment from "./Environment";
import GeneratedWorld from "./GeneratedWorld";
import MinionAvatar from "./MinionAvatar";
import { computePois, destinationForAction } from "./pois";
import type { Collider } from "./colliders";
import Weather, { weatherFor, type WeatherKind } from "./Weather";
import Water from "./Water";
import CelestialBodies from "./CelestialBodies";
import Vehicles from "./Vehicles";
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
  /** When true (and a minion is selected) the camera eases its orbit target
   *  toward the selected minion each frame, so it tracks the minion while the
   *  user keeps orbit/zoom control. Driven by the HUD's "Follow camera" toggle. */
  followCam?: boolean;
  /** When true (and a minion is selected) WASD/arrow keys drive the selected
   *  minion directly, suppressing only that minion's AI. Driven by the HUD's
   *  "Override control" toggle. */
  overrideCtl?: boolean;
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

/** In-scene WASD/arrow listener. While override is active for the selected
 *  minion, it writes a camera-relative unit XZ vector into controlInputRef each
 *  frame; the selected MinionAvatar reads that ref and walks itself. OrbitControls
 *  stays mounted so the user can still orbit/zoom around the minion. */
function WasdInput({
  active, controlInputRef,
}: {
  active: boolean;
  controlInputRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const { camera } = useThree();
  const keys = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!active) {
      controlInputRef.current.set(0, 0, 0);
      return;
    }
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.current.clear();
      controlInputRef.current.set(0, 0, 0);
    };
  }, [active, controlInputRef]);
  useFrame(() => {
    if (!active) return;
    const k = keys.current;
    // Camera-relative basis flattened onto the ground plane: 'forward' is the
    // direction the camera looks (minus Y), 'right' is its perpendicular.
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x); // 90° CW on XZ plane
    const dir = new THREE.Vector3();
    if (k.has("w") || k.has("arrowup")) dir.add(fwd);
    if (k.has("s") || k.has("arrowdown")) dir.sub(fwd);
    if (k.has("d") || k.has("arrowright")) dir.add(right);
    if (k.has("a") || k.has("arrowleft")) dir.sub(right);
    if (dir.lengthSq() > 0.01) dir.normalize();
    controlInputRef.current.copy(dir);
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

const WORLD_SIZE = 1000;     // open-world scale: a dense city core in a large map
const AMPLITUDE = 45.0;      // continent-scale ranges down to local ridges
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
  followCam = false,
  overrideCtl = false,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Shared refs the selected MinionAvatar mutates (its world position) and
  // the WASD listener mutates (a unit-vector control input). Both live as
  // refs because they update every frame and don't need React re-renders.
  const selectedPosRef = useRef(new THREE.Vector3());
  const controlInputRef = useRef(new THREE.Vector3());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbitRef = useRef<any>(null);
  // Override + follow only mean anything while something is selected.
  const overriding = overrideCtl && !!selectedId;
  const following = followCam && !!selectedId;

  // Ground height at a world (x, z) — reused by override movement so the
  // driven minion hugs the terrain instead of floating at its spawn height.
  // Mirrors placeMinion's elevation math (Terrain.elevationAt + amplitude band).
  const groundHeight = useMemo(() => {
    return (x: number, z: number) => {
      const nx = x / WORLD_SIZE + 0.5;
      const ny = z / WORLD_SIZE + 0.5;
      const e = elevationAt(grid, nx, ny);
      return Math.max(0, (e - 0.42) * AMPLITUDE);
    };
  }, [grid]);

  const pois = useMemo(
    () => computePois(grid, WORLD_SIZE, AMPLITUDE, seed),
    [grid, seed],
  );

  // Low-power (phone/tablet/weak GPU) detection → drop the expensive post-FX
  // (SSR, N8AO) and cap pixel ratio so the scene runs on mobile.
  const lowPower = useMemo(() => {
    if (typeof window === "undefined") return false;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 720;
    const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
    return Boolean(coarse || small || fewCores);
  }, []);

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

  // Navmesh obstacles = only the big things worth routing around (buildings +
  // monument). Trees/rocks are left to the avatar's per-frame push-out, keeping
  // the cached A* grid small even with hundreds of trees.
  const navColliders = useMemo<Collider[]>(() => {
    const out: Collider[] = pois.huts.map((h) => ({ x: h.pos[0], z: h.pos[2], r: 6.0 }));
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

  // Performance LOD: each avatar runs its own animation mixer, so cap how many
  // are rendered. Living + the selected minion come first; the rest are omitted
  // (a "+N more" badge shows the overflow). Keeps big populations smooth.
  const MAX_AVATARS = 130;
  const visiblePlacements = useMemo(() => {
    if (placements.length <= MAX_AVATARS) return placements;
    const ordered = [...placements].sort((a, b) => Number(b.minion.alive) - Number(a.minion.alive));
    const sliced = ordered.slice(0, MAX_AVATARS);
    if (selectedId && !sliced.some((p) => p.minion.id === selectedId)) {
      const sel = ordered.find((p) => p.minion.id === selectedId);
      if (sel) sliced[sliced.length - 1] = sel;
    }
    return sliced;
  }, [placements, selectedId]);
  const hiddenCount = placements.length - visiblePlacements.length;

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
        dpr={lowPower ? [1, 1.25] : [1, 2]}
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
          <GeneratedWorld pois={pois} size={WORLD_SIZE} seed={seed} />
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
          {visiblePlacements.map((p) => {
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
                navColliders={navColliders}
                worldSize={WORLD_SIZE}
                controlled={isSelected && overriding}
                groundHeight={groundHeight}
                positionRef={isSelected ? selectedPosRef : undefined}
                controlInputRef={isSelected && overriding ? controlInputRef : undefined}
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
          {/* WASD/arrow capture for override mode. Writes a camera-relative
              input vector that the selected avatar reads; OrbitControls stays
              live so the user can still orbit/zoom while driving. */}
          <WasdInput active={overriding} controlInputRef={controlInputRef} />
          {/* Selected-minion label + internal-monologue bubbles now render
              inside each MinionAvatar, so they track the moving avatar live
              (doc II.25) instead of floating over the minion's home. */}
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
          {/* Follow the selected minion: eases the orbit target toward it while
              the user keeps full orbit/zoom control. Gated on the HUD toggle. */}
          <FollowRig posRef={selectedPosRef} orbitRef={orbitRef} active={following} />
          {/* Post stack — modern WebGL ceiling. N8AO grounds objects in
              their crevices, SSR adds screen-space reflections on the
              shinier materials (wet road, glass, water), DepthOfField
              gives the cinematic falloff Sims-style cameras have, SMAA
              cleans edges, bloom haloes the obelisk + sun, vignette + ACES
              finishes. */}
          {/* NOTE: @react-three/postprocessing's EffectComposer forces
              gl.toneMapping = NoToneMapping while it renders the scene, so the
              renderer's toneMappingExposure is bypassed and the ToneMapping
              effect below is the single source of ACES tone mapping (no double
              apply). Day/night brightness is driven by the HDRI intensity
              ramps + light intensities + the grade passes, not gl exposure. */}
          <EffectComposer multisampling={0} enableNormalPass={!lowPower}>
            {!lowPower ? (
              <N8AO
                aoRadius={2.5}
                intensity={isNight ? 2.4 : 1.6}
                distanceFalloff={1}
                quality="high"
                halfRes={false}
                color="black"
              />
            ) : <></>}
            {!lowPower ? (
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
            ) : <></>}
            {/* DoF reads as out-of-focus mush at orbit distance — only worth
                running in character-follow mode where there's a clear
                subject. Re-enable behind a flag if you want it. */}
            <Bloom
              luminanceThreshold={isNight ? 0.45 : 0.85}
              luminanceSmoothing={0.4}
              intensity={isNight ? 1.8 : 0.55}
              radius={0.85}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.15} darkness={isNight ? 0.55 : 0.35} />
            <SMAA />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} blendFunction={BlendFunction.NORMAL} />
            {/* Cinematic colour grade — the "Avatar/Sims-4" vibrancy. ACES tone
                mapping desaturates a touch; we punch saturation + contrast back
                up so the world reads rich and colourful, not muddy. */}
            <HueSaturation saturation={isNight ? 0.3 : 0.22} />
            <BrightnessContrast brightness={isNight ? -0.03 : 0.02} contrast={0.1} />
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
        {hiddenCount > 0 ? ` · +${hiddenCount} off-screen (LOD)` : ""}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] text-zinc-300 backdrop-blur">
        {overriding
          ? "WASD/arrows move (camera-relative) · drag to orbit · scroll to zoom"
          : "drag to orbit · scroll to zoom · click a minion to inspect"}
      </div>
      {hoveredId && hoveredId !== selectedId ? (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] text-zinc-300 backdrop-blur">
          selecting…
        </div>
      ) : null}
    </div>
  );
}
