import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import MoodBar from "@/components/MoodBar";
import Sparkline from "@/components/Sparkline";

export default function Population() {
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds });
  const [worldId, setWorldId] = useState<string | null>(null);

  // Default to first world.
  const selected = worldId ?? worlds.data?.[0]?.id ?? null;

  const stats = useQuery({
    queryKey: ["world", selected, "population", 200],
    queryFn: () => api.population(selected!, 200),
    enabled: !!selected,
    refetchInterval: 4000,
  });

  const alive = stats.data?.history.map((s) => s.alive) ?? [];
  const births = stats.data?.history.map((s) => s.births) ?? [];
  const deaths = stats.data?.history.map((s) => s.deaths) ?? [];
  const forks = stats.data?.history.map((s) => s.forks) ?? [];
  const sanity = stats.data?.history.map((s) => s.avg_sanity) ?? [];
  const approvals = stats.data?.history.map((s) => s.inventions_approved) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">Population</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Demographic dashboard. Snapshots are written every tick — see births, deaths, forks, mood,
          and aggregate sanity over time.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <span>World</span>
          <span className="text-zinc-500">{worlds.data?.length ?? 0} active</span>
        </div>
        <div className="flex flex-wrap gap-1 p-3">
          {(worlds.data ?? []).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWorldId(w.id)}
              className={`rounded border px-2 py-1 text-[10px] uppercase tracking-widest ${
                selected === w.id
                  ? "border-glow-purple text-glow-purple"
                  : "border-zinc-700 text-zinc-400 hover:border-glow-purple/40"
              }`}
            >
              {w.name} · t{w.tick} · {w.alive_count}
            </button>
          ))}
        </div>
      </section>

      {selected && stats.data ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Alive", value: stats.data.alive, series: alive, c: "#10b981" },
              { label: "Generations", value: stats.data.generations, series: [], c: "#a855f7" },
              { label: "Avg age", value: stats.data.avg_age.toFixed(1), series: [], c: "#0ea5e9" },
              { label: "Avg sanity", value: stats.data.avg_sanity.toFixed(2), series: sanity, c: "#f59e0b" },
            ].map(({ label, value, series, c }) => (
              <div key={label} className="panel p-3">
                <div className="text-[9px] uppercase tracking-widest text-zinc-500">{label}</div>
                <div className="text-2xl text-zinc-100">{value}</div>
                {series.length ? (
                  <Sparkline values={series} width={220} height={36} stroke={c} fill={c + "26"} />
                ) : (
                  <div className="h-9" />
                )}
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="panel p-4">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-glow-purple">Births vs Deaths</div>
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-glow-jade">Births</div>
                  <Sparkline values={births} width={460} height={48} stroke="#10b981" fill="rgba(16,185,129,0.15)" />
                </div>
                <div>
                  <div className="text-[10px] text-glow-rose">Deaths</div>
                  <Sparkline values={deaths} width={460} height={48} stroke="#f43f5e" fill="rgba(244,63,94,0.15)" />
                </div>
                <div>
                  <div className="text-[10px] text-glow-sky">Forks</div>
                  <Sparkline values={forks} width={460} height={48} stroke="#0ea5e9" fill="rgba(14,165,233,0.15)" />
                </div>
              </div>
            </div>
            <div className="panel p-4">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-glow-purple">Inventions approved</div>
              <Sparkline values={approvals} width={460} height={140} stroke="#f59e0b" fill="rgba(245,158,11,0.18)" />
              <div className="mt-3 text-[10px] uppercase tracking-widest text-glow-purple">Mood (latest tick)</div>
              <div className="mt-2"><MoodBar breakdown={stats.data.mood_breakdown} /></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <span>Guild distribution</span>
              <span className="text-zinc-500">11 guilds tracked</span>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 p-4 text-[11px] sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(stats.data.guild_breakdown).map(([g, n]) => (
                <li key={g} className="flex justify-between">
                  <span className="text-zinc-300">{g}</span>
                  <span className="text-glow-purple">{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <div className="panel p-8 text-center text-[11px] text-zinc-500">
          Select a world above. If none exist yet, create one from the Command Centre.
        </div>
      )}
    </div>
  );
}
