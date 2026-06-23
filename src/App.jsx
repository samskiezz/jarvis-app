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
