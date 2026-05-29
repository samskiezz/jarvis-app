import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Crown, Flame, HelpCircle, Sparkles, Swords } from "lucide-react";
import { api } from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";
import { GUILD_META } from "@/components/ui/GuildBadge";
import type { Guild, GuildSpec } from "@/lib/types";

export default function Guilds() {
  const guilds = useQuery({ queryKey: ["guilds"], queryFn: api.guilds });
  const [openKind, setOpenKind] = useState<string | null>(null);

  const all: GuildSpec[] = guilds.data ?? [];
  const open = all.find((g) => g.kind === openKind) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <div className="page-eyebrow">Guilds</div>
        <h1 className="mt-1 page-title">Founding myths &amp; review domains</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Eleven guilds, each with a founding hero, a motto, daily rituals, and a different idea
          of what an invention even <em>is</em>. The Safety Guild has unconditional veto on every
          invention; the Patent Guild closes every review. Click a guild to see its full lore —
          the minion agents speak in this voice when they think and write.
        </p>
      </header>

      {all.length === 0 && !guilds.isLoading ? (
        <div className="panel">
          <EmptyState title="No guilds registered" hint="Check the backend /guilds route." />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {all.map((g) => {
          const meta = GUILD_META[g.kind as Guild];
          const Icon = meta?.icon;
          const accent = g.color_hex ?? "#a78bfa";
          return (
            <button
              key={g.kind}
              type="button"
              onClick={() => setOpenKind(openKind === g.kind ? null : g.kind)}
              className={`panel-elevated relative cursor-pointer overflow-hidden text-left transition hover:border-glow-purple/40 ${
                openKind === g.kind ? "ring-1 ring-glow-purple/40" : ""
              }`}
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-40"
                style={{ background: `radial-gradient(circle, ${accent}66, transparent 70%)` }}
              />
              <div className="relative p-5">
                <div className="flex items-center gap-3">
                  {Icon ? (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-md border"
                      style={{
                        borderColor: `${accent}80`,
                        background: `${accent}10`,
                        color: accent,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-medium text-zinc-100">
                        {g.name}
                      </span>
                      {g.glyph ? (
                        <span className="text-[14px]" style={{ color: accent }}>
                          {g.glyph}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="text-[9px] uppercase tracking-widest"
                      style={{ color: accent }}
                    >
                      {g.kind}
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-zinc-600 transition ${openKind === g.kind ? "rotate-90 text-glow-purple" : ""}`}
                  />
                </div>

                {g.motto ? (
                  <p
                    className="mt-3 text-[11px] italic leading-relaxed"
                    style={{ color: accent }}
                  >
                    “{g.motto}”
                  </p>
                ) : null}

                <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                  {g.mission ?? g.domain}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-[9px]">
                  {g.hero_name ? (
                    <div>
                      <div className="page-eyebrow text-[8px] flex items-center gap-1">
                        <Crown size={9} /> Hero
                      </div>
                      <div className="mt-0.5 text-zinc-300">{g.hero_name}</div>
                    </div>
                  ) : null}
                  {g.obsession ? (
                    <div>
                      <div className="page-eyebrow text-[8px] flex items-center gap-1">
                        <Flame size={9} /> Obsession
                      </div>
                      <div className="mt-0.5 truncate text-zinc-300" title={g.obsession}>
                        {g.obsession}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {open ? <LoreDrawer guild={open} onClose={() => setOpenKind(null)} /> : null}
    </div>
  );
}

function LoreDrawer({ guild: g, onClose }: { guild: GuildSpec; onClose: () => void }) {
  const accent = g.color_hex ?? "#a78bfa";
  const meta = GUILD_META[g.kind as Guild];
  const Icon = meta?.icon;

  return (
    <section className="panel-elevated relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-30"
        style={{ background: `radial-gradient(ellipse at top, ${accent}40, transparent 60%)` }}
      />
      <div className="panel-header">
        <span className="flex items-center gap-2">
          {Icon ? <Icon size={13} style={{ color: accent }} /> : null}
          <span style={{ color: accent }}>{g.name}</span>
          {g.glyph ? <span style={{ color: accent }}>{g.glyph}</span> : null}
          {g.motto ? (
            <span className="ml-2 text-[10px] italic text-zinc-400">“{g.motto}”</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      <div className="relative grid grid-cols-1 gap-6 p-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          {g.founding_myth ? (
            <Block title="Founding myth" body={g.founding_myth} accent={accent} />
          ) : null}
          {g.hero_tale ? (
            <Block
              title={`Hero — ${g.hero_name ?? "?"}`}
              body={g.hero_tale}
              accent={accent}
              icon={<Crown size={11} />}
            />
          ) : null}
          {g.mission ? <Block title="Mission" body={g.mission} accent={accent} /> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {g.obsession ? (
              <Block
                title="Obsession"
                body={g.obsession}
                accent={accent}
                icon={<Flame size={11} />}
              />
            ) : null}
            {g.open_question ? (
              <Block
                title="Open question"
                body={g.open_question}
                accent={accent}
                icon={<HelpCircle size={11} />}
              />
            ) : null}
          </div>
          {g.nemesis ? (
            <Block
              title="Nemesis"
              body={g.nemesis}
              accent={accent}
              icon={<Swords size={11} />}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          {g.rituals && g.rituals.length > 0 ? (
            <div>
              <div
                className="page-eyebrow text-[9px] mb-1.5 flex items-center gap-1"
                style={{ color: accent }}
              >
                <Sparkles size={10} /> Rituals
              </div>
              <ul className="space-y-1.5 text-[11px] text-zinc-300">
                {g.rituals.map((r) => (
                  <li key={r} className="flex items-start gap-1.5">
                    <span
                      className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full"
                      style={{ background: accent }}
                    />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <div
              className="page-eyebrow text-[9px] mb-1.5"
              style={{ color: accent }}
            >
              Review checklist
            </div>
            <ul className="space-y-1 text-[10.5px] text-zinc-300">
              {g.checklist.map((c) => (
                <li key={c} className="flex items-start gap-1.5">
                  <Check size={10} className="mt-0.5 shrink-0 text-glow-jade" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div
              className="page-eyebrow text-[9px] mb-1.5"
              style={{ color: accent }}
            >
              Starting skills
            </div>
            <div className="flex flex-wrap gap-1">
              {g.starting_skills.map((s) => (
                <span
                  key={s}
                  className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest"
                  style={{
                    borderColor: `${accent}66`,
                    color: accent,
                    background: `${accent}0d`,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="page-eyebrow text-[9px] mb-1.5">Domain</div>
            <p className="text-[11px] leading-relaxed text-zinc-400">{g.domain}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Block({
  title,
  body,
  accent,
  icon,
}: {
  title: string;
  body: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="page-eyebrow text-[9px] mb-1.5 flex items-center gap-1.5"
        style={{ color: accent }}
      >
        {icon}
        {title}
      </div>
      <p className="text-[11.5px] leading-relaxed text-zinc-200">{body}</p>
    </div>
  );
}
