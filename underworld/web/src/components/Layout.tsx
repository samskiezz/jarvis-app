import { NavLink, Outlet } from "react-router-dom";
import { Globe2, Shield, FileSearch, Sparkles, FlaskConical, LogOut, Users, BookOpen, GitBranch } from "lucide-react";
import { clearApiKey } from "@/lib/config";

const tabs = [
  { to: "/", label: "Command", icon: Globe2 },
  { to: "/population", label: "Population", icon: Users },
  { to: "/projects", label: "Projects", icon: GitBranch },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/patents", label: "Patents", icon: FileSearch },
  { to: "/inventions", label: "Inventions", icon: Sparkles },
  { to: "/guilds", label: "Guilds", icon: FlaskConical },
  { to: "/safety", label: "Safety", icon: Shield },
] as const;

export default function Layout() {
  return (
    <div className="flex h-full min-h-screen">
      <nav className="flex w-44 flex-col border-r border-glow-purple/10 bg-ink-1 p-3">
        <div className="mb-6 px-2 pt-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-glow-purple/70">UNDERWORLD</div>
          <div className="mt-0.5 text-[8px] text-zinc-500">v0.1.0 · phase 1+2</div>
        </div>
        <div className="flex flex-col gap-1">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded px-2 py-1.5 text-[10px] uppercase tracking-widest transition ${
                  isActive
                    ? "bg-glow-purple/15 text-glow-purple"
                    : "text-zinc-500 hover:bg-ink-2 hover:text-zinc-200"
                }`
              }
            >
              <Icon size={13} />
              {label}
            </NavLink>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              clearApiKey();
              window.location.reload();
            }}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-[10px] uppercase tracking-widest text-zinc-500 hover:bg-ink-2 hover:text-glow-rose"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
