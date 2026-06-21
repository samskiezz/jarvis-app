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
import PlatformStatusStrip from "@/components/overnight/PlatformStatusStrip";
import AnomalyDrawer from "@/components/overnight/AnomalyDrawer";
import AlertBadge from "@/components/overnight/AlertBadge";
import AgentToolsTooltip from "@/components/overnight/AgentToolsTooltip";
import AutobuildPill from "@/components/overnight/AutobuildPill";
import OpsCasesPanel from "@/components/overnight/OpsCasesPanel";
import VitalsGlance from "@/components/overnight/VitalsGlance";
import TelemetryTicker from "@/components/cinematic/TelemetryTicker";
import PipelineRunsDrawer from "@/components/overnight/PipelineRunsDrawer";
import DecisionLedgerPanel from "@/components/overnight/DecisionLedgerPanel";
import GpuTierPill from "@/components/overnight/GpuTierPill";
import GraphCentralityDrawer from "@/components/overnight/GraphCentralityDrawer";

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
        {/* platform status strip — subsystem LEDs + object/job counts */}
        <PlatformStatusStrip />
        {/* slim top breadcrumb / status strip — the machine voice, in mono */}
        <div style={{ position: "sticky", top: 0, zIndex: 40, height: 26, display: "flex", alignItems: "center",
          gap: 8, padding: "0 16px", background: S.glassRail, backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur, borderBottom: `1px solid ${S.border}`,
          fontFamily: S.mono }}>
          <span style={{ fontSize: S.fs.xs, color: S.text, letterSpacing: 1 }}>JARVIS PALANTIR</span>
          <span style={{ color: S.text, opacity: 0.5 }}>/</span>
          <span style={{ fontSize: S.fs.xs, color: S.textHi, letterSpacing: 1 }}>{(current?.label || "").toUpperCase()}</span>
          <div style={{ flex: 1 }} />
          {/* Feature 8: live telemetry ticker — CPU/mem/load + brain nodes/synapses, 15-s poll */}
          <TelemetryTicker />
          {/* F7: vitals glance — HR / HRV / SpO2 from /v1/vitals/latest, 5-min poll */}
          <VitalsGlance />
          {/* F5: autobuild status pill — /v1/jarvis/system/autobuild/status, 90-s poll */}
          <AutobuildPill />
          {/* F12: GPU tier pill — /v1/gpu/status, 2-min poll; SGLang/Ollama health */}
          <GpuTierPill />
          {/* F4: agent tools tooltip — hover to see /v1/jarvis/agent/tools, session-cached */}
          <AgentToolsTooltip />
          {/* open alert count — red badge, hides when zero */}
          <AlertBadge />
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

      {/* F2: Anomaly feed — slide-in drawer listing /v1/jarvis/analytics/anomalies */}
      <AnomalyDrawer />

      {/* F6: Ops Cases Panel — left-edge slide-in; open cases from GET /v1/cases */}
      <OpsCasesPanel />

      {/* F9: Pipeline Runs Drawer — right-edge slide-in; runs from GET /v1/run-builder/runs */}
      <PipelineRunsDrawer />

      {/* F11: Decision Ledger Panel — right-edge slide-in; decisions from GET /v1/decision/list */}
      <DecisionLedgerPanel />

      {/* F13: Graph Centrality Drawer — right-edge slide-in at 80%; top entities by influence from GET /v1/graph/centrality */}
      <GraphCentralityDrawer />

      {/* JARVIS rides on every page */}
      <JarvisAssistant
        actions={jarvisActions}
        entities={jarvisEntities}
        pages={jarvisPages}
        risks={RISK_SIGNALS}
        currentPage={current ? { name: current.name, label: current.label, route: loc.pathname } : null}
      />
    </div>
  );
}

// Group accent lookup for pages that want to match the dock colour.
export const groupColor = (id) => GROUPS.find((g) => g.id === id)?.color || C.neon;
