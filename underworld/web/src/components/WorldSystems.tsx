import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * World-systems dashboard — surfaces the simulation's emergent systems
 * (tech discovery, worldview/culture, environment, memes) that the backend
 * tracks each tick. Read-only; refreshes with the world's tick.
 */
export default function WorldSystems({ worldId, tick }: { worldId: string; tick: number }) {
  const key = (name: string) => ["world", worldId, name, tick] as const;
  const discoveries = useQuery({ queryKey: key("discoveries"), queryFn: () => api.discoveries(worldId) });
  const culture = useQuery({ queryKey: key("culture"), queryFn: () => api.culture(worldId) });
  const env = useQuery({ queryKey: key("environment"), queryFn: () => api.environment(worldId) });
  const memes = useQuery({ queryKey: key("memes"), queryFn: () => api.memes(worldId) });

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* DISCOVERIES */}
      <section className="panel">
        <div className="panel-header"><span>Discoveries</span>
          <span className="text-[9px] text-zinc-500">{discoveries.data?.discovered.length ?? 0} unlocked</span>
        </div>
        <div className="flex flex-wrap gap-1.5 p-3">
          {(discoveries.data?.discovered ?? []).map((d) => (
            <span key={d.tech} title={`year ${d.sim_year}`}
              className="rounded-md border border-glow-jade/30 bg-glow-jade/10 px-2 py-0.5 text-[10px] text-glow-jade">
              {d.tech.replace(/_/g, " ")}
            </span>
          ))}
          {(discoveries.data?.remaining ?? []).slice(0, 6).map((t) => (
            <span key={t} className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-600">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </section>

      {/* CULTURE */}
      <section className="panel">
        <div className="panel-header"><span>Culture &amp; belief</span></div>
        <div className="space-y-2 p-3 text-[11px]">
          <div className="flex items-baseline justify-between">
            <span className="text-zinc-500">Worldview</span>
            <span className="font-mono text-glow-purple">{culture.data?.worldview?.replace(/_/g, " ") ?? "…"}</span>
          </div>
          <div className="flex gap-2">
            {Object.entries(culture.data?.stances ?? {}).map(([k, v]) => (
              <span key={k} className="rounded bg-black/30 px-2 py-0.5 text-[10px] text-zinc-300">{k} {v}</span>
            ))}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-zinc-500">Knowledge / capita</span>
            <span className="font-mono text-zinc-200">{culture.data?.knowledge_per_capita?.toFixed(2) ?? "—"}</span>
          </div>
        </div>
      </section>

      {/* ENVIRONMENT */}
      <section className="panel">
        <div className="panel-header"><span>Environment</span></div>
        <div className="space-y-2 p-3 text-[11px]">
          <Bar label="Pollution" value={env.data?.pollution ?? 0} danger />
          <Bar label="Food (prey)" value={env.data?.food_availability ?? 0} />
          <div className="flex items-baseline justify-between text-zinc-500">
            <span>Predators</span>
            <span className="font-mono text-zinc-300">{pct(env.data?.predator_pop ?? 0)}</span>
          </div>
        </div>
      </section>

      {/* MEMES */}
      <section className="panel">
        <div className="panel-header"><span>Fads &amp; memes</span>
          <span className="text-[9px] text-zinc-500">{memes.data?.length ?? 0} live</span>
        </div>
        <div className="space-y-1.5 p-3">
          {(memes.data ?? []).slice(0, 6).map((m) => (
            <div key={m.name} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 truncate text-zinc-300">{m.name}{m.is_variant ? " ✦" : ""}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-black/40">
                <div className="h-full bg-glow-amber" style={{ width: pct(m.popularity) }} />
              </div>
              <span className="text-[9px] text-zinc-600">{m.kind}</span>
            </div>
          ))}
          {!memes.data?.length ? <div className="text-[10px] text-zinc-600">No memes yet — advance the world.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Bar({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 text-zinc-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-black/40">
        <div className={`h-full ${danger ? "bg-glow-rose" : "bg-glow-jade"}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-zinc-300">{Math.round(value * 100)}%</span>
    </div>
  );
}
