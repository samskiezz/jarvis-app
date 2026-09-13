import { useState, useEffect, useCallback } from 'react';

const API = '';
const RSKC_RE = /\b(risk[._-]?scenario[._-]?knowledge|rskc|dark[._-]?risks?|scenario[._-]?knowledge|risk[._-]?coverage[._-]?triple|scenario[._-]?covered[._-]?risks?|risk[._-]?intel[._-]?gap|risk[._-]?knowledge[._-]?gap|risk[._-]?kb[._-]?scenario|signal[._-]?coverage[._-]?triple)\b/i;

export function isRskcQuery(t) {
  return RSKC_RE.test(t || '');
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'signals', 'articles', 'scenarios', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(signal, item, fields) {
  const sigToks = new Set([
    ...tokens(signal.title || signal.name),
    ...tokens(signal.description),
    ...tokens(signal.severity),
    ...tokens(signal.category),
    ...tokens(Array.isArray(signal.tags) ? signal.tags.join(' ') : signal.tags),
  ].filter(Boolean));
  const itemToks = fields.flatMap(f => tokens(item[f])).filter(Boolean);
  if (!sigToks.size || !itemToks.length) return 0;
  let hits = 0;
  for (const t of itemToks) if (sigToks.has(t)) hits++;
  return hits / Math.max(sigToks.size, itemToks.length);
}

function correlate(signals, scenarios, articles) {
  return signals.map(sig => {
    const scenMatches = scenarios
      .map(sc => ({ sc, score: matchScore(sig, sc, ['name', 'title', 'description', 'type', 'tags']) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    const kbMatches = articles
      .map(ar => ({ ar, score: matchScore(sig, ar, ['title', 'content', 'topic', 'tags']) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    const hasSc = scenMatches.length > 0;
    const hasKb = kbMatches.length > 0;
    const cls = hasSc && hasKb ? 'FULL_COVERAGE' : hasSc ? 'SCENARIO_ONLY' : hasKb ? 'KB_ONLY' : 'DARK';
    return { ...sig, _scenMatches: scenMatches, _kbMatches: kbMatches, _class: cls };
  });
}

export async function buildRskcScript() {
  const [sigR, scR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/knowledge/`).then(r => r.json()),
  ]);
  const signals = normaliseArray(sigR.status === 'fulfilled' ? sigR.value : []);
  const scenarios = normaliseArray(scR.status === 'fulfilled' ? scR.value : []);
  const articles = normaliseArray(kbR.status === 'fulfilled' ? kbR.value : []);
  const enriched = correlate(signals, scenarios, articles);
  const dark = enriched.filter(s => s._class === 'DARK');
  const full = enriched.filter(s => s._class === 'FULL_COVERAGE');
  return `RiskSignal × Scenario × Knowledge: ${signals.length} risk signals, ${scenarios.length} scenarios, ${articles.length} KB articles. ` +
    `${full.length} signals have FULL COVERAGE (scenario+KB); ${dark.length} are DARK (no scenario, no KB). ` +
    `Dark signals: ${dark.slice(0, 4).map(s => s.title || s.name || 'unnamed').join(', ') || 'none'}.`;
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const CLS_COLOR = {
  FULL_COVERAGE: '#22c55e',
  SCENARIO_ONLY: '#60a5fa',
  KB_ONLY: '#a78bfa',
  DARK: '#ef4444',
};

export default function RiskSignalScenarioKnowledge() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [articles, setArticles] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sigR, scR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/knowledge/`).then(r => r.json()),
      ]);
      const sigs = normaliseArray(sigR.status === 'fulfilled' ? sigR.value : []);
      const scs = normaliseArray(scR.status === 'fulfilled' ? scR.value : []);
      const arts = normaliseArray(kbR.status === 'fulfilled' ? kbR.value : []);
      setSignals(sigs);
      setScenarios(scs);
      setArticles(arts);
      setEnriched(correlate(sigs, scs, arts));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:rskc-toggle', h);
    return () => window.removeEventListener('jarvis:rskc-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const dark = enriched.filter(s => s._class === 'DARK');
    const full = enriched.filter(s => s._class === 'FULL_COVERAGE');
    const prompt = `RiskSignal × Scenario × Knowledge Coverage: ${signals.length} risk signals, ${scenarios.length} scenarios, ${articles.length} KB articles. ` +
      `${full.length} have FULL_COVERAGE (both scenario + KB match); ${enriched.filter(s => s._class === 'SCENARIO_ONLY').length} have SCENARIO_ONLY; ` +
      `${enriched.filter(s => s._class === 'KB_ONLY').length} have KB_ONLY; ${dark.length} are DARK with no coverage. ` +
      `Dark signals: ${dark.slice(0, 5).map(s => s.title || s.name || 'unnamed').join(', ') || 'none'}. ` +
      `Give a 2-sentence risk coverage brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const dark = enriched.filter(s => s._class === 'DARK');
  const badgeColor = dark.length > 0 ? '#ef4444' : '#22c55e';

  const visible = enriched.filter(sig => {
    const label = (sig.title || sig.name || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab !== 'ALL') return sig._class === tab;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="RiskSignal × Scenario × Knowledge Coverage"
        style={{
          position: 'fixed', left: 5100, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: `1px solid ${badgeColor}`,
          color: badgeColor, borderRadius: 6, padding: '3px 9px', fontSize: 11,
          fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          boxShadow: dark.length > 0 ? `0 0 8px ${badgeColor}55` : 'none',
          fontFamily: 'monospace',
          animation: dark.length > 0 ? 'rskc-pulse 2s ease-in-out infinite' : 'none',
        }}
      >
        ◈ RSKC
        {dark.length > 0 && (
          <span style={{ ...PILL, background: '#ef444422', color: '#ef4444', marginLeft: 6 }}>
            {dark.length} dark
          </span>
        )}
        <style>{`@keyframes rskc-pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }`}</style>
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: 60, right: 20, width: 660, maxHeight: '84vh',
          background: 'rgba(8,12,20,0.97)', border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 12, zIndex: 9200, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)', fontFamily: 'monospace',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ RISK × SCENARIO × KNOWLEDGE</span>
            <span style={{ ...PILL, background: '#22c55e22', color: '#22c55e' }}>{enriched.filter(s => s._class === 'FULL_COVERAGE').length} full</span>
            {dark.length > 0 && <span style={{ ...PILL, background: '#ef444422', color: '#ef4444' }}>{dark.length} dark</span>}
            {loading && <span style={{ color: '#888', fontSize: 11 }}>loading…</span>}
            <span style={{ flex: 1 }} />
            <button onClick={assess} disabled={assessing} style={{ fontSize: 11, color: '#ef4444', background: 'transparent', border: '1px solid #ef444455', borderRadius: 5, padding: '2px 9px', cursor: 'pointer' }}>
              {assessing ? '…' : '▶ ASSESS'}
            </button>
            <button onClick={() => setOpen(false)} style={{ color: '#888', background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', marginLeft: 6 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
            {[
              { label: 'Risk Signals', val: signals.length, color: '#f87171' },
              { label: 'Scenarios', val: scenarios.length, color: '#60a5fa' },
              { label: 'KB Articles', val: articles.length, color: '#a78bfa' },
              { label: 'Full Coverage', val: enriched.filter(s => s._class === 'FULL_COVERAGE').length, color: '#22c55e' },
              { label: 'Scenario Only', val: enriched.filter(s => s._class === 'SCENARIO_ONLY').length, color: '#60a5fa' },
              { label: 'KB Only', val: enriched.filter(s => s._class === 'KB_ONLY').length, color: '#a78bfa' },
              { label: 'Dark', val: dark.length, color: dark.length > 0 ? '#ef4444' : '#555' },
            ].map(t => (
              <div key={t.label} style={{ ...TILE, flex: '1 1 78px' }}>
                <div style={{ color: t.color, fontWeight: 700, fontSize: 16 }}>{t.val}</div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center', flexWrap: 'wrap' }}>
            {['ALL', 'FULL_COVERAGE', 'SCENARIO_ONLY', 'KB_ONLY', 'DARK'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
                background: tab === t ? `${CLS_COLOR[t] || '#f59e0b'}22` : 'transparent',
                border: tab === t ? `1px solid ${CLS_COLOR[t] || '#f59e0b'}55` : '1px solid transparent',
                color: tab === t ? (CLS_COLOR[t] || '#f59e0b') : '#888',
              }}>{t.replace('_', ' ')}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="filter signals…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc', borderRadius: 5, padding: '3px 9px', fontSize: 11, width: 160 }}
            />
          </div>

          {assessment && (
            <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 12 }}>
              {assessment}
            </div>
          )}

          {err && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 12 }}>{err}</div>}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: '#555', padding: 20, textAlign: 'center', fontSize: 12 }}>No risk signals</div>
            )}
            {visible.map((sig, i) => {
              const key = sig.id || sig._id || i;
              const label = sig.title || sig.name || `signal-${i}`;
              const isEx = expanded === key;
              const clsColor = CLS_COLOR[sig._class] || '#888';
              const sev = sig.severity || sig.level;
              const sevColor = sev === 'critical' || sev === 'CRITICAL' ? '#ef4444' :
                sev === 'high' || sev === 'HIGH' ? '#f97316' :
                sev === 'medium' || sev === 'MEDIUM' ? '#f59e0b' : '#94a3b8';
              return (
                <div key={key}>
                  <div
                    onClick={() => setExpanded(isEx ? null : key)}
                    style={{ ...ROW, background: isEx ? 'rgba(239,68,68,0.06)' : 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isEx ? 'rgba(239,68,68,0.06)' : 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: `${clsColor}22`, color: clsColor }}>{sig._class.replace('_', ' ')}</span>
                      {sev && <span style={{ ...PILL, background: `${sevColor}22`, color: sevColor }}>{sev.toUpperCase()}</span>}
                      <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1 }}>{label}</span>
                      <span style={{ color: '#555', fontSize: 11 }}>{isEx ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {isEx && (
                    <div style={{ padding: '8px 18px 12px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {sig.description && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{sig.description}</div>}

                      {sig._scenMatches.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ color: '#60a5fa', fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Matching Scenarios:</div>
                          {sig._scenMatches.map(({ sc, score }, j) => (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ color: '#93c5fd', fontSize: 11, flex: 1 }}>{sc.name || sc.title || sc.id}</span>
                                {sc.type && <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>{sc.type}</span>}
                                <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#60a5fa', borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {sig._kbMatches.length > 0 && (
                        <div>
                          <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Matching KB Articles:</div>
                          {sig._kbMatches.map(({ ar, score }, j) => (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ color: '#c4b5fd', fontSize: 11, flex: 1 }}>{ar.title || ar.id}</span>
                                {ar.topic && <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>{ar.topic}</span>}
                                <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {sig._class === 'DARK' && (
                        <div style={{ color: '#ef4444', fontSize: 11, marginTop: 6 }}>⚠ No scenario or KB article covers this risk signal.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
