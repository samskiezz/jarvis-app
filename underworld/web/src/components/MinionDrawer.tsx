import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Brain, Dna as DnaIcon, GitBranch, Heart, Network, ScrollText, X } from "lucide-react";
import { api } from "@/lib/api";
import Avatar from "@/components/ui/Avatar";
import GuildBadge from "@/components/ui/GuildBadge";
import RoleBadge from "@/components/ui/RoleBadge";
import type { Mood } from "@/lib/types";

const MOOD_COLOR: Record<Mood, string> = {
  flow: "text-glow-jade",
  inspired: "text-glow-sky",
  content: "text-glow-purple",
  bored: "text-zinc-400",
  anxious: "text-glow-amber",
  exhausted: "text-orange-400",
  despairing: "text-glow-rose",
};

interface Props {
  minionId: string;
  onClose: () => void;
}

function NeedBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color =
    value < 0.2 ? "from-glow-rose to-pink-500"
    : value < 0.4 ? "from-glow-amber to-orange-500"
    : value < 0.7 ? "from-glow-sky to-blue-500"
    : "from-glow-jade to-glow-teal";
  return (
    <div>
      <div className="flex justify-between text-[9px] uppercase tracking-widest">
        <span className="text-zinc-500">{label}</span>
        <span className="font-mono text-zinc-300">{value.toFixed(2)}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink-3">
        <div
          className={`h-full bg-gradient-to-r ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TraitBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="grid grid-cols-[100px_1fr_36px] items-center gap-2">
      <span className="text-[9px] uppercase tracking-widest text-zinc-500">{label}</span>
      <div className="h-1 overflow-hidden rounded-full bg-ink-3">
        <div
          className="h-full bg-gradient-to-r from-glow-purple/70 to-glow-violet/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-right font-mono text-[9px] text-zinc-300">{value.toFixed(2)}</span>
    </div>
  );
}

export default function MinionDrawer({ minionId, onClose }: Props) {
  const qc = useQueryClient();
  const minion = useQuery({ queryKey: ["minion", minionId], queryFn: () => api.getMinion(minionId) });
  const skills = useQuery({ queryKey: ["minion", minionId, "skills"], queryFn: () => api.listSkills(minionId) });
  const memories = useQuery({ queryKey: ["minion", minionId, "memories"], queryFn: () => api.listMemories(minionId, 12) });
  const rels = useQuery({ queryKey: ["minion", minionId, "rels"], queryFn: () => api.listRelationships(minionId) });
  const dna = useQuery({ queryKey: ["minion", minionId, "dna"], queryFn: () => api.getDna(minionId) });
  const soul = useQuery({ queryKey: ["minion", minionId, "soul"], queryFn: () => api.getSoul(minionId) });
  const lineage = useQuery({ queryKey: ["minion", minionId, "lineage"], queryFn: () => api.getLineage(minionId) });

  const fork = useMutation({
    mutationFn: () => api.fork(minionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["minion", minionId] });
      qc.invalidateQueries({ queryKey: ["world"] });
    },
  });

  if (minion.isLoading) {
    return (
      <aside className="fixed inset-y-0 right-0 z-30 w-[480px] overflow-y-auto border-l border-glow-purple/20 bg-ink-1/95 p-4 text-[11px] shadow-2xl backdrop-blur animate-slide-in-right">
        <div className="space-y-3">
          <div className="skeleton h-16 rounded-lg" />
          <div className="skeleton h-32 rounded-lg" />
          <div className="skeleton h-32 rounded-lg" />
        </div>
      </aside>
    );
  }
  if (!minion.data) return null;
  const m = minion.data;

  return (
    <aside className="fixed inset-y-0 right-0 z-30 w-[480px] overflow-y-auto border-l border-glow-purple/20 bg-ink-1/95 shadow-2xl backdrop-blur animate-slide-in-right">
      {/* HEADER */}
      <header className="sticky top-0 z-10 border-b border-glow-purple/15 bg-ink-1/95 backdrop-blur">
        <div className="flex items-start gap-3 p-4">
          <Avatar seed={m.id} size={44} alive={m.alive} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-base font-medium text-zinc-100">{m.name}</span>
              <span className="text-[11px] text-zinc-500">{m.surname}</span>
              {!m.alive ? <span className="text-[10px] text-glow-rose">· DECEASED</span> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <GuildBadge guild={m.guild} size="xs" />
              <RoleBadge role={m.swarm_role} size="xs" />
              <span className={`text-[9px] uppercase tracking-widest ${MOOD_COLOR[m.mood]}`}>{m.mood}</span>
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-widest text-zinc-500">
              gen {m.generation} · age {m.age} · rep {m.reputation.toFixed(2)} · karma {m.karma.toFixed(2)}
            </div>
          </div>
          <button
            type="button"
            className="btn-icon shrink-0"
            onClick={onClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {/* NEEDS */}
        <section>
          <div className="page-eyebrow text-[9px] mb-2 flex items-center gap-1.5">
            <Heart size={10} />
            Vital signs
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NeedBar label="Hunger" value={m.hunger} />
            <NeedBar label="Thirst" value={m.thirst} />
            <NeedBar label="Fatigue" value={m.fatigue} />
            <NeedBar label="Sanity" value={m.sanity} />
            <NeedBar label="Health" value={m.health} />
            <NeedBar label="Calm" value={1 - m.stress} />
          </div>
        </section>

        {/* PERSONALITY */}
        <section className="panel">
          <div className="panel-header">
            <span className="flex items-center gap-1.5">
              <Brain size={11} />
              Personality
            </span>
          </div>
          <div className="space-y-1.5 p-3">
            <TraitBar label="Openness" value={m.openness} />
            <TraitBar label="Conscient." value={m.conscientiousness} />
            <TraitBar label="Extraversion" value={m.extraversion} />
            <TraitBar label="Agreeable." value={m.agreeableness} />
            <TraitBar label="Neuroticism" value={m.neuroticism} />
            <TraitBar label="Intelligence" value={m.intelligence} />
            <TraitBar label="Creativity" value={m.creativity} />
          </div>
        </section>

        {/* DNA */}
        {dna.data ? (
          <section className="panel">
            <div className="panel-header">
              <span className="flex items-center gap-1.5">
                <DnaIcon size={11} />
                DNA
              </span>
              <span>{dna.data.length} bp</span>
            </div>
            <div className="break-all bg-ink-2/40 p-3 font-mono text-[9px] text-zinc-400">
              {dna.data.dna_preview}
              <span className="text-zinc-600">…</span>
            </div>
          </section>
        ) : null}

        {/* SOUL */}
        {soul.data ? (
          <section className="panel">
            <div className="panel-header">
              <span>Soul</span>
              <span>incarnation #{soul.data.incarnation}</span>
            </div>
            <div className="p-3 text-[10px]">
              <div className="flex items-center gap-3">
                <span className="text-zinc-500">karma</span>
                <span className="font-mono text-glow-purple">{soul.data.karma.toFixed(2)}</span>
                {soul.data.ascended ? (
                  <span className="badge border-glow-amber/40 text-glow-amber">ASCENDED</span>
                ) : null}
              </div>
              {soul.data.ancestral_summary ? (
                <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-glow-purple/15 bg-ink-2/40 p-2 text-[9px] leading-relaxed text-zinc-400">
                  {soul.data.ancestral_summary}
                </pre>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* SKILLS */}
        {skills.data && skills.data.length > 0 ? (
          <section className="panel">
            <div className="panel-header">
              <span>Skills</span>
              <span>{skills.data.length}</span>
            </div>
            <ul className="space-y-1 p-3">
              {skills.data.map((s) => (
                <li key={s.name} className="grid grid-cols-[1fr_60px_30px] items-center gap-2 text-[10px]">
                  <span className="truncate text-zinc-300">{s.name}</span>
                  <div className="h-1 overflow-hidden rounded-full bg-ink-3">
                    <div className="h-full bg-glow-sky" style={{ width: `${Math.min(100, s.level * 100)}%` }} />
                  </div>
                  <span className="text-right font-mono text-glow-sky">{s.level.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* RELATIONSHIPS */}
        {rels.data && rels.data.length > 0 ? (
          <section className="panel">
            <div className="panel-header">
              <span className="flex items-center gap-1.5">
                <Network size={11} />
                Relationships
              </span>
              <span>{rels.data.length}</span>
            </div>
            <ul className="space-y-1 p-3 text-[10px]">
              {rels.data.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span className="truncate text-zinc-300">{r.other_name}</span>
                  <span className="text-zinc-500">
                    {r.kind} · <span className="text-glow-purple font-mono">{(r.strength * 100).toFixed(0)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* LINEAGE */}
        {lineage.data && (lineage.data.ancestors.length + lineage.data.descendants.length + lineage.data.siblings.length + lineage.data.forks.length > 0) ? (
          <section className="panel">
            <div className="panel-header">
              <span className="flex items-center gap-1.5">
                <GitBranch size={11} />
                Lineage
              </span>
            </div>
            <div className="space-y-2 p-3">
              {(["ancestors", "siblings", "descendants", "forks"] as const).map((k) => {
                const list = lineage.data![k];
                if (!list.length) return null;
                return (
                  <div key={k}>
                    <div className="text-[9px] uppercase tracking-widest text-glow-purple/70">
                      {k} <span className="text-zinc-500">({list.length})</span>
                    </div>
                    <ul className="mt-1 ml-2 space-y-0.5 text-[10px]">
                      {list.slice(0, 6).map((n) => (
                        <li key={n.id} className={n.alive ? "text-zinc-300" : "text-zinc-500"}>
                          {n.name} {n.surname} · gen {n.generation} · {n.guild}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* MEMORIES */}
        {memories.data && memories.data.length > 0 ? (
          <section className="panel">
            <div className="panel-header">
              <span className="flex items-center gap-1.5">
                <ScrollText size={11} />
                Recent memories
              </span>
              <span>{memories.data.length}</span>
            </div>
            <ul className="space-y-2 p-3">
              {memories.data.map((mem) => (
                <li
                  key={mem.id}
                  className="rounded border border-glow-purple/10 bg-ink-2/40 p-2 text-[10px]"
                >
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-widest">
                    <span className="text-glow-amber font-mono">t{mem.tick}</span>
                    <span className="text-zinc-500">{mem.kind}</span>
                  </div>
                  <div className="mt-1 text-zinc-300">{mem.content}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ACTIONS */}
        {m.alive ? (
          <button
            type="button"
            className="btn-primary w-full"
            disabled={fork.isPending}
            onClick={() => fork.mutate()}
          >
            <GitBranch size={11} />
            {fork.isPending ? "Forking…" : "Fork this Minion"}
          </button>
        ) : null}
        {fork.isError ? (
          <div className="rounded border border-glow-rose/30 bg-glow-rose/5 px-3 py-2 text-[10px] text-glow-rose">
            {(fork.error as Error).message}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
