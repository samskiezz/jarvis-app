/**
 * JarvisCommandPalette — global ⌘K / Ctrl+K command palette for the
 * cinematic experience. On /apex routes the existing cmdk-based
 * CommandPalette (Layout.jsx) takes over; this one serves the home
 * selector + all 10 cinematic scenes where no palette existed.
 *
 * Three command groups:
 *  SCENES  — navigate to any of the 10 real /cinematic/{id} routes
 *  PANELS  — open any of the 40 live-data panels via jarvis:ask dispatch
 *  ASK     — free-text fallback to the JARVIS agent (shown while typing)
 *
 * Also exports isCommandPaletteQuery for JarvisBrain wiring.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CINEMATIC_SCENES } from "@/lib/cinematicSceneRegistry";

const CY = "#29E7FF";
const GR = "#00c878";
const PU = "#a855f7";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

// Every panel with its trigger query (used by jarvis:ask → JarvisBrain)
const PANEL_COMMANDS = [
  { id: "pc-status",       label: "System Status",          query: "status",              hint: "health" },
  { id: "pc-intel",        label: "Live World Intel",        query: "world intel",         hint: "world" },
  { id: "pc-markets",      label: "Markets & Crypto",        query: "markets",             hint: "finance" },
  { id: "pc-risks",        label: "Risk Signals",            query: "risks",               hint: "risk" },
  { id: "pc-tasks",        label: "Task Board",              query: "show tasks",          hint: "ops" },
  { id: "pc-investigations", label: "Investigations",       query: "investigations",      hint: "intel" },
  { id: "pc-scenarios",    label: "Scenario Launcher",       query: "scenarios",           hint: "sim" },
  { id: "pc-docs",         label: "Document Search",         query: "documents",           hint: "vault" },
  { id: "pc-skills",       label: "Skill Scorecard",         query: "skills",              hint: "aip" },
  { id: "pc-brain",        label: "Brain Growth",            query: "brain",               hint: "cognition" },
  { id: "pc-datasets",     label: "Datasets Browser",        query: "datasets",            hint: "data" },
  { id: "pc-anchors",      label: "Scene Anchors",           query: "anchors",             hint: "scenes" },
  { id: "pc-contacts",     label: "Contacts Directory",      query: "contacts",            hint: "people" },
  { id: "pc-investments",  label: "Investment Portfolio",    query: "investments",         hint: "wealth" },
  { id: "pc-swarm",        label: "Swarm Jobs",              query: "swarm jobs",          hint: "agents" },
  { id: "pc-centrality",   label: "Graph Centrality",        query: "centrality",          hint: "graph" },
  { id: "pc-diagnostics",  label: "Service Diagnostics",     query: "diagnostics",         hint: "system" },
  { id: "pc-history",      label: "Command History",         query: "history",             hint: "log" },
  { id: "pc-tour",         label: "Scene Auto-Tour",         query: "tour",                hint: "tour" },
  { id: "pc-profiles",     label: "Intel Profiles",          query: "intel profiles",      hint: "intel" },
  { id: "pc-health",       label: "Scene Health Heatmap",    query: "scene health",        hint: "scenes" },
  { id: "pc-briefing",     label: "Morning Briefing",        query: "briefing",            hint: "brief" },
  { id: "pc-knowledge",    label: "Knowledge Browser",       query: "knowledge",           hint: "know" },
  { id: "pc-ops",          label: "Ops Event Stream",        query: "ops events",          hint: "ops" },
  { id: "pc-path",         label: "Graph Path Explorer",     query: "graph path",          hint: "graph" },
  { id: "pc-reports",      label: "Report Summariser",       query: "summarise reports",   hint: "docs" },
  { id: "pc-acq",          label: "Data Acquisition",        query: "acquisition",         hint: "ingest" },
  { id: "pc-registry",     label: "Entity Registry",         query: "registry",            hint: "entities" },
  { id: "pc-timeline",     label: "Threat Timeline",         query: "timeline",            hint: "threat" },
  { id: "pc-hum",          label: "Ambient Reactor Hum",     query: "ambient hum",         hint: "audio" },
  { id: "pc-clock",        label: "Live Clock & Uptime",     query: "clock",               hint: "time" },
];

function lc(s) { return String(s || "").toLowerCase(); }

function filter(q, scenes, panels) {
  if (!q) return { scenes, panels };
  const t = lc(q);
  return {
    scenes: scenes.filter((s) => lc(s.label).includes(t) || lc(s.rail).includes(t) || lc(s.id).includes(t)),
    panels: panels.filter((p) => lc(p.label).includes(t) || lc(p.hint).includes(t) || lc(p.query).includes(t)),
  };
}

export function isCommandPaletteQuery(q) {
  return /\b(palette|command\s*palette|open\s*palette|show\s*palette)\b/i.test(q);
}

export default function JarvisCommandPalette() {
  const location = useLocation();
  const navigate  = useNavigate();
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel]     = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);
  const isApex = location.pathname.startsWith("/apex");

  // ⌘K / Ctrl+K toggle — only on non-APEX routes
  useEffect(() => {
    if (isApex) return;
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault(); setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isApex]);

  // jarvis:open-palette event (from toggle button or JarvisBrain wiring)
  useEffect(() => {
    if (isApex) return;
    const h = () => setOpen(true);
    window.addEventListener("jarvis:open-palette", h);
    return () => window.removeEventListener("jarvis:open-palette", h);
  }, [isApex]);

  const close = useCallback(() => { setOpen(false); setQuery(""); setSel(0); }, []);

  const { scenes: fs, panels: fp } = filter(query.trim(), CINEMATIC_SCENES, PANEL_COMMANDS);

  const flat = [
    ...fs.map((s)  => ({ kind: "scene", item: s })),
    ...fp.map((p)  => ({ kind: "panel", item: p })),
    ...(query.trim() ? [{ kind: "ask", item: { id: "ask", label: query.trim() } }] : []),
  ];

  const maxSel = Math.max(0, flat.length - 1);
  const csel   = Math.min(sel, maxSel);

  function run(entry) {
    if (!entry) return;
    close();
    if (entry.kind === "scene") {
      navigate(entry.item.route);
    } else {
      const q = entry.kind === "ask" ? entry.item.label : entry.item.query;
      window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { query: q } }));
    }
  }

  useEffect(() => {
    if (!open) return;
    setSel(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape")    { e.preventDefault(); close(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(v + 1, maxSel)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
      if (e.key === "Enter")     { e.preventDefault(); run(flat[csel]); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flat, csel, maxSel]);

  // Scroll selected row into view
  useEffect(() => {
    listRef.current?.querySelector(`[data-sel="${csel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [csel]);

  const sceneStart  = 0;
  const panelStart  = fs.length;
  const askIdx      = fs.length + fp.length;

  return (
    <>
      {/* Toggle button — always visible on non-APEX routes */}
      {!isApex && (
        <button
          onClick={() => setOpen((v) => !v)}
          title="Command Palette (⌘K)"
          style={{
            position: "fixed", bottom: 10, left: 2988, zIndex: 80,
            background: open ? "rgba(41,231,255,0.18)" : "rgba(5,12,20,0.75)",
            border: `1px solid ${open ? CY : "rgba(41,231,255,0.2)"}`,
            color: CY, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
            padding: "4px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
            backdropFilter: "blur(6px)",
          }}
        >⌘K PAL</button>
      )}

      {/* Palette overlay */}
      {!isApex && open && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 30000,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: "12vh",
            background: "rgba(1,4,8,0.68)",
            backdropFilter: "blur(3px)",
            fontFamily: SANS,
          }}
        >
          <div style={{
            width: "min(600px,93vw)", maxHeight: "66vh", display: "flex", flexDirection: "column",
            background: "rgba(5,12,20,0.90)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: `1px solid rgba(41,231,255,0.18)`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 12,
            boxShadow: `0 0 70px rgba(41,231,255,0.12), 0 24px 64px rgba(0,0,0,0.75)`,
            overflow: "hidden",
          }}>
            {/* Input */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "11px 14px",
              borderBottom: "1px solid rgba(41,231,255,0.09)",
            }}>
              <span style={{ fontFamily: MONO, color: CY, fontSize: 14, opacity: 0.8, userSelect: "none" }}>⌘</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSel(0); }}
                placeholder="Navigate scenes, open panels, or ask JARVIS…"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#D0E8F5", fontSize: 14, fontFamily: SANS, letterSpacing: 0.2,
                }}
              />
              <span style={{ fontFamily: MONO, color: "#3a5060", fontSize: 10, letterSpacing: 1.5, userSelect: "none" }}>ESC</span>
            </div>

            {/* Results list */}
            <div ref={listRef} style={{ overflowY: "auto", padding: "5px 6px 8px" }}>

              {fs.length > 0 && (
                <>
                  <Grp>Scenes</Grp>
                  {fs.map((s, i) => (
                    <Row
                      key={s.id}
                      seli={sceneStart + i}
                      csel={csel}
                      icon={String(i + 1).padStart(2, "0")}
                      label={s.label}
                      meta={s.rail}
                      accent={CY}
                      onSelect={() => run({ kind: "scene", item: s })}
                      onHover={() => setSel(sceneStart + i)}
                    />
                  ))}
                </>
              )}

              {fp.length > 0 && (
                <>
                  <Grp>Live Panels</Grp>
                  {fp.map((p, i) => (
                    <Row
                      key={p.id}
                      seli={panelStart + i}
                      csel={csel}
                      icon="◆"
                      label={p.label}
                      meta={p.hint}
                      accent={GR}
                      onSelect={() => run({ kind: "panel", item: p })}
                      onHover={() => setSel(panelStart + i)}
                    />
                  ))}
                </>
              )}

              {query.trim() && (
                <>
                  <Grp>Ask JARVIS</Grp>
                  <Row
                    seli={askIdx}
                    csel={csel}
                    icon="◈"
                    label={`"${query.trim()}"`}
                    meta="agent"
                    accent={PU}
                    onSelect={() => run({ kind: "ask", item: { label: query.trim() } })}
                    onHover={() => setSel(askIdx)}
                  />
                </>
              )}

              {flat.length === 0 && (
                <div style={{
                  padding: "20px 14px", color: "#3a5060", fontSize: 13,
                  fontFamily: MONO, textAlign: "center",
                }}>
                  No matches — press Enter to ask JARVIS directly.
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div style={{
              padding: "6px 14px", borderTop: "1px solid rgba(41,231,255,0.07)",
              display: "flex", gap: 16, fontFamily: MONO, fontSize: 10, color: "#3a5060",
            }}>
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
              <span style={{ marginLeft: "auto" }}>{flat.length} result{flat.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Grp({ children }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, color: "#3a5060",
      padding: "8px 10px 3px", fontWeight: 700, userSelect: "none",
    }}>
      {children}
    </div>
  );
}

function Row({ seli, csel, icon, label, meta, accent, onSelect, onHover }) {
  const sel = seli === csel;
  return (
    <div
      data-sel={seli}
      onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
      onMouseEnter={onHover}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
        borderRadius: 7, cursor: "pointer",
        background: sel ? "rgba(41,231,255,0.07)" : "transparent",
        borderLeft: `2px solid ${sel ? accent : "transparent"}`,
        transition: "background 0.08s",
      }}
    >
      <span style={{ width: 20, textAlign: "center", color: accent, fontFamily: MONO, fontSize: 11, flexShrink: 0, opacity: 0.9 }}>
        {icon}
      </span>
      <span style={{ flex: 1, color: "#C0DCE8", fontSize: 13, fontFamily: SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      {meta && (
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: accent, opacity: 0.6 }}>
          {meta}
        </span>
      )}
    </div>
  );
}
