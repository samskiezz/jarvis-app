/**
 * ContactReportKnowledgeGraphAlertDistribution — F133
 *
 * 5-source intelligence distribution audit.
 * Fetches /entities/Contact + /v1/reports + /knowledge/
 *         + /v1/graph/centrality + /v1/ops/alerts
 *
 * Keyword-matches each contact against reports, knowledge articles,
 * graph centrality nodes, and ops alerts to classify intelligence
 * distribution:
 *
 *   DISTRIBUTED — matches all 4 other sources
 *                 (contact fully embedded in the intelligence fabric)
 *   ACTIVE      — matches 2–3 other sources
 *                 (active contact with partial intelligence coverage)
 *   LINKED      — matches exactly 1 other source
 *                 (weakly linked — minimal intelligence footprint)
 *   GHOST       — no match to any source
 *                 (invisible actor — zero intelligence distribution)
 *
 * Toggle: ◈ CRKOA button (fixed, bottom strip) left:122840, zIndex:230
 * Stat tiles: contacts / reports / articles / graph / alerts /
 *             distributed / active / linked / ghost
 * Red pulse on GHOST count (invisible actors with zero intelligence footprint).
 * Expandable rows: matched reports with date badge +
 *                  matched knowledge articles with category badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / DISTRIBUTED / ACTIVE / LINKED / GHOST + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "crkoa"/"contact distribution"/"contact intel distribution"
 *        "contact coverage audit"/"ghost contacts"/"invisible contacts"
 *        "contact intelligence"/"contact knowledge report"/"contact graph"
 *        "contact ops alert"/"contact footprint"/"zero footprint contacts"
 *        "contact grounding"/"contact audit"/"intelligence distribution"
 * Event: jarvis:crkoa-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DISTRIBUTED', 'ACTIVE', 'LINKED', 'GHOST'];

const CLS_COLOR = {
  DISTRIBUTED: '#22C55E',
  ACTIVE:      '#3B82F6',
  LINKED:      '#F59E0B',
  GHOST:       '#EF4444',
};

export function isCrkoaQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'crkoa', 'contact distribution', 'contact intel distribution',
    'contact coverage audit', 'ghost contacts', 'invisible contacts',
    'contact intelligence', 'contact knowledge report', 'contact graph',
    'contact ops alert', 'contact footprint', 'zero footprint contacts',
    'contact grounding', 'contact audit', 'intelligence distribution',
    'contact report knowledge', 'contact report graph', 'contact report alert',
    'distributed contacts', 'active contacts audit', 'contact nexus audit',
    'contact five source', 'contact 5 source', 'contact full coverage',
  ].some(kw => s.includes(kw));
}

export function buildCrkoaScript(q) {
  return `JARVIS contact intelligence distribution audit triggered by: "${q}". Fetch /entities/Contact + /v1/reports + /knowledge/ + /v1/graph/centrality + /v1/ops/alerts. Classify each contact as DISTRIBUTED/ACTIVE/LINKED/GHOST. Report the GHOST count and the top 3 invisible actors with zero intelligence footprint.`;
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

function contactLabel(c) {
  return c.name || c.title || c.full_name || c.id || 'Unknown';
}

function contactTokens(c) {
  return tokens(
    `${c.name || ''} ${c.title || ''} ${c.full_name || ''} ${c.role || ''} ${c.org || ''} ${c.organization || ''} ${c.department || ''} ${c.email || ''} ${c.description || ''} ${c.tags ? (Array.isArray(c.tags) ? c.tags.join(' ') : c.tags) : ''} ${c.category || ''}`
  );
}

function classifyContact(c, reports, articles, graphNodes, alerts) {
  const toks = contactTokens(c);

  const mReports = reports.filter(r =>
    overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.description || ''} ${r.summary || ''} ${r.author || ''} ${r.tags ? (Array.isArray(r.tags) ? r.tags.join(' ') : r.tags) : ''} ${r.category || ''} ${r.type || ''}`)
  );
  const mArticles = articles.filter(a =>
    overlaps(toks, `${a.title || ''} ${a.name || ''} ${a.description || ''} ${a.content?.slice(0, 200) || ''} ${a.category || ''} ${a.type || ''} ${a.tags ? (Array.isArray(a.tags) ? a.tags.join(' ') : a.tags) : ''}`)
  );
  const mGraphNodes = graphNodes.filter(g =>
    overlaps(toks, `${g.label || ''} ${g.name || ''} ${g.id || ''} ${g.type || ''} ${g.category || ''} ${g.description || ''}`)
  );
  const mAlerts = alerts.filter(al =>
    overlaps(toks, `${al.title || ''} ${al.name || ''} ${al.message || ''} ${al.description || ''} ${al.type || ''} ${al.category || ''} ${al.source || ''} ${al.entity || ''}`)
  );

  const sourceCount = [mReports.length > 0, mArticles.length > 0, mGraphNodes.length > 0, mAlerts.length > 0].filter(Boolean).length;

  let cls;
  if (sourceCount >= 4)       cls = 'DISTRIBUTED';
  else if (sourceCount >= 2)  cls = 'ACTIVE';
  else if (sourceCount >= 1)  cls = 'LINKED';
  else                        cls = 'GHOST';

  return { c, cls, mReports, mArticles, mGraphNodes, mAlerts };
}

export default function ContactReportKnowledgeGraphAlertDistribution() {
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

  const reportCount  = rows.reduce((n, r) => n + r.mReports.length,    0);
  const articleCount = rows.reduce((n, r) => n + r.mArticles.length,   0);
  const graphCount   = rows.reduce((n, r) => n + r.mGraphNodes.length, 0);
  const alertCount   = rows.reduce((n, r) => n + r.mAlerts.length,     0);

  const counts = {
    DISTRIBUTED: rows.filter(r => r.cls === 'DISTRIBUTED').length,
    ACTIVE:      rows.filter(r => r.cls === 'ACTIVE').length,
    LINKED:      rows.filter(r => r.cls === 'LINKED').length,
    GHOST:       rows.filter(r => r.cls === 'GHOST').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [contactRaw, reportRaw, articleRaw, graphRaw, alertRaw] = await Promise.all([
        fetcher('/entities/Contact'),
        fetcher('/v1/reports'),
        fetcher('/knowledge/'),
        fetcher('/v1/graph/centrality'),
        fetcher('/v1/ops/alerts'),
      ]);

      const contacts   = normalizeArray(contactRaw,  ['contacts', 'data', 'items', 'results']);
      const reports    = normalizeArray(reportRaw,   ['reports', 'data', 'items', 'results']);
      const articles   = normalizeArray(articleRaw,  ['articles', 'knowledge', 'data', 'items', 'results']);
      const graphNodes = normalizeArray(graphRaw,    ['nodes', 'entities', 'data', 'items', 'results']);
      const alerts     = normalizeArray(alertRaw,    ['alerts', 'data', 'items', 'results']);

      setRows(contacts.map(c => classifyContact(c, reports, articles, graphNodes, alerts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:crkoa-toggle', handler);
    return () => window.removeEventListener('jarvis:crkoa-toggle', handler);
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
      return contactLabel(r.c).toLowerCase().includes(s) ||
             (r.c.role || r.c.org || r.c.organization || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Contacts: ${rows.length}. Distributed: ${counts.DISTRIBUTED}. Active: ${counts.ACTIVE}. Linked: ${counts.LINKED}. Ghost: ${counts.GHOST}.`;
    const prompt = `JARVIS contact intelligence distribution audit: ${summary}. Identify the most critical GHOST contacts — invisible actors with no filed report, no knowledge article, no graph trace, and no ops alert — representing zero intelligence footprint. Provide a 2-sentence advisory on the top ghost contacts and priority actions to integrate them into the intelligence fabric across reports, knowledge, graph, and alert coverage.`;
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
          position: 'fixed', bottom: 8, left: 122840, zIndex: 230,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ CRKOA</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 230, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ CRKOA</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Contact × Report × Knowledge × Graph × Ops Alert — Intelligence Distribution Audit (5-source)</span>
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
          { label: 'CONTACTS',    val: rows.length,          color: '#94a3b8' },
          { label: 'REPORTS',     val: reportCount,          color: '#F59E0B' },
          { label: 'KNOWLEDGE',   val: articleCount,         color: '#22D3EE' },
          { label: 'GRAPH',       val: graphCount,           color: '#A78BFA' },
          { label: 'ALERTS',      val: alertCount,           color: '#FB923C' },
          { label: 'DISTRIBUTED', val: counts.DISTRIBUTED,   color: CLS_COLOR.DISTRIBUTED },
          { label: 'ACTIVE',      val: counts.ACTIVE,        color: CLS_COLOR.ACTIVE },
          { label: 'LINKED',      val: counts.LINKED,        color: CLS_COLOR.LINKED },
          { label: 'GHOST',       val: counts.GHOST,         color: '#EF4444', pulse: counts.GHOST > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'crkoa-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          const dotColor = CLS_COLOR[r.cls];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${dotColor}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contactLabel(r.c)}
                </span>
                {(r.c.role || r.c.org || r.c.organization) && (
                  <span style={{ background: '#010a1a', border: '1px solid #1e3a5f', color: '#3B82F6', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.c.role || r.c.org || r.c.organization}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: dotColor, letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${dotColor}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rep, k) => (
                          <span key={k} style={{ background: '#110800', border: '1px solid #78350f', color: '#F59E0B', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rep.title || rep.name || rep.id}
                            {(rep.date || rep.created_at || rep.updated_at) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(rep.date || rep.created_at || rep.updated_at || '').toString().slice(0, 10)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mArticles.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE ({r.mArticles.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mArticles.slice(0, 8).map((a, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.name || a.id}
                            {(a.category || a.type) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{a.category || a.type}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mGraphNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mGraphNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mGraphNodes.slice(0, 8).map((g, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#A78BFA', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {g.label || g.name || g.id}
                            {(g.score !== undefined || g.centrality !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(g.score ?? g.centrality ?? '').toString().slice(0, 5)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#FB923C', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((al, k) => (
                          <span key={k} style={{ background: '#180900', border: '1px solid #7c2d12', color: '#FB923C', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {al.title || al.name || al.message || al.id}
                            {(al.severity || al.level || al.priority) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{al.severity || al.level || al.priority}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length === 0 && r.mArticles.length === 0 && r.mGraphNodes.length === 0 && r.mAlerts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No filed report, no knowledge article, no graph trace, no ops alert — invisible actor with zero intelligence footprint.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes crkoa-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
