import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * World-systems dashboard — surfaces every emergent simulation system the backend
 * tracks each tick: climate, environment (wildlife/soil/pollution/tectonics),
 * society (government/law/worldview), economy-flavoured culture, discoveries,
 * research-gap puzzles, and memes. Read-only; refreshes with the world tick.
 */
export default function WorldSystems({ worldId, tick }: { worldId: string; tick: number }) {
  const k = (n: string) => ["world", worldId, n, tick] as const;
  const climate = useQuery({ queryKey: k("climate"), queryFn: () => api.climate(worldId) });
  const env = useQuery({ queryKey: k("environment"), queryFn: () => api.environment(worldId) });
  const society = useQuery({ queryKey: k("society"), queryFn: () => api.society(worldId) });
  const culture = useQuery({ queryKey: k("culture"), queryFn: () => api.culture(worldId) });
  const discoveries = useQuery({ queryKey: k("discoveries"), queryFn: () => api.discoveries(worldId) });
  const gaps = useQuery({ queryKey: k("gaps"), queryFn: () => api.gaps(worldId) });
  const memes = useQuery({ queryKey: k("memes"), queryFn: () => api.memes(worldId) });
  const species = useQuery({ queryKey: k("species"), queryFn: () => api.species(worldId) });
  const physics = useQuery({ queryKey: ["physics", "laws"], queryFn: () => api.physicsLaws() });

  const WEATHER_ICON: Record<string, string> = {
    clear: "☀️", cloudy: "⛅", rain: "🌧️", storm: "⛈️", snow: "❄️",
  };
  const cap = (s?: string) => (s ? s.replace(/_/g, " ") : "…");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {/* CLIMATE */}
      <section className="panel">
        <div className="panel-header"><span>Climate</span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-500">{cap(climate.data?.season)}</span>
        </div>
        <div className="space-y-2 p-3 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-2xl">{WEATHER_ICON[climate.data?.weather ?? "clear"] ?? "🌍"}</span>
            <span className="font-mono text-lg text-zinc-100">{climate.data?.temperature ?? "—"}°C</span>
          </div>
          <Stat label="Weather" value={cap(climate.data?.weather)} />
          <Bar label="Thermal stress" value={climate.data?.thermal_stress ?? 0} danger />
        </div>
      </section>

      {/* ENVIRONMENT */}
      <section className="panel">
        <div className="panel-header"><span>Environment</span></div>
        <div className="space-y-1.5 p-3 text-[11px]">
          <Bar label="Food (prey)" value={env.data?.food_availability ?? 0} />
          <Bar label="Water table" value={env.data?.water_table ?? 0} />
          <Bar label="Soil fertility" value={env.data?.soil_fertility ?? 0} />
          <Bar label="Crop yield" value={env.data?.crop_yield ?? 0} />
          <Bar label="Pollution" value={env.data?.pollution ?? 0} danger />
          <Bar label="Tectonic stress" value={env.data?.tectonic_stress ?? 0} danger />
          <Bar label="Structure fatigue" value={env.data?.structure_fatigue ?? 0} danger />
          {env.data?.epidemic_active ? (
            <Bar label="🦠 Epidemic" value={env.data?.epidemic_infected ?? 0} danger />
          ) : null}
        </div>
      </section>

      {/* PHYSICS */}
      <section className="panel">
        <div className="panel-header"><span>Physics compendium</span>
          <span className="text-[9px] text-zinc-500">{physics.data?.count ?? 0} laws</span>
        </div>
        <div className="p-3 text-[11px]">
          <div className="text-zinc-500 mb-1.5">Computable laws minions discover, calculate &amp; master:</div>
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set((physics.data?.laws ?? []).map((l) => l.discipline))).slice(0, 12).map((d) => (
              <span key={d} className="rounded border border-glow-jade/25 bg-glow-jade/5 px-1.5 py-0.5 text-[9px] text-glow-jade">
                {d}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIETY */}
      <section className="panel">
        <div className="panel-header"><span>Society</span></div>
        <div className="space-y-2 p-3 text-[11px]">
          <Stat label="Government" value={cap(society.data?.government)} accent />
          <Stat label="Legal system" value={cap(society.data?.legal_system)} />
          <Stat label="Worldview" value={cap(culture.data?.worldview)} accent />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Object.entries(culture.data?.stances ?? {}).map(([s, n]) => (
              <span key={s} className="rounded bg-black/30 px-2 py-0.5 text-[10px] text-zinc-300">{s} {n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* DISCOVERIES */}
      <section className="panel">
        <div className="panel-header"><span>Discoveries</span>
          <span className="text-[9px] text-zinc-500">{discoveries.data?.discovered.length ?? 0} unlocked</span>
        </div>
        <div className="flex flex-wrap gap-1.5 p-3">
          {(discoveries.data?.discovered ?? []).map((d) => (
            <span key={d.tech} title={`year ${d.sim_year}`}
              className="rounded-md border border-glow-jade/30 bg-glow-jade/10 px-2 py-0.5 text-[10px] text-glow-jade">
              {cap(d.tech)}
            </span>
          ))}
          {(discoveries.data?.remaining ?? []).slice(0, 6).map((t) => (
            <span key={t} className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-600">
              {cap(t)}
            </span>
          ))}
        </div>
      </section>

      {/* RESEARCH GAPS (gateway puzzles) */}
      <section className="panel">
        <div className="panel-header"><span>Research gaps</span>
          <span className="text-[9px] text-zinc-500">{gaps.data?.length ?? 0} open</span>
        </div>
        <div className="space-y-1.5 p-3 text-[11px]">
          {(gaps.data ?? []).slice(0, 5).map((g) => (
            <div key={g.id} className="rounded border border-glow-amber/20 bg-glow-amber/5 px-2 py-1">
              <div className="text-zinc-200">{g.prompt}</div>
              <div className="text-[9px] text-zinc-500">{g.discipline} · needs {g.required_patents} patents</div>
            </div>
          ))}
          {!gaps.data?.length ? (
            <div className="text-[10px] text-zinc-600">No gaps yet — opens at peak information.</div>
          ) : null}
        </div>
      </section>

      {/* SPECIES — evolving biology */}
      <section className="panel">
        <div className="panel-header"><span>Species</span>
          <span className="text-[9px] text-zinc-500">{species.data?.length ?? 0} alive</span>
        </div>
        <div className="space-y-1.5 p-3 text-[11px]">
          {(species.data ?? []).slice(0, 6).map((sp) => (
            <div key={sp.name} className="flex items-center gap-2">
              <span className="w-20 truncate text-zinc-300">{sp.name}</span>
              <span className="text-[9px] text-zinc-600">{sp.kind === "flora" ? "🌿" : "🦌"}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-black/40">
                <div className="h-full bg-glow-jade" style={{ width: `${Math.round(sp.population * 100)}%` }} />
              </div>
              <span className="w-12 text-right text-[9px] text-zinc-500" title="cold tolerance">
                ❄{Math.round(sp.cold_tolerance * 100)}%
              </span>
            </div>
          ))}
          {!species.data?.length ? <div className="text-[10px] text-zinc-600">Seeding…</div> : null}
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
                <div className="h-full bg-glow-amber" style={{ width: `${Math.round(m.popularity * 100)}%` }} />
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono ${accent ? "text-glow-purple" : "text-zinc-200"}`}>{value}</span>
    </div>
  );
}

function Bar({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 text-zinc-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-black/40">
        <div className={`h-full ${danger ? "bg-glow-rose" : "bg-glow-jade"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-zinc-300">{pct}%</span>
    </div>
  );
}
