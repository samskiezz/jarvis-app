import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCSITR_RE = /\b(gcsitr|graph\s+community\s+scenario\s+invest|community\s+scenario\s+invest|graph\s+scenario\s+investigation|community\s+scenario\s+investigation|graph\s+community\s+scenario|community\s+investigation\s+scenario|scenario\s+investigation\s+community|untracked\s+community|community\s+scenario\s+gap|graph\s+scenario\s+gap|community\s+fully\s+tracked)\b/i;
export function isGcsitrQuery(t) { return GCSITR_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.communities) ? raw.communities
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c.community_id || String(i),
    label: c.label || c.name || c.title || `Community ${i + 1}`,
    size: c.size || c.node_count || c.members || 0,
    desc: [c.label, c.name, c.title, c.description, c.type, c.category, c.theme].filter(Boolean).join(' '),
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.scenarios) ? raw.scenarios
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || String(i),
    text: [s.name, s.title, s.description, s.category, s.type, s.tags, s.threat_actor, s.scenario_type].filter(Boolean).join(' '),
    label: s.name || s.title || `Scenario ${i + 1}`,
    category: s.category || s.type || s.scenario_type || '',
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.investigations) ? raw.investigations
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || String(i),
    text: [inv.name, inv.title, inv.description, inv.category, inv.status, inv.type, inv.tags, inv.subject].filter(Boolean).join(' '),
    label: inv.name || inv.title || `Investigation ${i + 1}`,
    status: inv.status || inv.state || '',
  }));
}

function matchScore(communityToks, fieldText) {
  if (!communityToks.length) return 0;
  const fToks = new Set(tok(fieldText));
  let hits = 0;
  for (const t of communityToks) if (fToks.has(t)) hits++;
  return hits / communityToks.length;
}

const THRESHOLD = 0.08;

function correlate(communities, scenarios, investigations) {
  return communities.map(comm => {
    const toks = tok(comm.desc);
    let bestScenario = null, scenarioScore = 0;
    for (const sc of scenarios) {
      const s = matchScore(toks, sc.text);
      if (s > scenarioScore) { scenarioScore = s; bestScenario = sc; }
    }
    let bestInvest = null, investScore = 0;
    for (const inv of investigations) {
      const s = matchScore(toks, inv.text);
      if (s > investScore) { investScore = s; bestInvest = inv; }
    }
    const hasScenario = scenarioScore >= THRESHOLD;
    const hasInvest = investScore >= THRESHOLD;
    let state;
    if (hasScenario && hasInvest) state = 'FULLY TRACKED';
    else if (hasScenario) state = 'SCENARIO-ONLY';
    else if (hasInvest) state = 'INVESTIGATION-ONLY';
    else state = 'UNTRACKED';
    return { ...comm, state, bestScenario, scenarioScore, bestInvest, investScore };
  });
}

export async function buildGcsitrScript() {
  const key = (typeof localStorage !== 'undefined' && localStorage.getItem('jarvis_api_key')) || 'dev-key';
  const h = { Authorization: `Bearer ${key}` };
  const base = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
  const [gcRes, scRes, invRes] = await Promise.allSettled([
    fetch(`${base}/v1/graph/communities`, { headers: h }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()),
    fetch(`${base}/v1/investigations`, { headers: h }).then(r => r.json()),
  ]);
  const comms = normaliseCommunities(gcRes.status === 'fulfilled' ? gcRes.value : null);
  const scenarios = normaliseScenarios(scRes.status === 'fulfilled' ? scRes.value : []);
  const investigations = normaliseInvestigations(invRes.status === 'fulfilled' ? invRes.value : []);
  const rows = correlate(comms, scenarios, investigations);
  const tracked = rows.filter(r => r.state === 'FULLY TRACKED').length;
  const untracked = rows.filter(r => r.state === 'UNTRACKED').length;
  return `GCSITR: ${rows.length} graph communities cross-referenced against ${scenarios.length} scenarios and ${investigations.length} investigations. ${tracked} FULLY TRACKED (scenario + investigation coverage), ${untracked} UNTRACKED (no scenario or investigation match). ${tracked > 0 ? `${tracked} communit${tracked > 1 ? 'ies' : 'y'} have both scenario modelling and active investigation coverage — fully operationalised intelligence clusters.` : 'No communities are fully tracked.'} ${untracked > 0 ? `${untracked} communit${untracked > 1 ? 'ies' : 'y'} lack both scenario and investigation coverage — potential operational blind spots.` : 'All communities have at least scenario or investigation coverage.'}`;
}

const TILE = { background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 10px', textAlign: 'center', minWidth: 72 };
const LBL = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 };
const VAL = { fontSize: 18, fontWeight: 700, color: '#e2e8f0' };
const STATE_COLOR = { 'FULLY TRACKED': '#22d3ee', 'SCENARIO-ONLY': '#f59e0b', 'INVESTIGATION-ONLY': '#a78bfa', 'UNTRACKED': '#64748b' };
const STATE_ORDER = ['FULLY TRACKED', 'SCENARIO-ONLY', 'INVESTIGATION-ONLY', 'UNTRACKED'];

export default function GraphCommunityScenarioInvestTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const h = { Authorization: `Bearer ${key}` };
      const [gcRes, scRes, invRes] = await Promise.allSettled([
        fetch(`${API}/v1/graph/communities`, { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/investigations`, { headers: h }).then(r => r.json()),
      ]);
      const comms = normaliseCommunities(gcRes.status === 'fulfilled' ? gcRes.value : null);
      const scenarios = normaliseScenarios(scRes.status === 'fulfilled' ? scRes.value : []);
      const investigations = normaliseInvestigations(invRes.status === 'fulfilled' ? invRes.value : []);
      setRows(correlate(comms, scenarios, investigations));
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:gcsitr-toggle', handler);
    return () => window.removeEventListener('jarvis:gcsitr-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.label.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const tracked = rows.filter(r => r.state === 'FULLY TRACKED').length;
  const scenarioOnly = rows.filter(r => r.state === 'SCENARIO-ONLY').length;
  const investOnly = rows.filter(r => r.state === 'INVESTIGATION-ONLY').length;
  const untracked = rows.filter(r => r.state === 'UNTRACKED').length;

  const assess = async () => {
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `GCSITR graph community scenario investigation triple coverage: ${rows.length} communities, ${tracked} FULLY TRACKED, ${untracked} UNTRACKED. In 2 sentences, identify the highest-priority untracked community clusters and recommend immediate scenario modelling or investigation actions.` }),
      });
      const d = await r.json();
      const text = (d.answer || '').trim();
      if (text) {
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
        fetch(`${API}/v1/voice/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ text }) }).catch(() => {});
      }
    } catch {}
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × Scenario × Investigation Triple Coverage"
        style={{ position: 'fixed', left: 773120, bottom: 8, zIndex: 409, background: 'rgba(34,211,238,0.13)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 6, color: '#22d3ee', fontSize: 10, padding: '3px 7px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1 }}
      >
        ◈ GCSITR{untracked > 0 ? <span style={{ marginLeft: 4, background: '#f59e0b', color: '#000', borderRadius: 3, padding: '0 4px', fontWeight: 700 }}>{untracked}</span> : null}
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', left: 773120 > window.innerWidth - 420 ? window.innerWidth - 440 : 773120, bottom: 48, zIndex: 409, width: 420, maxHeight: '80vh', overflowY: 'auto', background: 'rgba(10,15,28,0.97)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 10, padding: 14, fontFamily: 'monospace', color: '#e2e8f0', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 12 }}>◈ GCSITR — Graph Community × Scenario × Investigation</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {[['COMMUNITIES', rows.length, '#e2e8f0'], ['TRACKED', tracked, '#22d3ee'], ['SCENARIO-ONLY', scenarioOnly, '#f59e0b'], ['INVEST-ONLY', investOnly, '#a78bfa'], ['UNTRACKED', untracked, '#64748b']].map(([l, v, c]) => (
          <div key={l} style={TILE}><div style={LBL}>{l}</div><div style={{ ...VAL, color: c }}>{v}</div></div>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 3 }}>FULLY TRACKED COVERAGE</div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((tracked / rows.length) * 100)}%`, background: 'linear-gradient(90deg,#22d3ee,#06b6d4)', borderRadius: 3, transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{Math.round((tracked / rows.length) * 100)}% tracked</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${filter === f ? '#22d3ee' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, color: filter === f ? '#22d3ee' : '#94a3b8', fontSize: 9, padding: '2px 6px', cursor: 'pointer' }}>{f}</button>
        ))}
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search communities…"
        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontSize: 10, padding: '4px 8px', marginBottom: 8, boxSizing: 'border-box' }}
      />

      {loading && <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>Loading…</div>}
      {err && <div style={{ color: '#f87171', fontSize: 10, marginBottom: 6 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '45vh', overflowY: 'auto' }}>
        {visible.map(row => (
          <div key={row.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px', borderLeft: `3px solid ${STATE_COLOR[row.state]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
              <span style={{ fontWeight: 600, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              <span style={{ fontSize: 9, background: `${STATE_COLOR[row.state]}22`, color: STATE_COLOR[row.state], borderRadius: 3, padding: '1px 5px', marginLeft: 6, whiteSpace: 'nowrap' }}>{row.state}</span>
              {row.size > 0 && <span style={{ fontSize: 9, color: '#64748b', marginLeft: 4 }}>{row.size}n</span>}
            </div>
            {expanded === row.id && (
              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 3 }}>SCENARIO</div>
                  {row.bestScenario ? (
                    <>
                      <div style={{ fontSize: 10, color: '#e2e8f0' }}>{row.bestScenario.label}</div>
                      {row.bestScenario.category && <div style={{ fontSize: 9, color: '#94a3b8' }}>{row.bestScenario.category}</div>}
                      <div style={{ height: 4, background: 'rgba(245,158,11,0.15)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.round(row.scenarioScore * 100))}%`, background: '#f59e0b', borderRadius: 2 }} />
                      </div>
                    </>
                  ) : <div style={{ fontSize: 9, color: '#64748b' }}>No match</div>}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#a78bfa', marginBottom: 3 }}>INVESTIGATION</div>
                  {row.bestInvest ? (
                    <>
                      <div style={{ fontSize: 10, color: '#e2e8f0' }}>{row.bestInvest.label}</div>
                      {row.bestInvest.status && <div style={{ fontSize: 9, color: '#94a3b8' }}>{row.bestInvest.status}</div>}
                      <div style={{ height: 4, background: 'rgba(167,139,250,0.15)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.round(row.investScore * 100))}%`, background: '#a78bfa', borderRadius: 2 }} />
                      </div>
                    </>
                  ) : <div style={{ fontSize: 9, color: '#64748b' }}>No match</div>}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && <div style={{ color: '#64748b', fontSize: 10 }}>No communities match filter.</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button onClick={assess} style={{ background: 'rgba(34,211,238,0.13)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 4, color: '#22d3ee', fontSize: 10, padding: '3px 10px', cursor: 'pointer' }}>ASSESS</button>
        <span style={{ fontSize: 9, color: '#475569' }}>{lastRefresh ? `refreshed ${lastRefresh}` : ''}</span>
        <button onClick={load} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '2px 8px', cursor: 'pointer' }}>↻</button>
      </div>
    </div>
  );
}
