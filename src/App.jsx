import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import AuthGate from '@/lib/AuthGate';
import { AppLayout } from '@/Layout';
import { PAGES, HOME_PAGE } from '@/lib/pageRegistry';
import { createPageUrl } from '@/utils';
import { COLORS as C } from '@/domain/colors';
import { lazy } from 'react';
import FirstRunSetup from '@/components/FirstRunSetup';
import JarvisBrain from '@/components/cinematic/JarvisBrain';
import CommandPalette from '@/components/cinematic/CommandPalette';
import HeyJarvisListener from '@/components/cinematic/HeyJarvisListener';
import SceneKeyboardNav from '@/components/cinematic/SceneKeyboardNav';
import WorldIncidentFeed from '@/components/cinematic/WorldIncidentFeed';
import MarketsTicker from '@/components/cinematic/MarketsTicker';
import EntityQuickSearch from '@/components/cinematic/EntityQuickSearch';
import RiskBoard from '@/components/cinematic/RiskBoard';
import TaskBoard from '@/components/cinematic/TaskBoard';
import DatasetsBrowser from '@/components/cinematic/DatasetsBrowser';
import InvestigationsList from '@/components/cinematic/InvestigationsList';
import AlertToasts from '@/components/cinematic/AlertToasts';
import JarvisBootSequence from '@/components/cinematic/JarvisBootSequence';
import LiveClockUptime from '@/components/cinematic/LiveClockUptime';
import BrainGrowthSparkline from '@/components/cinematic/BrainGrowthSparkline';
import MultiVoiceToggle from '@/components/cinematic/MultiVoiceToggle';
import ServiceDiagnostics from '@/components/cinematic/ServiceDiagnostics';
import ScenarioLauncher from '@/components/cinematic/ScenarioLauncher';
import DocumentSearch from '@/components/cinematic/DocumentSearch';
import OpsEventStream from '@/components/cinematic/OpsEventStream';
import GraphNetworkExplorer from '@/components/cinematic/GraphNetworkExplorer';
import SceneAnchorDrillDown from '@/components/cinematic/SceneAnchorDrillDown';
import AmbientReactorHum from '@/components/cinematic/AmbientReactorHum';
import SceneAutoTour from '@/components/cinematic/SceneAutoTour';
import CommandHistory from '@/components/cinematic/CommandHistory';
import SituationRoom from '@/components/cinematic/SituationRoom';
import GraphPathExplorer from '@/components/cinematic/GraphPathExplorer';
import MorningBriefing from '@/components/cinematic/MorningBriefing';
import SystemHealthScorecard from '@/components/cinematic/SystemHealthScorecard';
import EntityChronology from '@/components/cinematic/EntityChronology';
import SystemTelemetryRecorder from '@/components/cinematic/SystemTelemetryRecorder';
import ThreatActorNetwork from '@/components/cinematic/ThreatActorNetwork';
import ThreatCorrelationEngine from '@/components/cinematic/ThreatCorrelationEngine';
import LiveIntelPulse from '@/components/cinematic/LiveIntelPulse';
import SceneHealthHeatmap from '@/components/cinematic/SceneHealthHeatmap';
import DailyObjectivesPlanner from '@/components/cinematic/DailyObjectivesPlanner';
import NexusControlPlane from '@/components/overnight/NexusControlPlane';
import SkillScorecard from '@/components/cinematic/SkillScorecard';
import LiveTelemetryTicker from '@/components/cinematic/LiveTelemetryTicker';
import StatusReporter from '@/components/cinematic/StatusReporter';
import OvernightPanels from '@/components/overnight/OvernightPanels';
import InvestmentWidget from '@/components/cinematic/InvestmentWidget';
import ContactsDirectory from '@/components/cinematic/ContactsDirectory';
import SwarmJobsMonitor from '@/components/cinematic/SwarmJobsMonitor';
import GraphCentralityView from '@/components/cinematic/GraphCentralityView';
import KnowledgeBrowser from '@/components/cinematic/KnowledgeBrowser';
import IntelProfileDirectory from '@/components/cinematic/IntelProfileDirectory';
import GraphCommunitiesView from '@/components/cinematic/GraphCommunitiesView';
import IntelDigest from '@/components/cinematic/IntelDigest';
import OpsCasesPanel from '@/components/cinematic/OpsCasesPanel';
import CrisisEarlyWarning from '@/components/cinematic/CrisisEarlyWarning';
import EntityWatchlist from '@/components/cinematic/EntityWatchlist';
import MissionReadinessIndex from '@/components/cinematic/MissionReadinessIndex';
import DatasetGrowthTracker from '@/components/cinematic/DatasetGrowthTracker';
import LiveScenarioMonitor from '@/components/cinematic/LiveScenarioMonitor';
import OpsHealthBanner from '@/components/cinematic/OpsHealthBanner';
import PriorityActionQueue from '@/components/cinematic/PriorityActionQueue';
import ThreatVelocityMonitor from '@/components/cinematic/ThreatVelocityMonitor';
import GraphTopologyHealth from '@/components/cinematic/GraphTopologyHealth';
import AdaptiveThreatReport from '@/components/cinematic/AdaptiveThreatReport';
import GeoSeismicAnalyst from '@/components/cinematic/GeoSeismicAnalyst';
import EntityActivityHeatmap from '@/components/cinematic/EntityActivityHeatmap';
import GraphAnomalyDetector from '@/components/cinematic/GraphAnomalyDetector';
import OpsEventTimeline from '@/components/cinematic/OpsEventTimeline';
import ReportSummariser from '@/components/cinematic/ReportSummariser';
import VitalsMonitor from '@/components/overnight/VitalsMonitor';
import AgentChatTranscript from '@/components/cinematic/AgentChatTranscript';
import InvestigationSkillCoverage from '@/components/cinematic/InvestigationSkillCoverage';
import WorldRiskCorrelator from '@/components/cinematic/WorldRiskCorrelator';
import ScenarioRiskMatrix from '@/components/cinematic/ScenarioRiskMatrix';
import DecisionLedgerBrowser from '@/components/cinematic/DecisionLedgerBrowser';
import ResourcePressureMonitor from '@/components/cinematic/ResourcePressureMonitor';
import SceneNarrator from '@/components/cinematic/SceneNarrator';
import ThreatTimeline from '@/components/cinematic/ThreatTimeline';
import AllScenesAnchorMonitor from '@/components/cinematic/AllScenesAnchorMonitor';
import TaskRiskMatrix from '@/components/cinematic/TaskRiskMatrix';
import KnowledgeRiskCoverage from '@/components/cinematic/KnowledgeRiskCoverage';
import InvestmentRiskExposure from '@/components/cinematic/InvestmentRiskExposure';
import ContactIntelLinker from '@/components/cinematic/ContactIntelLinker';
import SwarmTaskConvergence from '@/components/cinematic/SwarmTaskConvergence';
import SkillTaskAlignment from '@/components/cinematic/SkillTaskAlignment';
import ScenarioSkillCoverage from '@/components/cinematic/ScenarioSkillCoverage';
import InvestigationScenarioConvergence from '@/components/cinematic/InvestigationScenarioConvergence';
import OpsRunbookGenerator from '@/components/cinematic/OpsRunbookGenerator';
import OpsEventHeatmap from '@/components/cinematic/OpsEventHeatmap';
import SkillDatasetCoverageAdvisor from '@/components/cinematic/SkillDatasetCoverageAdvisor';
import IntelFusionBoard from '@/components/cinematic/IntelFusionBoard';
import ContactInvestigationLinker from '@/components/cinematic/ContactInvestigationLinker';
import ReportInvestigationTracer from '@/components/cinematic/ReportInvestigationTracer';

const Launcher = lazy(() => import('@/pages/Launcher'));
const CinematicHome = lazy(() => import('@/pages/CinematicHome'));
const CinematicShell = lazy(() => import('@/components/cinematic/CinematicShell'));

const Loading = () => (
  <div style={{ padding: 40, color: C.text, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: 2 }}>
    ◌ LOADING MODULE…
  </div>
);

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthGate>
            {/* Global first-run install pop-up — shows on the landing page too,
                so a fresh deploy initialises before you even pick a destination. */}
            <FirstRunSetup />
            <JarvisBrain />
            <CommandPalette />
            {/* F02: "Hey JARVIS" always-listening wake word toggle */}
            <HeyJarvisListener />
            {/* F04: keyboard scene-jump (1–0 → scenes; Esc → home) */}
            <SceneKeyboardNav />
            {/* F06: live world incident feed — earthquakes from /functions/getLiveIntel */}
            <WorldIncidentFeed />
            {/* F07: markets ticker — getLiveIntel crypto+FX scrolling strip; "JARVIS, markets" speaks top movers */}
            <MarketsTicker />
            {/* F08: entity quick-search — /v1/graph/subgraph + /entities/IntelProfile; Ctrl+Shift+E or "JARVIS, find X" */}
            <EntityQuickSearch />
            {/* F09: risk board — /entities/RiskSignal severity-sorted cards; critical signals pulse red */}
            <RiskBoard />
            {/* F10: task board — /entities/Task live mission cards with status; "JARVIS, tasks" or "JARVIS, missions" opens panel */}
            <TaskBoard />
            {/* F11: datasets browser — /v1/datasets catalog with row counts; DATA toggle or "JARVIS, datasets" */}
            <DatasetsBrowser />
            {/* F12: investigations panel — /v1/investigations open cases; INTEL toggle or "JARVIS, investigations" */}
            <InvestigationsList />
            {/* F15: alert toasts — /v1/alerts poll every 20 s; toast HIGH/CRITICAL; speak CRITICAL via TTS */}
            <AlertToasts />
            {/* F18: JARVIS boot sequence — once per session; fetches real system+brain counts; cinematic terminal + "all systems online" TTS on click */}
            <JarvisBootSequence />
            {/* F21: live clock + real process uptime from /v1/jarvis/system/status (30-s poll); bottom-left HUD; "JARVIS, time" speaks it */}
            <LiveClockUptime />
            {/* F29: brain-growth sparkline — polls /v1/cinematic/brain every 30 s; area chart of nodes+synapses over time; BRAIN toggle at bottom; "JARVIS, brain growth" speaks trend */}
            <BrainGrowthSparkline />
            {/* F30: multi-voice TTS toggle — ◈ VOICE button at bottom; picks ash/fable/onyx; persists to localStorage; feeds voice param on every /v1/voice/tts POST */}
            <MultiVoiceToggle />
            {/* F35: service diagnostics — ⬡ DIAG button; polls /v1/jarvis/system/status every 30 s; per-service health board + CPU/MEM/LOAD tiles; "JARVIS, service health" voice trigger */}
            <ServiceDiagnostics />
            {/* F37: scenario launcher — SIM button bottom strip; /v1/scenario/list + POST /v1/scenario/run; filter + run + outcome; "JARVIS, scenarios" voice trigger */}
            <ScenarioLauncher />
            {/* F38: document search — ◈ DOCS button; /v1/reports + /knowledge/; filter + click speaks JARVIS summary via TTS; "JARVIS, documents" voice trigger */}
            <DocumentSearch />
            {/* F43: ops event stream — ⬡ OPS button; /v1/ops/events 15-s poll; severity-filtered cards; CRITICAL events spoken via TTS; "JARVIS, ops" voice trigger */}
            <OpsEventStream />
            {/* F44: graph network explorer — /v1/graph/subgraph + /v1/graph/centrality; searchable node/edge table; click node → AI dossier spoken; "JARVIS, graph network" | "network map" voice trigger */}
            <GraphNetworkExplorer />
            {/* F51: scene anchor drill-down — /v1/cinematic/scene/{id}; ⚓ ANCHORS toggle at bottom; clickable anchor rows + recursive detail; Alt+A shortcut; "JARVIS, anchors" voice trigger */}
            <SceneAnchorDrillDown />
            {/* F55: ambient reactor hum — WebAudio 60 Hz sawtooth + harmonics + LFO; ◇/◈ HUM toggle at bottom left:1012; "JARVIS, ambient" voice trigger dispatches jarvis:ambient-toggle */}
            <AmbientReactorHum />
            {/* F59: scene auto-tour — ⟳ TOUR button (left:1844); cycles all 10 cinematic scenes; fetches /v1/cinematic/scene/{id} for narration; speaks via /v1/voice/tts; ▶/⏸/■ controls; "JARVIS, start tour" voice trigger */}
            <SceneAutoTour />
            {/* F60: command history — ◷ HIST button (left:1636); captures every jarvis:ask to localStorage (max 50); filter + replay; Alt+H shortcut; "JARVIS, history" voice trigger (isHistoryQuery already wired in JarvisBrain) */}
            <CommandHistory />
            {/* F68: situation room — ⊕ SITREP button (left:3092); parallel-fetches /v1/jarvis/system/status + /v1/cinematic/brain + /entities/RiskSignal + /entities/SwarmJob + /v1/ops/events; live ops-centre grid; red pulse on critical; "JARVIS, sitrep" voice trigger (isSituationQuery wired in JarvisBrain) */}
            <SituationRoom />
            {/* F74: graph path explorer — ⤢ PATH button (left:2468); /v1/graph/path?a=&b=; source+target entity inputs; hop chain visualised; JARVIS narrates via /v1/jarvis/agent/chat + TTS; "JARVIS, path from X to Y" voice trigger (isPathQuery+buildPathScript wired in JarvisBrain) */}
            <GraphPathExplorer />
            {/* F75: morning briefing — ◈ BRIEF button (left:2156); parallel-fetches /v1/jarvis/system/status + /v1/cinematic/brain + /functions/getLiveIntel; structures spoken briefing from real data; speaks via /v1/voice/tts; "JARVIS, brief me" / "morning briefing" voice trigger (isBriefingQuery+buildBriefingScript wired in JarvisBrain) */}
            <MorningBriefing />
            {/* F80: system health scorecard — ⊕ SCORE button (left:4548); composite 0-100 JARVIS health score from /v1/jarvis/system/status (40%) + /v1/cinematic/brain (30%) + /entities/RiskSignal (30%); score ring + sub-score bars + metric tiles + sparkline history; ASK JARVIS for AI anomaly commentary via /v1/jarvis/agent/chat + TTS; "JARVIS, health score" / "system score" voice trigger (isHealthScoreQuery+buildHealthScoreScript wired in JarvisBrain) */}
            <SystemHealthScorecard />
            {/* F100: entity chronology — ⊕ CHRON button (left:5512); merges /entities/Task+RiskSignal+IntelProfile+SwarmJob+Investment+Contact sorted by timestamp; ALL/TASK/RISK/INTEL/SWARM/INVEST/CONTACT filter tabs + text filter; 60 s auto-refresh; "JARVIS, entity chronology" / "all entities timeline" voice trigger (isEntityChronologyQuery+buildEntityChronologyScript wired in JarvisBrain) */}
            <EntityChronology />
            {/* F103: system telemetry recorder — ⟁ STELM button (left:8396); polls /v1/jarvis/system/status every 60 s; stores up to 60 readings in localStorage; three SVG sparklines (CPU/MEM/LOAD) with delta indicator; voice trigger "telemetry chart / cpu history / system trend / stelm" */}
            <SystemTelemetryRecorder />
            {/* F104: threat actor network — ◈ TAN button (left:7460); cross-references /entities/IntelProfile threat actors with /v1/graph/centrality; composite danger index = threat×0.55 + centrality×0.45; ranked rows with ASSESS → /v1/jarvis/agent/chat + TTS; "threat actor / actor network / who is most dangerous / tan" voice trigger (isThreatActorNetworkQuery + buildThreatActorNetworkScript wired in JarvisBrain) */}
            <ThreatActorNetwork />
            {/* F105: threat correlation engine — ⚡ CORR button (left:3716); parallel-fetches /entities/RiskSignal + /entities/IntelProfile; correlates by shared keyword tokens; top 20 risk↔profile pairs ranked by shared-token score; AI narrative via /v1/jarvis/agent/chat + TTS; severity filter tabs + text search; "correlate threats / threat correlation / correlate risks" voice trigger (isThreatCorrelationQuery + buildThreatCorrelationScript wired in JarvisBrain line 49) */}
            <ThreatCorrelationEngine />
            {/* F107: live intel pulse — ⚡ PULSE button (left:4756); polls /functions/getLiveIntel every 2 min; composite 0-100 global-activity score (seismic 45% + crypto 35% + FX 20%); pulse ring + breakdown bars + sparkline history + top-quake tile + AI briefing via /v1/jarvis/agent/chat; red pulse animation when score ≥75; "intel pulse / global pulse / world activity" voice trigger (isIntelPulseQuery + buildIntelPulseScript wired in JarvisBrain) */}
            <LiveIntelPulse />
            {/* F109: scene health heatmap — ⬡ HEALTH button (left:2052); parallel-fetches all 10 /v1/cinematic/scene/{id}; colour-coded heatmap grid (scene × anchor); cyan=healthy, amber=degraded, red=critical; red badge when critical scenes present; "scene health / heatmap / anchor health / all scenes" voice trigger (isSceneHealthQuery + buildSceneHealthScript wired in JarvisBrain) */}
            <SceneHealthHeatmap />
            {/* F110: daily objectives planner — ◎ DAILY button (left:6628); parallel-fetches /entities/Task + /v1/aip/skill + /entities/RiskSignal; composite urgency+risk+skill score surfaces top-5 objectives; filter tabs ALL/URGENT/RISK-ALIGNED/SKILL-MATCHED; ▶ PLAN → /v1/jarvis/agent/chat action plan + TTS; 5-min auto-refresh; "daily objectives" / "what should I do today" / "daily plan" voice trigger (isDailyObjectivesQuery + buildDailyObjectivesScript wired in JarvisBrain) */}
            <DailyObjectivesPlanner />
            {/* F113: Nexus Control Plane — ⊕ CTRL button (left:1100); polls GET /v1/control/state every 30 s; services alive/total + recent control bus events (seq badge + topic chip + type + actor + relative ts); latest_snapshot + latest_tasks tiles; slate (#94A3B8) accent */}
            <NexusControlPlane />
            {/* F15: skill scorecard — ◈ SKILLS button (left:700); polls /v1/aip/skill every 60 s; skill cards with score bar + level badge + description; "JARVIS, skills" voice trigger (isSkillQuery+buildSkillScript wired in JarvisBrain) */}
            <SkillScorecard />
            {/* F03: live telemetry ticker — thin top-bar HUD; polls /v1/jarvis/system/status (cpu/mem/load) + /v1/cinematic/brain (nodes/synapses) every 30 s; colour-coded pills; hides until first data arrives */}
            <LiveTelemetryTicker />
            {/* F05: spoken status report — "JARVIS, status" or "status report" → fetches /v1/jarvis/system/status + /v1/cinematic/brain; speaks precise numbers via /v1/voice/tts; HUD card auto-dismisses after 14 s */}
            <StatusReporter />
            {/* F136: investment/wealth widget — ◆ WEALTH button (bottom strip); sources /entities/Investment + /entities/WealthSnapshot; holdings list with allocation bars, P&L, type-filter tabs; "JARVIS, investments/portfolio/wealth" jarvis:ask voice trigger; 60 s auto-refresh */}
            <InvestmentWidget />
            {/* F24: contacts directory — ◈ CONTACTS button (left:1220); sources /entities/Contact; searchable by name/role/email/dept/tags; 5-min auto-refresh; "JARVIS, contacts/people/directory" jarvis:ask voice trigger */}
            <ContactsDirectory />
            {/* F25: swarm jobs monitor — ⬡ SWARM button (left:1324); polls /entities/SwarmJob every 20 s; running/queued/failed/done stat tiles + filter tabs + per-job progress bars; red pulse when failures present; "JARVIS, swarm" voice trigger (isSwarmQuery+buildSwarmScript wired in JarvisBrain) */}
            <SwarmJobsMonitor />
            {/* F26: graph centrality view — ◈ GRAPH button (left:1428); polls /v1/graph/centrality every 60 s; top-node highlight + influence bars + type-filter tabs + search; "JARVIS, centrality" / "who has most influence" voice trigger (isCentralityQuery+buildCentralityScript wired in JarvisBrain) */}
            <GraphCentralityView />
            {/* F131: overnight panels launcher — ◈ button at left:340 bottom:18; searchable category-grouped grid of all cinematic panels (panelRegistry.generated.js); lazy-mounts one panel at a time behind PanelErrorBoundary; gives on-demand access to the full panel library without 100+ floating buttons */}
            <OvernightPanels />
            {/* F31: knowledge browser — ◈ KNOW button (left:2260); fetches /knowledge/ → article list with search; click → /v1/jarvis/agent/chat AI summary + /v1/voice/tts spoken; "JARVIS, knowledge" voice trigger (isKnowledgeQuery+buildKnowledgeScript already wired in JarvisBrain) */}
            <KnowledgeBrowser />
            {/* F32: intel profile directory — ◈ INTEL button (left:1948); sources /entities/IntelProfile; threat-ranked profiles with type tabs; Alt+I shortcut; "JARVIS, intel profiles" voice trigger (isIntelProfileQuery+buildIntelProfileScript already wired in JarvisBrain) */}
            <IntelProfileDirectory />
            {/* F33: graph communities view — ◍ CLUSTERS button (left:2364); /v1/graph/communities label-propagation clustering; colour-coded cluster cards with member counts + search; 90-s auto-refresh; "JARVIS, communities"/"show clusters" voice trigger (isCommunitiesQuery+buildCommunitiesScript wired in JarvisBrain) */}
            <GraphCommunitiesView />
            {/* F34: intel digest — ◈ DIGEST button; polls /functions/getLiveIntel every 5 min; feeds quake/crypto/FX data to /v1/jarvis/agent/chat for AI-written 3-sentence digest; speaks via TTS; "JARVIS, intel digest"/"live digest"/"news digest" voice trigger (isIntelDigestQuery+buildIntelDigestScript wired in JarvisBrain) */}
            <IntelDigest />
            {/* F35: ops cases panel — ◈ CASES button (left:5616); browses /v1/cases; status filter tabs (all/open/investigating/closed); click case → /v1/cases/{id} full detail (notes + entities); 60-s auto-refresh; "JARVIS, cases"/"ops cases"/"case files" voice trigger (isOpsCasesQuery+buildOpsCasesScript wired in JarvisBrain) */}
            <OpsCasesPanel />
            {/* F36: crisis early warning system — ⚠ CRISIS button (left:6940); parallel-fetches /entities/RiskSignal + /functions/getLiveIntel + /v1/ops/events every 90 s; DEFCON 1–5 composite threat level ring; announces level change via TTS; "JARVIS, crisis level"/"defcon"/"threat level"/"early warning" voice trigger (isCrisisWarningQuery+buildCrisisWarningScript wired in JarvisBrain) */}
            <CrisisEarlyWarning />
            {/* F37: entity watchlist — ⬡ WATCH button (left:4444); stores pinned entities in localStorage; live-fetches /entities/{Task,RiskSignal,IntelProfile,SwarmJob,Investment,Contact} for each saved item; click → AI assessment via /v1/jarvis/agent/chat + TTS; other panels pin via jarvis:watchlist-add CustomEvent; "JARVIS, watchlist"/"my watchlist"/"watched items" voice trigger (isWatchlistQuery+buildWatchlistScript wired in JarvisBrain) */}
            <EntityWatchlist />
            {/* F38: mission readiness index — ◎ READY button (left:5692); parallel-fetches /entities/Task (25%) + /v1/aip/skill (30%) + /entities/SwarmJob (20%) + /v1/jarvis/system/status (25%); composite 0-100 MRI score ring gauge + 4 sub-score bars + detail text; ▶ JARVIS ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence AI assessment + TTS; 45-s auto-refresh; live score badge on button; "mission ready"/"readiness"/"ready index"/"operational ready" voice trigger (isMissionReadyQuery+buildMissionReadyScript already wired in JarvisBrain) */}
            <MissionReadinessIndex />
            {/* F39: dataset growth tracker — ⟁ DSGR button (left:8060); polls /v1/datasets every 90 s; stores per-dataset row-count history in localStorage (max 20 readings); shows count delta + SVG sparkline per dataset; fastest-growing highlighted; "dataset growth"/"data growth"/"which dataset is growing"/"dsgr" voice trigger (isDatasetGrowthQuery+buildDatasetGrowthScript wired in JarvisBrain) */}
            <DatasetGrowthTracker />
            {/* F40: live scenario monitor — ▶ SMON button (left:5304); polls /v1/scenario/list every 30 s; status-sorted cards (running/pending/queued/failed/completed); badge on state transitions; auto-announces completions/failures via TTS jarvis:speak-dossier; "scenario monitor"/"running scenarios"/"simulation status"/"smon" voice trigger (isScenarioMonitorQuery+buildScenarioMonitorScript wired in JarvisBrain) */}
            <LiveScenarioMonitor />
            {/* F41: ops health banner — ◈ OHB button (left:8732); persistent slim strip at bottom:40; parallel-polls /v1/jarvis/system/status + /entities/RiskSignal + /entities/Task + /entities/SwarmJob every 30–60 s; SYS/RISKS/TASKS/SWARM colour-coded pills; click pill → opens relevant panel; default-visible on first data; "ops health"/"operational health"/"ops summary"/"ohb" voice trigger */}
            <OpsHealthBanner />
            {/* F42: priority action queue — ⚡ QUEUE button (left:3404); parallel-fetches /entities/Task + /entities/RiskSignal + /v1/investigations; urgency-scores all items; unified ranked "what needs attention now" list; click → /v1/jarvis/agent/chat AI recommendation spoken via jarvis:speak-dossier; 45-s auto-refresh; "priority queue"/"what needs attention"/"urgent items"/"action items" voice trigger (isPriorityQueueQuery+buildPriorityQueueScript already wired in JarvisBrain) */}
            <PriorityActionQueue />
            {/* F43: threat velocity monitor — ⚡ VEL button (left:4860); polls /entities/RiskSignal every 30 s; rolling 10-sample window computes thr/min rate; SURGE/ELEVATED/NOMINAL badge + sparkline + big velocity number; auto-announces SURGE ≥3/min via jarvis:speak-dossier; isThreatVelocityQuery+buildThreatVelocityScript wired in JarvisBrain; "threat velocity"/"threat rate"/"threat surge" voice trigger */}
            <ThreatVelocityMonitor />
            {/* F44: graph topology health — ⬡ GTOPO button (left:9340); parallel-polls /v1/graph/centrality + /v1/graph/communities every 90 s; composite 0-100 topology health score (concentration penalty + community diversity bonus); score ring + stat tiles + sparkline history (localStorage) + AI assessment via /v1/jarvis/agent/chat + TTS; isGtopoQuery+buildGtopoScript wired in JarvisBrain; "graph topology"/"network topology"/"topology health"/"gtopo" voice trigger */}
            <GraphTopologyHealth />
            {/* F45: adaptive threat report — ◎ ATHREP button (left:5380); parallel-fetches /entities/RiskSignal + /entities/IntelProfile + /v1/ops/events + /v1/investigations; compiles live context block → /v1/jarvis/agent/chat authors multi-section Threat Intelligence Report (exec summary / active threats / actors / ops events / open cases / recommendations); exec summary spoken via TTS; clipboard copy; isAthrepQuery+buildAthrepScript wired in JarvisBrain; "threat report"/"generate threat report"/"threat intelligence"/"athrep" voice trigger */}
            <AdaptiveThreatReport />
            {/* F46: geo-seismic analyst — ◎ GEOS button (left:6836); fetches /functions/getLiveIntel earthquake data; bins events into named geographic regions; ranked threat score per region (avg mag, max depth, event count); ELEVATED/ACTIVE/MODERATE/QUIET tabs; click ▶ ANALYZE → /v1/jarvis/agent/chat 2-sentence regional threat assessment + TTS; 5-min auto-refresh; pulse badge on elevated regions; "geo seismic"/"seismic regions"/"earthquake regions"/"geos" voice trigger (isGeoSeismicQuery+buildGeoSeismicScript already wired in JarvisBrain) */}
            <GeoSeismicAnalyst />
            {/* F47: entity activity heatmap — ◈ EACTV button (left:7356); parallel-fetches all 6 entity types; activity ratio per type (IN_PROGRESS tasks, CRITICAL risks, RUNNING swarms…); ALL/HIGH/MID/LOW filter tabs; ▶ ASSESS → /v1/jarvis/agent/chat domain-activity brief + TTS; 60-s auto-refresh; isEntityActivityQuery+buildEntityActivityScript already wired in JarvisBrain; "entity activity"/"activity heatmap"/"domain activity"/"eactv" voice trigger */}
            <EntityActivityHeatmap />
            {/* F48: graph anomaly detector — ◈ ANOMALY button (left:5588); fetches /v1/graph/centrality; groups by type; computes z-score per peer group; flags nodes ≥1.5 SD above peer mean; anomaly cards + score bars; click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence explanation + TTS; red badge on HIGH anomaly count; 60-s auto-refresh; isGraphAnomalyQuery+buildGraphAnomalyScript wired in JarvisBrain; "graph anomaly"/"outlier"/"unusual node"/"anomaly detect" voice trigger */}
            <GraphAnomalyDetector />
            {/* F49: ops event timeline — ◈ OEVT button (left:9900); fetches /v1/ops/events every 60 s; reverse-chronological log; CRITICAL/WARNING/INFO colour-coded rows; ALL/CRITICAL/WARNING/INFO filter tabs; red badge on critical count; click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence event context + TTS; auto-announces new CRITICAL events via jarvis:speak-dossier; isOpsEventTimelineQuery+buildOpsEventTimelineScript wired in JarvisBrain; "ops events"/"ops timeline"/"event log"/"oevt" voice trigger */}
            <OpsEventTimeline />
            {/* F50: report summariser — ◎ SUMM button (left:2572); fetches /v1/reports every 2 min; filterable report list; click any report → /v1/jarvis/agent/chat AI executive summary + spoken via jarvis:speak-dossier TTS; isReportSummariserQuery+buildReportSummariserScript already wired in JarvisBrain; "summarize report"/"report summary" voice trigger */}
            <ReportSummariser />
            {/* F51: biometric vitals monitor — ◈ VITALS button (left:10460); polls /v1/vitals/latest every 60 s; HR/HRV/SpO₂/steps/sleep/weight gauge cards + GaugeBar; always returns data (falls back to default schema); ▶ JARVIS ASSESS → /v1/jarvis/agent/chat 2-sentence health commentary + TTS; "JARVIS, vitals"/"biometrics"/"health metrics"/"body stats" voice trigger */}
            <VitalsMonitor />
            {/* F52: agent chat transcript — ◉ CHAT button (left:3512); persistent multi-turn chat panel wired to /v1/jarvis/agent/chat; keeps scrollable conversation history in localStorage (max 60 msgs); typed input separate from ephemeral JarvisBrain overlay; isChatQuery+buildChatScript already wired in JarvisBrain; "JARVIS, open chat"/"chat panel"/"agent chat" voice trigger */}
            <AgentChatTranscript />
            {/* F53: investigation skill coverage — ◎ ISCOV button (left:11020); parallel-fetches /v1/aip/skill + /v1/investigations + /entities/RiskSignal; cross-references skill tokens against investigation/risk keywords; coverage % badge + gap list; ▶ ANALYSE GAPS → /v1/jarvis/agent/chat + TTS; isIscovQuery+buildIscovScript wired in JarvisBrain; "investigation coverage"/"skill coverage"/"coverage audit"/"iscov" voice trigger; 5-min auto-refresh */}
            <InvestigationSkillCoverage />
            {/* F54: world risk correlator — ◈ WRLRSK button (left:9228); parallel-fetches /functions/getLiveIntel (earthquakes) + /entities/RiskSignal; keyword-correlates each seismic event against risk-signal catalog; CORROBORATED vs SOLO classification; stat tiles (quakes/risks/corroborated/solo); ALL/CORROBORATED/SOLO filter tabs; expand any quake → matched signals with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence geophysical-risk brief + TTS; isWrlrskQuery+buildWrlrskScript wired in JarvisBrain; "world risk"/"quake risk"/"geo risk"/"wrlrsk" voice trigger; 90-s auto-refresh */}
            <WorldRiskCorrelator />
            {/* F55: scenario-risk exposure matrix — ◈ SCRISK button (left:11580); parallel-fetches /v1/scenario/list + /entities/RiskSignal; keyword-correlates scenario names/objectives against risk titles/categories; SCENARIOS/RISKS tabs; expand any row → matched items with relevance score; exposed-count badge; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence exposure brief + TTS; isScenarioRiskQuery+buildScenarioRiskScript wired in JarvisBrain; "scenario risk"/"risk exposure"/"scenario exposure"/"scrisk" voice trigger; 120-s auto-refresh */}
            <ScenarioRiskMatrix />
            {/* F56: decision ledger browser — ◈ DECIS button (left:12140); fetches /v1/decision/list every 90 s; scrollable log of recorded decisions with title/reason/risks/alternatives; amber badge on decisions carrying documented risks; click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategic commentary + TTS via jarvis:speak-dossier; isDecisQuery+buildDecisScript wired in JarvisBrain; "decision ledger"/"decisions"/"decision log"/"decis" voice trigger */}
            <DecisionLedgerBrowser />
            {/* F57: resource pressure monitor — ⊡ RPRES button (left:7668); parallel-polls /v1/jarvis/system/status + /entities/SwarmJob + /v1/ops/events every 30 s; 0–100 pressure score (CPU 40%+MEM 30%+load 20%+job density 10%); gauge bar + stat tiles + swarm job summary + recent ops events; red pulse on CRITICAL (≥80); ▶ ASSESS → /v1/jarvis/agent/chat + TTS; "resource pressure"/"system load analysis"/"respres"/"resource monitor"/"swarm load" voice trigger */}
            <ResourcePressureMonitor />
            {/* F58: scene narrator — ◎ NARRATE button (left:5728); fetches /v1/cinematic/scene/{sceneId} anchor data for the currently-viewed scene → /v1/jarvis/agent/chat AI narrative → spoken via /v1/voice/tts; re-narrates when scene changes while open; isSceneNarratorQuery+buildSceneNarratorScript wired in JarvisBrain; "narrate scene"/"describe this scene"/"scene story"/"snarrate"/"what does this scene show" voice trigger */}
            <SceneNarrator />
            {/* F59: threat timeline — ◈ TL button (left:2884); merges /entities/RiskSignal + /v1/ops/events + /v1/investigations into unified reverse-chronological feed; severity-colour rows; ALL/RISK/EVENT/CASE filter tabs; 30-s auto-refresh; isTimelineQuery+buildTimelineScript wired in JarvisBrain; "threat timeline"/"intel timeline"/"timeline"/"unified feed" voice trigger */}
            <ThreatTimeline />
            {/* F60: all-scenes anchor monitor — ◈ SACM button (left:12700); polls all 10 /v1/cinematic/scene/{id} endpoints in parallel every 60 s; shows real anchor data per scene; badge on total anchor count; click row → expand anchor key/value pairs; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scene-health brief + TTS; isSceneAnchorMonitorQuery+buildSceneAnchorMonitorScript wired in JarvisBrain; "scene anchors"/"anchor monitor"/"all scene data"/"sacm"/"scene anchor feed" voice trigger */}
            <AllScenesAnchorMonitor />
            {/* F61: task-risk matrix — ◈ TRISK button (left:8084); parallel-fetches /entities/Task + /entities/RiskSignal; keyword-correlates tasks against risk signals to surface hidden exposure; EXPOSED/CLEAN filter tabs; click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence risk-exposure brief + TTS; isTaskRiskMatrixQuery+buildTaskRiskMatrixScript wired in JarvisBrain; "task risk"/"risky tasks"/"task exposure"/"task risk matrix"/"triskmat" voice trigger; 90-s auto-refresh */}
            <TaskRiskMatrix />
            {/* F62: knowledge-risk coverage — ◈ KNRSK button (left:13260); parallel-fetches /knowledge/ + /entities/RiskSignal; keyword-correlates each risk signal against knowledge articles to surface BLIND SPOTs (risks with no coverage) vs COVERED; stat tiles (risks/articles/covered/blind-spots); BLIND-SPOTS/COVERED/ALL filter tabs + search; expand any risk → matched articles or gap warning; amber badge on blind-spot count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence blind-spot advisory + TTS; isKnrskQuery+buildKnrskScript wired in JarvisBrain; "knowledge risk"/"risk coverage"/"knowledge gap"/"blind spot"/"knrsk" voice trigger; 5-min auto-refresh */}
            <KnowledgeRiskCoverage />
            {/* F63: investment-risk exposure — ◈ INVRSK button (left:10060); parallel-fetches /entities/Investment + /entities/RiskSignal; keyword-correlates each holding against active risk signals; EXPOSED/SAFE/ALL filter tabs; expand holding → matched risks with severity + score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-risk brief + TTS; "investment risk"/"portfolio risk"/"risky investments"/"invrsk" voice trigger; 90-s auto-refresh */}
            <InvestmentRiskExposure />
            {/* F64: contact–intel linker — ◈ CINTL button (left:13820); parallel-fetches /entities/Contact + /entities/IntelProfile; keyword-correlates each contact (name/role/org/notes) against intel profiles to surface LINKED vs UNLINKED; ALL/LINKED/UNLINKED filter tabs + text search; expand contact → matched intel profiles with threat level + type badge + relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-intel brief + TTS; isCtintlQuery+buildCtintlScript wired in JarvisBrain; "contact intel"/"contact profiles"/"contact threat link"/"which contacts are flagged"/"cintl" voice trigger; 5-min auto-refresh */}
            <ContactIntelLinker />
            {/* F65: swarm-to-task convergence tracker — ◈ SWTASK button (left:14380); parallel-fetches /entities/SwarmJob + /entities/Task; keyword-correlates each swarm job against tasks to surface ALIGNED pairs vs UNMATCHED items; convergence % badge; ALL/ALIGNED/UNMATCHED filter tabs + text search; expand job → matched tasks with priority + status badge + relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence convergence brief + TTS via jarvis:speak-dossier; isSwarmTaskQuery+buildSwarmTaskScript wired in JarvisBrain; "swarm task convergence"/"swarm alignment"/"which jobs match tasks"/"swtask" voice trigger; 60-s auto-refresh */}
            <SwarmTaskConvergence />
            {/* F66: skill-task alignment dashboard — ◈ SKTAL button (left:14940); parallel-fetches /v1/aip/skill + /entities/Task; keyword-correlates each task against skills to surface COVERED tasks (have skill backing) vs ORPHANED (no matching skill) + UNUSED skills (dormant capability); stat tiles (skills/tasks/covered/orphaned); TASKS/ORPHANED/UNUSED filter tabs + search; expand task → matched skills with score; amber badge on orphaned count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence readiness brief + TTS via jarvis:speak-dossier; isSktalQuery+buildSktalScript wired in JarvisBrain; "skill task alignment"/"task coverage"/"orphaned tasks"/"which tasks have skills"/"sktal" voice trigger; 5-min auto-refresh */}
            <SkillTaskAlignment />
            {/* F67: scenario-skill coverage analyzer — ◈ SSCOV button (left:15500); parallel-fetches /v1/scenario/list + /v1/aip/skill; keyword-correlates each scenario against skills to surface EQUIPPED vs UNEQUIPPED; stat tiles (scenarios/skills/equipped/unequipped); ALL/EQUIPPED/UNEQUIPPED filter tabs + text search; expand scenario → matched skills with relevance score + category; amber badge on unequipped count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scenario readiness brief + TTS; isScenSkillCovQuery+buildScenSkillCovScript wired in JarvisBrain; "scenario skill coverage"/"scenario readiness"/"sscov" voice trigger; 5-min auto-refresh */}
            <ScenarioSkillCoverage />
            {/* F68: investigation-scenario convergence tracker — ◈ ISVCON button (left:16060); parallel-fetches /v1/investigations + /v1/scenario/list + /entities/RiskSignal; keyword-correlates each investigation against scenarios to surface CONVERGED (backed by scenario) vs ISOLATED (no scenario coverage); stat tiles (investigations/scenarios/converged/isolated); ALL/CONVERGED/ISOLATED filter tabs + text search; expand investigation → matched scenarios with status+relevance + associated risk signals with severity; amber badge on isolated count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence convergence brief + TTS; isIsvconQuery+buildIsvconScript wired in JarvisBrain; "investigation scenario convergence"/"investigation scenarios"/"isvcon"/"convergence tracker" voice trigger; 90-s auto-refresh */}
            <InvestigationScenarioConvergence />
            {/* F69: ops runbook generator — ◎ RUNBOOK button (left:4964); fetches /v1/ops/events every 30 s; lists recent critical/high/medium events; click any event → /v1/jarvis/agent/chat generates a 3-step remediation runbook; first step spoken via jarvis:speak-dossier; ALL/CRITICAL/HIGH filter tabs; red badge on CRITICAL count; isRunbookQuery+buildRunbookScript wired in JarvisBrain; "runbook"/"remediation"/"playbook"/"incident response" voice trigger */}
            <OpsRunbookGenerator />
            {/* F70: ops event frequency heatmap — ◈ EVTHM button (left:16620); fetches /v1/ops/events every 60 s; buckets events by hour-of-day (0–23); 24-cell 4×6 colour-gradient heatmap (QUIET→SURGE); peak/quiet/count stat tiles; ALL/CRITICAL/WARNING/INFO filter tabs; red badge on critical count; outlined cell = current hour; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence temporal pattern brief + TTS via jarvis:speak-dossier; isEvthmQuery+buildEvthmScript wired in JarvisBrain; "event heatmap"/"ops frequency"/"event timing"/"evthm" voice trigger */}
            <OpsEventHeatmap />
            {/* F71: skill-dataset coverage advisor — ◈ SKDS button (left:8500); parallel-fetches /v1/aip/skill + /v1/datasets; keyword-correlates each self-improvement skill against the dataset catalog; BACKED (data available) vs DARK (no dataset coverage) classification; stat tiles (skills/datasets/backed/dark); ALL/BACKED/DARK filter tabs + text search; expand skill → matched datasets with relevance score; dark-skill count badge; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence readiness brief + TTS via jarvis:speak-dossier; isSkdsQuery+buildSkdsScript already wired in JarvisBrain; "skill dataset"/"skill data gap"/"data for skills"/"skds" voice trigger; 90-s auto-refresh */}
            <SkillDatasetCoverageAdvisor />
            {/* F72: intelligence fusion board — ◈ IFUSE button (left:17180); parallel-fetches /functions/getLiveIntel + /entities/RiskSignal + /entities/IntelProfile + /v1/investigations + /v1/ops/events every 60 s; fuses 5 sources into unified severity-sorted signal stream; stat tiles (total/seismic/risk/ops); ALL/SEISMIC/RISK/INTEL/INV/OPS filter tabs; critical badge; auto-announces new CRITICAL/HIGH items via jarvis:speak-dossier (dedup); ▶ BRIEF → /v1/jarvis/agent/chat 2-sentence fusion brief + TTS; isIfuseQuery+buildIfuseScript wired in JarvisBrain; "intelligence fusion"/"fuse intel"/"intel board"/"all signals"/"ifuse" voice trigger */}
            <IntelFusionBoard />
            {/* F73: contact–investigation linker — ◈ CINVL button (left:6212); parallel-fetches /entities/Contact + /v1/investigations; keyword-correlates each contact (name/org/tags/role) against open/in-progress investigation titles+descriptions to surface LINKED contacts per case; ALL/LINKED/UNLINKED filter tabs; expand case → matched contacts with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-relevance assessment + TTS via jarvis:speak-dossier; isContactInvQuery+buildContactInvScript wired in JarvisBrain; "contact investigation"/"case contact"/"who is linked"/"contact linker"/"cinvl"/"contact case" voice trigger; 5-min auto-refresh */}
            <ContactInvestigationLinker />
            {/* F74: report-investigation tracer — ◈ RINVT button (left:17740); parallel-fetches /v1/reports + /v1/investigations; keyword-correlates each investigation against the report catalog to surface TRACED (report-backed) vs UNDOCUMENTED (no report coverage) investigations; stat tiles (investigations/reports/traced/undocumented); ALL/TRACED/UNDOCUMENTED filter tabs + text search; expand investigation → matched reports with relevance score + type badge; amber badge on undocumented count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence documentation-gap brief + TTS via jarvis:speak-dossier; isRinvtQuery+buildRinvtScript wired in JarvisBrain; "report investigation"/"undocumented cases"/"which investigations have reports"/"report traceability"/"rinvt" voice trigger; 5-min auto-refresh */}
            <ReportInvestigationTracer />
            <Suspense fallback={<Loading />}>
              <Routes>
                {/* Front door is now the cinematic selector (JARVIS / Underworld).
                    The 86-page APEX wall is preserved under /apex but is no longer
                    the entry point. The old portal chooser stays at /portal. */}
                <Route path="/" element={<CinematicHome />} />
                {/* Public clean URL: app.projectsolar.cloud/jarvis/Home serves the same
                    launcher (nginx proxies /jarvis/Home + the app's /assets,/immersive,/models,
                    /cinematic,/apex,/portal paths to this SPA on :5173). */}
                <Route path="/jarvis/Home" element={<CinematicHome />} />
                <Route path="/portal" element={<Launcher />} />

                {/* The 10 render-locked immersive scenes (the JARVIS experience). */}
                <Route path="/cinematic" element={<Navigate to="/cinematic/01_command_atrium" replace />} />
                <Route path="/cinematic/:sceneId" element={<CinematicShell />} />

                {/* APEX HUD — AppLayout + all feature pages live under /apex. */}
                <Route
                  path="/apex/*"
                  element={
                    <AppLayout>
                      <Suspense fallback={<Loading />}>
                        <Routes>
                          <Route index element={<Navigate to={createPageUrl(HOME_PAGE.name).slice(1)} replace />} />
                          {PAGES.map((p) => {
                            const Page = p.component;
                            // Relative paths (no leading slash) since this Routes
                            // tree is nested under the /apex/* parent route.
                            return <Route key={p.name} path={createPageUrl(p.name).slice(1)} element={<Page />} />;
                          })}
                          <Route path="*" element={<PageNotFound />} />
                        </Routes>
                      </Suspense>
                    </AppLayout>
                  }
                />

                <Route path="*" element={<PageNotFound />} />
              </Routes>
            </Suspense>
          </AuthGate>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
