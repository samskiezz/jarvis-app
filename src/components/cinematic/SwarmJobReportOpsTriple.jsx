import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJROE_RE = /\b(sjroe|swarm\s+job\s+report\s+ops|swarm\s+report\s+ops|swarm\s+ops\s+report|swarm\s+job\s+ops\s+event\s+report|swarm\s+job\s+ops\s+report|swarm\s+report\s+event|swarm\s+ops\s+coverage|untracked\s+swarm|swarm\s+documentation\s+gap|swarm\s+report\s+ops\s+event|swarm\s+intel\s+ops)\b/i;
const THRESHOLD = 0.07;

export function isSjroeQuery(t) {
  return SJROE_RE.test(t || '');
}

export async function buildSjroeScript() {
  try {
    const [jobRes, repRes, opsRes] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const jobs = normaliseJobs(jobRes);
    const reports = normaliseReports(repRes);
    const events = normaliseOps(opsRes);
    const classified = jobs.map(j => classifyJob(j, reports, events));
    const fullyTracked = classified.filter(j => j.state === 'FULLY_TRACKED').length;
    const untracked = classified.filter(j => j.state === 'UNTRACKED').length;
    return `SJROE analysis: ${jobs.length} swarm jobs cross-referenced against ${reports.length} intelligence reports and ${events.length} ops events. ${fullyTracked} jobs are FULLY TRACKED — both documentary intelligence backing and operational event coverage confirmed. ${untracked} jobs are UNTRACKED — no report or ops event coverage detected, representing automation intelligence gaps requiring immediate documentation and operational monitoring.`;
  } catch {
    return 'SJROE data unavailable — check /entities/SwarmJob, /v1/reports, and /v1/ops/events endpoints.';
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

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((j, i) => ({
    id: j.id || j._id || `job-${i}`,
    label: j.name || j.title || j.job_name || `SwarmJob ${i + 1}`,
    kind: j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    target: j.target || j.domain || j.description || '',
    _searchText: [j.name, j.title, j.job_name, j.kind, j.type, j.description, j.target, j.domain, j.tags].filter(Boolean).join(' '),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || `rep-${i}`,
    label: r.title || r.name || r.report_name || `Report ${i + 1}`,
    type: r.type || r.report_type || r.category || '',
    _text: [r.title, r.name, r.summary, r.type, r.category, r.tags].filter(Boolean).join(' '),
  }));
}

function normaliseOps(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => ({
    id: e.id || e._id || `ops-${i}`,
    label: e.name || e.title || e.event_name || `Event ${i + 1}`,
    severity: e.severity || e.level || e.priority || '',
    type: e.type || e.event_type || e.category || '',
    _text: [e.name, e.title, e.description, e.type, e.category, e.severity, e.tags].filter(Boolean).join(' '),
  }));
}

function classifyJob(job, reports, events) {
  const toks = tok(job._searchText);
  const repMatches = reports
    .map(r => ({ ...r, score: matchScore(toks, r._text) }))
    .filter(r => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const opsMatches = events
    .map(e => ({ ...e, score: matchScore(toks, e._text) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasRep = repMatches.length > 0;
  const hasOps = opsMatches.length > 0;
  const state = hasRep && hasOps ? 'FULLY_TRACKED'
    : hasRep ? 'REPORT_BACKED'
    : hasOps ? 'OPS_TRIGGERED'
    : 'UNTRACKED';
  return { ...job, state, repMatches, opsMatches };
}

const STATE_LABELS = {
  ALL: 'ALL',
  FULLY_TRACKED: '◉ FULLY TRACKED',
  REPORT_BACKED: '◎ REPORT-BACKED',
  OPS_TRIGGERED: '◈ OPS-TRIGGERED',
  UNTRACKED: '○ UNTRACKED',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: '#1e293b', marginTop: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
  );
}

export default function SwarmJobReportOpsTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [reports, setReports] = useState([]);
  const [events, setEvents] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [jobRes, repRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const j = normaliseJobs(jobRes);
      const r = normaliseReports(repRes);
      const e = normaliseOps(opsRes);
      setJobs(j); setReports(r); setEvents(e);
      setClassified(j.map(job => classifyJob(job, r, e)));
    } catch (err) {
      setError('Fetch failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        if (!o) fetchAll();
        return !o;
      });
    };
    window.addEventListener('jarvis:sjroe-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjroe-toggle', toggle);
  }, [fetchAll]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  const counts = {
    FULLY_TRACKED: classified.filter(j => j.state === 'FULLY_TRACKED').length,
    REPORT_BACKED: classified.filter(j => j.state === 'REPORT_BACKED').length,
    OPS_TRIGGERED: classified.filter(j => j.state === 'OPS_TRIGGERED').length,
    UNTRACKED: classified.filter(j => j.state === 'UNTRACKED').length,
  };

  const visible = classified.filter(j => {
    if (filter !== 'ALL' && j.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return j._searchText.toLowerCase().includes(q) || j.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `SJROE SwarmJob × Report × Ops Event Triple Coverage: ${jobs.length} swarm jobs cross-referenced against ${reports.length} intelligence reports and ${events.length} ops events. Coverage: FULLY_TRACKED=${counts.FULLY_TRACKED}, REPORT_BACKED=${counts.REPORT_BACKED}, OPS_TRIGGERED=${counts.OPS_TRIGGERED}, UNTRACKED=${counts.UNTRACKED}. In 2 sentences, assess swarm automation documentation and operational coverage posture, identifying the most critical untracked jobs that lack both intelligence report backing and ops event monitoring.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const trackedPct = classified.length ? Math.round((counts.FULLY_TRACKED / classified.length) * 100) : 0;
  const repPct = classified.length ? Math.round((counts.REPORT_BACKED / classified.length) * 100) : 0;
  const opsPct = classified.length ? Math.round((counts.OPS_TRIGGERED / classified.length) * 100) : 0;
  const untrackedPct = classified.length ? Math.round((counts.UNTRACKED / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 849280, bottom: 8, zIndex: 545,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #78350f',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(120,53,15,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 13 }}>◈ SJROE</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>SwarmJob × Report × Ops Event Triple Coverage</span>
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
          { label: 'SWARM JOBS', val: jobs.length, color: '#e2e8f0' },
          { label: 'REPORTS', val: reports.length, color: '#22d3ee' },
          { label: 'OPS EVENTS', val: events.length, color: '#f97316' },
          { label: 'FULLY TRACKED', val: counts.FULLY_TRACKED, color: '#4ade80', badge: counts.FULLY_TRACKED > 0 },
          { label: 'REPORT-BACKED', val: counts.REPORT_BACKED, color: '#22d3ee' },
          { label: 'OPS-TRIGGERED', val: counts.OPS_TRIGGERED, color: '#f97316' },
          { label: 'UNTRACKED', val: counts.UNTRACKED, color: '#fbbf24', badge: counts.UNTRACKED > 0 },
          { label: 'TRACKED %', val: `${trackedPct}%`, color: '#4ade80' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#4ade80' }}>{trackedPct}% fully tracked</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {trackedPct > 0 && <div style={{ width: `${trackedPct}%`, background: '#4ade80' }} />}
          {repPct > 0 && <div style={{ width: `${repPct}%`, background: '#22d3ee' }} />}
          {opsPct > 0 && <div style={{ width: `${opsPct}%`, background: '#f97316' }} />}
          {untrackedPct > 0 && <div style={{ width: `${untrackedPct}%`, background: '#78350f' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#4ade80' }}>● FULLY TRACKED</span>
          <span style={{ color: '#22d3ee' }}>● REPORT-BACKED</span>
          <span style={{ color: '#f97316' }}>● OPS-TRIGGERED</span>
          <span style={{ color: '#78350f' }}>● UNTRACKED</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_TRACKED', 'REPORT_BACKED', 'OPS_TRIGGERED', 'UNTRACKED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#431407' : '#0f172a',
            border: `1px solid ${filter === f ? '#fb923c' : '#1e293b'}`,
            color: filter === f ? '#fed7aa' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No swarm jobs match current filter.</div>
        )}
        {visible.map(j => {
          const stateColor = j.state === 'FULLY_TRACKED' ? '#4ade80'
            : j.state === 'REPORT_BACKED' ? '#22d3ee'
            : j.state === 'OPS_TRIGGERED' ? '#f97316'
            : '#fbbf24';
          const isExp = expanded === j.id;
          return (
            <div key={j.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#78350f' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : j.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 180 }}>{STATE_LABELS[j.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{j.label}</span>
                {j.kind && <span style={{ background: '#0f172a', color: '#c084fc', border: '1px solid #3b0764', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{j.kind}</span>}
                {j.status && <span style={{ background: '#0f172a', color: '#22d3ee', border: '1px solid #164e63', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{j.status}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {j.target && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, marginTop: 6 }}>{j.target.slice(0, 180)}{j.target.length > 180 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Reports pane */}
                    <div>
                      <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>INTELLIGENCE REPORTS ({j.repMatches.length})</div>
                      {j.repMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No report coverage</div>
                        : j.repMatches.slice(0, 6).map(r => (
                          <div key={r.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#67e8f9', fontSize: 11 }}>{r.label.slice(0, 42)}{r.label.length > 42 ? '…' : ''}</span>
                              {r.type && <span style={{ background: '#083344', color: '#22d3ee', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{r.type}</span>}
                            </div>
                            <ScoreBar score={r.score} color="#22d3ee" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Ops Events pane */}
                    <div>
                      <div style={{ color: '#f97316', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>OPS EVENTS ({j.opsMatches.length})</div>
                      {j.opsMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No ops event coverage</div>
                        : j.opsMatches.slice(0, 6).map(e => (
                          <div key={e.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#fdba74', fontSize: 11 }}>{e.label.slice(0, 42)}{e.label.length > 42 ? '…' : ''}</span>
                              {e.severity && <span style={{ background: '#431407', color: '#f97316', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{e.severity}</span>}
                            </div>
                            <ScoreBar score={e.score} color="#f97316" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#431407', border: '1px solid #fb923c',
            color: assessing ? '#475569' : '#fed7aa', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
