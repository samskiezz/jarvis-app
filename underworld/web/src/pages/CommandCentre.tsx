import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronRight, Radio } from "lucide-react";
import { api } from "@/lib/api";

const CPC_SUGGESTIONS = [
  { code: "H02J", label: "Power grids / batteries" },
  { code: "G06F", label: "Computing / data processing" },
  { code: "F03D", label: "Wind turbines" },
  { code: "E04F", label: "Building finishings" },
  { code: "B62D", label: "Vehicles" },
  { code: "F24S", label: "Solar collectors" },
];

export default function CommandCentre() {
  const qc = useQueryClient();
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds, refetchInterval: 5000 });

  const [name, setName] = useState("New World");
  const [cpc, setCpc] = useState("H02J");
  const [startingPop, setStartingPop] = useState(128);
  const [populationCap, setPopulationCap] = useState(400);
  const createWorld = useMutation({
    mutationFn: () => api.createWorld(name, cpc, startingPop, populationCap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["worlds"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">Command Centre</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Spin up a world seeded by a patent classification code. The CPC class drives terrain,
          aptitude weighting, and the initial guild distribution. After creation, toggle{" "}
          <span className="text-glow-jade">auto-advance</span> to let the simulation evolve on its own.
        </p>
      </header>

      <section className="panel">
        <div className="panel-header">
          <span>Create world</span>
          <span className="text-zinc-600">100-300 starting Minions recommended for demos</span>
        </div>
        <form
          className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_140px_120px_120px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            createWorld.mutate();
          }}
        >
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="World name"
            required
          />
          <input
            className="input"
            value={cpc}
            onChange={(e) => setCpc(e.target.value.toUpperCase())}
            placeholder="CPC class"
            required
          />
          <input
            type="number"
            className="input"
            value={startingPop}
            min={10}
            max={300}
            onChange={(e) => setStartingPop(Number(e.target.value) || 128)}
            title="Starting population"
          />
          <input
            type="number"
            className="input"
            value={populationCap}
            min={50}
            max={1000}
            onChange={(e) => setPopulationCap(Number(e.target.value) || 400)}
            title="Population cap"
          />
          <button type="submit" className="btn" disabled={createWorld.isPending}>
            <Plus size={12} />
            {createWorld.isPending ? "Forging…" : "Forge"}
          </button>
          <div className="col-span-full flex flex-wrap gap-1 text-[10px] text-zinc-500">
            <span>CPC:</span>
            {CPC_SUGGESTIONS.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => setCpc(s.code)}
                className="rounded border border-zinc-800 px-2 py-0.5 hover:border-glow-purple/40 hover:text-glow-purple"
              >
                {s.code} · {s.label}
              </button>
            ))}
          </div>
          {createWorld.isError ? (
            <div className="col-span-full text-[10px] text-glow-rose">
              {(createWorld.error as Error).message}
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span>Worlds</span>
          <span className="text-zinc-600">{worlds.data?.length ?? 0} active</span>
        </div>
        {worlds.isLoading ? (
          <div className="p-6 text-center text-[11px] text-zinc-500">Loading…</div>
        ) : worlds.data && worlds.data.length > 0 ? (
          <ul className="divide-y divide-glow-purple/10">
            {worlds.data.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/worlds/${w.id}`}
                  className="grid grid-cols-[1fr_60px_80px_80px_80px_80px_24px] items-center gap-4 px-4 py-3 transition hover:bg-glow-purple/5"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-zinc-100">{w.name}</span>
                      {w.auto_advance ? (
                        <Radio size={11} className="animate-pulse text-glow-jade" />
                      ) : null}
                    </div>
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500">
                      seed={w.seed_class} · cap {w.population_cap}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-zinc-500">tick</div>
                    <div className="font-bold text-glow-amber">{w.tick}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-zinc-500">alive</div>
                    <div className="font-bold text-glow-jade">{w.alive_count}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-zinc-500">total</div>
                    <div className="text-zinc-300">{w.minion_count}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-zinc-500">interval</div>
                    <div className="text-[10px] text-zinc-300">{w.auto_advance_interval_s.toFixed(1)}s</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-zinc-500">created</div>
                    <div className="text-[10px] text-zinc-300">
                      {new Date(w.created_at).toLocaleString()}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-glow-purple/60" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-center text-[11px] text-zinc-500">
            No worlds yet. Forge one above to begin.
          </div>
        )}
      </section>
    </div>
  );
}
