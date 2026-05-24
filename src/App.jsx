import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import AuthGate from '@/lib/AuthGate';
import JarvisTerminal from './pages/JarvisTerminal';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthGate>
            <Routes>
              <Route path="/" element={<JarvisTerminal />} />
              <Route path="*" element={<PageNotFound />} />
            </Routes>
          </AuthGate>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
