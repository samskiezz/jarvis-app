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
import ScenarioRunsPanel from "@/components/overnight/ScenarioRunsPanel";
import RemindersPanel from "@/components/overnight/RemindersPanel";
import SkillScorecardPanel from "@/components/overnight/SkillScorecardPanel";
import ForecastModelsPanel from "@/components/overnight/ForecastModelsPanel";
import KnowledgeTimelinePanel from "@/components/overnight/KnowledgeTimelinePanel";
import SourceConnectorsDrawer from "@/components/overnight/SourceConnectorsDrawer";
import ActivityFeedPanel from "@/components/overnight/ActivityFeedPanel";
import SwarmJobsDrawer from "@/components/overnight/SwarmJobsDrawer";
import ContactsDirectoryDrawer from "@/components/overnight/ContactsDirectoryDrawer";
import InvestmentSnapshotDrawer from "@/components/overnight/InvestmentSnapshotDrawer";
import ReportsBrowserDrawer from "@/components/overnight/ReportsBrowserDrawer";
import ThoughtPacksDrawer from "@/components/overnight/ThoughtPacksDrawer";
import SolarEnergyPanel from "@/components/overnight/SolarEnergyPanel";
import HistoryLakeCatalog from "@/components/overnight/HistoryLakeCatalog";
import RitualDeckPanel from "@/components/overnight/RitualDeckPanel";
import SecondBrainCatalog from "@/components/overnight/SecondBrainCatalog";
import GraphCommunitiesView from "@/components/overnight/GraphCommunitiesView";
import AutomationRulesPanel from "@/components/overnight/AutomationRulesPanel";
import ProofPacksDrawer from "@/components/overnight/ProofPacksDrawer";
import TaskMissionsPanel from "@/components/overnight/TaskMissionsPanel";
import MessagesInboxDrawer from "@/components/overnight/MessagesInboxDrawer";
import SchedulesPanel from "@/components/overnight/SchedulesPanel";
import VpnStatusPanel from "@/components/overnight/VpnStatusPanel";
import GeoObjectsDrawer from "@/components/overnight/GeoObjectsDrawer";
import SensorActivityPanel from "@/components/overnight/SensorActivityPanel";
import TopObjectsDrawer from "@/components/overnight/TopObjectsDrawer";
import OntologySearchDrawer from "@/components/overnight/OntologySearchDrawer";
import IntentInboxDrawer from "@/components/overnight/IntentInboxDrawer";
import WorkshopAppsDrawer from "@/components/overnight/WorkshopAppsDrawer";
import ForgeApprovalsPanel from "@/components/overnight/ForgeApprovalsPanel";
import RevDbHistoryDrawer from "@/components/overnight/RevDbHistoryDrawer";
import MusicBankPanel from "@/components/overnight/MusicBankPanel";
import TemporalAnomalyDrawer from "@/components/overnight/TemporalAnomalyDrawer";
import AstroObservatoryDrawer from "@/components/overnight/AstroObservatoryDrawer";
import IntelProfileDirectory from "@/components/overnight/IntelProfileDirectory";
import GuardianSensorPanel from "@/components/overnight/GuardianSensorPanel";
import VaultSecretsDrawer from "@/components/overnight/VaultSecretsDrawer";
import CodePulseDrawer from "@/components/overnight/CodePulseDrawer";
import NexusCorrelationDrawer from "@/components/overnight/NexusCorrelationDrawer";
import GovernanceDashboard from "@/components/overnight/GovernanceDashboard";
import ClaudeCodeRunsDrawer from "@/components/overnight/ClaudeCodeRunsDrawer";
import LabsCapabilityDrawer from "@/components/overnight/LabsCapabilityDrawer";
import AutopilotDashboard from "@/components/overnight/AutopilotDashboard";
import ServiceRegistryPanel from "@/components/overnight/ServiceRegistryPanel";
import ModeMixerPanel from "@/components/overnight/ModeMixerPanel";
import NexusBusMonitor from "@/components/overnight/NexusBusMonitor";

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
          {/* F31: History Lake catalog — series count pill + floating catalog from GET /v1/history/series */}
          <HistoryLakeCatalog />
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

      {/* F36: Automation Rules Panel — right-edge slide-in at 72%; active rules from GET /v1/rules */}
      <AutomationRulesPanel />

      {/* F54: RevDB History Drawer — right-edge slide-in at 85%; knowledge commit history from GET /v1/revdb/history */}
      <RevDbHistoryDrawer />

      {/* F42: Schedules Panel — right-edge slide-in at 42%; JARVIS job scheduler from GET /v1/schedules */}
      <SchedulesPanel />

      {/* F45: VPN Status Panel — right-edge slide-in at 12%; WireGuard status + peers from GET /v1/vpn/status */}
      <VpnStatusPanel />

      {/* F47: Sensor Activity Panel — right-edge slide-in at 27%; IMU motion activity from GET /v1/sensors/recent */}
      <SensorActivityPanel />

      {/* F48: Top Objects Drawer — left-edge slide-in at 40%; top graph objects by PageRank/centrality from GET /v1/jarvis/analytics/top-objects */}
      <TopObjectsDrawer />

      {/* F53: Ontology Search Drawer — right-edge slide-in at 43%; live search via GET /v1/search; debounced query input; ranked results with type/mark badges */}
      <OntologySearchDrawer />

      {/* F14: Scenario Runs Panel — left-edge slide-in at 35%; recent runs from GET /v1/scenario/list */}
      <ScenarioRunsPanel />

      {/* F32: Ritual Deck Panel — left-edge slide-in at 45%; configured routines from GET /v1/ritual/list */}
      <RitualDeckPanel />

      {/* F16: Reminders Panel — left-edge slide-in at 75%; pending reminders from GET /reminders/list */}
      <RemindersPanel />

      {/* F17: Skill Scorecard Panel — left-edge slide-in at 50%; AIP self-improvement metrics from GET /v1/aip/skill */}
      <SkillScorecardPanel />

      {/* F56: Forecast Models Panel — left-edge slide-in at 55%; model registry from GET /v1/predict/models + improvement loop from GET /v1/predict/improvement */}
      <ForecastModelsPanel />

      {/* F39: Proof Packs Drawer — left-edge slide-in at 60%; evidence packs from GET /v1/proofpack/list */}
      <ProofPacksDrawer />

      {/* F40: Task Missions Panel — left-edge slide-in at 65%; live mission tasks from GET /entities/Task */}
      <TaskMissionsPanel />

      {/* F49: Intent Inbox Drawer — left-edge slide-in at 70%; captured idea intents from GET /v1/intent/list */}
      <IntentInboxDrawer />

      {/* F50: Workshop Apps Drawer — right-edge slide-in at 31%; workshop apps from GET /v1/workshop/apps */}
      <WorkshopAppsDrawer />

      {/* F76: Nexus Event Bus Monitor — right-edge slide-in at 38%; GET /v1/bus/stats + /v1/bus/poll; rolling event feed; purple (#A855F7) accent */}
      <NexusBusMonitor />

      {/* F52: Forge Approvals Panel — left-edge slide-in at 83%; pending code-improvement changes from GET /v1/forge/approvals */}
      <ForgeApprovalsPanel />

      {/* F19: Knowledge Timeline Panel — right-edge slide-in at 20%; brain log+daily entries from GET /v1/brain/timeline */}
      <KnowledgeTimelinePanel />

      {/* F20: Source Connectors Drawer — left-edge slide-in at 20%; registered connectors from GET /v1/sources */}
      <SourceConnectorsDrawer />

      {/* F46: Geo Objects Drawer — left-edge slide-in at 28%; geo-tagged ontology objects from GET /v1/geo/objects */}
      <GeoObjectsDrawer />

      {/* F22: Activity Feed Panel — right-edge slide-in at 90%; unified note+audit feed from GET /v1/activity */}
      <ActivityFeedPanel />

      {/* F23: Swarm Jobs Drawer — left-edge slide-in at 88%; running agent jobs from GET /entities/SwarmJob */}
      <SwarmJobsDrawer />

      {/* F24: Contacts Directory Drawer — right-edge slide-in at 50%; contacts from GET /entities/Contact */}
      <ContactsDirectoryDrawer />

      {/* F41: Messages Inbox Drawer — right-edge slide-in at 57%; recent messages from GET /v1/messages/recent */}
      <MessagesInboxDrawer />

      {/* F25: Investment Snapshot Drawer — right-edge slide-in at 5%; holdings from GET /entities/Investment */}
      <InvestmentSnapshotDrawer />

      {/* F26: Reports Browser Drawer — left-edge slide-in at 8%; saved reports from GET /v1/reports */}
      <ReportsBrowserDrawer />

      {/* F33: Second Brain Catalog — left-edge slide-in at 13%; vault overview from GET /v1/brain/catalog */}
      <SecondBrainCatalog />

      {/* F34: Graph Communities View — left-edge slide-in at 2%; community partition from GET /v1/graph/communities */}
      <GraphCommunitiesView />

      {/* F27: Thought Packs Drawer — right-edge slide-in at 95%; compressed memory packs from GET /v1/compress/list */}
      <ThoughtPacksDrawer />

      {/* F28: Solar Energy Panel — left-edge slide-in at 93%; live inverter data from GET /v1/solar/now */}
      <SolarEnergyPanel />

      {/* F57: Music Bank Panel — left-edge slide-in at 96%; ambient loops from GET /v1/music/bank + GET /v1/music/status */}
      <MusicBankPanel />

      {/* F58: Temporal Anomaly Drawer — left-edge slide-in at 15%; series picker from GET /v1/history/series; anomaly scan from GET /v1/temporal/patterns?series_id= */}
      <TemporalAnomalyDrawer />

      {/* F61: Astro Observatory Drawer — left-edge slide-in at 80%; planet ephemeris from GET /v1/astro/planets + star catalogue from GET /v1/astro/stars */}
      <AstroObservatoryDrawer />

      {/* F62: Intel Profile Directory — left-edge slide-in at 24%; GET /entities/IntelProfile; name + risk-level badge + type + expandable summary; 3-min poll */}
      <IntelProfileDirectory />

      {/* F63: Guardian Sensor Panel — right-edge slide-in at 67%; GET /v1/guardian/incidents + GET /v1/guardian/status; kind/severity/value per row; ACK via POST /v1/guardian/ack; 30-s poll */}
      <GuardianSensorPanel />

      {/* F64: Vault Secrets Registry — right-edge slide-in at 97%; GET /v1/vault/ lists secret names + metadata (NEVER values); name + owner + obfuscation + age; 5-min poll */}
      <VaultSecretsDrawer />

      {/* F65: CodePulse VS Code Bridge — right-edge slide-in at 17%; GET /v1/codepulse/status (connection state + workspace) + GET /v1/codepulse/pending (change proposals); sky-blue accent; 30-s poll */}
      <CodePulseDrawer />

      {/* F66: Nexus Correlation Explorer — right-edge slide-in at 3%; GET /v1/correlate/search?q=&k=10; fused vector+FTS+graph hits; score bars + store badges; 400 ms debounced search; violet (#7C3AED) accent */}
      <NexusCorrelationDrawer />

      {/* F67: Governance Dashboard — right-edge slide-in at 9%; GET /v1/governance/purposes + GET /v1/governance/retention + GET /v1/governance/requests; purposes/retention/requests sub-tabs; blue (#3B82F6) accent; 5-min poll */}
      <GovernanceDashboard />

      {/* F69: Claude Code Runs Drawer — right-edge slide-in at 77%; GET /v1/claude_code/runs?limit=20&archived=1 + GET /v1/claude_code/stats; active/archived run list with status/outcome badges + elapsed time; stats tiles (total/open/avg); green (#4ADE80) accent; 30-s poll */}
      <ClaudeCodeRunsDrawer />

      {/* F70: Labs Capability Catalog — left-edge slide-in at 32%; GET /v1/labs/catalog lists underworld scientific modules (drug_discovery/disease_model/quantum_demo/manufacturing_sim/patent_classify/materials_or_standards) with AVAILABLE/UNAVAILABLE status badges; emerald (#10B981) accent; 5-min poll */}
      <LabsCapabilityDrawer />

      {/* F71: Autopilot Dashboard — left-edge slide-in at 37%; GET /assurance/autopilot/status + proposals + roadmap; STATUS/PROPOSALS/ROADMAP tabs; sky-blue (#0EA5E9) accent; 2-min poll */}
      <AutopilotDashboard />

      {/* F72: Service Registry Panel — right-edge slide-in at 7%; GET /v1/registry/services lists every announced microservice with alive/total count + role badge + port + heartbeat age; fuchsia (#D946EF) accent; 30-s poll */}
      <ServiceRegistryPanel />

      {/* F73: Mode Mixer Panel — left-edge slide-in at 48%; GET /v1/mode/active (60s poll) + GET /v1/mode/profiles (once on open); active profile field grid + preset catalog; yellow (#EAB308) accent */}
      <ModeMixerPanel />

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
