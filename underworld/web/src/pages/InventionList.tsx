import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Invention, TaskStatus } from "@/lib/types";

const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "border-zinc-700 text-zinc-400",
  running: "border-glow-sky text-glow-sky",
  needs_peer_review: "border-glow-amber text-glow-amber",
  needs_safety_review: "border-glow-rose text-glow-rose",
  approved: "border-glow-jade text-glow-jade",
  rejected: "border-glow-rose/60 text-glow-rose/80",
  failed: "border-zinc-600 text-zinc-500",
};

export default function InventionList() {
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds });

  const items = useQuery({
    queryKey: ["inventions", "all", worlds.data?.map((w) => w.id).join(",")],
    queryFn: async (): Promise<Invention[]> => {
      if (!worlds.data) return [];
      const buckets = await Promise.all(worlds.data.map((w) => api.listInventions(w.id)));
      return buckets.flat().sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
    enabled: !!worlds.data,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">Inventions</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Across all worlds. Status reflects the peer + safety review outcome.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <span>All inventions</span>
          <span className="text-zinc-500">{items.data?.length ?? 0}</span>
        </div>
        {items.data && items.data.length > 0 ? (
          <ul className="divide-y divide-glow-purple/10">
            {items.data.map((inv) => (
              <li key={inv.id}>
                <Link
                  to={`/inventions/${inv.id}`}
                  className="grid grid-cols-[1fr_100px_80px_80px_80px] items-center gap-3 px-4 py-2 transition hover:bg-glow-purple/5"
                >
                  <div className="truncate">
                    <div className="text-[11px] text-zinc-100">{inv.title}</div>
                    <div className="truncate text-[9px] text-zinc-500">{inv.problem}</div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[inv.status]} justify-center`}>
                    {inv.status}
                  </span>
                  <div className="text-right text-[10px]">
                    <div className="text-zinc-500">feas</div>
                    <div className="text-glow-sky">{inv.feasibility_score.toFixed(2)}</div>
                  </div>
                  <div className="text-right text-[10px]">
                    <div className="text-zinc-500">nov</div>
                    <div className="text-glow-amber">{inv.novelty_score.toFixed(2)}</div>
                  </div>
                  <div className="text-right text-[10px]">
                    <div className="text-zinc-500">safe</div>
                    <div className={inv.safety_score >= 0.6 ? "text-glow-jade" : "text-glow-rose"}>
                      {inv.safety_score.toFixed(2)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-center text-[10px] text-zinc-500">
            No inventions yet across any world.
          </div>
        )}
      </section>
    </div>
  );
}
