/**
 * Layout — the consolidated nav dock that wraps every page.
 *
 * This is the single, grouped navigation the Base44 app never had: instead of a
 * flat wall of 30 links, pages are clustered by GROUP into a collapsible left
 * dock. JARVIS rides along on every page via the assistant orb.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { COLORS as C } from "@/domain/colors";
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
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
      {/* ── DOMAIN RAIL (collapsed-by-default nav) ───────────────────────── */}
      <DomainRail />

      {/* ── PAGE BODY ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {/* slim top breadcrumb so you always know where you are */}
        <div style={{ position: "sticky", top: 0, zIndex: 40, height: 26, display: "flex", alignItems: "center",
          gap: 8, padding: "0 16px", background: "rgba(2,5,8,0.97)", borderBottom: `1px solid ${C.border}`,
          fontFamily: "'JetBrains Mono',monospace" }}>
          <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>JARVIS PALANTIR</span>
          <span style={{ color: "#16313a" }}>/</span>
          <span style={{ fontSize: 8, color: C.neon, letterSpacing: 1 }}>{(current?.label || "").toUpperCase()}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("jarvis:open-palette"))}
            title="Command palette (⌘K)"
            style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(0,200,120,0.06)",
              border: `1px solid ${C.border}`, borderRadius: 4, color: C.neon, cursor: "pointer",
              fontSize: 8, letterSpacing: 1, padding: "2px 7px", fontFamily: "inherit" }}>
            <span>⌘K</span>
            <span style={{ color: C.text }}>SEARCH</span>
          </button>
        </div>
        {children}
      </main>

      {/* Command palette — primary nav, available on every /apex page */}
      <CommandPalette />

      {/* JARVIS rides on every page */}
      <JarvisAssistant actions={jarvisActions} entities={jarvisEntities} pages={jarvisPages} risks={RISK_SIGNALS} />
    </div>
  );
}

// Group accent lookup for pages that want to match the dock colour.
export const groupColor = (id) => GROUPS.find((g) => g.id === id)?.color || C.neon;
