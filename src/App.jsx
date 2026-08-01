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
import DatasetScenarioCoverage from '@/components/cinematic/DatasetScenarioCoverage';
import KnowledgeScenarioCoverage from '@/components/cinematic/KnowledgeScenarioCoverage';
import ContactKnowledgeAdvisor from '@/components/cinematic/ContactKnowledgeAdvisor';
import OpsEventTaskCorrelator from '@/components/cinematic/OpsEventTaskCorrelator';
import KnowledgeInvestigationLinker from '@/components/cinematic/KnowledgeInvestigationLinker';
import RiskSignalKnowledgeCoverage from '@/components/cinematic/RiskSignalKnowledgeCoverage';
import SwarmJobKnowledgeCoverage from '@/components/cinematic/SwarmJobKnowledgeCoverage';
import IntelProfileInvestigationLinker from '@/components/cinematic/IntelProfileInvestigationLinker';
import TaskDecisionTracer from '@/components/cinematic/TaskDecisionTracer';
import ScenarioStatusBar from '@/components/overnight/ScenarioStatusBar';
import DatasetFreshnessMonitor from '@/components/cinematic/DatasetFreshnessMonitor';
import ContactTaskLinker from '@/components/cinematic/ContactTaskLinker';
import ContactScenarioAssignor from '@/components/cinematic/ContactScenarioAssignor';
import InvestmentKnowledgeAdvisor from '@/components/cinematic/InvestmentKnowledgeAdvisor';
import ReportRiskCorrelator from '@/components/cinematic/ReportRiskCorrelator';
import DecisionRiskAligner from '@/components/cinematic/DecisionRiskAligner';
import IntelProfileKnowledgeAdvisor from '@/components/cinematic/IntelProfileKnowledgeAdvisor';
import DecisionKnowledgeCoverage from '@/components/cinematic/DecisionKnowledgeCoverage';
import SwarmRiskCoverage from '@/components/cinematic/SwarmRiskCoverage';
import ContactOpsLinker from '@/components/cinematic/ContactOpsLinker';
import DatasetRiskAnalyzer from '@/components/cinematic/DatasetRiskAnalyzer';
import OpsEventRiskCorrelator from '@/components/cinematic/OpsEventRiskCorrelator';
import ContactRiskExposure from '@/components/cinematic/ContactRiskExposure';
import IntelProfileRiskLinker from '@/components/cinematic/IntelProfileRiskLinker';
import MarketPortfolioCrossfire from '@/components/cinematic/MarketPortfolioCrossfire';
import DatasetInvestigationCorrelator from '@/components/cinematic/DatasetInvestigationCorrelator';
import OpsInvCorrelator from '@/components/cinematic/OpsInvCorrelator';
import TaskKnowledgeCoverage from '@/components/cinematic/TaskKnowledgeCoverage';
import KnowledgeAcquisitionAdvisor from '@/components/cinematic/KnowledgeAcquisitionAdvisor';
import ReportScenarioMapper from '@/components/cinematic/ReportScenarioMapper';
import InvestmentDecisionAligner from '@/components/cinematic/InvestmentDecisionAligner';
import ContactThreatLinker from '@/components/cinematic/ContactThreatLinker';
import SwarmScenarioCoverage from '@/components/cinematic/SwarmScenarioCoverage';
import SwarmDecisionAlignment from '@/components/cinematic/SwarmDecisionAlignment';
import SkillRiskCoverage from '@/components/cinematic/SkillRiskCoverage';
import ReportTaskCoverage from '@/components/cinematic/ReportTaskCoverage';
import SitrepCommander from '@/components/cinematic/SitrepCommander';
import OpsEventKnowledgeCoverage from '@/components/cinematic/OpsEventKnowledgeCoverage';
import VitalsTrendAnalyzer from '@/components/cinematic/VitalsTrendAnalyzer';
import IntelProfileTaskLinker from '@/components/cinematic/IntelProfileTaskLinker';
import InvestmentContactMapper from '@/components/cinematic/InvestmentContactMapper';
import ScenarioInvestmentExposure from '@/components/cinematic/ScenarioInvestmentExposure';
import TaskScenarioCoverage from '@/components/cinematic/TaskScenarioCoverage';
import SwarmContactLinker from '@/components/cinematic/SwarmContactLinker';
import SwarmInvestigationCoverage from '@/components/cinematic/SwarmInvestigationCoverage';
import InvestmentSwarmCoverage from '@/components/cinematic/InvestmentSwarmCoverage';
import DecisionScenarioCoverage from '@/components/cinematic/DecisionScenarioCoverage';
import TaskDatasetTracker from '@/components/cinematic/TaskDatasetTracker';
import OpsEventReportTracker from '@/components/cinematic/OpsEventReportTracker';
import ReportKnowledgeGapAdvisor from '@/components/cinematic/ReportKnowledgeGapAdvisor';
import ContactInvestigationExposure from '@/components/cinematic/ContactInvestigationExposure';
import GraphCommunityRiskHeatmap from '@/components/cinematic/GraphCommunityRiskHeatmap';
import ContactDecisionLinker from '@/components/cinematic/ContactDecisionLinker';
import InvestmentGraphInfluence from '@/components/cinematic/InvestmentGraphInfluence';
import IntelProfileScenarioCoverage from '@/components/cinematic/IntelProfileScenarioCoverage';
import GraphCentralityContactMapper from '@/components/cinematic/GraphCentralityContactMapper';
import ScenarioSkillReadiness from '@/components/cinematic/ScenarioSkillReadiness';
import InvestmentTaskAligner from '@/components/cinematic/InvestmentTaskAligner';
import SkillKnowledgeCoverage from '@/components/cinematic/SkillKnowledgeCoverage';
import DecisionDatasetTracker from '@/components/cinematic/DecisionDatasetTracker';
import OpsKnowledgeCorrelator from '@/components/cinematic/OpsKnowledgeCorrelator';
import ContactReportCoverage from '@/components/cinematic/ContactReportCoverage';
import SwarmReportCoverage from '@/components/cinematic/SwarmReportCoverage';
import InvestmentDatasetCorrelator from '@/components/cinematic/InvestmentDatasetCorrelator';
import SwarmDatasetCoverage from '@/components/cinematic/SwarmDatasetCoverage';
import IntelProfileSwarmCoverage from '@/components/cinematic/IntelProfileSwarmCoverage';
import GraphCommunityInvestigationLinker from '@/components/cinematic/GraphCommunityInvestigationLinker';
import TaskInvestigationLinker from '@/components/cinematic/TaskInvestigationLinker';
import RiskInvestigationLinker from '@/components/cinematic/RiskInvestigationLinker';
import DecisionReportCoverage from '@/components/cinematic/DecisionReportCoverage';
import IntelTriggerDetector from '@/components/cinematic/IntelTriggerDetector';
import GraphCommunitySwarmCoverage from '@/components/cinematic/GraphCommunitySwarmCoverage';
import RiskScenarioCoverage from '@/components/cinematic/RiskScenarioCoverage';
import SceneCompareView from '@/components/cinematic/SceneCompareView';
import InvestmentInvestigationLinker from '@/components/cinematic/InvestmentInvestigationLinker';
import InvestmentOpsMonitor from '@/components/cinematic/InvestmentOpsMonitor';
import OpsScenarioGap from '@/components/cinematic/OpsScenarioGap';
import IntelProfileOpsLinker from '@/components/cinematic/IntelProfileOpsLinker';
import SceneDataDiff from '@/components/cinematic/SceneDataDiff';
import InvestmentRiskOverlay from '@/components/cinematic/InvestmentRiskOverlay';
import SkillInvestigationCoverage from '@/components/cinematic/SkillInvestigationCoverage';
import EntityRegistryOverview from '@/components/cinematic/EntityRegistryOverview';
import DatasetQueryAssistant from '@/components/cinematic/DatasetQueryAssistant';
import GraphNodeKnowledgeCoverage from '@/components/cinematic/GraphNodeKnowledgeCoverage';
import InvestigationCaseWorkspace from '@/components/cinematic/InvestigationCaseWorkspace';
import ReportRiskTracker from '@/components/cinematic/ReportRiskTracker';
import SwarmGraphConvergence from '@/components/cinematic/SwarmGraphConvergence';
import SnapshotTracker from '@/components/cinematic/SnapshotTracker';
import InvestigationCloseRate from '@/components/cinematic/InvestigationCloseRate';
import GraphNodeTaskCoverage from '@/components/cinematic/GraphNodeTaskCoverage';
import OpsTaskCoverageChecker from '@/components/cinematic/OpsTaskCoverageChecker';
import SceneRiskCoverageMap from '@/components/cinematic/SceneRiskCoverageMap';
import OpsEventSeverityDashboard from '@/components/cinematic/OpsEventSeverityDashboard';
import GraphNodeReportCoverage from '@/components/cinematic/GraphNodeReportCoverage';
import LiveIntelTaskActivator from '@/components/cinematic/LiveIntelTaskActivator';
import SkillLiveIntelDemand from '@/components/cinematic/SkillLiveIntelDemand';
import ContactLiveIntelExposure from '@/components/cinematic/ContactLiveIntelExposure';
import CryptoRiskCorrelator from '@/components/cinematic/CryptoRiskCorrelator';
import ContactRiskSignalCorrelator from '@/components/cinematic/ContactRiskSignalCorrelator';
import SwarmJobRiskCorrelator from '@/components/cinematic/SwarmJobRiskCorrelator';
import LiveIntelGraphExposure from '@/components/cinematic/LiveIntelGraphExposure';
import ContactGraphCentralityPanel from '@/components/cinematic/ContactGraphCentralityPanel';
import IntelProfileLiveIntelExposure from '@/components/cinematic/IntelProfileLiveIntelExposure';

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
            {/* F75: dataset-scenario coverage analyst — ◈ DSCEN button (left:18300); parallel-fetches /v1/datasets + /v1/scenario/list; keyword-correlates each scenario (name/objective/type) against the dataset catalog to surface DATA-BACKED vs DATA-DARK scenarios; stat tiles (scenarios/datasets/backed/data-dark); ALL/BACKED/DATA-DARK filter tabs + text search; expand scenario → matched datasets with relevance score + type badge; amber badge on data-dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence data-readiness brief + TTS via jarvis:speak-dossier; isDscenQuery+buildDscenScript wired in JarvisBrain; "dataset scenario"/"scenario data coverage"/"data-backed scenarios"/"dscen" voice trigger; 120-s auto-refresh */}
            <DatasetScenarioCoverage />
            {/* F76: knowledge-scenario coverage — ◈ KSCOV button (left:8188); parallel-fetches /knowledge/ + /v1/scenario/list; keyword-correlates each scenario against knowledge articles to surface BACKED scenarios (learning material available) vs DARK (no knowledge backing); stat tiles (scenarios/articles/backed/dark); ALL/BACKED/DARK filter tabs + search; expand scenario → matched articles with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-readiness brief + TTS via jarvis:speak-dossier; isKscovQuery+buildKscovScript wired in JarvisBrain; "knowledge scenario"/"know scenario"/"kscov" voice trigger; 120-s auto-refresh */}
            <KnowledgeScenarioCoverage />
            {/* F77: contact × knowledge advisor — ◈ CTKNOW button (left:9852); parallel-fetches /entities/Contact + /knowledge/; keyword-correlates each contact (name/role/dept) against knowledge articles to surface LINKED vs DARK contacts; stat tiles (contacts/articles/linked/dark); ALL/LINKED/DARK filter tabs + search; expand contact → matched articles with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-coverage brief + TTS via jarvis:speak-dossier; isCtknowQuery+buildCtknowScript wired in JarvisBrain; "contact knowledge"/"ctknow" voice trigger; 120-s auto-refresh */}
            <ContactKnowledgeAdvisor />
            {/* F78: ops-event-to-task correlator — ◈ OETASK button (left:19420); parallel-fetches /v1/ops/events + /entities/Task; keyword-correlates each event against tasks to surface LINKED events (task-backed) vs UNLINKED (gap); stat tiles (events/tasks/linked/unlinked); ALL/LINKED/UNLINKED filter tabs; expand event → matched tasks with priority+status+score; red badge on critical unlinked; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence incident-coverage brief + TTS; isOetaskQuery+buildOetaskScript wired in JarvisBrain; "ops event task"/"oetask" voice trigger; 60-s auto-refresh */}
            <OpsEventTaskCorrelator />
            {/* F79: knowledge-investigation linker — ◉ KINV button (left:5172); parallel-fetches /knowledge/ + /v1/investigations; keyword-correlates each open case against knowledge articles; split pane (cases left, articles right); linked/unlinked stat tiles; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence article-relevance brief + TTS via jarvis:speak-dossier; isKnowledgeInvQuery+buildKnowledgeInvScript wired in JarvisBrain; "knowledge linker"/"link knowledge"/"case knowledge"/"kinv" voice trigger; 5-min auto-refresh */}
            <KnowledgeInvestigationLinker />
            {/* F80: risk-signal-knowledge coverage — ◈ RSKNOW button (left:20000); parallel-fetches /entities/RiskSignal + /knowledge/; keyword-correlates each signal against articles to surface COVERED vs DARK signals; stat tiles (signals/articles/covered/dark); ALL/COVERED/DARK filter tabs + text search; expand signal → matched articles with relevance score; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-gap brief + TTS via jarvis:speak-dossier; isRsknowQuery+buildRsknowScript wired in JarvisBrain; "risk signal knowledge"/"risk knowledge coverage"/"knowledge risk"/"rsknow" voice trigger; 120-s auto-refresh */}
            <RiskSignalKnowledgeCoverage />
            {/* F81: swarm-job knowledge coverage — ◈ SWJKN button (left:20560); parallel-fetches /entities/SwarmJob + /knowledge/; keyword-correlates each job against articles to surface BACKED vs DARK jobs; stat tiles (jobs/articles/backed/dark); ALL/BACKED/DARK filter tabs + text search; expand job → matched articles with relevance score; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-gap brief + TTS via jarvis:speak-dossier; isSwjknQuery+buildSwjknScript wired in JarvisBrain; "swarm knowledge"/"job knowledge"/"swarm job knowledge"/"swjkn" voice trigger; 120-s auto-refresh */}
            <SwarmJobKnowledgeCoverage />
            {/* F82: intel profile × investigation linker — ◈ IPINV button (left:21120); parallel-fetches /entities/IntelProfile + /v1/investigations; keyword-correlates each threat actor against open cases to surface INVESTIGATED vs UNTRACKED profiles; stat tiles (profiles/investigations/investigated/untracked); ALL/INVESTIGATED/UNTRACKED filter tabs + text search; expand profile → matched cases with status+type+score; amber badge on untracked count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-investigation brief + TTS via jarvis:speak-dossier; isIpinvQuery+buildIpinvScript wired in JarvisBrain; "intel investigation"/"profile investigation"/"threat investigation"/"which intel profiles have cases"/"ipinv" voice trigger; 5-min auto-refresh */}
            <IntelProfileInvestigationLinker />
            {/* F83: task × decision ledger tracer — ◈ TDECIS button (left:21680); parallel-fetches /entities/Task + /v1/decision/list; keyword-correlates each task against strategic decisions to surface DECISION-BACKED (rationale documented) vs UNDECIDED (no decision record) tasks; stat tiles (tasks/decisions/backed/undecided); ALL/BACKED/UNDECIDED filter tabs + text search; expand task → matched decisions with rationale + expected-outcome + relevance score; amber badge on undecided count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategic-alignment brief + TTS via jarvis:speak-dossier; isTaskDecisQuery+buildTaskDecisScript wired in JarvisBrain; "task decision"/"strategic tasks"/"decided tasks"/"which tasks have decisions"/"tdecis" voice trigger; 90-s auto-refresh */}
            <TaskDecisionTracer />
            {/* F84: active scenario status bar — slim HUD strip top-right (top:26px) below LiveTelemetryTicker; polls /v1/scenario/list every 60 s; RUNNING/PENDING/FAILED/COMPLETED count pills; hides until first data; pointerEvents:none */}
            <ScenarioStatusBar />
            {/* F85: dataset freshness monitor — ◈ FRESH button (left:5408); polls /v1/datasets every 60 s; freshness tiers FRESH(<1h)/RECENT(1-6h)/AGING(6-24h)/STALE(>24h)/UNKNOWN; announces tier degradation via jarvis:speak-dossier; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence data-freshness brief + TTS; isDatasetFreshnessQuery+buildDatasetFreshnessScript wired in JarvisBrain; "dataset freshness"/"stale data"/"data age"/"dsfresh" voice trigger */}
            <DatasetFreshnessMonitor />
            {/* F86: contact × task linker — ◈ CTTASK button (left:22240); parallel-fetches /entities/Contact + /entities/Task; keyword-correlates each contact against tasks to surface TASKED (match found) vs IDLE; stat tiles (contacts/tasks/tasked/idle); ALL/TASKED/IDLE filter tabs + text search; expand contact → matched tasks with priority+status+score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-task brief + TTS via jarvis:speak-dossier; isCttaskQuery+buildCttaskScript wired in JarvisBrain; "contact task"/"who has tasks"/"task contact"/"active contacts"/"cttask" voice trigger; 90-s auto-refresh */}
            <ContactTaskLinker />
            {/* F87: contact–scenario assignor — ⊕ CTSCEN button (left:8708); parallel-fetches /entities/Contact + /v1/scenario/list; keyword-correlates contacts against scenario titles/descriptions to surface ASSIGNED vs SOLO; stat tiles (contacts/scenarios/assigned/solo); ALL/ASSIGNED/SOLO filter tabs + text search; expand contact → matched scenarios with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence team-readiness brief + TTS via jarvis:speak-dossier; "contact scenario"/"who's in which scenario"/"scenario contacts"/"ctscen" voice trigger; 90-s auto-refresh */}
            <ContactScenarioAssignor />
            {/* F88: investment-knowledge advisor — ◈ INVKNOW button (left:22800); parallel-fetches /entities/Investment + /knowledge/; keyword-correlates each holding (name/type/sector/description) against knowledge articles to surface RESEARCHED (backed) vs DARK (no docs); stat tiles (investments/articles/researched/dark); ALL/RESEARCHED/DARK filter tabs + text search; expand holding → matched articles with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-knowledge brief + TTS via jarvis:speak-dossier; isInvknowQuery+buildInvknowScript wired in JarvisBrain; "investment knowledge"/"portfolio research"/"which investments have docs"/"dark holdings"/"invknow" voice trigger; 120-s auto-refresh */}
            <InvestmentKnowledgeAdvisor />
            {/* F89: report–risk correlator — ◈ RPRSK button (left:23360); parallel-fetches /v1/reports + /entities/RiskSignal; keyword-correlates each risk signal against reports to surface DOCUMENTED (report-backed) vs UNDOCUMENTED (no coverage — intelligence gap); stat tiles (reports/signals/documented/undocumented); ALL/DOCUMENTED/UNDOCUMENTED filter tabs + text search; expand signal → matched reports with type badge + relevance score; amber badge on undocumented count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence risk-documentation brief + TTS via jarvis:speak-dossier; isRprskQuery+buildRprskScript wired in JarvisBrain; "report risk"/"risk reporting gap"/"which risks have reports"/"rprsk" voice trigger; 90-s auto-refresh */}
            <ReportRiskCorrelator />
            {/* F90: decision–risk aligner — ◈ DECRSK button (left:23920); parallel-fetches /v1/decision/list + /entities/RiskSignal; keyword-correlates each strategic decision against active risk signals to surface RISK-AWARE (corroborated) vs BLIND (no risk evidence); stat tiles (decisions/signals/risk-aware/blind); ALL/RISK-AWARE/BLIND filter tabs + text search; expand decision → matched signals with severity badge + relevance score; amber badge on blind count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategic risk-alignment brief + TTS via jarvis:speak-dossier; "decision risk"/"risky decisions"/"blind decisions"/"decrsk" voice trigger; 90-s auto-refresh */}
            <DecisionRiskAligner />
            {/* F91: intel profile × knowledge advisor — ◈ IPKNOW button (left:24480); parallel-fetches /entities/IntelProfile + /knowledge/; keyword-correlates each threat actor (name/description/org/type/aliases) against knowledge articles to surface RESEARCHED (docs found) vs DARK (no intelligence backing); stat tiles (profiles/articles/researched/dark); ALL/RESEARCHED/DARK filter tabs + text search; expand profile → matched articles with relevance score + threat-level colour coding; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-knowledge brief + TTS via jarvis:speak-dossier; isIpknowQuery+buildIpknowScript wired in JarvisBrain; "intel knowledge"/"profile knowledge"/"actor docs"/"know the threats"/"ipknow" voice trigger; 120-s auto-refresh */}
            <IntelProfileKnowledgeAdvisor />
            {/* F92: decision × knowledge coverage — ◈ DKNOW button (left:25040); parallel-fetches /v1/decision/list + /knowledge/; keyword-correlates each recorded strategic decision (title/reason/alternatives/expected_outcome) against knowledge articles to surface KNOWLEDGE-BACKED (at least one article) vs BLIND (no documentation found); stat tiles (decisions/articles/backed/blind); ALL/BACKED/BLIND filter tabs + text search; expand decision → matched articles with relevance score; amber badge on blind count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategic knowledge-gap brief + TTS via jarvis:speak-dossier; isDknowQuery+buildDknowScript wired in JarvisBrain; "decision knowledge"/"knowledge decision"/"backed decisions"/"dknow" voice trigger; 120-s auto-refresh */}
            <DecisionKnowledgeCoverage />
            {/* F93: swarm job × risk signal coverage — ◈ SWRSK button (left:25600); parallel-fetches /entities/SwarmJob + /entities/RiskSignal; keyword-correlates each risk signal against swarm jobs to surface MITIGATING (job-backed) vs UNADDRESSED (no coverage) signals; stat tiles (jobs/signals/mitigating/unaddressed); ALL/MITIGATING/UNADDRESSED filter tabs; red badge on unaddressed CRITICAL/HIGH count; expand signal → matched jobs with status+progress+score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence risk-mitigation brief + TTS via jarvis:speak-dossier; isSwrskQuery+buildSwrskScript; "swarm risk"/"job risk coverage"/"risk mitigation jobs"/"swrsk" voice trigger; 60-s auto-refresh */}
            <SwarmRiskCoverage />
            {/* F94: contact × ops event linker — ◈ CTOPS button (left:9956 zIndex:69); parallel-fetches /entities/Contact + /v1/ops/events; keyword-correlates contacts against live ops events to surface INVOLVED vs CLEAR; stat tiles (contacts/events/involved/clear); ALL/INVOLVED/CLEAR filter tabs; expand contact → matched events with severity badge + timestamp; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-ops brief + TTS via jarvis:speak-dossier; isCtopsQuery+buildCtopsScript wired in JarvisBrain; "contact ops"/"who's involved"/"ctops" voice trigger; 60-s auto-refresh */}
            <ContactOpsLinker />
            {/* F95: dataset × risk signal intelligence gap analyzer — ◈ DSRSK button (left:26160); parallel-fetches /v1/datasets + /entities/RiskSignal; keyword-correlates each risk signal against the dataset catalog to surface DATA-BACKED (empirical evidence found) vs DATA-DARK (no dataset coverage — speculative gap); stat tiles (signals/datasets/backed/dark); ALL/DATA-BACKED/DATA-DARK filter tabs; expand signal → matched datasets with relevance score + type badge; amber badge on data-dark CRITICAL/HIGH count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence-gap brief + TTS via jarvis:speak-dossier; isDsrskQuery+buildDsrskScript; "dataset risk"/"data-backed risks"/"risk evidence"/"which risks have data"/"risk data gap"/"dsrsk" voice trigger; 90-s auto-refresh */}
            <DatasetRiskAnalyzer />
            {/* F96: ops event × risk signal correlator — ◈ OEVRSK button (left:26720); parallel-fetches /v1/ops/events + /entities/RiskSignal; keyword-correlates each ops event (type/message/service/actor) against active risk signals to surface FLAGGED (event-linked risk) vs ISOLATED (no match); stat tiles (events/signals/flagged/isolated); ALL/FLAGGED/ISOLATED filter tabs + text search; expand event → matched signals with severity badge + relevance score; red badge on CRITICAL-FLAGGED count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops-risk brief + TTS via jarvis:speak-dossier; isOevrskQuery+buildOevrskScript wired in JarvisBrain; "ops event risk"/"event risk signal"/"which ops events have risks"/"flagged events"/"oevrsk" voice trigger; 60-s auto-refresh */}
            <OpsEventRiskCorrelator />
            {/* F97: contact × risk signal exposure linker — ◈ CTRSK button (left:27280); parallel-fetches /entities/Contact + /entities/RiskSignal; keyword-correlates each contact (name/role/department/notes/tags) against active risk signals to surface AT-RISK (at least one match) vs CLEAR; stat tiles (contacts/signals/at-risk/clear); ALL/AT-RISK/CLEAR filter tabs + text search; expand contact → matched signals with severity badge + relevance score; red badge on AT-RISK count when any matched signal is CRITICAL; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-risk brief + TTS via jarvis:speak-dossier; isCtrskQuery+buildCtrskScript; "contact risk"/"at-risk contacts"/"contact exposure"/"which contacts are at risk"/"ctrsk" voice trigger; 90-s auto-refresh */}
            <ContactRiskExposure />
            {/* F98: intel profile × risk signal linker — ◈ IPRSK button (left:27840); parallel-fetches /entities/IntelProfile + /entities/RiskSignal; keyword-correlates each threat actor (name/description/org/type/aliases) against active risk signals to surface CONFIRMED (signal corroboration found) vs UNCONFIRMED (no match); stat tiles (profiles/signals/confirmed/unconfirmed); ALL/CONFIRMED/UNCONFIRMED filter tabs + text search; expand profile → matched signals with severity badge + relevance score; amber badge on confirmed count (red if CRITICAL match); ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-activation brief + TTS via jarvis:speak-dossier; isIprskQuery+buildIprskScript wired in JarvisBrain; "intel profile risk"/"actor risk signal"/"threat actor signal"/"confirmed threats"/"iprsk" voice trigger; 90-s auto-refresh */}
            <IntelProfileRiskLinker />
            {/* F99: market × portfolio crossfire — ⊗ CROSS strip button (bottom-center); parallel-fetches /functions/getLiveIntel (crypto+FX) + /entities/Investment; cross-references holdings against live market tickers; shows current price + 24-h pct-change GREEN/RED per holding; matched vs unmatched count; isMarketCrossQuery+buildMarketCrossScript wired in JarvisBrain; "crossfire"/"market crossfire"/"portfolio cross" voice trigger; jarvis:crossfire-toggle event; 60-s auto-refresh */}
            <MarketPortfolioCrossfire />
            {/* F100: dataset × investigation correlator — ◈ DSINV button (left:7980, bottom:8, zIndex 65); parallel-fetches /v1/datasets + /v1/investigations; keyword-correlates each investigation against datasets to surface COVERED vs UNCOVERED; stat tiles (datasets/investigations/covered/uncovered); ALL/COVERED/UNCOVERED filter tabs; expand investigation → matched datasets with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence dataset-coverage assessment + TTS via jarvis:speak-dossier; isDsInvCorrQuery+buildDsInvCorrScript wired in JarvisBrain; "dsinv"/"dataset investigation"/"datasets driving cases"/"data case gap"/"which datasets support"/"data dark"/"dataset case" voice trigger; 90-s auto-refresh */}
            <DatasetInvestigationCorrelator />
            {/* F101: ops event × investigation correlator — ⚡ OICORR button (left:7044, zIndex 65); parallel-fetches /v1/ops/events + /v1/investigations; keyword-correlates critical/high severity ops events against open investigation titles+descriptions; CORRELATED/UNCORRELATED/ALL filter tabs; expand event → matched investigations; red badge on correlated-event count; ▶ ANALYZE → /v1/jarvis/agent/chat 2-sentence operational-intelligence linkage assessment + TTS via jarvis:speak-dossier; isOpsInvCorrQuery+buildOpsInvCorrScript wired in JarvisBrain; "ops investigation"/"event case"/"ops case"/"operational case"/"oicorr" voice trigger; 30-s auto-refresh */}
            <OpsInvCorrelator />
            {/* F102: task knowledge coverage — /entities/Task × /knowledge/; keyword-correlates tasks to articles; TKNOW toggle */}
            <TaskKnowledgeCoverage />
            {/* F103: knowledge acquisition advisor — /knowledge/ × /entities/RiskSignal × /v1/investigations; gap-scores topics by risk+case pressure vs coverage; KACQ toggle left:29000 */}
            <KnowledgeAcquisitionAdvisor />
            {/* F104: report-scenario mapper — ◈ RSCMAP button (left:9020, bottom:8, zIndex:68); parallel-fetches /v1/reports + /v1/scenario/list; keyword-correlates each scenario against report catalog to surface BACKED (research available) vs DARK (no report coverage); ALL/BACKED/DARK filter tabs; expand scenario → matched reports with relevance score + year; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence research-readiness brief + TTS via jarvis:speak-dossier; isRscmapQuery+buildRscmapScript already wired in JarvisBrain; "report scenario"/"scenario reports"/"rscmap" voice trigger; 120-s auto-refresh */}
            <ReportScenarioMapper />
            {/* F105: investment × decision aligner — ◈ INVDEC button (left:29560, bottom:8, zIndex:60); parallel-fetches /entities/Investment + /v1/decision/list; keyword-correlates each holding against strategic decisions to surface BACKED (decision on record) vs SPECULATIVE (no rationale found); stat tiles (holdings/decisions/backed/spec); ALL/BACKED/SPECULATIVE filter tabs + text search; expand holding → matched decisions with rationale snippet + relevance score; amber badge on speculative count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-strategy brief + TTS via jarvis:speak-dossier; "investment decision"/"portfolio decision"/"invdec" voice trigger; 90-s auto-refresh */}
            <InvestmentDecisionAligner />
            {/* F106: contact × intel profile threat linker — ◈ CTL button (left:4340); parallel-fetches /entities/Contact + /entities/IntelProfile; keyword-correlates each contact (name/org/tags) against threat profiles to surface LINKED (match found) vs CLEAR; stat tiles (contacts/profiles/linked/high-threat); ALL/LINKED/HIGH filter tabs + text search; red badge on high-threat count; expand contact → best-matched threat profile + all linked profiles; click pair → /v1/jarvis/agent/chat 2-sentence threat-link assessment + TTS via jarvis:speak-dossier; isContactThreatQuery+buildContactThreatScript wired in JarvisBrain; "contact threats"/"threat contacts"/"linked contacts"/"dangerous contacts"/"ctl" voice trigger; 60-s auto-refresh */}
            <ContactThreatLinker />
            {/* F108: swarm job × scenario coverage — ◈ SWSCEN button (left:9644, bottom:8, zIndex:69); parallel-fetches /entities/SwarmJob + /v1/scenario/list; keyword-correlates each scenario against active swarm catalog to surface BACKED (swarm-supported) vs SOLO (no agent coverage); stat tiles (scenarios/jobs/backed/solo); ALL/BACKED/SOLO filter tabs; expand scenario → matched swarm jobs with status + progress bar; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence automation-coverage brief + TTS via jarvis:speak-dossier; isSwscenQuery+buildSwscenScript already wired in JarvisBrain; "swarm scenario"/"scenario swarm"/"automated scenarios"/"swscen" voice trigger; 60-s auto-refresh */}
            <SwarmScenarioCoverage />
            {/* F109: swarm job × decision alignment — ◈ SWDEC button (left:30680, bottom:8, zIndex:69); parallel-fetches /entities/SwarmJob + /v1/decision/list; keyword-correlates each swarm job against strategic decisions to surface MANDATED (decision-backed) vs AUTONOMOUS (no governance record); stat tiles (jobs/decisions/mandated/autonomous); ALL/MANDATED/AUTONOMOUS filter tabs; expand job → matched decisions with rationale snippet + relevance score; amber badge on autonomous count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence governance-gap brief + TTS via jarvis:speak-dossier; isSwdecQuery+buildSwdecScript wired in JarvisBrain; "swarm decision"/"mandated swarms"/"autonomous swarm"/"swarm governance"/"swdec" voice trigger; 90-s auto-refresh */}
            <SwarmDecisionAlignment />
            {/* F110: skill × risk signal coverage advisor — ◈ SKLRSK button (left:31240, bottom:8, zIndex:69); parallel-fetches /v1/aip/skill + /entities/RiskSignal; keyword-correlates each risk signal against the skill catalog to surface COVERED (skill-backed) vs DARK (no skill coverage — capability gap); stat tiles (signals/skills/covered/dark); ALL/COVERED/DARK filter tabs + text search; expand signal → matched skills with category + relevance score; red badge on CRITICAL/HIGH dark signals; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence capability-gap brief + TTS via jarvis:speak-dossier; isSklrskQuery+buildSklrskScript wired in JarvisBrain; "skill risk"/"risk skills"/"capability gap"/"which risks have skills"/"sklrsk" voice trigger; 90-s auto-refresh */}
            <SkillRiskCoverage />
            {/* F111: report × task coverage mapper — ◈ RPTASK button (left:9540, bottom:8, zIndex:69); parallel-fetches /v1/reports + /entities/Task; keyword-correlates each task against the report catalog to surface BACKED (research/evidence found) vs DARK (running on assumptions alone); stat tiles (tasks/reports/backed/dark); ALL/BACKED/DARK filter tabs + text search; expand task → matched reports with relevance score + year; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational-evidence brief + TTS via jarvis:speak-dossier; isRptaskQuery+buildRptaskScript wired in JarvisBrain; "report task"/"task report"/"evidence task"/"rptask"/"tasks backed by research" voice trigger; jarvis:rptask-toggle event; 90-s auto-refresh */}
            <ReportTaskCoverage />
            {/* F112: SITREP Commander — ◎ SITREP button (left:31800, bottom:8, zIndex:69); on-demand situation report; parallel-fetches /v1/jarvis/system/status + /v1/cinematic/brain + /entities/RiskSignal + /entities/SwarmJob + /v1/investigations; feeds combined snapshot to /v1/jarvis/agent/chat for 5-bullet SITREP (System/Knowledge/Threats/Operations/Cases); first bullet spoken via jarvis:speak-dossier; clipboard copy; no auto-poll; isSitrepQuery+buildSitrepScript wired in JarvisBrain; "sitrep"/"situation report"/"tactical brief"/"full brief"/"what's the situation" voice trigger */}
            <SitrepCommander />
            {/* F113: ops event × knowledge coverage advisor — ◈ OEKNOW button (left:32360, bottom:8, zIndex:69); parallel-fetches /v1/ops/events + /knowledge/; keyword-correlates each event against knowledge articles to surface DOCUMENTED (runbook exists) vs DARK (response gap); stat tiles (events/articles/documented/dark); ALL/DOCUMENTED/DARK filter tabs + text search; expand event → matched articles with relevance score + type badge; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops-knowledge brief + TTS via jarvis:speak-dossier; "ops event knowledge"/"event docs"/"runbook coverage"/"dark events"/"oeknow" voice trigger; 90-s auto-refresh */}
            <OpsEventKnowledgeCoverage />
            {/* F115: intel profile × task linker — ◈ IPTASK button (left:9332, bottom:8, zIndex:69); parallel-fetches /entities/IntelProfile + /entities/Task; keyword-correlates each threat profile against tasks to surface TASKED vs UNTASKED; stat tiles + filter tabs + expand; ▶ ASSESS → /v1/jarvis/agent/chat + TTS; isIptaskQuery+buildIptaskScript wired in JarvisBrain; "intel task"/"threat task"/"iptask" voice trigger; 90-s auto-refresh */}
            <IntelProfileTaskLinker />
            {/* F114: vitals trend analyzer — ◈ VITTREND button (left:33480, bottom:8, zIndex:71); parallel-polls /v1/vitals/trend?metric=X&hours=24 for heart_rate/hrv/spo2/steps/sleep_score/weight; SVG sparklines + trend direction + anomaly detection (>1.5 SD); ALL/TRENDING UP/TRENDING DOWN/ANOMALOUS filter tabs; red badge on anomalous count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence health-trend brief + TTS via jarvis:speak-dossier; isVitTrendQuery+buildVitTrendScript wired in JarvisBrain; "vitals trend"/"health trend"/"biometric trend"/"body trend"/"vital signs trend"/"vittrend" voice trigger; 300-s auto-refresh */}
            <VitalsTrendAnalyzer />
            {/* F116: investment-contact mapper — ◈ INVCON button (left:7148, bottom:6, zIndex:65); parallel-fetches /entities/Investment + /entities/Contact; keyword-correlates each holding (name/type/sector/ticker/tags) against contacts (role/dept/tags) to surface which contacts in the network are relevant to each investment; LINKED/UNLINKED/ALL filter tabs; expand holding → matched contacts with role+dept; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence relationship assessment + TTS via jarvis:speak-dossier; isInvContactQuery+buildInvContactScript already wired in JarvisBrain; "investment contact"/"contact investor"/"investment network"/"wealth contact"/"portfolio contact"/"invcon"/"who manages" voice trigger; 60-s auto-refresh */}
            <InvestmentContactMapper />
            {/* F117: scenario × investment exposure matrix — ◈ SCNINV button (left:34040, bottom:8, zIndex:72); parallel-fetches /v1/scenario/list + /entities/Investment; keyword-correlates each scenario (name/objective/type) against every holding (name/type/sector/description/ticker) to surface EXPOSED investments (at least one scenario match) vs SAFE; stat tiles (scenarios/investments/exposed/safe); ALL/EXPOSED/SAFE filter tabs + text search; expand scenario → matched investments with sector badge + relevance score; amber badge on exposed count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-scenario risk brief + TTS via jarvis:speak-dossier; isScninvQuery+buildScninvScript wired in JarvisBrain; "scenario investment"/"investment scenario"/"portfolio scenario"/"scninv"/"which investments are in scenarios" voice trigger; 120-s auto-refresh */}
            <ScenarioInvestmentExposure />
            <TaskScenarioCoverage />
            {/* F119: swarm job × contact accountability linker — ◈ SWCON button (left:35160, bottom:8, zIndex:74); parallel-fetches /entities/SwarmJob + /entities/Contact; keyword-correlates each job (name/objective/type) against contacts to surface ASSIGNED vs UNASSIGNED (governance gap); stat tiles + filter tabs + expand; ▶ ASSESS → /v1/jarvis/agent/chat + TTS; "swarm contact"/"swarm accountability"/"who owns swarm"/"swcon" voice trigger; 90-s auto-refresh */}
            <SwarmContactLinker />
            {/* F120: swarm-investigation coverage — ⬡ ICOV button (left:5620, bottom:8, zIndex:65); parallel-fetches /entities/SwarmJob + /v1/investigations; keyword-correlates active swarm jobs against open cases to surface COVERED vs UNCOVERED; stat tiles (active jobs/open cases/covered/uncovered); ALL/COVERED/UNCOVERED filter tabs; split pane (case list left + matched jobs right); ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS via jarvis:speak-dossier; isSwarmInvCoverageQuery+buildSwarmInvCoverageScript wired in JarvisBrain; "investigation coverage"/"case coverage"/"swarm investigation"/"swinv"/"which cases have coverage" voice trigger; 60-s auto-refresh */}
            <SwarmInvestigationCoverage />
            {/* F121: investment × swarm coverage — ◈ INVSWM button (left:35720, bottom:8, zIndex:75); parallel-fetches /entities/Investment + /entities/SwarmJob; keyword-correlates each holding against the active swarm job catalog to surface MONITORED (automation coverage found) vs UNMONITORED (no swarm attention — surveillance gap); stat tiles (holdings/active jobs/monitored/unmonitored); ALL/MONITORED/UNMONITORED filter tabs + text search; expand holding → matched swarm jobs with status badge + progress bar; amber badge on unmonitored count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-automation brief + TTS via jarvis:speak-dossier; isInvSwmQuery+buildInvSwmScript wired in JarvisBrain; "investment swarm"/"portfolio monitoring"/"which investments are monitored"/"invswm"/"portfolio swarm coverage" voice trigger; 90-s auto-refresh */}
            <InvestmentSwarmCoverage />
            {/* F122: decision × scenario coverage mapper — ◈ DECSCEN button (left:36280, bottom:8, zIndex:76); parallel-fetches /v1/decision/list + /v1/scenario/list; keyword-correlates each strategic decision (title/reason/risks/alternatives/expected_outcome) against scenarios to surface OPERATIONALIZED (backed by at least one scenario) vs THEORETICAL (no scenario coverage — execution gap); stat tiles (decisions/scenarios/operationalized/theoretical); ALL/OPERATIONALIZED/THEORETICAL filter tabs + text search; expand decision → matched scenarios with type badge + status badge + relevance score bar; amber badge on theoretical count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategy-to-execution brief + TTS via jarvis:speak-dossier; isDecScenQuery+buildDecScenScript exported from DecisionScenarioCoverage; "decision scenario"/"operationalized decisions"/"strategic scenarios"/"execution gap"/"decscen" voice trigger; jarvis:decscen-toggle event; 90-s auto-refresh */}
            <DecisionScenarioCoverage />
            {/* F123: task × dataset evidence tracker — ◈ TASKDS button (left:36840, bottom:8, zIndex:77); parallel-fetches /entities/Task + /v1/datasets; keyword-correlates each task (title/description/priority/tags) against the dataset catalog to surface DATA-DRIVEN tasks (empirical dataset backing found) vs ASSUMPTION-BASED tasks (no coverage — operating without data); stat tiles (tasks/datasets/data-driven/assumption-based); ALL/DATA-DRIVEN/ASSUMPTION-BASED filter tabs + text search; expand task → matched datasets with row-count badge + type badge + relevance score; amber badge on assumption-based count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence-gap brief + TTS via jarvis:speak-dossier; isTaskDsQuery+buildTaskDsScript exported from TaskDatasetTracker; "task dataset"/"data-driven tasks"/"which tasks have data"/"task evidence"/"taskds" voice trigger; jarvis:taskds-toggle event; 90-s auto-refresh */}
            <TaskDatasetTracker />
            {/* F124: ops event × report documentation tracker — ◈ OERPT button (left:37400, bottom:8, zIndex:78); parallel-fetches /v1/ops/events + /v1/reports; keyword-correlates each operational event (message/service/type) against the report catalogue to surface DOCUMENTED events (post-incident or analysis report exists) vs UNDOCUMENTED events (no paper trail — intelligence gap); stat tiles (events/reports/documented/undocumented); ALL/DOCUMENTED/UNDOCUMENTED filter tabs + text search; expand event → matched reports with type badge + relevance score; amber badge on undocumented CRITICAL/HIGH count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence incident-documentation brief + TTS via jarvis:speak-dossier; isOerptQuery+buildOerptScript wired in JarvisBrain; "ops report"/"event report"/"incident report"/"oerpt"/"undocumented events" voice trigger; 90-s auto-refresh */}
            <OpsEventReportTracker />
            {/* F125: report × knowledge gap advisor — ◈ RPKNOW button (left:37960, bottom:8, zIndex:79); parallel-fetches /v1/reports + /knowledge/; bidirectional keyword-correlation surfaces UNEXTRACTED reports (no matching knowledge article — extraction backlog) and UNSOURCED knowledge articles (no backing report — unsourced claims); stat tiles (reports/articles/unextracted/unsourced); ALL/UNEXTRACTED/UNSOURCED/MATCHED filter tabs + text search; expand report → matched articles or expand article → matched reports with relevance score + type badge; amber badge on unextracted count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-curation brief + TTS via jarvis:speak-dossier; isRpknowQuery+buildRpknowScript wired in JarvisBrain; "report knowledge"/"knowledge extraction"/"unsourced knowledge"/"unextracted reports"/"rpknow" voice trigger; 120-s auto-refresh */}
            <ReportKnowledgeGapAdvisor />
            {/* F126: contact × investigation exposure monitor — ◈ CTINV button (left:38520, bottom:8, zIndex:80); parallel-fetches /entities/Contact + /v1/investigations; keyword-correlates contacts against investigations to surface IMPLICATED vs CLEAR; red badge on implicated count; ▶ ASSESS → /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier; isCtinvQuery+buildCtinvScript wired in JarvisBrain; "contact investigation"/"implicated contacts"/"contact exposure"/"ctinv"/"contacts in investigations" voice trigger; 90-s auto-refresh */}
            <ContactInvestigationExposure />
            {/* F127: graph community × risk signal network heatmap — ◈ GCRHM button (left:39080, bottom:8, zIndex:81); parallel-fetches /v1/graph/communities + /entities/RiskSignal; keyword-correlates each network cluster (member IDs) against active risk signals; severity-weighted risk score per cluster; HOT/ELEVATED/MODERATE/SAFE tiers; stat tiles (clusters/signals/hot/safe); ALL/HOT/ELEVATED/MODERATE/SAFE filter tabs + text search; expand cluster → matched signals with severity badge + relevance score; red badge on HOT count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence network-threat brief + TTS via jarvis:speak-dossier; isGcrhmQuery+buildGcrhmScript exported from GraphCommunityRiskHeatmap; "graph community risk"/"community threat"/"network heatmap"/"hot clusters"/"gcrhm" voice trigger; 90-s auto-refresh */}
            <GraphCommunityRiskHeatmap />
            {/* F128: contact × decision linker — ◈ CTDEC button (left:39640, bottom:8, zIndex:82); parallel-fetches /entities/Contact + /v1/decision/list; keyword-correlates contacts against strategic decisions to surface DECISION-LINKED vs UNINVOLVED; amber badge on linked count; ▶ ASSESS → /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier; isCtdecQuery+buildCtdecScript exported from ContactDecisionLinker; "contact decision"/"decisions involving contacts"/"who's in which decision"/"ctdec" voice trigger; 90-s auto-refresh */}
            <ContactDecisionLinker />
            {/* F129: investment × graph influence ranker — ◈ INVGRPH button (left:40200, bottom:8, zIndex:83); parallel-fetches /entities/Investment + /v1/graph/centrality; keyword-correlates each holding against graph top-influence nodes to surface NETWORK-ANCHORED vs ISOLATED; violet badge on anchored count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-influence brief + TTS via jarvis:speak-dossier; isInvgrphQuery+buildInvgrphScript exported from InvestmentGraphInfluence; "investment graph"/"portfolio influence"/"network investments"/"invgrph"/"graph investments" voice trigger; 90-s auto-refresh */}
            <InvestmentGraphInfluence />
            {/* F130: intel profile × scenario coverage — ◈ IPSCEN button (left:40760, bottom:8, zIndex:84); parallel-fetches /entities/IntelProfile + /v1/scenario/list; keyword-correlates each threat actor (name/description/org/type/aliases) against every scenario to surface COVERED (scenario-backed) vs UNPLANNED (no scenario addresses this threat — planning gap); stat tiles (profiles/scenarios/covered/unplanned); ALL/COVERED/UNPLANNED filter tabs + text search; expand profile → matched scenarios with type badge + status + relevance score; amber badge on unplanned count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-planning coverage brief + TTS via jarvis:speak-dossier; isIpscenQuery+buildIpscenScript exported from IntelProfileScenarioCoverage; "intel scenario"/"threat scenario"/"scenario coverage"/"unplanned threats"/"ipscen" voice trigger; 90-s auto-refresh */}
            <IntelProfileScenarioCoverage />
            {/* F131: graph centrality × contact network mapper — ◈ GCCM button (left:41320, bottom:8, zIndex:85); parallel-fetches /v1/graph/centrality + /entities/Contact; keyword-correlates each contact against top-influence graph nodes to surface NETWORK-EMBEDDED vs PERIPHERAL; violet badge on embedded count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-network influence brief + TTS via jarvis:speak-dossier; isGccmQuery+buildGccmScript exported from GraphCentralityContactMapper; "contact network"/"graph contact"/"network embedded"/"centrality contact"/"gccm"/"who is in the graph" voice trigger; 90-s auto-refresh */}
            <GraphCentralityContactMapper />
            {/* F132: scenario skill readiness — ◎ SRDNS button (left:41880, bottom:8, zIndex:86); parallel-fetches /v1/scenario/list + /v1/aip/skill; keyword-correlates each scenario name/description/tags against skill names and descriptions to compute a per-scenario readiness score; surfaces least-prepared scenarios first; READY/AT-RISK/UNKNOWN filter tabs; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence recommendation + TTS via jarvis:speak-dossier; isScenarioReadinessQuery+buildScenarioReadinessScript exported from ScenarioSkillReadiness; "readiness"/"scenario readiness"/"skill readiness"/"prepared"/"srdns" voice trigger; 5-min auto-refresh */}
            <ScenarioSkillReadiness />
            {/* F133: investment × task aligner — ◈ INVTASK button (left:9748, bottom:8, zIndex:69); parallel-fetches /entities/Investment + /entities/Task; keyword-correlates each holding against task catalog to surface BACKED (task-covered) vs DARK (no operational support); stat tiles (investments/tasks/backed/dark); ALL/BACKED/DARK filter tabs + search; expand holding → matched tasks with priority+status+relevance score; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence investment-operations brief + TTS via jarvis:speak-dossier; isInvtaskQuery+buildInvtaskScript already wired in JarvisBrain line 114/1506; "investment task"/"task investment"/"portfolio task"/"invtask"/"task-backed investments" voice trigger; jarvis:invtask-toggle event; 90-s auto-refresh */}
            <InvestmentTaskAligner />
            {/* F134: skill × knowledge coverage gap — ◈ SKKNOW button (left:42440, bottom:8, zIndex:87); parallel-fetches /v1/aip/skill + /knowledge/; keyword-correlates each skill against knowledge article catalogue to surface DOCUMENTED (article coverage found) vs DARK (no knowledge documentation — learning gap); stat tiles (skills/articles/documented/dark); ALL/DOCUMENTED/DARK filter tabs + text search; expand skill → matched articles with relevance score + type badge; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence skill-knowledge brief + TTS via jarvis:speak-dossier; isSkknowQuery+buildSkknowScript wired in JarvisBrain; "skill knowledge"/"knowledge skills"/"documented skills"/"skill docs"/"dark skills"/"skknow" voice trigger; jarvis:skknow-toggle event; 120-s auto-refresh */}
            <SkillKnowledgeCoverage />
            {/* F135: decision × dataset evidence tracker — ◈ DECDAS button (left:43000, bottom:8, zIndex:88); parallel-fetches /v1/decision/list + /v1/datasets; keyword-correlates each strategic decision (title/reason/risks/alternatives/expected_outcome) against the dataset catalog to surface DATA-BACKED decisions (empirical dataset found) vs SPECULATIVE (no data record); stat tiles (decisions/datasets/backed/speculative); ALL/DATA-BACKED/SPECULATIVE filter tabs + text search; expand decision → matched datasets with row-count badge + type badge + relevance score bar; amber badge on speculative count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence-basis brief + TTS via jarvis:speak-dossier; isDecdasQuery+buildDecdasScript wired in JarvisBrain; "decision dataset"/"data-backed decisions"/"evidence decisions"/"speculative decisions"/"decdas" voice trigger; jarvis:decdas-toggle event; 90-s auto-refresh */}
            <DecisionDatasetTracker />
            {/* F136: ops event × knowledge correlator — ◈ OPSKN button (left:8292, bottom:8, zIndex:65); parallel-fetches /v1/ops/events + /knowledge/; keyword-correlates each live event against knowledge article library to surface LINKED (runbook/doc exists) vs DARK (no documentation); stat tiles (events/articles/linked/dark); ALL/LINKED/DARK filter tabs + text search; expand event → matched articles with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence incident-knowledge brief + TTS via jarvis:speak-dossier; isOpsKnQuery+buildOpsKnScript wired in JarvisBrain; "ops knowledge"/"knowledge response"/"event docs"/"incident docs"/"opskn" voice trigger; 60-s auto-refresh */}
            <OpsKnowledgeCorrelator />
            {/* F137: contact × report coverage — ◈ CTRPT button (left:43560, bottom:8, zIndex:89); parallel-fetches /entities/Contact + /v1/reports; keyword-correlates each contact against the report catalog to surface REFERENCED (paper trail found) vs UNTRACKED (no documentation — intelligence gap); stat tiles (contacts/reports/referenced/untracked); ALL/REFERENCED/UNTRACKED filter tabs + text search; expand contact → matched reports with relevance score + type/year badge; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-documentation brief + TTS via jarvis:speak-dossier; isCtrptQuery+buildCtrptScript wired in JarvisBrain; "contact report"/"report contact"/"who has reports"/"contact documentation"/"ctrpt" voice trigger; jarvis:ctrpt-toggle event; 120-s auto-refresh */}
            <ContactReportCoverage />
            {/* F138: swarm job × report coverage — ◈ SWRPT button (left:44120, bottom:8, zIndex:90); parallel-fetches /entities/SwarmJob + /v1/reports; keyword-correlates each swarm job against the report catalog to surface DOCUMENTED (governance trail found) vs UNDOCUMENTED (no report coverage — gap); stat tiles (jobs/reports/documented/undocumented); ALL/DOCUMENTED/UNDOCUMENTED filter tabs + text search; expand job → matched reports with relevance score + type badge; amber badge on undocumented count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence swarm-documentation brief + TTS via jarvis:speak-dossier; isSwrptQuery+buildSwrptScript exported from SwarmReportCoverage; "swarm report"/"job report"/"swarm documentation"/"which swarm jobs have reports"/"swrpt" voice trigger; jarvis:swrpt-toggle event; 90-s auto-refresh */}
            <SwarmReportCoverage />
            {/* F139: investment × dataset intelligence correlator — ◈ INVDS button (left:44680, bottom:8, zIndex:91); parallel-fetches /entities/Investment + /v1/datasets; keyword-correlates each holding against dataset catalog to surface DATA-BACKED (empirical monitoring exists) vs DATA-DARK (no coverage — surveillance blind spot); stat tiles (investments/datasets/backed/dark); ALL/DATA-BACKED/DATA-DARK filter tabs + text search; expand holding → matched datasets with row-count badge + type badge + relevance score; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-data brief + TTS via jarvis:speak-dossier; isInvdsQuery+buildInvdsScript exported from InvestmentDatasetCorrelator; "investment dataset"/"portfolio data"/"data-backed investments"/"investment data coverage"/"invds" voice trigger; jarvis:invds-toggle event; 90-s auto-refresh */}
            <InvestmentDatasetCorrelator />
            {/* F140: swarm job × dataset intelligence coverage — ◈ SWJDS button (left:45240, bottom:8, zIndex:92); parallel-fetches /entities/SwarmJob + /v1/datasets; keyword-correlates each swarm job against dataset catalog to surface DATA-BACKED (empirical support exists) vs DATA-DARK (no coverage — operating on inference alone); stat tiles (jobs/datasets/backed/dark); ALL/DATA-BACKED/DATA-DARK filter tabs + text search; expand job → matched datasets with row-count badge + type badge + relevance score; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence swarm-data brief + TTS via jarvis:speak-dossier; isSwjdsQuery+buildSwjdsScript exported from SwarmDatasetCoverage; "swarm dataset"/"job data"/"data-backed swarm"/"swarm data coverage"/"swjds" voice trigger; jarvis:swjds-toggle event; 90-s auto-refresh */}
            <SwarmDatasetCoverage />
            {/* F141: intel profile × swarm job coverage monitor — ◈ IPSWM button (left:45800, bottom:8, zIndex:93); parallel-fetches /entities/IntelProfile + /entities/SwarmJob; keyword-correlates each threat actor (name/description/org/type/aliases) against active swarm jobs to surface HUNTED (swarm automation exists) vs UNTRACKED (no coverage — intelligence gap); stat tiles (profiles/jobs/hunted/untracked); ALL/HUNTED/UNTRACKED filter tabs + text search; expand profile → matched swarm jobs with status badge + progress bar + relevance score; amber badge on untracked count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-automation brief + TTS via jarvis:speak-dossier; isIpswmQuery+buildIpswmScript exported from IntelProfileSwarmCoverage; "intel swarm"/"threat swarm"/"hunt coverage"/"which threats are hunted"/"ipswm" voice trigger; jarvis:ipswm-toggle event; 90-s auto-refresh */}
            <IntelProfileSwarmCoverage />
            {/* F142: graph community × investigation linker — ◈ GCIL button (left:46360, bottom:8, zIndex:94); parallel-fetches /v1/graph/communities + /v1/investigations; keyword-correlates each network cluster (label + member node IDs) against open investigations to surface INVESTIGATED (case coverage found) vs BLIND (no investigative focus — intelligence gap); stat tiles (clusters/investigations/investigated/blind); ALL/INVESTIGATED/BLIND filter tabs + text search; expand cluster → matched investigations with status badge + relevance score; amber badge on blind count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence network-investigation brief + TTS via jarvis:speak-dossier; isGcilQuery+buildGcilScript exported from GraphCommunityInvestigationLinker; "graph community investigation"/"cluster investigation"/"which clusters have cases"/"blind clusters"/"gcil" voice trigger; jarvis:gcil-toggle event; 90-s auto-refresh */}
            <GraphCommunityInvestigationLinker />
            {/* F143: task × investigation linker — ◈ TINVL button (left:46920, bottom:8, zIndex:95); parallel-fetches /entities/Task + /v1/investigations; keyword-correlates each open investigation against the task catalog to surface BACKED (at least one task references it) vs TASKLESS (no task match — execution gap); stat tiles (tasks/investigations/backed/taskless); ALL/BACKED/TASKLESS filter tabs + text search; expand investigation → matched tasks with relevance score + status badge; amber badge on taskless count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence task-investigation gap brief + TTS via jarvis:speak-dossier; isTinvlQuery+buildTinvlScript exported from TaskInvestigationLinker (wired in JarvisBrain line 107); "task investigation"/"case task gap"/"tasks in cases"/"tinvl" voice trigger; jarvis:tinvl-toggle event; 90-s auto-refresh */}
            <TaskInvestigationLinker />
            {/* F144: risk × investigation linker — ◈ RKINVL button (left:7772, bottom:8, zIndex:65); parallel-fetches /entities/RiskSignal + /v1/investigations; keyword-correlates each risk signal (title/description/type/severity/tags) against open investigation cases to surface COVERED risks (case backing found) vs UNCOVERED (no investigation — gap); stat tiles (risks/cases/covered/uncovered); ALL/COVERED/UNCOVERED filter tabs; expand risk → matched investigations with status badge + relevance score; ▶ ASSESS per risk → /v1/jarvis/agent/chat 2-sentence investigation-coverage assessment + TTS via jarvis:speak-dossier; isRiskInvLinkQuery+buildRiskInvLinkScript wired in JarvisBrain line 97; "risk investigation"/"risk case gap"/"rkinvl"/"case risk coverage" voice trigger; jarvis:risk-inv-link-toggle event; 90-s auto-refresh */}
            <RiskInvestigationLinker />
            {/* F145: decision × report coverage — ◈ DECRPT button (left:47480, bottom:8, zIndex:96); parallel-fetches /v1/decision/list + /v1/reports; keyword-correlates each strategic decision (title/reason/risks/alternatives/expected_outcome) against every report (title/summary/type) to surface BACKED (documentary evidence exists) vs UNSUPPORTED (no report — strategic intelligence gap); stat tiles (decisions/reports/backed/unsupported); ALL/BACKED/UNSUPPORTED filter tabs + text search; expand decision → matched reports with type badge + date badge + relevance score; amber badge on unsupported count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategic-evidence brief + TTS via jarvis:speak-dossier; isDecrptQuery+buildDecrptScript wired in JarvisBrain; "decision report"/"strategic evidence"/"decisions backed"/"report backed decisions"/"decrpt" voice trigger; jarvis:decrpt-toggle event; 120-s auto-refresh */}
            <DecisionReportCoverage />
            {/* F146: intel trigger detector — ◈ ITRIG button (left:48040, bottom:8, zIndex:97); polls /functions/getLiveIntel + /v1/scenario/list every 180 s; derives SEISMIC_SURGE (mag ≥6), MARKET_SPIKE (|change_pct| ≥8%), FX_STRESS (|change_pct| ≥2%) triggers from live world state; keyword-correlates scenarios against active triggers to surface TRIGGERED vs STANDBY; stat tiles (scenarios/triggers/triggered/standby); ALL/TRIGGERED/STANDBY filter tabs; expand scenario → matched triggers with severity + detail; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence trigger brief + TTS via jarvis:speak-dossier; isItrigQuery+buildItrigScript wired in JarvisBrain; "intel trigger"/"scenario trigger"/"triggered scenarios"/"what's triggered"/"itrig"/"active scenarios" voice trigger; jarvis:itrig-toggle event; 180-s auto-refresh */}
            <IntelTriggerDetector />
            {/* F147: graph community × swarm job coverage — ◈ GCSWM button (left:48600, bottom:8, zIndex:98); parallel-fetches /v1/graph/communities + /entities/SwarmJob; keyword-correlates each network cluster (label + metadata) against swarm jobs to surface COVERED (swarm automation found) vs BLIND (no automation — gap); stat tiles (clusters/jobs/covered/blind); ALL/COVERED/BLIND filter tabs + text search; expand cluster → matched jobs with status badge + type badge + relevance score; amber badge on blind count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence cluster-automation brief + TTS via jarvis:speak-dossier; isGcswmQuery+buildGcswmScript wired in JarvisBrain; "graph community swarm"/"cluster swarm"/"swarm community"/"automated clusters"/"blind clusters"/"gcswm" voice trigger; jarvis:gcswm-toggle event; 90-s auto-refresh */}
            <GraphCommunitySwarmCoverage />
            {/* F148: risk signal × scenario coverage map — ◈ RSKSCEN button (left:49160, bottom:8, zIndex:99); parallel-fetches /entities/RiskSignal + /v1/scenario/list; keyword-correlates each risk signal (title/description/type/severity/tags) against every scenario to surface PLANNED (at least one scenario prepares for this risk) vs UNPLANNED (no scenario coverage — planning gap); severity-sorted (CRITICAL/HIGH first); stat tiles (signals/scenarios/planned/unplanned); ALL/PLANNED/UNPLANNED filter tabs + text search; expand signal → matched scenarios with type badge + status badge + relevance score bar; red badge on unplanned CRITICAL/HIGH count; ▶ ASSESS per signal → /v1/jarvis/agent/chat 2-sentence risk-planning coverage brief + TTS via jarvis:speak-dossier; isRskscenQuery+buildRskscenScript wired in JarvisBrain; "risk scenario"/"scenario planned"/"which risks have scenarios"/"unplanned risks"/"rskscen"/"risks without plans" voice trigger; jarvis:rskscen-toggle event; 90-s auto-refresh */}
            <RiskScenarioCoverage />
            {/* F149: scene compare view — ⇄ CMPV button (left:3820, bottom:8, zIndex:60); parallel-fetches /v1/cinematic/scene/{id} for two user-selected scenes; side-by-side anchor diff table (shared anchors + health divergence, unique-to-A, unique-to-B); stat tiles (shared/only-A/only-B/total); ▶ COMPARE → /v1/jarvis/agent/chat 2-sentence AI narration + TTS via jarvis:speak-dossier; isSceneCompareQuery+buildSceneCompareScript wired in JarvisBrain (line 51/708); "compare scene"/"scene diff"/"diff scene"/"compare anchor"/"anchor compare" voice trigger; jarvis:compare-toggle event */}
            <SceneCompareView />
            {/* F150: investment × investigation exposure linker — ◆ INVL button (left:49720, bottom:8, zIndex:100); parallel-fetches /entities/Investment + /v1/investigations; keyword-correlates each holding (name/ticker/sector/description/tags) against open investigation cases to surface IMPLICATED (overlap found) vs CLEAR (no overlap); stat tiles (holdings/cases/implicated/clear); ALL/IMPLICATED/CLEAR filter tabs + text search; red badge on implicated count; expand holding → matched cases with status badge + priority badge + relevance score bar; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence investigation-exposure risk brief + TTS via jarvis:speak-dossier; isInvInvlQuery+buildInvInvlScript wired in JarvisBrain; "investment investigation"/"which investments are in cases"/"invl"/"portfolio investigation" voice trigger; jarvis:inv-invl-toggle event; 90-s auto-refresh */}
            <InvestmentInvestigationLinker />
            {/* F151: investment × ops event monitor — ◆ INVOPS button (left:50280, bottom:8, zIndex:76); parallel-fetches /entities/Investment + /v1/ops/events; keyword-correlates each holding (name/type/sector/description/ticker/tags) against live operational events to surface IMPACTED (disruption overlap found) vs CLEAR (no ops exposure); stat tiles (holdings/ops events/impacted/clear); ALL/IMPACTED/CLEAR filter tabs + text search; red badge on impacted count when any matched event is CRITICAL/HIGH; expand holding → matched events with severity badge + service + relevance score bar; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio ops-impact brief + TTS via jarvis:speak-dossier; isInvOpsQuery+buildInvOpsScript wired in JarvisBrain; "investment ops"/"portfolio ops event"/"investment impact"/"portfolio disruption"/"ops event impact"/"invops" voice trigger; jarvis:invops-toggle event; 60-s auto-refresh */}
            <InvestmentOpsMonitor />
            {/* F152: ops-scenario gap analyzer — ◈ OPSCEN button (left:9124, bottom:8, zIndex:69); parallel-fetches /v1/ops/events + /v1/scenario/list; keyword-correlates each live ops event against scenario catalog to surface COVERED (playbook exists) vs DARK (no actionable scenario); stat tiles (events/scenarios/covered/dark); ALL/COVERED/DARK filter tabs; expand event → matched scenarios with relevance score + status; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops-readiness brief + TTS via jarvis:speak-dossier; "ops scenario"/"ops playbook"/"playbook gap"/"opscen"/"incident playbook" voice trigger; jarvis:opscen-toggle event; 90-s auto-refresh */}
            <OpsScenarioGap />
            {/* F153: intel profile × ops event activity linker — ◈ IPACT button (left:50840, bottom:8, zIndex:101); parallel-fetches /entities/IntelProfile + /v1/ops/events; keyword-correlates each threat actor against live ops events to surface ACTIVE (corroboration found) vs DORMANT (no operational footprint); stat tiles (profiles/ops events/active/dormant); ALL/ACTIVE/DORMANT filter tabs + text search; expand profile → matched events with severity badge + service + timestamp + relevance score; red badge on active count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence actor-activity brief + TTS via jarvis:speak-dossier; isIpactQuery+buildIpactScript wired in JarvisBrain; "intel activity"/"actor activity"/"active threats"/"threat ops events"/"ipact" voice trigger; jarvis:ipact-toggle event; 60-s auto-refresh */}
            <IntelProfileOpsLinker />
            {/* F154: scene data diff — polls all 10 /v1/cinematic/scene/{id} every 90 s; diffs anchor values against prior snapshot; △ DIFF toggle (left:5200); unread badge; announces ≥3 changes via jarvis:speak-dossier; "scene diff"/"scene changes"/"anchor changes"/"what changed" voice trigger */}
            <SceneDataDiff />
            {/* F155 (overnight 2026-07-04): investment × risk overlay — ◈ IRO button (left:4236, bottom:8, zIndex:55); parallel-fetches /entities/Investment + /entities/RiskSignal; keyword-correlates each holding against active risk signals; exposure grid (investment rows × risk heat columns); red badge on critical exposure count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-risk brief + TTS via jarvis:speak-dossier; "investment risk"/"portfolio exposure"/"risk overlay"/"iro"/"asset risk"/"exposure map" voice trigger; jarvis:iro-toggle event; 90-s auto-refresh */}
            <InvestmentRiskOverlay />
            {/* F156: skill × investigation coverage — ◈ SKLINV button (left:51400, bottom:8, zIndex:102); parallel-fetches /v1/aip/skill + /v1/investigations; keyword-correlates each open investigation against skill catalog to surface SKILLED vs UNSUPPORTED; amber badge on unsupported count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence capability brief + TTS via jarvis:speak-dossier; "skill investigation"/"case skill gap"/"sklinv" voice trigger; jarvis:sklinv-toggle event; 90-s auto-refresh */}
            <SkillInvestigationCoverage />
            {/* F31 (overnight 2026-07-04): entity registry overview — ◫ REGISTRY button; parallel-fetches all 6 /entities/ types (Task/RiskSignal/IntelProfile/SwarmJob/Investment/Contact); unified 6-tile count dashboard; 60-s auto-refresh; "registry"/"entity counts"/"all entities" voice trigger; jarvis:registry-toggle event */}
            <EntityRegistryOverview />
            {/* F158 (overnight 2026-07-04): dataset query assistant — lists /v1/datasets; user selects a dataset + types a natural-language question; question + dataset metadata sent to /v1/jarvis/agent/chat for AI answer; answer shown in-panel + spoken via jarvis:speak-dossier; session Q&A history (up to 20 pairs); ◈ DQRY button left:4028 bottom strip; "query dataset"/"ask dataset"/"dataset question"/"dqry" voice trigger */}
            <DatasetQueryAssistant />
            {/* F159 (overnight 2026-07-05): graph node × knowledge coverage — ◈ GKNOW button (left:51960, bottom:8, zIndex:103); parallel-fetches /v1/graph/centrality + /knowledge/; keyword-correlates top-influence nodes against articles to surface DOCUMENTED vs DARK; amber badge on dark count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence network-knowledge brief + TTS; "graph knowledge"/"node docs"/"gknow" voice trigger; jarvis:gknow-toggle event; 120-s auto-refresh */}
            <GraphNodeKnowledgeCoverage />
            {/* F160 (overnight 2026-07-05): investigation case workspace — ◈ ICWS button (left:4132, bottom:18, zIndex:68); lists /v1/investigations; select case → cross-references /entities/RiskSignal by keyword overlap; AI Q&A per case via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS; in-panel history up to 10 pairs; open-count badge; "case workspace"/"investigation workspace"/"case deep dive"/"icws" voice trigger; jarvis:icws-toggle event */}
            <InvestigationCaseWorkspace />
            {/* F161 (overnight 2026-07-05): report × risk signal coverage — ◈ RRISK button (left:52280, bottom:8, zIndex:104); parallel-fetches /v1/reports + /entities/RiskSignal; keyword-correlates each report against active risk signals to surface EXPOSED vs CLEAR; red badge on exposed count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS; "report risk"/"risk reports"/"rrisk" voice trigger; jarvis:rrisk-toggle event; 90-s auto-refresh */}
            <ReportRiskTracker />
            {/* F162 (overnight 2026-07-05): swarm job × graph centrality convergence — ◈ SWGRPH button (left:52840, bottom:8, zIndex:105); parallel-fetches /entities/SwarmJob + /v1/graph/centrality; keyword-correlates each swarm job against top-influence graph nodes to surface TARGETING (automation focused on high-influence nodes) vs PERIPHERAL (no graph alignment); violet badge on targeting count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence swarm-graph brief + TTS; "swarm graph"/"swarm centrality"/"swgrph" voice trigger; jarvis:swgrph-toggle event; 90-s auto-refresh */}
            <SwarmGraphConvergence />
            {/* F163 (overnight 2026-07-05): system snapshot tracker — ◈ SNAP button (left:53400); polls /v1/jarvis/system/status + /v1/cinematic/brain every 60 s; manual TAKE SNAP stores timestamped reading to localStorage (max 20); per-metric Δ delta vs previous snapshot (green=improvement, red=degradation); ▶ TREND → last-5-snapshot context to /v1/jarvis/agent/chat 2-sentence health-trend brief + jarvis:speak-dossier TTS; "snapshot"/"system snapshot"/"take snapshot"/"snap"/"metric history" voice trigger */}
            <SnapshotTracker />
            {/* F164 (overnight 2026-07-05): investigation close-rate tracker — ◎ CRATE button (left:53960, bottom:8, zIndex:80); polls /v1/investigations every 5 min; tracks closed/open case ratio in localStorage (24-reading rolling window); close-rate gauge + sparkline + trend badge; warns via jarvis:speak-dossier if rate declines for 2+ consecutive readings; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence closure-trend brief; "investigation close rate"/"case closure rate"/"cases resolved"/"close rate"/"crate"/"closure metric" voice trigger; jarvis:crate-toggle event */}
            <InvestigationCloseRate />
            {/* F165 (overnight 2026-07-05): graph node × task coverage — ◈ GNTASK button (left:54520, bottom:8, zIndex:107); parallel-fetches /v1/graph/centrality + /entities/Task; keyword-correlates each top-influence node against the task catalog to surface TASKED (active task coverage) vs UNMANAGED (no operational task — priority gap); violet badge on unmanaged count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence influence-coverage brief + TTS; "graph node task"/"node task coverage"/"high influence task"/"gntask" voice trigger; jarvis:gntask-toggle event; 90-s auto-refresh */}
            <GraphNodeTaskCoverage />
            {/* F31 (backlog 2026-08-01): ops task coverage checker — ◎ OPSCOV button (left:6732, bottom:6, zIndex:65); parallel-fetches /v1/ops/events (critical+high) + /entities/Task; keyword-correlates each significant ops event against task titles/descriptions to surface COVERED vs UNCOVERED events; red badge on uncovered critical count; ▶ ASSESS → /v1/jarvis/agent/chat AI remediation recommendation + jarvis:speak-dossier TTS; "ops coverage"/"ops task coverage"/"uncovered events"/"task coverage"/"opscov"/"ops gaps" voice trigger; jarvis:ops-coverage-toggle event; 30-s auto-refresh */}
            <OpsTaskCoverageChecker />
            {/* F32 (backlog 2026-08-01): scene-risk coverage map — ◈ SCRISK button (left:8604, bottom:8, zIndex:65); parallel-fetches all 10 /v1/cinematic/scene/{id} anchor sets + /entities/RiskSignal; keyword-correlates each risk signal against every scene's anchor texts to surface CAPTURED (represented in a scene) vs DARK (no scene coverage) risks; red badge on dark critical count; stat tiles (scenes/risks/captured/dark); ALL/CAPTURED/DARK filter tabs + text search; expand risk → matched scene chips; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scene-risk alignment brief + TTS via jarvis:speak-dossier; "scene risk"/"dark risks"/"risk scenes"/"uncaptured risks"/"scene risk coverage"/"scrisk" voice trigger; jarvis:scrisk-toggle event; 120-s auto-refresh */}
            <SceneRiskCoverageMap />
            {/* F33 (backlog 2026-08-01): ops event severity dashboard — ◈ SEVDASH button (left:55080, bottom:8, zIndex:65); fetches /v1/ops/events every 45s; groups events by CRITICAL/WARNING/INFO severity with count tiles; shows most-recent event per severity level; red badge on critical count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence severity brief + TTS via jarvis:speak-dossier; "ops severity"/"event severity"/"severity dashboard"/"sevdash" voice trigger; jarvis:sevdash-toggle event */}
            <OpsEventSeverityDashboard />
            {/* F34 (overnight 2026-08-01): graph node × report coverage — ◈ GPREP button (left:55640, bottom:8, zIndex:108); parallel-fetches /v1/graph/centrality + /v1/reports; keyword-correlates each top-influence node against report titles/summaries to surface REPORTED (node appears in intelligence reports) vs UNREPORTED (no report coverage — intelligence gap); amber badge on unreported count; stat tiles (nodes/reports/reported/unreported); ALL/REPORTED/UNREPORTED filter tabs + text search; expand node → matched reports with relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence graph-report coverage brief + TTS via jarvis:speak-dossier; "graph report"/"node report"/"gprep"/"unreported nodes"/"report coverage"/"graph report coverage" voice trigger; jarvis:gprep-toggle event; 90-s auto-refresh */}
            <GraphNodeReportCoverage />
            {/* F35 (overnight 2026-08-01): live intel × task activator — ◈ LITA button (left:530240, bottom:8, zIndex:130); parallel-fetches /functions/getLiveIntel (quakes/crypto/FX) + /entities/Task; keyword-correlates each task against live world events to surface TRIGGERED (world event activates this task domain) vs DORMANT (no live alignment); red badge on triggered count; stat tiles (tasks/live events/triggered/dormant); ALL/TRIGGERED/DORMANT filter tabs + text search; expand task → matched live events with type badge (SEISMIC/CRYPTO/FX) + relevance score bar; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence task-activation brief + TTS via jarvis:speak-dossier; isLitaQuery+buildLitaScript wired in JarvisBrain; "live intel task"/"world task"/"task trigger"/"triggered tasks"/"lita" voice trigger; jarvis:lita-toggle event; 60-s auto-refresh */}
            <LiveIntelTaskActivator />
            {/* F36 (overnight 2026-08-01): skill × live intel world demand gauge — ◈ SKILD button (left:56200, bottom:8, zIndex:109); parallel-fetches /v1/aip/skill + /functions/getLiveIntel (quakes/crypto/FX); keyword-correlates each skill's domain keywords against live world events to surface ACTIVATED (world currently demands this skill) vs IDLE (no world alignment); stat tiles (skills/live events/activated/idle); ALL/ACTIVATED/IDLE filter tabs + text search; expand skill → matched live events with type badge (SEISMIC/CRYPTO/FX) + relevance score bar; amber badge on activated count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence skill-world-demand brief + TTS via jarvis:speak-dossier; isSkildQuery+buildSkildScript wired in JarvisBrain; "skill demand"/"world skill"/"which skills"/"active skills"/"skill intel"/"skild"/"skills needed now" voice trigger; jarvis:skild-toggle event; 90-s auto-refresh */}
            <SkillLiveIntelDemand />
            {/* F37 (overnight 2026-08-01): contact × live intel exposure monitor — ◈ CXLINTEL button (left:56760, bottom:8, zIndex:110); parallel-fetches /entities/Contact + /functions/getLiveIntel (quakes/crypto/FX); keyword-correlates each contact (name/org/location/tags) against live world events to surface EXPOSED (live-world-event overlap) vs CLEAR; red badge on exposed count, escalated to red when seismic events match; stat tiles (contacts/live events/exposed/clear); ALL/EXPOSED/CLEAR filter tabs + text search; expand contact → matched events with type badge (SEISMIC/CRYPTO/FX) + relevance score bar; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-exposure brief + TTS via jarvis:speak-dossier; isCxlintelQuery+buildCxlintelScript wired in JarvisBrain; "contact intel"/"contact exposure"/"who is affected"/"cxlintel"/"contact world"/"people exposed"/"contacts affected" voice trigger; jarvis:cxlintel-toggle event; 60-s auto-refresh */}
            <ContactLiveIntelExposure />
            {/* F38 (overnight 2026-08-01): crypto × risk signal correlator — ◈ CRYPTORSK button (left:31000, bottom:8, zIndex:61); parallel-fetches /functions/getLiveIntel (crypto+FX) + /entities/RiskSignal; keyword-correlates each active risk signal against live crypto/FX asset names and tickers to surface EXPOSED (≥1 market keyword overlap) vs ISOLATED (no financial correlation); stat tiles (assets/signals/exposed/isolated); ALL/EXPOSED/ISOLATED filter tabs + text search; expand signal → matched assets with type badge + change_pct + relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence financial-risk brief + TTS via jarvis:speak-dossier; isCryptorskQuery+buildCryptorskScript wired in JarvisBrain; "crypto risk"/"bitcoin risk"/"market risk signal"/"financial risk"/"crypto correlation"/"cryptorsk" voice trigger; jarvis:cryptorsk-toggle event; 5-min auto-refresh */}
            <CryptoRiskCorrelator />
            {/* F39 (overnight 2026-08-01): contact × risk signal correlator — ◈ CRSC button; parallel-fetches /entities/Contact + /entities/RiskSignal; keyword-correlates each contact (name/org/role/email) against active risk signals to surface EXPOSED vs CLEAR; red badge on exposed count; expand contact → matched signals with severity + relevance score bar; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence exposure brief + TTS; isCrscQuery+buildCrscScript already wired in JarvisBrain; "contact risk"/"crsc"/"exposed contacts"/"risky contacts"/"contacts with risk" voice trigger; jarvis:crsc-toggle event; 90s auto-refresh */}
            <ContactRiskSignalCorrelator />
            {/* F40 (overnight 2026-08-01): swarm job × risk signal correlator — ◈ SJRS button; parallel-fetches /entities/SwarmJob + /entities/RiskSignal; keyword-correlates each swarm job against active risk signals to surface EXPOSED vs CLEAR jobs; red badge on exposed count; expand job → matched signals with severity + relevance score; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence swarm-risk brief + TTS; isSwarmRiskQuery+buildSwarmRiskScript already wired in JarvisBrain; "swarm risk"/"sjrs"/"exposed swarm"/"risky swarm" voice trigger; 90s auto-refresh */}
            <SwarmJobRiskCorrelator />
            {/* F41 (overnight 2026-08-01): live intel × graph centrality exposure — ◈ LGCE button (left:598640, bottom:8, zIndex:225); parallel-fetches /functions/getLiveIntel (quakes/crypto/FX) + /v1/graph/centrality; keyword-correlates each top-influence graph node against live world events to surface ACTIVATED (world event intersects node domain) vs DORMANT (no live exposure); stat tiles (nodes/live events/activated/dormant); ALL/ACTIVATED/DORMANT filter tabs + text search; expand node → matched live events with type badge (SEISMIC/CRYPTO/FX) + relevance score bar; cyan badge on activated count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence network-exposure brief + TTS via jarvis:speak-dossier; isLgceQuery+buildLgceScript wired in JarvisBrain; "live graph"/"graph exposure"/"active nodes"/"world graph"/"lgce"/"graph intel"/"network exposure" voice trigger; jarvis:lgce-toggle event; 60-s auto-refresh */}
            <LiveIntelGraphExposure />
            {/* F42 (overnight 2026-08-01): contact × graph centrality panel — ◈ CGCP button (left:456720, bottom:8, zIndex:193); parallel-fetches /entities/Contact + /v1/graph/centrality; keyword-correlates each contact (name/org/role/tags) against top-influence centrality nodes to surface HIGH-CENTRALITY contacts (network-aligned) vs PERIPHERAL (no graph node match); stat tiles (contacts/nodes/linked/peripheral); ALL/HIGH-CENTRALITY/PERIPHERAL filter tabs + text search; expand contact → matched centrality nodes with influence score + type; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-network brief + TTS via jarvis:speak-dossier; isCgcpQuery+buildCgcpScript wired in JarvisBrain; "contact centrality"/"network contacts"/"cgcp"/"influential contacts"/"contacts by network" voice trigger; jarvis:cgcp-toggle event; 90-s auto-refresh */}
            <ContactGraphCentralityPanel />
            {/* F43 (overnight 2026-08-01): intel profile × live intel exposure — ◈ IPLIVE button (left:57320, bottom:8, zIndex:111); parallel-fetches /entities/IntelProfile + /functions/getLiveIntel (quakes/crypto/FX); keyword-correlates each intel profile (name/title/description/type/location) against live world events to surface ACTIVATED (world event intersects profile domain) vs DORMANT (no live alignment); stat tiles (profiles/live events/activated/dormant); ALL/ACTIVATED/DORMANT filter tabs + text search; expand profile → matched live events with type badge (SEISMIC/CRYPTO/FX) + relevance score bar; amber badge on activated count; ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intel-profile-world-exposure brief + TTS via jarvis:speak-dossier; isIpliveQuery+buildIpliveScript wired in JarvisBrain; "intel profile live"/"profile world"/"active profiles"/"iplive"/"profiles activated"/"profile world events" voice trigger; jarvis:iplive-toggle event; 60-s auto-refresh */}
            <IntelProfileLiveIntelExposure />
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
