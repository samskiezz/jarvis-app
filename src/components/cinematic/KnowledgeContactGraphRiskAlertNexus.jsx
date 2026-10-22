/**
 * KnowledgeContactGraphRiskAlertNexus — F130
 *
 * 5-source intelligence coverage nexus.
 * Fetches /knowledge/ + /entities/Contact + /v1/graph/centrality
 *         + /entities/RiskSignal + /v1/ops/alerts
 *
 * Keyword-matches each knowledge article against contacts, graph centrality
 * nodes, risk signals, and ops alerts to classify intelligence saturation:
 *
 *   SATURATED — matches all 5 sources (contact + graph + risk + alert)
 *               (fully active intelligence: owned, traced, signaled, alerted)
 *   ANCHORED  — matches 3+ sources (well-grounded but not fully saturated)
 *               (operationally active with partial coverage)
 *   PARTIAL   — matches 1–2 sources (some grounding but coverage gaps)
 *               (fragmented intelligence with blind spots)
 *   DARK      — no match to any source
 *               (orphaned knowledge — zero operational grounding)
 *
 * Toggle: ◈ KCRION button (fixed, bottom strip) left:121160, zIndex:227
 * Stat tiles: articles / contacts / graph-nodes / signals / alerts /
 *             saturated / anchored / partial / dark
 * Red pulse on DARK count (orphaned intelligence articles).
 * Expandable rows: matched contacts with role/org +
 *                  matched graph nodes with centrality score badge +
 *                  matched risk signals with severity badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / SATURATED / ANCHORED / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "kcrion"/"knowledge nexus"/"knowledge coverage nexus"
 *        "knowledge contact graph"/"knowledge risk alert"/"knowledge saturation"
 *        "dark knowledge"/"orphaned knowledge"/"knowledge dark"
 *        "intelligence saturation"/"knowledge grounding"/"knowledge coverage"
 *        "knowledge ops alert"/"knowledge signal"/"knowledge graph contact"
 *        "knowledge anchored"/"saturated knowledge"/"knowledge coverage audit"
 * Event: jarvis:kcrion-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SATURATED', 'ANCHORED', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  SATURATED: '#22C55E',
  ANCHORED:  '#3B82F6',
  PARTIAL:   '#F59E0B',
  DARK:      '#EF4444',
};

export function isKcrionQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'kcrion', 'knowledge nexus', 'knowledge coverage nexus',
    'knowledge contact graph', 'knowledge risk alert', 'knowledge saturation',
    'dark knowledge', 'orphaned knowledge', 'knowledge dark',
    'intelligence saturation', 'knowledge grounding', 'knowledge coverage',
    'knowledge ops alert', 'knowledge signal', 'knowledge graph contact',
    'knowledge anchored', 'saturated knowledge', 'knowledge coverage audit',
    'knowledge contact risk', 'knowledge 5 source', 'knowledge full coverage',
    'knowledge intelligence nexus', 'knowledge coverage map',
  ].some(kw => s.includes(kw));
}

export function buildKcrionScript(q) {
  return `JARVIS knowledge intelligence coverage nexus audit triggered by: "${q}". Fetch /knowledge/ + /entities/Contact + /v1/graph/centrality + /entities/RiskSignal + /v1/ops/alerts. Classify each knowledge article as SATURATED/ANCHORED/PARTIAL/DARK. Report the DARK count and top 3 orphaned knowledge articles with zero contact owner, graph trace, risk signal, or ops alert coverage.`;
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
  return a.title || a.name || a.article_title || a.description?.slice(0, 60) || a.id || 'Unknown';
}

function articleTokens(a) {
  return tokens(
    `${a.title || ''} ${a.name || ''} ${a.article_title || ''} ${a.description || ''} ${a.content?.slice(0, 200) || ''} ${a.category || ''} ${a.type || ''} ${a.tags ? (Array.isArray(a.tags) ? a.tags.join(' ') : a.tags) : ''} ${a.topic || ''}`
  );
}

function classifyArticle(a, contacts, graphNodes, riskSignals, alerts) {
  const toks = articleTokens(a);

  const mContacts = contacts.filter(c =>
    overlaps(toks, `${c.name || ''} ${c.full_name || ''} ${c.role || ''} ${c.org || ''} ${c.organization || ''} ${c.bio || ''} ${c.description || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''}`)
  );
  const mGraph = graphNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.type || ''} ${n.category || ''} ${n.description || ''}`)
  );
  const mRisk = riskSignals.filter(r =>
    overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.description || ''} ${r.category || ''} ${r.type || ''} ${r.source || ''} ${r.signal || ''}`)
  );
  const mAlerts = alerts.filter(al =>
    overlaps(toks, `${al.title || ''} ${al.name || ''} ${al.message || ''} ${al.description || ''} ${al.type || ''} ${al.category || ''} ${al.source || ''}`)
  );

  const sourceCount = [mContacts.length > 0, mGraph.length > 0, mRisk.length > 0, mAlerts.length > 0].filter(Boolean).length;

  let cls;
  if (sourceCount >= 4)       cls = 'SATURATED';
  else if (sourceCount >= 3)  cls = 'ANCHORED';
  else if (sourceCount >= 1)  cls = 'PARTIAL';
  else                        cls = 'DARK';

  return { a, cls, mContacts, mGraph, mRisk, mAlerts };
}

export default function KnowledgeContactGraphRiskAlertNexus() {
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

  const contactCount = rows.reduce((n, r) => n + r.mContacts.length, 0);
  const graphCount   = rows.reduce((n, r) => n + r.mGraph.length,    0);
  const riskCount    = rows.reduce((n, r) => n + r.mRisk.length,     0);
  const alertCount   = rows.reduce((n, r) => n + r.mAlerts.length,   0);

  const counts = {
    SATURATED: rows.filter(r => r.cls === 'SATURATED').length,
    ANCHORED:  rows.filter(r => r.cls === 'ANCHORED').length,
    PARTIAL:   rows.filter(r => r.cls === 'PARTIAL').length,
    DARK:      rows.filter(r => r.cls === 'DARK').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [knowRaw, contactRaw, graphRaw, riskRaw, alertRaw] = await Promise.all([
        fetcher('/knowledge/'),
        fetcher('/entities/Contact'),
        fetcher('/v1/graph/centrality'),
        fetcher('/entities/RiskSignal'),
        fetcher('/v1/ops/alerts'),
      ]);

      const articles  = normalizeArray(knowRaw,    ['articles', 'knowledge', 'data', 'items', 'results']);
      const contacts  = normalizeArray(contactRaw, ['contacts', 'data', 'items', 'results']);
      const graphNodes= normalizeArray(graphRaw,   ['nodes', 'data', 'items', 'results']);
      const riskSigs  = normalizeArray(riskRaw,    ['signals', 'risks', 'data', 'items', 'results']);
      const alerts    = normalizeArray(alertRaw,   ['alerts', 'data', 'items', 'results']);

      setRows(articles.map(a => classifyArticle(a, contacts, graphNodes, riskSigs, alerts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:kcrion-toggle', handler);
    return () => window.removeEventListener('jarvis:kcrion-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return articleLabel(r.a).toLowerCase().includes(s) ||
             (r.a.category || r.a.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Knowledge articles: ${rows.length}. Saturated: ${counts.SATURATED}. Anchored: ${counts.ANCHORED}. Partial: ${counts.PARTIAL}. Dark: ${counts.DARK}.`;
    const prompt = `JARVIS knowledge intelligence coverage nexus audit: ${summary}. Identify the most critical DARK knowledge articles — those with no contact owner, no graph trace, no risk signal, and no ops alert coverage — representing full intelligence dead-ends. Provide a 2-sentence advisory on the top dark articles and priority actions to bring them into full intelligence saturation across contacts, graph, risk signals, and operational alerts.`;
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
          position: 'fixed', bottom: 8, left: 121160, zIndex: 227,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ KCRION</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 227, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ KCRION</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Knowledge × Contact × Graph × RiskSignal × Ops Alert — Intelligence Coverage Nexus (5-source)</span>
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
          { label: 'ARTICLES',  val: rows.length,       color: '#94a3b8' },
          { label: 'CONTACTS',  val: contactCount,      color: '#22D3EE' },
          { label: 'GRAPH',     val: graphCount,        color: '#a78bfa' },
          { label: 'SIGNALS',   val: riskCount,         color: '#F97316' },
          { label: 'ALERTS',    val: alertCount,        color: '#F59E0B' },
          { label: 'SATURATED', val: counts.SATURATED,  color: CLS_COLOR.SATURATED },
          { label: 'ANCHORED',  val: counts.ANCHORED,   color: CLS_COLOR.ANCHORED },
          { label: 'PARTIAL',   val: counts.PARTIAL,    color: CLS_COLOR.PARTIAL },
          { label: 'DARK',      val: counts.DARK,       color: CLS_COLOR.DARK, pulse: counts.DARK > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'kcrion-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search articles…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
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
                  {articleLabel(r.a)}
                </span>
                {r.a.category && (
                  <span style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.a.category}
                  </span>
                )}
                {r.a.type && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.a.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.full_name || c.id}
                            {(c.role || c.org || c.organization || c.company) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(c.role || c.title || '')}
                                {(c.org || c.organization || c.company) ? `@${(c.org || c.organization || c.company)}` : ''}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mGraph.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mGraph.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {(n.centrality !== undefined || n.score !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(n.centrality ?? n.score ?? '').toString().slice(0, 5)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mRisk.length > 0 && (
                    <div>
                      <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mRisk.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mRisk.slice(0, 8).map((sig, k) => (
                          <span key={k} style={{ background: '#150800', border: '1px solid #7c2d12', color: '#F97316', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sig.title || sig.name || sig.id}
                            {(sig.severity || sig.level || sig.priority) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{sig.severity || sig.level || sig.priority}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((al, k) => (
                          <span key={k} style={{ background: '#120a00', border: '1px solid #78350f', color: '#F59E0B', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {al.title || al.name || al.message?.slice(0, 40) || al.id}
                            {(al.severity || al.level || al.priority) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{al.severity || al.level || al.priority}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length === 0 && r.mGraph.length === 0 && r.mRisk.length === 0 && r.mAlerts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No contact owner, no graph trace, no risk signal, no ops alert — orphaned intelligence with zero operational grounding.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes kcrion-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
