import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Pause, Play, Radio, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import Heightmap from "@/components/Heightmap";
import MinionDrawer from "@/components/MinionDrawer";
import MoodBar from "@/components/MoodBar";
import Sparkline from "@/components/Sparkline";
import { useWorldStream } from "@/lib/hooks";
import type { Mood, TaskStatus } from "@/lib/types";

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "border-zinc-700 text-zinc-400",
  running: "border-glow-sky text-glow-sky",
  needs_peer_review: "border-glow-amber text-glow-amber",
  needs_safety_review: "border-glow-rose text-glow-rose",
  approved: "border-glow-jade text-glow-jade",
  rejected: "border-glow-rose/60 text-glow-rose/80",
  failed: "border-zinc-600 text-zinc-500",
};

const MOOD_DOT: Record<Mood, string> = {
  flow: "bg-glow-jade",
  inspired: "bg-glow-sky",
  content: "bg-glow-purple",
  bored: "bg-zinc-400",
  anxious: "bg-glow-amber",
  exhausted: "bg-orange-500",
  despairing: "bg-glow-rose",
};

export default function WorldDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selectedMinion, setSelectedMinion] = useState<string | null>(null);
  const [aliveOnly, setAliveOnly] = useState(true);

  const world = useQuery({
    queryKey: ["world", id],
    queryFn: () => api.getWorld(id),
    refetchInterval: 4000,
  });
  const map = useQuery({ queryKey: ["world", id, "map"], queryFn: () => api.getWorldMap(id) });
  const minions = useQuery({
    queryKey: ["world", id, "minions", aliveOnly],
    queryFn: () => api.listMinions(id, { alive: aliveOnly, limit: 300 }),
    refetchInterval: 4000,
  });
  const events = useQuery({
    queryKey: ["world", id, "events"],
    queryFn: () => api.listEvents(id, 50),
    refetchInterval: 4000,
  });
  const inventions = useQuery({
    queryKey: ["world", id, "inventions"],
    queryFn: () => api.listInventions(id),
    refetchInterval: 4000,
  });
  const pop = useQuery({
    queryKey: ["world", id, "population"],
    queryFn: () => api.population(id, 60),
    refetchInterval: 4000,
  });

  const stream = useWorldStream(id, !!world.data?.auto_advance);

  const [ticks, setTicks] = useState(5);
  const advance = useMutation({
    mutationFn: () => api.advance(id, ticks),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["world", id] }),
  });

  const autoToggle = useMutation({
    mutationFn: (next: boolean) => api.setAutoAdvance(id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["world", id] }),
  });

  const aliveSeries = useMemo(() => pop.data?.history.map((s) => s.alive) ?? [], [pop.data]);
  const birthsSeries = useMemo(() => pop.data?.history.map((s) => s.births) ?? [], [pop.data]);
  const deathsSeries = useMemo(() => pop.data?.history.map((s) => s.deaths) ?? [], [pop.data]);
  const approvedSeries = useMemo(() => pop.data?.history.map((s) => s.inventions_approved) ?? [], [pop.data]);

  if (world.isLoading) return <div className="text-[11px] text-zinc-500">Loading…</div>;
  if (world.isError || !world.data) return <div className="text-[11px] text-glow-rose">World not found.</div>;

  const inventionsByStatus = (inventions.data || []).reduce<Record<string, number>>(
    (acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className={`space-y-6 ${selectedMinion ? "pr-[480px]" : ""}`}>
      <div className="flex items-center gap-4">
        <Link to="/" className="btn-ghost">
          <ChevronLeft size={12} />
          Worlds
        </Link>
        <div className="flex-1">
          <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">{world.data.name}</h1>
          <div className="text-[10px] text-zinc-500">
            seed_class={world.data.seed_class} · tick={world.data.tick} ·
            alive={world.data.alive_count}/{world.data.minion_count} ·
            cap={world.data.population_cap}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] uppercase tracking-widest ${
              world.data.auto_advance ? "border-glow-jade/40 text-glow-jade" : "border-zinc-700 text-zinc-500"
            }`}
          >
            <Radio size={10} className={stream.connected ? "animate-pulse" : ""} />
            {world.data.auto_advance ? "live" : "paused"}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => autoToggle.mutate(!world.data.auto_advance)}
            disabled={autoToggle.isPending}
          >
            {world.data.auto_advance ? <Pause size={11} /> : <Play size={11} />}
            {world.data.auto_advance ? "Pause" : "Start auto"}
          </button>
          <input
            type="number"
            min={1}
            max={20}
            value={ticks}
            onChange={(e) => setTicks(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="input w-16 text-center"
          />
          <button
            type="button"
            className="btn"
            disabled={advance.isPending}
            onClick={() => advance.mutate()}
          >
            <RefreshCw size={11} className={advance.isPending ? "animate-spin" : ""} />
            {advance.isPending ? "Advancing…" : `+${ticks}`}
          </button>
        </div>
      </div>

      {/* Population stats row */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel p-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">Alive</div>
          <div className="text-2xl text-glow-jade">{pop.data?.alive ?? world.data.alive_count}</div>
          <Sparkline values={aliveSeries} width={200} height={36} stroke="#10b981" fill="rgba(16,185,129,0.15)" />
        </div>
        <div className="panel p-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">Births / tick</div>
          <div className="text-2xl text-glow-sky">
            {birthsSeries.length ? birthsSeries[birthsSeries.length - 1] : 0}
          </div>
          <Sparkline values={birthsSeries} width={200} height={36} stroke="#0ea5e9" fill="rgba(14,165,233,0.15)" />
        </div>
        <div className="panel p-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">Deaths / tick</div>
          <div className="text-2xl text-glow-rose">
            {deathsSeries.length ? deathsSeries[deathsSeries.length - 1] : 0}
          </div>
          <Sparkline values={deathsSeries} width={200} height={36} stroke="#f43f5e" fill="rgba(244,63,94,0.15)" />
        </div>
        <div className="panel p-3">
          <div className="text-[9px] uppercase tracking-widest text-zinc-500">Approvals / tick</div>
          <div className="text-2xl text-glow-amber">
            {approvedSeries.length ? approvedSeries[approvedSeries.length - 1] : 0}
          </div>
          <Sparkline values={approvedSeries} width={200} height={36} stroke="#f59e0b" fill="rgba(245,158,11,0.15)" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        <section className="panel w-fit">
          <div className="panel-header">
            <span>World map</span>
            <span className="text-zinc-500">biome={map.data?.biome_hint ?? "…"}</span>
          </div>
          <div className="p-4">
            {map.data ? <Heightmap grid={map.data.heightmap} size={288} /> : <div className="h-72 w-72 animate-pulse bg-ink-2" />}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <span>Society pulse</span>
            <span className="text-zinc-500">gen {pop.data?.generations ?? 0} · avg age {pop.data?.avg_age?.toFixed(0) ?? "–"}</span>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Mood</div>
              <div className="mt-2"><MoodBar breakdown={pop.data?.mood_breakdown ?? {}} /></div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Guild breakdown</div>
              <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] sm:grid-cols-3">
                {Object.entries(pop.data?.guild_breakdown ?? {}).map(([g, n]) => (
                  <li key={g} className="flex justify-between">
                    <span className="text-zinc-400">{g}</span>
                    <span className="text-glow-purple">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Invention pipeline</div>
              <ul className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                {Object.entries(inventionsByStatus).map(([status, n]) => (
                  <li
                    key={status}
                    className={`flex items-center justify-between rounded border px-2 py-1 ${STATUS_BADGE[status as TaskStatus]}`}
                  >
                    <span>{status.replace(/_/g, " ")}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="panel">
          <div className="panel-header">
            <span>Population</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px]">
                <input
                  type="checkbox"
                  checked={aliveOnly}
                  onChange={(e) => setAliveOnly(e.target.checked)}
                />
                alive only
              </label>
              <span className="text-zinc-500">{minions.data?.length ?? 0}</span>
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-2">
            <div className="grid grid-cols-[1fr_60px_50px_50px_50px_18px] gap-2 border-b border-glow-purple/10 px-2 pb-1 text-[9px] uppercase tracking-widest text-zinc-500">
              <span>Name</span>
              <span>Guild</span>
              <span className="text-right">Gen</span>
              <span className="text-right">Rep</span>
              <span className="text-right">Age</span>
              <span></span>
            </div>
            <ul className="divide-y divide-glow-purple/5">
              {(minions.data ?? []).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedMinion(m.id)}
                    className={`grid w-full grid-cols-[1fr_60px_50px_50px_50px_18px] items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-glow-purple/5 ${
                      m.alive ? "" : "opacity-60"
                    }`}
                  >
                    <span className="truncate">
                      {m.name} <span className="text-zinc-500">{m.surname}</span>
                    </span>
                    <span className="truncate text-[9px] uppercase tracking-widest text-zinc-400">{m.guild}</span>
                    <span className="text-right text-glow-purple">{m.generation}</span>
                    <span className="text-right text-glow-jade">{m.reputation.toFixed(1)}</span>
                    <span className="text-right text-zinc-400">{m.age}</span>
                    <span className={`inline-block h-2 w-2 rounded-full ${MOOD_DOT[m.mood]}`} title={m.mood} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <span>Recent events</span>
            <span className="text-zinc-500">{events.data?.length ?? 0}</span>
          </div>
          <ul className="max-h-[520px] divide-y divide-glow-purple/10 overflow-y-auto">
            {/* Live stream events at top */}
            {stream.events.slice(0, 10).map((e, i) => (
              <li key={`stream-${i}`} className="grid grid-cols-[40px_140px_1fr] gap-2 bg-glow-purple/5 px-3 py-1 text-[10px]">
                <span className="text-glow-amber">t{e.tick ?? "?"}</span>
                <span className="text-glow-sky">{e.kind}</span>
                <span className="truncate text-zinc-400">
                  {String(((e.payload as Record<string, unknown>) || {}).summary ?? "")}
                </span>
              </li>
            ))}
            {(events.data ?? []).slice(0, 40).map((e) => (
              <li key={e.id} className="grid grid-cols-[40px_140px_1fr] gap-2 px-3 py-1 text-[10px]">
                <span className="text-glow-amber">t{e.tick}</span>
                <span className="text-glow-sky">{e.kind}</span>
                <span className="truncate text-zinc-400">
                  {String((e.payload && e.payload.summary) || (e.payload && e.payload.name) || "")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {selectedMinion ? (
        <MinionDrawer minionId={selectedMinion} onClose={() => setSelectedMinion(null)} />
      ) : null}
    </div>
  );
}
