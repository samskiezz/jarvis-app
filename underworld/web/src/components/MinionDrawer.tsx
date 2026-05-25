import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { X, GitBranch } from "lucide-react";
import { api } from "@/lib/api";
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
    value < 0.2 ? "bg-glow-rose"
    : value < 0.4 ? "bg-glow-amber"
    : value < 0.7 ? "bg-glow-sky"
    : "bg-glow-jade";
  return (
    <div>
      <div className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-500">
        <span>{label}</span>
        <span className="text-zinc-300">{value.toFixed(2)}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-ink-3">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
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
      <aside className="fixed inset-y-0 right-0 w-[440px] overflow-y-auto border-l border-glow-purple/20 bg-ink-1 p-4 text-[11px] shadow-2xl">
        Loading…
      </aside>
    );
  }
  if (!minion.data) return null;
  const m = minion.data;

  return (
    <aside className="fixed inset-y-0 right-0 z-30 w-[460px] overflow-y-auto border-l border-glow-purple/20 bg-ink-1 shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-glow-purple/15 bg-ink-1 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-glow-purple/70">
            {m.guild} · gen {m.generation}
          </div>
          <div className="text-sm text-zinc-100">{m.name} {m.surname}</div>
          <div className="mt-0.5 text-[10px] text-zinc-500">
            age {m.age} · rep {m.reputation.toFixed(2)} · karma {m.karma.toFixed(2)} ·{" "}
            <span className={MOOD_COLOR[m.mood]}>{m.mood}</span>
            {m.alive ? null : <span className="text-glow-rose"> · DECEASED</span>}
          </div>
        </div>
        <button type="button" className="text-zinc-500 hover:text-zinc-100" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <section className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <NeedBar label="Hunger" value={m.hunger} />
          <NeedBar label="Thirst" value={m.thirst} />
          <NeedBar label="Fatigue" value={m.fatigue} />
          <NeedBar label="Sanity" value={m.sanity} />
          <NeedBar label="Health" value={m.health} />
          <NeedBar label="Stress" value={1 - m.stress} />
        </div>

        <section>
          <div className="text-[10px] uppercase tracking-widest text-glow-purple/70">Personality</div>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            {([
              ["openness", m.openness],
              ["conscientiousness", m.conscientiousness],
              ["extraversion", m.extraversion],
              ["agreeableness", m.agreeableness],
              ["neuroticism", m.neuroticism],
              ["intelligence", m.intelligence],
              ["creativity", m.creativity],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="text-zinc-200">{v.toFixed(2)}</dd>
              </div>
            ))}
          </dl>
        </section>

        {dna.data ? (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-glow-purple/70">DNA</div>
            <div className="mt-1 break-all rounded border border-glow-purple/15 bg-ink-2 p-2 font-mono text-[9px] text-zinc-400">
              {dna.data.dna_preview}…
              <div className="mt-1 text-zinc-500">{dna.data.length} base pairs</div>
            </div>
          </section>
        ) : null}

        {soul.data ? (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-glow-purple/70">Soul</div>
            <div className="mt-1 text-[10px] text-zinc-400">
              Incarnation #{soul.data.incarnation} · karma {soul.data.karma.toFixed(2)}
              {soul.data.ascended ? " · ascended" : ""}
            </div>
            {soul.data.ancestral_summary ? (
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-glow-purple/15 bg-ink-2 p-2 text-[9px] text-zinc-400">
                {soul.data.ancestral_summary}
              </pre>
            ) : null}
          </section>
        ) : null}

        {skills.data && skills.data.length > 0 ? (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-glow-purple/70">Skills</div>
            <ul className="mt-1 space-y-0.5 text-[10px]">
              {skills.data.map((s) => (
                <li key={s.name} className="flex justify-between">
                  <span className="text-zinc-300">{s.name}</span>
                  <span className="text-glow-sky">{s.level.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {rels.data && rels.data.length > 0 ? (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-glow-purple/70">Relationships</div>
            <ul className="mt-1 space-y-0.5 text-[10px]">
              {rels.data.slice(0, 12).map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span className="text-zinc-300">{r.other_name}</span>
                  <span className="text-zinc-500">
                    {r.kind} · {(r.strength * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {lineage.data && (lineage.data.ancestors.length + lineage.data.descendants.length + lineage.data.siblings.length + lineage.data.forks.length > 0) ? (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-glow-purple/70">Lineage</div>
            {(["ancestors", "siblings", "descendants", "forks"] as const).map((k) => {
              const list = lineage.data![k];
              if (!list.length) return null;
              return (
                <div key={k} className="mt-1">
                  <div className="text-[9px] uppercase text-zinc-500">{k} ({list.length})</div>
                  <ul className="ml-2 text-[10px] text-zinc-300">
                    {list.slice(0, 6).map((n) => (
                      <li key={n.id} className={n.alive ? "" : "text-zinc-500"}>
                        {n.name} {n.surname} · gen {n.generation} · {n.guild}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ) : null}

        {memories.data && memories.data.length > 0 ? (
          <section>
            <div className="text-[10px] uppercase tracking-widest text-glow-purple/70">Recent memories</div>
            <ul className="mt-1 space-y-1 text-[10px]">
              {memories.data.map((mem) => (
                <li key={mem.id} className="rounded border border-glow-purple/10 bg-ink-2 p-1.5">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                    t{mem.tick} · {mem.kind}
                  </div>
                  <div className="text-zinc-300">{mem.content}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {m.alive ? (
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="btn flex-1 justify-center"
              disabled={fork.isPending}
              onClick={() => fork.mutate()}
            >
              <GitBranch size={11} />
              {fork.isPending ? "Forking…" : "Fork"}
            </button>
          </div>
        ) : null}
        {fork.isError ? (
          <div className="text-[10px] text-glow-rose">{(fork.error as Error).message}</div>
        ) : null}
      </section>
    </aside>
  );
}
