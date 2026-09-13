import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const ASST_RE = /\b(asset[._-]?lib(?:rary)?|3d[._-]?model|tripo[._-]?model|model[._-]?lib(?:rary)?|wire[._-]?model|glb[._-]?asset|3d[._-]?asset|jarvis[._-]?model|model[._-]?gap|asst|render[._-]?asset|generate[._-]?model|asset[._-]?gap|model[._-]?pipeline|asset[._-]?pipeline)\b/i;

export function isAsstQuery(t) {
  return ASST_RE.test(t || '');
}

export async function buildAsstScript() {
  const [sR, gR] = await Promise.allSettled([
    fetch(`${API}/v1/jarvis/assets/status`).then(r => r.json()),
    fetch(`${API}/v1/jarvis/assets/gaps`).then(r => r.json()),
  ]);
  const status = sR.status === 'fulfilled' ? sR.value : {};
  const gaps = gR.status === 'fulfilled'
    ? (Array.isArray(gR.value?.gaps) ? gR.value.gaps : [])
    : [];
  const libCount = status.library ?? status.library_count ?? 0;
  const wiredCount = status.wired ?? status.wired_count ?? 0;
  const tripoReady = status.tripo_ready ?? status.tripo_configured ?? false;
  return (
    `Jarvis Asset Library: ${libCount} Tripo GLB models in library, ${wiredCount} wired to the holo engine. ` +
    `${gaps.length} render gap${gaps.length !== 1 ? 's' : ''} identified (surfaces needing new GLBs). ` +
    `Tripo3D generation: ${tripoReady ? 'AVAILABLE' : 'NOT CONFIGURED (set TRIPO_API_KEY)'}.`
  );
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };
const ACCENT = '#a78bfa';

export default function JarvisAssetLibrary() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({});
  const [gaps, setGaps] = useState([]);
  const [libraryResults, setLibraryResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [libLoading, setLibLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('STATUS');
  const [search, setSearch] = useState('');
  const [wiring, setWiring] = useState({});
  const [wireResults, setWireResults] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const debounceRef = useRef(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sR, gR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/assets/status`).then(r => r.json()),
        fetch(`${API}/v1/jarvis/assets/gaps`).then(r => r.json()),
      ]);
      if (sR.status === 'fulfilled') setStatus(sR.value || {});
      if (gR.status === 'fulfilled') setGaps(Array.isArray(gR.value?.gaps) ? gR.value.gaps : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchLibrary = useCallback(async (q) => {
    if (!q.trim()) { setLibraryResults([]); return; }
    setLibLoading(true);
    try {
      const r = await fetch(`${API}/v1/jarvis/assets/library?q=${encodeURIComponent(q)}`).then(r => r.json());
      setLibraryResults(Array.isArray(r?.models) ? r.models : []);
    } catch {
      setLibraryResults([]);
    } finally {
      setLibLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:asst-toggle', h);
    return () => window.removeEventListener('jarvis:asst-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadStatus();
    const id = setInterval(loadStatus, 60_000);
    return () => clearInterval(id);
  }, [open, loadStatus]);

  useEffect(() => {
    if (tab !== 'LIBRARY') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchLibrary(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search, tab, searchLibrary]);

  const wireModel = async (name) => {
    setWiring(w => ({ ...w, [name]: true }));
    try {
      const r = await fetch(`${API}/v1/jarvis/assets/wire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(r => r.json());
      setWireResults(wr => ({ ...wr, [name]: r }));
      if (r.ok) loadStatus();
    } catch (e) {
      setWireResults(wr => ({ ...wr, [name]: { ok: false, error: e.message } }));
    } finally {
      setWiring(w => ({ ...w, [name]: false }));
    }
  };

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const libCount = status.library ?? status.library_count ?? 0;
    const wiredCount = status.wired ?? status.wired_count ?? 0;
    const tripoReady = status.tripo_ready ?? status.tripo_configured ?? false;
    const prompt =
      `Jarvis Asset Library: ${libCount} GLBs in library, ${wiredCount} wired to holo engine. ` +
      `${gaps.length} render gaps. Tripo3D: ${tripoReady ? 'configured' : 'not configured'}. ` +
      `Gaps: ${gaps.slice(0, 3).map(g => g.surface || g.gen || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence asset-pipeline status brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const libCount = status.library ?? status.library_count ?? 0;
  const wiredCount = status.wired ?? status.wired_count ?? 0;
  const tripoReady = !!(status.tripo_ready ?? status.tripo_configured);
  const badgeColor = wiredCount > 0 ? ACCENT : gaps.length > 0 ? '#f59e0b' : '#64748b';
  const badgeVal = wiredCount > 0 ? wiredCount : null;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Jarvis Asset Library"
        style={{
          position: 'fixed',
          left: 584400,
          bottom: 8,
          zIndex: 221,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: badgeColor,
          boxShadow: wiredCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        ASST
        {badgeVal !== null && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {badgeVal}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 560,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: ACCENT }}>◈ JARVIS ASSET LIBRARY</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: `rgba(167,139,250,0.12)`, border: `1px solid rgba(167,139,250,0.3)`, borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'LIBRARY', val: libCount, color: ACCENT },
              { label: 'WIRED', val: wiredCount, color: wiredCount > 0 ? '#22c55e' : '#64748b' },
              { label: 'GAPS', val: gaps.length, color: gaps.length > 0 ? '#f59e0b' : '#64748b' },
              { label: 'TRIPO3D', val: tripoReady ? 'ON' : 'OFF', color: tripoReady ? '#22c55e' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: `rgba(167,139,250,0.07)`, border: `1px solid rgba(167,139,250,0.2)`, borderRadius: 8, fontSize: 12, color: '#c4b5fd', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['STATUS', 'LIBRARY', 'GAPS'].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); if (t === 'LIBRARY' && !search) setSearch(''); }}
                style={{
                  background: tab === t ? `rgba(167,139,250,0.15)` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? ACCENT : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            {tab === 'LIBRARY' && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search models (e.g. globe, helmet)…"
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
              />
            )}
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {tab === 'STATUS' && !loading && (
            <div style={{ padding: '0 16px 12px' }}>
              {[
                ['Library size', libCount + ' GLB models'],
                ['Wired to holo engine', wiredCount + ' models'],
                ['Render gaps', gaps.length + ' surfaces needing renders'],
                ['Tripo3D generation', tripoReady ? 'AVAILABLE' : 'NOT CONFIGURED'],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{label}</span>
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{val}</span>
                </div>
              ))}
              {Object.keys(status).filter(k => !['library', 'library_count', 'wired', 'wired_count', 'tripo_ready', 'tripo_configured'].includes(k)).map(k => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{k}</span>
                  <span style={{ color: '#94a3b8' }}>{String(status[k])}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'LIBRARY' && (
            <div>
              {libLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Searching…</div>}
              {!libLoading && search && libraryResults.length === 0 && (
                <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No models match "{search}".</div>
              )}
              {!search && (
                <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>Enter a keyword to search the GLB model library.</div>
              )}
              {libraryResults.map(name => {
                const wr = wireResults[name];
                return (
                  <div key={name} style={{ ...ROW, cursor: 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: 'rgba(167,139,250,0.10)', color: ACCENT, border: '1px solid rgba(167,139,250,0.25)' }}>GLB</span>
                      <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <button
                        onClick={() => wireModel(name)}
                        disabled={!!wiring[name]}
                        style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 5, color: '#34d399', padding: '2px 8px', fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {wiring[name] ? '...' : '▶ WIRE'}
                      </button>
                    </div>
                    {wr && (
                      <div style={{ marginTop: 5, fontSize: 11, color: wr.ok ? '#34d399' : '#ef4444' }}>
                        {wr.ok ? `✓ Wired → ${wr.path || '/models/' + name + '.glb'}` : `✗ ${wr.error || 'Wire failed'}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'GAPS' && (
            <div>
              {gaps.length === 0 && !loading && (
                <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No render gaps identified.</div>
              )}
              {gaps.map((gap, i) => {
                const genKey = gap.gen || gap.surface || String(i);
                const wr = wireResults[genKey];
                return (
                  <div key={i} style={{ ...ROW, cursor: 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ ...PILL, background: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>GAP</span>
                      {gap.plane && (
                        <span style={{ ...PILL, background: 'rgba(96,165,250,0.10)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                          {gap.plane}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>{gap.surface || gap.gen || `Gap ${i + 1}`}</span>
                    </div>
                    {gap.gen && (
                      <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>gen key: {gap.gen}</div>
                    )}
                    {wr && (
                      <div style={{ marginTop: 5, fontSize: 11, color: wr.ok ? '#34d399' : '#ef4444' }}>
                        {wr.ok ? `✓ Generated` : `✗ ${wr.error || 'Failed'}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {libCount} models in library · {wiredCount} wired · {gaps.length} gaps · auto-refresh 60s
          </div>
        </div>
      )}
    </>
  );
}
