/**
 * Layout — the consolidated nav dock that wraps every page.
 *
 * This is the single, grouped navigation the Base44 app never had: instead of a
 * flat wall of 30 links, pages are clustered by GROUP into a collapsible left
 * dock. JARVIS rides along on every page via the assistant orb.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { GROUPS, PAGES } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";
import { OBJECTS } from "@/domain/ontology";

// All APEX feature pages are mounted under the /apex base in App.jsx.
const APEX_BASE = "/apex";
const apexUrl = (name) => `${APEX_BASE}${createPageUrl(name)}`;
import { RISK_SIGNALS } from "@/domain/risk";
import JarvisAssistant from "@/components/Jarvis/JarvisAssistant";
import DomainRail from "@/components/DomainRail";
import CommandPalette from "@/components/CommandPalette";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";

export default function Layout() {
  return null; // replaced by AppLayout wrapper; kept for compatibility
}

export function AppLayout({ children }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const current = PAGES.find((p) => apexUrl(p.name) === loc.pathname);

  // JARVIS rides on every page with real agency: it can route to any of the 30
  // pages by voice/text, and knows the full entity universe for focus/briefings.
  const jarvisPages = PAGES.map((p) => ({ name: p.name, label: p.label }));
  const jarvisEntities = OBJECTS.map((o) => ({ id: o.id, label: o.label }));
  const jarvisActions = {
    navigate: (name) => navigate(apexUrl(name)),
    refresh: () => navigate(0),
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: S.bg }}>
      {/* ── DOMAIN RAIL (collapsed-by-default nav) ───────────────────────── */}
      <DomainRail />

      {/* ── PAGE BODY ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {/* slim top breadcrumb / status strip — the machine voice, in mono */}
        <div style={{ position: "sticky", top: 0, zIndex: 40, height: 26, display: "flex", alignItems: "center",
          gap: 8, padding: "0 16px", background: S.glassRail, backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur, borderBottom: `1px solid ${S.border}`,
          fontFamily: S.mono }}>
          <span style={{ fontSize: S.fs.xs, color: S.text, letterSpacing: 1 }}>JARVIS PALANTIR</span>
          <span style={{ color: S.text, opacity: 0.5 }}>/</span>
          <span style={{ fontSize: S.fs.xs, color: S.textHi, letterSpacing: 1 }}>{(current?.label || "").toUpperCase()}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("jarvis:open-palette"))}
            title="Command palette (⌘K)"
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent",
              border: `1px solid ${S.border}`, borderRadius: S.radius, color: S.textHi, cursor: "pointer",
              fontSize: S.fs.xs, letterSpacing: 1, padding: "2px 7px", fontFamily: S.mono }}>
            <span>⌘K</span>
            <span style={{ color: S.text }}>SEARCH</span>
          </button>
        </div>
        {children}
      </main>

      {/* Command palette — primary nav, available on every /apex page */}
      <CommandPalette />

      {/* Keyboard-first navigation layer (?, /, [ ], g-chord) */}
      <KeyboardShortcuts />

      {/* JARVIS rides on every page */}
      <JarvisAssistant actions={jarvisActions} entities={jarvisEntities} pages={jarvisPages} risks={RISK_SIGNALS} />
    </div>
  );
}

// Group accent lookup for pages that want to match the dock colour.
export const groupColor = (id) => GROUPS.find((g) => g.id === id)?.color || C.neon;
