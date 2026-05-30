import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Atom, Battery, Brain, Cpu, FileSearch, Hammer, Leaf, Plus,
  Radio, Skull, Sparkles, Trash2, Wind, Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";
import StatCard from "@/components/ui/StatCard";

const CPC_SUGGESTIONS = [
  { code: "H02J", label: "Power grids", icon: Zap, hint: "Batteries · inverters · grid stability" },
  { code: "G06F", label: "Computing", icon: Cpu, hint: "Data processing · ML systems" },
  { code: "F03D", label: "Wind", icon: Wind, hint: "Wind turbines · rotor design" },
  { code: "E04F", label: "Buildings", icon: Hammer, hint: "Building finishings · materials" },
  { code: "B62D", label: "Vehicles", icon: Activity, hint: "Motor vehicles · chassis" },
  { code: "F24S", label: "Solar", icon: Atom, hint: "Solar collectors · thermal" },
  { code: "A01H", label: "Agriculture", icon: Leaf, hint: "Plant breeding · crops" },
  { code: "H01M", label: "Cells", icon: Battery, hint: "Batteries · fuel cells" },
];

export default function CommandCentre() {
  const qc = useQueryClient();
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds, refetchInterval: 5000 });

  const [name, setName] = useState("New World");
  const [cpc, setCpc] = useState("H02J");
  const [startingPop, setStartingPop] = useState(128);
  const [populationCap, setPopulationCap] = useState(400);
  // starting_age pre-ages the founders so breeding unlocks on tick 0;
  // auto_advance starts the tick scheduler on the new world immediately.
  const [startingAge, setStartingAge] = useState(25);
  const [autoStart, setAutoStart] = useState(true);
  const createWorld = useMutation({
    mutationFn: () =>
      api.createWorld(name, cpc, startingPop, populationCap, startingAge, autoStart),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worlds"] }),
  });
  const deleteWorld = useMutation({
    mutationFn: (worldId: string) => api.deleteWorld(worldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worlds"] }),
  });

  const stats = useMemo(() => {
    const list = worlds.data ?? [];
    return {
      worlds: list.length,
      live: list.filter((w) => w.auto_advance).length,
      alive: list.reduce((s, w) => s + w.alive_count, 0),
      total: list.reduce((s, w) => s + w.minion_count, 0),
      ticks: list.reduce((s, w) => s + w.tick, 0),
    };
  }, [worlds.data]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* HERO */}
      <header className="relative overflow-hidden rounded-xl border border-glow-purple/20 bg-gradient-to-br from-ink-1 via-ink-1 to-ink-2 p-8 shadow-panel">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(168,85,247,0.18), transparent 50%), radial-gradient(ellipse at bottom left, rgba(14,165,233,0.10), transparent 50%)",
          }}
        />
        <div className="relative flex items-start gap-5">
          <div className="relative h-14 w-14 shrink-0">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-glow-purple via-glow-violet to-glow-sky shadow-glow-strong" />
            <div className="absolute inset-[2px] flex items-center justify-center rounded-md bg-ink-0">
              <Skull size={26} className="text-glow-purple" />
            </div>
          </div>
          <div className="flex-1">
            <div className="page-eyebrow">Command Centre</div>
            <h1 className="mt-1 font-display text-3xl font-light tracking-tight text-zinc-100">
              Forge a world. Watch swarms evolve.
            </h1>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-zinc-400">
              Each <span className="text-glow-purple">world</span> is seeded by a CPC patent class
              that biases its terrain, aptitude weighting, and guild distribution. Minions are
              born with{" "}
              <span className="text-glow-sky">swarm roles</span> drawn from the Master Reference;
              they cite expired patents, propose inventions, and escalate regulated ideas to{" "}
              <span className="text-glow-amber">multi-stage research projects</span>.
            </p>
          </div>
        </div>
      </header>

      {/* AGGREGATE STATS */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Worlds"
          value={stats.worlds}
          icon={<FileSearch size={14} />}
          hint={`${stats.live} live · ${stats.worlds - stats.live} paused`}
          accent="purple"
        />
        <StatCard
          label="Alive"
          value={stats.alive.toLocaleString()}
          icon={<Brain size={14} />}
          hint={`of ${stats.total.toLocaleString()} total`}
          accent="jade"
        />
        <StatCard
          label="Σ ticks"
          value={stats.ticks.toLocaleString()}
          icon={<Activity size={14} />}
          hint="across all worlds"
          accent="amber"
        />
        <StatCard
          label="Density"
          value={
            stats.worlds > 0 ? (stats.alive / Math.max(1, stats.worlds)).toFixed(0) : "—"
          }
          icon={<Sparkles size={14} />}
          hint="avg alive per world"
          accent="sky"
        />
      </section>

      {/* FORGE FORM */}
      <section className="panel-elevated">
        <div className="panel-header">
          <span className="flex items-center gap-2">
            <Plus size={11} />
            Forge a new world
          </span>
          <span>100–300 starting Minions recommended</span>
        </div>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            createWorld.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr]">
            <label className="block">
              <span className="page-eyebrow text-[9px]">Name</span>
              <input
                className="input mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Quantum Forge"
                required
              />
            </label>
            <label className="block">
              <span className="page-eyebrow text-[9px]">CPC class</span>
              <input
                className="input mt-1.5 font-mono uppercase"
                value={cpc}
                onChange={(e) => setCpc(e.target.value.toUpperCase())}
                placeholder="H02J"
                required
              />
            </label>
            <label className="block">
              <span className="page-eyebrow text-[9px]">Starting pop</span>
              <input
                type="number"
                className="input mt-1.5"
                value={startingPop}
                min={10}
                max={300}
                onChange={(e) => setStartingPop(Number(e.target.value) || 128)}
              />
            </label>
            <label className="block">
              <span className="page-eyebrow text-[9px]">Cap</span>
              <input
                type="number"
                className="input mt-1.5"
                value={populationCap}
                min={50}
                max={1000}
                onChange={(e) => setPopulationCap(Number(e.target.value) || 400)}
              />
            </label>
          </div>

          {/* Boot options: pre-age founders + auto-start the tick scheduler. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr] md:items-end">
            <label className="block">
              <span className="page-eyebrow text-[9px]">Starting age (ticks)</span>
              <input
                type="number"
                className="input mt-1.5"
                value={startingAge}
                min={0}
                max={200}
                onChange={(e) => setStartingAge(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="mt-1 block text-[9px] text-zinc-500">
                Pre-ages the founders so breeding unlocks the moment the world ticks
                (≥20 = past the agent's breeding threshold).
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-glow-purple/15 bg-glow-purple/5 px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5 accent-glow-purple"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />
              <span>
                <span className="block text-[10px] font-medium uppercase tracking-widest text-glow-purple">
                  Auto-start ticking
                </span>
                <span className="mt-0.5 block text-[9px] text-zinc-500">
                  Run the world live the moment it's forged. Uncheck to start paused.
                </span>
              </span>
            </label>
          </div>

          {/* CPC suggestion chips */}
          <div>
            <div className="page-eyebrow text-[9px] mb-2">Pick a seed</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CPC_SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                const active = cpc === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => setCpc(s.code)}
                    className={`group flex items-center gap-2 rounded-md border px-3 py-2 text-left transition ${
                      active
                        ? "border-glow-purple bg-glow-purple/10 shadow-glow"
                        : "border-zinc-800 hover:border-glow-purple/40 hover:bg-glow-purple/5"
                    }`}
                  >
                    <Icon
                      size={14}
                      className={active ? "text-glow-purple" : "text-zinc-500 group-hover:text-glow-purple"}
                    />
                    <div className="min-w-0">
                      <div className={`text-[10px] font-medium uppercase tracking-widest ${active ? "text-glow-purple" : "text-zinc-300"}`}>
                        {s.code} · {s.label}
                      </div>
                      <div className="truncate text-[9px] text-zinc-500">{s.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-glow-purple/10 pt-4">
            <div className="text-[10px] text-zinc-500">
              Forging takes ~2s · creates {startingPop} minions + initial heightmap
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={createWorld.isPending}
            >
              {createWorld.isPending ? (
                <>
                  <Activity className="animate-spin" size={11} />
                  Forging…
                </>
              ) : (
                <>
                  <Plus size={11} />
                  Forge world
                </>
              )}
            </button>
          </div>

          {createWorld.isError ? (
            <div className="rounded border border-glow-rose/30 bg-glow-rose/5 px-3 py-2 text-[10px] text-glow-rose">
              {(createWorld.error as Error).message}
            </div>
          ) : null}
        </form>
      </section>

      {/* WORLDS LIST */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="page-eyebrow">Active worlds</h2>
          <span className="text-[10px] text-zinc-500">
            {worlds.data?.length ?? 0} world{(worlds.data?.length ?? 0) === 1 ? "" : "s"}
          </span>
        </div>

        {worlds.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-32 rounded-lg" />
            ))}
          </div>
        ) : worlds.data && worlds.data.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {worlds.data.map((w) => {
              const aliveFraction = w.alive_count / Math.max(1, w.minion_count);
              return (
                <div
                  key={w.id}
                  className="group relative overflow-hidden rounded-lg border border-glow-purple/15 bg-gradient-to-br from-ink-1/95 to-ink-2/50 p-4 shadow-panel transition hover:border-glow-purple/50 hover:shadow-glow"
                >
                  <Link to={`/worlds/${w.id}`} className="absolute inset-0 z-0" aria-label={w.name} />
                  <div
                    className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-30 transition group-hover:opacity-60"
                    style={{
                      background:
                        "radial-gradient(circle, rgba(168,85,247,0.4), transparent 70%)",
                    }}
                  />
                  <div className="relative flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-base font-medium text-zinc-100">
                        {w.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-zinc-500">
                        <span className="font-mono text-glow-purple">{w.seed_class}</span>
                        <span>·</span>
                        <span>cap {w.population_cap}</span>
                      </div>
                    </div>
                    <span
                      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[8px] uppercase tracking-widest ${
                        w.auto_advance
                          ? "border-glow-jade/40 bg-glow-jade/5 text-glow-jade"
                          : "border-zinc-700 bg-zinc-800/40 text-zinc-500"
                      }`}
                    >
                      <Radio
                        size={9}
                        className={w.auto_advance ? "animate-pulse" : ""}
                      />
                      {w.auto_advance ? "live" : "paused"}
                    </span>
                  </div>

                  {/* metrics row */}
                  <div className="relative mt-4 grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[8px] uppercase tracking-widest text-zinc-500">Tick</div>
                      <div className="font-display text-lg font-light text-glow-amber">
                        {w.tick.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase tracking-widest text-zinc-500">Alive</div>
                      <div className="font-display text-lg font-light text-glow-jade">
                        {w.alive_count}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase tracking-widest text-zinc-500">Total</div>
                      <div className="font-display text-lg font-light text-zinc-300">
                        {w.minion_count}
                      </div>
                    </div>
                  </div>

                  {/* alive progress */}
                  <div className="relative mt-3">
                    <div className="flex justify-between text-[8px] uppercase tracking-widest text-zinc-500">
                      <span>Population</span>
                      <span>{Math.round(aliveFraction * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-3">
                      <div
                        className="h-full bg-gradient-to-r from-glow-jade to-glow-teal transition-all"
                        style={{ width: `${Math.round(aliveFraction * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="relative mt-3 flex justify-between text-[9px] text-zinc-500">
                    <span>{w.auto_advance_interval_s.toFixed(1)}s / tick</span>
                    <span>{new Date(w.created_at).toLocaleDateString()}</span>
                  </div>

                  <div className="relative mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (
                          window.confirm(
                            `Delete world "${w.name}" and ${w.minion_count} minions? This cannot be undone.`,
                          )
                        ) {
                          deleteWorld.mutate(w.id);
                        }
                      }}
                      disabled={deleteWorld.isPending}
                      className="relative z-10 inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-500 transition hover:border-glow-rose/40 hover:bg-glow-rose/5 hover:text-glow-rose disabled:opacity-40"
                      title="Delete world"
                    >
                      <Trash2 size={10} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon={<Sparkles size={20} />}
              title="No worlds forged yet"
              hint="Pick a CPC class above and forge your first world. The simulation will start paused — toggle auto-advance to evolve it."
            />
          </div>
        )}
      </section>
    </div>
  );
}
