/**
 * CommandPalette — ⌘K / Ctrl+K global command search.
 * Lists every JARVIS page (from pageRegistry) + the 10 cinematic scenes
 * + every JARVIS action command (dispatches jarvis:ask events).
 * Additive-only; mounted in App.jsx next to JarvisBrain.
 * Restricted to /apex routes — cinematic routes use JarvisCommandPalette instead.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PAGES } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const CY = "#29E7FF";

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

// Every named JARVIS voice action — dispatches jarvis:ask so the real agent handles it.
const JARVIS_ACTIONS = [
  { label: "Status Report",        query: "JARVIS, status",                icon: "⊕", keywords: "status report system health" },
  { label: "Morning Briefing",     query: "JARVIS, brief me",              icon: "◎", keywords: "morning brief briefing summary" },
  { label: "Situation Report",     query: "JARVIS, sitrep",                icon: "⊕", keywords: "sitrep situation room ops overview" },
  { label: "Risk Board",           query: "show risks",                    icon: "⚠", keywords: "risks risk board signals threats" },
  { label: "Task Board",           query: "JARVIS, tasks",                 icon: "◎", keywords: "tasks missions task board" },
  { label: "Investigations",       query: "JARVIS, investigations",        icon: "◈", keywords: "investigations cases intel" },
  { label: "Datasets Browser",     query: "JARVIS, datasets",              icon: "⬡", keywords: "datasets data catalog sources" },
  { label: "Contacts Directory",   query: "JARVIS, contacts",              icon: "◈", keywords: "contacts people directory" },
  { label: "Markets Ticker",       query: "JARVIS, markets",               icon: "◆", keywords: "markets crypto forex fx ticker" },
  { label: "World Incidents",      query: "JARVIS, world incidents",       icon: "◈", keywords: "world earthquakes incidents globe" },
  { label: "Brain Growth",         query: "JARVIS, brain growth",          icon: "◈", keywords: "brain nodes synapses growth sparkline" },
  { label: "Service Diagnostics",  query: "JARVIS, service health",        icon: "⬡", keywords: "diagnostics services health check" },
  { label: "Swarm Jobs",           query: "JARVIS, swarm",                 icon: "⬡", keywords: "swarm jobs monitor running" },
  { label: "Graph Centrality",     query: "JARVIS, centrality",            icon: "◈", keywords: "graph centrality influence network" },
  { label: "Graph Communities",    query: "JARVIS, communities",           icon: "◍", keywords: "graph communities clusters" },
  { label: "Knowledge Browser",    query: "JARVIS, knowledge",             icon: "◈", keywords: "knowledge articles documents" },
  { label: "Intel Profiles",       query: "JARVIS, intel profiles",        icon: "◈", keywords: "intel profiles threat actors" },
  { label: "Intel Digest",         query: "JARVIS, intel digest",          icon: "◈", keywords: "intel digest live news" },
  { label: "Skill Scorecard",      query: "JARVIS, skills",                icon: "◈", keywords: "skills scorecard aip self-improvement" },
  { label: "Investment Portfolio",  query: "JARVIS, investments",          icon: "◆", keywords: "investments wealth portfolio" },
  { label: "Scenario Launcher",    query: "JARVIS, scenarios",             icon: "▶", keywords: "scenarios simulations run launch" },
  { label: "Document Search",      query: "JARVIS, documents",             icon: "◈", keywords: "documents reports knowledge search" },
  { label: "Entity Quick Search",  query: "JARVIS, find",                  icon: "◈", keywords: "entity search graph intel find" },
  { label: "Priority Action Queue",query: "what needs attention now",      icon: "⚡", keywords: "priority queue urgent action items" },
  { label: "Mission Readiness",    query: "JARVIS, readiness",             icon: "◎", keywords: "mission readiness operational index" },
  { label: "Crisis Level",         query: "JARVIS, crisis level",          icon: "⚠", keywords: "crisis defcon threat level warning" },
  { label: "Threat Timeline",      query: "threat timeline",               icon: "◈", keywords: "threat timeline unified feed intel" },
  { label: "Scene Health Heatmap", query: "scene health",                  icon: "⬡", keywords: "scene health heatmap anchors" },
  { label: "Health Score",         query: "JARVIS, health score",          icon: "⊕", keywords: "health score system scorecard" },
  { label: "Resource Pressure",    query: "resource pressure",             icon: "⊡", keywords: "resource pressure cpu memory load" },
  { label: "Ops Event Timeline",   query: "ops events",                    icon: "◈", keywords: "ops events timeline log" },
  { label: "Threat Report",        query: "generate threat report",        icon: "◎", keywords: "threat report intelligence adaptive" },
  { label: "Geo-Seismic Analysis", query: "geo seismic",                   icon: "◎", keywords: "geo seismic earthquake regions" },
  { label: "Graph Anomaly Detect", query: "graph anomaly",                 icon: "◈", keywords: "graph anomaly outlier unusual node" },
  { label: "Entity Chronology",    query: "JARVIS, entity chronology",     icon: "⊕", keywords: "entity chronology all entities timeline" },
  { label: "Entity Watchlist",     query: "JARVIS, watchlist",             icon: "⬡", keywords: "watchlist watched entities" },
  { label: "Ops Cases Panel",      query: "JARVIS, cases",                 icon: "◈", keywords: "ops cases case files" },
  { label: "Graph Network",        query: "JARVIS, graph network",         icon: "◈", keywords: "graph network explorer map" },
  { label: "Daily Objectives",     query: "what should I do today",        icon: "◎", keywords: "daily objectives plan today" },
  { label: "Threat Actor Network", query: "threat actor network",          icon: "◈", keywords: "threat actor network tan danger" },
  { label: "Threat Correlation",   query: "correlate threats",             icon: "⚡", keywords: "correlate threats correlation" },
  { label: "World Risk Correlator",query: "world risk",                    icon: "◈", keywords: "world risk quake geo correlate" },
  { label: "Intel Pulse",          query: "intel pulse",                   icon: "⚡", keywords: "intel pulse global activity score" },
  { label: "Scene Auto-Tour",      query: "JARVIS, start tour",            icon: "⟳", keywords: "tour auto tour cycle scenes" },
  { label: "Narrate Scene",        query: "narrate scene",                 icon: "◎", keywords: "narrate scene describe story" },
  { label: "Path from X to Y",     query: "JARVIS, show path",             icon: "⤢", keywords: "path graph explore hop" },
  { label: "Ambient Hum Toggle",   query: "JARVIS, ambient",               icon: "◇", keywords: "ambient hum reactor toggle" },
  { label: "Command History",      query: "JARVIS, history",               icon: "◷", keywords: "command history replay" },
  { label: "Report Summariser",    query: "summarize report",              icon: "◎", keywords: "report summary summarise" },
  { label: "Swarm-Task Convergence", query: "swarm task convergence",      icon: "◈", keywords: "swarm task convergence alignment" },
  { label: "Agent Chat Panel",     query: "JARVIS, open chat",             icon: "◉", keywords: "chat agent conversation panel" },
];

function buildCommands() {
  const sceneCommands = CINEMATIC_SCENES.map((s) => ({
    id: `scene:${s.id}`,
    label: s.label,
    icon: s.icon,
    group: "CINEMATIC",
    path: `/cinematic/${s.id}`,
    action: null,
    keywords: `cinematic scene ${s.label}`.toLowerCase(),
  }));

  const actionCommands = JARVIS_ACTIONS.map((a) => ({
    id: `action:${a.label.toLowerCase().replace(/\s+/g, "-")}`,
    label: a.label,
    icon: a.icon,
    group: "JARVIS",
    path: null,
    action: a.query,
    keywords: `${a.label} ${a.keywords}`.toLowerCase(),
  }));

  const pageCommands = PAGES
    .filter((p) => p.dest !== "underworld")
    .map((p) => ({
      id: `page:${p.name}`,
      label: p.label,
      icon: p.icon || "◆",
      group: (p.group || "apex").toUpperCase(),
      path: `/apex${createPageUrl(p.name)}`,
      action: null,
      keywords: [p.label, p.name, ...(p.aliases || [])].join(" ").toLowerCase(),
    }));

  return [...sceneCommands, ...actionCommands, ...pageCommands];
}

const ALL_COMMANDS = buildCommands();

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Only active on /apex routes — cinematic routes use JarvisCommandPalette
  const isApex = pathname.startsWith("/apex");

  // Restrict to /apex routes — cinematic routes use JarvisCommandPalette instead.
  if (!pathname.startsWith("/apex")) return null;

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
      if (cmd.action) {
        window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: cmd.action } }));
      } else if (cmd.path) {
        navigate(cmd.path);
      }
      close();
    },
    [navigate, close]
  );

  useEffect(() => {
    if (!isApex) return;
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
  }, [isApex]);

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
                  color: i === selected ? `${CY}AA` : "#2E4050",
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
          <span>↵ run</span>
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
