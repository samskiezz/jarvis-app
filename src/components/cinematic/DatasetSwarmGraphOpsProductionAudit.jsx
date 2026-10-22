/**
 * DatasetSwarmGraphOpsProductionAudit — F108
 *
 * Fetches /v1/datasets + /entities/SwarmJob + /v1/graph/centrality + /v1/ops/alerts.
 *
 * Keyword-matches each dataset (name/description/tags) against swarm job
 * names/types, graph node labels/types, and ops alert titles/messages
 * to classify:
 *
 *   PRODUCING  — dataset matches swarm job AND graph node AND ops alert
 *                (fully event-driven: automation running, graph traced, alert monitored)
 *   PROCESSING — dataset matches swarm job + at least one other source
 *                (automation backing but partially unmonitored)
 *   MONITORED  — dataset matches graph node or ops alert but NO swarm job
 *                (observed but not automated)
 *   ORPHAN     — no match to any source (isolated datasets — full data blind spots)
 *
 * Toggle: ◈ DSGPROD button (fixed, bottom strip) left:108840, zIndex:205
 * Stat tiles: datasets / swarm jobs / graph nodes / ops alerts / producing / processing / monitored / orphan
 * Amber pulse on ORPHAN count (isolated datasets with zero automation, graph, or alert coverage).
 * Expandable rows: matched swarm jobs with status badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / PRODUCING / PROCESSING / MONITORED / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dsgprod"/"dataset production"/"dataset swarm graph"/"event driven production"
 *        "orphan datasets"/"dataset automation"/"dataset ops alert"/"dataset graph production"
 *        "dataset swarm ops"/"production audit"/"data production audit"/"dataset blind spot"
 *        "isolated datasets"/"dataset event audit"/"data event driven"
 * Event: jarvis:dsgprod-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'PRODUCING', 'PROCESSING', 'MONITORED', 'ORPHAN'];

const CLS_COLOR = {
  PRODUCING:   '#22C55E',
  PROCESSING:  '#38BDF8',
  MONITORED:   '#F97316',
  ORPHAN:      '#F59E0B',
};

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

export function isDsgprodQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'dsgprod', 'dataset production', 'dataset swarm graph', 'event driven production',
    'orphan datasets', 'dataset automation', 'dataset ops alert', 'dataset graph production',
    'dataset swarm ops', 'production audit', 'data production audit', 'dataset blind spot',
    'isolated datasets', 'dataset event audit', 'data event driven',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(ds, swarmJobs, graphNodes, opsAlerts) {
  const toks = tokens(`${ds.name || ''} ${ds.description || ''} ${(ds.tags || []).join(' ')}`);
  const mJobs   = swarmJobs.filter(j => overlaps(toks, `${j.name || ''} ${j.type || ''} ${j.status || ''}`));
  const mNodes  = graphNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''}`));
  const mAlerts = opsAlerts.filter(a => overlaps(toks, `${a.title || ''} ${a.message || ''} ${a.type || ''}`));

  let cls;
  if (mJobs.length && mNodes.length && mAlerts.length) cls = 'PRODUCING';
  else if (mJobs.length && (mNodes.length || mAlerts.length)) cls = 'PROCESSING';
  else if (mNodes.length || mAlerts.length) cls = 'MONITORED';
  else cls = 'ORPHAN';

  return { ds, cls, mJobs, mNodes, mAlerts };
}

export default function DatasetSwarmGraphOpsProductionAudit() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [dsRaw, swarmRaw, graphRaw, alertsRaw] = await Promise.all([
        fetcher('/v1/datasets'),
        fetcher('/entities/SwarmJob'),
        fetcher('/v1/graph/centrality'),
        fetcher('/v1/ops/alerts'),
      ]);

      const datasets  = normalizeArray(dsRaw,   ['datasets', 'data', 'items', 'results']);
      const swarmJobs = normalizeArray(swarmRaw, ['jobs', 'swarmJobs', 'data', 'items', 'results']);
      const graphNodes = normalizeArray(graphRaw, ['nodes', 'centrality', 'data', 'items', 'results']);
      const opsAlerts  = normalizeArray(alertsRaw, ['alerts', 'data', 'items', 'results']);

      setRows(datasets.map(ds => classify(ds, swarmJobs, graphNodes, opsAlerts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:dsgprod-toggle', handler);
    return () => window.removeEventListener('jarvis:dsgprod-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    PRODUCING:  rows.filter(r => r.cls === 'PRODUCING').length,
    PROCESSING: rows.filter(r => r.cls === 'PROCESSING').length,
    MONITORED:  rows.filter(r => r.cls === 'MONITORED').length,
    ORPHAN:     rows.filter(r => r.cls === 'ORPHAN').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.ds.name || '').toLowerCase().includes(s) ||
             (r.ds.description || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Datasets: ${rows.length}. Producing: ${counts.PRODUCING}. Processing: ${counts.PROCESSING}. Monitored: ${counts.MONITORED}. Orphan: ${counts.ORPHAN}.`;
    const prompt = `JARVIS dataset-swarm-graph-ops production audit: ${summary}. Identify the most critical orphaned datasets with no automation, graph, or alert coverage. Provide 2-sentence advisory.`;
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
          position: 'fixed', bottom: 8, left: 108840, zIndex: 205,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ DSGPROD</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 205, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ DSGPROD</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Dataset × SwarmJob × Graph × Ops Alert — Event-Driven Production Audit</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #F59E0B55', color: '#F59E0B', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'DATASETS', val: rows.length, color: '#94a3b8' },
          { label: 'PRODUCING', val: counts.PRODUCING, color: CLS_COLOR.PRODUCING },
          { label: 'PROCESSING', val: counts.PROCESSING, color: CLS_COLOR.PROCESSING },
          { label: 'MONITORED', val: counts.MONITORED, color: CLS_COLOR.MONITORED },
          {
            label: 'ORPHAN', val: counts.ORPHAN, color: CLS_COLOR.ORPHAN,
            pulse: counts.ORPHAN > 0,
          },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'dsgprod-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B44', borderRadius: 5, fontSize: 11, color: '#fde68a', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#F59E0B22' : 'none',
            border: `1px solid ${tab === t ? '#F59E0B' : '#1e293b'}`,
            color: tab === t ? '#F59E0B' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
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
                  {r.ds.name || r.ds.id || '(unnamed)'}
                </span>
                {r.ds.row_count != null && (
                  <span style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.ds.row_count.toLocaleString()} rows
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.ds.description && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.ds.description}</div>
                  )}
                  {r.mJobs.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>SWARM JOBS ({r.mJobs.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mJobs.slice(0, 8).map((j, k) => (
                          <span key={k} style={{ background: '#0c1a2e', border: '1px solid #0e4f6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {j.name || j.id}
                            {j.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> {j.status}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.id}
                            {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> c:{Number(n.centrality).toFixed(2)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((a, k) => (
                          <span key={k} style={{ background: '#1c0707', border: '1px solid #7c2d12', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.id}
                            {a.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {a.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mJobs.length === 0 && r.mNodes.length === 0 && r.mAlerts.length === 0 && (
                    <div style={{ color: '#F59E0B', fontSize: 10 }}>No swarm job, graph node, or ops alert match — isolated dataset.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes dsgprod-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
