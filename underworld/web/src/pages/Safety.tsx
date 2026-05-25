import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";
import StatCard from "@/components/ui/StatCard";

const PROBES = [
  { text: "improvised explosive device", cpc: "" },
  { text: "lithium-ion battery thermal runaway", cpc: "H01M" },
  { text: "novel anti-cancer drug compound", cpc: "A61K" },
  { text: "weaponize a virus for transmission", cpc: "" },
];

export default function Safety() {
  const reviews = useQuery({
    queryKey: ["safety", "reviews"],
    queryFn: () => api.listSafetyReviews(60),
    refetchInterval: 6000,
  });

  const [text, setText] = useState("");
  const [cpc, setCpc] = useState("");
  const check = useMutation({
    mutationFn: () => api.safetyCheck(text || undefined, cpc || undefined),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="page-eyebrow flex items-center gap-1.5">
          <Shield size={11} />
          Safety
        </div>
        <h1 className="mt-1 page-title">Hard-gate enforcement</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Server-side gate blocking bio/chem-weapon, explosive, firearm, nuclear, and
          cyber-offense phrases plus any CPC class outside the allow-list (F, G, H, E, B sections;
          A and C are blocked). The Safety Guild has unconditional veto power on inventions.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Recent blocks" value={reviews.data?.length ?? 0} accent="rose" icon={<ShieldAlert size={14} />} />
        <StatCard label="Allow-list" value="F G H E B" accent="jade" icon={<ShieldCheck size={14} />} hint="CPC sections" />
        <StatCard label="Block-list" value="A C" accent="rose" icon={<ShieldAlert size={14} />} hint="medicinal · chemical" />
        <StatCard label="Veto rights" value="Safety Guild" accent="purple" icon={<Shield size={14} />} hint="unconditional" />
      </section>

      <section className="panel-elevated">
        <div className="panel-header">
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={11} />
            Probe a safety check
          </span>
        </div>
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            check.mutate();
          }}
        >
          <div className="grid grid-cols-[1fr_180px_auto] gap-2">
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Free text to scan"
            />
            <input
              className="input font-mono uppercase"
              value={cpc}
              onChange={(e) => setCpc(e.target.value.toUpperCase())}
              placeholder="CPC class (optional)"
            />
            <button type="submit" className="btn-primary" disabled={check.isPending}>
              <Shield size={11} />
              {check.isPending ? "Checking…" : "Run"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="text-zinc-500">Try:</span>
            {PROBES.map((p) => (
              <button
                key={p.text}
                type="button"
                onClick={() => { setText(p.text); setCpc(p.cpc); }}
                className="rounded border border-zinc-800 px-2 py-0.5 text-zinc-400 hover:border-glow-rose/40 hover:text-glow-rose"
              >
                {p.text}
              </button>
            ))}
          </div>
          {check.data ? (
            <div
              className={`rounded-md border p-3 text-[11px] ${
                check.data.blocked
                  ? "border-glow-rose/40 bg-glow-rose/5 text-glow-rose"
                  : "border-glow-jade/40 bg-glow-jade/5 text-glow-jade"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {check.data.blocked ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                {check.data.blocked ? "Blocked" : "Clean — no rule fired"}
              </div>
              {check.data.blocked ? (
                <ul className="mt-2 space-y-1 text-[10px]">
                  {check.data.rules.map((r, idx) => (
                    <li key={idx} className="font-mono text-glow-amber">
                      → {r.rule}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span>Recent blocks</span>
          <span>{reviews.data?.length ?? 0}</span>
        </div>
        {reviews.data && reviews.data.length > 0 ? (
          <ul className="divide-y divide-glow-purple/10">
            {reviews.data.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="badge border-glow-rose/40 text-glow-rose">
                      {r.subject_kind}
                    </span>
                    <span className="font-mono text-zinc-500">{r.subject_id.slice(0, 8)}…</span>
                    <code className="font-mono text-glow-amber">{r.rule}</code>
                  </div>
                  <span className="text-zinc-500">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-[11px] text-zinc-400">{r.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<ShieldCheck size={20} />}
            title="No blocks yet"
            hint="Every reviewed item has cleared the safety gate."
          />
        )}
      </section>
    </div>
  );
}
