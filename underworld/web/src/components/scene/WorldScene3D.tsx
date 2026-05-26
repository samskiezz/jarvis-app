import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment as DreiEnvironment, Html, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { MinionListItem } from "@/lib/types";
import Lights, { diurnal } from "./Lights";
import Terrain, { elevationAt } from "./Terrain";
import WorldEnvironment from "./Environment";
import MinionAvatar from "./MinionAvatar";
import { computePois, destinationForAction } from "./pois";
import Weather, { weatherFor, type WeatherKind } from "./Weather";
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

const WORLD_SIZE = 120;      // world units across — was 40; tripled
const AMPLITUDE = 9.0;       // taller hills now that the world is bigger
const ARRIVAL_RADIUS = 4.0;

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

  const pois = useMemo(
    () => computePois(grid, WORLD_SIZE, AMPLITUDE, seed),
    [grid, seed],
  );

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

  return (
    <div style={{ position: "relative", width, height }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: isNight ? 0.6 : isDayish ? 1.05 : 0.85,
          outputColorSpace: THREE.SRGBColorSpace,
          preserveDrawingBuffer: true,
        }}
        camera={{
          position: [WORLD_SIZE * 0.55, WORLD_SIZE * 0.38, WORLD_SIZE * 0.70],
          fov: 52,
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
          <Terrain grid={grid} size={WORLD_SIZE} amplitude={AMPLITUDE} />
          <WorldEnvironment pois={pois} size={WORLD_SIZE} seed={seed} tick={tick} />
          <Weather kind={weather} size={WORLD_SIZE} />
          {placements.map((p) => {
            const dx = p.target ? p.target[0] - p.home[0] : 0;
            const dz = p.target ? p.target[2] - p.home[2] : 0;
            const at = !p.target || Math.hypot(dx, dz) < ARRIVAL_RADIUS;
            return (
              <MinionAvatar
                key={p.minion.id}
                minion={p.minion}
                basePosition={p.home}
                targetPosition={p.target}
                atDestination={at}
                actionName={actionByMinion?.[p.minion.id]}
                selected={p.minion.id === selectedId}
                onClick={(id) => {
                  onSelect(id);
                  setHoveredId(id);
                }}
              />
            );
          })}
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
          <OrbitControls
            target={[0, 2, 0]}
            enablePan
            enableDamping
            dampingFactor={0.08}
            minDistance={WORLD_SIZE * 0.15}
            maxDistance={WORLD_SIZE * 1.6}
            maxPolarAngle={Math.PI * 0.48}
          />
          <EffectComposer multisampling={4}>
            <Bloom
              luminanceThreshold={0.6}
              luminanceSmoothing={0.4}
              intensity={isNight ? 1.6 : 0.55}
              radius={0.85}
            />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} blendFunction={BlendFunction.NORMAL} />
          </EffectComposer>
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-300 backdrop-blur">
        {tint.label} · t{tick}
        {weather !== "clear" ? ` · ${weather}` : ""}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] text-zinc-300 backdrop-blur">
        drag to orbit · scroll to zoom · click a minion to inspect
      </div>
      {hoveredId && hoveredId !== selectedId ? (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] text-zinc-300 backdrop-blur">
          selecting…
        </div>
      ) : null}
    </div>
  );
}
