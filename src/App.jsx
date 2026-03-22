import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import JarvisTerminal from './pages/JarvisTerminal';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div style={{ position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'#020509' }}>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:16 }}>
          <svg width={48} height={48} viewBox="0 0 24 24" style={{ animation:'spin 2s linear infinite' }}>
            <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke="#00c878" strokeWidth="1.5" fill="none"/>
            <circle cx={12} cy={12} r={2.5} fill="#00c878" opacity={0.8}/>
          </svg>
          <span style={{ color:'#00c878',fontSize:10,letterSpacing:4,fontFamily:"'JetBrains Mono',monospace" }}>INITIALIZING JARVIS...</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<JarvisTerminal />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App