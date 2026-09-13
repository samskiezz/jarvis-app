import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SWJDC_RE = /\b(swjdc|swarm\s+job\s+dataset\s+coverage|swarm\s+job\s+data\s+source|swarm\s+job\s+unsourced|unsourced\s+swarm\s+job|sourced\s+swarm\s+job|swarm\s+job\s+intelligence\s+gap|swarm\s+job\s+dataset\s+link|swarm\s+dataset\s+link|swarm\s+data\s+link)\b/i;

export function isSwjdcQuery(t) { return SWJDC_RE.test(t || ''); }

export async function buildSwjdcScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [sjR, dsR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
  ]);
  const sjRaw = sjR.value ?? {};
  const jobs = Array.isArray(sjRaw) ? sjRaw
    : (sjRaw.jobs ?? sjRaw.data ?? sjRaw.results ?? []);
  const dsRaw = dsR.value ?? {};
  const datasets = Array.isArray(dsRaw) ? dsRaw
    : (dsRaw.datasets ?? dsRaw.data ?? dsRaw.results ?? []);

  const dsText = datasets.map(d =>
    `${d.name ?? d.title ?? d.id ?? ''} ${d.description ?? ''} ${d.type ?? ''} ${d.category ?? ''}`.toLowerCase()
  ).join(' ');

  let sourced = 0, unsourced = 0;
  for (const job of jobs) {
    const name = `${job.name ?? job.id ?? job.type ?? ''}`.toLowerCase();
    const tokens = name.split(/\W+/).filter(t => t.length > 2);
    const hit = tokens.some(tok => dsText.includes(tok));
    if (hit) sourced++; else unsourced++;
  }
  return `SWJDC SwarmJob × Dataset Coverage: ${jobs.length} swarm jobs assessed against ${datasets.length} datasets. ` +
    `SOURCED: ${sourced} (dataset intelligence source found for this swarm job domain). ` +
    `UNSOURCED: ${unsourced} (no dataset covers this swarm job — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { SOURCED: '#a78bfa', UNSOURCED: '#f59e0b' };

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreMatch(job, datasets) {
  const name = `${job.name ?? job.id ?? job.type ?? ''}`.toLowerCase();
  const jobTokens = tokenize(name);
  const matched = [];
  for (const ds of datasets) {
    const dsText = `${ds.name ?? ds.title ?? ds.id ?? ''} ${ds.description ?? ''} ${ds.type ?? ''} ${ds.category ?? ''}`.toLowerCase();
    const hits = jobTokens.filter(tok => dsText.includes(tok));
    if (hits.length > 0) {
      matched.push({ ds, score: Math.min(100, hits.length * 25) });
    }
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(job, datasets) {
  const name = `${job.name ?? job.id ?? job.type ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const dsText = datasets.map(d =>
    `${d.name ?? d.title ?? d.id ?? ''} ${d.description ?? ''} ${d.type ?? ''} ${d.category ?? ''}`.toLowerCase()
  ).join(' ');
  const hit = tokens.some(tok => dsText.includes(tok));
  return hit ? 'SOURCED' : 'UNSOURCED';
}

export default function SwarmJobDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [sjR, dsR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
      ]);
      const sjRaw = sjR.value ?? {};
      const svcs = Array.isArray(sjRaw) ? sjRaw
        : (sjRaw.jobs ?? sjRaw.data ?? sjRaw.results ?? []);
      const dsRaw = dsR.value ?? {};
      const dsets = Array.isArray(dsRaw) ? dsRaw
        : (dsRaw.datasets ?? dsRaw.data ?? dsRaw.results ?? []);
      setJobs(svcs);
      setDatasets(dsets);
      setRows(svcs.map(job => ({
        job,
        state: correlate(job, dsets),
        matched: scoreMatch(job, dsets),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:swjdc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:swjdc-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const sourced = rows.filter(r => r.state === 'SOURCED').length;
  const unsourced = rows.filter(r => r.state === 'UNSOURCED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.job.name ?? r.job.id ?? r.job.type ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.job.name ?? row.job.id ?? row.job.type ?? 'swarm-job';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const matchNames = row.matched.slice(0, 3).map(m => m.ds.name ?? m.ds.title ?? m.ds.id ?? '?').join(', ');
      const prompt = `Swarm job "${id}" has ${row.state === 'SOURCED' ? `dataset intelligence sources (datasets: ${matchNames || 'found'})` : 'NO dataset coverage — intelligence gap'}. In exactly 2 sentences, assess the data sourcing completeness for this swarm job.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 782640, bottom: 8, zIndex: 426,
      width: 520, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(167,139,250,0.25)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#a78bfa', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ SWJDC — SWARM JOB × DATASET COVERAGE</span>
        {unsourced > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unsourced} UNSOURCED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Swarm Jobs', val: jobs.length },
          { label: 'Datasets', val: datasets.length },
          { label: 'Sourced', val: sourced, color: '#a78bfa' },
          { label: 'Unsourced', val: unsourced, color: '#f59e0b' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((sourced / rows.length) * 100)}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((sourced / rows.length) * 100) : 0}% dataset coverage · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'SOURCED', 'UNSOURCED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#a78bfa' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700,
            color: filter === f ? '#000' : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no swarm jobs match</div>
        )}
        {visible.map((row, i) => {
          const id = row.job.name ?? row.job.id ?? row.job.type ?? `job-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.job.status && (
                  <span style={{ fontSize: 10, color: row.job.status === 'running' || row.job.status === 'active' ? '#4ade80' : '#f59e0b', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 6px' }}>
                    {row.job.status}
                  </span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, color: '#a78bfa', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  {row.matched.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 11 }}>no matching datasets</div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 10, color: '#888', marginBottom: 6, letterSpacing: 1 }}>DATASET MATCHES ({row.matched.length})</div>
                      {row.matched.slice(0, 6).map((m, mi) => {
                        const dsName = m.ds.name ?? m.ds.title ?? m.ds.id ?? `dataset-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#d1d5db' }}>{dsName}</span>
                              {m.ds.type && (
                                <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 5px' }}>{m.ds.type}</span>
                              )}
                              {m.ds.category && (
                                <span style={{ fontSize: 9, color: '#818cf8', background: 'rgba(129,140,248,0.1)', borderRadius: 3, padding: '1px 5px' }}>{m.ds.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#a78bfa', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
