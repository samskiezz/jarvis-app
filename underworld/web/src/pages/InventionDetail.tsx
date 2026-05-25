import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { ReviewVerdict } from "@/lib/types";

const VERDICT_COLOR: Record<ReviewVerdict, string> = {
  approve: "text-glow-jade",
  request_changes: "text-glow-amber",
  reject: "text-glow-rose",
  block_safety: "text-glow-rose",
};

export default function InventionDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const inv = useQuery({ queryKey: ["invention", id], queryFn: () => api.getInvention(id) });
  const reviews = useQuery({
    queryKey: ["invention", id, "reviews"],
    queryFn: () => api.listReviews(id),
  });

  if (inv.isLoading) return <div className="text-[11px] text-zinc-500">Loading…</div>;
  if (inv.isError || !inv.data) return <div className="text-[11px] text-glow-rose">Not found.</div>;
  const i = inv.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link to={`/worlds/${i.world_id}`} className="btn-ghost">
          <ChevronLeft size={12} />
          World
        </Link>
        <div className="flex-1">
          <h1 className="text-base uppercase tracking-[0.2em] text-glow-purple">{i.title}</h1>
          <div className="text-[10px] text-zinc-500">tick {i.tick} · {i.status}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <span>Brief</span>
        </div>
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 p-4 text-[11px]">
          <dt className="text-[9px] uppercase tracking-widest text-zinc-500">Problem</dt>
          <dd className="text-zinc-200">{i.problem}</dd>
          <dt className="text-[9px] uppercase tracking-widest text-zinc-500">Hypothesis</dt>
          <dd className="text-zinc-200">{i.hypothesis || "—"}</dd>
          <dt className="text-[9px] uppercase tracking-widest text-zinc-500">Patents</dt>
          <dd className="flex flex-wrap gap-1 text-glow-sky">
            {i.related_patents.length
              ? i.related_patents.map((p) => (
                  <span key={p} className="badge border-glow-sky/40 text-glow-sky">
                    {p}
                  </span>
                ))
              : <span className="text-zinc-500">—</span>}
          </dd>
        </dl>
        <div className="grid grid-cols-3 gap-2 border-t border-glow-purple/10 p-4 text-center">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">Feasibility</div>
            <div className="text-lg text-glow-sky">{i.feasibility_score.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">Novelty</div>
            <div className="text-lg text-glow-amber">{i.novelty_score.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">Safety</div>
            <div className={`text-lg ${i.safety_score >= 0.6 ? "text-glow-jade" : "text-glow-rose"}`}>
              {i.safety_score.toFixed(2)}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span>Peer reviews</span>
          <span className="text-zinc-500">{reviews.data?.length ?? 0}</span>
        </div>
        {reviews.data && reviews.data.length > 0 ? (
          <ul className="divide-y divide-glow-purple/10">
            {reviews.data.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                  <span className="text-glow-purple">{r.reviewer_guild} guild</span>
                  <span className={VERDICT_COLOR[r.verdict]}>{r.verdict.replace("_", " ")}</span>
                </div>
                <p className="mt-2 text-[11px] text-zinc-300">{r.rationale}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-center text-[10px] text-zinc-500">No reviews yet.</div>
        )}
      </section>
    </div>
  );
}
