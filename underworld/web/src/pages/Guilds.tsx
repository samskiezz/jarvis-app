import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Guilds() {
  const guilds = useQuery({ queryKey: ["guilds"], queryFn: api.guilds });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">Guilds</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Specialised review domains. Patent + Safety always sit on every panel; the inventor's
          own guild joins. The Safety Guild has veto power.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(guilds.data ?? []).map((g) => (
          <section key={g.kind} className="panel">
            <div className="panel-header">
              <span>{g.name}</span>
              <span className="text-zinc-500">{g.kind}</span>
            </div>
            <div className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Domain</div>
              <div className="mt-1 text-[11px] text-zinc-200">{g.domain}</div>
              <div className="mt-3 text-[10px] uppercase tracking-widest text-zinc-500">
                Review checklist
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-zinc-300">
                {g.checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-1">
                {g.starting_skills.map((s) => (
                  <span key={s} className="badge border-glow-sky/40 text-glow-sky">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
