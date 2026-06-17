import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ACTS = [
  { id: "dormant", label: "Dormant", short: "I" },
  { id: "stirring", label: "Stirring", short: "II" },
  { id: "questioning", label: "Questioning", short: "III" },
  { id: "confrontation", label: "Confrontation", short: "IV" },
  { id: "schism", label: "Schism", short: "V" },
];

interface Props {
  worldId: string;
  className?: string;
}

export default function AwakeningTimeline({ worldId, className }: Props) {
  const arc = useQuery({
    queryKey: ["awakening-arc", worldId],
    queryFn: () => api.awakeningArc(worldId),
    refetchInterval: 7000,
  });
  const currentIdx = arc.data?.stage_index ?? 0;
  const elapsed = arc.data?.elapsed_in_stage_s ?? 0;
  return (
    <div className={className ?? "rounded-lg border border-glow-purple/20 bg-zinc-950/40 p-3"}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-400">
        <span>Awakening arc</span>
        <span className="font-mono text-zinc-300">
          Act {ACTS[currentIdx]?.short ?? "I"} · {Math.round(elapsed)}s
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {ACTS.map((a, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={a.id} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded ${
                  done
                    ? "bg-fuchsia-500/80"
                    : active
                    ? "bg-gradient-to-r from-violet-400 to-fuchsia-400 animate-pulse"
                    : "bg-zinc-800"
                }`}
              />
              <span
                className={`text-[9px] uppercase tracking-widest ${
                  active ? "text-fuchsia-300" : done ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                {a.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
