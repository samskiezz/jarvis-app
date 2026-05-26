import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { MinionListItem } from "@/lib/types";
import Lights, { diurnal } from "./Lights";
import Terrain, { elevationAt } from "./Terrain";
import WorldEnvironment from "./Environment";
import MinionAvatar from "./MinionAvatar";

interface Props {
  grid: number[][];
  minions: MinionListItem[];
  tick: number;
  seed: number;
  onSelect: (id: string) => void;
  selectedId?: string | null;
  width?: number;
  height?: number;
  /** Map of minion_id → last action name from the latest tick report. */
  actionByMinion?: Record<string, string>;
}

const WORLD_SIZE = 40;       // world units across (X and Z)
const AMPLITUDE = 3.5;       // peak elevation in world units

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic on-land position from minion id. Walks outward on the
// heightmap if the first sample is in water.
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

// Short label for the speech bubble — the verb form of the action.
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
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const placements = useMemo(
    () => minions.map((m) => ({ minion: m, pos: placeMinion(m.id, grid, WORLD_SIZE, AMPLITUDE) })),
    [minions, grid],
  );

  const tint = diurnal(tick, WORLD_SIZE);
  const selected = useMemo(
    () => placements.find((p) => p.minion.id === selectedId) ?? null,
    [placements, selectedId],
  );

  return (
    <div style={{ position: "relative", width, height }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [WORLD_SIZE * 0.35, WORLD_SIZE * 0.30, WORLD_SIZE * 0.45], fov: 42, near: 0.1, far: WORLD_SIZE * 8 }}
        style={{ width, height, borderRadius: 8, display: "block" }}
        onPointerMissed={() => onSelect("")}
      >
        <Suspense fallback={null}>
          <Lights tick={tick} size={WORLD_SIZE} />
          <Terrain grid={grid} size={WORLD_SIZE} amplitude={AMPLITUDE} />
          <WorldEnvironment grid={grid} size={WORLD_SIZE} amplitude={AMPLITUDE} seed={seed} tick={tick} />
          {placements.map((p) => (
            <MinionAvatar
              key={p.minion.id}
              minion={p.minion}
              basePosition={p.pos}
              actionName={actionByMinion?.[p.minion.id]}
              selected={p.minion.id === selectedId}
              onClick={(id) => {
                onSelect(id);
                setHoveredId(id);
              }}
            />
          ))}
          {/* Speech bubble for the selected minion. */}
          {selected ? (
            <Html
              position={[selected.pos[0], selected.pos[1] + 2.2, selected.pos[2]]}
              center
              distanceFactor={18}
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
            target={[0, 1, 0]}
            enablePan
            enableDamping
            dampingFactor={0.08}
            minDistance={WORLD_SIZE * 0.25}
            maxDistance={WORLD_SIZE * 1.6}
            maxPolarAngle={Math.PI * 0.48}
          />
        </Suspense>
      </Canvas>
      {/* HUD overlays */}
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-300 backdrop-blur">
        {tint.label} · t{tick}
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
