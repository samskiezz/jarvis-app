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

  return (
    <div className="flex h-full min-h-screen">
      {/* --- Sidebar --- */}
      <nav className="relative flex w-52 flex-col border-r border-glow-purple/10 bg-ink-1/60 backdrop-blur-md">
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-glow-purple/20 to-transparent" />

        {/* logo */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 rounded-md bg-gradient-to-br from-glow-purple via-glow-violet to-glow-sky opacity-90" />
              <div className="absolute inset-[2px] flex items-center justify-center rounded-[5px] bg-ink-0">
                <Skull size={14} className="text-glow-purple" />
              </div>
            </div>
            <div>
              <div className="font-display text-sm font-semibold leading-none tracking-wider text-zinc-100">
                UNDERWORLD
              </div>
              <div className="text-[8px] tracking-[0.3em] text-glow-purple/70">v0.2 · master ref</div>
            </div>
          </div>
        </div>

        <div className="divider mb-3" />

        {/* nav */}
        <div className="flex flex-1 flex-col gap-3 px-3 overflow-y-auto">
          <div>
            <div className="px-2 text-[8px] uppercase tracking-[0.3em] text-zinc-600">Simulation</div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {tabs.filter((t) => t.group === "primary").map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] transition ${
                      isActive
                        ? "bg-glow-purple/15 text-glow-purple shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]"
                        : "text-zinc-500 hover:bg-glow-purple/5 hover:text-zinc-200"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <div className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-glow-purple" />
                      ) : null}
                      <Icon size={13} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          <div>
            <div className="px-2 text-[8px] uppercase tracking-[0.3em] text-zinc-600">Reference</div>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {tabs.filter((t) => t.group === "secondary").map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] transition ${
                      isActive
                        ? "bg-glow-purple/15 text-glow-purple shadow-[inset_0_0_12px_rgba(168,85,247,0.15)]"
                        : "text-zinc-500 hover:bg-glow-purple/5 hover:text-zinc-200"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <div className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-glow-purple" />
                      ) : null}
                      <Icon size={13} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </div>

        {/* footer stats + sign out */}
        <div className="border-t border-glow-purple/10 p-3">
          <div className="rounded-md border border-glow-purple/15 bg-ink-2/50 p-2">
            <div className="flex items-center justify-between text-[8px] uppercase tracking-widest text-zinc-500">
              <span>Live</span>
              <span className="flex items-center gap-1">
                {liveWorlds > 0 ? <span className="live-dot" /> : <span className="inline-block h-2 w-2 rounded-full bg-zinc-700" />}
                <span className={liveWorlds > 0 ? "text-glow-jade" : "text-zinc-500"}>
                  {liveWorlds}/{worlds.data?.length ?? 0}
                </span>
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[9px]">
              <div>
                <div className="text-zinc-500">Alive</div>
                <div className="text-glow-jade font-medium">{totalAlive}</div>
              </div>
              <div>
                <div className="text-zinc-500">Total</div>
                <div className="text-zinc-300">{totalMinions}</div>
              </div>
              <div>
                <div className="text-zinc-500">Σ tick</div>
                <div className="text-glow-amber">{totalTicks}</div>
              </div>
              <div>
                <div className="text-zinc-500">Worlds</div>
                <div className="text-glow-purple">{worlds.data?.length ?? 0}</div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearApiKey();
              window.location.reload();
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-zinc-800 px-2 py-1.5 text-[9px] uppercase tracking-[0.2em] text-zinc-500 transition hover:border-glow-rose/40 hover:text-glow-rose"
          >
            <LogOut size={11} />
            Sign out
          </button>
        </div>
      </nav>

      {/* --- Main --- */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* topbar */}
        <header className="flex h-12 items-center gap-4 border-b border-glow-purple/10 bg-ink-1/40 px-6 backdrop-blur-md">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
            <span className="text-zinc-600">Underworld</span>
            <span className="text-zinc-700">/</span>
            <span className="text-glow-purple">{activeTab?.label ?? ""}</span>
          </div>

          <div className="ml-auto flex items-center gap-3 text-[10px]">
            <div className="hidden sm:flex items-center gap-2">
              <Activity size={12} className="text-glow-jade" />
              <span className="text-zinc-500">tick rate</span>
              <span className="font-medium text-zinc-200">
                {worlds.data?.[0]?.auto_advance_interval_s?.toFixed(1) ?? "—"}s
              </span>
            </div>
            <div className="hidden md:flex items-center gap-1.5">
              <span className="text-zinc-600">⌘K</span>
              <span className="text-zinc-500">cmd</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
