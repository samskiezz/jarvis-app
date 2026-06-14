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
import GlobalCommandPalette from '@/components/cinematic/GlobalCommandPalette';
import HeyJarvisListener from '@/components/cinematic/HeyJarvisListener';
import SceneKeyboardNav from '@/components/cinematic/SceneKeyboardNav';
import WorldIncidentFeed from '@/components/cinematic/WorldIncidentFeed';
import MarketsTicker from '@/components/cinematic/MarketsTicker';
import EntityQuickSearch from '@/components/cinematic/EntityQuickSearch';
import RiskBoard from '@/components/cinematic/RiskBoard';
import TaskBoard from '@/components/cinematic/TaskBoard';
import DatasetsBrowser from '@/components/cinematic/DatasetsBrowser';
import InvestigationsPanel from '@/components/cinematic/InvestigationsPanel';
import ScenarioLauncher from '@/components/cinematic/ScenarioLauncher';
import DocumentSearch from '@/components/cinematic/DocumentSearch';
import SkillScorecard from '@/components/cinematic/SkillScorecard';
import BrainGrowthSparkline from '@/components/cinematic/BrainGrowthSparkline';
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
            <GlobalCommandPalette />
            <HeyJarvisListener />
            <SceneKeyboardNav />
            <WorldIncidentFeed />
            {/* F07: markets ticker strip — crypto + FX from getLiveIntel */}
            <MarketsTicker />
            {/* F08: entity quick-search panel — /v1/graph/subgraph + /entities/IntelProfile */}
            <EntityQuickSearch />
            {/* F09: risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical */}
            <RiskBoard />
            {/* F10: task board — /entities/Task → status-sorted mission cards */}
            <TaskBoard />
            {/* F11: datasets browser — /v1/datasets → catalog with row counts */}
            <DatasetsBrowser />
            {/* F12: investigations panel — /v1/investigations → open cases */}
            <InvestigationsPanel />
            {/* F13: scenario launcher — /v1/scenario/list → pick + run; show outcome */}
            <ScenarioLauncher />
            {/* F14: document search — /v1/reports + /knowledge/ → JARVIS summarizes */}
            <DocumentSearch />
            {/* F15: skill scorecard — /v1/aip/skill → self-improvement metrics, live */}
            <SkillScorecard />
            {/* F16: brain-growth sparkline — /v1/cinematic/brain → rolling nodes/synapses chart */}
            <BrainGrowthSparkline />
            {/* F17: per-scene anchor drill-down — /v1/cinematic/scene/{id} → anchors list + expanded detail */}
            <SceneAnchorDrillDown />
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
