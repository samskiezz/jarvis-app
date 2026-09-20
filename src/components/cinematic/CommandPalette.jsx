/**
 * CommandPalette — ⌘K / Ctrl+K global command search.
 * Lists every JARVIS page (from pageRegistry) + the 10 cinematic scenes
 * + all live-data panel commands (dispatched via jarvis:ask).
 * Additive-only; mounted in App.jsx next to JarvisBrain.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PAGES } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const CY = "#29E7FF";
const GR = "#00c878";

const CINEMATIC_SCENES = [
  { id: "01_command_atrium",          label: "Command Atrium",         icon: "◈" },
  { id: "02_ai_core_chamber",         label: "AI Core Chamber",        icon: "◈" },
  { id: "03_world_control_room",      label: "World Control Room",     icon: "◈" },
  { id: "04_intelligence_graph_space",label: "Intelligence Graph",     icon: "◈" },
  { id: "05_operations_war_room",     label: "Operations War Room",    icon: "◈" },
  { id: "06_data_fusion_reactor",     label: "Data Fusion Reactor",    icon: "◈" },
  { id: "07_document_intelligence_vault", label: "Document Vault",     icon: "◈" },
  { id: "08_simulation_theatre",      label: "Simulation Theatre",     icon: "◈" },
  { id: "09_analytics_observatory",   label: "Analytics Observatory",  icon: "◈" },
  { id: "10_system_security_core",    label: "System Security Core",   icon: "◈" },
];

// Live-data panel commands — dispatched via jarvis:ask → JarvisBrain
const PANEL_COMMANDS = [
  { id: "pc-status",       label: "System Status",          query: "status",              hint: "PANEL" },
  { id: "pc-intel",        label: "Live World Intel",        query: "world intel",         hint: "PANEL" },
  { id: "pc-markets",      label: "Markets & Crypto",        query: "markets",             hint: "PANEL" },
  { id: "pc-risks",        label: "Risk Signals",            query: "risks",               hint: "PANEL" },
  { id: "pc-tasks",        label: "Task Board",              query: "show tasks",          hint: "PANEL" },
  { id: "pc-investigations", label: "Investigations",       query: "investigations",      hint: "PANEL" },
  { id: "pc-scenarios",    label: "Scenario Launcher",       query: "scenarios",           hint: "PANEL" },
  { id: "pc-docs",         label: "Document Search",         query: "documents",           hint: "PANEL" },
  { id: "pc-skills",       label: "Skill Scorecard",         query: "skills",              hint: "PANEL" },
  { id: "pc-brain",        label: "Brain Growth",            query: "brain",               hint: "PANEL" },
  { id: "pc-datasets",     label: "Datasets Browser",        query: "datasets",            hint: "PANEL" },
  { id: "pc-anchors",      label: "Scene Anchors",           query: "anchors",             hint: "PANEL" },
  { id: "pc-contacts",     label: "Contacts Directory",      query: "contacts",            hint: "PANEL" },
  { id: "pc-investments",  label: "Investment Portfolio",    query: "investments",         hint: "PANEL" },
  { id: "pc-swarm",        label: "Swarm Jobs",              query: "swarm jobs",          hint: "PANEL" },
  { id: "pc-centrality",   label: "Graph Centrality",        query: "centrality",          hint: "PANEL" },
  { id: "pc-diagnostics",  label: "Service Diagnostics",     query: "diagnostics",         hint: "PANEL" },
  { id: "pc-history",      label: "Command History",         query: "history",             hint: "PANEL" },
  { id: "pc-tour",         label: "Scene Auto-Tour",         query: "tour",                hint: "PANEL" },
  { id: "pc-profiles",     label: "Intel Profiles",          query: "intel profiles",      hint: "PANEL" },
  { id: "pc-health",       label: "Scene Health Heatmap",    query: "scene health",        hint: "PANEL" },
  { id: "pc-briefing",     label: "Morning Briefing",        query: "briefing",            hint: "PANEL" },
  { id: "pc-knowledge",    label: "Knowledge Browser",       query: "knowledge",           hint: "PANEL" },
  { id: "pc-ops",          label: "Ops Event Stream",        query: "ops events",          hint: "PANEL" },
  { id: "pc-path",         label: "Graph Path Explorer",     query: "graph path",          hint: "PANEL" },
  { id: "pc-reports",      label: "Report Summariser",       query: "summarise reports",   hint: "PANEL" },
  { id: "pc-acq",          label: "Data Acquisition",        query: "acquisition",         hint: "PANEL" },
  { id: "pc-registry",     label: "Entity Registry",         query: "registry",            hint: "PANEL" },
  { id: "pc-timeline",     label: "Threat Timeline",         query: "timeline",            hint: "PANEL" },
  { id: "pc-hum",          label: "Ambient Reactor Hum",     query: "ambient hum",         hint: "PANEL" },
  { id: "pc-clock",        label: "Live Clock & Uptime",     query: "clock",               hint: "PANEL" },
];

function buildCommands() {
  const sceneCommands = CINEMATIC_SCENES.map((s) => ({
    id: `scene:${s.id}`,
    label: s.label,
    icon: s.icon,
    group: "CINEMATIC",
    action: "navigate",
    path: `/cinematic/${s.id}`,
    keywords: `cinematic scene ${s.label}`.toLowerCase(),
  }));

  const panelCommands = PANEL_COMMANDS.map((p) => ({
    id: p.id,
    label: p.label,
    icon: "⬡",
    group: "PANEL",
    action: "ask",
    query: p.query,
    keywords: `panel ${p.label} ${p.query}`.toLowerCase(),
  }));

  const pageCommands = PAGES
    .filter((p) => p.dest !== "underworld")
    .map((p) => ({
      id: `page:${p.name}`,
      label: p.label,
      icon: p.icon || "◆",
      group: (p.group || "apex").toUpperCase(),
      action: "navigate",
      path: `/apex${createPageUrl(p.name)}`,
      keywords: [p.label, p.name, ...(p.aliases || [])].join(" ").toLowerCase(),
    }));

  return [...sceneCommands, ...panelCommands, ...pageCommands];
}

const ALL_COMMANDS = buildCommands();

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = query.trim()
    ? ALL_COMMANDS.filter(
        (c) =>
          c.keywords.includes(query.toLowerCase()) ||
          c.label.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_COMMANDS;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
  }, []);

  const run = useCallback(
    (cmd) => {
      close();
      if (cmd.action === "ask") {
        window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { query: cmd.query } }));
      } else {
        navigate(cmd.path);
      }
    },
    [navigate, close]
  );

  useEffect(() => {
    const onKey = (e) => {
      const isModifier = e.metaKey || e.ctrlKey;
      if (isModifier && e.key === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) { setQuery(""); setSelected(0); }
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selected];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKeyDown(e) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === "Enter" && filtered[selected]) {
      run(filtered[selected]);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,4,10,0.72)",
          backdropFilter: "blur(5px)",
        }}
      />

      {/* Palette panel */}
      <div
        style={{
          position: "fixed", top: "14vh", left: "50%",
          transform: "translateX(-50%)",
          width: "min(680px, 92vw)", zIndex: 201,
          background: "rgba(5,10,18,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 16, overflow: "hidden",
          boxShadow: `0 0 90px ${CY}18, 0 28px 56px rgba(0,0,0,0.85)`,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {/* Search row */}
        <div
          style={{
            display: "flex", alignItems: "center",
            borderBottom: `1px solid ${CY}33`,
            padding: "12px 18px", gap: 12,
          }}
        >
          <span style={{ color: CY, fontSize: 16, flexShrink: 0, letterSpacing: 0 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search JARVIS commands…"
            style={{
              flex: 1, background: "transparent",
              border: "none", outline: "none",
              color: "#DCEBF5", fontSize: 14, letterSpacing: 1,
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              background: "rgba(41,231,255,0.08)", border: `1px solid ${CY}33`,
              borderRadius: 5, padding: "2px 7px",
              color: "#4E6070", fontSize: 10, letterSpacing: 1,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} style={{ maxHeight: "54vh", overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div
              style={{
                padding: "22px 18px", color: "#4E6070",
                fontSize: 12, textAlign: "center", letterSpacing: 1,
              }}
            >
              No commands found
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onClick={() => run(cmd)}
              onMouseEnter={() => setSelected(i)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "9px 18px", cursor: "pointer",
                background: i === selected ? `${CY}12` : "transparent",
                borderLeft: i === selected ? `2px solid ${CY}` : "2px solid transparent",
              }}
            >
              <span
                style={{
                  width: 22, textAlign: "center", fontSize: 14,
                  flexShrink: 0, opacity: i === selected ? 1 : 0.6,
                }}
              >
                {cmd.icon}
              </span>
              <span
                style={{
                  color: i === selected ? "#DCEBF5" : "#7A95AB",
                  fontSize: 13, flex: 1, letterSpacing: 0.5,
                }}
              >
                {cmd.label}
              </span>
              <span
                style={{
                  color: i === selected
                    ? (cmd.group === "PANEL" ? `${GR}CC` : `${CY}AA`)
                    : "#2E4050",
                  fontSize: 10, letterSpacing: 2, flexShrink: 0,
                }}
              >
                {cmd.group}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div
          style={{
            borderTop: `1px solid ${CY}1A`,
            padding: "7px 18px",
            display: "flex", gap: 18,
            color: "#2E4050", fontSize: 10, letterSpacing: 1,
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>ESC close</span>
          <span style={{ marginLeft: "auto" }}>
            {filtered.length} command{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${CY}33; border-radius: 2px; }
      `}</style>
    </>
  );
}
