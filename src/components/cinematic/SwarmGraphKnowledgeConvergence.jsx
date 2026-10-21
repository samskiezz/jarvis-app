/**
 * SwarmGraphKnowledgeConvergence — F92
 *
 * Fetches /entities/SwarmJob + /v1/graph/centrality + /knowledge/.
 * Keyword-matches each swarm job against graph centrality nodes AND knowledge articles to classify:
 *   CONVERGED   — job matched both a graph node AND a knowledge article (fully grounded automation)
 *   TRACED      — job matched a graph node only (graph-traced but no knowledge backing)
 *   DOCUMENTED  — job matched a knowledge article only (documented but not in graph)
 *   ISOLATED    — no graph or knowledge match (automation blind spot)
 *
 * Toggle: ◈ SWGKCONV button (fixed, bottom strip) left:99880, zIndex:189
 * Stat tiles: jobs / graph nodes / articles / converged / traced / documented / isolated
 * Amber pulse on ISOLATED count (automation blind spots).
 * Expandable rows: matched graph nodes with centrality score + matched articles with category.
 * Filter tabs: ALL / CONVERGED / TRACED / DOCUMENTED / ISOLATED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swgkconv"/"swarm graph knowledge"/"swarm convergence"/"isolated swarms"
 *        "automation intelligence"/"swarm knowledge gap"/"swarm graph convergence"
 *        "automation blind spot"/"swarm isolated"/"swarm grounding"
 * Event: jarvis:swgkconv-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CONVERGED', 'TRACED', 'DOCUMENTED', 'ISOLATED'];

const CLS_COLOR = {
  CONVERGED:  '#22C55E',
  TRACED:     '#38BDF8',
  DOCUMENTED: '#A78BFA',
  ISOLATED:   '#6B7280',
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
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isSwgkconvQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'swgkconv', 'swarm graph knowledge', 'swarm convergence', 'isolated swarms',
    'automation intelligence', 'swarm knowledge gap', 'swarm graph convergence',
    'automation blind spot', 'swarm isolated', 'swarm grounding',
  ].some(k => s.includes(k));
}

export function buildSwgkconvScript() {
  return (
    'Fetch /entities/SwarmJob, /v1/graph/centrality, and /knowledge/. ' +
    'Keyword-match each swarm job (by name, type, description) against graph centrality node labels AND knowledge article titles/categories. ' +
    'Classify each swarm job as CONVERGED/TRACED/DOCUMENTED/ISOLATED. ' +
    'Report total ISOLATED count (automation blind spots with no graph presence and no knowledge grounding), ' +
    'identify which isolated jobs carry the highest operational risk, ' +
    'and recommend graph tagging or knowledge article creation to close the automation intelligence gap.'
  );
}

export default function SwarmGraphKnowledgeConvergence() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    jobs: 0, nodes: 0, articles: 0,
    converged: 0, traced: 0, documented: 0, isolated: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [swRaw, grRaw, knRaw] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`,        { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/graph/centrality`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/knowledge/`,               { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const jobs     = normalizeArray(swRaw, ['items', 'jobs', 'results', 'data', 'entities']);
      const nodes    = normalizeArray(grRaw, ['items', 'nodes', 'results', 'data', 'entities']);
      const articles = normalizeArray(knRaw, ['items', 'articles', 'results', 'data', 'documents']);

      const built = jobs.map((job, idx) => {
        const jobText = [job.name, job.title, job.type, job.description, job.task, job.target]
          .filter(Boolean).join(' ');
        const jobToks = tokens(jobText);

        const matchedNodes = nodes.filter(nd => {
          const s = [nd.label, nd.name, nd.title, nd.type, nd.description, nd.id]
            .filter(Boolean).join(' ');
          return overlaps(jobToks, s);
        });

        const matchedArticles = articles.filter(art => {
          const s = [art.title, art.name, art.category, art.tags, art.description, art.content?.slice(0, 200)]
            .filter(Boolean).join(' ');
          return overlaps(jobToks, s);
        });

        const hasNode    = matchedNodes.length > 0;
        const hasArticle = matchedArticles.length > 0;
        let cls;
        if (hasNode && hasArticle) cls = 'CONVERGED';
        else if (hasNode)          cls = 'TRACED';
        else if (hasArticle)       cls = 'DOCUMENTED';
        else                       cls = 'ISOLATED';

        return {
          id:             job.id || job._id || `job-${idx}`,
          name:           job.name || job.title || `SwarmJob ${idx + 1}`,
          type:           job.type || job.task || '',
          status:         job.status || job.state || '',
          progress:       job.progress ?? job.completion ?? null,
          cls,
          matchedNodes,
          matchedArticles,
        };
      });

      const converged  = built.filter(r => r.cls === 'CONVERGED').length;
      const traced     = built.filter(r => r.cls === 'TRACED').length;
      const documented = built.filter(r => r.cls === 'DOCUMENTED').length;
      const isolated   = built.filter(r => r.cls === 'ISOLATED').length;

      setRows(built);
      setCounts({ jobs: built.length, nodes: nodes.length, articles: articles.length, converged, traced, documented, isolated });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:swgkconv-toggle', handler);
    return () => window.removeEventListener('jarvis:swgkconv-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildSwgkconvScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.isolated > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#F59E0B' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s)
        || r.type.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 99880, zIndex: 189,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #F59E0B',
          color: '#F59E0B', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ SWGKCONV{counts.isolated > 0 ? <span style={pulse}> {counts.isolated}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 680, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #F59E0B',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(245,158,11,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#F59E0B', fontSize: 13, fontWeight: 'bold' }}>
            ◈ SWGKCONV — Swarm × Graph × Knowledge Convergence
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
          >✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'JOBS',       val: counts.jobs },
            { label: 'NODES',      val: counts.nodes },
            { label: 'ARTICLES',   val: counts.articles },
            { label: 'CONVERGED',  val: counts.converged,  color: '#22C55E' },
            { label: 'TRACED',     val: counts.traced,     color: '#38BDF8' },
            { label: 'DOCUMENTED', val: counts.documented, color: '#A78BFA' },
            { label: 'ISOLATED',   val: counts.isolated,   color: '#F59E0B', doPulse: counts.isolated > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.05)', borderRadius: 6,
              padding: '6px 12px', textAlign: 'center', minWidth: 72,
            }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: t.color || '#ccc', ...(t.doPulse ? pulse : {}) }}>
                {t.val}
              </div>
              <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${tab === t ? '#F59E0B' : '#333'}`,
              color: tab === t ? '#F59E0B' : '#aaa', padding: '3px 10px',
              borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}>{t}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', padding: '3px 8px',
              borderRadius: 4, fontSize: 11, marginLeft: 4,
            }}
          />
        </div>

        {/* Assess */}
        <div style={{ padding: '0 14px 10px' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: 'rgba(245,158,11,0.2)', border: '1px solid #F59E0B',
            color: '#F59E0B', padding: '4px 14px', borderRadius: 4,
            cursor: assessing ? 'wait' : 'pointer', fontSize: 11,
          }}>
            {assessing ? '…assessing' : '▶ ASSESS'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, color: '#ccc', fontSize: 11,
              lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
            }}>
              {assessment}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '0 14px 8px', color: '#F87171', fontSize: 11 }}>
            Error: {error}
          </div>
        )}

        {/* Rows */}
        <div style={{ padding: '0 14px 14px' }}>
          {loading && !rows.length && (
            <div style={{ color: '#888', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Loading…</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(ex => ({ ...ex, [row.id]: !ex[row.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}
              >
                <span style={{ color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 'bold', minWidth: 82 }}>
                  {row.cls}
                </span>
                <span style={{ color: '#eee', fontSize: 12, flex: 1 }}>{row.name}</span>
                {row.type && (
                  <span style={{ color: '#888', fontSize: 10 }}>{row.type}</span>
                )}
                {row.status && (
                  <span style={{
                    background: 'rgba(56,189,248,0.12)', color: '#38BDF8',
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  }}>{row.status}</span>
                )}
                {row.progress != null && (
                  <span style={{ color: '#A78BFA', fontSize: 10, marginLeft: 4 }}>{row.progress}%</span>
                )}
                <span style={{ color: '#555', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingBottom: 8 }}>
                  {/* Matched graph nodes */}
                  {row.matchedNodes.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 4 }}>
                        Graph nodes ({row.matchedNodes.length})
                      </div>
                      {row.matchedNodes.slice(0, 5).map((nd, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: '#ccc', fontSize: 11 }}>
                            {nd.label || nd.name || nd.id || '—'}
                          </span>
                          {nd.centrality != null && (
                            <span style={{
                              background: 'rgba(56,189,248,0.15)', color: '#38BDF8',
                              fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            }}>
                              centrality:{typeof nd.centrality === 'number' ? nd.centrality.toFixed(3) : nd.centrality}
                            </span>
                          )}
                          {(nd.type || nd.kind) && (
                            <span style={{ color: '#888', fontSize: 9 }}>{nd.type || nd.kind}</span>
                          )}
                        </div>
                      ))}
                      {row.matchedNodes.length > 5 && (
                        <div style={{ color: '#555', fontSize: 10 }}>+{row.matchedNodes.length - 5} more</div>
                      )}
                    </div>
                  )}

                  {/* Matched knowledge articles */}
                  {row.matchedArticles.length > 0 && (
                    <div>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 4 }}>
                        Knowledge articles ({row.matchedArticles.length})
                      </div>
                      {row.matchedArticles.slice(0, 5).map((art, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: '#ccc', fontSize: 11 }}>
                            {art.title || art.name || '—'}
                          </span>
                          {(art.category || art.type) && (
                            <span style={{
                              background: 'rgba(167,139,250,0.15)', color: '#A78BFA',
                              fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            }}>
                              {art.category || art.type}
                            </span>
                          )}
                        </div>
                      ))}
                      {row.matchedArticles.length > 5 && (
                        <div style={{ color: '#555', fontSize: 10 }}>+{row.matchedArticles.length - 5} more</div>
                      )}
                    </div>
                  )}

                  {row.matchedNodes.length === 0 && row.matchedArticles.length === 0 && (
                    <div style={{ color: '#555', fontSize: 11 }}>No matching graph nodes or knowledge articles found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
              No swarm jobs match this filter.
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}`}</style>
    </>
  );
}
