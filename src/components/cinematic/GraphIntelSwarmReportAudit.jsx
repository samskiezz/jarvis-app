/**
 * GraphIntelSwarmReportAudit — F123
 *
 * Fetches /v1/graph/centrality + /entities/IntelProfile + /entities/SwarmJob + /v1/reports.
 *
 * Keyword-matches each graph centrality node (label/type/entity) against
 * intel profiles, swarm jobs, and reports to classify:
 *
 *   EXECUTING  — node matches intel profile AND swarm job AND report
 *                (full execution footprint: attributed, automated, documented)
 *   ORCHESTRATED — node matches intel profile AND swarm job but no report
 *                (active but unfiled — intelligence gap)
 *   SWARMED    — node matches swarm job but no intel profile
 *                (autonomous processing with no intelligence attribution)
 *   DORMANT    — no match to any source
 *                (blind-spot node: no intel ownership, no automation, no report)
 *
 * Toggle: ◈ GISRAUD button (fixed, bottom strip) left:117240, zIndex:220
 * Stat tiles: nodes / intel profiles / swarm jobs / reports / executing / orchestrated / swarmed / dormant
 * Red pulse on DORMANT count (blind-spot nodes).
 * Expandable rows: matched intel profiles with category badge +
 *                  matched swarm jobs with status badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / EXECUTING / ORCHESTRATED / SWARMED / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "gisraud"/"graph intel swarm audit"/"graph intel execution"/"intel execution audit"
 *        "swarm report audit"/"graph swarm report"/"execution audit"/"intel swarm audit"
 *        "graph dormant"/"dormant intel"/"graph execution audit"/"intel orchestration audit"
 *        "graph attribution"/"swarm attribution"/"execution footprint"/"graph blind spot"
 * Event: jarvis:gisraud-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'EXECUTING', 'ORCHESTRATED', 'SWARMED', 'DORMANT'];

const CLS_COLOR = {
  EXECUTING:    '#22C55E',
  ORCHESTRATED: '#3B82F6',
  SWARMED:      '#F97316',
  DORMANT:      '#EF4444',
};

export function isGisraudQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'gisraud', 'graph intel swarm audit', 'graph intel execution', 'intel execution audit',
    'swarm report audit', 'graph swarm report', 'execution audit', 'intel swarm audit',
    'graph dormant', 'dormant intel', 'graph execution audit', 'intel orchestration audit',
    'graph attribution', 'swarm attribution', 'execution footprint', 'graph blind spot',
    'intel swarm report', 'graph intel report', 'graph swarm intelligence',
  ].some(kw => s.includes(kw));
}

export function buildGisraudScript(q) {
  return `JARVIS graph–intel–swarm–report execution audit triggered by: "${q}". Fetch /v1/graph/centrality + /entities/IntelProfile + /entities/SwarmJob + /v1/reports. Classify each graph node as EXECUTING/ORCHESTRATED/SWARMED/DORMANT. Report the dormant count and top 3 blind-spot nodes with no intel attribution, no automation, and no filed report.`;
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function nodeLabel(n) {
  return n.label || n.name || n.entity || n.id || 'Unknown';
}

function nodeTokens(n) {
  return tokens(
    `${n.label || ''} ${n.name || ''} ${n.entity || ''} ${n.type || ''} ${n.category || ''} ${n.description || ''}`
  );
}

function classifyNode(node, intelProfiles, swarmJobs, reports) {
  const toks = nodeTokens(node);

  const mIntel = intelProfiles.filter(p =>
    overlaps(toks, `${p.name || ''} ${p.title || ''} ${p.alias || ''} ${p.description || ''} ${p.category || ''} ${p.type || ''} ${p.tags ? (Array.isArray(p.tags) ? p.tags.join(' ') : p.tags) : ''}`)
  );
  const mSwarm = swarmJobs.filter(j =>
    overlaps(toks, `${j.name || ''} ${j.title || ''} ${j.description || ''} ${j.type || ''} ${j.target || ''} ${j.tags ? (Array.isArray(j.tags) ? j.tags.join(' ') : j.tags) : ''}`)
  );
  const mReports = reports.filter(r =>
    overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.summary || ''} ${r.description || ''} ${r.category || ''} ${r.tags ? (Array.isArray(r.tags) ? r.tags.join(' ') : r.tags) : ''}`)
  );

  const hasIntel  = mIntel.length > 0;
  const hasSwarm  = mSwarm.length > 0;
  const hasReport = mReports.length > 0;

  let cls;
  if (hasIntel && hasSwarm && hasReport)  cls = 'EXECUTING';
  else if (hasIntel && hasSwarm)          cls = 'ORCHESTRATED';
  else if (hasSwarm)                      cls = 'SWARMED';
  else                                    cls = 'DORMANT';

  return { node, cls, mIntel, mSwarm, mReports };
}

export default function GraphIntelSwarmReportAudit() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [graphRaw, intelRaw, swarmRaw, reportsRaw] = await Promise.all([
        fetcher('/v1/graph/centrality'),
        fetcher('/entities/IntelProfile'),
        fetcher('/entities/SwarmJob'),
        fetcher('/v1/reports'),
      ]);

      const nodes   = normalizeArray(graphRaw,   ['nodes', 'entities', 'data', 'items', 'results']);
      const intel   = normalizeArray(intelRaw,   ['intel_profiles', 'profiles', 'data', 'items', 'results']);
      const swarm   = normalizeArray(swarmRaw,   ['swarm_jobs', 'jobs', 'data', 'items', 'results']);
      const reports = normalizeArray(reportsRaw, ['reports', 'data', 'items', 'results']);

      setRows(nodes.map(n => classifyNode(n, intel, swarm, reports)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:gisraud-toggle', handler);
    return () => window.removeEventListener('jarvis:gisraud-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    EXECUTING:    rows.filter(r => r.cls === 'EXECUTING').length,
    ORCHESTRATED: rows.filter(r => r.cls === 'ORCHESTRATED').length,
    SWARMED:      rows.filter(r => r.cls === 'SWARMED').length,
    DORMANT:      rows.filter(r => r.cls === 'DORMANT').length,
  };

  const intelCount   = rows.reduce((n, r) => n + r.mIntel.length,   0);
  const swarmCount   = rows.reduce((n, r) => n + r.mSwarm.length,   0);
  const reportsCount = rows.reduce((n, r) => n + r.mReports.length, 0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return nodeLabel(r.node).toLowerCase().includes(s) ||
             (r.node.type || r.node.category || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Graph Nodes: ${rows.length}. Executing: ${counts.EXECUTING}. Orchestrated: ${counts.ORCHESTRATED}. Swarmed: ${counts.SWARMED}. Dormant: ${counts.DORMANT}.`;
    const prompt = `JARVIS graph–intel–swarm–report execution audit: ${summary}. Identify the most critical DORMANT graph nodes — those with no intel attribution, no swarm automation, and no filed report — full execution blind spots. Provide a 2-sentence advisory on the highest-risk dormant nodes and priority actions to close the intelligence execution gap.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 117240, zIndex: 220,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ GISRAUD</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ GISRAUD</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Graph × IntelProfile × SwarmJob × Report — Intelligence Execution Audit</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'NODES',        val: rows.length,         color: '#94a3b8' },
          { label: 'INTEL',        val: intelCount,          color: '#c4b5fd' },
          { label: 'SWARM JOBS',   val: swarmCount,          color: '#F97316' },
          { label: 'REPORTS',      val: reportsCount,        color: '#22D3EE' },
          { label: 'EXECUTING',    val: counts.EXECUTING,    color: CLS_COLOR.EXECUTING },
          { label: 'ORCHESTRATED', val: counts.ORCHESTRATED, color: CLS_COLOR.ORCHESTRATED },
          { label: 'SWARMED',      val: counts.SWARMED,      color: CLS_COLOR.SWARMED },
          { label: 'DORMANT',      val: counts.DORMANT,      color: CLS_COLOR.DORMANT, pulse: counts.DORMANT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'gisraud-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search nodes…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nodeLabel(r.node)}
                </span>
                {(r.node.type || r.node.category) && (
                  <span style={{ background: '#100820', border: '1px solid #3b0764', color: '#c4b5fd', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.node.type || r.node.category}
                  </span>
                )}
                {r.node.centrality != null && (
                  <span style={{ background: '#051015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    c:{typeof r.node.centrality === 'number' ? r.node.centrality.toFixed(3) : r.node.centrality}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mIntel.length > 0 && (
                    <div>
                      <div style={{ color: '#c4b5fd', fontSize: 10, marginBottom: 3 }}>INTEL PROFILES ({r.mIntel.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mIntel.slice(0, 8).map((p, k) => (
                          <span key={k} style={{ background: '#100820', border: '1px solid #3b0764', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {p.name || p.title || p.id}
                            {(p.category || p.type) && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{p.category || p.type}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSwarm.length > 0 && (
                    <div>
                      <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>SWARM JOBS ({r.mSwarm.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSwarm.slice(0, 8).map((j, k) => (
                          <span key={k} style={{ background: '#180800', border: '1px solid #7c2d12', color: '#F97316', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {j.name || j.title || j.id}
                            {j.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{j.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rp, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rp.title || rp.name || rp.id}
                            {(rp.date || rp.created_at) && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(rp.date || rp.created_at || '').slice(0, 10)}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mIntel.length === 0 && r.mSwarm.length === 0 && r.mReports.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No intel profile, swarm job, or report match — execution blind spot with no attribution, no automation, and no filed report.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes gisraud-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
