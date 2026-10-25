/**
 * LiveIntelBrainGraphKnowledgeRiskOpsConvergence — F188
 *
 * Fetches /functions/getLiveIntel + /v1/cinematic/brain + /v1/graph/centrality
 *         + /knowledge/ + /entities/RiskSignal + /v1/ops/alerts
 *
 * Groups live events by category (quake region, crypto symbol, FX pair) and
 * keyword-cross-references each category against brain nodes, graph nodes,
 * knowledge articles, risk signals, and ops alerts to classify:
 *
 *   CONVERGED  — live event category matches all 5 secondary sources (full intel saturation)
 *   SENSING    — matches 3–4 secondary sources
 *   SIGNALED   — matches 1–2 secondary sources
 *   BLIND      — no match across any secondary source (full situational blind spot)
 *
 * Toggle: ◈ LBGKRS button (fixed, bottom strip) left:153640, zIndex:285
 * Stat tiles: events / brain / nodes / articles / signals / alerts /
 *             converged / sensing / signaled / blind
 * Red pulse on BLIND count (live events with zero intelligence saturation).
 * Expandable rows: matched brain nodes with type badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched knowledge articles with category badge +
 *                  matched risk signals with severity badge +
 *                  matched ops alerts with severity badge
 * Filter tabs: ALL / CONVERGED / SENSING / SIGNALED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "lbgkrs"/"situational convergence"/"intel convergence"
 *        "live intel convergence"/"brain graph knowledge"/"full situational"
 *        "situational intelligence"/"blind live event"/"live intel brain"
 * Event: jarvis:lbgkrs-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CONVERGED', 'SENSING', 'SIGNALED', 'BLIND'];

const CLS_COLOR = {
  CONVERGED: '#22C55E',
  SENSING:   '#38BDF8',
  SIGNALED:  '#F97316',
  BLIND:     '#EF4444',
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

function extractCategories(liveData) {
  const cats = new Map();
  const quakes = normalizeArray(liveData?.earthquakes, ['earthquakes', 'items', 'data']);
  quakes.forEach(q => {
    const key = (q.region || q.location || q.place || 'unknown_region').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
    const label = q.region || q.location || q.place || 'Unknown Region';
    if (!cats.has(key)) cats.set(key, { key, label, type: 'quake', items: [] });
    cats.get(key).items.push(q);
  });
  const crypto = normalizeArray(liveData?.crypto, ['crypto', 'cryptocurrency', 'items', 'data']);
  crypto.forEach(c => {
    const sym = (c.symbol || c.id || 'unknown').toUpperCase();
    const key = `crypto_${sym.toLowerCase()}`;
    if (!cats.has(key)) cats.set(key, { key, label: sym, type: 'crypto', items: [] });
    cats.get(key).items.push(c);
  });
  const fx = normalizeArray(liveData?.forex || liveData?.fx, ['forex', 'fx', 'items', 'data']);
  fx.forEach(f => {
    const pair = (f.pair || f.symbol || f.id || 'unknown').toUpperCase();
    const key = `fx_${pair.toLowerCase()}`;
    if (!cats.has(key)) cats.set(key, { key, label: pair, type: 'fx', items: [] });
    cats.get(key).items.push(f);
  });
  return Array.from(cats.values());
}

function classify(cat, brainNodes, graphNodes, knowledgeItems, signals, alerts) {
  const toks = tokens(cat.label);
  const mBrain   = brainNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.description || ''} ${n.name || ''}`));
  const mGraph   = graphNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.description || ''} ${n.name || ''} ${n.id || ''}`));
  const mKnow    = knowledgeItems.filter(k => overlaps(toks, `${k.title || ''} ${k.name || ''} ${k.summary || ''} ${k.content || ''} ${k.category || ''}`));
  const mSignals = signals.filter(s => overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.category || ''} ${s.type || ''}`));
  const mAlerts  = alerts.filter(a => overlaps(toks, `${a.name || ''} ${a.title || ''} ${a.message || ''} ${a.description || ''} ${a.category || ''}`));

  const matched = [
    mBrain.length > 0,
    mGraph.length > 0,
    mKnow.length > 0,
    mSignals.length > 0,
    mAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (matched === 5)      cls = 'CONVERGED';
  else if (matched >= 3)  cls = 'SENSING';
  else if (matched >= 1)  cls = 'SIGNALED';
  else                    cls = 'BLIND';

  return { cat, cls, mBrain, mGraph, mKnow, mSignals, mAlerts };
}

export function isLbgkrsQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'lbgkrs', 'situational convergence', 'intel convergence',
    'live intel convergence', 'brain graph knowledge',
    'full situational', 'situational intelligence',
    'blind live event', 'live intel brain', 'live brain graph',
    'intelligence convergence', 'live convergence',
  ].some(kw => s.includes(kw));
}

export function buildLbgkrsScript(stats) {
  return `LBGKRS: ${stats.events} live event categories | ${stats.converged} CONVERGED | ${stats.sensing} SENSING | ${stats.signaled} SIGNALED | ${stats.blind} BLIND (full situational blind spots). Sources: ${stats.brain} brain nodes, ${stats.nodes} graph nodes, ${stats.articles} knowledge articles, ${stats.signals} risk signals, ${stats.alerts} ops alerts. Identify the most dangerous blind live event categories with zero intelligence saturation and recommend immediate situational awareness actions.`;
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export default function LiveIntelBrainGraphKnowledgeRiskOpsConvergence() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({ events:0, brain:0, nodes:0, articles:0, signals:0, alerts:0, converged:0, sensing:0, signaled:0, blind:0 });
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [liRaw, brRaw, grRaw, kwRaw, rsRaw, oaRaw] = await Promise.all([
        fetcher('/functions/getLiveIntel'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/v1/graph/centrality'),
        fetcher('/knowledge/'),
        fetcher('/entities/RiskSignal'),
        fetcher('/v1/ops/alerts'),
      ]);

      const categories    = extractCategories(liRaw);
      const brainNodes    = normalizeArray(brRaw, ['nodes','items','data','brain','graph']);
      const graphNodes    = normalizeArray(grRaw, ['nodes','centrality','items','data','results']);
      const knowledgeItems = normalizeArray(kwRaw, ['items','articles','knowledge','data','results']);
      const signals       = normalizeArray(rsRaw, ['signals','items','data','results','risk_signals']);
      const alerts        = normalizeArray(oaRaw, ['alerts','items','data','results','ops_alerts']);

      const classified = categories.map(cat =>
        classify(cat, brainNodes, graphNodes, knowledgeItems, signals, alerts)
      );
      setRows(classified);
      setStats({
        events:    categories.length,
        brain:     brainNodes.length,
        nodes:     graphNodes.length,
        articles:  knowledgeItems.length,
        signals:   signals.length,
        alerts:    alerts.length,
        converged: classified.filter(r => r.cls === 'CONVERGED').length,
        sensing:   classified.filter(r => r.cls === 'SENSING').length,
        signaled:  classified.filter(r => r.cls === 'SIGNALED').length,
        blind:     classified.filter(r => r.cls === 'BLIND').length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:lbgkrs-toggle', handler);
    return () => window.removeEventListener('jarvis:lbgkrs-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const summary = buildLbgkrsScript(stats);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Full situational intelligence convergence assessment: ${summary}` }),
      });
      const d = await r.json();
      const text = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.cat.label || '').toLowerCase().includes(s)
          || (r.cat.type || '').toLowerCase().includes(s)
          || (r.cat.key || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 153640, zIndex: 285,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 10, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >◈ LBGKRS</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 20, zIndex: 9900,
      width: 900, maxHeight: '82vh',
      background: 'rgba(2,6,23,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(239,68,68,0.12)',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#ef4444', fontSize: 14 }}>◈</span>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>LBGKRS</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>LiveIntel × Brain × Graph × Knowledge × RiskSignal × Ops Alert — Situational Convergence</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={assess} disabled={assessing}
            style={{ background: '#1e40af', border: 'none', color: '#bfdbfe', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
          >{assessing ? '…' : '▶ ASSESS'}</button>
          <button onClick={() => load()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap', borderBottom: '1px solid #1e3a5f' }}>
        {[
          ['EVENTS',    stats.events,    '#94a3b8'],
          ['BRAIN',     stats.brain,     '#64748b'],
          ['NODES',     stats.nodes,     '#64748b'],
          ['ARTICLES',  stats.articles,  '#64748b'],
          ['SIGNALS',   stats.signals,   '#64748b'],
          ['ALERTS',    stats.alerts,    '#64748b'],
          ['CONVERGED', stats.converged, CLS_COLOR.CONVERGED],
          ['SENSING',   stats.sensing,   CLS_COLOR.SENSING],
          ['SIGNALED',  stats.signaled,  CLS_COLOR.SIGNALED],
          ['BLIND',     stats.blind,     CLS_COLOR.BLIND],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: '#0f172a', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 56,
          }}>
            <div style={{ color, fontSize: 15, fontWeight: 700, ...(label === 'BLIND' && val > 0 ? {
              animation: 'lbgkrs-pulse 1.4s ease-in-out infinite',
            } : {}) }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1e3a5f' : '#0f172a',
            border: `1px solid ${tab === t ? '#3b82f6' : '#1e293b'}`,
            color: tab === t ? '#bfdbfe' : '#64748b',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 140 }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>loading…</div>}
        {error   && <div style={{ color: '#ef4444', textAlign: 'center', padding: 8 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>no results</div>
        )}
        {visible.map((r, i) => {
          const id = r.cat.key || i;
          const ex = expanded[id];
          const typeColor = r.cat.type === 'quake' ? '#a78bfa' : r.cat.type === 'crypto' ? '#fbbf24' : '#34d399';
          return (
            <div key={id} style={{ borderBottom: '1px solid #0f172a' }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
                  cursor: 'pointer', background: ex ? '#0f172a' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 10, minWidth: 88 }}>{r.cls}</span>
                <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.cat.label}
                </span>
                <span style={{ background: '#1e293b', color: typeColor, borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                  {r.cat.type}
                </span>
                {r.cat.items && r.cat.items.length > 0 && (
                  <span style={{ background: '#0f172a', color: '#64748b', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.cat.items.length} events
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{ex ? '▲' : '▼'}</span>
              </div>
              {ex && (
                <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.mBrain.length > 0 && (
                    <div>
                      <div style={{ color: '#c084fc', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mBrain.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mBrain.slice(0, 8).map((n, j) => (
                          <span key={j} style={{ background: '#1a0b2e', border: '1px solid #6b21a8', color: '#d8b4fe', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.type && <span style={{ color: '#94a3b8', fontSize: 9 }}> {n.type}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mGraph.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mGraph.slice(0, 8).map((n, j) => (
                          <span key={j} style={{ background: '#0c1a2e', border: '1px solid #0e4f6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {typeof n.centrality === 'number' && <span style={{ color: '#94a3b8', fontSize: 9 }}> c:{n.centrality.toFixed(3)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mKnow.length > 0 && (
                    <div>
                      <div style={{ color: '#86efac', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE ARTICLES ({r.mKnow.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mKnow.slice(0, 8).map((k, j) => (
                          <span key={j} style={{ background: '#0a1e0e', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {k.title || k.name || k.id}
                            {k.category && <span style={{ color: '#94a3b8', fontSize: 9 }}> {k.category}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSignals.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mSignals.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSignals.slice(0, 8).map((s, j) => (
                          <span key={j} style={{ background: '#1c0505', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {s.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#fb923c', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((a, j) => (
                          <span key={j} style={{ background: '#1c0e00', border: '1px solid #78350f', color: '#fdba74', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.name || a.title || a.message || a.id}
                            {a.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {a.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mBrain.length === 0 && r.mGraph.length === 0 && r.mKnow.length === 0 && r.mSignals.length === 0 && r.mAlerts.length === 0 && (
                    <div style={{ color: '#ef4444', fontSize: 10 }}>No brain node, graph node, knowledge article, risk signal, or ops alert match — full situational blind spot with zero intelligence saturation.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes lbgkrs-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
