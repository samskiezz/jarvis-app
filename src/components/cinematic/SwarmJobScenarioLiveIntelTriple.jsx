import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 60000;

const SJSCLI_RE = /\b(sjscli|swarm[._-]?job[._-]?scenario[._-]?live|swarm[._-]?scenario[._-]?live|swarm[._-]?live[._-]?scenario|armed[._-]?swarm[._-]?scenario|dormant[._-]?swarm[._-]?live|scenario[._-]?live[._-]?swarm|swarm[._-]?job[._-]?live[._-]?scenario)\b/i;
export function isSjscliQuery(t) { return SJSCLI_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}
function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bTokens.length);
}
const THRESHOLD = 0.07;
const COV = {
  FULLY_ARMED: 'FULLY_ARMED',
  SCENARIO_READY: 'SCENARIO_READY',
  LIVE_TRIGGERED: 'LIVE_TRIGGERED',
  DORMANT: 'DORMANT',
};

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  const first = Object.values(raw).find(v => Array.isArray(v));
  return first || [];
}

function classifySwarmJob(swarmTokens, scenarios, liveItems) {
  const scenarioScore = scenarios.reduce((best, sc) => {
    const scTokens = tok([sc.name, sc.title, sc.description, sc.type].join(' '));
    return Math.max(best, matchScore(swarmTokens, scTokens));
  }, 0);
  const liveScore = liveItems.reduce((best, li) => {
    const liTokens = tok([li.title, li.summary, li.description, li.content, li.text].join(' '));
    return Math.max(best, matchScore(swarmTokens, liTokens));
  }, 0);
  const hasScenario = scenarioScore >= THRESHOLD;
  const hasLive = liveScore >= THRESHOLD;
  if (hasScenario && hasLive) return { cov: COV.FULLY_ARMED, scenarioScore, liveScore };
  if (hasScenario) return { cov: COV.SCENARIO_READY, scenarioScore, liveScore };
  if (hasLive) return { cov: COV.LIVE_TRIGGERED, scenarioScore, liveScore };
  return { cov: COV.DORMANT, scenarioScore, liveScore };
}

export async function buildSjscliScript() {
  const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  try {
    const [swarmRes, scenarioRes, liveRes] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`, { headers: hdrs }),
      fetch(`${API}/v1/scenario/list`, { headers: hdrs }),
      fetch(`${API}/functions/getLiveIntel`, { headers: hdrs }),
    ]);
    const [swarmRaw, scenarioRaw, liveRaw] = await Promise.all([
      swarmRes.ok ? swarmRes.json() : {},
      scenarioRes.ok ? scenarioRes.json() : {},
      liveRes.ok ? liveRes.json() : {},
    ]);
    const swarmJobs = normaliseArray(swarmRaw, 'items', 'data', 'results', 'swarm_jobs', 'jobs');
    const scenarios = normaliseArray(scenarioRaw, 'items', 'data', 'results', 'scenarios');
    const liveItems = normaliseArray(liveRaw, 'items', 'data', 'results', 'intel', 'signals');
    const enriched = swarmJobs.map(job => {
      const swarmTokens = tok([job.name, job.title, job.description, job.type, job.status, job.objective].join(' '));
      return { ...job, ...classifySwarmJob(swarmTokens, scenarios, liveItems) };
    });
    const armed = enriched.filter(j => j.cov === COV.FULLY_ARMED).length;
    const ready = enriched.filter(j => j.cov === COV.SCENARIO_READY).length;
    const live = enriched.filter(j => j.cov === COV.LIVE_TRIGGERED).length;
    const dormant = enriched.filter(j => j.cov === COV.DORMANT).length;
    return `SWARM JOB — SCENARIO — LIVE INTEL TRIPLE COVERAGE REPORT. ${swarmJobs.length} swarm jobs cross-referenced against ${scenarios.length} scenarios and ${liveItems.length} live intel signals. FULLY ARMED: ${armed} jobs with both scenario and live coverage. SCENARIO READY: ${ready} jobs with scenario coverage only. LIVE TRIGGERED: ${live} jobs with live intel only. DORMANT: ${dormant} jobs with no coverage. ${armed > 0 ? `Top armed jobs are ready for immediate activation.` : `No jobs are fully armed — scenario or live intel gaps detected.`} Recommend reviewing dormant swarm jobs for scenario alignment.`;
  } catch {
    return 'SJSCLI triple coverage check failed. Verify SwarmJob, scenario, and live intel endpoints.';
  }
}

const COV_COLOUR = {
  [COV.FULLY_ARMED]: '#00ffcc',
  [COV.SCENARIO_READY]: '#7bd4ff',
  [COV.LIVE_TRIGGERED]: '#ffd700',
  [COV.DORMANT]: '#555',
};

export default function SwarmJobScenarioLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [swarmJobs, setSwarmJobs] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessText, setAssessText] = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [swarmRes, scenarioRes, liveRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`, { headers: hdrs }),
        fetch(`${API}/v1/scenario/list`, { headers: hdrs }),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdrs }),
      ]);
      const [swarmRaw, scenarioRaw, liveRaw] = await Promise.all([
        swarmRes.ok ? swarmRes.json() : {},
        scenarioRes.ok ? scenarioRes.json() : {},
        liveRes.ok ? liveRes.json() : {},
      ]);
      const jobs = normaliseArray(swarmRaw, 'items', 'data', 'results', 'swarm_jobs', 'jobs');
      const scs = normaliseArray(scenarioRaw, 'items', 'data', 'results', 'scenarios');
      const live = normaliseArray(liveRaw, 'items', 'data', 'results', 'intel', 'signals');
      setSwarmJobs(jobs);
      setScenarios(scs);
      setLiveItems(live);
      const enr = jobs.map(job => {
        const swarmTokens = tok([job.name, job.title, job.description, job.type, job.status, job.objective].join(' '));
        return { ...job, ...classifySwarmJob(swarmTokens, scs, live) };
      });
      setEnriched(enr);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener('jarvis:sjscli-toggle', handler);
    return () => window.removeEventListener('jarvis:sjscli-toggle', handler);
  }, []);

  const assess = async (job) => {
    setAssessing(true);
    setAssessText('');
    setExpanded(job.id || job.name);
    try {
      const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const prompt = `Assess swarm job: ${job.name || job.title || JSON.stringify(job).slice(0, 200)}. Coverage: ${job.cov}. Scenario score: ${(job.scenarioScore * 100).toFixed(0)}%. Live score: ${(job.liveScore * 100).toFixed(0)}%. Be brief and tactical.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        setAssessText(d.response || d.message || d.text || JSON.stringify(d).slice(0, 300));
      } else {
        setAssessText('Assessment unavailable.');
      }
    } catch {
      setAssessText('Assessment failed.');
    } finally {
      setAssessing(false);
    }
  };

  const speak = (text) => {
    const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
    fetch(`${API}/v1/voice/tts`, { method: 'POST', headers: hdrs, body: JSON.stringify({ text }) }).catch(() => {});
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  };

  const visible = enriched.filter(j => {
    if (filter !== 'ALL' && j.cov !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (j.name || j.title || '').toLowerCase().includes(q);
    }
    return true;
  });

  const armed = enriched.filter(j => j.cov === COV.FULLY_ARMED).length;
  const dormant = enriched.filter(j => j.cov === COV.DORMANT).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 877840, bottom: 8, zIndex: 576,
          background: 'rgba(0,20,30,0.85)', border: '1px solid #0ff3',
          color: armed > 0 ? '#00ffcc' : '#888', padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', borderRadius: 3,
          fontFamily: 'monospace', letterSpacing: 1,
        }}
        title="SwarmJob × Scenario × Live Intel Triple Coverage"
      >
        ◈ SJSCLI{armed > 0 ? ` [${armed}]` : dormant > 0 ? ` ·${dormant}` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 877840, bottom: 36, zIndex: 576,
      width: 360, maxHeight: 520,
      background: 'rgba(0,12,20,0.97)', border: '1px solid #0ff4',
      borderRadius: 6, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 11, color: '#cce',
      boxShadow: '0 0 18px #00ffcc22',
    }}>
      {/* Header */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#00ffcc', fontWeight: 700, letterSpacing: 1 }}>◈ SJSCLI TRIPLE</span>
        <span style={{ color: '#888', fontSize: 10 }}>
          {swarmJobs.length}J · {scenarios.length}S · {liveItems.length}L
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      {/* Coverage badges */}
      <div style={{ padding: '4px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #0ff1' }}>
        {Object.values(COV).map(c => {
          const cnt = enriched.filter(j => j.cov === c).length;
          return (
            <button key={c} onClick={() => setFilter(filter === c ? 'ALL' : c)}
              style={{
                padding: '2px 6px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                background: filter === c ? COV_COLOUR[c] + '33' : 'transparent',
                border: `1px solid ${COV_COLOUR[c]}66`,
                color: COV_COLOUR[c],
              }}>
              {c.replace(/_/g, ' ')} {cnt}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '4px 10px', borderBottom: '1px solid #0ff1' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter jobs…"
          style={{ width: '100%', background: '#001418', border: '1px solid #0ff3', color: '#cce', padding: '2px 6px', fontSize: 10, borderRadius: 3, boxSizing: 'border-box' }}
        />
      </div>

      {/* Job list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 10, color: '#888' }}>Loading…</div>}
        {!loading && visible.length === 0 && <div style={{ padding: 10, color: '#555' }}>No swarm jobs.</div>}
        {visible.map((job, i) => {
          const key = job.id || job.name || i;
          const isExp = expanded === key;
          return (
            <div key={key} style={{ borderBottom: '1px solid #0ff1', padding: '5px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpanded(isExp ? null : key)}>
                <span style={{ color: COV_COLOUR[job.cov], fontWeight: 600, fontSize: 10 }}>
                  {job.name || job.title || `Job #${i + 1}`}
                </span>
                <span style={{ color: COV_COLOUR[job.cov], fontSize: 9 }}>{job.cov.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ color: '#556', fontSize: 9, marginTop: 2 }}>
                SC: {(job.scenarioScore * 100).toFixed(0)}% · LI: {(job.liveScore * 100).toFixed(0)}%
                {job.status ? ` · ${job.status}` : ''}
              </div>
              {isExp && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid #0ff1' }}>
                  {job.description && <div style={{ color: '#99b', fontSize: 9, marginBottom: 4 }}>{String(job.description).slice(0, 180)}</div>}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => assess(job)}
                      style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                      ASSESS
                    </button>
                    <button onClick={() => speak(`Swarm job ${job.name || 'unknown'} coverage: ${job.cov.replace(/_/g, ' ')}`)}
                      style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                      SPEAK
                    </button>
                  </div>
                  {assessing && expanded === key && <div style={{ color: '#888', fontSize: 9, marginTop: 3 }}>Assessing…</div>}
                  {assessText && expanded === key && <div style={{ color: '#aee', fontSize: 9, marginTop: 3, maxHeight: 80, overflowY: 'auto' }}>{assessText}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '4px 10px', borderTop: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#556' }}>
        <span>ARMED: <span style={{ color: '#00ffcc' }}>{armed}</span> · DORMANT: <span style={{ color: '#555' }}>{dormant}</span></span>
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#0ff7', cursor: 'pointer', fontSize: 9 }}>↻ REFRESH</button>
      </div>
    </div>
  );
}
