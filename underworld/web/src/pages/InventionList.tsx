import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Filter, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";
import StatCard from "@/components/ui/StatCard";
import type { Invention, TaskStatus } from "@/lib/types";

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "border-zinc-700 text-zinc-400",
  running: "border-glow-sky/40 text-glow-sky",
  needs_peer_review: "border-glow-amber/40 text-glow-amber",
  needs_safety_review: "border-glow-rose/40 text-glow-rose",
  approved: "border-glow-jade/40 text-glow-jade",
  rejected: "border-glow-rose/60 text-glow-rose/80",
  failed: "border-zinc-600 text-zinc-500",
};

const ALL_STATUSES: TaskStatus[] = [
  "pending", "running", "needs_peer_review", "needs_safety_review",
  "approved", "rejected", "failed",
];

export default function InventionList() {
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds });
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");

  const items = useQuery({
    queryKey: ["inventions", "all", worlds.data?.map((w) => w.id).join(",")],
    queryFn: async (): Promise<Invention[]> => {
      if (!worlds.data) return [];
      const buckets = await Promise.all(worlds.data.map((w) => api.listInventions(w.id)));
      return buckets.flat().sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
    enabled: !!worlds.data,
  });

  const stats = useMemo(() => {
    const list = items.data ?? [];
    return {
      total: list.length,
      approved: list.filter((i) => i.status === "approved").length,
      pending: list.filter((i) => ["needs_peer_review", "needs_safety_review", "pending", "running"].includes(i.status)).length,
      rejected: list.filter((i) => ["rejected", "failed"].includes(i.status)).length,
    };
  }, [items.data]);

  const filtered = useMemo(
    () => (items.data ?? []).filter((i) => statusFilter === "all" || i.status === statusFilter),
    [items.data, statusFilter],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="page-eyebrow">Inventions</div>
        <h1 className="mt-1 page-title">Cross-world invention log</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Every invention from every world, sorted by recency. Status reflects the peer + safety
          review outcome. Approved inventions touching regulated domains auto-escalate to research
          projects.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} accent="purple" icon={<Sparkles size={14} />} />
        <StatCard label="Approved" value={stats.approved} accent="jade" />
        <StatCard label="In review" value={stats.pending} accent="amber" />
        <StatCard label="Rejected" value={stats.rejected} accent="rose" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <span className="flex items-center gap-1.5">
            <Filter size={11} />
            Filter
          </span>
          <span>{filtered.length} of {items.data?.length ?? 0}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 p-3">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-widest ${
              statusFilter === "all"
                ? "border-glow-purple bg-glow-purple/10 text-glow-purple"
                : "border-zinc-800 text-zinc-400 hover:border-glow-purple/40"
            }`}
          >
            All
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-widest ${
                statusFilter === s
                  ? STATUS_BADGE[s] + " bg-current/5"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span>All inventions</span>
          <span>{filtered.length}</span>
        </div>
        {filtered.length > 0 ? (
          <ul className="divide-y divide-glow-purple/5">
            {filtered.map((inv) => (
              <li key={inv.id}>
                <Link
                  to={`/inventions/${inv.id}`}
                  className="grid grid-cols-[1fr_120px_60px_60px_60px] items-center gap-3 px-4 py-3 transition hover:bg-glow-purple/5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-zinc-100">{inv.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-zinc-500">{inv.problem}</div>
                  </div>
                  <span className={`badge justify-center font-medium ${STATUS_BADGE[inv.status]}`}>
                    {inv.status.replace(/_/g, " ")}
                  </span>
                  <ScoreCell label="feas" value={inv.feasibility_score} color="text-glow-sky" />
                  <ScoreCell label="nov" value={inv.novelty_score} color="text-glow-amber" />
                  <ScoreCell
                    label="safe"
                    value={inv.safety_score}
                    color={inv.safety_score >= 0.6 ? "text-glow-jade" : "text-glow-rose"}
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Sparkles size={20} />}
            title={items.data?.length === 0 ? "No inventions yet" : "No inventions match this filter"}
            hint="Approved inventions touching clinical/genetic/chem-synth terms auto-escalate to projects."
          />
        )}
      </section>
    </div>
  );
}

function ScoreCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`font-mono text-[12px] ${color}`}>{value.toFixed(2)}</div>
      <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-ink-3">
        <div className={`h-full ${color.replace("text-", "bg-")}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
