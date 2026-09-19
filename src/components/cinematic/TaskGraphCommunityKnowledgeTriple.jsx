import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TKGCKNOW_RE = /\b(tkgcknow|task\s+graph\s+community\s+knowledge|task\s+community\s+knowledge|task\s+knowledge\s+community|knowledge\s+community\s+task|community\s+knowledge\s+task|task\s+network\s+knowledge|task\s+community\s+kb|task\s+knowledge\s+network|task\s+graph\s+knowledge|dark\s+task\s+knowledge|task\s+fully\s+mapped|community\s+task\s+knowledge)\b/i;
const THRESHOLD = 0.07;

export function isTkgcknowQuery(t) {
  return TKGCKNOW_RE.test(t || '');
}

export async function buildTkgcknowScript() {
  try {
    const [taskRes, commRes, kbRes] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
    ]);
    const tasks = normaliseTasks(taskRes);
    const communities = normaliseCommunities(commRes);
    const articles = normaliseKb(kbRes);
    const classified = tasks.map(t => classifyTask(t, communities, articles));
    const fullyMapped = classified.filter(t => t.state === 'FULLY_MAPPED').length;
    const dark = classified.filter(t => t.state === 'DARK').length;
    return `TKGCKNOW analysis: ${tasks.length} tasks cross-referenced against ${communities.length} graph network communities and ${articles.length} KB articles. ${fullyMapped} tasks are FULLY MAPPED — both network community context and knowledge base backing confirmed. ${dark} tasks are DARK — no network community or knowledge coverage detected, representing operational intelligence gaps requiring immediate community mapping or KB documentation.`;
  } catch {
    return 'TKGCKNOW data unavailable — check /entities/Task, /v1/graph/communities, and /knowledge/ endpoints.';
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
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((t, i) => ({
    id: t.id || t._id || `task-${i}`,
    label: t.name || t.title || t.task_name || `Task ${i + 1}`,
    status: t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    mission: t.mission || t.objective || t.description || '',
    _searchText: [t.name, t.title, t.task_name, t.mission, t.objective, t.description, t.priority, t.tags].filter(Boolean).join(' '),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.communities) ? raw.communities
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `com-${i}`,
    label: c.name || c.label || c.title || `Community ${i + 1}`,
    type: c.type || c.category || c.kind || '',
    _searchText: [c.name, c.label, c.title, c.type, c.category, c.description, c.tags, c.summary].filter(Boolean).join(' '),
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

function classifyTask(task, communities, articles) {
  const toks = tok(task._searchText);
  const commMatches = communities
    .map(c => ({ ...c, score: Math.max(matchScore(toks, c._searchText), matchScore(tok(c._searchText), task._searchText)) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const kbMatches = articles
    .map(a => ({ ...a, score: Math.max(matchScore(toks, a._searchText), matchScore(tok(a._searchText), task._searchText)) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasCom = commMatches.length > 0;
  const hasKb = kbMatches.length > 0;
  let state;
  if (hasCom && hasKb) state = 'FULLY_MAPPED';
  else if (hasCom) state = 'COMMUNITY_BACKED';
  else if (hasKb) state = 'KNOWLEDGE_BACKED';
  else state = 'DARK';
  return { ...task, state, commMatches, kbMatches };
}

const STATE_LABELS = {
  FULLY_MAPPED: 'FULLY MAPPED',
  COMMUNITY_BACKED: 'COMMUNITY-BACKED',
  KNOWLEDGE_BACKED: 'KNOWLEDGE-BACKED',
  DARK: 'DARK',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function TaskGraphCommunityKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [articles, setArticles] = useState([]);
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
      const [taskRes, commRes, kbRes] = await Promise.all([
        fetch(`${API}/entities/Task`, { headers }),
        fetch(`${API}/v1/graph/communities`, { headers }),
        fetch(`${API}/knowledge/`, { headers }),
      ]);
      const [taskJson, commJson, kbJson] = await Promise.all([taskRes.json(), commRes.json(), kbRes.json()]);
      const tks = normaliseTasks(taskJson);
      const coms = normaliseCommunities(commJson);
      const arts = normaliseKb(kbJson);
      setTasks(tks);
      setCommunities(coms);
      setArticles(arts);
      setClassified(tks.map(t => classifyTask(t, coms, arts)));
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
    window.addEventListener('jarvis:tkgcknow-toggle', handler);
    return () => window.removeEventListener('jarvis:tkgcknow-toggle', handler);
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
      if (TKGCKNOW_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_MAPPED: classified.filter(t => t.state === 'FULLY_MAPPED').length,
    COMMUNITY_BACKED: classified.filter(t => t.state === 'COMMUNITY_BACKED').length,
    KNOWLEDGE_BACKED: classified.filter(t => t.state === 'KNOWLEDGE_BACKED').length,
    DARK: classified.filter(t => t.state === 'DARK').length,
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
      const prompt = `TKGCKNOW Task × Graph Community × Knowledge Triple Coverage: ${tasks.length} tasks cross-referenced against ${communities.length} graph network communities and ${articles.length} KB articles. Coverage: FULLY MAPPED=${counts.FULLY_MAPPED}, COMMUNITY-BACKED=${counts.COMMUNITY_BACKED}, KNOWLEDGE-BACKED=${counts.KNOWLEDGE_BACKED}, DARK=${counts.DARK}. In 2 sentences, assess task network and knowledge coverage posture and identify the most critical dark tasks that lack both network community context and knowledge base backing.`;
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

  const mappedPct = classified.length ? Math.round((counts.FULLY_MAPPED / classified.length) * 100) : 0;
  const comPct = classified.length ? Math.round((counts.COMMUNITY_BACKED / classified.length) * 100) : 0;
  const kbPct = classified.length ? Math.round((counts.KNOWLEDGE_BACKED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 843680, bottom: 8, zIndex: 535,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #14532d',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,83,45,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>◈ TKGCKNOW</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Task × Graph Community × Knowledge Triple Coverage</span>
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
          { label: 'COMMUNITIES', val: communities.length, color: '#34d399' },
          { label: 'KB ARTICLES', val: articles.length, color: '#818cf8' },
          { label: 'FULLY MAPPED', val: counts.FULLY_MAPPED, color: '#4ade80', badge: counts.FULLY_MAPPED > 0 },
          { label: 'COMM-BACKED', val: counts.COMMUNITY_BACKED, color: '#34d399' },
          { label: 'KNOW-BACKED', val: counts.KNOWLEDGE_BACKED, color: '#818cf8' },
          { label: 'DARK', val: counts.DARK, color: '#6b7280', badge: counts.DARK > 0 },
          { label: 'MAPPED %', val: `${mappedPct}%`, color: '#4ade80' },
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
          <span style={{ marginLeft: 'auto', color: '#4ade80' }}>{mappedPct}% fully mapped</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {mappedPct > 0 && <div style={{ width: `${mappedPct}%`, background: '#4ade80' }} />}
          {comPct > 0 && <div style={{ width: `${comPct}%`, background: '#34d399' }} />}
          {kbPct > 0 && <div style={{ width: `${kbPct}%`, background: '#818cf8' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#4ade80' }}>● FULLY MAPPED</span>
          <span style={{ color: '#34d399' }}>● COMMUNITY-BACKED</span>
          <span style={{ color: '#818cf8' }}>● KNOWLEDGE-BACKED</span>
          <span style={{ color: '#374151' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_MAPPED', 'COMMUNITY_BACKED', 'KNOWLEDGE_BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#052e16' : '#0f172a',
            border: `1px solid ${filter === f ? '#4ade80' : '#1e293b'}`,
            color: filter === f ? '#86efac' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No tasks match current filter.</div>
        )}
        {visible.map(t => {
          const stateColor = t.state === 'FULLY_MAPPED' ? '#4ade80' : t.state === 'COMMUNITY_BACKED' ? '#34d399' : t.state === 'KNOWLEDGE_BACKED' ? '#818cf8' : '#6b7280';
          const isExp = expanded === t.id;
          return (
            <div key={t.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#14532d' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 180 }}>{STATE_LABELS[t.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{t.label}</span>
                {t.priority && <span style={{ background: '#0f172a', color: '#fbbf24', border: '1px solid #451a03', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{t.priority}</span>}
                {t.status && <span style={{ background: '#0f172a', color: '#22d3ee', border: '1px solid #164e63', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{t.status}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {t.mission && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, marginTop: 6 }}>{t.mission.slice(0, 180)}{t.mission.length > 180 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Graph Communities pane */}
                    <div>
                      <div style={{ color: '#34d399', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH COMMUNITIES ({t.commMatches.length})</div>
                      {t.commMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No network community coverage</div>
                        : t.commMatches.slice(0, 6).map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#6ee7b7', fontSize: 11 }}>{c.label.slice(0, 42)}{c.label.length > 42 ? '…' : ''}</span>
                              {c.type && <span style={{ background: '#022c22', color: '#34d399', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.type}</span>}
                            </div>
                            <ScoreBar score={c.score} color="#34d399" />
                          </div>
                        ))
                      }
                    </div>
                    {/* KB Articles pane */}
                    <div>
                      <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>KB ARTICLES ({t.kbMatches.length})</div>
                      {t.kbMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No knowledge base coverage</div>
                        : t.kbMatches.slice(0, 6).map(a => (
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
            background: assessing ? '#1e293b' : '#052e16', border: '1px solid #4ade80',
            color: assessing ? '#475569' : '#86efac', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
