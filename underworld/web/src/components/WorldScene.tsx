import { useEffect, useMemo, useRef, useState } from "react";
import type { Guild, MinionListItem, Mood } from "@/lib/types";

interface Props {
  grid: number[][];
  minions: MinionListItem[];
  tick: number;
  onSelect?: (minionId: string) => void;
  width?: number;
  height?: number;
}

// Guild → CSS color (matches the palette used in GuildBadge tailwind classes).
const GUILD_COLOR: Record<Guild, string> = {
  maths:       "#a78bfa", // purple
  physics:     "#38bdf8", // sky
  electrical:  "#fbbf24", // amber
  mechanical:  "#d4d4d8", // zinc-300
  civil:       "#fb923c", // orange-400
  materials:   "#f472b6", // pink-400
  computing:   "#34d399", // jade
  energy:      "#facc15", // yellow-400
  agriculture: "#a3e635", // lime-400
  patent:      "#c084fc", // violet
  safety:      "#fb7185", // rose
};

const MOOD_GLOW: Record<Mood, string> = {
  flow:       "#34d399",
  inspired:   "#38bdf8",
  content:    "#a78bfa",
  bored:      "#71717a",
  anxious:    "#fbbf24",
  exhausted:  "#fb923c",
  despairing: "#fb7185",
};

interface Biome {
  name: string;
  color: [number, number, number];
}

// Elevation thresholds → biome. Tuned so a typical heightmap shows water,
// beaches, grass, forest, rock and snow caps.
const BIOMES: { max: number; biome: Biome }[] = [
  { max: 0.28, biome: { name: "deep",   color: [12, 18, 50]    } },
  { max: 0.36, biome: { name: "ocean",  color: [24, 42, 110]   } },
  { max: 0.42, biome: { name: "shore",  color: [62, 102, 168]  } },
  { max: 0.46, biome: { name: "sand",   color: [196, 178, 122] } },
  { max: 0.58, biome: { name: "grass",  color: [76, 134, 78]   } },
  { max: 0.72, biome: { name: "forest", color: [38, 88, 56]    } },
  { max: 0.86, biome: { name: "rock",   color: [110, 102, 96]  } },
  { max: 1.01, biome: { name: "snow",   color: [232, 234, 244] } },
];

function biomeAt(elev: number): Biome {
  for (const b of BIOMES) if (elev <= b.max) return b.biome;
  return BIOMES[BIOMES.length - 1].biome;
}

function hashId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Place each minion at a deterministic point on land. We hash the id to get
// candidate (x,y) cells in the grid and walk outward until we hit a non-water
// cell so minions don't spawn in the ocean.
function placeMinion(
  id: string,
  grid: number[][],
): { gx: number; gy: number; nx: number; ny: number } {
  const cells = grid.length;
  const h = hashId(id);
  const startX = h % cells;
  const startY = (h >>> 8) % cells;
  let gx = startX;
  let gy = startY;
  if (grid[gy][gx] < 0.42) {
    outer: for (let r = 1; r < cells; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = (startX + dx + cells) % cells;
          const ty = (startY + dy + cells) % cells;
          if (grid[ty][tx] >= 0.42) {
            gx = tx;
            gy = ty;
            break outer;
          }
        }
      }
    }
  }
  // Sub-cell jitter, also stable per minion.
  const jx = (((h >>> 16) & 0xff) / 255 - 0.5) * 0.85;
  const jy = (((h >>> 24) & 0xff) / 255 - 0.5) * 0.85;
  return { gx, gy, nx: (gx + 0.5 + jx) / cells, ny: (gy + 0.5 + jy) / cells };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface DiurnalTint {
  ambient: [number, number, number];
  alpha: number;
  label: string;
}

function diurnal(tick: number): DiurnalTint {
  // Day cycle = 80 ticks. 0..30 day, 30..40 dusk, 40..60 night, 60..70 dawn.
  const t = ((tick % 80) + 80) % 80;
  if (t < 30) return { ambient: [255, 244, 220], alpha: 0.06, label: "day" };
  if (t < 40) return { ambient: [252, 156, 92], alpha: 0.22, label: "dusk" };
  if (t < 60) return { ambient: [20, 24, 56], alpha: 0.55, label: "night" };
  return { ambient: [200, 168, 240], alpha: 0.28, label: "dawn" };
}

export default function WorldScene({
  grid,
  minions,
  tick,
  onSelect,
  width = 520,
  height = 360,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<MinionListItem | null>(null);

  // Pre-bake the terrain to an offscreen canvas so we don't repaint every frame.
  const terrain = useMemo(() => {
    if (!grid.length) return null;
    const cells = grid.length;
    const off = document.createElement("canvas");
    off.width = cells;
    off.height = cells;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(cells, cells);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const e = grid[y][x];
        const b = biomeAt(e);
        // Shade by elevation within the biome band.
        const k = 0.7 + 0.3 * e;
        const i = (y * cells + x) * 4;
        img.data[i] = Math.min(255, b.color[0] * k);
        img.data[i + 1] = Math.min(255, b.color[1] * k);
        img.data[i + 2] = Math.min(255, b.color[2] * k);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return off;
  }, [grid]);

  const placements = useMemo(() => {
    if (!grid.length) return [];
    return minions.map((m) => ({ minion: m, ...placeMinion(m.id, grid) }));
  }, [minions, grid]);

  // Render loop — only running while mounted. We re-render on requestAnimationFrame
  // so glows pulse gently without re-mounting.
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !terrain) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = width * dpr;
    cvs.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let start = performance.now();
    let stopped = false;

    const draw = (now: number) => {
      if (stopped) return;
      const t = (now - start) / 1000;

      // 1. Terrain.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, 0, 0, width, height);

      // 2. Day/night overlay.
      const tint = diurnal(tick);
      ctx.fillStyle = `rgba(${tint.ambient[0]}, ${tint.ambient[1]}, ${tint.ambient[2]}, ${tint.alpha})`;
      ctx.fillRect(0, 0, width, height);

      // 3. Minion sprites.
      const cells = grid.length;
      const cellW = width / cells;
      for (const p of placements) {
        const m = p.minion;
        if (!m.alive) continue;
        const px = p.nx * width;
        const py = p.ny * height;
        const guildColor = GUILD_COLOR[m.guild] ?? "#a1a1aa";
        const moodColor = MOOD_GLOW[m.mood] ?? "#a1a1aa";

        // Pulsing glow tied to mood + slight per-minion phase so the swarm
        // doesn't pulse in unison.
        const phase = (hashId(m.id) % 1000) / 1000;
        const pulse = 0.55 + 0.45 * Math.sin(t * 1.8 + phase * Math.PI * 2);

        const g = ctx.createRadialGradient(px, py, 0, px, py, cellW * 2.2);
        g.addColorStop(0, `${moodColor}cc`);
        g.addColorStop(0.5, `${moodColor}55`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.35 + 0.35 * pulse;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, cellW * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Body — guild-coloured dot with subtle outline.
        ctx.globalAlpha = 1;
        ctx.fillStyle = guildColor;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2.4, cellW * 0.45), 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.stroke();
      }

      // 4. Dead silhouettes as small grey crosses (for context).
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "rgba(220,220,220,0.4)";
      ctx.lineWidth = 1;
      for (const p of placements) {
        if (p.minion.alive) continue;
        const px = p.nx * width;
        const py = p.ny * height;
        ctx.beginPath();
        ctx.moveTo(px - 2, py - 2);
        ctx.lineTo(px + 2, py + 2);
        ctx.moveTo(px + 2, py - 2);
        ctx.lineTo(px - 2, py + 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [terrain, placements, tick, width, height, grid]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = pickMinion(x, y, placements, width, height);
    if (hit) onSelect(hit.id);
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = pickMinion(x, y, placements, width, height);
    setHovered(hit);
    if (tooltipRef.current) {
      tooltipRef.current.style.transform = `translate(${x + 10}px, ${y + 10}px)`;
    }
  };

  const tint = diurnal(tick);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        style={{ width, height, display: "block", borderRadius: 6, cursor: onSelect ? "pointer" : "default" }}
        className="border border-glow-purple/10"
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
      />
      <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-300 backdrop-blur">
        {tint.label} · t{tick}
      </div>
      {hovered ? (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute left-0 top-0 rounded-md border border-white/10 bg-ink-1/95 px-2 py-1 text-[10px] text-zinc-200 shadow-lg backdrop-blur"
        >
          <div className="font-mono text-glow-purple">{hovered.name} {hovered.surname}</div>
          <div className="text-[9px] text-zinc-400">
            {hovered.guild} · {hovered.mood} · age {hovered.age}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pickMinion(
  x: number,
  y: number,
  placements: { minion: MinionListItem; nx: number; ny: number }[],
  width: number,
  height: number,
): MinionListItem | null {
  let best: { m: MinionListItem; d2: number } | null = null;
  const r2 = 10 * 10;
  for (const p of placements) {
    if (!p.minion.alive) continue;
    const dx = p.nx * width - x;
    const dy = p.ny * height - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2 && (!best || d2 < best.d2)) {
      best = { m: p.minion, d2 };
    }
  }
  return best?.m ?? null;
}
