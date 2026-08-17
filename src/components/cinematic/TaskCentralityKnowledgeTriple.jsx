import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TGCKN_RE = /\b(tgckn|task\s+graph\s+centrality\s+knowledge|task\s+centrality\s+knowledge|task\s+knowledge\s+centrality|task\s+node\s+knowledge|centrality\s+knowledge\s+task|knowledge\s+centrality\s+task|task\s+graph\s+knowledge|task\s+network\s+knowledge|task\s+centrality\s+kb|task\s+knowledge\s+node|armed\s+task\s+centrality|task\s+knowledge\s+graph|centrality\s+task\s+knowledge)\b/i;
const THRESHOLD = 0.07;

export function isTgcknQuery(t) {
  return TGCKN_RE.test(t || '');
}

export async function buildTgcknScript() {
  try {
    const [taskRes, nodeRes, kbRes] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
    ]);
    const tasks = normaliseTasks(taskRes);
    const nodes = normaliseNodes(nodeRes);
    const articles = normaliseKb(kbRes);
    const classified = tasks.map(t => classifyTask(t, nodes, articles));
    const armed = classified.filter(t => t.state === 'FULLY_ARMED').length;
    const blind = classified.filter(t => t.state === 'BLIND').length;
    return `TGCKN analysis: ${tasks.length} tasks cross-referenced against ${nodes.length} top-influence graph centrality nodes and ${articles.length} knowledge base articles. ${armed} tasks are FULLY ARMED — both graph network centrality linkage and knowledge base backing confirmed. ${blind} tasks are BLIND — no centrality node alignment or knowledge article coverage detected, representing critical operational planning and intelligence gaps requiring immediate remediation.`;
  } catch {
    return 'TGCKN data unavailable — check /entities/Task, /v1/graph/centrality, and /knowledge/ endpoints.';
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

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.tasks) ? raw.tasks
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((t, i) => ({
    id: t.id || t._id || `task-${i}`,
    label: t.name || t.title || t.task_name || `Task ${i + 1}`,
    category: t.category || t.type || t.kind || '',
    status: t.status || t.state || '',
    _searchText: [t.name, t.title, t.description, t.category, t.type, t.mission, t.objective, t.tags].filter(Boolean).join(' '),
  }));
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.nodes) ? raw.nodes
    : Array.isArray(raw.centrality) ? raw.centrality
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : [];
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.entity || `Node ${i + 1}`,
    score: typeof n.score === 'number' ? n.score : typeof n.centrality_score === 'number' ? n.centrality_score : 0,
    type: n.type || n.category || '',
    _text: [n.label, n.name, n.entity, n.description, n.type, n.category].filter(Boolean).join(' '),
  })).sort((a, b) => b.score - a.score).slice(0, 80);
}

function normaliseKb(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.articles) ? raw.articles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `kb-${i}`,
    label: a.title || a.name || a.slug || `Article ${i + 1}`,
    category: a.category || a.type || a.topic || '',
    _text: [a.title, a.name, a.summary, a.content, a.description, a.tags, a.category].filter(Boolean).join(' '),
  }));
}

function classifyTask(task, nodes, articles) {
  const toks = tok(task._searchText);
  const matchedNodes = nodes.filter(n => matchScore(toks, n._text) >= THRESHOLD || matchScore(tok(n._text), task._searchText) >= THRESHOLD);
  const matchedArticles = articles.filter(a => matchScore(toks, a._text) >= THRESHOLD || matchScore(tok(a._text), task._searchText) >= THRESHOLD);
  const hasNode = matchedNodes.length > 0;
  const hasKb = matchedArticles.length > 0;
  let state;
  if (hasNode && hasKb) state = 'FULLY_ARMED';
  else if (hasNode) state = 'NODE_LINKED';
  else if (hasKb) state = 'KNOWLEDGE_BACKED';
  else state = 'BLIND';
  return { ...task, state, matchedNodes, matchedArticles };
}

export default function TaskCentralityKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [articles, setArticles] = useState([]);
  const [classified, setClassified] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskRes, nodeRes, kbRes] = await Promise.all([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
      ]);
      const t = normaliseTasks(taskRes);
      const n = normaliseNodes(nodeRes);
      const a = normaliseKb(kbRes);
      setTasks(t);
      setNodes(n);
      setArticles(a);
      setClassified(t.map(task => classifyTask(task, n, a)));
    } catch (err) {
      setError('Fetch failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:tgckn-toggle', handler);
    return () => window.removeEventListener('jarvis:tgckn-toggle', handler);
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
      if (TGCKN_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_ARMED: classified.filter(t => t.state === 'FULLY_ARMED').length,
    NODE_LINKED: classified.filter(t => t.state === 'NODE_LINKED').length,
    KNOWLEDGE_BACKED: classified.filter(t => t.state === 'KNOWLEDGE_BACKED').length,
    BLIND: classified.filter(t => t.state === 'BLIND').length,
  };

  const visible = classified.filter(t => {
    if (filter !== 'ALL' && t.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t._searchText.toLowerCase().includes(q) || t.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `TGCKN Task × Graph Centrality × Knowledge Triple Coverage: ${tasks.length} tasks cross-referenced against ${nodes.length} top-influence graph centrality nodes and ${articles.length} knowledge articles. Coverage: FULLY_ARMED=${counts.FULLY_ARMED}, NODE_LINKED=${counts.NODE_LINKED}, KNOWLEDGE_BACKED=${counts.KNOWLEDGE_BACKED}, BLIND=${counts.BLIND}. In 2 sentences, assess which tasks have both network centrality linkage and knowledge base backing versus those that are blind with no graph or knowledge coverage, and identify the most critical task planning and intelligence gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const armedPct = classified.length ? Math.round((counts.FULLY_ARMED / classified.length) * 100) : 0;
  const nodePct = classified.length ? Math.round((counts.NODE_LINKED / classified.length) * 100) : 0;
  const kbPct = classified.length ? Math.round((counts.KNOWLEDGE_BACKED / classified.length) * 100) : 0;
  const blindPct = classified.length ? Math.round((counts.BLIND / classified.length) * 100) : 0;

  const STATE_COLOR = { FULLY_ARMED: '#4ade80', NODE_LINKED: '#67e8f9', KNOWLEDGE_BACKED: '#a78bfa', BLIND: '#475569' };

  return (
    <div style={{
      position: 'fixed', left: 847600, bottom: 8, zIndex: 542,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a1a2e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,20,60,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>◈ TGCKN</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Task × Graph Centrality × Knowledge Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#4ade80', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'TASKS', val: tasks.length, color: '#e2e8f0' },
          { label: 'GRAPH NODES', val: nodes.length, color: '#67e8f9' },
          { label: 'KB ARTICLES', val: articles.length, color: '#a78bfa' },
          { label: 'FULLY ARMED', val: counts.FULLY_ARMED, color: '#4ade80', badge: counts.FULLY_ARMED > 0 },
          { label: 'NODE-LINKED', val: counts.NODE_LINKED, color: '#67e8f9' },
          { label: 'KB-BACKED', val: counts.KNOWLEDGE_BACKED, color: '#a78bfa' },
          { label: 'BLIND', val: counts.BLIND, color: '#475569', badge: counts.BLIND > 0 },
          { label: 'ARMED %', val: `${armedPct}%`, color: '#4ade80' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          <div style={{ width: `${armedPct}%`, background: '#4ade80' }} title={`FULLY ARMED ${armedPct}%`} />
          <div style={{ width: `${nodePct}%`, background: '#67e8f9' }} title={`NODE-LINKED ${nodePct}%`} />
          <div style={{ width: `${kbPct}%`, background: '#a78bfa' }} title={`KB-BACKED ${kbPct}%`} />
          <div style={{ width: `${blindPct}%`, background: '#1e293b' }} title={`BLIND ${blindPct}%`} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#64748b' }}>
          <span style={{ color: '#4ade80' }}>■ ARMED {armedPct}%</span>
          <span style={{ color: '#67e8f9' }}>■ NODE {nodePct}%</span>
          <span style={{ color: '#a78bfa' }}>■ KB {kbPct}%</span>
          <span>■ BLIND {blindPct}%</span>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY_ARMED', 'NODE_LINKED', 'KNOWLEDGE_BACKED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1e293b' : 'none', border: `1px solid ${filter === f ? '#334155' : '#1e293b'}`,
            color: filter === f ? '#e2e8f0' : '#64748b', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 10,
          }}>{f.replace(/_/g, ' ')}{f !== 'ALL' ? ` (${counts[f] ?? 0})` : ` (${classified.length})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search tasks…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 160 }} />
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px' }}>
        {visible.slice(0, 120).map(t => (
          <div key={t.id}>
            <div onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0f172a', cursor: 'pointer' }}>
              <span style={{ color: STATE_COLOR[t.state], fontSize: 10, fontWeight: 700, minWidth: 110 }}>{t.state.replace(/_/g, ' ')}</span>
              <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              {t.category && <span style={{ color: '#64748b', fontSize: 10 }}>{t.category}</span>}
              <span style={{ color: '#475569', fontSize: 10 }}>{t.matchedNodes.length}N / {t.matchedArticles.length}KB</span>
              <span style={{ color: '#334155', fontSize: 11 }}>{expanded === t.id ? '▲' : '▼'}</span>
            </div>
            {expanded === t.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0 8px 16px' }}>
                <div>
                  <div style={{ color: '#67e8f9', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>GRAPH NODES ({t.matchedNodes.length})</div>
                  {t.matchedNodes.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no centrality node alignment</div>}
                  {t.matchedNodes.slice(0, 8).map(n => (
                    <div key={n.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{n.label}</span>
                        {n.type && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{n.type}</span>}
                      </div>
                      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '100%' }}>
                        <div style={{ height: '100%', background: '#67e8f9', borderRadius: 2, width: `${Math.round(n.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>KNOWLEDGE ({t.matchedArticles.length})</div>
                  {t.matchedArticles.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no knowledge article coverage</div>}
                  {t.matchedArticles.slice(0, 8).map(a => (
                    <div key={a.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{a.label}</span>
                        {a.category && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{a.category}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', padding: '20px 0', textAlign: 'center', fontSize: 12 }}>No tasks match current filter</div>
        )}
      </div>

      {/* ASSESS */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#1e293b' : '#14532d', border: '1px solid #166534', color: '#4ade80',
          borderRadius: 5, padding: '4px 16px', cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700,
        }}>{assessing ? 'ASSESSING…' : 'ASSESS'}</button>
        {assessment && <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>{assessment}</div>}
      </div>
    </div>
  );
}
