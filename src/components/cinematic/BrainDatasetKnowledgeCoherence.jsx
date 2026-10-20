/**
 * BrainDatasetKnowledgeCoherence — F62
 *
 * Fetches /v1/cinematic/brain + /v1/datasets + /knowledge/
 * Extracts graph nodes from brain stats and keyword-matches each against
 * datasets AND knowledge articles to classify:
 *   COHERENT — node matched both a dataset AND a knowledge article (fully grounded)
 *   DATAED   — node matched a dataset only (data exists, no documented knowledge)
 *   KNOWN    — node matched knowledge only (documented, no backing dataset)
 *   DARK     — no match in either (blind-spot nodes)
 *
 * Toggle: ◈ BRNCOH button (fixed, bottom strip) left:83080, zIndex:159
 * Stat tiles: nodes / datasets / articles / coherent / dataed / known / dark
 * Amber pulse on DARK count.
 * Expandable rows: matched datasets with row-count badge + matched knowledge articles with category badge.
 * Filter tabs: ALL / COHERENT / DATAED / KNOWN / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "brncoh"/"brain coherence"/"brain dataset"/"brain knowledge"/
 *        "knowledge coherence"/"dataset coherence"/"brain coverage"/
 *        "intelligence coherence"/"brain grounding"/"dark nodes"
 * Event: jarvis:brncoh-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COHERENT', 'DATAED', 'KNOWN', 'DARK'];

const CLS_COLOR = {
  COHERENT: '#00FF88',
  DATAED:   '#38BDF8',
  KNOWN:    '#A78BFA',
  DARK:     '#FFB800',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function extractNodes(brainRaw) {
  // /v1/cinematic/brain returns graph stats with nodes list or top-level entity lists
  if (Array.isArray(brainRaw?.nodes)) return brainRaw.nodes;
  if (Array.isArray(brainRaw?.entities)) return brainRaw.entities;
  if (Array.isArray(brainRaw?.graph?.nodes)) return brainRaw.graph.nodes;
  // Fall back: derive synthetic node-like objects from brain stats keys
  const entries = [];
  const stats = brainRaw?.stats || brainRaw;
  if (stats && typeof stats === 'object') {
    for (const [k, v] of Object.entries(stats)) {
      if (typeof v === 'number' || typeof v === 'string') {
        entries.push({ id: k, name: k, value: v });
      }
    }
  }
  return entries;
}

function classify(nodeToks, datasets, articles) {
  const matchedDatasets = datasets.filter(d =>
    overlaps(nodeToks, [
      d.id, d.name, d.title, d.type, d.category,
      d.description, d.tags, d.domain, d.source,
    ].join(' '))
  );
  const matchedArticles = articles.filter(a =>
    overlaps(nodeToks, [
      a.id, a.name, a.title, a.category, a.type,
      a.content, a.summary, a.tags, a.domain, a.topic,
    ].join(' '))
  );
  const hasDataset = matchedDatasets.length > 0;
  const hasArticle = matchedArticles.length > 0;
  const cls = hasDataset && hasArticle ? 'COHERENT'
            : hasDataset               ? 'DATAED'
            : hasArticle               ? 'KNOWN'
            : 'DARK';
  return {
    cls,
    matchedDatasets: matchedDatasets.slice(0, 4),
    matchedArticles: matchedArticles.slice(0, 4),
  };
}

export function isBrncohQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('brncoh') ||
    s.includes('brain coherence') ||
    s.includes('brain dataset') ||
    s.includes('brain knowledge') ||
    s.includes('knowledge coherence') ||
    s.includes('dataset coherence') ||
    s.includes('brain coverage') ||
    s.includes('intelligence coherence') ||
    s.includes('brain grounding') ||
    s.includes('dark nodes')
  );
}

export default function BrainDatasetKnowledgeCoherence() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [brnRes, dsRes, knwRes] = await Promise.all([
        fetch(`${API}/v1/cinematic/brain`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/datasets`,         { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [brnRaw, dsRaw, knwRaw] = await Promise.all([
        brnRes.ok ? brnRes.json() : {},
        dsRes.ok  ? dsRes.json()  : {},
        knwRes.ok ? knwRes.json() : {},
      ]);

      const nodes    = extractNodes(brnRaw);
      const datasets = normalizeArray(dsRaw,  ['datasets', 'items', 'data', 'results']);
      const articles = normalizeArray(knwRaw, ['articles', 'items', 'data', 'results', 'knowledge']);

      const classified = nodes.map(node => {
        const label = [
          node.id, node.name, node.label, node.type,
          node.category, node.description, node.tags,
        ].join(' ');
        const toks = tokens(label);
        const { cls, matchedDatasets, matchedArticles } = classify(toks, datasets, articles);
        return { ...node, cls, matchedDatasets, matchedArticles, _label: label };
      });

      setRows(classified);
    } catch (_) {
      /* network error — leave existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:brncoh-toggle', handler);
    return () => window.removeEventListener('jarvis:brncoh-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setAssessment('');
    const darkCount     = rows.filter(r => r.cls === 'DARK').length;
    const coherentCount = rows.filter(r => r.cls === 'COHERENT').length;
    const prompt = `Jarvis, I have ${rows.length} brain graph nodes. ${darkCount} are DARK (no matching dataset or knowledge article). ${coherentCount} are fully COHERENT. Provide a 2-sentence operational advisory on improving intelligence coherence and grounding dark nodes.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.message || data.answer || data.content || '';
      setAssessment(text);
      if (text) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice: 'ash' }),
          });
        } catch (_) { /* TTS is best-effort */ }
      }
    } catch (_) { /* assessment failed */ } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    total:    rows.length,
    coherent: rows.filter(r => r.cls === 'COHERENT').length,
    dataed:   rows.filter(r => r.cls === 'DATAED').length,
    known:    rows.filter(r => r.cls === 'KNOWN').length,
    dark:     rows.filter(r => r.cls === 'DARK').length,
  };

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || (r._label || '').toLowerCase().includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 83080, zIndex: 159,
          background: 'rgba(255,184,0,0.08)', border: '1px solid #FFB80044',
          color: '#FFB800', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="Brain × Dataset × Knowledge Intelligence Coherence"
      >◈ BRNCOH</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 159,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FFB80033',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(255,184,0,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FFB80022',
          background: 'rgba(255,184,0,0.04)',
        }}>
          <span style={{ color: '#FFB800', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ BRNCOH — BRAIN INTELLIGENCE COHERENCE
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FFB80077', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FFB80066', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',    counts.total,    '#888'],
            ['COHERENT', counts.coherent, '#00FF88'],
            ['DATAED',   counts.dataed,   '#38BDF8'],
            ['KNOWN',    counts.known,    '#A78BFA'],
            ['DARK',     counts.dark,     '#FFB800', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${
                color === '#00FF88' ? '0,255,136'
                : color === '#38BDF8' ? '56,189,248'
                : color === '#A78BFA' ? '167,139,250'
                : color === '#FFB800' ? '255,184,0'
                : '136,136,136'
              },0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 68,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'brncoh-pulse 1.8s ease-in-out infinite' : 'none',
              }}>{val}</span>
              <span style={{ fontSize: 8, color: `${color}99`, letterSpacing: 1 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(255,184,0,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FFB800' : '#FFB80033'}`,
                color: tab === t ? '#FFB800' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,184,0,0.04)',
              border: '1px solid #FFB80033', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No brain nodes loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((node, idx) => {
            const id = node.id || node.name || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[node.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4,
                background: `rgba(${
                  color === '#00FF88' ? '0,255,136'
                  : color === '#38BDF8' ? '56,189,248'
                  : color === '#A78BFA' ? '167,139,250'
                  : '255,184,0'
                },0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 72 }}>{node.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {node.label || node.name || node.type || id}
                  </span>
                  {node.value !== undefined && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{String(node.value)}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {node.description && (
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 6, lineHeight: 1.5 }}>
                        {String(node.description).slice(0, 200)}
                      </div>
                    )}
                    {/* Matched Datasets */}
                    {node.matchedDatasets.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED DATASETS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {node.matchedDatasets.map((d, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {d.name || d.title || d.id}
                              {d.row_count !== undefined && (
                                <span style={{ color: '#38BDF877', marginLeft: 4 }}>{d.row_count}r</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Knowledge */}
                    {node.matchedArticles.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED KNOWLEDGE</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {node.matchedArticles.map((a, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {a.name || a.title || a.id}
                              {a.category && <span style={{ color: '#A78BFA77', marginLeft: 4 }}>{String(a.category).toUpperCase()}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {node.matchedDatasets.length === 0 && node.matchedArticles.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FFB80066' }}>No matching datasets or knowledge articles found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FFB80011' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.05)' : 'rgba(255,184,0,0.10)',
              border: '1px solid #FFB80055', color: '#FFB800',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS BRAIN COHERENCE'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,184,0,0.03)',
              border: '1px solid #FFB80022', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 83080, zIndex: 159,
          background: 'rgba(255,184,0,0.15)', border: '1px solid #FFB800',
          color: '#FFB800', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ BRNCOH ✕</button>

      <style>{`
        @keyframes brncoh-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
