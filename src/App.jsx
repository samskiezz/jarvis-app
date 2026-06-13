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
import WorldIncidentFeed from '@/components/cinematic/WorldIncidentFeed';
import MarketsTicker from '@/components/cinematic/MarketsTicker';
import EntityQuickSearch from '@/components/cinematic/EntityQuickSearch';
import RiskBoard from '@/components/cinematic/RiskBoard';
import DatasetsBrowser from '@/components/cinematic/DatasetsBrowser';
import InvestigationsList from '@/components/cinematic/InvestigationsList';
import ScenarioLauncher from '@/components/cinematic/ScenarioLauncher';
import DocumentSearch from '@/components/cinematic/DocumentSearch';
import SkillScorecard from '@/components/cinematic/SkillScorecard';
import BrainGrowthSparkline from '@/components/cinematic/BrainGrowthSparkline';
import SceneAnchorDrillDown from '@/components/cinematic/SceneAnchorDrillDown';
import JarvisBootSequence from '@/components/cinematic/JarvisBootSequence';
import AmbientReactorHum from '@/components/cinematic/AmbientReactorHum';
import LiveClockUptime from '@/components/cinematic/LiveClockUptime';
import AlertToasts from '@/components/cinematic/AlertToasts';
import InvestmentWidget from '@/components/cinematic/InvestmentWidget';
import ContactsDirectory from '@/components/cinematic/ContactsDirectory';
import SwarmJobsMonitor from '@/components/cinematic/SwarmJobsMonitor';
import GraphCentralityView from '@/components/cinematic/GraphCentralityView';
import ServiceDiagnostics from '@/components/cinematic/ServiceDiagnostics';
import CommandHistory from '@/components/cinematic/CommandHistory';
import MultiVoiceToggle from '@/components/cinematic/MultiVoiceToggle';
import SceneAutoTour from '@/components/cinematic/SceneAutoTour';
import IntelProfileDirectory from '@/components/cinematic/IntelProfileDirectory';
import SceneHealthHeatmap from '@/components/cinematic/SceneHealthHeatmap';
import MorningBriefing from '@/components/cinematic/MorningBriefing';
import KnowledgeBrowser from '@/components/cinematic/KnowledgeBrowser';
import OpsEventStream from '@/components/cinematic/OpsEventStream';
import GraphPathExplorer from '@/components/cinematic/GraphPathExplorer';
import ReportSummariser from '@/components/cinematic/ReportSummariser';
import DataAcquisitionMonitor from '@/components/cinematic/DataAcquisitionMonitor';
import EntityRegistryOverview from '@/components/cinematic/EntityRegistryOverview';
import ThreatTimeline from '@/components/cinematic/ThreatTimeline';
import JarvisCommandPalette from '@/components/cinematic/JarvisCommandPalette';
import SituationRoom from '@/components/cinematic/SituationRoom';
import IntelDigest from '@/components/cinematic/IntelDigest';
import GraphNetworkExplorer from '@/components/cinematic/GraphNetworkExplorer';
import PriorityActionQueue from '@/components/cinematic/PriorityActionQueue';
import SkillGapAdvisor from '@/components/cinematic/SkillGapAdvisor';
import AgentChatTranscript from '@/components/cinematic/AgentChatTranscript';
import ThreatCorrelationEngine from '@/components/cinematic/ThreatCorrelationEngine';
import SceneCompareView from '@/components/cinematic/SceneCompareView';
import ScenarioImpactMatrix from '@/components/cinematic/ScenarioImpactMatrix';
import DatasetQueryAssistant from '@/components/cinematic/DatasetQueryAssistant';
import InvestigationCaseWorkspace from '@/components/cinematic/InvestigationCaseWorkspace';
import InvestmentRiskOverlay from '@/components/cinematic/InvestmentRiskOverlay';
import ContactThreatLinker from '@/components/cinematic/ContactThreatLinker';
import EntityWatchlist from '@/components/cinematic/EntityWatchlist';
import SystemHealthScorecard from '@/components/cinematic/SystemHealthScorecard';
import TaskSkillAlignment from '@/components/cinematic/TaskSkillAlignment';
import LiveIntelPulse from '@/components/cinematic/LiveIntelPulse';
import ThreatVelocityMonitor from '@/components/cinematic/ThreatVelocityMonitor';
import OpsRunbookGenerator from '@/components/cinematic/OpsRunbookGenerator';
import ScenarioRiskAdvisor from '@/components/cinematic/ScenarioRiskAdvisor';
import KnowledgeInvestigationLinker from '@/components/cinematic/KnowledgeInvestigationLinker';
import SwarmRiskCoverageMap from '@/components/cinematic/SwarmRiskCoverageMap';
import AdaptiveThreatReport from '@/components/cinematic/AdaptiveThreatReport';
import SkillContactGapAdvisor from '@/components/cinematic/SkillContactGapAdvisor';
import GraphAnomalyDetector from '@/components/cinematic/GraphAnomalyDetector';
import MissionReadinessIndex from '@/components/cinematic/MissionReadinessIndex';
import InvestigationScenarioRecommender from '@/components/cinematic/InvestigationScenarioRecommender';

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
        <Router>
          <AuthGate>
            {/* Global first-run install pop-up — shows on the landing page too,
                so a fresh deploy initialises before you even pick a destination. */}
            <FirstRunSetup />
            <JarvisBrain />
            <WorldIncidentFeed />
            <MarketsTicker />
            <EntityQuickSearch />
            <RiskBoard />
            <DatasetsBrowser />
            <InvestigationsList />
            <ScenarioLauncher />
            <DocumentSearch />
            <SkillScorecard />
            <BrainGrowthSparkline />
            <SceneAnchorDrillDown />
            <JarvisBootSequence />
            <AmbientReactorHum />
            <LiveClockUptime />
            <AlertToasts />
            <InvestmentWidget />
            <ContactsDirectory />
            <SwarmJobsMonitor />
            <GraphCentralityView />
            <ServiceDiagnostics />
            <CommandHistory />
            <MultiVoiceToggle />
            <SceneAutoTour />
            <IntelProfileDirectory />
            <SceneHealthHeatmap />
            <MorningBriefing />
            <KnowledgeBrowser />
            <OpsEventStream />
            <GraphPathExplorer />
            <ReportSummariser />
            <DataAcquisitionMonitor />
            <EntityRegistryOverview />
            <ThreatTimeline />
            <JarvisCommandPalette />
            <SituationRoom />
            <IntelDigest />
            <GraphNetworkExplorer />
            <PriorityActionQueue />
            <SkillGapAdvisor />
            <AgentChatTranscript />
            <ThreatCorrelationEngine />
            <SceneCompareView />
            <ScenarioImpactMatrix />
            <DatasetQueryAssistant />
            <InvestigationCaseWorkspace />
            <InvestmentRiskOverlay />
            <ContactThreatLinker />
            <EntityWatchlist />
            <SystemHealthScorecard />
            <TaskSkillAlignment />
            <LiveIntelPulse />
            <ThreatVelocityMonitor />
            <OpsRunbookGenerator />
            <ScenarioRiskAdvisor />
            <KnowledgeInvestigationLinker />
            <SwarmRiskCoverageMap />
            <AdaptiveThreatReport />
            <SkillContactGapAdvisor />
            <GraphAnomalyDetector />
            <MissionReadinessIndex />
            <InvestigationScenarioRecommender />
            <Suspense fallback={<Loading />}>
              <Routes>
                {/* Front door is now the cinematic selector (JARVIS / Underworld).
                    The 86-page APEX wall is preserved under /apex but is no longer
                    the entry point. The old portal chooser stays at /portal. */}
                <Route path="/" element={<CinematicHome />} />
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
