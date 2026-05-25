import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

export default function Safety() {
  const reviews = useQuery({ queryKey: ["safety", "reviews"], queryFn: () => api.listSafetyReviews(50) });

  const [text, setText] = useState("");
  const [cpc, setCpc] = useState("");
  const check = useMutation({
    mutationFn: () => api.safetyCheck(text || undefined, cpc || undefined),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl uppercase tracking-[0.3em] text-glow-purple">
          <Shield size={18} />
          Safety
        </h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Hard gate enforced server-side. Blocks bio/chem-weapon/explosive/firearm/nuclear/cyber-offense
          phrases and any CPC class outside the allow-list (currently F, G, H, E, B sections; A and C are
          blocked).
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <span>Probe a check</span>
        </div>
        <form
          className="grid grid-cols-[1fr_180px_auto] gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            check.mutate();
          }}
        >
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Free text to scan"
          />
          <input
            className="input"
            value={cpc}
            onChange={(e) => setCpc(e.target.value.toUpperCase())}
            placeholder="CPC class"
          />
          <button type="submit" className="btn" disabled={check.isPending}>
            {check.isPending ? "Checking…" : "Check"}
          </button>
          {check.data ? (
            <div className="col-span-full">
              {check.data.blocked ? (
                <div className="flex items-center gap-2 text-[11px] text-glow-rose">
                  <ShieldAlert size={14} />
                  Blocked:
                  <code className="text-glow-amber">
                    {check.data.rules.map((r) => r.rule).join(", ")}
                  </code>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-glow-jade">
                  <ShieldCheck size={14} />
                  No rule fired.
                </div>
              )}
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span>Recent safety reviews</span>
          <span className="text-zinc-500">{reviews.data?.length ?? 0}</span>
        </div>
        {reviews.data && reviews.data.length > 0 ? (
          <ul className="divide-y divide-glow-purple/10">
            {reviews.data.map((r) => (
              <li key={r.id} className="grid grid-cols-[1fr_160px_120px] gap-3 px-4 py-2 text-[10px]">
                <div className="text-zinc-200">{r.subject_kind} {r.subject_id.slice(0, 8)}</div>
                <code className="text-glow-amber">{r.rule}</code>
                <div className="text-right text-zinc-500">{new Date(r.created_at).toLocaleString()}</div>
                <div className="col-span-full text-zinc-400">{r.detail}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-center text-[10px] text-zinc-500">No blocked items yet.</div>
        )}
      </section>
    </div>
  );
}
