import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, FileText, GitBranch, MessageSquare, Shield, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import CopyButton from "@/components/ui/CopyButton";
import EmptyState from "@/components/ui/EmptyState";
import GuildBadge from "@/components/ui/GuildBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import type { Guild, ReviewVerdict } from "@/lib/types";

const VERDICT_META: Record<ReviewVerdict, { color: string; bg: string; icon: typeof CheckCircle2; label: string }> = {
  approve:         { color: "text-glow-jade",  bg: "bg-glow-jade/5",  icon: CheckCircle2, label: "Approved" },
  request_changes: { color: "text-glow-amber", bg: "bg-glow-amber/5", icon: MessageSquare, label: "Request changes" },
  reject:          { color: "text-glow-rose",  bg: "bg-glow-rose/5",  icon: XCircle, label: "Rejected" },
  block_safety:    { color: "text-glow-rose",  bg: "bg-glow-rose/5",  icon: Shield, label: "Blocked (safety)" },
};

export default function InventionDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const inv = useQuery({ queryKey: ["invention", id], queryFn: () => api.getInvention(id) });
  const reviews = useQuery({
    queryKey: ["invention", id, "reviews"],
    queryFn: () => api.listReviews(id),
  });

  const [rationale, setRationale] = useState("");
  const decide = useMutation({
    mutationFn: (verdict: "approve" | "reject" | "block_safety") =>
      api.decideInvention(id, verdict, rationale),
    onSuccess: () => {
      setRationale("");
      qc.invalidateQueries({ queryKey: ["invention", id] });
      qc.invalidateQueries({ queryKey: ["invention", id, "reviews"] });
      qc.invalidateQueries({ queryKey: ["inventions"] });
    },
  });

  if (inv.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-12 w-2/3 rounded" />
        <div className="skeleton h-32 rounded-lg" />
      </div>
    );
  }
  if (inv.isError || !inv.data) {
    return <div className="text-[11px] text-glow-rose">Invention not found.</div>;
  }
  const i = inv.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-4">
        <Link to={`/worlds/${i.world_id}`} className="btn-icon">
          <ChevronLeft size={14} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="page-eyebrow">Invention · tick {i.tick}</div>
          <h1 className="mt-0.5 font-display text-xl font-light tracking-tight text-zinc-100">
            {i.title}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-[10px]">
            <span className={`badge ${i.status === "approved" ? "border-glow-jade/40 text-glow-jade" : i.status === "rejected" || i.status === "failed" ? "border-glow-rose/40 text-glow-rose" : "border-glow-amber/40 text-glow-amber"}`}>
              {i.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <span className="flex items-center gap-1.5">
            <FileText size={11} />
            Brief
          </span>
        </div>
        <div className="space-y-5 p-5">
          <BriefRow label="Problem" body={i.problem} />
          <BriefRow label="Hypothesis" body={i.hypothesis || "—"} />
          <div>
            <div className="page-eyebrow text-[9px]">Cited patents</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {i.related_patents.length === 0 ? (
                <span className="text-[10px] text-zinc-500">—</span>
              ) : (
                i.related_patents.map((p) => (
                  <a
                    key={p}
                    href={`https://patents.google.com/patent/${p}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="badge border-glow-sky/40 text-glow-sky hover:bg-glow-sky/10"
                  >
                    {p}
                  </a>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-glow-purple/10 p-5">
          <ScoreBlock label="Feasibility" value={i.feasibility_score} variant="sky" />
          <ScoreBlock label="Novelty" value={i.novelty_score} variant="amber" />
          <ScoreBlock label="Safety" value={i.safety_score} variant={i.safety_score >= 0.6 ? "jade" : "rose"} />
        </div>
      </section>

      <section className="panel-elevated">
        <div className="panel-header">
          <span className="flex items-center gap-1.5">
            <Shield size={11} />
            Operator decision
          </span>
          <span className="text-zinc-500">writes a peer-review row</span>
        </div>
        <div className="space-y-3 p-4">
          <textarea
            className="input min-h-[60px] resize-y"
            placeholder="Rationale (optional) — saved with the review row"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide.mutate("approve")}
              disabled={decide.isPending || i.status === "approved"}
              className="inline-flex items-center gap-1.5 rounded-md border border-glow-jade/40 bg-glow-jade/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-glow-jade transition hover:bg-glow-jade/10 disabled:opacity-40"
            >
              <CheckCircle2 size={11} />
              Approve
            </button>
            <button
              type="button"
              onClick={() => decide.mutate("reject")}
              disabled={decide.isPending || i.status === "rejected"}
              className="inline-flex items-center gap-1.5 rounded-md border border-glow-rose/40 bg-glow-rose/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-glow-rose transition hover:bg-glow-rose/10 disabled:opacity-40"
            >
              <XCircle size={11} />
              Reject
            </button>
            <button
              type="button"
              onClick={() => decide.mutate("block_safety")}
              disabled={decide.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-glow-amber/40 bg-glow-amber/5 px-3 py-1.5 text-[10px] uppercase tracking-widest text-glow-amber transition hover:bg-glow-amber/10 disabled:opacity-40"
            >
              <Shield size={11} />
              Safety veto
            </button>
          </div>
          {decide.isError ? (
            <div className="rounded border border-glow-rose/30 bg-glow-rose/5 px-3 py-2 text-[10px] text-glow-rose">
              {(decide.error as Error).message}
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span className="flex items-center gap-1.5">
            <GitBranch size={11} />
            Peer reviews
          </span>
          <span>{reviews.data?.length ?? 0}</span>
        </div>
        {reviews.data && reviews.data.length > 0 ? (
          <ul className="divide-y divide-glow-purple/10">
            {reviews.data.map((r) => {
              const meta = VERDICT_META[r.verdict];
              const Icon = meta.icon;
              return (
                <li key={r.id} className={`p-4 ${meta.bg}`}>
                  <div className="flex items-center justify-between">
                    <GuildBadge guild={r.reviewer_guild as Guild} size="sm" />
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest ${meta.color}`}>
                      <Icon size={11} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-300">{r.rationale}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<MessageSquare size={20} />}
            title="No reviews yet"
            hint="Reviews fire when the invention is processed by the reviewer pipeline."
          />
        )}
      </section>
    </div>
  );
}

function BriefRow({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="page-eyebrow text-[9px]">{label}</div>
        {body !== "—" ? <CopyButton value={body} /> : null}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-200">{body}</p>
    </div>
  );
}

function ScoreBlock({ label, value, variant }: { label: string; value: number; variant: "sky" | "amber" | "jade" | "rose" }) {
  const colors = {
    sky: "text-glow-sky",
    amber: "text-glow-amber",
    jade: "text-glow-jade",
    rose: "text-glow-rose",
  };
  return (
    <div className="text-center">
      <div className="page-eyebrow text-[9px]">{label}</div>
      <div className={`mt-1 font-display text-2xl font-light ${colors[variant]}`}>{value.toFixed(2)}</div>
      <ProgressBar value={value} variant={variant} size="sm" />
    </div>
  );
}
