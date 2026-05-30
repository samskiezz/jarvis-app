import type { Mood } from "@/lib/types";

const MOOD_COLOR: Record<string, string> = {
  flow: "#10b981",
  inspired: "#0ea5e9",
  content: "#a855f7",
  bored: "#71717a",
  anxious: "#f59e0b",
  exhausted: "#f97316",
  despairing: "#f43f5e",
};

interface Props {
  breakdown: Record<string, number>;
}

const ORDER: Mood[] = [
  "flow", "inspired", "content", "bored", "anxious", "exhausted", "despairing",
];

export default function MoodBar({ breakdown }: Props) {
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
  if (total === 0) {
    return <div className="text-[10px] text-zinc-500">No mood data yet.</div>;
  }
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded border border-glow-purple/20">
        {ORDER.map((m) => {
          const v = breakdown[m] || 0;
          if (v === 0) return null;
          return (
            <div
              key={m}
              style={{ flexBasis: `${(v / total) * 100}%`, background: MOOD_COLOR[m] }}
              title={`${m}: ${v}`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] uppercase tracking-widest">
        {ORDER.map((m) => {
          const v = breakdown[m] || 0;
          if (v === 0) return null;
          return (
            <span key={m} className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: MOOD_COLOR[m] }}
              />
              <span className="text-zinc-400">
                {m} <span className="text-zinc-300">{v}</span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
