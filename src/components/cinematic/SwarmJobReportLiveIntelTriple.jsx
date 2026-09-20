import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 60000;

const SWJRLI_RE = /\b(swjrli|swarm[\s_-]*job[\s_-]*report[\s_-]*live|swarm[\s_-]*report[\s_-]*live[\s_-]*intel|swarm[\s_-]*live[\s_-]*report|live[\s_-]*swarm[\s_-]*report|report[\s_-]*swarm[\s_-]*live|swarm[\s_-]*report[\s_-]*intel|swarm[\s_-]*live[\s_-]*intel[\s_-]*report|live[\s_-]*triggered[\s_-]*swarm|dormant[\s_-]*swarm[\s_-]*report|swarm[\s_-]*report[\s_-]*coverage|swarm[\s_-]*world[\s_-]*report)\b/i;

export function isSwjrliQuery(t) { return SWJRLI_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter(t => bSet.has(t)).length;
  return hits / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.08;

const COV = {
  FULLY_LIVE: 'FULLY_LIVE',
  REPORT_BACKED: 'REPORT_BACKED',
  LIVE_TRIGGERED: 'LIVE_TRIGGERED',
  DORMANT: 'DORMANT',
};

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const items = [];
  const data = Array.isArray(raw) ? raw : (raw?.data ?? raw?.events ?? raw?.results ?? []);
  for (const e of data) {
    const type = e?.type ?? e?.kind ?? e?.category ?? '';
    let label = '';
    if (type === 'SEISMIC' || e?.magnitude) {
      label = [e?.place ?? e?.location ?? '', e?.magnitude ? `M${e.magnitude}` : ''].filter(Boolean).join(' ');
    } else if (type === 'CRYPTO' || e?.symbol) {
      label = [e?.symbol ?? '', e?.name ?? ''].filter(Boolean).join(' ');
    } else if (type === 'FX' || e?.pair) {
      label = [e?.pair ?? e?.base ?? '', e?.quote ?? ''].filter(Boolean).join(' ');
    } else {
      label = e?.name ?? e?.title ?? e?.description ?? String(e?.id ?? '');
    }
    items.push({ label, type, raw: e });
  }
  return items;
}

function classifyJob(jobTokens, reports, liveEvents) {
  let bestReport = null, bestReportScore = 0;
  let bestLive = null, bestLiveScore = 0;
  for (const r of reports) {
    const rt = tok([r?.name, r?.title, r?.summary, r?.description, r?.type, r?.category, (r?.tags || []).join(' ')].join(' '));
    const s = matchScore(jobTokens, rt);
    if (s > bestReportScore) { bestReportScore = s; bestReport = r; }
  }
  for (const ev of liveEvents) {
    const et = tok(ev.label + ' ' + ev.type);
    const s = matchScore(jobTokens, et);
    if (s > bestLiveScore) { bestLiveScore = s; bestLive = ev; }
  }
  const hasReport = bestReportScore >= THRESHOLD;
  const hasLive = bestLiveScore >= THRESHOLD;
  let cov;
  if (hasReport && hasLive) cov = COV.FULLY_LIVE;
  else if (hasReport) cov = COV.REPORT_BACKED;
  else if (hasLive) cov = COV.LIVE_TRIGGERED;
  else cov = COV.DORMANT;
  return { cov, bestReport, bestReportScore, bestLive, bestLiveScore };
}

export async function buildSwjrliScript() {
  try {
    const [jobRes, repRes, liveRes] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : []),
    ]);
    const jobs = Array.isArray(jobRes) ? jobRes : (jobRes?.items ?? jobRes?.data ?? []);
    const reports = Array.isArray(repRes) ? repRes : (repRes?.items ?? repRes?.data ?? repRes?.reports ?? []);
    const liveEvents = normaliseLiveIntel(liveRes);
    const counts = { [COV.FULLY_LIVE]: 0, [COV.REPORT_BACKED]: 0, [COV.LIVE_TRIGGERED]: 0, [COV.DORMANT]: 0 };
    for (const j of jobs) {
      const jt = tok([j?.name, j?.title, j?.type, j?.objective, j?.description, j?.kind, (j?.tags || []).join(' ')].join(' '));
      const { cov } = classifyJob(jt, reports, liveEvents);
      counts[cov]++;
    }
    const total = jobs.length;
    return `SWJRLI: ${total} swarm jobs — ${counts[COV.FULLY_LIVE]} fully live (report+live intel), ${counts[COV.REPORT_BACKED]} report-backed, ${counts[COV.LIVE_TRIGGERED]} live-triggered, ${counts[COV.DORMANT]} dormant. ${reports.length} reports, ${liveEvents.length} live intel signals indexed. ${counts[COV.DORMANT] > 0 ? `${counts[COV.DORMANT]} swarm jobs have no report or live-world coverage — operational blind spots.` : 'All swarm jobs have at least one coverage dimension.'}`;
  } catch {
    return 'SWJRLI: unable to fetch swarm job, report, or live intel data — check endpoints.';
  }
}

export default function SwarmJobReportLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [reports, setReports] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobRes, repRes, liveRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : []),
      ]);
      setJobs(Array.isArray(jobRes) ? jobRes : (jobRes?.items ?? jobRes?.data ?? []));
      setReports(Array.isArray(repRes) ? repRes : (repRes?.items ?? repRes?.data ?? repRes?.reports ?? []));
      setLiveEvents(normaliseLiveIntel(liveRes));
    } catch { /* silently ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:swjrli-toggle', handler);
    return () => window.removeEventListener('jarvis:swjrli-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) return null;

  const classified = jobs.map(j => {
    const label = j?.name ?? j?.title ?? j?.objective ?? '(unnamed)';
    const kind = j?.type ?? j?.kind ?? '';
    const status = j?.status ?? j?.state ?? '';
    const jt = tok([j?.name, j?.title, j?.type, j?.objective, j?.description, j?.kind, (j?.tags || []).join(' ')].join(' '));
    const result = classifyJob(jt, reports, liveEvents);
    return { label, kind, status, ...result };
  });

  const counts = { [COV.FULLY_LIVE]: 0, [COV.REPORT_BACKED]: 0, [COV.LIVE_TRIGGERED]: 0, [COV.DORMANT]: 0 };
  classified.forEach(r => counts[r.cov]++);

  const covColor = {
    [COV.FULLY_LIVE]: '#22d3ee',
    [COV.REPORT_BACKED]: '#a78bfa',
    [COV.LIVE_TRIGGERED]: '#fb923c',
    [COV.DORMANT]: '#475569',
  };
  const covLabel = {
    [COV.FULLY_LIVE]: 'FULLY LIVE',
    [COV.REPORT_BACKED]: 'REPORT BACKED',
    [COV.LIVE_TRIGGERED]: 'LIVE TRIGGERED',
    [COV.DORMANT]: 'DORMANT',
  };

  const total = classified.length;
  const livePct = total ? Math.round((counts[COV.FULLY_LIVE] / total) * 100) : 0;

  const searchLower = search.toLowerCase();
  const visible = classified.filter(r => {
    if (filter !== 'ALL' && r.cov !== filter) return false;
    if (searchLower && !r.label.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText('');
    try {
      const prompt = `SWJRLI swarm job live coverage: ${total} swarm jobs — ${counts[COV.FULLY_LIVE]} fully live (report+live intel), ${counts[COV.REPORT_BACKED]} report-backed only, ${counts[COV.LIVE_TRIGGERED]} live-triggered only, ${counts[COV.DORMANT]} dormant. ${reports.length} reports, ${liveEvents.length} live intel signals indexed. Provide a 2-sentence assessment of swarm job world-signal and report coverage, and one actionable recommendation.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j.response || j.message || j.content || '';
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
      }
    } catch { /* silently ignore */ }
    setAssessing(false);
  }

  const CY = '#22d3ee';

  return (
    <div style={{
      position: 'fixed', left: 873920, bottom: 8, zIndex: 569, width: 360,
      background: 'rgba(8,12,20,0.97)', border: `1px solid ${CY}44`,
      borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: 12,
      color: '#e2e8f0', boxShadow: `0 0 28px ${CY}11`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ SWJRLI — SwarmJob × Report × Live Intel</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {Object.values(COV).map(cov => (
          <div key={cov} style={{ background: covColor[cov] + '11', border: `1px solid ${covColor[cov]}44`, borderRadius: 6, padding: '6px 8px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setFilter(f => f === cov ? 'ALL' : cov)}>
            <div style={{ fontSize: 22, fontWeight: 700, color: covColor[cov] }}>{counts[cov]}</div>
            <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 1 }}>{covLabel[cov]}</div>
          </div>
        ))}
      </div>

      {/* Source tiles */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        {[['Jobs', total, CY], ['Reports', reports.length, '#a78bfa'], ['Live', liveEvents.length, '#fb923c']].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: col + '11', border: `1px solid ${col}33`, borderRadius: 5, padding: '4px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
          {Object.values(COV).map(cov => (
            <div key={cov} style={{ flex: counts[cov] || 0.01, background: covColor[cov], transition: 'flex 0.4s' }} />
          ))}
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, color: '#64748b', marginTop: 2 }}>{livePct}% fully live</div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', ...Object.values(COV)].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer', fontWeight: filter === f ? 700 : 400,
            background: filter === f ? (f === 'ALL' ? CY + '22' : covColor[f] + '22') : 'transparent',
            border: `1px solid ${filter === f ? (f === 'ALL' ? CY : covColor[f]) : '#1e293b'}`,
            color: filter === f ? (f === 'ALL' ? CY : covColor[f]) : '#64748b',
          }}>{f === 'ALL' ? 'ALL' : covLabel[f].split(' ')[0]}</button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)} placeholder="Search swarm jobs…"
        style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, padding: '4px 8px', color: '#94a3b8', fontSize: 11, marginBottom: 8 }}
      />

      {/* Rows */}
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.slice(0, 30).map((row, i) => (
          <div key={i}>
            <div
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: '#0f172a', border: `1px solid ${covColor[row.cov]}22` }}
            >
              <span style={{ color: '#cbd5e1', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{row.label}</span>
              <span style={{ fontSize: 8, color: covColor[row.cov], fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>{covLabel[row.cov].split(' ')[0]}</span>
            </div>
            {expanded === i && (
              <div style={{ padding: '6px 8px', background: '#080c14', borderRadius: 4, marginTop: 2, fontSize: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 4 }}>REPORT</div>
                    {row.bestReport ? (
                      <>
                        <div style={{ color: '#cbd5e1' }}>{row.bestReport?.name ?? row.bestReport?.title ?? '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{row.bestReport?.type ?? row.bestReport?.category ?? ''}</div>
                        <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                          <div style={{ width: `${Math.round(row.bestReportScore * 100)}%`, background: '#a78bfa', height: '100%', borderRadius: 2 }} />
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 8 }}>{Math.round(row.bestReportScore * 100)}%</div>
                      </>
                    ) : <div style={{ color: '#475569' }}>No match</div>}
                  </div>
                  <div>
                    <div style={{ color: '#fb923c', fontWeight: 700, marginBottom: 4 }}>LIVE INTEL</div>
                    {row.bestLive ? (
                      <>
                        <div style={{ color: '#cbd5e1' }}>{row.bestLive?.label ?? '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{row.bestLive?.type ?? ''}</div>
                        <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                          <div style={{ width: `${Math.round(row.bestLiveScore * 100)}%`, background: '#fb923c', height: '100%', borderRadius: 2 }} />
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 8 }}>{Math.round(row.bestLiveScore * 100)}%</div>
                      </>
                    ) : <div style={{ color: '#475569' }}>No match</div>}
                  </div>
                </div>
                {(row.kind || row.status) && (
                  <div style={{ marginTop: 5, fontSize: 9, color: '#64748b' }}>
                    {row.kind && <span style={{ marginRight: 6, background: '#1e293b', padding: '1px 5px', borderRadius: 3 }}>{row.kind}</span>}
                    {row.status && <span style={{ background: '#1e293b', padding: '1px 5px', borderRadius: 3 }}>{row.status}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: 8 }}>No swarm jobs match</div>}
        {visible.length > 30 && <div style={{ fontSize: 9, color: '#334155', textAlign: 'center' }}>…+{visible.length - 30} more</div>}
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 8 }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : CY + '11', border: `1px solid ${CY}`, borderRadius: 4, color: CY, cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — SWJRLI coverage brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s`}
      </div>
    </div>
  );
}
