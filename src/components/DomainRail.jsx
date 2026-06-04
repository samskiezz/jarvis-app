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
import { COLORS as C, SHELL as S, glow } from "@/domain/colors";
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
        width: w, flexShrink: 0, background: S.glassRail, backdropFilter: S.blur,
        WebkitBackdropFilter: S.blur,
        borderRight: `1px solid ${S.border}`, position: "sticky", top: 0, height: "100vh",
        transition: "width 0.18s", zIndex: 50, display: "flex", flexDirection: "column",
        fontFamily: S.ui,
      }}
      onMouseLeave={scheduleClose}
    >
      {/* brand / APEX home */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 10px 10px",
        borderBottom: `1px solid ${S.border}` }}>
        <Link to={apexUrl(HOME_PAGE.name)} title={`APEX — ${HOME_PAGE.label}`}
          style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <svg width={22} height={22} viewBox="0 0 24 24">
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={C.neon} strokeWidth="1.5" fill="none" />
            <circle cx={12} cy={12} r={2.5} fill={C.neon} />
          </svg>
        </Link>
        {expanded && <span style={{ fontFamily: S.mono, color: C.neon, fontSize: S.fs.md, letterSpacing: 3, fontWeight: 700 }}>JARVIS</span>}
        <button onClick={() => setExpanded((v) => !v)} title="toggle rail (⌘\)"
          style={{ marginLeft: "auto", background: "none", border: "none", color: S.text, cursor: "pointer", fontSize: S.fs.lg }}>
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
                  background: on ? `${g.color}14` : "transparent",
                  borderLeft: `2px solid ${on ? g.color : "transparent"}`,
                  border: "none", borderLeftWidth: 2, borderLeftStyle: "solid",
                  color: on ? S.textHi : S.text, cursor: "pointer", transition: "all 0.12s",
                }}>
                <span style={{ fontSize: S.fs.xl - 3, flexShrink: 0, color: on ? g.color : S.text }}>{DOMAIN_GLYPH[g.id] || "◆"}</span>
                {expanded && <span style={{ fontFamily: S.ui, fontSize: S.fs.xs, letterSpacing: 1, fontWeight: 600, color: on ? g.color : S.text, whiteSpace: "nowrap" }}>{g.label}</span>}
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
          borderTop: `1px solid ${S.border}`, background: "none", border: "none",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: S.border,
          color: S.textHi, cursor: "pointer", fontFamily: S.mono, fontSize: S.fs.md, letterSpacing: 1,
        }}>
        <span style={{ fontSize: S.fs.md }}>⌘K</span>
        {expanded && <span style={{ fontSize: S.fs.xs, color: S.text, letterSpacing: 1 }}>COMMAND</span>}
      </button>

      {/* flyout — pages of the hovered/active domain */}
      {activeFlyoutGroup && (
        <div
          onMouseEnter={() => openFlyout(activeFlyoutGroup.id)}
          onMouseLeave={scheduleClose}
          style={{
            position: "fixed", left: w, top: 0, minWidth: 190, maxHeight: "100vh", overflowY: "auto",
            background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
            borderRight: `1px solid ${S.border}`,
            borderLeft: `2px solid ${activeFlyoutGroup.color}`,
            boxShadow: glow(activeFlyoutGroup.color), zIndex: 60, padding: "10px 0",
            fontFamily: S.ui,
          }}>
          <div style={{ fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 2, color: activeFlyoutGroup.color,
            padding: "2px 14px 8px", fontWeight: 700 }}>{activeFlyoutGroup.label}</div>
          {activeFlyoutGroup.pages.map((p) => {
            const active = isActivePath(p.name);
            return (
              <Link key={p.name} to={apexUrl(p.name)} onClick={() => setFlyout(null)} title={p.label}
                style={{
                  display: "flex", alignItems: "center", gap: 9, textDecoration: "none",
                  padding: "6px 14px",
                  background: active ? `${activeFlyoutGroup.color}14` : "transparent",
                  borderLeft: `2px solid ${active ? activeFlyoutGroup.color : "transparent"}`,
                  color: active ? S.textHi : S.text, transition: "all 0.12s",
                }}>
                <span style={{ fontSize: S.fs.lg, flexShrink: 0, color: active ? activeFlyoutGroup.color : S.text }}>{p.icon}</span>
                <span style={{ fontSize: S.fs.sm, letterSpacing: 0.3, whiteSpace: "nowrap" }}>{p.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
