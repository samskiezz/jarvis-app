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
