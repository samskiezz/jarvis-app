/**
 * CommandPalette — ⌘K / Ctrl+K global command search.
 * Lists every JARVIS page (from pageRegistry) + the 10 cinematic scenes +
 * JARVIS agent action commands wired to /v1/jarvis/agent/chat via jarvis:ask.
 * Additive-only; mounted in App.jsx next to JarvisBrain.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PAGES } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const CY = "#29E7FF";
const AM = "#F59E0B"; // amber for actions group

// JARVIS agent action commands — dispatch jarvis:ask → JarvisBrain → /v1/jarvis/agent/chat
const JARVIS_ACTIONS = [
  { label: "Status Report",        phrase: "What is the current system status and brain health?",         icon: "◎", keywords: "status system health cpu memory brain" },
  { label: "Markets Brief",        phrase: "JARVIS, markets",                                             icon: "◈", keywords: "markets crypto fx currency bitcoin finance" },
  { label: "Risk Overview",        phrase: "JARVIS, show current risks",                                  icon: "⚠", keywords: "risks risk signals threats threat danger critical" },
  { label: "Mission Tasks",        phrase: "JARVIS, what are the current mission tasks?",                 icon: "◆", keywords: "tasks missions tasks board goals objectives" },
  { label: "Morning Briefing",     phrase: "JARVIS, brief me",                                            icon: "◎", keywords: "brief briefing morning summary overview today" },
  { label: "Intelligence Digest",  phrase: "JARVIS, intel digest",                                        icon: "◈", keywords: "intel intelligence digest news quake seismic" },
  { label: "Brain Growth Trend",   phrase: "JARVIS, brain growth trend",                                  icon: "⟁", keywords: "brain growth nodes synapses knowledge trend" },
  { label: "System Health Score",  phrase: "JARVIS, system health score",                                 icon: "⊕", keywords: "health score composite scorecard performance" },
  { label: "Investigations Status",phrase: "JARVIS, what are the open investigations?",                   icon: "◉", keywords: "investigations cases open intel files" },
  { label: "Crisis Level",         phrase: "JARVIS, what is the current crisis level?",                   icon: "⚡", keywords: "crisis defcon threat level emergency alert" },
  { label: "Swarm Status",         phrase: "JARVIS, swarm status",                                        icon: "⬡", keywords: "swarm jobs agents automation running" },
  { label: "Graph Centrality",     phrase: "JARVIS, who has the most influence in the network?",          icon: "✶", keywords: "graph centrality network influence nodes entities" },
  { label: "Priority Actions",     phrase: "JARVIS, what needs immediate attention right now?",            icon: "⚡", keywords: "priority urgent attention actions queue" },
  { label: "Scenario Monitor",     phrase: "JARVIS, what scenarios are currently running?",               icon: "▶", keywords: "scenario simulation running monitor" },
  { label: "Ops Event Stream",     phrase: "JARVIS, what are the latest operational events?",             icon: "⬡", keywords: "ops events operations events log stream" },
  { label: "Dataset Overview",     phrase: "JARVIS, show me the dataset catalog",                         icon: "⟁", keywords: "datasets catalog data sources catalog" },
  { label: "Knowledge Search",     phrase: "JARVIS, show knowledge articles",                             icon: "◈", keywords: "knowledge articles docs documents reports" },
  { label: "Contacts Directory",   phrase: "JARVIS, show contacts",                                       icon: "◈", keywords: "contacts people directory personnel" },
  { label: "Skills Scorecard",     phrase: "JARVIS, show skill scorecard",                                icon: "◈", keywords: "skills aip scorecard capability improvement" },
  { label: "Situation Report",     phrase: "JARVIS, give me a full situation report",                     icon: "◎", keywords: "sitrep situation operational picture brief full" },
];

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

function buildCommands() {
  const actionCommands = JARVIS_ACTIONS.map((a) => ({
    id: `action:${a.label}`,
    label: a.label,
    icon: a.icon,
    group: "ACTIONS",
    action: a.phrase,
    keywords: a.keywords,
  }));

  const sceneCommands = CINEMATIC_SCENES.map((s) => ({
    id: `scene:${s.id}`,
    label: s.label,
    icon: s.icon,
    group: "CINEMATIC",
    path: `/cinematic/${s.id}`,
    keywords: `cinematic scene ${s.label}`.toLowerCase(),
  }));

  const pageCommands = PAGES
    .filter((p) => p.dest !== "underworld")
    .map((p) => ({
      id: `page:${p.name}`,
      label: p.label,
      icon: p.icon || "◆",
      group: (p.group || "apex").toUpperCase(),
      path: `/apex${createPageUrl(p.name)}`,
      keywords: [p.label, p.name, ...(p.aliases || [])].join(" ").toLowerCase(),
    }));

  return [...actionCommands, ...sceneCommands, ...pageCommands];
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
      if (cmd.action) {
        window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: cmd.action } }));
      } else if (cmd.path) {
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
                    ? (cmd.group === "ACTIONS" ? AM : `${CY}AA`)
                    : (cmd.group === "ACTIONS" ? `${AM}66` : "#2E4050"),
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
