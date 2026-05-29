import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment as DreiEnvironment, Html, OrbitControls } from "@react-three/drei";
import {
  Bloom, DepthOfField, EffectComposer, N8AO, SMAA, SSR, ToneMapping, Vignette,
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
  biomeHint?: string;
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
  biomeHint,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Shared refs the selected MinionAvatar mutates (its world position) and
  // the WASD listener mutates (a unit-vector control input). Both live as
  // refs because they update every frame and don't need React re-renders.
  const selectedPosRef = useRef(new THREE.Vector3());
  const controlInputRef = useRef(new THREE.Vector3());
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
      const { target } = destinationForAction(m.id, action, pois, home);
      return { minion: m, home, target };
    }),
    [minions, grid, pois, actionByMinion],
  );

  const tint = diurnal(tick, WORLD_SIZE);
  const weather: WeatherKind = useMemo(
    () => weatherFor(biomeHint ?? "plains", tick),
    [biomeHint, tick],
  );

  const selected = useMemo(
    () => placements.find((p) => p.minion.id === selectedId) ?? null,
    [placements, selectedId],
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
          {selected ? (
            <Html
              position={[selected.home[0], selected.home[1] + 3.6, selected.home[2]]}
              center
              distanceFactor={26}
              style={{ pointerEvents: "none" }}
            >
              <div className="rounded-lg border border-white/15 bg-ink-1/95 px-2 py-1 text-[10px] text-zinc-100 shadow-xl backdrop-blur">
                <div className="font-mono text-glow-purple">{selected.minion.name} {selected.minion.surname}</div>
                <div className="text-[9px] text-zinc-400">
                  {selected.minion.guild} · {selected.minion.mood}
                </div>
                {actionByMinion?.[selected.minion.id] ? (
                  <div className="text-[9px] text-glow-jade">
                    {ACTION_LABEL[actionByMinion[selected.minion.id]] ?? actionByMinion[selected.minion.id]}
                  </div>
                ) : null}
              </div>
            </Html>
          ) : null}
          {!controlMode && (
            <OrbitControls
              target={[0, 2, 0]}
              enablePan
              enableDamping
              dampingFactor={0.08}
              minDistance={WORLD_SIZE * 0.08}
              maxDistance={WORLD_SIZE * 1.6}
              maxPolarAngle={Math.PI * 0.48}
            />
          )}
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
              jitterRoughness={0.5}
              steps={20}
              refineSteps={5}
              missedRays={false}
              useNormalMap
              useRoughnessMap
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
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-300 backdrop-blur">
        {tint.label} · t{tick}
        {weather !== "clear" ? ` · ${weather}` : ""}
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
