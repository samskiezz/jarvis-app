/**
 * DomainRail — the collapsed-by-default domain navigation rail.
 *
 * Replaces the old inline nav dock in Layout.jsx. By default it's an icon-only
 * ~52px rail: an APEX home glyph, one glyph per of the six domains (in their
 * accent colours), and a ⌘K affordance at the bottom. Hovering or clicking a
 * domain glyph opens a flyout of that domain's pages; the active page/domain is
 * highlighted with its accent.
 *
 * Keyboard:
 *   ⌘1..⌘6  → jump to the first page of each domain (rail order)
 *   ⌘\      → toggle the rail expanded/collapsed
 * (⌘K is owned by CommandPalette.)
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { COLORS as C } from "@/domain/colors";
import { pagesByGroup, HOME_PAGE } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const APEX_BASE = "/apex";
const apexUrl = (name) => `${APEX_BASE}${createPageUrl(name)}`;

const RAIL_W = 52;
const RAIL_W_EXPANDED = 196;

// Per-domain glyph so the rail reads without labels.
const DOMAIN_GLYPH = {
  intel: "🛰", command: "⌘", cognition: "🧠", apex: "◉", knowledge: "📚", wealth: "💎",
};

export default function DomainRail() {
  const loc = useLocation();
  const navigate = useNavigate();
  const groups = pagesByGroup();

  const [expanded, setExpanded] = useState(false);
  const [flyout, setFlyout] = useState(null); // group id currently shown
  const closeTimer = useRef(null);

  const isActivePath = (name) => loc.pathname === apexUrl(name);
  const activeGroup = groups.find((g) => g.pages.some((p) => isActivePath(p.name)))?.id;

  // ⌘1..⌘6 → first page of each domain; ⌘\ toggles expanded.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "\\") {
        e.preventDefault();
        setExpanded((v) => !v);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= groups.length) {
        const g = groups[n - 1];
        const first = g?.pages?.[0];
        if (first) { e.preventDefault(); navigate(apexUrl(first.name)); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groups, navigate]);

  const openFlyout = (id) => {
    clearTimeout(closeTimer.current);
    setFlyout(id);
  };
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyout(null), 160);
  };

  const w = expanded ? RAIL_W_EXPANDED : RAIL_W;
  const activeFlyoutGroup = groups.find((g) => g.id === flyout);

  return (
    <nav
      style={{
        width: w, flexShrink: 0, background: "rgba(2,6,10,0.99)",
        borderRight: `1px solid ${C.border}`, position: "sticky", top: 0, height: "100vh",
        transition: "width 0.18s", zIndex: 50, display: "flex", flexDirection: "column",
        fontFamily: "'JetBrains Mono',Courier New,monospace",
      }}
      onMouseLeave={scheduleClose}
    >
      {/* brand / APEX home */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 10px 10px",
        borderBottom: `1px solid ${C.border}` }}>
        <Link to={apexUrl(HOME_PAGE.name)} title={`APEX — ${HOME_PAGE.label}`}
          style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <svg width={22} height={22} viewBox="0 0 24 24">
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={C.neon} strokeWidth="1.5" fill="none" />
            <circle cx={12} cy={12} r={2.5} fill={C.neon} />
          </svg>
        </Link>
        {expanded && <span style={{ color: C.neon, fontSize: 12, letterSpacing: 3, fontWeight: 700 }}>JARVIS</span>}
        <button onClick={() => setExpanded((v) => !v)} title="toggle rail (⌘\)"
          style={{ marginLeft: "auto", background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: 13 }}>
          {expanded ? "«" : "»"}
        </button>
      </div>

      {/* domain glyphs */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {groups.map((g, i) => {
          const on = activeGroup === g.id || flyout === g.id;
          return (
            <div key={g.id}
              onMouseEnter={() => openFlyout(g.id)}
              style={{ position: "relative" }}>
              <button
                onClick={() => {
                  const first = g.pages[0];
                  if (first) navigate(apexUrl(first.name));
                }}
                title={`${g.label}  (⌘${i + 1})`}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: expanded ? "8px 12px" : "9px 0", justifyContent: expanded ? "flex-start" : "center",
                  background: on ? "rgba(0,200,120,0.08)" : "transparent",
                  borderLeft: `2px solid ${on ? g.color : "transparent"}`,
                  border: "none", borderLeftWidth: 2, borderLeftStyle: "solid",
                  color: on ? C.textB : C.text, cursor: "pointer", transition: "all 0.12s",
                }}>
                <span style={{ fontSize: 15, flexShrink: 0, color: g.color }}>{DOMAIN_GLYPH[g.id] || "◆"}</span>
                {expanded && <span style={{ fontSize: 8, letterSpacing: 1.5, fontWeight: 700, color: g.color, whiteSpace: "nowrap" }}>{g.label}</span>}
              </button>
            </div>
          );
        })}
      </div>

      {/* ⌘K affordance */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:open-palette"))}
        title="Command palette (⌘K)"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          justifyContent: expanded ? "flex-start" : "center",
          padding: expanded ? "10px 12px" : "10px 0",
          borderTop: `1px solid ${C.border}`, background: "none", border: "none",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: C.border,
          color: C.neon, cursor: "pointer", fontSize: 11, letterSpacing: 1,
        }}>
        <span style={{ fontSize: 12 }}>⌘K</span>
        {expanded && <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>COMMAND</span>}
      </button>

      {/* flyout — pages of the hovered/active domain */}
      {activeFlyoutGroup && (
        <div
          onMouseEnter={() => openFlyout(activeFlyoutGroup.id)}
          onMouseLeave={scheduleClose}
          style={{
            position: "fixed", left: w, top: 0, minWidth: 190, maxHeight: "100vh", overflowY: "auto",
            background: "rgba(3,9,14,0.98)", borderRight: `1px solid ${C.border}`,
            borderLeft: `1px solid ${activeFlyoutGroup.color}55`,
            boxShadow: "8px 0 30px rgba(0,0,0,0.6)", zIndex: 60, padding: "10px 0",
            fontFamily: "'JetBrains Mono',monospace",
          }}>
          <div style={{ fontSize: 7, letterSpacing: 2, color: activeFlyoutGroup.color, opacity: 0.85,
            padding: "2px 14px 8px", fontWeight: 700 }}>{activeFlyoutGroup.label}</div>
          {activeFlyoutGroup.pages.map((p) => {
            const active = isActivePath(p.name);
            return (
              <Link key={p.name} to={apexUrl(p.name)} onClick={() => setFlyout(null)} title={p.label}
                style={{
                  display: "flex", alignItems: "center", gap: 9, textDecoration: "none",
                  padding: "6px 14px",
                  background: active ? "rgba(0,200,120,0.1)" : "transparent",
                  borderLeft: `2px solid ${active ? activeFlyoutGroup.color : "transparent"}`,
                  color: active ? C.textB : C.text, transition: "all 0.12s",
                }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{p.icon}</span>
                <span style={{ fontSize: 9.5, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{p.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
