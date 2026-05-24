import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { appParams } from '@/lib/app-params';

const C = { neon: '#00c878', red: '#e8203c', text: '#a8bcc8' };

const SubmitKey = ({ onSubmitted }) => {
  const [key, setKey] = useState('');
  const submit = (e) => {
    e?.preventDefault();
    if (!key.trim()) return;
    localStorage.setItem('kimi_api_key', key.trim());
    appParams.apiKey = key.trim();
    onSubmitted();
  };
  return (
    <form
      onSubmit={submit}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020509',
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      <div style={{ width: 360, padding: 24, border: `1px solid ${C.neon}33`, borderRadius: 4, background: 'rgba(4,10,16,0.95)' }}>
        <div style={{ color: C.neon, fontSize: 11, letterSpacing: 4, marginBottom: 16, fontWeight: 'bold' }}>JARVIS · ACCESS</div>
        <div style={{ color: C.text, fontSize: 9, marginBottom: 18, lineHeight: 1.6 }}>
          Enter your API key to unlock the terminal. The key is validated against the local backend at
          <code style={{ color: C.neon, marginLeft: 4 }}>{appParams.apiBaseUrl}/auth/me</code>.
        </div>
        <input
          autoFocus
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="API key"
          style={{
            width: '100%',
            background: 'rgba(0,200,120,0.04)',
            border: `1px solid ${C.neon}33`,
            color: C.text,
            padding: '8px 10px',
            borderRadius: 3,
            fontFamily: 'inherit',
            fontSize: 10,
            outline: 'none',
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          style={{
            width: '100%',
            background: `${C.neon}1a`,
            color: C.neon,
            border: `1px solid ${C.neon}66`,
            padding: '8px 12px',
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          AUTHENTICATE
        </button>
      </div>
    </form>
  );
};

const Banner = ({ children, color }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#020509',
      color,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
      letterSpacing: 3,
    }}
  >
    {children}
  </div>
);

export default function AuthGate({ children }) {
  const { isAuthenticated, isLoadingAuth, authError, checkAppState } = useAuth();

  if (isLoadingAuth) return <Banner color={C.text}>· AUTH CHECK ·</Banner>;
  if (!appParams.apiKey) return <SubmitKey onSubmitted={checkAppState} />;
  if (authError) return <Banner color={C.red}>{authError.message || 'AUTH FAILED'}</Banner>;
  if (!isAuthenticated) return <SubmitKey onSubmitted={checkAppState} />;
  return children;
}
