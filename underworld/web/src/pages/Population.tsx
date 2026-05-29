import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Brain, Cpu, GitBranch, Heart, Skull, Sparkles, TrendingUp, Users,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";
import GuildBadge from "@/components/ui/GuildBadge";
import MoodBar from "@/components/MoodBar";
import RoleBadge from "@/components/ui/RoleBadge";
import Sparkline from "@/components/Sparkline";
import StatCard from "@/components/ui/StatCard";
import type { Guild, MinionListItem, SwarmRole } from "@/lib/types";

export default function Population() {
  const qc = useQueryClient();
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds });
  const [worldId, setWorldId] = useState<string | null>(null);
  const selected = worldId ?? worlds.data?.[0]?.id ?? null;

  const stats = useQuery({
    queryKey: ["world", selected, "population", 200],
    queryFn: () => api.population(selected!, 200),
    enabled: !!selected,
    refetchInterval: 4000,
  });
  const minions = useQuery({
    queryKey: ["world", selected, "minions", "alive", 100],
    queryFn: () => api.listMinions(selected!, { alive: true, limit: 100 }),
    enabled: !!selected,
    refetchInterval: 6000,
  });

  const invalidateMinions = () => {
    qc.invalidateQueries({ queryKey: ["world", selected, "minions"] });
    qc.invalidateQueries({ queryKey: ["world", selected, "population", 200] });
    qc.invalidateQueries({ queryKey: ["worlds"] });
  };
  const kill = useMutation({
    mutationFn: (id: string) => api.killMinion(id),
    onSuccess: invalidateMinions,
  });
  const fork = useMutation({
    mutationFn: (id: string) => api.fork(id),
    onSuccess: invalidateMinions,
  });

  const alive = stats.data?.history.map((s) => s.alive) ?? [];
  const births = stats.data?.history.map((s) => s.births) ?? [];
  const deaths = stats.data?.history.map((s) => s.deaths) ?? [];
  const forks = stats.data?.history.map((s) => s.forks) ?? [];
  const sanity = stats.data?.history.map((s) => s.avg_sanity) ?? [];
  const approvals = stats.data?.history.map((s) => s.inventions_approved) ?? [];

  const guildTotal = useMemo(() => {
    return Object.values(stats.data?.guild_breakdown ?? {}).reduce((a, b) => a + b, 0);
  }, [stats.data]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="page-eyebrow">Population</div>
        <h1 className="mt-1 page-title">Demographic dashboard</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Per-tick snapshots tracking births, deaths, forks, mood, guild & role distribution, and
          aggregate research-project progress. Pick a world below.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <span>World selector</span>
          <span>{worlds.data?.length ?? 0} active</span>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {(worlds.data ?? []).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWorldId(w.id)}
              className={`rounded-md border px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest transition ${
                selected === w.id
                  ? "border-glow-purple bg-glow-purple/10 text-glow-purple shadow-glow"
                  : "border-zinc-800 text-zinc-400 hover:border-glow-purple/40 hover:text-zinc-100"
              }`}
            >
              <span>{w.name}</span>
              <span className="ml-2 text-zinc-500">t{w.tick}</span>
              <span className="ml-2 text-glow-jade">{w.alive_count}</span>
            </button>
          ))}
        </div>
      </section>

      {selected && stats.data ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Alive"
              value={stats.data.alive.toLocaleString()}
              icon={<Heart size={14} />}
              series={alive}
              stroke="#10b981"
              fill="rgba(16,185,129,0.15)"
              accent="jade"
            />
            <StatCard
              label="Generations"
              value={stats.data.generations}
              icon={<GitBranch size={14} />}
              hint="max lineage depth"
              accent="purple"
            />
            <StatCard
              label="Avg age"
              value={stats.data.avg_age.toFixed(1)}
              icon={<Activity size={14} />}
              hint="ticks of life"
              accent="sky"
            />
            <StatCard
              label="Avg sanity"
              value={stats.data.avg_sanity.toFixed(2)}
              icon={<Brain size={14} />}
              series={sanity}
              stroke="#f59e0b"
              fill="rgba(245,158,11,0.15)"
              accent="amber"
            />
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="panel p-4 lg:col-span-2">
              <div className="page-eyebrow text-[9px] mb-3 flex items-center gap-1.5">
                <TrendingUp size={11} />
                Population flow
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1 text-glow-jade">
                      <Sparkles size={10} />
                      Births
                    </span>
                    <span className="font-mono text-zinc-300">
                      {births.length ? births[births.length - 1] : 0}
                    </span>
                  </div>
                  <Sparkline values={births} width={460} height={42} stroke="#10b981" fill="rgba(16,185,129,0.15)" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1 text-glow-rose">
                      <Skull size={10} />
                      Deaths
                    </span>
                    <span className="font-mono text-zinc-300">
                      {deaths.length ? deaths[deaths.length - 1] : 0}
                    </span>
                  </div>
                  <Sparkline values={deaths} width={460} height={42} stroke="#f43f5e" fill="rgba(244,63,94,0.15)" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1 text-glow-sky">
                      <Cpu size={10} />
                      Forks
                    </span>
                    <span className="font-mono text-zinc-300">
                      {forks.length ? forks[forks.length - 1] : 0}
                    </span>
                  </div>
                  <Sparkline values={forks} width={460} height={42} stroke="#0ea5e9" fill="rgba(14,165,233,0.15)" />
                </div>
              </div>
            </div>

            <div className="panel p-4">
              <div className="page-eyebrow text-[9px] mb-3">Inventions / tick</div>
              <Sparkline values={approvals} width={300} height={80} stroke="#f59e0b" fill="rgba(245,158,11,0.18)" />
              <div className="mt-4 page-eyebrow text-[9px]">Mood (latest tick)</div>
              <div className="mt-2"><MoodBar breakdown={stats.data.mood_breakdown} /></div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="panel">
              <div className="panel-header">
                <span className="flex items-center gap-1.5">
                  <Users size={11} />
                  Guild distribution
                </span>
                <span>{guildTotal} total</span>
              </div>
              <ul className="space-y-1 p-3">
                {Object.entries(stats.data.guild_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([g, n]) => {
                    const pct = (n / Math.max(1, guildTotal)) * 100;
                    return (
                      <li key={g} className="grid grid-cols-[140px_1fr_40px] items-center gap-2">
                        <GuildBadge guild={g as Guild} size="sm" />
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-3">
                          <div
                            className="h-full bg-gradient-to-r from-glow-purple to-glow-violet"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-right font-mono text-[10px] text-zinc-300">{n}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
            <div className="panel">
              <div className="panel-header">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={11} />
                  Swarm role distribution
                </span>
                <span>{Object.keys(stats.data.role_breakdown ?? {}).length} roles</span>
              </div>
              <ul className="space-y-1 p-3">
                {Object.entries(stats.data.role_breakdown ?? {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([r, n]) => {
                    const pct = (n / Math.max(1, guildTotal)) * 100;
                    return (
                      <li key={r} className="grid grid-cols-[180px_1fr_40px] items-center gap-2">
                        <RoleBadge role={r as SwarmRole} size="sm" />
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-3">
                          <div
                            className="h-full bg-gradient-to-r from-glow-sky to-glow-teal"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-right font-mono text-[10px] text-zinc-300">{n}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <StatCard
              label="Active research projects"
              value={stats.data.active_projects}
              icon={<GitBranch size={14} />}
              accent="amber"
            />
            <StatCard
              label="Approved projects"
              value={stats.data.approved_projects}
              icon={<Sparkles size={14} />}
              accent="jade"
            />
          </section>

          <MinionRoster
            minions={minions.data ?? []}
            onKill={(id) => {
              if (window.confirm("Prune this minion? Soul persists for reincarnation.")) {
                kill.mutate(id);
              }
            }}
            onFork={(id) => fork.mutate(id)}
            busy={kill.isPending || fork.isPending}
          />
        </>
      ) : (
        <div className="panel">
          <EmptyState
            icon={<Users size={20} />}
            title="Select a world above"
            hint="If none exist yet, create one from the Command Centre."
          />
        </div>
      )}
    </div>
  );
}

function MinionRoster({
  minions,
  onKill,
  onFork,
  busy,
}: {
  minions: MinionListItem[];
  onKill: (id: string) => void;
  onFork: (id: string) => void;
  busy: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...minions].sort(
        (a, b) => b.reputation - a.reputation || b.sanity - a.sanity,
      ),
    [minions],
  );
  return (
    <section className="panel">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          <Users size={11} />
          Living minions ({minions.length})
        </span>
        <span className="text-zinc-500">sorted by reputation</span>
      </div>
      {sorted.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="No living minions"
          hint="Advance the world from the Command Centre."
        />
      ) : (
        <ul className="max-h-[420px] divide-y divide-glow-purple/5 overflow-y-auto">
          {sorted.slice(0, 60).map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-[1fr_120px_70px_70px_auto] items-center gap-3 px-4 py-2 text-[11px] transition hover:bg-glow-purple/5"
            >
              <div className="min-w-0">
                <div className="truncate text-zinc-100">
                  {m.name} {m.surname}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[9px]">
                  <GuildBadge guild={m.guild} size="xs" />
                  <RoleBadge role={m.swarm_role} size="xs" />
                  <span className="text-zinc-500">gen {m.generation}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[10px] text-glow-purple">
                  rep {m.reputation.toFixed(2)}
                </div>
                <div className="font-mono text-[9px] text-zinc-500">
                  age {m.age}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] uppercase tracking-widest text-zinc-500">
                  Sanity
                </div>
                <div
                  className={`font-mono text-[10px] ${
                    m.sanity < 0.4
                      ? "text-glow-rose"
                      : m.sanity < 0.6
                        ? "text-glow-amber"
                        : "text-glow-jade"
                  }`}
                >
                  {m.sanity.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] uppercase tracking-widest text-zinc-500">
                  Health
                </div>
                <div className="font-mono text-[10px] text-zinc-300">
                  {m.health.toFixed(2)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onFork(m.id)}
                  disabled={busy}
                  title="Fork digital clone"
                  className="inline-flex items-center gap-1 rounded border border-zinc-800 px-1.5 py-1 text-[9px] uppercase tracking-widest text-zinc-400 transition hover:border-glow-sky/40 hover:bg-glow-sky/5 hover:text-glow-sky disabled:opacity-40"
                >
                  <Zap size={9} />
                  Fork
                </button>
                <button
                  type="button"
                  onClick={() => onKill(m.id)}
                  disabled={busy}
                  title="Prune (soul persists)"
                  className="inline-flex items-center gap-1 rounded border border-zinc-800 px-1.5 py-1 text-[9px] uppercase tracking-widest text-zinc-400 transition hover:border-glow-rose/40 hover:bg-glow-rose/5 hover:text-glow-rose disabled:opacity-40"
                >
                  <Skull size={9} />
                  Prune
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
