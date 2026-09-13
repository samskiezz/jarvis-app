import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJKSTRI_RE = /\b(sjkstri|swarm[_\s-]?knowledge[_\s-]?scenario|swarm[_\s-]?job[_\s-]?knowledge[_\s-]?scenario|swarm[_\s-]?kb[_\s-]?scenario|knowledge[_\s-]?scenario[_\s-]?swarm|scenario[_\s-]?knowledge[_\s-]?swarm|fully[_\s-]?prepared[_\s-]?swarm|dark[_\s-]?swarm|swarm[_\s-]?readiness|scripted[_\s-]?swarm|swarm[_\s-]?scenario[_\s-]?knowledge)\b/i;

export function isSjkstriQuery(t) { return SJKSTRI_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const k of ['results', 'items', 'data', 'jobs', 'records', 'list', 'entries']) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function normJobs(raw) {
  return normaliseArray(raw).map(j => ({
    id: j.id || j._id || j.job_id || String(Math.random()),
    name: j.name || j.title || j.job_name || j.label || j.id || 'Unnamed Job',
    desc: [j.description, j.objective, j.goal, j.summary, j.type, j.status].filter(Boolean).join(' '),
  }));
}

function normKb(raw) {
  return normaliseArray(raw).map(a => ({
    id: a.id || a._id || String(Math.random()),
    text: [a.title, a.name, a.content, a.summary, a.body, a.tags].filter(Boolean).join(' '),
  }));
}

function normScenarios(raw) {
  return normaliseArray(raw).map(s => ({
    id: s.id || s._id || s.scenario_id || String(Math.random()),
    text: [s.name, s.title, s.description, s.objective, s.tags, s.steps].filter(Boolean).join(' '),
  }));
}

function matchScore(jobToks, fields) {
  if (!jobToks.length) return 0;
  const fToks = new Set(tok(fields));
  const hits = jobToks.filter(t => fToks.has(t)).length;
  return hits / jobToks.length;
}

const THRESHOLD = 0.1;

function correlate(jobs, articles, scenarios) {
  return jobs.map(j => {
    const jToks = tok(`${j.name} ${j.desc}`);
    const bestKb = articles.reduce((best, a) => {
      const s = matchScore(jToks, a.text);
      return s > best.score ? { score: s, item: a } : best;
    }, { score: 0, item: null });
    const bestScen = scenarios.reduce((best, s) => {
      const sc = matchScore(jToks, s.text);
      return sc > best.score ? { score: sc, item: s } : best;
    }, { score: 0, item: null });
    const hasKb = bestKb.score >= THRESHOLD;
    const hasScen = bestScen.score >= THRESHOLD;
    const state = hasKb && hasScen ? 'FULLY PREPARED'
      : hasKb ? 'KB-ONLY'
      : hasScen ? 'SCRIPTED'
      : 'DARK';
    return { ...j, state, kbScore: bestKb.score, scenScore: bestScen.score };
  });
}

export async function buildSjkstriScript() {
  const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}` };
  const [jR, kR, sR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
  ]);
  const jobs = normJobs(jR.status === 'fulfilled' ? jR.value : []);
  const articles = normKb(kR.status === 'fulfilled' ? kR.value : []);
  const scenarios = normScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const rows = correlate(jobs, articles, scenarios);
  const fp = rows.filter(r => r.state === 'FULLY PREPARED').length;
  const kb = rows.filter(r => r.state === 'KB-ONLY').length;
  const sc = rows.filter(r => r.state === 'SCRIPTED').length;
  const dk = rows.filter(r => r.state === 'DARK').length;
  return `SJKSTRI SwarmJob × Knowledge × Scenario: ${jobs.length} swarm jobs cross-referenced against ${articles.length} KB articles and ${scenarios.length} scenario playbooks. ` +
    `FULLY PREPARED: ${fp} (KB-backed + scenario-covered — job has both knowledge and operational planning). ` +
    `KB-ONLY: ${kb} (knowledge article found, no scenario playbook). ` +
    `SCRIPTED: ${sc} (scenario match found, no KB article). ` +
    `DARK: ${dk} (no KB or scenario coverage — automation without knowledge or planning support).`;
}

const TILE = {
  flex: '1 1 120px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
};
const LBL = { fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY PREPARED': '#22d3ee',
  'KB-ONLY': '#34d399',
  'SCRIPTED': '#a78bfa',
  'DARK': '#f59e0b',
};
const STATE_ORDER = ['FULLY PREPARED', 'KB-ONLY', 'SCRIPTED', 'DARK'];

export default function SwarmJobKnowledgeScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [articles, setArticles] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}` };
    const [jR, kR, sR] = await Promise.allSettled([
      fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const jobs = normJobs(jR.status === 'fulfilled' ? jR.value : []);
    const arts = normKb(kR.status === 'fulfilled' ? kR.value : []);
    const scens = normScenarios(sR.status === 'fulfilled' ? sR.value : []);
    setArticles(arts);
    setScenarios(scens);
    setRows(correlate(jobs, arts, scens));
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:sjkstri-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjkstri-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    const fp = rows.filter(r => r.state === 'FULLY PREPARED').length;
    const dk = rows.filter(r => r.state === 'DARK').length;
    const summary = `SJKSTRI: ${rows.length} swarm jobs. FULLY PREPARED: ${fp}. KB-ONLY: ${rows.filter(r => r.state === 'KB-ONLY').length}. SCRIPTED: ${rows.filter(r => r.state === 'SCRIPTED').length}. DARK (critical gap — no KB or scenario): ${dk}. ${articles.length} KB articles, ${scenarios.length} scenarios indexed.`;
    setAssessing(true);
    try {
      const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: `Assess this SJKSTRI swarm job knowledge and scenario readiness state. Identify the two highest-priority dark swarm jobs that need KB articles or scenario playbooks to be operational: ${summary}` }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: summary } }));
    }
    setAssessing(false);
  }, [rows, articles, scenarios, assessing]);

  const dark = rows.filter(r => r.state === 'DARK').length;
  const fp = rows.filter(r => r.state === 'FULLY PREPARED').length;
  const visible = rows
    .filter(r => filter === 'ALL' || r.state === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const pct = rows.length ? Math.round((fp / rows.length) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: 'fixed', left: 767520, bottom: 8, zIndex: 399,
          background: dark > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(34,211,238,0.12)',
          border: `1px solid ${dark > 0 ? 'rgba(245,158,11,0.5)' : 'rgba(34,211,238,0.35)'}`,
          color: dark > 0 ? '#f59e0b' : '#22d3ee', borderRadius: 6, padding: '3px 9px',
          fontSize: 10, letterSpacing: 1.5, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ SJKSTRI{dark > 0 ? ` ⚠${dark}` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 9999, width: 700, maxHeight: 620,
      background: 'rgba(10,14,28,0.97)', border: '1px solid rgba(34,211,238,0.25)',
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", color: '#e2e8f0',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: '#22d3ee', flex: 1 }}>◈ SWARMJOB × KNOWLEDGE × SCENARIO</span>
        {loading && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>LOADING…</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
      </div>

      {/* Stat Tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => {
          const count = rows.filter(r => r.state === s).length;
          return (
            <div key={s} style={{ ...TILE, borderColor: count > 0 ? `${STATE_COLOR[s]}40` : 'rgba(255,255,255,0.07)' }}>
              <div style={LBL}>{s}</div>
              <div style={{ ...VAL, color: STATE_COLOR[s] }}>{count}</div>
            </div>
          );
        })}
        <div style={TILE}>
          <div style={LBL}>KB ARTICLES</div>
          <div style={VAL}>{articles.length}</div>
        </div>
        <div style={TILE}>
          <div style={LBL}>SCENARIOS</div>
          <div style={VAL}>{scenarios.length}</div>
        </div>
      </div>

      {/* Coverage Bar */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: 1 }}>
          {pct}% FULLY PREPARED · {articles.length} KB articles · {scenarios.length} scenarios
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === s ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: filter === s ? '#22d3ee' : 'rgba(255,255,255,0.5)',
            borderRadius: 4, padding: '3px 8px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
          }}>{s} {s !== 'ALL' ? `(${rows.filter(r => r.state === s).length})` : `(${rows.length})`}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search jobs…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '5px 10px', color: '#e2e8f0', fontSize: 10, letterSpacing: 1,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {visible.slice(0, 80).map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{
              fontSize: 8, letterSpacing: 1, color: STATE_COLOR[r.state],
              background: `${STATE_COLOR[r.state]}18`, borderRadius: 3, padding: '2px 5px',
              whiteSpace: 'nowrap', minWidth: 90, textAlign: 'center',
            }}>{r.state}</span>
            <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(r.kbScore * 100)}%`, background: '#34d399' }} />
              </div>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(r.scenScore * 100)}%`, background: '#a78bfa' }} />
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '20px 0', textAlign: 'center' }}>no jobs match</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={load} disabled={loading} style={{
          background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
          color: '#22d3ee', borderRadius: 4, padding: '4px 12px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
        }}>↺ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(255,255,255,0.05)' : 'rgba(34,211,238,0.14)',
          border: '1px solid rgba(34,211,238,0.35)', color: assessing ? 'rgba(255,255,255,0.3)' : '#22d3ee',
          borderRadius: 4, padding: '4px 12px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
        }}>{assessing ? '…' : '▶ ASSESS'}</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
          {rows.length} jobs · /entities/SwarmJob × /knowledge/ × /v1/scenario/list
        </span>
      </div>
    </div>
  );
}
