import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ChevronLeft, Heart, Pause, Play, Radio, RefreshCw, Skull,
  Sparkles, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import GuildBadge from "@/components/ui/GuildBadge";
import MinionDrawer from "@/components/MinionDrawer";
import MoodBar from "@/components/MoodBar";
import RoleBadge from "@/components/ui/RoleBadge";
import Sparkline from "@/components/Sparkline";
import StatCard from "@/components/ui/StatCard";
import Tabs from "@/components/ui/Tabs";
import WorldSystems from "@/components/WorldSystems";
import WorldScene3D from "@/components/scene/WorldScene3D";
import PixelStreamingViewer from "@/components/scene/PixelStreamingViewer";
import { useWorldStream } from "@/lib/hooks";
import type { Guild, Mood, SwarmRole, TaskStatus } from "@/lib/types";

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "border-zinc-700 text-zinc-400",
  running: "border-glow-sky/40 text-glow-sky",
  needs_peer_review: "border-glow-amber/40 text-glow-amber",
  needs_safety_review: "border-glow-rose/40 text-glow-rose",
  approved: "border-glow-jade/40 text-glow-jade",
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

type View = "overview" | "population" | "events" | "systems";

export default function WorldDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selectedMinion, setSelectedMinion] = useState<string | null>(null);
  // Gameplay camera/control toggles for the selected minion. Follow eases the
  // orbit camera onto the minion; override hands WASD control to the user.
  const [followCam, setFollowCam] = useState(true);
  const [overrideCtl, setOverrideCtl] = useState(false);
  const [aliveOnly, setAliveOnly] = useState(true);
  const [guildFilter, setGuildFilter] = useState<Guild | "all">("all");
  const [roleFilter, setRoleFilter] = useState<SwarmRole | "all">("all");
  const [view, setView] = useState<View>("overview");
  // Renderer tier: "webgl" runs the in-browser Three.js scene (free, low-spec).
  // "pixelstream" embeds an Unreal Engine 5 stream from a GPU host — same
  // technique Fortnite UEFN previews / GeForce Now / Roblox Studio web use.
  // The streamer URL is configurable so different deployments can point at
  // different GPU hosts (e.g. projectsolar.cloud once Pixel Streaming is up).
  const [renderTier, setRenderTier] = useState<"webgl" | "pixelstream">("webgl");
  // Pre-wired to the existing GPU host (projectsolar.cloud). Override per-deploy
  // with VITE_UNDERWORLD_PIXELSTREAM_URL. The "Stream UE5" toggle uses this; it
  // connects the instant a Pixel-Streaming signaling server + UE5 client are
  // live there, and shows a clear error if the GPU host is down.
  const pixelStreamUrl =
    (import.meta.env.VITE_UNDERWORLD_PIXELSTREAM_URL as string | undefined) ||
    "https://projectsolar.cloud/pixelstream/";

  const world = useQuery({
    queryKey: ["world", id],
    queryFn: () => api.getWorld(id),
    refetchInterval: 4000,
  });
  const map = useQuery({ queryKey: ["world", id, "map"], queryFn: () => api.getWorldMap(id) });
  const minions = useQuery({
    queryKey: ["world", id, "minions", aliveOnly],
    queryFn: () => api.listMinions(id, { alive: aliveOnly, limit: 400 }),
    refetchInterval: 4000,
  });
  const events = useQuery({
    queryKey: ["world", id, "events"],
    queryFn: () => api.listEvents(id, 80),
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
  const actions = useQuery({
    queryKey: ["world", id, "latest-actions"],
    queryFn: () => api.latestActions(id, 3),
    refetchInterval: 3000,
  });
  const climate = useQuery({
    queryKey: ["world", id, "climate", world.data?.tick],
    queryFn: () => api.climate(id),
    enabled: !!world.data,
  });
  const thoughts = useQuery({
    queryKey: ["world", id, "latest-thoughts"],
    queryFn: () => api.latestThoughts(id, 3),
    refetchInterval: 4000,
  });

  const stream = useWorldStream(id, !!world.data?.auto_advance);

  const [ticks, setTicks] = useState(5);
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["world", id] });
    // The sidebar + Population + CommandCentre all read ["worlds"]; without
    // this they show stale tick / auto_advance until the next 5s poll.
    qc.invalidateQueries({ queryKey: ["worlds"] });
  };
  const advance = useMutation({
    mutationFn: () => api.advance(id, ticks),
    onSuccess: invalidateAll,
  });
  const autoToggle = useMutation({
    mutationFn: (next: boolean) => api.setAutoAdvance(id, next),
    onSuccess: invalidateAll,
  });

  // Autopilot: a never-run world (tick 0) that's somehow paused gets started the
  // moment you open it, so the simulation runs hands-free with no manual ticking.
  // A world you deliberately paused mid-run (tick > 0) is left as you set it.
  const autostarted = useRef<Set<string>>(new Set());
  useEffect(() => {
    const w = world.data;
    if (w && !w.auto_advance && w.tick === 0 && !autostarted.current.has(w.id)) {
      autostarted.current.add(w.id);
      autoToggle.mutate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.data?.id, world.data?.auto_advance, world.data?.tick]);

  // Deselecting returns to free orbit and releases any override control.
  useEffect(() => {
    if (!selectedMinion) {
      setFollowCam(true);
      setOverrideCtl(false);
    }
  }, [selectedMinion]);
  // ESC releases override control without deselecting.
  useEffect(() => {
    if (!overrideCtl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOverrideCtl(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overrideCtl]);

  // OVERRIDE PILLAR (Bible §4.4) — server-authoritative possession. Toggling override ON posts
  // /possess (the colony's awareness rises and every renderer, WebGL + UE5, agrees who is worn);
  // toggling OFF / deselecting / ESC posts /release. A ref tracks the worn body so release still
  // fires after the minion is deselected.
  const possessedRef = useRef<string | null>(null);
  useEffect(() => {
    const wear = overrideCtl ? selectedMinion : null;
    if (wear && possessedRef.current !== wear) {
      possessedRef.current = wear;
      api.possess(wear).catch(() => {});
    } else if (!wear && possessedRef.current) {
      const prev = possessedRef.current;
      possessedRef.current = null;
      api.release(prev).catch(() => {});
    }
  }, [overrideCtl, selectedMinion]);
  // release on unmount (navigating away while still wearing a body).
  useEffect(() => () => {
    if (possessedRef.current) { api.release(possessedRef.current).catch(() => {}); possessedRef.current = null; }
  }, []);

  const selectedMinionData = useMemo(
    () => (minions.data ?? []).find((m) => m.id === selectedMinion) ?? null,
    [minions.data, selectedMinion],
  );

  const aliveSeries = useMemo(() => pop.data?.history.map((s) => s.alive) ?? [], [pop.data]);
  const birthsSeries = useMemo(() => pop.data?.history.map((s) => s.births) ?? [], [pop.data]);
  const deathsSeries = useMemo(() => pop.data?.history.map((s) => s.deaths) ?? [], [pop.data]);
  const approvedSeries = useMemo(() => pop.data?.history.map((s) => s.inventions_approved) ?? [], [pop.data]);

  const filteredMinions = useMemo(() => {
    const list = minions.data ?? [];
    return list.filter(
      (m) =>
        (guildFilter === "all" || m.guild === guildFilter) &&
        (roleFilter === "all" || m.swarm_role === roleFilter),
    );
  }, [minions.data, guildFilter, roleFilter]);

  if (world.isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-2/3 rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-lg" />)}
        </div>
      </div>
    );
  }
  if (world.isError || !world.data) {
    return <div className="text-[11px] text-glow-rose">World not found.</div>;
  }

  const inventionsByStatus = (inventions.data || []).reduce<Record<string, number>>(
    (acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    },
    {},
  );

  const totalAlive = world.data.alive_count;
  const totalPop = world.data.minion_count;

  return (
    <div className={`space-y-6 transition-all ${selectedMinion ? "pr-[500px]" : ""}`}>
      {/* PAUSED CTA — without auto_advance the simulation stays at tick 0
          and minions never reach breeding age. Loud banner so it's the
          first thing you notice on a fresh world. */}
      {!world.data.auto_advance ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-glow-amber/40 bg-glow-amber/5 p-4 shadow-glow">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-glow-amber/50 bg-glow-amber/10 p-2 text-glow-amber">
              <Pause size={14} />
            </div>
            <div>
              <div className="font-display text-sm font-medium text-glow-amber">
                World is paused at tick {world.data.tick}
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Minions only breed, fork, and invent while the scheduler is running.
                Press <span className="font-mono text-glow-amber">▶</span> to start ticking
                (1 tick ≈ {world.data.auto_advance_interval_s.toFixed(1)}s).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => autoToggle.mutate(true)}
            disabled={autoToggle.isPending}
          >
            <Play size={12} />
            Start ticking
          </button>
        </div>
      ) : null}

      {/* HERO HEADER */}
      <header className="panel-elevated overflow-hidden">
        <div className="relative flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 70% 30%, rgba(168,85,247,0.10), transparent 60%)",
            }}
          />
          <div className="relative flex items-center gap-4">
            <Link to="/" className="btn-icon">
              <ChevronLeft size={14} />
            </Link>
            <div>
              <div className="page-eyebrow">World</div>
              <h1 className="mt-0.5 font-display text-2xl font-light tracking-tight text-zinc-100">
                {world.data.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                <span className="font-mono text-glow-purple">{world.data.seed_class}</span>
                <span>·</span>
                <span>tick <span className="text-glow-amber">{world.data.tick}</span></span>
                <span>·</span>
                <span>cap {world.data.population_cap}</span>
                <span>·</span>
                <span>biome <span className="text-glow-sky">{map.data?.biome_hint ?? "…"}</span></span>
                <span>·</span>
                <span className="rounded-md border border-glow-jade/40 bg-glow-jade/10 px-1.5 py-0.5 text-glow-jade uppercase tracking-widest">
                  {world.data.era ?? "stone"} age
                </span>
                <span>·</span>
                <span>
                  scanner{" "}
                  <span className={world.data.scanner_progress >= 100 ? "text-glow-jade" : "text-glow-amber"}>
                    {world.data.scanner_progress ?? 0}/100
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="relative ml-auto flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[9px] uppercase tracking-widest ${
                world.data.auto_advance
                  ? "border-glow-jade/40 bg-glow-jade/5 text-glow-jade"
                  : "border-zinc-700 bg-zinc-800/40 text-zinc-500"
              }`}
            >
              <Radio size={10} className={stream.connected ? "animate-pulse" : ""} />
              {world.data.auto_advance ? "live" : "paused"}
              {stream.connected ? " · streaming" : ""}
            </span>
            <button
              type="button"
              className={world.data.auto_advance ? "btn-danger" : "btn-primary"}
              onClick={() => autoToggle.mutate(!world.data.auto_advance)}
              disabled={autoToggle.isPending}
            >
              {world.data.auto_advance ? <Pause size={11} /> : <Play size={11} />}
              {world.data.auto_advance ? "Pause" : "Start"}
            </button>
            <div className="flex items-center gap-0">
              <input
                type="number"
                min={1}
                max={20}
                value={ticks}
                onChange={(e) => setTicks(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="input w-14 rounded-r-none text-center font-mono"
              />
              <button
                type="button"
                className="btn rounded-l-none"
                disabled={advance.isPending}
                onClick={() => advance.mutate()}
              >
                <RefreshCw size={11} className={advance.isPending ? "animate-spin" : ""} />
                {advance.isPending ? "…" : `+${ticks}`}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* STAT CARDS */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Alive"
          value={totalAlive}
          hint={`${Math.round((totalAlive / Math.max(1, totalPop)) * 100)}% of ${totalPop}`}
          icon={<Heart size={14} />}
          series={aliveSeries}
          stroke="#10b981"
          fill="rgba(16,185,129,0.15)"
          accent="jade"
        />
        <StatCard
          label="Births / tick"
          value={birthsSeries.length ? birthsSeries[birthsSeries.length - 1] : 0}
          hint="latest snapshot"
          icon={<Sparkles size={14} />}
          series={birthsSeries}
          stroke="#0ea5e9"
          fill="rgba(14,165,233,0.15)"
          accent="sky"
        />
        <StatCard
          label="Deaths / tick"
          value={deathsSeries.length ? deathsSeries[deathsSeries.length - 1] : 0}
          hint="latest snapshot"
          icon={<Skull size={14} />}
          series={deathsSeries}
          stroke="#f43f5e"
          fill="rgba(244,63,94,0.15)"
          accent="rose"
        />
        <StatCard
          label="Approvals / tick"
          value={approvedSeries.length ? approvedSeries[approvedSeries.length - 1] : 0}
          hint={`gen ${pop.data?.generations ?? 0} · avg age ${pop.data?.avg_age?.toFixed(0) ?? "–"}`}
          icon={<Activity size={14} />}
          series={approvedSeries}
          stroke="#f59e0b"
          fill="rgba(245,158,11,0.15)"
          accent="amber"
        />
      </section>

      {/* TABS */}
      <Tabs
        active={view}
        onChange={(v) => setView(v)}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "population", label: "Population", count: minions.data?.length },
          { id: "systems", label: "Systems" },
          { id: "events", label: "Events", count: events.data?.length },
        ]}
      />

      {view === "systems" ? (
        <WorldSystems worldId={id} tick={world.data.tick} />
      ) : null}

      {/* OVERVIEW VIEW */}
      {view === "overview" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
          <section className="panel">
            <div className="panel-header">
              <span>World</span>
              <span className="flex items-center gap-3">
                <span>{filteredMinions.filter((m) => m.alive).length} alive · {world.data.seed_class}</span>
                <span className="flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1 py-0.5 text-[9px] uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => setRenderTier("webgl")}
                    className={`px-2 py-0.5 rounded ${renderTier === "webgl" ? "bg-glow-jade/30 text-glow-jade" : "text-zinc-500"}`}
                  >
                    webgl
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenderTier("pixelstream")}
                    disabled={!pixelStreamUrl}
                    title={pixelStreamUrl ? "Stream UE5 from GPU host" : "Set VITE_UNDERWORLD_PIXELSTREAM_URL to enable"}
                    className={`px-2 py-0.5 rounded ${renderTier === "pixelstream" ? "bg-glow-amber/30 text-glow-amber" : "text-zinc-500"} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    ue5 ▶
                  </button>
                </span>
              </span>
            </div>
            <div className="p-4">
              {renderTier === "pixelstream" && pixelStreamUrl ? (
                <PixelStreamingViewer
                  signalingUrl={pixelStreamUrl}
                  worldId={id}
                  width={900}
                  height={560}
                />
              ) : map.data ? (
                <div className="relative" style={{ width: 900, height: 560 }}>
                  <WorldScene3D
                    grid={map.data.heightmap}
                    minions={minions.data ?? []}
                    tick={world.data.tick}
                    seed={world.data.seed_value}
                    selectedId={selectedMinion}
                    onSelect={(mid) => setSelectedMinion(mid || null)}
                    width={900}
                    height={560}
                    actionByMinion={actions.data?.actions}
                    thoughtByMinion={thoughts.data?.thoughts}
                    biomeHint={map.data.biome_hint}
                    weatherOverride={climate.data?.weather}
                    season={climate.data?.season}
                    temperature={climate.data?.temperature}
                    followCam={followCam}
                    overrideCtl={overrideCtl}
                  />
                  {/* Selection HUD — name/guild + camera/control toggles. */}
                  {selectedMinionData ? (
                    <div className="panel absolute left-3 top-3 w-56 p-3 text-[11px]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-display text-sm font-medium text-zinc-100">
                            {selectedMinionData.name} {selectedMinionData.surname}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="badge badge-purple">{selectedMinionData.guild}</span>
                            <span className="badge badge-zinc">{selectedMinionData.mood}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <label className="flex cursor-pointer items-center justify-between text-zinc-300">
                          <span>Follow camera</span>
                          <input
                            type="checkbox"
                            checked={followCam}
                            onChange={(e) => setFollowCam(e.target.checked)}
                            className="accent-glow-sky"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center justify-between text-zinc-300">
                          <span>Override control <span className="text-zinc-500">(WASD)</span></span>
                          <input
                            type="checkbox"
                            checked={overrideCtl}
                            onChange={(e) => setOverrideCtl(e.target.checked)}
                            className="accent-glow-amber"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMinion(null)}
                        className="btn-ghost mt-3 w-full justify-center text-[11px]"
                      >
                        Deselect
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="skeleton h-[560px] w-[900px] rounded" />
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <span>Society pulse</span>
              <span>{pop.data?.history.length ?? 0} snapshots</span>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <div className="page-eyebrow text-[9px]">Mood distribution</div>
                <div className="mt-2"><MoodBar breakdown={pop.data?.mood_breakdown ?? {}} /></div>
              </div>
              <div>
                <div className="page-eyebrow text-[9px] mb-2">Guild breakdown</div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] sm:grid-cols-3">
                  {Object.entries(pop.data?.guild_breakdown ?? {}).map(([g, n]) => (
                    <li key={g} className="flex items-center justify-between">
                      <GuildBadge guild={g as Guild} size="xs" />
                      <span className="ml-2 text-glow-purple font-mono">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="page-eyebrow text-[9px] mb-2">Invention pipeline</div>
                {Object.keys(inventionsByStatus).length > 0 ? (
                  <ul className="grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-3">
                    {Object.entries(inventionsByStatus).map(([status, n]) => (
                      <li
                        key={status}
                        className={`flex items-center justify-between rounded-md border px-2 py-1.5 ${STATUS_BADGE[status as TaskStatus]}`}
                      >
                        <span className="capitalize">{status.replace(/_/g, " ")}</span>
                        <span className="font-mono">{n}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[10px] text-zinc-500">No inventions yet.</div>
                )}
              </div>
              <div>
                <div className="page-eyebrow text-[9px] mb-2">Population trend</div>
                <Sparkline values={aliveSeries} width={460} height={48} stroke="#10b981" fill="rgba(16,185,129,0.18)" />
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* POPULATION VIEW */}
      {view === "population" ? (
        <section className="panel">
          <div className="panel-header">
            <span>Population ({filteredMinions.length})</span>
            <div className="flex flex-wrap items-center gap-2 text-[10px] normal-case tracking-normal">
              <label className="flex items-center gap-1.5 text-zinc-400">
                <input
                  type="checkbox"
                  checked={aliveOnly}
                  onChange={(e) => setAliveOnly(e.target.checked)}
                  className="accent-glow-purple"
                />
                alive only
              </label>
              <select
                className="input input-sm w-auto"
                value={guildFilter}
                onChange={(e) => setGuildFilter(e.target.value as Guild | "all")}
              >
                <option value="all">all guilds</option>
                {Object.keys(pop.data?.guild_breakdown ?? {}).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <select
                className="input input-sm w-auto"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as SwarmRole | "all")}
              >
                <option value="all">all roles</option>
                {Object.keys(pop.data?.role_breakdown ?? {}).map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredMinions.length === 0 ? (
            <EmptyState
              icon={<Users size={20} />}
              title="No Minions match your filters"
              hint="Try clearing guild/role filters or toggling 'alive only'."
            />
          ) : (
            <ul className="max-h-[640px] divide-y divide-glow-purple/5 overflow-y-auto">
              <li className="sticky top-0 z-10 grid grid-cols-[36px_1fr_120px_100px_50px_50px_50px_18px] gap-2 border-b border-glow-purple/10 bg-ink-1/95 px-3 py-2 text-[9px] uppercase tracking-widest text-zinc-500 backdrop-blur">
                <span />
                <span>Name</span>
                <span>Guild</span>
                <span>Role</span>
                <span className="text-right">Gen</span>
                <span className="text-right">Rep</span>
                <span className="text-right">Age</span>
                <span />
              </li>
              {filteredMinions.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedMinion(m.id)}
                    className={`grid w-full grid-cols-[36px_1fr_120px_100px_50px_50px_50px_18px] items-center gap-2 px-3 py-2 text-left text-[11px] transition hover:bg-glow-purple/5 ${
                      m.alive ? "" : "opacity-50"
                    }`}
                  >
                    <Avatar seed={m.id} size={26} alive={m.alive} />
                    <span className="truncate">
                      <span className="text-zinc-100">{m.name}</span>{" "}
                      <span className="text-zinc-500">{m.surname}</span>
                      {!m.alive ? <span className="ml-1 text-[9px] text-glow-rose">†</span> : null}
                    </span>
                    <GuildBadge guild={m.guild} size="xs" />
                    <RoleBadge role={m.swarm_role} size="xs" withLabel={false} />
                    <span className="text-right text-glow-purple font-mono">{m.generation}</span>
                    <span className="text-right text-glow-jade font-mono">{m.reputation.toFixed(1)}</span>
                    <span className="text-right text-zinc-400 font-mono">{m.age}</span>
                    <span className={`inline-block h-2 w-2 rounded-full ${MOOD_DOT[m.mood]}`} title={m.mood} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* EVENTS VIEW */}
      {view === "events" ? (
        <section className="panel">
          <div className="panel-header">
            <span>Live events</span>
            <span>{(events.data?.length ?? 0) + stream.events.length}</span>
          </div>
          {(events.data?.length ?? 0) + stream.events.length === 0 ? (
            <EmptyState
              icon={<Activity size={20} />}
              title="No events yet"
              hint="Advance the world or toggle auto-advance to start producing events."
            />
          ) : (
            <ul className="max-h-[640px] divide-y divide-glow-purple/5 overflow-y-auto">
              {stream.events.slice(0, 10).map((e, i) => (
                <li
                  key={`stream-${i}`}
                  className="relative grid grid-cols-[44px_160px_1fr] gap-3 bg-glow-purple/5 px-4 py-1.5 text-[10px] animate-fade-in"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-glow-purple to-transparent" />
                  <span className="font-mono text-glow-amber">t{e.tick ?? "?"}</span>
                  <span className="truncate font-mono text-glow-sky">{e.kind}</span>
                  <span className="truncate text-zinc-400">
                    {String(((e.payload as Record<string, unknown>) || {}).summary ?? "")}
                  </span>
                </li>
              ))}
              {(events.data ?? []).slice(0, 80).map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-[44px_160px_1fr] gap-3 px-4 py-1.5 text-[10px] transition hover:bg-glow-purple/5"
                >
                  <span className="font-mono text-glow-amber">t{e.tick}</span>
                  <span className="truncate font-mono text-glow-sky">{e.kind}</span>
                  <span className="truncate text-zinc-400">
                    {String((e.payload && (e.payload as Record<string, unknown>).summary) ||
                      (e.payload && (e.payload as Record<string, unknown>).name) || "")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {selectedMinion ? (
        <MinionDrawer minionId={selectedMinion} onClose={() => setSelectedMinion(null)} />
      ) : null}
    </div>
  );
}
