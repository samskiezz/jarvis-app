import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPINVSC_RE = /\b(ipinvsc|intel\s+profile\s+investment|intel\s+investment\s+scenario|intel\s+profile\s+scenario\s+investment|profiled\s+intel\s+investment|intel\s+investment\s+exposure|investment\s+intel\s+scenario|dark\s+intel\s+profile|blind\s+intel\s+profile|intel\s+scenario\s+investment|profiled\s+intel\s+profile|intel\s+profile\s+financial|intel\s+financial\s+scenario|intel\s+investment\s+coverage|intelligence\s+investment\s+scenario)\b/i;
const THRESHOLD = 0.07;

export function isIpinvscQuery(t) {
  return IPINVSC_RE.test(t || '');
}

export async function buildIpinvscScript() {
  try {
    const [profileRes, investRes, scenarioRes] = await Promise.all([
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
    ]);
    const profiles = normaliseProfiles(profileRes);
    const investments = normaliseInvestments(investRes);
    const scenarios = normaliseScenarios(scenarioRes);
    const classified = profiles.map(p => classifyProfile(p, investments, scenarios));
    const profiled = classified.filter(p => p.state === 'FULLY_PROFILED').length;
    const dark = classified.filter(p => p.state === 'DARK').length;
    return `IPINVSC analysis: ${profiles.length} intel profiles cross-referenced against ${investments.length} investments and ${scenarios.length} active scenarios. ${profiled} profiles are FULLY PROFILED — both financial investment exposure and threat scenario modeling confirmed. ${dark} profiles are DARK — no investment linkage or scenario coverage detected, representing critical intelligence gaps where targets remain without financial or threat scenario context.`;
  } catch {
    return 'IPINVSC data unavailable — check /entities/IntelProfile, /entities/Investment, and /v1/scenario/list endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.profiles) ? raw.profiles
    : Array.isArray(raw.intel_profiles) ? raw.intel_profiles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((p, i) => ({
    id: p.id || p._id || `profile-${i}`,
    label: p.name || p.title || p.handle || p.alias || `Profile ${i + 1}`,
    role: p.role || p.position || p.job_title || '',
    company: p.company || p.organisation || p.organization || '',
    _searchText: [p.name, p.title, p.handle, p.alias, p.role, p.company,
      p.description, p.summary, p.sector, p.category, p.tags].filter(Boolean).join(' '),
  }));
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.investments) ? raw.investments
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : [];
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv-${i}`,
    label: inv.name || inv.title || inv.ticker || `Investment ${i + 1}`,
    sector: inv.sector || inv.industry || inv.category || '',
    ticker: inv.ticker || inv.symbol || '',
    _text: [inv.name, inv.title, inv.ticker, inv.sector, inv.industry,
      inv.description, inv.notes, inv.tags].filter(Boolean).join(' '),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.scenarios) ? raw.scenarios
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `scen-${i}`,
    label: s.name || s.title || `Scenario ${i + 1}`,
    status: s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    _text: [s.name, s.title, s.description, s.category, s.type,
      s.summary, s.tags, s.objective].filter(Boolean).join(' '),
  }));
}

function classifyProfile(profile, investments, scenarios) {
  const toks = tok(profile._searchText);
  const matchedInvestments = investments
    .map(inv => ({ ...inv, score: matchScore(toks, inv._text) }))
    .filter(inv => inv.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedScenarios = scenarios
    .map(s => ({ ...s, score: matchScore(toks, s._text) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasInv = matchedInvestments.length > 0;
  const hasSc = matchedScenarios.length > 0;
  const state = hasInv && hasSc ? 'FULLY_PROFILED'
    : hasInv ? 'INVEST_LINKED'
    : hasSc ? 'SCENARIO_TRACKED'
    : 'DARK';

  return { ...profile, state, matchedInvestments, matchedScenarios };
}

export default function IntelProfileInvestmentScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileRes, investRes, scenarioRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      ]);
      const p = normaliseProfiles(profileRes);
      const inv = normaliseInvestments(investRes);
      const sc = normaliseScenarios(scenarioRes);
      setProfiles(p);
      setInvestments(inv);
      setScenarios(sc);
      setClassified(p.map(profile => classifyProfile(profile, inv, sc)));
    } catch (e) {
      setError('Fetch error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:ipinvsc-toggle', handler);
    return () => window.removeEventListener('jarvis:ipinvsc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (IPINVSC_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_PROFILED: classified.filter(p => p.state === 'FULLY_PROFILED').length,
    INVEST_LINKED: classified.filter(p => p.state === 'INVEST_LINKED').length,
    SCENARIO_TRACKED: classified.filter(p => p.state === 'SCENARIO_TRACKED').length,
    DARK: classified.filter(p => p.state === 'DARK').length,
  };

  const visible = classified.filter(p => {
    if (filter !== 'ALL' && p.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p._searchText.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `IPINVSC IntelProfile × Investment × Scenario Triple Coverage: ${profiles.length} intel profiles cross-referenced against ${investments.length} investments and ${scenarios.length} active scenarios. Coverage: FULLY_PROFILED=${counts.FULLY_PROFILED}, INVEST_LINKED=${counts.INVEST_LINKED}, SCENARIO_TRACKED=${counts.SCENARIO_TRACKED}, DARK=${counts.DARK}. In 2 sentences, assess which intelligence targets have both financial investment exposure and active threat scenario modeling versus those that are dark with no financial or scenario context, and identify the most critical intelligence profiling gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const profiledPct = classified.length ? Math.round((counts.FULLY_PROFILED / classified.length) * 100) : 0;
  const investPct = classified.length ? Math.round((counts.INVEST_LINKED / classified.length) * 100) : 0;
  const scenPct = classified.length ? Math.round((counts.SCENARIO_TRACKED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  const STATE_COLOR = {
    FULLY_PROFILED: '#fb923c',
    INVEST_LINKED: '#facc15',
    SCENARIO_TRACKED: '#a78bfa',
    DARK: '#475569',
  };

  return (
    <div style={{
      position: 'fixed', left: 848160, bottom: 8, zIndex: 543,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a1a2e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,20,60,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 13 }}>◈ IPINVSC</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>IntelProfile × Investment × Scenario Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#fb923c', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'PROFILES', val: profiles.length, color: '#e2e8f0' },
          { label: 'INVESTMENTS', val: investments.length, color: '#facc15' },
          { label: 'SCENARIOS', val: scenarios.length, color: '#a78bfa' },
          { label: 'FULLY PROFILED', val: counts.FULLY_PROFILED, color: '#fb923c', badge: counts.FULLY_PROFILED > 0 },
          { label: 'INVEST-LINKED', val: counts.INVEST_LINKED, color: '#facc15' },
          { label: 'SCEN-TRACKED', val: counts.SCENARIO_TRACKED, color: '#a78bfa' },
          { label: 'DARK', val: counts.DARK, color: '#475569', badge: counts.DARK > 0 },
          { label: 'PROFILED %', val: `${profiledPct}%`, color: '#fb923c' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          <div style={{ width: `${profiledPct}%`, background: '#fb923c' }} title={`FULLY PROFILED ${profiledPct}%`} />
          <div style={{ width: `${investPct}%`, background: '#facc15' }} title={`INVEST-LINKED ${investPct}%`} />
          <div style={{ width: `${scenPct}%`, background: '#a78bfa' }} title={`SCENARIO-TRACKED ${scenPct}%`} />
          <div style={{ width: `${darkPct}%`, background: '#1e293b' }} title={`DARK ${darkPct}%`} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#64748b' }}>
          <span style={{ color: '#fb923c' }}>■ PROFILED {profiledPct}%</span>
          <span style={{ color: '#facc15' }}>■ INVEST {investPct}%</span>
          <span style={{ color: '#a78bfa' }}>■ SCENARIO {scenPct}%</span>
          <span>■ DARK {darkPct}%</span>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY_PROFILED', 'INVEST_LINKED', 'SCENARIO_TRACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1e293b' : 'none', border: `1px solid ${filter === f ? '#334155' : '#1e293b'}`,
            color: filter === f ? '#e2e8f0' : '#64748b', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 10,
          }}>{f.replace(/_/g, ' ')}{f !== 'ALL' ? ` (${counts[f] ?? 0})` : ` (${classified.length})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search profiles…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 160 }} />
      </div>

      {/* Profile list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px' }}>
        {visible.slice(0, 120).map(p => (
          <div key={p.id}>
            <div onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0f172a', cursor: 'pointer' }}>
              <span style={{ color: STATE_COLOR[p.state], fontSize: 10, fontWeight: 700, minWidth: 120 }}>{p.state.replace(/_/g, ' ')}</span>
              <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
              {p.role && <span style={{ color: '#64748b', fontSize: 10 }}>{p.role}</span>}
              <span style={{ color: '#475569', fontSize: 10 }}>{p.matchedInvestments.length}INV / {p.matchedScenarios.length}SC</span>
              <span style={{ color: '#334155', fontSize: 11 }}>{expanded === p.id ? '▲' : '▼'}</span>
            </div>
            {expanded === p.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0 8px 16px' }}>
                <div>
                  <div style={{ color: '#facc15', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>INVESTMENTS ({p.matchedInvestments.length})</div>
                  {p.matchedInvestments.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no investment linkage detected</div>}
                  {p.matchedInvestments.slice(0, 8).map(inv => (
                    <div key={inv.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{inv.label}</span>
                        {inv.sector && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{inv.sector}</span>}
                        {inv.ticker && <span style={{ color: '#facc15', fontSize: 9, border: '1px solid #854d0e', borderRadius: 3, padding: '0 4px' }}>{inv.ticker}</span>}
                      </div>
                      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '100%' }}>
                        <div style={{ height: '100%', background: '#facc15', borderRadius: 2, width: `${Math.round(inv.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SCENARIOS ({p.matchedScenarios.length})</div>
                  {p.matchedScenarios.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no scenario modeling detected</div>}
                  {p.matchedScenarios.slice(0, 8).map(s => (
                    <div key={s.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{s.label}</span>
                        {s.status && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{s.status}</span>}
                        {s.category && <span style={{ color: '#a78bfa', fontSize: 9, border: '1px solid #4c1d95', borderRadius: 3, padding: '0 4px' }}>{s.category}</span>}
                      </div>
                      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '100%' }}>
                        <div style={{ height: '100%', background: '#a78bfa', borderRadius: 2, width: `${Math.round(s.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', padding: '20px 0', textAlign: 'center', fontSize: 12 }}>No profiles match current filter</div>
        )}
      </div>

      {/* ASSESS */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#1e293b' : '#431407', border: '1px solid #9a3412', color: '#fb923c',
          borderRadius: 5, padding: '4px 16px', cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700,
        }}>{assessing ? 'ASSESSING…' : 'ASSESS'}</button>
        {assessment && <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>{assessment}</div>}
      </div>
    </div>
  );
}
