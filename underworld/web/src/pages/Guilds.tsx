import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { GUILD_META } from "@/components/ui/GuildBadge";
import type { Guild } from "@/lib/types";

export default function Guilds() {
  const guilds = useQuery({ queryKey: ["guilds"], queryFn: api.guilds });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="page-eyebrow">Guilds</div>
        <h1 className="mt-1 page-title">Review domains</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Each invention is reviewed by the <span className="text-glow-purple">Patent Guild</span>,
          the <span className="text-glow-rose">Safety Guild</span>, and the inventor's own guild.
          The Safety Guild has unconditional veto power. The other guilds verify domain-specific
          checklists and grant approval, request changes, or reject outright.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(guilds.data ?? []).map((g) => {
          const meta = GUILD_META[g.kind as Guild];
          const Icon = meta?.icon;
          return (
            <article
              key={g.kind}
              className="panel-elevated relative overflow-hidden transition hover:border-glow-purple/40"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-30"
                style={{
                  background: `radial-gradient(circle, ${
                    meta?.color === "text-glow-purple" ? "rgba(168,85,247,0.4)"
                    : meta?.color === "text-glow-sky" ? "rgba(14,165,233,0.4)"
                    : meta?.color === "text-glow-amber" ? "rgba(245,158,11,0.4)"
                    : meta?.color === "text-glow-jade" ? "rgba(16,185,129,0.4)"
                    : meta?.color === "text-glow-rose" ? "rgba(244,63,94,0.4)"
                    : "rgba(168,85,247,0.4)"
                  }, transparent 70%)`,
                }}
              />
              <div className="relative p-5">
                <div className="flex items-center gap-3">
                  {Icon ? (
                    <div className={`flex h-9 w-9 items-center justify-center rounded-md border border-current/30 ${meta.color}`} style={{ background: "rgba(255,255,255,0.04)" }}>
                      <Icon size={16} />
                    </div>
                  ) : null}
                  <div>
                    <div className="font-display text-base font-medium text-zinc-100">
                      {g.name}
                    </div>
                    <div className={`text-[9px] uppercase tracking-widest ${meta?.color ?? "text-zinc-400"}`}>
                      {g.kind}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="page-eyebrow text-[9px]">Domain</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">{g.domain}</p>
                </div>

                <div className="mt-4">
                  <div className="page-eyebrow text-[9px] mb-1.5">Review checklist</div>
                  <ul className="space-y-1 text-[10.5px] text-zinc-300">
                    {g.checklist.map((c) => (
                      <li key={c} className="flex items-start gap-1.5">
                        <Check size={10} className="mt-0.5 shrink-0 text-glow-jade" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4">
                  <div className="page-eyebrow text-[9px] mb-1.5">Starting skills</div>
                  <div className="flex flex-wrap gap-1">
                    {g.starting_skills.map((s) => (
                      <span key={s} className="badge border-glow-sky/40 text-glow-sky">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
