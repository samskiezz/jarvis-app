import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, BookOpen, ShieldAlert, Users } from "lucide-react";
import { api } from "@/lib/api";

type Tab = "concepts" | "formulas" | "roles" | "guardrails";

export default function KnowledgeLibrary() {
  const [tab, setTab] = useState<Tab>("formulas");
  const [discipline, setDiscipline] = useState<string>("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  const summary = useQuery({ queryKey: ["kb", "summary"], queryFn: api.kbSummary });
  const concepts = useQuery({
    queryKey: ["kb", "concepts"],
    queryFn: api.kbConcepts,
    enabled: tab === "concepts",
  });
  const formulas = useQuery({
    queryKey: ["kb", "formulas", discipline, q, offset],
    queryFn: () => api.kbFormulas({ discipline: discipline || undefined, q: q || undefined, limit: 50, offset }),
    enabled: tab === "formulas",
  });
  const roles = useQuery({
    queryKey: ["kb", "roles"],
    queryFn: api.kbRoles,
    enabled: tab === "roles",
  });
  const guards = useQuery({
    queryKey: ["kb", "guardrails"],
    queryFn: api.kbGuardrails,
    enabled: tab === "guardrails",
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">Knowledge Library</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Master Reference (V2 Expanded). Minions query this base every tick — formula oracles
          and literature scouts hit it hardest. The pipeline guardrails sit on top of the safety
          gate and shape how regulated proposals are escalated to multi-stage projects.
        </p>
      </header>

      {summary.data ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Concepts" value={summary.data.concepts} icon={<BookOpen size={14} />} />
          <Stat label="Formulas" value={summary.data.formulas} />
          <Stat label="Swarm roles" value={summary.data.swarm_roles} icon={<Users size={14} />} />
          <Stat label="Guardrails" value={summary.data.guardrails} icon={<ShieldAlert size={14} />} />
        </section>
      ) : null}

      <div className="flex gap-1 border-b border-glow-purple/10">
        {(["formulas", "concepts", "roles", "guardrails"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setOffset(0); }}
            className={`rounded-t px-3 py-1.5 text-[10px] uppercase tracking-widest ${
              tab === t ? "border-b-2 border-glow-purple text-glow-purple" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "formulas" ? (
        <section className="panel">
          <div className="panel-header">
            <span>Formulas</span>
            {summary.data ? (
              <span className="text-zinc-500">
                {formulas.data?.total ?? "…"} matches · {summary.data.formulas} total
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-[1fr_180px_auto] gap-2 border-b border-glow-purple/10 p-3">
            <input
              className="input"
              placeholder="search expression / catalogue"
              value={q}
              onChange={(e) => { setQ(e.target.value); setOffset(0); }}
            />
            <select
              className="input"
              value={discipline}
              onChange={(e) => { setDiscipline(e.target.value); setOffset(0); }}
            >
              <option value="">all disciplines</option>
              {Object.entries(summary.data?.formulas_by_discipline ?? {}).map(([d, c]) => (
                <option key={d} value={d}>{d} ({c})</option>
              ))}
            </select>
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <Search size={12} />
              offset {offset}
            </span>
          </div>
          <ul className="max-h-[520px] divide-y divide-glow-purple/5 overflow-y-auto">
            {(formulas.data?.items ?? []).map((f) => (
              <li key={f.id} className="grid grid-cols-[80px_1fr_200px] gap-3 px-3 py-2 text-[11px]">
                <span className="text-[9px] uppercase tracking-widest text-glow-amber">{f.discipline}</span>
                <code className="font-mono text-zinc-200">{f.expression}</code>
                <span className="text-right text-[9px] text-zinc-500">{f.catalogue}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2 border-t border-glow-purple/10 p-2 text-[10px]">
            <button
              type="button"
              className="btn-ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              prev
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!formulas.data || offset + 50 >= (formulas.data.total ?? 0)}
              onClick={() => setOffset(offset + 50)}
            >
              next
            </button>
          </div>
        </section>
      ) : null}

      {tab === "concepts" ? (
        <section className="space-y-2">
          {(concepts.data ?? []).map((c) => (
            <article key={c.id} className="panel">
              <div className="panel-header">
                <span>{c.title}</span>
                <span className="text-zinc-500">{c.section}</span>
              </div>
              <div className="whitespace-pre-line p-4 text-[11px] text-zinc-300">{c.body}</div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "roles" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(roles.data ?? []).map((r) => (
            <article key={r.id} className="panel">
              <div className="panel-header">
                <span>{r.name}</span>
                <span className="text-zinc-500">→ {r.guild_hint} guild</span>
              </div>
              <p className="p-4 text-[11px] text-zinc-300">{r.description}</p>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "guardrails" ? (
        <section className="space-y-2">
          {(guards.data ?? []).map((g) => (
            <article key={g.id} className="panel">
              <div className="panel-header">
                <span>{g.stage}</span>
              </div>
              <p className="p-4 text-[11px] text-zinc-300">{g.detail}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-zinc-500">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-2xl text-glow-purple">{value}</div>
    </div>
  );
}
