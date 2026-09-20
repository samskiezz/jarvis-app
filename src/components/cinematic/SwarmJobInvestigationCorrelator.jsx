import { useState, useEffect, useCallback } from 'react';

const API = '';
const SJINV_RE = /\b(swarm[._-]?invest(?:igat(?:ion|e))?|invest(?:igat(?:ion|e))?[._-]?swarm|sjinv|swarm[._-]?case|swarm[._-]?coverage[._-]?invest(?:igat)?|unmonitored[._-]?invest(?:igat(?:ion)?)?|invest(?:igat(?:ion)?)?[._-]?without[._-]?swarm|which[._-]?invest(?:igat(?:ion)?)?s?[._-]?have[._-]?swarm|swarm[._-]?invest(?:igat(?:ion)?)?[._-]?coverage|automat(?:ion|ed)[._-]?case[._-]?coverage)\b/i;

export function isSjinvQuery(t) {
  return SJINV_RE.test(t || '');
}

export async function buildSjinvScript() {
  const [sR, iR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);
  const jobs = normaliseArray(sR.status === 'fulfilled' ? sR.value : [], 'swarm');
  const investigations = normaliseArray(iR.status === 'fulfilled' ? iR.value : [], 'investigations');
  const enriched = correlate(investigations, jobs);
  const monitoring = enriched.filter(inv => inv._matches.length > 0).length;
  const unmonitored = enriched.length - monitoring;
  const topMonitored = enriched
    .filter(inv => inv._matches.length > 0)
    .slice(0, 4)
    .map(inv => inv.title || inv.name || inv.id || '?')
    .join(', ') || 'none';
  return (
    `SwarmJob × Investigation Coverage: ${jobs.length} swarm jobs, ${investigations.length} investigations indexed. ` +
    `${monitoring} investigations have swarm automation coverage (MONITORING); ${unmonitored} have no swarm job tracking them (UNMONITORED). ` +
    `Top monitored: ${topMonitored}.`
  );
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = ['items', 'results', 'data', 'investigations', 'swarm_jobs', 'jobs', 'records', 'entities'];
  if (hint === 'investigations') {
    for (const k of ['investigations', 'items', 'results', 'data', 'records']) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  if (hint === 'swarm') {
    for (const k of ['swarm_jobs', 'jobs', 'items', 'results', 'data', 'entities', 'records']) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(investigation, job) {
  const invToks = new Set([
    ...tokens(investigation.title),
    ...tokens(investigation.name),
    ...tokens(investigation.description),
    ...tokens(investigation.subject),
    ...tokens(investigation.kind),
    ...tokens(investigation.status),
  ].filter(Boolean));
  const jobToks = [
    ...tokens(job.name),
    ...tokens(job.kind),
    ...tokens(job.target),
    ...tokens(job.description),
    ...tokens(job.type),
    ...tokens(job.status),
  ].filter(Boolean);
  if (!invToks.size || !jobToks.length) return 0;
  let hits = 0;
  for (const t of jobToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, jobToks.length);
}

function correlate(investigations, jobs) {
  return investigations.map(inv => {
    const scored = jobs
      .map(job => ({ job, score: matchScore(inv, job) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { ...inv, _matches: scored, _linked: scored.length > 0 };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'running' || s === 'active') return '#22c55e';
  if (s === 'queued' || s === 'pending') return '#f59e0b';
  if (s === 'failed' || s === 'error') return '#ef4444';
  return '#60a5fa';
}

export default function SwarmJobInvestigationCorrelator() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [investigations, setInvestigations] = useState([]);
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
      const [sR, iR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);
      const j = normaliseArray(sR.status === 'fulfilled' ? sR.value : [], 'swarm');
      const inv = normaliseArray(iR.status === 'fulfilled' ? iR.value : [], 'investigations');
      setJobs(j);
      setInvestigations(inv);
      setEnriched(correlate(inv, j));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:sjinv-toggle', h);
    return () => window.removeEventListener('jarvis:sjinv-toggle', h);
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
    const monitoring = enriched.filter(inv => inv._linked).length;
    const unmonitored = enriched.filter(inv => !inv._linked).length;
    const prompt =
      `SwarmJob × Investigation Coverage: ${jobs.length} swarm jobs, ${investigations.length} investigations. ` +
      `${monitoring} investigations have swarm automation coverage (MONITORING); ${unmonitored} are UNMONITORED (no swarm job tracks them). ` +
      `Top unmonitored: ${enriched.filter(inv => !inv._linked).slice(0, 5).map(inv => inv.title || inv.name || inv.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence swarm investigation coverage brief.`;
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

  const unmonitoredCount = enriched.filter(inv => !inv._linked).length;
  const badge = unmonitoredCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(inv => {
    const label = (inv.title || inv.name || inv.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'MONITORING') return inv._linked;
    if (tab === 'UNMONITORED') return !inv._linked;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="SwarmJob × Investigation Coverage"
        style={{
          position: 'fixed',
          left: 579840,
          bottom: 8,
          zIndex: 220,
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
          background: badge,
          boxShadow: unmonitoredCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        SJINV
        {unmonitoredCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unmonitoredCount}
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
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ SWARMJOB × INVESTIGATION COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'INVESTIGATIONS', val: investigations.length, color: '#60a5fa' },
              { label: 'SWARM JOBS', val: jobs.length, color: '#a78bfa' },
              { label: 'MONITORING', val: enriched.filter(inv => inv._linked).length, color: '#22c55e' },
              { label: 'UNMONITORED', val: unmonitoredCount, color: unmonitoredCount > 0 ? '#f59e0b' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'MONITORING', 'UNMONITORED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f59e0b' : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search investigations…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No investigations match the current filter.</div>
          )}

          <div>
            {visible.map((inv, i) => {
              const id = inv.id || inv.investigation_id || i;
              const label = inv.title || inv.name || `Investigation ${id}`;
              const sub = inv.status || inv.kind || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: inv._linked ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: inv._linked ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${inv._linked ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {inv._linked ? 'MONITORING' : 'UNMONITORED'}
                    </span>
                    {sub && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        {sub}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {inv.description && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(inv.description).slice(0, 200)}</div>
                      )}
                      {inv._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched swarm jobs:</div>
                          {inv._matches.map(({ job, score }, j) => {
                            const jobLabel = job.name || job.target || job.id || `job-${j}`;
                            const jobKind = job.kind || job.type || '';
                            const jobStatus = job.status || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#a78bfa', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jobLabel}</span>
                                  {jobKind && (
                                    <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                                      {jobKind}
                                    </span>
                                  )}
                                  {jobStatus && (
                                    <span style={{ ...PILL, background: `${statusColor(jobStatus)}22`, color: statusColor(jobStatus), border: `1px solid ${statusColor(jobStatus)}44` }}>
                                      {jobStatus}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No swarm job coverage for this investigation.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} investigations · {jobs.length} swarm jobs indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
