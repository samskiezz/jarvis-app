/**
 * GlobalCommandPalette — ⌘K / Ctrl+K palette for cinematic and home routes.
 *
 * The existing CommandPalette (AppLayout) already serves /apex/* pages.
 * This component fills the gap: it mounts once in App.jsx and activates ONLY
 * when the current route is NOT under /apex, so there is never a double palette.
 *
 * Commands:
 *   • 10 cinematic scenes  → navigate to /cinematic/<id>
 *   • APEX pages           → navigate to /apex/<PageName>
 *   • Global actions       → home, launcher
 *   • Ask JARVIS fallback  → fires jarvis:ask CustomEvent (JarvisBrain handles it)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { useLocation, useNavigate } from "react-router-dom";
import { COLORS as C, SHELL as S, glow } from "@/domain/colors";
import { PAGES, GROUPS } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const CY = "#29E7FF";
const APEX_BASE = "/apex";
const apexUrl = (name) => `${APEX_BASE}${createPageUrl(name)}`;
const groupColor = (id) => GROUPS.find((g) => g.id === id)?.color || C.neon;
const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label || id?.toUpperCase();

const SCENES = [
  { id: "01_command_atrium",           label: "Command Atrium",            icon: "⌘" },
  { id: "02_ai_core_chamber",          label: "AI Core Chamber",           icon: "◉" },
  { id: "03_world_control_room",       label: "World Control Room",        icon: "🌐" },
  { id: "04_intelligence_graph_space", label: "Intelligence Graph Space",  icon: "✶" },
  { id: "05_operations_war_room",      label: "Operations War Room",       icon: "⚔" },
  { id: "06_data_fusion_reactor",      label: "Data Fusion Reactor",       icon: "⚛" },
  { id: "07_document_intelligence_vault", label: "Document Intelligence Vault", icon: "📜" },
  { id: "08_simulation_theatre",       label: "Simulation Theatre",        icon: "🎭" },
  { id: "09_analytics_observatory",    label: "Analytics Observatory",     icon: "📊" },
  { id: "10_system_security_core",     label: "System Security Core",      icon: "🛡" },
];

const GLOBAL_ACTIONS = [
  { id: "act-home",       label: "Home — Cinematic Selector",  icon: "◆", to: "/" },
  { id: "act-launcher",   label: "Portal Launcher",            icon: "→", to: "/portal" },
  { id: "act-apex",       label: "APEX HUD",                   icon: "▣", to: "/apex/Setup" },
];

function pageHaystack(p) {
  return [p.label, p.name.replace(/([A-Z])/g, " $1"), ...(p.aliases || [])].join(" ").toLowerCase();
}

function sceneHaystack(s) {
  return `${s.label} ${s.id.replace(/_/g, " ")}`.toLowerCase();
}

export default function GlobalCommandPalette() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Only activate on non-apex routes — AppLayout already mounts a palette there.
  const isApex = location.pathname.startsWith("/apex");
  if (isApex) return null;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("jarvis:open-palette", onOpen);
    return () => window.removeEventListener("jarvis:open-palette", onOpen);
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);
  const go = useCallback((to) => { close(); navigate(to); }, [close, navigate]);

  const askJarvis = useCallback((q) => {
    close();
    window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: q } }));
  }, [close]);

  const apexPages = useMemo(() => PAGES.filter((p) => p.dest !== "underworld"), []);

  const { sceneRows, pageRows, actionRows } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scenes = q ? SCENES.filter((s) => sceneHaystack(s).includes(q)) : SCENES;
    const pages  = q ? apexPages.filter((p) => pageHaystack(p).includes(q)) : apexPages;
    const actions = q ? GLOBAL_ACTIONS.filter((a) => a.label.toLowerCase().includes(q)) : GLOBAL_ACTIONS;
    return { sceneRows: scenes, pageRows: pages, actionRows: actions };
  }, [query, apexPages]);

  if (!open) return null;

  return (
    <>
      <style>{`
        [cmdk-item][data-selected="true"] { background: rgba(41,231,255,0.10); }
        [cmdk-item]:hover                 { background: rgba(41,231,255,0.05); }
        [cmdk-group-heading]              { display: block; }
      `}</style>
      <div
        onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        style={{
          position: "fixed", inset: 0, zIndex: 20000,
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          paddingTop: "14vh", background: "rgba(1,4,7,0.65)",
          backdropFilter: "blur(3px)",
          fontFamily: S.ui,
        }}
      >
        <Command
          shouldFilter={false}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}
          style={{
            width: "min(580px, 92vw)", maxHeight: "64vh",
            display: "flex", flexDirection: "column",
            background: "rgba(4,10,22,0.90)",
            backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
            border: `1px solid rgba(41,231,255,0.18)`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 6,
            boxShadow: `0 0 60px rgba(41,231,255,0.14), 0 0 0 1px rgba(41,231,255,0.08)`,
            overflow: "hidden",
          }}
        >
          {/* Input row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
            borderBottom: "1px solid rgba(41,231,255,0.12)", background: "transparent",
          }}>
            <span style={{ fontFamily: S.mono, color: CY, fontSize: 13, opacity: 0.9 }}>⌘K</span>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search scenes, pages, or ask JARVIS…"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#C8DDE8", fontSize: 12, fontFamily: S.ui, letterSpacing: 0.3,
              }}
            />
            <span style={{ fontFamily: S.mono, color: S.text, fontSize: 8, letterSpacing: 1 }}>ESC</span>
          </div>

          <Command.List style={{ overflowY: "auto", padding: 6 }}>
            <Command.Empty style={{ padding: "14px 12px", color: S.text, fontSize: 11 }}>
              No matches.
            </Command.Empty>

            {/* Cinematic scenes */}
            {sceneRows.length > 0 && (
              <Command.Group heading="SCENES" style={headStyle}>
                {sceneRows.map((s, i) => (
                  <PaletteRow
                    key={s.id}
                    value={`scene-${s.id}`}
                    onSelect={() => go(`/cinematic/${s.id}`)}
                    icon={s.icon}
                    label={s.label}
                    meta={`${i + 1 > 9 ? "0" : "0"}${i + 1}`}
                    accent={CY}
                  />
                ))}
              </Command.Group>
            )}

            {/* APEX pages */}
            {pageRows.length > 0 && (
              <Command.Group heading="APEX PAGES" style={headStyle}>
                {pageRows.map((p) => (
                  <PaletteRow
                    key={p.name}
                    value={`page-${p.name}`}
                    onSelect={() => go(apexUrl(p.name))}
                    icon={p.icon}
                    label={p.label}
                    meta={groupLabel(p.group)}
                    accent={groupColor(p.group)}
                  />
                ))}
              </Command.Group>
            )}

            {/* Global actions */}
            {actionRows.length > 0 && (
              <Command.Group heading="NAVIGATION" style={headStyle}>
                {actionRows.map((a) => (
                  <PaletteRow
                    key={a.id}
                    value={a.id}
                    onSelect={() => go(a.to)}
                    icon={a.icon}
                    label={a.label}
                    meta="nav"
                    accent={C.blue}
                  />
                ))}
              </Command.Group>
            )}

            {/* Ask JARVIS fallback */}
            {query.trim() && (
              <Command.Group heading="JARVIS" style={headStyle}>
                <PaletteRow
                  value="ask-jarvis"
                  onSelect={() => askJarvis(query.trim())}
                  icon="◉"
                  label={`Ask JARVIS: ${query.trim()}`}
                  meta="assistant"
                  accent={CY}
                  forceMount
                />
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </>
  );
}

const headStyle = {
  fontFamily: S.mono, fontSize: 7, letterSpacing: 2, color: S.text,
  padding: "8px 8px 4px", fontWeight: 700,
};

function PaletteRow({ value, onSelect, icon, label, meta, accent, forceMount }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      forceMount={forceMount}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
        borderRadius: 4, cursor: "pointer", fontFamily: S.ui, fontSize: 11,
        color: "#ADC1CD",
      }}
    >
      <span style={{ width: 16, textAlign: "center", color: accent, fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {meta && (
        <span style={{ fontFamily: S.mono, fontSize: 7, letterSpacing: 1, color: accent, opacity: 0.7 }}>{meta}</span>
      )}
    </Command.Item>
  );
}
