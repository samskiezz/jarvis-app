/**
 * CinematicCommandPalette — ⌘K command palette for cinematic + landing routes.
 *
 * Mounted globally in App.jsx alongside JarvisBrain. Guards itself from
 * activating on /apex/* because AppLayout already renders CommandPalette there.
 *
 * Commands: 10 cinematic scenes (navigate) + home/apex/underworld actions +
 * "Ask JARVIS" fallback (dispatches jarvis:ask for JarvisBrain to handle).
 * No backend calls — pure navigation, per F01 spec.
 */
import { useCallback, useEffect, useState } from "react";
import { Command } from "cmdk";
import { useLocation, useNavigate } from "react-router-dom";
import { SHELL as S } from "@/domain/colors";
import { CINEMATIC_SCENES } from "@/lib/cinematicSceneRegistry";

const CY = "#29E7FF";
const CY_DIM = "rgba(41,231,255,0.15)";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const EXTRA_ACTIONS = [
  { id: "act-home",       label: "JARVIS Home",   icon: "⌂",  to: "/"             },
  { id: "act-apex",       label: "Open APEX",     icon: "→",  to: "/apex"         },
  { id: "act-underworld", label: "Underworld",    icon: "⬇",  to: "/apex/Underworld" },
];

export default function CinematicCommandPalette() {
  const loc      = useLocation();
  const navigate = useNavigate();
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");

  // ⌘K / Ctrl+K — skip on /apex (AppLayout's CommandPalette handles that)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== "k" && e.key !== "K")) return;
      if (window.location.pathname.startsWith("/apex")) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Programmatic open (e.g. from a button dispatching jarvis:open-palette)
  useEffect(() => {
    const onOpen = () => {
      if (!window.location.pathname.startsWith("/apex")) setOpen(true);
    };
    window.addEventListener("jarvis:open-palette", onOpen);
    return () => window.removeEventListener("jarvis:open-palette", onOpen);
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);
  const go    = useCallback((to) => { close(); navigate(to); }, [close, navigate]);

  const askJarvis = useCallback((q) => {
    close();
    window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { query: q } }));
  }, [close]);

  // Suppress entirely on /apex (CommandPalette is already there)
  if (loc.pathname.startsWith("/apex") || !open) return null;

  const q = query.trim().toLowerCase();
  const sceneRows  = q
    ? CINEMATIC_SCENES.filter((s) => s.label.toLowerCase().includes(q) || s.rail.toLowerCase().includes(q))
    : CINEMATIC_SCENES;
  const actionRows = q
    ? EXTRA_ACTIONS.filter((a) => a.label.toLowerCase().includes(q))
    : EXTRA_ACTIONS;

  return (
    <>
      <style>{`
        .ccp-item[data-selected="true"] { background: rgba(41,231,255,0.09); }
        .ccp-item:hover                 { background: rgba(41,231,255,0.05); }
        [cmdk-group-heading]            { display: block; }
      `}</style>

      {/* Scrim */}
      <div
        onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        style={{
          position: "fixed", inset: 0, zIndex: 20000,
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          paddingTop: "14vh",
          background: "rgba(1,3,6,0.65)",
          backdropFilter: "blur(3px)",
          fontFamily: MONO,
        }}
      >
        <Command
          shouldFilter={false}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}
          style={{
            width: "min(560px,92vw)", maxHeight: "62vh",
            display: "flex", flexDirection: "column",
            background: "rgba(3,8,16,0.92)",
            backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
            border: `1px solid ${CY_DIM}`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            boxShadow: `0 0 60px rgba(41,231,255,0.14), 0 8px 40px rgba(0,0,0,0.8)`,
            overflow: "hidden",
          }}
        >
          {/* Input row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 9, padding: "10px 14px",
            borderBottom: `1px solid ${CY_DIM}`,
          }}>
            <span style={{ color: CY, fontSize: 16, opacity: 0.75 }}>⌘</span>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Scene, action, or ask JARVIS…"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#DCEBF5", fontSize: 13, fontFamily: MONO, letterSpacing: 0.3,
              }}
            />
            <span style={{ color: S.text, fontSize: 9, letterSpacing: 1 }}>ESC</span>
          </div>

          <Command.List style={{ overflowY: "auto", padding: 5 }}>
            <Command.Empty style={{ padding: "14px 12px", color: S.text, fontSize: 12, fontFamily: MONO }}>
              No matches.
            </Command.Empty>

            {sceneRows.length > 0 && (
              <Command.Group heading="SCENES" style={groupStyle}>
                {sceneRows.map((s, i) => (
                  <Command.Item
                    key={s.id}
                    className="ccp-item"
                    value={`scene-${s.id}`}
                    onSelect={() => go(s.route)}
                    style={itemStyle}
                  >
                    <span style={{ width: 22, textAlign: "center", color: CY, fontSize: 11,
                      fontFamily: MONO, opacity: 0.55, flexShrink: 0 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ flex: 1, color: "#DCEBF5", whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.label}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      color: CY, opacity: 0.5 }}>
                      {s.rail}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {actionRows.length > 0 && (
              <Command.Group heading="NAVIGATION" style={groupStyle}>
                {actionRows.map((a) => (
                  <Command.Item
                    key={a.id}
                    className="ccp-item"
                    value={a.id}
                    onSelect={() => go(a.to)}
                    style={itemStyle}
                  >
                    <span style={{ width: 22, textAlign: "center", color: "#0096d4",
                      fontSize: 14, flexShrink: 0 }}>{a.icon}</span>
                    <span style={{ flex: 1, color: "#DCEBF5" }}>{a.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      color: "#0096d4", opacity: 0.6 }}>nav</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {query.trim() && (
              <Command.Group heading="JARVIS" style={groupStyle}>
                <Command.Item
                  className="ccp-item"
                  value="ask-jarvis"
                  forceMount
                  onSelect={() => askJarvis(query.trim())}
                  style={itemStyle}
                >
                  <span style={{ width: 22, textAlign: "center", color: CY,
                    fontSize: 14, flexShrink: 0 }}>◆</span>
                  <span style={{ flex: 1, color: "#DCEBF5", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis" }}>
                    Ask Jarvis: {query.trim()}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                    color: CY, opacity: 0.6 }}>ASSISTANT</span>
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </>
  );
}

const groupStyle = {
  fontFamily: MONO, fontSize: 7, letterSpacing: 2,
  color: "#3a5060", padding: "7px 8px 3px", fontWeight: 700,
};

const itemStyle = {
  display: "flex", alignItems: "center", gap: 9,
  padding: "7px 10px", borderRadius: 6, cursor: "pointer",
  fontFamily: MONO, fontSize: 12,
};
