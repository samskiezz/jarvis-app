/**
 * KnowledgeGraphOpsSwarmNetwork — F118
 *
 * Fetches /knowledge/ + /v1/graph/centrality + /v1/ops/alerts + /entities/SwarmJob.
 *
 * Keyword-matches each knowledge article (title/category/tags/content) against
 * graph centrality nodes, ops alerts, and swarm jobs to classify:
 *
 *   COVERED  — article matches graph AND ops-alert AND swarm-job
 *              (fully operational: modeled, monitored, and actively processed)
 *   MODELED  — article matches 2 of the 3 sources
 *              (partially grounded — missing one operational layer)
 *   ALERTED  — article matches only 1 of the 3 sources
 *              (thin presence — referenced somewhere but not fully integrated)
 *   DARK     — no match to any source
 *              (intelligence dead-end — no graph model, no alert, no automation)
 *
 * Toggle: ◈ KGONET button (fixed, bottom strip) left:114440, zIndex:215
 * Stat tiles: articles / nodes / alerts / swarm-jobs / covered / modeled / alerted / dark
 * Amber pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched graph nodes with centrality score badge +
 *                  matched ops alerts with severity badge +
 *                  matched swarm jobs with status badge.
 * Filter tabs: ALL / COVERED / MODELED / ALERTED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "kgonet"/"knowledge graph ops"/"knowledge coverage network"
 *        "knowledge graph alert"/"knowledge swarm"/"dark knowledge"
 *        "knowledge ops alert"/"knowledge automation"/"knowledge blind spot"
 *        "knowledge network"/"knowledge graph swarm"/"knowledge ops"
 * Event: jarvis:kgonet-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'MODELED', 'ALERTED', 'DARK'];

const CLS_COLOR = {
  COVERED: '#22C55E',
  MODELED: '#3B82F6',
  ALERTED: '#F97316',
  DARK:    '#F59E0B',
};

export function isKgonetQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'kgonet', 'knowledge graph ops', 'knowledge coverage network',
    'knowledge graph alert', 'knowledge swarm', 'dark knowledge',
    'knowledge ops alert', 'knowledge automation', 'knowledge blind spot',
    'knowledge network', 'knowledge graph swarm', 'knowledge ops',
  ].some(kw => s.includes(kw));
}

export function buildKgonetScript(q) {
  return `JARVIS knowledge coverage network audit triggered by: "${q}". Fetch /knowledge/ + /v1/graph/centrality + /v1/ops/alerts + /entities/SwarmJob. Classify each knowledge article as COVERED/MODELED/ALERTED/DARK. Report the dark count and top 3 intelligence dead-ends.`;
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

function articleLabel(a) {
  return a.title || a.name || a.slug || a.id || 'Unknown';
}

function articleTokens(a) {
  return tokens(
    `${a.title || ''} ${a.name || ''} ${a.category || ''} ${a.type || ''} ${(a.tags || []).join(' ')} ${a.summary || ''} ${a.content || ''}`
  );
}

function classifyArticle(article, nodes, alerts, swarmJobs) {
  const toks = articleTokens(article);

  const mNodes = nodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.id || ''} ${n.type || ''} ${n.category || ''}`)
  );
  const mAlerts = alerts.filter(al =>
    overlaps(toks, `${al.title || ''} ${al.name || ''} ${al.message || ''} ${al.category || ''} ${al.type || ''} ${al.source || ''}`)
  );
  const mJobs = swarmJobs.filter(j =>
    overlaps(toks, `${j.name || ''} ${j.title || ''} ${j.description || ''} ${j.type || ''} ${j.objective || ''} ${j.category || ''}`)
  );

  const matchCount = (mNodes.length > 0 ? 1 : 0) + (mAlerts.length > 0 ? 1 : 0) + (mJobs.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'COVERED';
  else if (matchCount === 2) cls = 'MODELED';
  else if (matchCount === 1) cls = 'ALERTED';
  else cls = 'DARK';

  return { article, cls, mNodes, mAlerts, mJobs };
}

export default function KnowledgeGraphOpsSwarmNetwork() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [knowledgeRaw, graphRaw, alertsRaw, swarmRaw] = await Promise.all([
        fetcher('/knowledge/'),
        fetcher('/v1/graph/centrality'),
        fetcher('/v1/ops/alerts'),
        fetcher('/entities/SwarmJob'),
      ]);

      const articles  = normalizeArray(knowledgeRaw,  ['articles', 'knowledge', 'items', 'data', 'results']);
      const nodes     = normalizeArray(graphRaw,       ['nodes', 'centrality', 'data', 'items', 'results']);
      const alerts    = normalizeArray(alertsRaw,      ['alerts', 'data', 'items', 'results']);
      const swarmJobs = normalizeArray(swarmRaw,       ['jobs', 'swarm_jobs', 'data', 'items', 'results']);

      setRows(articles.map(a => classifyArticle(a, nodes, alerts, swarmJobs)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:kgonet-toggle', handler);
    return () => window.removeEventListener('jarvis:kgonet-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    COVERED: rows.filter(r => r.cls === 'COVERED').length,
    MODELED: rows.filter(r => r.cls === 'MODELED').length,
    ALERTED: rows.filter(r => r.cls === 'ALERTED').length,
    DARK:    rows.filter(r => r.cls === 'DARK').length,
  };

  const nodeCount  = rows.reduce((n, r) => n + r.mNodes.length,  0);
  const alertCount = rows.reduce((n, r) => n + r.mAlerts.length, 0);
  const jobCount   = rows.reduce((n, r) => n + r.mJobs.length,   0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return articleLabel(r.article).toLowerCase().includes(s) ||
             (r.article.category || r.article.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Articles: ${rows.length}. Covered: ${counts.COVERED}. Modeled: ${counts.MODELED}. Alerted: ${counts.ALERTED}. Dark: ${counts.DARK}.`;
    const prompt = `JARVIS knowledge coverage network audit: ${summary}. Identify the most critical dark knowledge articles — those with no graph model, no ops alert coverage, and no swarm-job processing. Provide a 2-sentence advisory on the deepest intelligence dead-ends and priority actions to bring isolated knowledge into the operational network.`;
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
          position: 'fixed', bottom: 8, left: 114440, zIndex: 215,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ KGONET</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 215, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ KGONET</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Knowledge × Graph × Ops Alert × SwarmJob — Intelligence Coverage Network</span>
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
          { label: 'ARTICLES',  val: rows.length,    color: '#94a3b8' },
          { label: 'NODES',     val: nodeCount,      color: '#a78bfa' },
          { label: 'ALERTS',    val: alertCount,     color: '#f87171' },
          { label: 'SWARM JOBS',val: jobCount,       color: '#fbbf24' },
          { label: 'COVERED',   val: counts.COVERED, color: CLS_COLOR.COVERED },
          { label: 'MODELED',   val: counts.MODELED, color: CLS_COLOR.MODELED },
          { label: 'ALERTED',   val: counts.ALERTED, color: CLS_COLOR.ALERTED },
          { label: 'DARK',      val: counts.DARK,    color: CLS_COLOR.DARK, pulse: counts.DARK > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'kgonet-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search articles…"
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
                  {articleLabel(r.article)}
                </span>
                {r.article.category && (
                  <span style={{ background: '#071420', border: '1px solid #0e4d6b', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.article.category}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0e0720', border: '1px solid #4c1d95', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(+n.centrality).toFixed(3)}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((al, k) => (
                          <span key={k} style={{ background: '#200a0a', border: '1px solid #7f1d1d', color: '#f87171', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {al.title || al.name || al.message || al.id}
                            {al.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{al.severity}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mJobs.length > 0 && (
                    <div>
                      <div style={{ color: '#fbbf24', fontSize: 10, marginBottom: 3 }}>SWARM JOBS ({r.mJobs.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mJobs.slice(0, 8).map((j, k) => (
                          <span key={k} style={{ background: '#1a1000', border: '1px solid #78350f', color: '#fbbf24', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {j.name || j.title || j.id}
                            {j.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{j.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length === 0 && r.mAlerts.length === 0 && r.mJobs.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No graph, alert, or swarm match — intelligence dead-end with zero operational coverage.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes kgonet-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
