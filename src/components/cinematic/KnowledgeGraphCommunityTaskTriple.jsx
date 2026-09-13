import { useState, useEffect, useCallback } from 'react';

const API = '';

const KGCTRI_RE = /\b(knowledge[._-]?graph[._-]?community|graph[._-]?community[._-]?knowledge|kgctri|community[._-]?knowledge[._-]?task|knowledge[._-]?triple|activated[._-]?knowledge|dormant[._-]?knowledge|knowledge[._-]?community[._-]?task)\b/i;

export function isKgctriQuery(t) {
  return KGCTRI_RE.test(t || '');
}

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'items', 'results', 'data', 'records', 'knowledge'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    name:     a.title || a.name || a.heading || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    summary:  String(a.summary || a.content || a.description || a.body || '').slice(0, 300),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'clusters', 'items', 'results', 'data', 'nodes'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.label || c.name || c.title || `Community ${i + 1}`,
    type:    c.type || c.kind || '',
    summary: String(c.summary || c.description || c.members || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.name || t.title || t.task || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.summary || t.mission || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.type || other.category || other.kind || ''),
    ...tokens(other.summary || other.description || other.desc || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!aToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (aToks.has(t)) hits++;
  return hits / Math.max(aToks.size, otherToks.length);
}

function correlate(articles, communities, tasks) {
  return articles.map(art => {
    const aToks = new Set([
      ...tokens(art.name),
      ...tokens(art.category),
      ...tokens(art.summary),
      ...tokens(art.tags),
    ].filter(Boolean));

    const matchedCommunities = communities
      .map(c => ({ ...c, _score: matchScore(aToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(aToks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasCom  = matchedCommunities.length > 0;
    const hasTask = matchedTasks.length > 0;

    let coverage;
    if (hasCom && hasTask) coverage = 'FULLY ACTIVATED';
    else if (hasCom)       coverage = 'COMMUNITY-LINKED';
    else if (hasTask)      coverage = 'TASK-DRIVEN';
    else                   coverage = 'DORMANT';

    return { ...art, _communities: matchedCommunities, _tasks: matchedTasks, _coverage: coverage };
  });
}

async function fetchKnowledge() {
  const endpoints = ['/knowledge/', '/knowledge/articles', '/knowledge/list', '/knowledge'];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${API}${ep}`);
      if (r.ok) {
        const d = await r.json();
        const arr = normaliseArticles(d);
        if (arr.length > 0) return arr;
      }
    } catch {
      // try next
    }
  }
  return [];
}

export async function buildKgctriScript() {
  const [artR, comR, tskR] = await Promise.allSettled([
    fetchKnowledge(),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const articles     = artR.status === 'fulfilled' ? artR.value : [];
  const communities  = normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []);
  const tasks        = normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []);
  const enriched     = correlate(articles, communities, tasks);
  const fa  = enriched.filter(a => a._coverage === 'FULLY ACTIVATED').length;
  const cl  = enriched.filter(a => a._coverage === 'COMMUNITY-LINKED').length;
  const td  = enriched.filter(a => a._coverage === 'TASK-DRIVEN').length;
  const dm  = enriched.filter(a => a._coverage === 'DORMANT').length;
  return (
    `Knowledge × Graph Community × Task Triple Coverage: ${articles.length} KB articles cross-referenced against ${communities.length} network communities and ${tasks.length} tasks. ` +
    `${fa} articles are FULLY ACTIVATED (community-backed + task-driven); ${cl} are COMMUNITY-LINKED (network presence, no task); ` +
    `${td} are TASK-DRIVEN (task found, no community alignment); ${dm} are DORMANT (no network or task coverage — knowledge not operationally activated). ` +
    `Dormant: ${enriched.filter(a => a._coverage === 'DORMANT').slice(0, 3).map(a => a.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 660;
const PANEL_H = 600;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const TE = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY ACTIVATED':   GR,
  'COMMUNITY-LINKED':  CY,
  'TASK-DRIVEN':       AM,
  'DORMANT':           RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY ACTIVATED', 'COMMUNITY-LINKED', 'TASK-DRIVEN', 'DORMANT'];

export default function KnowledgeGraphCommunityTaskTriple() {
  const [open, setOpen]           = useState(false);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [artR, comR, tskR] = await Promise.allSettled([
        fetchKnowledge(),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_a = artR.status === 'fulfilled' ? artR.value : [];
      const raw_c = normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []);
      const raw_t = normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []);
      setArticles(correlate(raw_a, raw_c, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:kgctri-toggle', toggle);
    return () => window.removeEventListener('jarvis:kgctri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildKgctriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Knowledge × Graph Community × Task triple coverage brief: ${brief}. Give a 2-sentence knowledge-operational readiness assessment.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const dmCount = articles.filter(a => a._coverage === 'DORMANT').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Graph Community × Task Triple Coverage (KGCTRI)"
        style={{
          position: 'fixed', left: 717680, bottom: 8, zIndex: 310,
          background: dmCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${dmCount > 0 ? RD : CY + '44'}`,
          color: dmCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ KGCTRI{dmCount > 0 ? ` ⚠${dmCount}` : ''}
      </button>
    );
  }

  const fa = articles.filter(a => a._coverage === 'FULLY ACTIVATED').length;
  const cl = articles.filter(a => a._coverage === 'COMMUNITY-LINKED').length;
  const td = articles.filter(a => a._coverage === 'TASK-DRIVEN').length;
  const dm = articles.filter(a => a._coverage === 'DORMANT').length;

  const visible = articles.filter(art =>
    (tab === 'ALL' || art._coverage === tab) &&
    (!search || art.name.toLowerCase().includes(search.toLowerCase()) || art.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ KNOWLEDGE × GRAPH COMMUNITY × TASK TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>KGCTRI</span>
        {dm > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {dm} DORMANT</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['KB ARTICLES', articles.length, CY],
          ['FULLY ACTIVATED', fa, GR],
          ['COMMUNITY-LINKED', cl, CY],
          ['TASK-DRIVEN', td, AM],
          ['DORMANT', dm, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {articles.length > 0 && [
            [fa, GR], [cl, CY], [td, AM], [dm, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${articles.filter(a => a._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search KB articles…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No articles match filter.</div>}
        {visible.map(art => {
          const color = COVERAGE_COLOR[art._coverage] || CY;
          const isExp = expanded === art.id;
          return (
            <div key={art.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : art.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.name}</span>
                {art.category && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{art.category}</span>}
                {chip(art._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: TE, marginBottom: 4, fontWeight: 700 }}>COMMUNITIES ({art._communities.length})</div>
                    {art._communities.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No community coverage</div>
                      : art._communities.map((c, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{c.name}</div>
                          {c.type && chip(c.type, TE)}
                          <ScoreBar score={c._score} color={TE} />
                        </div>
                      ))
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>TASKS ({art._tasks.length})</div>
                    {art._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No task coverage</div>
                      : art._tasks.map((t, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{t.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {t.priority && chip(t.priority, t.priority === 'HIGH' || t.priority === 'CRITICAL' ? RD : AM)}
                            {t.status && chip(t.status, GR)}
                          </div>
                          <ScoreBar score={t._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          padding: '4px 12px', fontSize: 10, background: assessing ? '#1a1a2a' : '#0a0a1a',
          border: `1px solid ${CY}44`, borderRadius: 4, color: CY, cursor: 'pointer',
        }}>
          {assessing ? 'ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={load} disabled={loading} style={{ padding: '4px 8px', fontSize: 10, background: '#0a0a1a', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer' }}>↺</button>
        {assessText && <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>}
        <span style={{ fontSize: 9, color: '#444', flexShrink: 0 }}>{articles.length} articles · 90s</span>
      </div>
    </div>
  );
}
