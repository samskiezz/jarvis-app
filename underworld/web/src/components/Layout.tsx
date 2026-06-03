import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Globe2, Shield, FileSearch, Sparkles, FlaskConical, LogOut,
  Users, BookOpen, GitBranch, Activity, Skull,
} from "lucide-react";
import { api } from "@/lib/api";
import { clearApiKey } from "@/lib/config";

const tabs = [
  { to: "/", label: "Command", icon: Globe2, group: "primary" },
  { to: "/population", label: "Population", icon: Users, group: "primary" },
  { to: "/projects", label: "Projects", icon: GitBranch, group: "primary" },
  { to: "/inventions", label: "Inventions", icon: Sparkles, group: "primary" },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen, group: "secondary" },
  { to: "/patents", label: "Patents", icon: FileSearch, group: "secondary" },
  { to: "/guilds", label: "Guilds", icon: FlaskConical, group: "secondary" },
  { to: "/safety", label: "Safety", icon: Shield, group: "secondary" },
] as const;

export default function Layout() {
  const location = useLocation();
  const worlds = useQuery({ queryKey: ["worlds"], queryFn: api.listWorlds, refetchInterval: 5000 });

  const totalAlive = worlds.data?.reduce((s, w) => s + w.alive_count, 0) ?? 0;
  const totalMinions = worlds.data?.reduce((s, w) => s + w.minion_count, 0) ?? 0;
  const totalTicks = worlds.data?.reduce((s, w) => s + w.tick, 0) ?? 0;
  const liveWorlds = worlds.data?.filter((w) => w.auto_advance).length ?? 0;

  const activeTab = tabs.find((t) =>
    t.to === "/" ? location.pathname === "/" : location.pathname.startsWith(t.to),
  );

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium tracking-tight transition duration-200 ${
      isActive
        ? "border border-glow-purple/40 bg-glow-purple/15 text-white shadow-glow"
        : "border border-transparent text-zinc-400 hover:bg-glow-purple/10 hover:text-zinc-100"
    }`;

  return (
    <div className="flex h-full min-h-screen p-3 gap-3">
      {/* --- Sidebar (floating glass rail) --- */}
      <nav className="panel relative flex w-60 flex-col overflow-hidden">
        {/* logo */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-glow-purple via-glow-violet to-glow-sky opacity-90 blur-[1px]" />
              <div className="absolute inset-[2px] flex items-center justify-center rounded-[14px] bg-ink-0/90">
                <Skull size={18} className="text-glow-purple" />
              </div>
            </div>
            <div>
              <div className="font-display text-[15px] font-bold leading-none tracking-tight text-white text-glow">
                Underworld
              </div>
              <div className="mt-1 text-[10px] font-medium tracking-[0.2em] text-glow-sky/70">
                CIVILISATION ENGINE
              </div>
            </div>
          </div>
        </div>

        <div className="divider mb-3" />

        {/* nav */}
        <div className="flex flex-1 flex-col gap-4 px-3 overflow-y-auto scrollbar-hide">
          <div>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Simulation
            </div>
            <div className="flex flex-col gap-1">
              {tabs.filter((t) => t.group === "primary").map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === "/"} className={navLinkClass}>
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-glow-purple shadow-glow" />
                      ) : null}
                      <Icon size={16} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          <div>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Reference
            </div>
            <div className="flex flex-col gap-1">
              {tabs.filter((t) => t.group === "secondary").map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={navLinkClass}>
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-glow-purple shadow-glow" />
                      ) : null}
                      <Icon size={16} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </div>

        {/* footer stats + sign out */}
        <div className="border-t border-glow-purple/15 p-3">
          <div className="rounded-xl border border-glow-purple/20 bg-white/[0.04] p-3 backdrop-blur-xl">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
              <span>Live worlds</span>
              <span className="flex items-center gap-1.5">
                {liveWorlds > 0 ? <span className="live-dot" /> : <span className="inline-block h-2 w-2 rounded-full bg-zinc-700" />}
                <span className={liveWorlds > 0 ? "text-glow-jade font-semibold" : "text-zinc-500"}>
                  {liveWorlds}/{worlds.data?.length ?? 0}
                </span>
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 text-[12px]">
              <div>
                <div className="text-[10px] text-zinc-500">Alive</div>
                <div className="text-glow-jade font-semibold tabular">{totalAlive}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Total</div>
                <div className="text-zinc-200 font-semibold tabular">{totalMinions}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Σ ticks</div>
                <div className="text-glow-amber font-semibold tabular">{totalTicks}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500">Worlds</div>
                <div className="text-glow-purple font-semibold tabular">{worlds.data?.length ?? 0}</div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearApiKey();
              window.location.reload();
            }}
            className="btn-ghost mt-2 w-full hover:text-glow-rose"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </nav>

      {/* --- Main --- */}
      <div className="flex flex-1 flex-col overflow-hidden gap-3">
        {/* topbar */}
        <header className="panel flex h-14 shrink-0 items-center gap-4 px-6">
          <div className="flex items-center gap-2 text-[13px] font-medium tracking-tight">
            <span className="text-zinc-500">Underworld</span>
            <span className="text-zinc-700">/</span>
            <span className="font-semibold text-white">{activeTab?.label ?? ""}</span>
          </div>

          <div className="ml-auto flex items-center gap-4 text-[12px]">
            <div className="hidden sm:flex items-center gap-2">
              <Activity size={14} className="text-glow-jade" />
              <span className="text-zinc-500">tick rate</span>
              <span className="font-semibold text-zinc-100 tabular">
                {worlds.data?.[0]?.auto_advance_interval_s?.toFixed(1) ?? "—"}s
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1.5">
              <span className="kbd">⌘K</span>
            </div>
          </div>
        </header>

        <main className="panel flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
