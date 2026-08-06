import { useState, useEffect, useCallback } from 'react';

const API = '';
const SJAC_RE = /\b(swarm[._-]?alert|alert[._-]?swarm|sjac|alert[._-]?automation|swarm[._-]?alert[._-]?coverage|unmonitored[._-]?alerts|which[._-]?alerts[._-]?have[._-]?swarm|swarm[._-]?incident|alert[._-]?swarm[._-]?jobs|swarm[._-]?response[._-]?alert)\b/i;

export function isSwarmAlertQuery(t) {
  return SJAC_RE.test(t || '');
}

export async function buildSwarmAlertScript() {
  const [swR, alR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/v1/alerts`).then(r => r.json()),
  ]);
  const jobs = normaliseArray(swR.status === 'fulfilled' ? swR.value : []);
  const alerts = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
  const enriched = correlate(alerts, jobs);
  const responding = enriched.filter(a => a._linked).length;
  const unmonitored = enriched.filter(a => !a._linked).length;
  return `SwarmJob × Alert Correlator: ${jobs.length} swarm jobs, ${alerts.length} alerts indexed. ` +
    `${responding} alerts have RESPONDING swarm job coverage; ${unmonitored} are UNMONITORED (automation gap). ` +
    `Top unmonitored: ${enriched.filter(a => !a._linked).slice(0, 4).map(a => a.type || a.category || a.id || '?').join(', ') || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'alerts', 'jobs', 'swarm_jobs', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(alert, job) {
  const alertToks = new Set([
    ...tokens(alert.type),
    ...tokens(alert.category),
    ...tokens(alert.message),
    ...tokens(alert.source),
    ...tokens(alert.severity),
  ].filter(Boolean));
  const jobToks = [
    ...tokens(job.name),
    ...tokens(job.title),
    ...tokens(job.target),
    ...tokens(job.kind),
    ...tokens(job.description),
    ...tokens(job.status),
  ].filter(Boolean);
  if (!alertToks.size || !jobToks.length) return 0;
  let hits = 0;
  for (const t of jobToks) if (alertToks.has(t)) hits++;
  return hits / Math.max(alertToks.size, jobToks.length);
}

function correlate(alerts, jobs) {
  return alerts.map(alert => {
    const scored = jobs
      .map(job => ({ job, score: matchScore(alert, job) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { ...alert, _matches: scored, _linked: scored.length > 0 };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function sevColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical' || s === 'high') return '#ef4444';
  if (s === 'medium' || s === 'warn' || s === 'warning') return '#f59e0b';
  return '#60a5fa';
}

function jobStatusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'running' || s === 'active') return '#22c55e';
  if (s === 'pending' || s === 'queued') return '#f59e0b';
  if (s === 'failed' || s === 'error') return '#ef4444';
  return '#64748b';
}

export default function SwarmJobAlertCorrelator() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [alerts, setAlerts] = useState([]);
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
      const [swR, alR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/v1/alerts`).then(r => r.json()),
      ]);
      const j = normaliseArray(swR.status === 'fulfilled' ? swR.value : []);
      const a = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
      setJobs(j);
      setAlerts(a);
      setEnriched(correlate(a, j));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:sjac-toggle', h);
    return () => window.removeEventListener('jarvis:sjac-toggle', h);
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
    const responding = enriched.filter(a => a._linked);
    const unmonitored = enriched.filter(a => !a._linked);
    const prompt =
      `SwarmJob × Alert Correlator: ${jobs.length} swarm jobs, ${alerts.length} alerts. ` +
      `${responding.length} alerts have RESPONDING swarm job coverage; ${unmonitored.length} are UNMONITORED. ` +
      `Top unmonitored: ${unmonitored.slice(0, 5).map(a => a.type || a.category || a.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence swarm automation coverage brief.`;
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

  const unmonitoredCount = enriched.filter(a => !a._linked).length;
  const badge = unmonitoredCount > 0 ? '#ef4444' : '#22c55e';

  const visible = enriched.filter(alert => {
    const label = (alert.type || alert.category || alert.message || alert.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'RESPONDING') return alert._linked;
    if (tab === 'UNMONITORED') return !alert._linked;
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="SwarmJob × Alert Correlator"
        style={{
          position: 'fixed',
          left: 447600,
          bottom: 8,
          zIndex: 191,
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
        SJAC
        {unmonitoredCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unmonitoredCount}
          </span>
        )}
      </button>

      {/* Panel */}
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
          zIndex: 9601,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ SWARM × ALERT CORRELATOR</span>
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

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SWARM JOBS', val: jobs.length, color: '#a78bfa' },
              { label: 'ALERTS', val: alerts.length, color: '#60a5fa' },
              { label: 'RESPONDING', val: enriched.filter(a => a._linked).length, color: '#22c55e' },
              { label: 'UNMONITORED', val: unmonitoredCount, color: unmonitoredCount > 0 ? '#ef4444' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment block */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'RESPONDING', 'UNMONITORED'].map(t => (
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
              placeholder="Search alerts…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {/* Status / error */}
          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No alerts match the current filter.</div>
          )}

          {/* Alert rows */}
          <div>
            {visible.map((alert, i) => {
              const id = alert.id || alert.alert_id || i;
              const label = alert.type || alert.category || alert.message || `Alert ${id}`;
              const sev = alert.severity || alert.level || '';
              const status = alert.status || '';
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
                      background: alert._linked ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: alert._linked ? '#22c55e' : '#ef4444',
                      border: `1px solid ${alert._linked ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}>
                      {alert._linked ? 'RESPONDING' : 'UNMONITORED'}
                    </span>
                    {sev && (
                      <span style={{ ...PILL, background: `${sevColor(sev)}22`, color: sevColor(sev), border: `1px solid ${sevColor(sev)}44` }}>
                        {sev.toUpperCase()}
                      </span>
                    )}
                    {status && (
                      <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.25)' }}>
                        {status}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {alert.message && alert.message !== label && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(alert.message).slice(0, 200)}</div>
                      )}
                      {alert._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Responding swarm jobs:</div>
                          {alert._matches.map(({ job, score }, j) => {
                            const jobLabel = job.name || job.title || job.target || job.id || `job-${j}`;
                            const jobStatus = job.status || job.state || '';
                            const jobKind = job.kind || job.type || '';
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
                                    <span style={{ ...PILL, background: `${jobStatusColor(jobStatus)}22`, color: jobStatusColor(jobStatus), border: `1px solid ${jobStatusColor(jobStatus)}44` }}>
                                      {jobStatus}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#ef4444', fontSize: 11 }}>⚠ No swarm job responding to this alert — automation gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} alerts · {jobs.length} swarm jobs indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
