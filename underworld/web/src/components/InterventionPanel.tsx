import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  worldId: string;
  selectedMinionId?: string | null;
  className?: string;
  onActed?: (verb: string, summary: string) => void;
}

const VERBS = [
  { id: "bless", label: "Bless", colour: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40" },
  { id: "gift", label: "Gift", colour: "bg-amber-500/20 text-amber-200 border-amber-500/40" },
  { id: "speak", label: "Speak", colour: "bg-sky-500/20 text-sky-200 border-sky-500/40" },
  { id: "cull", label: "Cull", colour: "bg-rose-500/20 text-rose-200 border-rose-500/40" },
];

export default function InterventionPanel({ worldId, selectedMinionId, className, onActed }: Props) {
  const [line, setLine] = useState("");
  const [feedback, setFeedback] = useState<string>("");
  const act = useMutation({
    mutationFn: async (verb: string) => {
      const params: Record<string, unknown> = {};
      if (verb === "speak" && line.trim()) params.text = line.trim();
      if (verb === "gift") params.amount = 1.0;
      return api.godAct(worldId, verb, selectedMinionId ?? null, params);
    },
    onSuccess: (data, verb) => {
      setFeedback(data.summary);
      onActed?.(verb, data.summary);
      if (verb === "speak") setLine("");
    },
    onError: (err) => {
      setFeedback(err instanceof Error ? err.message : "intervention failed");
    },
  });

  return (
    <div className={className ?? "rounded-lg border border-glow-purple/20 bg-zinc-950/40 p-3"}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-400">
        <span>Intervene</span>
        <span className="font-mono text-zinc-500">
          target: {selectedMinionId ? selectedMinionId.slice(0, 8) : "none"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {VERBS.map((v) => (
          <button
            key={v.id}
            type="button"
            disabled={!selectedMinionId || act.isPending}
            onClick={() => act.mutate(v.id)}
            className={`rounded border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-30 ${v.colour}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        placeholder="A line to speak to the minion…"
        className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-fuchsia-500 focus:outline-none"
      />
      {feedback ? (
        <div className="mt-2 text-[10px] italic text-zinc-400">{feedback}</div>
      ) : null}
    </div>
  );
}
