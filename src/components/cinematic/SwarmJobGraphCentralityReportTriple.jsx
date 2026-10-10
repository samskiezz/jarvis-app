import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const SJGCR_RE = /\b(sjgcr|swarm[\s_-]*centrality[\s_-]*report|swarm[\s_-]*graph[\s_-]*report|swarm[\s_-]*job[\s_-]*centrality|swarm[\s_-]*node[\s_-]*report|swarm[\s_-]*report[\s_-]*centrality|untracked[\s_-]*swarm[\s_-]*report)\b/i;
const THRESHOLD = 0.07;

export function isSjgcrQuery(t) { return SJGCR_RE.test(t || ''); }

export async function buildSjgcrScript() {
  try {
    const [swarmRes, centralityRes, repRes] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
    ]);
    const jobs = normaliseSwarmJobs(swarmRes);
    const nodes = normaliseNodes(centralityRes);
    const reports = normaliseReports(repRes);
    const classified = jobs.map(job => classifySwarmJob(job, nodes, reports));
    const fullyDocumented = classified.filter(c => c.state === 'FULLY_DOCUMENTED').length;
    const nodeMapped = classified.filter(c => c.state === 'NODE_MAPPED').length;
    const reportBacked = classified.filter(c => c.state === 'REPORT_BACKED').length;
    const untracked = classified.filter(c => c.state === 'UNTRACKED').length;
    const total = classified.length;
    return `SJGCR Coverage: ${total} swarm jobs analysed. ` +
      `Fully documented (node+report): ${fullyDocumented}. ` +
      `Node-mapped only: ${nodeMapped}. ` +
      `Report-backed only: ${reportBacked}. ` +
      `Untracked: ${untracked}. ` +
      `Coverage ratio: ${total ? Math.round((fullyDocumented / total) * 100) : 0}%.`;
  } catch {
    return 'SJGCR: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

function normaliseSwarmJobs(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.swarmJobs || raw?.swarm_jobs || raw?.data || raw?.items || []);
  return arr.map((j, i) => ({
    id: j.id || j._id || `swarm-${i}`,
    name: j.name || j.title || j.label || `SwarmJob ${i + 1}`,
    type: j.type || j.kind || j.category || '',
    status: j.status || j.state || '',
    notes: j.notes || j.description || j.summary || '',
    tags: Array.isArray(j.tags) ? j.tags : [],
  }));
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.nodes || raw?.centrality || raw?.data || raw?.items || []);
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.entity || `Node ${i + 1}`,
    type: n.type || n.kind || '',
    score: typeof n.score === 'number' ? n.score : (typeof n.centrality === 'number' ? n.centrality : 0),
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.reports || raw?.data || raw?.items || []);
  return arr.map((r, i) => ({
    id: r.id || r._id || `rep-${i}`,
    title: r.title || r.name || r.subject || `Report ${i + 1}`,
    type: r.type || r.kind || r.category || '',
    summary: r.summary || r.description || r.content || '',
    tags: Array.isArray(r.tags) ? r.tags : [],
  }));
}

function classifySwarmJob(job, nodes, reports) {
  const jobToks = tok(`${job.name} ${job.type} ${job.status} ${job.notes} ${job.tags.join(' ')}`);

  const matchedNodes = nodes
    .map(n => {
      const s = Math.max(
        matchScore(jobToks, `${n.label} ${n.type}`),
        matchScore(tok(n.label), `${job.name} ${job.type} ${job.status}`)
      );
      return { ...n, relevance: s };
    })
    .filter(n => n.relevance >= THRESHOLD)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  const matchedReports = reports
    .map(r => {
      const s = Math.max(
        matchScore(jobToks, `${r.title} ${r.type} ${r.summary} ${r.tags.join(' ')}`),
        matchScore(tok(`${r.title} ${r.summary}`), `${job.name} ${job.type} ${job.status}`)
      );
      return { ...r, relevance: s };
    })
    .filter(r => r.relevance >= THRESHOLD)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  const nodeMapped = matchedNodes.length > 0;
  const reportBacked = matchedReports.length > 0;
  let state;
  if (nodeMapped && reportBacked) state = 'FULLY_DOCUMENTED';
  else if (nodeMapped) state = 'NODE_MAPPED';
  else if (reportBacked) state = 'REPORT_BACKED';
  else state = 'UNTRACKED';

  return { ...job, state, nodeMapped, reportBacked, matchedNodes, matchedReports };
}

const STATE_COLORS = {
  FULLY_DOCUMENTED: '#22c55e',
  NODE_MAPPED:      '#34d399',
  REPORT_BACKED:    '#f59e0b',
  UNTRACKED:        '#6b7280',
};

const STATE_LABELS = {
  FULLY_DOCUMENTED: 'Fully Documented',
  NODE_MAPPED:      'Node-Mapped',
  REPORT_BACKED:    'Report-Backed',
  UNTRACKED:        'Untracked',
};

export default function SwarmJobGraphCentralityReportTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [lastUpdated, setLast]    = useState(null);
  const [activeTab, setActiveTab] = useState('FULLY_DOCUMENTED');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [swarmRes, centralityRes, repRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
      ]);
      const jobs    = normaliseSwarmJobs(swarmRes);
      const nodes   = normaliseNodes(centralityRes);
      const reports = normaliseReports(repRes);
      setRows(jobs.map(job => classifySwarmJob(job, nodes, reports)));
      setLast(new Date().toISOString());
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:sjgcr-toggle', h);
    return () => window.removeEventListener('jarvis:sjgcr-toggle', h);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const counts = {
    FULLY_DOCUMENTED: rows.filter(r => r.state === 'FULLY_DOCUMENTED').length,
    NODE_MAPPED:      rows.filter(r => r.state === 'NODE_MAPPED').length,
    REPORT_BACKED:    rows.filter(r => r.state === 'REPORT_BACKED').length,
    UNTRACKED:        rows.filter(r => r.state === 'UNTRACKED').length,
  };
  const total       = rows.length;
  const coveragePct = total ? Math.round((counts.FULLY_DOCUMENTED / total) * 100) : 0;

  const tabRows = rows
    .filter(r => r.state === activeTab)
    .filter(r => !search || `${r.name} ${r.type} ${r.status}`.toLowerCase().includes(search.toLowerCase()));

  const speak = useCallback(() => {
    const summary = `SJGCR: ${total} swarm jobs. Fully documented: ${counts.FULLY_DOCUMENTED}. Node-mapped: ${counts.NODE_MAPPED}. Report-backed: ${counts.REPORT_BACKED}. Untracked: ${counts.UNTRACKED}. Coverage ${coveragePct} percent.`;
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: summary } }));
  }, [total, counts, coveragePct]);

  const assess = useCallback(async () => {
    const prompt = `SJGCR triple coverage summary: ${total} swarm jobs, ${counts.FULLY_DOCUMENTED} fully documented, ${counts.NODE_MAPPED} node-mapped, ${counts.REPORT_BACKED} report-backed, ${counts.UNTRACKED} untracked. Provide a 2-sentence swarm operations network and documentary intelligence assessment.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data?.response || data?.message || data?.content || 'Assessment complete.';
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: reply } }));
      }
    } catch { /* silent */ }
  }, [total, counts]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: 'fixed', bottom: 8, left: 856000, zIndex: 557,
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)',
          borderRadius: 6, color: '#22c55e', fontSize: 10, fontFamily: 'monospace',
          padding: '2px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
          backdropFilter: 'blur(4px)',
        }}
        title="SwarmJob × Graph Centrality × Report Coverage"
      >
        ◈ SJGCR
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 557,
      background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 820, maxHeight: '88vh', overflowY: 'auto',
        background: 'rgba(10,20,30,0.97)', border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: 12, padding: 24, fontFamily: 'monospace', color: '#e2e8f0',
        backdropFilter: 'blur(12px)', boxShadow: '0 0 40px rgba(34,197,94,0.15)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e', letterSpacing: 1 }}>
              ◈ SJGCR — SwarmJob × Graph Centrality × Report
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
              {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Loading…'} · Auto-refresh 90s
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={assess} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#22c55e', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>ASSESS</button>
            <button onClick={speak} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>▶ TTS</button>
            <button onClick={load} disabled={loading} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>⟳</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#f87171', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {Object.entries(counts).map(([state, cnt]) => (
            <div key={state} onClick={() => setActiveTab(state)}
              style={{
                background: activeTab === state ? STATE_COLORS[state] + '22' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${activeTab === state ? STATE_COLORS[state] : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 8, padding: '10px 8px', cursor: 'pointer', textAlign: 'center',
              }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: STATE_COLORS[state] }}>{cnt}</div>
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{STATE_LABELS[state]}</div>
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
            <span>Full coverage</span><span style={{ color: '#22c55e' }}>{coveragePct}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${coveragePct}%`, background: 'linear-gradient(90deg,#22c55e,#34d399)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {['FULLY_DOCUMENTED','NODE_MAPPED','REPORT_BACKED','UNTRACKED'].map(s => (
              <div key={s} style={{ height: 3, flex: counts[s] || 0, background: STATE_COLORS[s], borderRadius: 2, minWidth: counts[s] ? 2 : 0 }} />
            ))}
          </div>
        </div>

        {/* Tabs + search */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.keys(STATE_LABELS).map(s => (
            <button key={s} onClick={() => setActiveTab(s)}
              style={{
                background: activeTab === s ? STATE_COLORS[s] + '22' : 'none',
                border: `1px solid ${activeTab === s ? STATE_COLORS[s] : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: activeTab === s ? STATE_COLORS[s] : '#64748b',
                fontSize: 10, padding: '3px 10px', cursor: 'pointer',
              }}>
              {STATE_LABELS[s]} ({counts[s]})
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search swarm jobs…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, color: '#e2e8f0', fontSize: 10, padding: '3px 8px', outline: 'none', width: 150,
            }}
          />
        </div>

        {loading && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 11, padding: '20px 0' }}>Loading swarm jobs…</div>
        )}
        {!loading && tabRows.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 11, padding: '20px 0' }}>No swarm jobs in this state.</div>
        )}

        {/* Row list */}
        {!loading && tabRows.map(row => (
          <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '8px 4px', cursor: 'pointer' }}
            onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLORS[row.state], display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#e2e8f0' }}>{row.name}</span>
                {row.type && <span style={{ fontSize: 9, color: '#475569', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 5px' }}>{row.type}</span>}
                {row.status && <span style={{ fontSize: 9, color: '#64748b', fontStyle: 'italic' }}>{row.status}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {row.nodeMapped   && <span style={{ fontSize: 9, color: '#34d399', background: 'rgba(52,211,153,0.1)',  borderRadius: 3, padding: '1px 5px' }}>NODE</span>}
                {row.reportBacked && <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 3, padding: '1px 5px' }}>REPORT</span>}
                <span style={{ fontSize: 9, color: '#64748b' }}>{expanded === row.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expanded === row.id && (
              <div style={{ marginTop: 8, paddingLeft: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Centrality nodes pane */}
                  <div>
                    <div style={{ fontSize: 10, color: '#34d399', marginBottom: 4, fontWeight: 600 }}>Graph Centrality Nodes</div>
                    {row.matchedNodes.length === 0
                      ? <div style={{ fontSize: 10, color: '#475569' }}>No node matches</div>
                      : row.matchedNodes.map(n => (
                        <div key={n.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#e2e8f0' }}>
                            <span>{n.label}</span>
                            {n.type && <span style={{ fontSize: 9, color: '#475569', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 4px' }}>{n.type}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 3 }}>
                            <div style={{ height: '100%', width: `${Math.round(n.relevance * 100)}%`, background: '#34d399', borderRadius: 2 }} />
                          </div>
                          <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>centrality {n.score.toFixed ? n.score.toFixed(3) : n.score} · relevance {Math.round(n.relevance * 100)}%</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Reports pane */}
                  <div>
                    <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 4, fontWeight: 600 }}>Intelligence Reports</div>
                    {row.matchedReports.length === 0
                      ? <div style={{ fontSize: 10, color: '#475569' }}>No report matches</div>
                      : row.matchedReports.map(r => (
                        <div key={r.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#e2e8f0' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                            {r.type && <span style={{ fontSize: 9, color: '#475569', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 4px', flexShrink: 0, marginLeft: 4 }}>{r.type}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 3 }}>
                            <div style={{ height: '100%', width: `${Math.round(r.relevance * 100)}%`, background: '#f59e0b', borderRadius: 2 }} />
                          </div>
                          <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>relevance {Math.round(r.relevance * 100)}%</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 12, fontSize: 9, color: '#334155', textAlign: 'right' }}>
          SJGCR · /entities/SwarmJob · /v1/graph/centrality · /v1/reports
        </div>
      </div>
    </div>
  );
}
