import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Beaker, Dna, FlaskConical, GitBranch, ShieldAlert, Sparkles, Stethoscope,
  TestTube,
} from "lucide-react";
import { api } from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";
import GuildBadge from "@/components/ui/GuildBadge";
import RoleBadge from "@/components/ui/RoleBadge";
import StatCard from "@/components/ui/StatCard";
import type { ProjectStage, ResearchProjectT } from "@/lib/types";

const STAGE_DEF: Record<
  ProjectStage,
  { label: string; color: string; bg: string; icon: typeof Beaker }
> = {
  hypothesis:        { label: "Hypothesis",       color: "text-zinc-300",      bg: "border-zinc-700/60",       icon: Sparkles },
  in_silico:         { label: "In-Silico",        color: "text-glow-sky",      bg: "border-glow-sky/40",       icon: GitBranch },
  bench_plan:        { label: "Bench Plan",       color: "text-glow-amber",    bg: "border-glow-amber/40",     icon: Beaker },
  preclinical_plan:  { label: "Preclinical",      color: "text-orange-400",    bg: "border-orange-400/40",     icon: TestTube },
  clinical_plan:     { label: "Clinical",         color: "text-glow-purple",   bg: "border-glow-purple/40",    icon: Stethoscope },
  regulatory_review: { label: "Regulatory",       color: "text-glow-rose",     bg: "border-glow-rose/40",      icon: ShieldAlert },
  approved:          { label: "Approved",         color: "text-glow-jade",     bg: "border-glow-jade/40",      icon: Sparkles },
  blocked:           { label: "Blocked",          color: "text-glow-rose",     bg: "border-glow-rose/60",      icon: ShieldAlert },
  abandoned:         { label: "Abandoned",        color: "text-zinc-500",      bg: "border-zinc-700",          icon: ShieldAlert },
};

const STAGE_ORDER: ProjectStage[] = [
  "hypothesis", "in_silico", "bench_plan", "preclinical_plan",
  "clinical_plan", "regulatory_review", "approved",
];

export default function Projects() {
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds });
  const [worldId, setWorldId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const selectedWorld = worldId ?? worlds.data?.[0]?.id ?? null;

  const projects = useQuery({
    queryKey: ["projects", selectedWorld],
    queryFn: () => api.listProjects({ world_id: selectedWorld ?? undefined, limit: 200 }),
    enabled: !!selectedWorld,
    refetchInterval: 4000,
  });
  const summary = useQuery({
    queryKey: ["projects", "summary", selectedWorld],
    queryFn: () => api.projectWorldSummary(selectedWorld!),
    enabled: !!selectedWorld,
    refetchInterval: 4000,
  });
  const contributions = useQuery({
    queryKey: ["project", selectedProject, "contrib"],
    queryFn: () => api.listProjectContributions(selectedProject!),
    enabled: !!selectedProject,
  });

  const grouped = useMemo(() => {
    const m: Record<string, ResearchProjectT[]> = {};
    for (const p of projects.data ?? []) {
      (m[p.stage] ||= []).push(p);
    }
    return m;
  }, [projects.data]);

  const selectedProj = projects.data?.find((p) => p.id === selectedProject);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="page-eyebrow">Research projects</div>
        <h1 className="mt-1 page-title">Section 8 validation pipeline</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Inventions that touch clinical, genetic, or chemical-synthesis domains escalate to a
          multi-stage research project. Each stage waits for a Minion whose{" "}
          <span className="text-glow-sky">swarm role</span> matches the stage's need. Confidence
          accumulates per contribution until the project clears the stage or gets blocked.
        </p>
      </header>

      {/* world selector */}
      <section className="panel">
        <div className="panel-header">
          <span>World</span>
          <span>{worlds.data?.length ?? 0} active</span>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {(worlds.data ?? []).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWorldId(w.id)}
              className={`rounded-md border px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest transition ${
                selectedWorld === w.id
                  ? "border-glow-purple bg-glow-purple/10 text-glow-purple shadow-glow"
                  : "border-zinc-800 text-zinc-400 hover:border-glow-purple/40 hover:text-zinc-100"
              }`}
            >
              <span>{w.name}</span>
              <span className="ml-2 text-zinc-500">t{w.tick}</span>
            </button>
          ))}
        </div>
      </section>

      {summary.data ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Clinical"
            value={summary.data.flagged_clinical}
            hint="patients · trials · therapies"
            icon={<Stethoscope size={14} />}
            accent="purple"
          />
          <StatCard
            label="Genetic"
            value={summary.data.flagged_genetic}
            hint="CRISPR · variants · alleles"
            icon={<Dna size={14} />}
            accent="jade"
          />
          <StatCard
            label="Chem synth"
            value={summary.data.flagged_chem_synth}
            hint="catalysts · reagents · ligands"
            icon={<FlaskConical size={14} />}
            accent="sky"
          />
          <StatCard
            label="Approved"
            value={summary.data.by_stage.approved || 0}
            hint="cleared regulatory review"
            icon={<Sparkles size={14} />}
            accent="amber"
          />
        </section>
      ) : null}

      {/* KANBAN BOARD */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="page-eyebrow">Stage pipeline</h2>
          <span className="text-[10px] text-zinc-500">
            {projects.data?.length ?? 0} project{(projects.data?.length ?? 0) === 1 ? "" : "s"}
          </span>
        </div>

        {projects.data && projects.data.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<GitBranch size={20} />}
              title="No projects escalated yet"
              hint="Approved inventions mentioning clinical/genetic/chem-synth terms auto-escalate here. Try chartering one via /inventions/charter."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {STAGE_ORDER.map((stage) => {
              const items = grouped[stage] || [];
              const def = STAGE_DEF[stage];
              const Icon = def.icon;
              return (
                <article key={stage} className={`panel relative overflow-hidden border ${def.bg}`}>
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-1"
                    style={{ background: `linear-gradient(90deg, transparent, currentColor, transparent)` }}
                  />
                  <div className={`panel-header ${def.color}`}>
                    <span className="flex items-center gap-1.5">
                      <Icon size={11} />
                      {def.label}
                    </span>
                    <span className={def.color}>{items.length}</span>
                  </div>
                  <ul className="max-h-[400px] divide-y divide-glow-purple/5 overflow-y-auto">
                    {items.slice(0, 10).map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedProject(p.id === selectedProject ? null : p.id)}
                          className={`block w-full px-3 py-2.5 text-left text-[11px] transition hover:bg-glow-purple/5 ${
                            selectedProject === p.id ? "bg-glow-purple/10" : ""
                          }`}
                        >
                          <div className="line-clamp-2 leading-tight text-zinc-200">{p.title}</div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[8px]">
                            {p.flagged_clinical ? (
                              <span className="rounded border border-glow-purple/40 bg-glow-purple/10 px-1 py-px text-glow-purple">CLIN</span>
                            ) : null}
                            {p.flagged_genetic ? (
                              <span className="rounded border border-glow-jade/40 bg-glow-jade/10 px-1 py-px text-glow-jade">GENE</span>
                            ) : null}
                            {p.flagged_chem_synth ? (
                              <span className="rounded border border-glow-sky/40 bg-glow-sky/10 px-1 py-px text-glow-sky">CHEM</span>
                            ) : null}
                            <span className="ml-auto font-mono text-[9px] text-zinc-500">
                              {(p.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-3">
                            <div
                              className="h-full bg-gradient-to-r from-glow-purple to-glow-violet"
                              style={{ width: `${p.confidence * 100}%` }}
                            />
                          </div>
                        </button>
                      </li>
                    ))}
                    {items.length === 0 ? (
                      <li className="py-6 text-center text-[9px] text-zinc-600">— empty —</li>
                    ) : null}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* CONTRIBUTION DRILL-DOWN */}
      {selectedProj && contributions.data ? (
        <section className="panel-elevated">
          <div className="panel-header">
            <span className="flex items-center gap-2">
              <GitBranch size={11} />
              {selectedProj.title}
            </span>
            <button
              type="button"
              onClick={() => setSelectedProject(null)}
              className="text-zinc-500 hover:text-zinc-200"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_2fr]">
            <div>
              <div className="page-eyebrow text-[9px]">Summary</div>
              <p className="mt-2 text-[11px] text-zinc-300">{selectedProj.summary || "—"}</p>
              <div className="mt-4 space-y-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Stage</span>
                  <span className={STAGE_DEF[selectedProj.stage].color}>{STAGE_DEF[selectedProj.stage].label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Confidence</span>
                  <span className="font-mono text-glow-purple">{(selectedProj.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Needs role</span>
                  <span className="text-glow-sky">{selectedProj.needs_role ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Created tick</span>
                  <span className="font-mono">{selectedProj.created_tick}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="page-eyebrow text-[9px] mb-2">Contributions ({contributions.data.length})</div>
              {contributions.data.length === 0 ? (
                <EmptyState
                  title="No contributions yet"
                  hint="Advance the world to let a role-matched Minion contribute."
                />
              ) : (
                <ul className="max-h-96 divide-y divide-glow-purple/5 overflow-y-auto">
                  {contributions.data.map((c) => (
                    <li key={c.id} className="grid grid-cols-[40px_1fr_60px] gap-2 px-2 py-2 text-[10px]">
                      <span className="font-mono text-glow-amber">t{c.tick}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <GuildBadge guild={c.contributor.guild} size="xs" />
                          <RoleBadge role={c.role} size="xs" />
                        </div>
                        <div className="mt-0.5 truncate text-zinc-300">
                          {c.contributor.name} {c.contributor.surname}
                        </div>
                        <div className="mt-0.5 text-zinc-500">{c.note}</div>
                      </div>
                      <span className="text-right font-mono text-glow-jade">
                        +{(c.delta_confidence * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
