import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, FlaskConical, Dna, Beaker } from "lucide-react";
import { api } from "@/lib/api";
import type { ProjectStage, ResearchProjectT } from "@/lib/types";

const STAGE_LABEL: Record<ProjectStage, string> = {
  hypothesis: "Hypothesis",
  in_silico: "In-Silico",
  bench_plan: "Bench Plan",
  preclinical_plan: "Preclinical",
  clinical_plan: "Clinical",
  regulatory_review: "Regulatory",
  approved: "Approved",
  blocked: "Blocked",
  abandoned: "Abandoned",
};

const STAGE_ORDER: ProjectStage[] = [
  "hypothesis", "in_silico", "bench_plan", "preclinical_plan",
  "clinical_plan", "regulatory_review", "approved",
];

const STAGE_COLOR: Record<ProjectStage, string> = {
  hypothesis: "border-zinc-700 text-zinc-300",
  in_silico: "border-glow-sky/50 text-glow-sky",
  bench_plan: "border-glow-amber/50 text-glow-amber",
  preclinical_plan: "border-orange-500/50 text-orange-400",
  clinical_plan: "border-glow-purple/50 text-glow-purple",
  regulatory_review: "border-glow-rose/40 text-glow-rose",
  approved: "border-glow-jade text-glow-jade",
  blocked: "border-glow-rose text-glow-rose",
  abandoned: "border-zinc-600 text-zinc-500",
};

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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">Research Projects</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Inventions that touch clinical, genetic, or chemical-synthesis domains escalate to a
          multi-stage pipeline (Section 8 of the Master Reference). Each stage waits for a Minion
          whose swarm role matches the work needed.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <span>World</span>
          <span className="text-zinc-500">{worlds.data?.length ?? 0} active</span>
        </div>
        <div className="flex flex-wrap gap-1 p-3">
          {(worlds.data ?? []).map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWorldId(w.id)}
              className={`rounded border px-2 py-1 text-[10px] uppercase tracking-widest ${
                selectedWorld === w.id
                  ? "border-glow-purple text-glow-purple"
                  : "border-zinc-700 text-zinc-400 hover:border-glow-purple/40"
              }`}
            >
              {w.name} · t{w.tick}
            </button>
          ))}
        </div>
      </section>

      {summary.data ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Active flags · clinical" value={summary.data.flagged_clinical} icon={<FlaskConical size={14} />} />
          <Stat label="Active flags · genetic" value={summary.data.flagged_genetic} icon={<Dna size={14} />} />
          <Stat label="Active flags · chem synth" value={summary.data.flagged_chem_synth} icon={<Beaker size={14} />} />
          <Stat label="Approved" value={summary.data.by_stage.approved || 0} icon={<ShieldAlert size={14} />} />
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {STAGE_ORDER.map((stage) => {
          const items = grouped[stage] || [];
          return (
            <article key={stage} className="panel min-h-[140px]">
              <div className={`panel-header ${STAGE_COLOR[stage]}`}>
                <span>{STAGE_LABEL[stage]}</span>
                <span>{items.length}</span>
              </div>
              <ul className="divide-y divide-glow-purple/5">
                {items.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedProject(p.id === selectedProject ? null : p.id)}
                      className={`block w-full px-3 py-2 text-left text-[11px] hover:bg-glow-purple/5 ${
                        selectedProject === p.id ? "bg-glow-purple/10" : ""
                      }`}
                    >
                      <div className="line-clamp-1 text-zinc-200">{p.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[9px] text-zinc-500">
                        {p.flagged_clinical ? <span className="text-glow-rose">clin</span> : null}
                        {p.flagged_genetic ? <span className="text-glow-amber">gene</span> : null}
                        {p.flagged_chem_synth ? <span className="text-glow-sky">chem</span> : null}
                        <span className="ml-auto">confidence {(p.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded bg-ink-3">
                        <div
                          className="h-full bg-glow-purple"
                          style={{ width: `${p.confidence * 100}%` }}
                        />
                      </div>
                    </button>
                  </li>
                ))}
                {items.length === 0 ? (
                  <li className="p-3 text-center text-[9px] text-zinc-600">— empty —</li>
                ) : null}
              </ul>
            </article>
          );
        })}
      </section>

      {selectedProject && contributions.data ? (
        <section className="panel">
          <div className="panel-header">
            <span>Contributions</span>
            <span className="text-zinc-500">{contributions.data.length}</span>
          </div>
          <ul className="max-h-96 divide-y divide-glow-purple/5 overflow-y-auto">
            {contributions.data.map((c) => (
              <li key={c.id} className="grid grid-cols-[44px_120px_140px_1fr_60px] gap-2 px-3 py-1.5 text-[10px]">
                <span className="text-glow-amber">t{c.tick}</span>
                <span className="text-glow-purple">{c.stage}</span>
                <span className="text-zinc-300">{c.contributor.name} {c.contributor.surname}</span>
                <span className="truncate text-zinc-400">{c.note}</span>
                <span className="text-right text-glow-jade">+{(c.delta_confidence * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
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
      <div className="text-2xl text-zinc-100">{value}</div>
    </div>
  );
}
