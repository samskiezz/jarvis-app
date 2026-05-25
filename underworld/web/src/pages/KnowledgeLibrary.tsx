import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, Library, Search, ShieldAlert, Sigma, Sparkles, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import CopyButton from "@/components/ui/CopyButton";
import EmptyState from "@/components/ui/EmptyState";
import StatCard from "@/components/ui/StatCard";
import Tabs from "@/components/ui/Tabs";

type Tab = "formulas" | "concepts" | "roles" | "guardrails";

const DISCIPLINE_META: Record<string, { color: string; label: string }> = {
  ai:             { color: "text-glow-purple", label: "AI / ML" },
  bioinformatics: { color: "text-glow-jade",   label: "Bioinformatics" },
  biology:        { color: "text-glow-jade",   label: "Biology" },
  chemistry:      { color: "text-pink-400",    label: "Chemistry" },
  electrical:     { color: "text-glow-amber",  label: "Electrical" },
  engineering:    { color: "text-zinc-300",    label: "Engineering" },
  mathematics:    { color: "text-glow-violet", label: "Mathematics" },
  physics:        { color: "text-glow-sky",    label: "Physics" },
};

const SOURCE_META: Record<string, { label: string; color: string }> = {
  master_reference_v2: { label: "V2 Master Ref", color: "text-glow-purple" },
  physics_laws_v4: { label: "Physics V4", color: "text-glow-sky" },
};

export default function KnowledgeLibrary() {
  const [tab, setTab] = useState<Tab>("formulas");
  const [discipline, setDiscipline] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  const summary = useQuery({ queryKey: ["kb", "summary"], queryFn: api.kbSummary });
  const concepts = useQuery({
    queryKey: ["kb", "concepts"],
    queryFn: api.kbConcepts,
    enabled: tab === "concepts",
  });
  const formulas = useQuery({
    queryKey: ["kb", "formulas", discipline, source, q, offset],
    queryFn: () =>
      api.kbFormulas({
        discipline: discipline || undefined,
        source: source || undefined,
        q: q || undefined,
        limit: 50,
        offset,
      }),
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

  const totalDisciplines = useMemo(
    () => Object.keys(summary.data?.formulas_by_discipline ?? {}).length,
    [summary.data],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="page-eyebrow">Knowledge library</div>
        <h1 className="mt-1 page-title">Master compendia</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          {summary.data?.formulas.toLocaleString() ?? "…"} formulas across {totalDisciplines}{" "}
          disciplines, sourced from the{" "}
          <span className="text-glow-purple">V2 AI-Swarms Master Reference</span> and the{" "}
          <span className="text-glow-sky">V4 Physics Laws &amp; Equations Compendium</span> (96
          pages, named laws + explanations). Minions consult this base every tick —{" "}
          <span className="text-glow-amber">Formula Oracles</span> and{" "}
          <span className="text-glow-sky">Literature Scouts</span> hit it hardest.
        </p>
      </header>

      {summary.data ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Concepts" value={summary.data.concepts} icon={<BookOpen size={14} />} accent="purple" />
            <StatCard label="Formulas" value={summary.data.formulas.toLocaleString()} icon={<Sigma size={14} />} accent="amber" hint={`${Object.keys(summary.data.sources ?? {}).length} sources`} />
            <StatCard label="Swarm roles" value={summary.data.swarm_roles} icon={<Users size={14} />} accent="sky" />
            <StatCard label="Guardrails" value={summary.data.guardrails} icon={<ShieldAlert size={14} />} accent="rose" />
          </section>
          {Object.keys(summary.data.sources ?? {}).length > 1 ? (
            <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(summary.data.sources).map(([s, n]) => {
                const meta = SOURCE_META[s] ?? { label: s, color: "text-zinc-300" };
                return (
                  <div key={s} className="panel flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="page-eyebrow text-[9px]">Source</div>
                      <div className={`mt-0.5 text-[12px] font-medium ${meta.color}`}>{meta.label}</div>
                    </div>
                    <div className={`font-display text-2xl font-light ${meta.color}`}>
                      {n.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}
        </>
      ) : null}

      <Tabs
        active={tab}
        onChange={(t) => {
          setTab(t);
          setOffset(0);
        }}
        tabs={[
          { id: "formulas", label: "Formulas", icon: <Sigma size={11} />, count: summary.data?.formulas },
          { id: "concepts", label: "Concepts", icon: <BookOpen size={11} />, count: summary.data?.concepts },
          { id: "roles", label: "Swarm Roles", icon: <Users size={11} />, count: summary.data?.swarm_roles },
          { id: "guardrails", label: "Guardrails", icon: <ShieldAlert size={11} />, count: summary.data?.guardrails },
        ]}
      />

      {tab === "formulas" ? (
        <section className="panel">
          <div className="panel-header">
            <span className="flex items-center gap-1.5">
              <Library size={11} />
              Browse
            </span>
            <span>
              {formulas.data?.total?.toLocaleString() ?? "…"} matches
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 border-b border-glow-purple/10 p-4 sm:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                className="input pl-8"
                placeholder="Search name, expression, description, keyword…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                }}
              />
            </div>
            <select
              className="input"
              value={discipline}
              onChange={(e) => {
                setDiscipline(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All disciplines</option>
              {Object.entries(summary.data?.formulas_by_discipline ?? {}).map(([d, c]) => (
                <option key={d} value={d}>{DISCIPLINE_META[d]?.label ?? d} ({c})</option>
              ))}
            </select>
            <select
              className="input"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All sources</option>
              {Object.entries(summary.data?.sources ?? {}).map(([s, c]) => (
                <option key={s} value={s}>{SOURCE_META[s]?.label ?? s} ({c})</option>
              ))}
            </select>
          </div>

          {formulas.isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded" />)}
            </div>
          ) : formulas.data && formulas.data.items.length > 0 ? (
            <>
              <ul className="max-h-[600px] divide-y divide-glow-purple/5 overflow-y-auto">
                {formulas.data.items.map((f) => {
                  const meta = DISCIPLINE_META[f.discipline] ?? { color: "text-zinc-400", label: f.discipline };
                  const srcMeta = SOURCE_META[f.source] ?? { label: f.source, color: "text-zinc-400" };
                  return (
                    <li
                      key={f.id}
                      className="group grid grid-cols-[88px_1fr_auto] items-start gap-3 px-4 py-3 text-[11px] transition hover:bg-glow-purple/5"
                    >
                      <div className="mt-0.5 space-y-1">
                        <span className={`block font-medium uppercase tracking-widest text-[9px] ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className={`block text-[8px] uppercase tracking-widest ${srcMeta.color}`}>
                          {srcMeta.label}
                        </span>
                      </div>
                      <div className="min-w-0">
                        {f.name ? (
                          <div className="text-[12px] font-medium text-zinc-100">{f.name}</div>
                        ) : null}
                        <code className="block break-words font-mono text-[11px] text-glow-amber/90">
                          {f.expression}
                        </code>
                        {f.description ? (
                          <p className="mt-1.5 leading-relaxed text-zinc-400">{f.description}</p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[9px]">
                          <span className="text-zinc-500 truncate" title={f.catalogue}>
                            {f.catalogue}
                          </span>
                          {(f.keywords ?? []).slice(0, 4).map((k) => (
                            <span
                              key={k}
                              className="rounded border border-glow-purple/15 bg-glow-purple/5 px-1 py-px text-glow-purple/80"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="opacity-0 transition group-hover:opacity-100">
                        <CopyButton value={f.expression} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between border-t border-glow-purple/10 p-3 text-[10px]">
                <span className="text-zinc-500">
                  Showing {offset + 1}–{Math.min(offset + 50, formulas.data.total)} of {formulas.data.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 50))}
                  >
                    ‹ Prev
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={offset + 50 >= formulas.data.total}
                    onClick={() => setOffset(offset + 50)}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Search size={20} />}
              title="No matches"
              hint="Try a different search term or clear the discipline filter."
            />
          )}
        </section>
      ) : null}

      {tab === "concepts" ? (
        <section className="space-y-3">
          {(concepts.data ?? []).map((c) => (
            <article key={c.id} className="panel">
              <div className="panel-header">
                <span>{c.title}</span>
                <span>{c.section}</span>
              </div>
              <div className="whitespace-pre-line p-5 text-[11px] leading-relaxed text-zinc-300">
                {c.body}
              </div>
            </article>
          ))}
          {(concepts.data?.length ?? 0) === 0 && !concepts.isLoading ? (
            <EmptyState title="No concepts indexed" />
          ) : null}
        </section>
      ) : null}

      {tab === "roles" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(roles.data ?? []).map((r) => (
            <article key={r.id} className="panel transition hover:border-glow-purple/40">
              <div className="panel-header">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={11} />
                  {r.name}
                </span>
                <span className="font-mono text-glow-sky">→ {r.guild_hint}</span>
              </div>
              <p className="p-4 text-[11px] leading-relaxed text-zinc-300">{r.description}</p>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "guardrails" ? (
        <section className="space-y-3">
          {(guards.data ?? []).map((g) => (
            <article key={g.id} className="panel border-glow-rose/15">
              <div className="panel-header">
                <span className="flex items-center gap-1.5 text-glow-rose/80">
                  <ShieldAlert size={11} />
                  {g.stage.replace(/_/g, " ")}
                </span>
              </div>
              <p className="p-4 text-[11px] leading-relaxed text-zinc-300">{g.detail}</p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
