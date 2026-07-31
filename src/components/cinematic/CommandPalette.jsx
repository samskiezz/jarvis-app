/**
 * CommandPalette — ⌘K / Ctrl+K global command search.
 * Lists every JARVIS page (from pageRegistry) + the 10 cinematic scenes.
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

function buildCommands() {
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

  return [...sceneCommands, ...pageCommands];
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
      navigate(cmd.path);
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
