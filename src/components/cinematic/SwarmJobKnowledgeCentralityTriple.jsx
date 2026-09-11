import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJKGCEN_RE = /\b(sjkgcen|swarm\s+job\s+knowledge\s+centrality|swarm\s+knowledge\s+graph\s+centrality|swarm\s+knowledge\s+centrality|swarm\s+centrality\s+knowledge|swarm\s+job\s+centrality\s+knowledge|knowledge\s+centrality\s+swarm|centrality\s+knowledge\s+swarm|swarm\s+graph\s+knowledge|swarm\s+job\s+graph\s+knowledge|swarm\s+knowledge\s+node|swarm\s+centrality\s+kb|blind\s+swarm\s+centrality|fully\s+armed\s+swarm)\b/i;
const THRESHOLD = 0.07;

export function isSwjkgcenQuery(t) {
  return SJKGCEN_RE.test(t || '');
}

export async function buildSwjkgcenScript() {
  try {
    const [swarmRes, kbRes, centRes] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
    ]);
    const jobs = normaliseJobs(swarmRes);
    const articles = normaliseKb(kbRes);
    const nodes = normaliseNodes(centRes);
    const classified = jobs.map(j => classifyJob(j, articles, nodes));
    const armed = classified.filter(j => j.state === 'FULLY_ARMED').length;
    const blind = classified.filter(j => j.state === 'BLIND').length;
    return `SJKGCEN analysis: ${jobs.length} swarm jobs cross-referenced against ${articles.length} KB articles and ${nodes.length} top-influence graph centrality nodes. ${armed} swarm jobs are FULLY ARMED — both knowledge backing and graph centrality context confirmed. ${blind} swarm jobs are BLIND — no knowledge or centrality coverage detected, representing operational intelligence gaps requiring immediate KB documentation or graph node mapping.`;
  } catch {
    return 'SJKGCEN data unavailable — check /entities/SwarmJob, /knowledge/, and /v1/graph/centrality endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((j, i) => ({
    id: j.id || j._id || `job-${i}`,
    label: j.name || j.title || j.job_name || `Job ${i + 1}`,
    type: j.type || j.kind || j.job_type || '',
    status: j.status || j.state || '',
    objective: j.objective || j.description || j.summary || '',
    _searchText: [j.name, j.title, j.job_name, j.type, j.kind, j.objective, j.description, j.summary, j.tags].filter(Boolean).join(' '),
  }));
}

function normaliseKb(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.articles) ? raw.articles
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `kb-${i}`,
    label: a.title || a.name || a.heading || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    _searchText: [a.title, a.name, a.heading, a.category, a.type, a.tags, a.summary, a.content, a.source].filter(Boolean).join(' '),
  }));
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.nodes) ? raw.nodes
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.title || `Node ${i + 1}`,
    type: n.type || n.category || n.entity_type || '',
    score: n.centrality || n.score || n.rank || 0,
    _searchText: [n.label, n.name, n.title, n.type, n.category, n.entity_type, n.description, n.tags].filter(Boolean).join(' '),
  }));
}

function classifyJob(job, articles, nodes) {
  const toks = tok(job._searchText);
  const kbMatches = articles
    .map(a => ({ ...a, score: Math.max(matchScore(toks, a._searchText), matchScore(tok(a._searchText), job._searchText)) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const nodeMatches = nodes
    .map(n => ({ ...n, score: Math.max(matchScore(toks, n._searchText), matchScore(tok(n._searchText), job._searchText)) }))
    .filter(n => n.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasKb = kbMatches.length > 0;
  const hasNode = nodeMatches.length > 0;
  let state;
  if (hasKb && hasNode) state = 'FULLY_ARMED';
  else if (hasKb) state = 'KB_BACKED';
  else if (hasNode) state = 'CENTRALITY_MAPPED';
  else state = 'BLIND';
  return { ...job, state, kbMatches, nodeMatches };
}

const STATE_LABELS = {
  FULLY_ARMED: 'FULLY ARMED',
  KB_BACKED: 'KB-BACKED',
  CENTRALITY_MAPPED: 'CENTRALITY-MAPPED',
  BLIND: 'BLIND',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function SwarmJobKnowledgeCentralityTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [articles, setArticles] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [swarmRes, kbRes, centRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`, { headers }),
        fetch(`${API}/knowledge/`, { headers }),
        fetch(`${API}/v1/graph/centrality`, { headers }),
      ]);
      const [swarmJson, kbJson, centJson] = await Promise.all([swarmRes.json(), kbRes.json(), centRes.json()]);
      const jbs = normaliseJobs(swarmJson);
      const arts = normaliseKb(kbJson);
      const nds = normaliseNodes(centJson);
      setJobs(jbs);
      setArticles(arts);
      setNodes(nds);
      setClassified(jbs.map(j => classifyJob(j, arts, nds)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:sjkgcen-toggle', handler);
    return () => window.removeEventListener('jarvis:sjkgcen-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (SJKGCEN_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_ARMED: classified.filter(j => j.state === 'FULLY_ARMED').length,
    KB_BACKED: classified.filter(j => j.state === 'KB_BACKED').length,
    CENTRALITY_MAPPED: classified.filter(j => j.state === 'CENTRALITY_MAPPED').length,
    BLIND: classified.filter(j => j.state === 'BLIND').length,
  };

  const visible = classified.filter(j => {
    if (filter !== 'ALL' && j.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return j._searchText.toLowerCase().includes(q) || j.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `SJKGCEN SwarmJob × Knowledge × Graph Centrality Triple Coverage: ${jobs.length} swarm jobs cross-referenced against ${articles.length} KB articles and ${nodes.length} top-influence graph centrality nodes. Coverage: FULLY ARMED=${counts.FULLY_ARMED}, KB-BACKED=${counts.KB_BACKED}, CENTRALITY-MAPPED=${counts.CENTRALITY_MAPPED}, BLIND=${counts.BLIND}. In 2 sentences, assess swarm job intelligence coverage posture and identify the most critical blind spots where swarm jobs lack both knowledge documentation and graph network context.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const armedPct = classified.length ? Math.round((counts.FULLY_ARMED / classified.length) * 100) : 0;
  const kbPct = classified.length ? Math.round((counts.KB_BACKED / classified.length) * 100) : 0;
  const centPct = classified.length ? Math.round((counts.CENTRALITY_MAPPED / classified.length) * 100) : 0;
  const blindPct = classified.length ? Math.round((counts.BLIND / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 843120, bottom: 8, zIndex: 534,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #312e81',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(49,46,129,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13 }}>◈ SJKGCEN</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>SwarmJob × Knowledge × Graph Centrality Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#a78bfa', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'SWARM JOBS', val: jobs.length, color: '#e2e8f0' },
          { label: 'KB ARTICLES', val: articles.length, color: '#818cf8' },
          { label: 'CENT. NODES', val: nodes.length, color: '#22d3ee' },
          { label: 'FULLY ARMED', val: counts.FULLY_ARMED, color: '#a78bfa', badge: counts.FULLY_ARMED > 0 },
          { label: 'KB-BACKED', val: counts.KB_BACKED, color: '#818cf8' },
          { label: 'CENT-MAPPED', val: counts.CENTRALITY_MAPPED, color: '#22d3ee' },
          { label: 'BLIND', val: counts.BLIND, color: '#6b7280', badge: counts.BLIND > 0 },
          { label: 'ARMED %', val: `${armedPct}%`, color: '#a78bfa' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#a78bfa' }}>{armedPct}% fully armed</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {armedPct > 0 && <div style={{ width: `${armedPct}%`, background: '#a78bfa' }} />}
          {kbPct > 0 && <div style={{ width: `${kbPct}%`, background: '#818cf8' }} />}
          {centPct > 0 && <div style={{ width: `${centPct}%`, background: '#22d3ee' }} />}
          {blindPct > 0 && <div style={{ width: `${blindPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#a78bfa' }}>● FULLY ARMED</span>
          <span style={{ color: '#818cf8' }}>● KB-BACKED</span>
          <span style={{ color: '#22d3ee' }}>● CENTRALITY-MAPPED</span>
          <span style={{ color: '#374151' }}>● BLIND</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_ARMED', 'KB_BACKED', 'CENTRALITY_MAPPED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1a1040' : '#0f172a',
            border: `1px solid ${filter === f ? '#a78bfa' : '#1e293b'}`,
            color: filter === f ? '#c4b5fd' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No swarm jobs match current filter.</div>
        )}
        {visible.map(j => {
          const stateColor = j.state === 'FULLY_ARMED' ? '#a78bfa' : j.state === 'KB_BACKED' ? '#818cf8' : j.state === 'CENTRALITY_MAPPED' ? '#22d3ee' : '#6b7280';
          const isExp = expanded === j.id;
          return (
            <div key={j.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#312e81' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : j.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 160 }}>{STATE_LABELS[j.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{j.label}</span>
                {j.type && <span style={{ background: '#0f172a', color: '#64748b', border: '1px solid #1e293b', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{j.type}</span>}
                {j.status && <span style={{ background: '#0f172a', color: '#22d3ee', border: '1px solid #164e63', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{j.status}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {j.objective && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, marginTop: 6 }}>{j.objective.slice(0, 180)}{j.objective.length > 180 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* KB Articles pane */}
                    <div>
                      <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>KB ARTICLES ({j.kbMatches.length})</div>
                      {j.kbMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No knowledge coverage</div>
                        : j.kbMatches.slice(0, 6).map(a => (
                          <div key={a.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#a5b4fc', fontSize: 11 }}>{a.label.slice(0, 42)}{a.label.length > 42 ? '…' : ''}</span>
                              {a.category && <span style={{ background: '#1e1b4b', color: '#818cf8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{a.category}</span>}
                            </div>
                            <ScoreBar score={a.score} color="#818cf8" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Graph Centrality Nodes pane */}
                    <div>
                      <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>CENTRALITY NODES ({j.nodeMatches.length})</div>
                      {j.nodeMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No centrality node coverage</div>
                        : j.nodeMatches.slice(0, 6).map(n => (
                          <div key={n.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#67e8f9', fontSize: 11 }}>{n.label.slice(0, 42)}{n.label.length > 42 ? '…' : ''}</span>
                              {n.type && <span style={{ background: '#083344', color: '#22d3ee', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{n.type}</span>}
                            </div>
                            <ScoreBar score={n.score} color="#22d3ee" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#1a1040', border: '1px solid #a78bfa',
            color: assessing ? '#475569' : '#c4b5fd', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
