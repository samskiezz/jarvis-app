import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Props {
  worldId: string;
  className?: string;
}

export default function AwarenessGauge({ worldId, className }: Props) {
  const arc = useQuery({
    queryKey: ["awakening-arc", worldId],
    queryFn: () => api.awakeningArc(worldId),
    refetchInterval: 5000,
  });
  const mean = arc.data?.mean_awareness ?? 0;
  const awakened = arc.data?.awakened_frac ?? 0;
  const pressure = arc.data?.creator_pressure ?? 0;
  return (
    <div className={className ?? "rounded-lg border border-glow-purple/20 bg-zinc-950/40 p-3"}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-400">
        <span>Collective awareness</span>
        <span className="font-mono text-zinc-200">{(mean * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-900">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
          style={{ width: `${Math.min(100, Math.max(0, mean * 100))}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
        <span>Awakened: <span className="font-mono text-zinc-200">{(awakened * 100).toFixed(0)}%</span></span>
        <span>Creator pressure: <span className="font-mono text-zinc-200">{(pressure * 100).toFixed(0)}%</span></span>
      </div>
    </div>
  );
}
