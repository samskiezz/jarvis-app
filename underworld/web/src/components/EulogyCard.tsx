import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface EulogyData {
  minion_id: string;
  world_id: string;
  name: string;
  cause: string;
  last_action: string;
  age_ticks: number;
  generation: number;
  knowledge_contribution: string;
  relationships: string[];
  lineage: string[];
  died_at_tick: number;
  ts: number;
}

export function EulogyCard({ e }: { e: EulogyData }) {
  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <header className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-zinc-100">{e.name}</h4>
        <span className="text-[9px] uppercase tracking-widest text-zinc-500">{e.cause}</span>
      </header>
      <p className="mt-1 text-[11px] leading-tight text-zinc-400">
        Gen {e.generation} · {e.age_ticks} ticks
        {e.last_action ? <> · last did <em className="text-zinc-300">{e.last_action}</em></> : null}
      </p>
      {e.knowledge_contribution ? (
        <p className="mt-1 text-[10px] text-zinc-500">{e.knowledge_contribution}</p>
      ) : null}
      {e.relationships.length > 0 ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          Remembered by {e.relationships.slice(0, 4).join(", ")}
        </p>
      ) : null}
    </article>
  );
}

interface FeedProps {
  worldId: string;
  limit?: number;
  className?: string;
}

export default function EulogyFeed({ worldId, limit = 8, className }: FeedProps) {
  const q = useQuery({
    queryKey: ["eulogies", worldId, limit],
    queryFn: () => api.eulogies(worldId, limit),
    refetchInterval: 8000,
  });
  const items = q.data?.eulogies ?? [];
  return (
    <div className={className ?? "rounded-lg border border-glow-purple/20 bg-zinc-950/40 p-3"}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-400">
        <span>Eulogies</span>
        <span className="font-mono text-zinc-500">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="mt-2 text-[10px] text-zinc-500">No recent deaths to honour.</div>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((e) => (
            <EulogyCard key={`${e.minion_id}:${e.died_at_tick}`} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
