import { useState, useEffect, useCallback } from 'react';

const API = '';
const SJDC_RE = /\b(swarm[._-]?decision|decision[._-]?swarm|sjdc|swarm[._-]?job[._-]?decision|swarm[._-]?decisions|swarm[._-]?governance|job[._-]?decision[._-]?coverage|which[._-]?swarm[._-]?jobs?[._-]?have[._-]?decisions|swarm[._-]?decision[._-]?coverage|automation[._-]?decision|decision[._-]?automation)\b/i;

export function isSwarmDecisionQuery(t) {
  return SJDC_RE.test(t || '');
}

export async function buildSwarmDecisionScript() {
  const [sR, dR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
  ]);
  const jobs = normaliseArray(sR.status === 'fulfilled' ? sR.value : []);
  const decisions = normaliseDecisions(dR.status === 'fulfilled' ? dR.value : []);
  const enriched = correlate(jobs, decisions);
  const covered = enriched.filter(j => j._covered).length;
  const uncovered = enriched.length - covered;
  return (
    `SwarmJob × Decision Coverage: ${jobs.length} swarm jobs, ${decisions.length} decisions indexed. ` +
    `${covered} jobs are COVERED (backed by formal decisions); ${uncovered} have no decision governance. ` +
    `Top covered: ${enriched.filter(j => j._covered).slice(0, 4).map(j => j.name || j.kind || j.target || j.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'jobs', 'swarm_jobs', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseDecisions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'decisions', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(job, decision) {
  const jToks = new Set([
    ...tokens(job.name),
    ...tokens(job.kind),
    ...tokens(job.target),
    ...tokens(job.description),
    ...tokens(job.type),
    ...tokens(job.status),
  ].filter(Boolean));
  const dToks = [
    ...tokens(decision.title),
    ...tokens(decision.body_md),
    ...tokens(decision.summary),
    ...tokens(decision.category),
    ...tokens(decision.kind),
  ].filter(Boolean);
  if (!jToks.size || !dToks.length) return 0;
  let hits = 0;
  for (const t of dToks) if (jToks.has(t)) hits++;
  return hits / Math.max(jToks.size, dToks.length);
}

function correlate(jobs, decisions) {
  return jobs.map(j => {
    const scored = decisions
      .map(d => ({ d, score: matchScore(j, d) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { ...j, _matches: scored, _covered: scored.length > 0 };
  });
}

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'final' || s === 'approved' || s === 'complete') return '#22c55e';
  if (s === 'draft' || s === 'pending') return '#f59e0b';
  return '#60a5fa';
}

function kindColor(kind) {
  const k = String(kind || '').toLowerCase();
  if (k.includes('scan') || k.includes('recon')) return '#a78bfa';
  if (k.includes('enrich')) return '#38bdf8';
  if (k.includes('ingest') || k.includes('fetch')) return '#34d399';
  if (k.includes('analyse') || k.includes('analyz')) return '#fb923c';
  return '#94a3b8';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function SwarmJobDecisionCoverage() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [decisions, setDecisions] = useState([]);
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
      const [sR, dR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
      ]);
      const j = normaliseArray(sR.status === 'fulfilled' ? sR.value : []);
      const d = normaliseDecisions(dR.status === 'fulfilled' ? dR.value : []);
      setJobs(j);
      setDecisions(d);
      setEnriched(correlate(j, d));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:sjdc-toggle', h);
    return () => window.removeEventListener('jarvis:sjdc-toggle', h);
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
    const covered = enriched.filter(j => j._covered);
    const prompt =
      `SwarmJob × Decision Coverage: ${jobs.length} total swarm jobs, ${decisions.length} decisions. ` +
      `${covered.length} jobs are COVERED (decision-backed automation); ${enriched.length - covered.length} are UNCOVERED (no governance decision). ` +
      `Top covered: ${covered.slice(0, 5).map(j => j.name || j.kind || j.target || j.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence swarm job decision governance brief.`;
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

  const coveredCount = enriched.filter(j => j._covered).length;
  const uncoveredCount = enriched.length - coveredCount;
  const badge = uncoveredCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(j => {
    const label = (j.name || j.kind || j.target || j.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'COVERED') return j._covered;
    if (tab === 'UNCOVERED') return !j._covered;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="SwarmJob × Decision Coverage"
        style={{
          position: 'fixed',
          left: 543360,
          bottom: 8,
          zIndex: 212,
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
          boxShadow: uncoveredCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        SJDC
        {uncoveredCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {uncoveredCount}
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
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#a78bfa' }}>◈ SWARM JOB × DECISION COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)', borderRadius: 6, color: '#a78bfa', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SWARM JOBS', val: jobs.length, color: '#a78bfa' },
              { label: 'DECISIONS', val: decisions.length, color: '#60a5fa' },
              { label: 'COVERED', val: coveredCount, color: '#22c55e' },
              { label: 'UNCOVERED', val: uncoveredCount, color: uncoveredCount > 0 ? '#f59e0b' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, fontSize: 12, color: '#c4b5fd', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'COVERED', 'UNCOVERED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#a78bfa' : '#94a3b8',
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
              placeholder="Search swarm jobs…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No swarm jobs match the current filter.</div>
          )}

          <div>
            {visible.map((j, i) => {
              const id = j.id || j.job_id || i;
              const label = j.name || j.kind || j.target || `Job ${id}`;
              const kind = j.kind || j.type || '';
              const status = j.status || '';
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
                      background: j._covered ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: j._covered ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${j._covered ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {j._covered ? 'COVERED' : 'UNCOVERED'}
                    </span>
                    {kind && (
                      <span style={{ ...PILL, background: `${kindColor(kind)}22`, color: kindColor(kind), border: `1px solid ${kindColor(kind)}44` }}>
                        {kind}
                      </span>
                    )}
                    {status && (
                      <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                        {status}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {j.description && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(j.description).slice(0, 200)}</div>
                      )}
                      {j.target && (
                        <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Target: <span style={{ color: '#a78bfa' }}>{j.target}</span></div>
                      )}
                      {j._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched decisions:</div>
                          {j._matches.map(({ d, score }, k) => {
                            const dLabel = d.title || d.summary || d.id || `decision-${k}`;
                            const dStatus = d.status || d.state || '';
                            const quality = typeof d.quality_score === 'number' ? d.quality_score : null;
                            return (
                              <div key={k} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dLabel}</span>
                                  {dStatus && (
                                    <span style={{ ...PILL, background: `${statusColor(dStatus)}22`, color: statusColor(dStatus), border: `1px solid ${statusColor(dStatus)}44` }}>
                                      {dStatus.toUpperCase()}
                                    </span>
                                  )}
                                  {quality !== null && (
                                    <span style={{ color: '#94a3b8', fontSize: 10 }}>q={Math.round(quality * 100)}%</span>
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
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No decision governance found for this swarm job.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} swarm jobs · {decisions.length} decisions indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
