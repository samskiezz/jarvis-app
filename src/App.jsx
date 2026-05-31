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
            <AppLayout>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<Navigate to={createPageUrl(HOME_PAGE.name)} replace />} />
                  {PAGES.map((p) => {
                    const Page = p.component;
                    return <Route key={p.name} path={createPageUrl(p.name)} element={<Page />} />;
                  })}
                  <Route path="*" element={<PageNotFound />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </AuthGate>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
