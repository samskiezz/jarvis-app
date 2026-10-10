/**
 * CommandPalette — ⌘K / Ctrl+K global command search.
 * Lists every JARVIS command: cinematic scenes, all pages, and all floating panels.
 * Panel commands dispatch jarvis:ask events; navigation commands use react-router.
 * Additive-only; mounted in App.jsx next to JarvisBrain.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

/** Panels opened by dispatching jarvis:ask with a trigger text. */
const PANEL_COMMANDS = [
  { id: "panel:risks",          label: "Open Risk Board",             icon: "⚠",  trigger: "risks",              keywords: "risk signal critical threat hazard" },
  { id: "panel:tasks",          label: "Open Task Board",             icon: "◎",  trigger: "tasks",              keywords: "task mission todo objective assignment" },
  { id: "panel:markets",        label: "Open Markets Ticker",         icon: "◆",  trigger: "markets",            keywords: "markets crypto bitcoin forex fx trading" },
  { id: "panel:investigations", label: "Open Investigations",         icon: "◈",  trigger: "investigations",     keywords: "investigations cases intel case operation" },
  { id: "panel:datasets",       label: "Open Datasets Browser",       icon: "⬡",  trigger: "datasets",           keywords: "datasets catalog ingest pipeline" },
  { id: "panel:knowledge",      label: "Open Knowledge Browser",      icon: "◈",  trigger: "knowledge",          keywords: "knowledge articles wiki entries browse" },
  { id: "panel:contacts",       label: "Open Contacts Directory",     icon: "◈",  trigger: "contacts",           keywords: "contacts people directory personnel staff" },
  { id: "panel:swarm",          label: "Open Swarm Jobs Monitor",     icon: "⬡",  trigger: "swarm jobs",         keywords: "swarm agent job fleet autonomous" },
  { id: "panel:centrality",     label: "Open Graph Centrality",       icon: "◈",  trigger: "centrality",         keywords: "centrality influence hub nodes graph rank" },
  { id: "panel:investments",    label: "Open Investment Widget",      icon: "◆",  trigger: "investments",        keywords: "investments portfolio wealth holdings assets" },
  { id: "panel:skills",         label: "Open Skill Scorecard",        icon: "◈",  trigger: "skills",             keywords: "skills scorecard aip capability" },
  { id: "panel:scenarios",      label: "Open Scenario Launcher",      icon: "▶",  trigger: "scenarios",          keywords: "scenarios simulation forecast playbook" },
  { id: "panel:documents",      label: "Open Document Search",        icon: "◈",  trigger: "documents",          keywords: "documents reports dossier papers files" },
  { id: "panel:ops",            label: "Open Ops Event Stream",       icon: "⬡",  trigger: "ops events",         keywords: "ops operations events stream log" },
  { id: "panel:graph-network",  label: "Open Graph Network Explorer", icon: "◈",  trigger: "graph network",      keywords: "graph network explorer nodes edges" },
  { id: "panel:anchors",        label: "Open Scene Anchor Drill-down",icon: "⚓", trigger: "anchors",            keywords: "anchors scene anchor drilldown detail" },
  { id: "panel:tour",           label: "Start Scene Auto-Tour",       icon: "⟳",  trigger: "start tour",         keywords: "tour auto-tour scene cycle narration" },
  { id: "panel:history",        label: "Open Command History",        icon: "◷",  trigger: "history",            keywords: "history commands recent replay" },
  { id: "panel:sitrep",         label: "Open Situation Room",         icon: "⊕",  trigger: "sitrep",             keywords: "sitrep situation room ops centre" },
  { id: "panel:path",           label: "Open Graph Path Explorer",    icon: "⤢",  trigger: "path",               keywords: "path graph connect link chain traverse" },
  { id: "panel:briefing",       label: "Morning Briefing",            icon: "◈",  trigger: "brief me",           keywords: "brief briefing morning daily debrief" },
  { id: "panel:health-score",   label: "Open System Health Scorecard",icon: "⊕",  trigger: "health score",       keywords: "health score system scorecard composite" },
  { id: "panel:entity-chrono",  label: "Open Entity Chronology",      icon: "⊕",  trigger: "entity chronology",  keywords: "entity chronology timeline entities recent" },
  { id: "panel:telemetry",      label: "Open Telemetry Recorder",     icon: "⟁",  trigger: "telemetry chart",    keywords: "telemetry cpu memory load sparkline" },
  { id: "panel:threat-actors",  label: "Open Threat Actor Network",   icon: "◈",  trigger: "threat actors",      keywords: "threat actor network danger profile" },
  { id: "panel:correlations",   label: "Open Threat Correlations",    icon: "⚡", trigger: "correlate threats",  keywords: "correlate threats risk correlation engine" },
  { id: "panel:intel-pulse",    label: "Open Intel Pulse",            icon: "⚡", trigger: "intel pulse",        keywords: "intel pulse global activity seismic score" },
  { id: "panel:scene-health",   label: "Open Scene Health Heatmap",   icon: "⬡",  trigger: "scene health",       keywords: "scene health heatmap anchor status" },
  { id: "panel:daily-plan",     label: "Open Daily Objectives",       icon: "◎",  trigger: "daily objectives",   keywords: "daily objectives plan today urgent" },
  { id: "panel:brain-growth",   label: "Open Brain Growth Sparkline", icon: "◈",  trigger: "brain growth",       keywords: "brain growth nodes synapses sparkline" },
  { id: "panel:vitals",         label: "Open Biometric Vitals",       icon: "◈",  trigger: "vitals",             keywords: "vitals biometrics health heart rate hrv" },
  { id: "panel:chat",           label: "Open Agent Chat",             icon: "◉",  trigger: "open chat",          keywords: "chat panel agent conversation transcript" },
  { id: "panel:intel-profiles", label: "Open Intel Profile Directory",icon: "◈",  trigger: "intel profiles",     keywords: "intel profile subjects persons of interest" },
  { id: "panel:communities",    label: "Open Graph Communities",      icon: "◍",  trigger: "communities",        keywords: "communities graph clusters groups" },
  { id: "panel:intel-digest",   label: "Open Intel Digest",           icon: "◈",  trigger: "intel digest",       keywords: "intel digest live news briefing" },
  { id: "panel:cases",          label: "Open Ops Cases Panel",        icon: "◈",  trigger: "cases",              keywords: "cases ops case files open closed" },
  { id: "panel:crisis",         label: "Open Crisis Early Warning",   icon: "⚠",  trigger: "crisis level",       keywords: "crisis defcon threat level early warning" },
  { id: "panel:watchlist",      label: "Open Entity Watchlist",       icon: "⬡",  trigger: "watchlist",          keywords: "watchlist watched entities pinned" },
  { id: "panel:readiness",      label: "Open Mission Readiness Index",icon: "◎",  trigger: "mission readiness",  keywords: "readiness mission ready index score" },
  { id: "panel:dataset-growth", label: "Open Dataset Growth Tracker", icon: "⟁",  trigger: "dataset growth",     keywords: "dataset growth tracker fastest growing" },
  { id: "panel:scenario-mon",   label: "Open Scenario Monitor",       icon: "▶",  trigger: "scenario monitor",   keywords: "scenario monitor running simulations status" },
  { id: "panel:priority-queue", label: "Open Priority Action Queue",  icon: "⚡", trigger: "priority queue",     keywords: "priority queue urgent items action" },
  { id: "panel:threat-velocity",label: "Open Threat Velocity Monitor",icon: "⚡", trigger: "threat velocity",    keywords: "threat velocity rate surge monitor" },
  { id: "panel:report-summ",    label: "Open Report Summariser",      icon: "◎",  trigger: "summarize report",   keywords: "report summarise summary executive" },
  { id: "panel:geo-seismic",    label: "Open Geo-Seismic Analyst",    icon: "◎",  trigger: "geo seismic",        keywords: "geo seismic earthquake regions analyst" },
  { id: "panel:entity-activity",label: "Open Entity Activity Heatmap",icon: "◈",  trigger: "entity activity",    keywords: "entity activity heatmap domain" },
  { id: "panel:graph-anomaly",  label: "Open Graph Anomaly Detector", icon: "◈",  trigger: "graph anomaly",      keywords: "graph anomaly detector outlier unusual" },
  { id: "panel:ops-timeline",   label: "Open Ops Event Timeline",     icon: "◈",  trigger: "ops events",         keywords: "ops event timeline log history" },
  { id: "panel:threat-timeline",label: "Open Threat Timeline",        icon: "◈",  trigger: "threat timeline",    keywords: "threat timeline unified feed intel" },
  { id: "panel:decision-ledger",label: "Open Decision Ledger",        icon: "◈",  trigger: "decision ledger",    keywords: "decision ledger log strategic choices" },
  { id: "panel:resource-press", label: "Open Resource Pressure",      icon: "⊡",  trigger: "resource pressure",  keywords: "resource pressure load cpu memory" },
  { id: "panel:scene-narrator", label: "Narrate Current Scene",       icon: "◎",  trigger: "narrate scene",      keywords: "narrate scene describe story narrator" },
  { id: "panel:ambient",        label: "Toggle Ambient Reactor Hum",  icon: "◇",  trigger: "ambient",            keywords: "ambient reactor hum toggle audio" },
];

function buildCommands() {
  const sceneCommands = CINEMATIC_SCENES.map((s) => ({
    id: `scene:${s.id}`,
    label: s.label,
    icon: s.icon,
    group: "CINEMATIC",
    type: "navigate",
    path: `/cinematic/${s.id}`,
    keywords: `cinematic scene ${s.label}`.toLowerCase(),
  }));

  const panelCommands = PANEL_COMMANDS.map((p) => ({
    ...p,
    group: "PANEL",
    type: "panel",
    keywords: `${p.label} ${p.keywords}`.toLowerCase(),
  }));

  const pageCommands = PAGES
    .filter((p) => p.dest !== "underworld")
    .map((p) => ({
      id: `page:${p.name}`,
      label: p.label,
      icon: p.icon || "◆",
      group: (p.group || "apex").toUpperCase(),
      type: "navigate",
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
      if (cmd.type === "panel") {
        window.dispatchEvent(
          new CustomEvent("jarvis:ask", { detail: { text: cmd.trigger, query: cmd.trigger } })
        );
      } else {
        navigate(cmd.path);
      }
      close();
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
                    ? (cmd.type === "panel" ? "#FFD700AA" : `${CY}AA`)
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
