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
import LiveIntelPulseDrawer from "@/components/overnight/LiveIntelPulseDrawer";
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
import UnderworldBridgeStatus from "@/components/overnight/UnderworldBridgeStatus";
import LabsCapabilityDrawer from "@/components/overnight/LabsCapabilityDrawer";
import GovernedActionsPanel from "@/components/overnight/GovernedActionsPanel";
import AutopilotDashboard from "@/components/overnight/AutopilotDashboard";
import ServiceRegistryPanel from "@/components/overnight/ServiceRegistryPanel";
import ModeMixerPanel from "@/components/overnight/ModeMixerPanel";
import NexusBusMonitor from "@/components/overnight/NexusBusMonitor";
import CommonOperatingPicture from "@/components/overnight/CommonOperatingPicture";
import EntityResolutionPanel from "@/components/overnight/EntityResolutionPanel";
import IncidentCorrelationDrawer from "@/components/overnight/IncidentCorrelationDrawer";
import PanicKeyPanel from "@/components/overnight/PanicKeyPanel";
import GothamEventsDrawer from "@/components/overnight/GothamEventsDrawer";
import SecurityComplianceScorecard from "@/components/overnight/SecurityComplianceScorecard";
import SciDomainsDrawer from "@/components/overnight/SciDomainsDrawer";
import GraphTimeScrubber from "@/components/overnight/GraphTimeScrubber";
import DatasetsCatalogDrawer from "@/components/overnight/DatasetsCatalogDrawer";
import MetricsMonitor from "@/components/overnight/MetricsMonitor";
import FoundryPipelineCatalog from "@/components/overnight/FoundryPipelineCatalog";
import AssetDnaDrawer from "@/components/overnight/AssetDnaDrawer";
import AstroTrackerDrawer from "@/components/overnight/AstroTrackerDrawer";
import VoiceForgeDrawer from "@/components/overnight/VoiceForgeDrawer";
import DeadZoneFinderDrawer from "@/components/overnight/DeadZoneFinderDrawer";
import FrictionMapDrawer from "@/components/overnight/FrictionMapDrawer";
import VoiceCommandReference from "@/components/overnight/VoiceCommandReference";
import AcousticContactsDrawer from "@/components/overnight/AcousticContactsDrawer";
import TaxonomyBrowserDrawer from "@/components/overnight/TaxonomyBrowserDrawer";
import SpecForgeBrowser from "@/components/overnight/SpecForgeBrowser";
import VisionMonitorDrawer from "@/components/overnight/VisionMonitorDrawer";
import WorldPackBrowser from "@/components/overnight/WorldPackBrowser";
import SavedSearchesDrawer from "@/components/overnight/SavedSearchesDrawer";
import InfSwarmAgentsDrawer from "@/components/overnight/InfSwarmAgentsDrawer";
import NeoScreenDrawer from "@/components/overnight/NeoScreenDrawer";
import BrainCrmPeopleDrawer from "@/components/overnight/BrainCrmPeopleDrawer";
import MotorPredictorDrawer from "@/components/overnight/MotorPredictorDrawer";
import SemanticSearchDrawer from "@/components/overnight/SemanticSearchDrawer";
import AssuranceInvariantsDrawer from "@/components/overnight/AssuranceInvariantsDrawer";
import ScienceMethodsCatalog from "@/components/overnight/ScienceMethodsCatalog";
import PageDataLensDrawer from "@/components/overnight/PageDataLensDrawer";
import AiProposalsDrawer from "@/components/overnight/AiProposalsDrawer";
import TenantRegistryDrawer from "@/components/overnight/TenantRegistryDrawer";
import OpsHealthSummaryDrawer from "@/components/overnight/OpsHealthSummaryDrawer";
import RiskSignalDrawer from "@/components/overnight/RiskSignalDrawer";
import ApolloFleetDrawer from "@/components/overnight/ApolloFleetDrawer";
import EventBackboneMonitor from "@/components/overnight/EventBackboneMonitor";
import VoiceHistoryDrawer from "@/components/overnight/VoiceHistoryDrawer";
import DbHealthStatsDrawer from "@/components/overnight/DbHealthStatsDrawer";
import UnderworldApiCatalog from "@/components/overnight/UnderworldApiCatalog";

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

      {/* F129: Live Intel Pulse Drawer — right-edge slide-in at 44%; POST /functions/getLiveIntel every 2 min; top 5 earthquakes by magnitude + top 5 market movers by |Δ%|; orange (#F97316) accent */}
      <LiveIntelPulseDrawer />

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

      {/* F86: Gotham Events Drawer — right-edge slide-in at 47%; GET /v1/gotham/events?limit=50 every 30 s; kind badge + event ID + case link + relative age; amber (#F59E0B) accent; critical-count badge pulses red */}
      <GothamEventsDrawer />

      {/* F77: Common Operating Picture — left-edge slide-in at 67%; GET /v1/cop/snapshot (60-s poll) + /v1/cop/layers; GEO/GRAPH/TEMPORAL/METRICS tabs; cyan (#06B6D4) accent */}
      <CommonOperatingPicture />

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

      {/* F83: Science Domains Drawer — left-edge slide-in at 4%; underworld science domain consoles from GET /v1/sci/domains */}
      <SciDomainsDrawer />

      {/* F84: Graph Time Scrubber — left-edge slide-in at 6%; POST /v1/graph-time/playback (12 frames); scrub knowledge-graph growth over time; sky-blue (#38BDF8) accent */}
      <GraphTimeScrubber />

      {/* F85: Datasets Catalog Drawer — left-edge slide-in at 62%; GET /v1/datasets; dataset name + row count + source type + age; lime (#84CC16) accent; 5-min poll */}
      <DatasetsCatalogDrawer />

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

      {/* F82: Security Compliance Scorecard — right-edge slide-in at 10%; GET /v1/security/compliance/status; five-plane tiles (audit/revdb/tenancy/cross_org/clearance_model) + overall IMPLEMENTED/PARTIAL badge; green (#22C55E) accent; 5-min poll */}
      <SecurityComplianceScorecard />

      {/* F69: Claude Code Runs Drawer — right-edge slide-in at 77%; GET /v1/claude_code/runs?limit=20&archived=1 + GET /v1/claude_code/stats; active/archived run list with status/outcome badges + elapsed time; stats tiles (total/open/avg); green (#4ADE80) accent; 30-s poll */}
      <ClaudeCodeRunsDrawer />

      {/* F94: Underworld Bridge Status — right-edge slide-in at 74%; GET /v1/bridge/status every 60 s; platform/reachable status + per-capability ONLINE/OFFLINE badges (graph_analytics/counterfactual/optimize/temporal_query/causal_chain) + benchmarks chips; violet (#8B5CF6) accent */}
      <UnderworldBridgeStatus />

      {/* F70: Labs Capability Catalog — left-edge slide-in at 32%; GET /v1/labs/catalog lists underworld scientific modules (drug_discovery/disease_model/quantum_demo/manufacturing_sim/patent_classify/materials_or_standards) with AVAILABLE/UNAVAILABLE status badges; emerald (#10B981) accent; 5-min poll */}
      <LabsCapabilityDrawer />

      {/* F122: Governed AIP Actions Panel — left-edge slide-in at 33%; GET /v1/jarvis/actions (5-min poll) + GET /v1/jarvis/approvals?status=pending (2-min poll); ACTIONS/GATES tabs; violet (#7C3AED) accent; pending gate count badge */}
      <GovernedActionsPanel />

      {/* F71: Autopilot Dashboard — left-edge slide-in at 37%; GET /assurance/autopilot/status + proposals + roadmap; STATUS/PROPOSALS/ROADMAP tabs; sky-blue (#0EA5E9) accent; 2-min poll */}
      <AutopilotDashboard />

      {/* F72: Service Registry Panel — right-edge slide-in at 7%; GET /v1/registry/services lists every announced microservice with alive/total count + role badge + port + heartbeat age; fuchsia (#D946EF) accent; 30-s poll */}
      <ServiceRegistryPanel />

      {/* F73: Mode Mixer Panel — left-edge slide-in at 48%; GET /v1/mode/active (60s poll) + GET /v1/mode/profiles (once on open); active profile field grid + preset catalog; yellow (#EAB308) accent */}
      <ModeMixerPanel />

      {/* F78: Entity Resolution Panel — left-edge slide-in at 73%; GET /v1/jarvis/er/stats + GET /v1/jarvis/er/queue?status=pending; pending/merged/total stat tiles; ID-pair rows with type badge + score bar; rose (#E11D48) accent; 5-min poll */}
      <EntityResolutionPanel />

      {/* F79: Incident Correlation Clusters — right-edge slide-in at 23%; GET /v1/run-correlator/clusters; severity badge + event count + window + summary per cluster; 30-s poll */}
      <IncidentCorrelationDrawer />

      {/* F81: PanicKey Control Panel — left-edge slide-in at 98%; GET /v1/panickey/active (30-s poll) + GET /v1/panickey/snapshots (on open); mode badge + PM2 services + LLM call stats + jobs; red (#EF4444) accent on safe/emergency */}
      <PanicKeyPanel />

      {/* F87: Metrics Monitor — right-edge slide-in at 86%; GET /v1/jarvis/metrics (60-s poll); span count + P50/P95 latency + total cost + error rate tiles + per-layer breakdown; indigo (#6366F1) accent */}
      <MetricsMonitor />

      {/* F88: Foundry Pipeline Catalog — left-edge slide-in at 10%; GET /v1/foundry/pipelines (5-min poll); pipeline name + YAML badge + size + age per row; click expands YAML preview; fuchsia (#E879F9) accent */}
      <FoundryPipelineCatalog />

      {/* F89: Asset DNA Browser — right-edge slide-in at 53%; GET /v1/asset/list?limit=200 (5-min poll); repo asset cards sorted by risk; HIGH/MEDIUM/LOW risk badges + health dot + kind badge + age; high-risk count badge on tab; red accent on HIGH risk; client-side filter */}
      <AssetDnaDrawer />

      {/* F90: Solar System Tracker — right-edge slide-in at 59%; GET /v1/astro/planets + /v1/astro/stars (10-min poll); planets tab shows RA/Dec/distance per planet; stars tab shows J2000 catalogue positions; sky-blue (#38BDF8) accent; DEGRADED badge when astropy unavailable */}
      <AstroTrackerDrawer />

      {/* F91: VoiceForge Profiles — right-edge slide-in at 62%; GET /v1/voiceforge/profiles (5-min poll); voice-clone profile list with name, description, active indicator, created age; XTTS ONLINE/OFFLINE badge in header; pink (#EC4899) accent */}
      <VoiceForgeDrawer />

      {/* F92: Dead Zone Finder — left-edge slide-in at 58%; GET /v1/deadzone/scan (5-min poll); kind badge (missing_file red/stale_file amber/untracked_route orange/overlap cyan/duplicate_name indigo) + label + suggestion per finding; rose (#FB7185) accent */}
      <DeadZoneFinderDrawer />

      {/* F93: Friction Map — left-edge slide-in at 85%; GET /v1/friction/scan (5-min poll); friction score gauge + kind badges (repeated_action orange/duplicate_prompt indigo/repeat_error red) + count badge + suggestion per finding; orange (#F97316) accent */}
      <FrictionMapDrawer />

      {/* F95: Voice Command Reference — right-edge slide-in at 69%; GET /v1/voice/status (TTS provider + STT availability) + GET /v1/voice/commands (full grouped catalog); searchable by phrase/description; blue (#60A5FA) accent; fetched once on open */}
      <VoiceCommandReference />

      {/* F96: Acoustic Contacts — right-edge slide-in at 45%; GET /v1/acoustic/contacts?limit=100 (3-min poll); operator-tagged acoustic contacts with classification badge + confidence + lat/lon + source + age; lime-green (#65A30D) accent */}
      <AcousticContactsDrawer />

      {/* F97: Taxonomy Browser — left-edge slide-in at 1%; GET /v1/jarvis/taxonomy/families + /frontier + /summary (5-min poll); acquisition-family list + frontier-cell browser; violet (#A78BFA) accent */}
      <TaxonomyBrowserDrawer />

      {/* F98: Spec Forge Browser — left-edge slide-in at 16%; GET /v1/spec/list (5-min poll); spec title + APPROVED/DRAFT badge + age per row; click expands full spec body via GET /v1/spec/{id}; teal (#14B8A6) accent */}
      <SpecForgeBrowser />

      {/* F99: Vision System Monitor — right-edge slide-in at 14%; GET /v1/vision/status (2-min poll); CAPTURE/DETECT/DESCRIBE layer availability badges + config; Detect Now button POST /v1/vision/detect; sky-blue (#38BDF8) accent */}
      <VisionMonitorDrawer />

      {/* F101: World Pack Browser — right-edge slide-in at 3%; GET /v1/jarvis/world/summary + /subjects?limit=100; family/subject/endpoint counts + searchable subject list with neuron-type badges; emerald (#10B981) accent; fetched once on open */}
      <WorldPackBrowser />

      {/* F102: Saved Searches Drawer — right-edge slide-in at 91%; GET /v1/search-plus/saved (5-min poll); saved search list with name + spec summary + updated age; click row runs GET /v1/search-plus/saved/{id}/run and shows result count inline; orange (#FB923C) accent */}
      <SavedSearchesDrawer />

      {/* F106: Inference Swarm Agents — right-edge slide-in at 83%; GET /v1/inf-swarm/agents (30-s poll); agent_id badge + kind badge + status badge + queue depth + spawn/heartbeat age per row; emerald (#34D399) accent */}
      <InfSwarmAgentsDrawer />

      {/* F108: NEO Screen Drawer — right-edge slide-in at 55%; GET /v1/astro/neo?a=&e= (on-demand Keplerian two-body MOID); 4 preset orbits (Aten/Apollo/Amor/Atira); orbit params + MOID + PHA hazard badge; red (#EF4444) accent */}
      <NeoScreenDrawer />

      {/* F111: Brain CRM People Drawer — left-edge slide-in at 22%; GET /v1/brain/people (5-min poll); person name + tier badge (FULL/MODERATE/BRIEF) + mention count; indigo (#6366F1) accent */}
      <BrainCrmPeopleDrawer />

      {/* F112: Motor Intent Predictor Drawer — left-edge slide-in at 18%; GET /v1/motor/stats (2-min poll) + GET /v1/motor/predict?top_k=5; stats tiles + ranked candidate list with source badge + confidence bar; sky-blue (#0EA5E9) accent */}
      <MotorPredictorDrawer />

      {/* F114: Semantic Search Drawer — right-edge slide-in at 33%; GET /v1/semantic/search?q=&k=12; debounced 400 ms; cosine top-k results with kind badge + score bar + text excerpt; lavender (#C084FC) accent */}
      <SemanticSearchDrawer />

      {/* F115: Assurance Invariants Drawer — left-edge slide-in at 43%; GET /assurance/invariants (3-min poll); overall_ok badge + pass/fail counts + per-invariant PASS/FAIL rows with evidence; rose (#F43F5E) accent; red pulse when failures present */}
      <AssuranceInvariantsDrawer />

      {/* F116: Science Methods Catalog — left-edge slide-in at 46%; GET /functions/science/methods on mount; methods grouped by domain with ▶ RUN buttons firing POST /functions/science/run; amber (#F59E0B) accent */}
      <ScienceMethodsCatalog />

      {/* F117: Page Data Lens — right-edge slide-in at 93%; GET /v1/jarvis/page-data/summary (5-min poll) + GET /v1/jarvis/page-data/{page} on click; page list with topic count badges; live measurements/events/documents/topics per page; cyan (#22D3EE) accent */}
      <PageDataLensDrawer />

      {/* F118: AI Proposals Browser — right-edge slide-in at 51%; GET /v1/aip/proposals (5-min poll); PENDING/APPROVED/REJECTED status badge + object_id chip + action + rationale excerpt + age per row; pending count badge on tab; amber (#F59E0B) accent */}
      <AiProposalsDrawer />

      {/* F119: Tenant Registry — right-edge slide-in at 88%; GET /v1/tenants (3-min poll) + GET /v1/tenants/whoami (once on open); all tenants with name + plan badge + id chip + age; active tenant highlighted with green dot; teal (#14B8A6) accent */}
      <TenantRegistryDrawer />

      {/* F120: Ops Health Summary — right-edge slide-in at 64%; parallel-polls GET /v1/jarvis/system/status (60s) + GET /v1/ops/events (30s); service health tiles + critical event list; rose (#F43F5E) accent */}
      <OpsHealthSummaryDrawer />

      {/* F121: Risk Signal Drawer — right-edge slide-in at 26%; polls GET /entities/RiskSignal every 30 s; severity-sorted (CRITICAL/HIGH/MEDIUM/LOW) signals; critical count badge pulses on tab; rose (#F43F5E) accent */}
      <RiskSignalDrawer />

      {/* F124: Apollo Fleet Drawer — right-edge slide-in at 16%; GET /v1/jarvis/apollo/fleet + /releases?limit=20 (5-min poll); FLEET tab shows env tier/version/status; RELEASES tab shows recent deploy history; blue (#3B82F6) accent */}
      <ApolloFleetDrawer />

      {/* F123: Event Backbone Monitor — right-edge slide-in at 11%; GET /v1/jarvis/events/stats (30-s poll) + GET /v1/jarvis/events/project/{stream} on click; total events + consumer count tiles + stream chips; per-stream by_type breakdown + last event preview; indigo (#818CF8) accent */}
      <EventBackboneMonitor />

      {/* F126: Voice History Drawer — right-edge slide-in at 68%; GET /v1/voice/history?limit=30 (2-min poll); server-side voice command log with source badge (TTS/NLU/STT/API) + command text + relative timestamp; magenta (#D946EF) accent */}
      <VoiceHistoryDrawer />

      {/* F127: DB Health & Stats Drawer — right-edge slide-in at 29%; polls GET /v1/jarvis/db/health + /stats every 60 s; active backend badge (sqlite/postgres); SQLite note count + path; Postgres online status + note count; emerald (#10B981) accent */}
      <DbHealthStatsDrawer />

      {/* F128: Underworld API Catalog — right-edge slide-in at 35%; GET /v1/underworld/health (60-s poll) + GET /v1/underworld/catalog (once on open); reachability status + latency tile + base URL + endpoint catalog grouped by domain (worlds/physics/science/knowledge) with expandable GET/POST rows; violet (#7C3AED) accent */}
      <UnderworldApiCatalog />

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
