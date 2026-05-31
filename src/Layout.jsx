/**
 * Layout — the consolidated nav dock that wraps every page.
 *
 * This is the single, grouped navigation the Base44 app never had: instead of a
 * flat wall of 30 links, pages are clustered by GROUP into a collapsible left
 * dock. JARVIS rides along on every page via the assistant orb.
 */
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { COLORS as C } from "@/domain/colors";
import { GROUPS, PAGES, pagesByGroup } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";
import { OBJECTS } from "@/domain/ontology";
import { RISK_SIGNALS } from "@/domain/risk";
import JarvisAssistant from "@/components/Jarvis/JarvisAssistant";

const DOCK_W = 196;
const DOCK_W_COLLAPSED = 52;

export default function Layout() {
  return null; // replaced by AppLayout wrapper; kept for compatibility
}

export function AppLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const groups = pagesByGroup();
  const current = PAGES.find((p) => createPageUrl(p.name) === loc.pathname);
  const w = collapsed ? DOCK_W_COLLAPSED : DOCK_W;

  // JARVIS rides on every page with real agency: it can route to any of the 30
  // pages by voice/text, and knows the full entity universe for focus/briefings.
  const jarvisPages = PAGES.map((p) => ({ name: p.name, label: p.label }));
  const jarvisEntities = OBJECTS.map((o) => ({ id: o.id, label: o.label }));
  const jarvisActions = {
    navigate: (name) => navigate(createPageUrl(name)),
    refresh: () => navigate(0),
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
      {/* ── NAV DOCK ─────────────────────────────────────────────────────── */}
      <nav style={{ width: w, flexShrink: 0, background: "rgba(2,6,10,0.99)",
        borderRight: `1px solid ${C.border}`, position: "sticky", top: 0, height: "100vh",
        overflowY: "auto", transition: "width 0.18s", zIndex: 50,
        fontFamily: "'JetBrains Mono',Courier New,monospace" }}>
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 10px",
          borderBottom: `1px solid ${C.border}` }}>
          <svg width={22} height={22} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={C.neon} strokeWidth="1.5" fill="none" />
            <circle cx={12} cy={12} r={2.5} fill={C.neon} />
          </svg>
          {!collapsed && <span style={{ color: C.neon, fontSize: 12, letterSpacing: 3, fontWeight: 700 }}>JARVIS</span>}
          <button onClick={() => setCollapsed((v) => !v)} title="toggle nav"
            style={{ marginLeft: "auto", background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: 13 }}>
            {collapsed ? "»" : "«"}
          </button>
        </div>

        {/* grouped links */}
        {groups.map((g) => (
          <div key={g.id} style={{ padding: "8px 0 4px" }}>
            {!collapsed && (
              <div style={{ fontSize: 7, letterSpacing: 2, color: g.color, opacity: 0.8,
                padding: "2px 12px 4px", fontWeight: 700 }}>{g.label}</div>
            )}
            {g.pages.map((p) => {
              const path = createPageUrl(p.name);
              const active = loc.pathname === path;
              return (
                <Link key={p.name} to={path} title={p.label}
                  style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none",
                    padding: collapsed ? "7px 0" : "6px 12px", justifyContent: collapsed ? "center" : "flex-start",
                    background: active ? "rgba(0,200,120,0.1)" : "transparent",
                    borderLeft: `2px solid ${active ? g.color : "transparent"}`,
                    color: active ? C.textB : C.text, transition: "all 0.12s" }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{p.icon}</span>
                  {!collapsed && <span style={{ fontSize: 9.5, letterSpacing: 0.5, whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
        <div style={{ height: 24 }} />
      </nav>

      {/* ── PAGE BODY ────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {/* slim top breadcrumb so you always know where you are */}
        <div style={{ position: "sticky", top: 0, zIndex: 40, height: 26, display: "flex", alignItems: "center",
          gap: 8, padding: "0 16px", background: "rgba(2,5,8,0.97)", borderBottom: `1px solid ${C.border}`,
          fontFamily: "'JetBrains Mono',monospace" }}>
          <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>JARVIS PALANTIR</span>
          <span style={{ color: "#16313a" }}>/</span>
          <span style={{ fontSize: 8, color: C.neon, letterSpacing: 1 }}>{(current?.label || "").toUpperCase()}</span>
        </div>
        {children}
      </main>

      {/* JARVIS rides on every page */}
      <JarvisAssistant actions={jarvisActions} entities={jarvisEntities} pages={jarvisPages} risks={RISK_SIGNALS} />
    </div>
  );
}

// Group accent lookup for pages that want to match the dock colour.
export const groupColor = (id) => GROUPS.find((g) => g.id === id)?.color || C.neon;
