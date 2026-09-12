import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const KGCASK_RE = /\b(kgcask|knowledge\s+aip\s+skill|kb\s+skill\s+centrality|knowledge\s+skill\s+graph|knowledge\s+centrality\s+skill|dormant\s+knowledge|armed\s+knowledge|kb\s+aip\s+centrality|knowledge\s+graph\s+skill|knowledge\s+capability\s+centrality|kb\s+centrality\s+aip|knowledge\s+centrality\s+aip|knowledge\s+aip\s+centrality|skill\s+centrality\s+knowledge|kb\s+centrality\s+skill)\b/i;
const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseKbArticles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.articles) ? raw.articles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.documents) ? raw.documents
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `kb-${i}`,
    label: a.title || a.name || a.heading || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    content: String(a.content || a.body || a.summary || a.description || '').slice(0, 400),
    _searchText: [a.title, a.name, a.heading, a.category, a.type, a.kind, a.tags, a.content, a.body, a.summary, a.description].filter(Boolean).join(' '),
  }));
}

function normaliseAipSkills(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.skills) ? raw.skills
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || s.name || `skill-${i}`,
    label: s.name || s.skill_name || s.label || `Skill ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    description: s.description || s.summary || s.prompt || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    _searchText: [s.name, s.skill_name, s.label, s.category, s.type, s.kind, s.description, s.summary, s.prompt, s.tags].filter(Boolean).join(' '),
  }));
}

function normaliseCentralityNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.nodes) ? raw.nodes
    : Array.isArray(raw.centrality) ? raw.centrality
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.name || n.label || n.title || `Node ${i + 1}`,
    type: n.type || n.node_type || n.kind || '',
    category: n.category || '',
    description: n.description || n.summary || '',
    tags: Array.isArray(n.tags) ? n.tags.join(' ') : String(n.tags || ''),
    _searchText: [n.name, n.label, n.title, n.type, n.node_type, n.kind, n.category, n.description, n.summary, n.tags].filter(Boolean).join(' '),
  }));
}

function correlate(articles, skills, nodes) {
  return articles.map(art => {
    const aToks = tok(art._searchText);
    const matchedSkills = skills
      .map(s => ({ ...s, score: matchScore(aToks, s._searchText) }))
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedNodes = nodes
      .map(n => ({ ...n, score: matchScore(aToks, n._searchText) }))
      .filter(n => n.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasSkill = matchedSkills.length > 0;
    const hasNode = matchedNodes.length > 0;
    let coverage;
    if (hasSkill && hasNode) coverage = 'FULLY_ARMED';
    else if (hasSkill) coverage = 'SKILL_BACKED';
    else if (hasNode) coverage = 'NODE_LINKED';
    else coverage = 'DORMANT';
    return { ...art, matchedSkills, matchedNodes, coverage };
  });
}

export function isKgcaskQuery(t) {
  return KGCASK_RE.test(t || '');
}

export async function buildKgcaskScript() {
  try {
    const [kbR, skillR, nodeR] = await Promise.all([
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseKbArticles(kbR), normaliseAipSkills(skillR), normaliseCentralityNodes(nodeR));
    const fullyArmed = rows.filter(r => r.coverage === 'FULLY_ARMED').length;
    const dormant = rows.filter(r => r.coverage === 'DORMANT').length;
    return `KGCASK coverage: ${rows.length} knowledge articles assessed against AIP skills and graph centrality nodes — ${fullyArmed} fully armed (both skill capability and centrality graph context), ${dormant} dormant (no skill or centrality coverage — isolated knowledge). ${dormant > 0 ? `${dormant} article${dormant > 1 ? 's have' : ' has'} zero skill and zero centrality backing — immediate knowledge integration review required.` : 'All knowledge articles have either skill or centrality backing at this time.'}`;
  } catch {
    return 'KGCASK: knowledge AIP centrality coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY ARMED', 'SKILL-BACKED', 'NODE-LINKED', 'DORMANT'];
const TAB_KEY = {
  'ALL': null,
  'FULLY ARMED': 'FULLY_ARMED',
  'SKILL-BACKED': 'SKILL_BACKED',
  'NODE-LINKED': 'NODE_LINKED',
  'DORMANT': 'DORMANT',
};

const COVER_COLOR = {
  FULLY_ARMED: '#22c55e',
  SKILL_BACKED: '#a78bfa',
  NODE_LINKED: '#06b6d4',
  DORMANT: '#7c3aed',
};

const LABEL_MAP = {
  FULLY_ARMED: 'FULLY ARMED',
  SKILL_BACKED: 'SKILL-BACKED',
  NODE_LINKED: 'NODE-LINKED',
  DORMANT: 'DORMANT',
};

export default function KnowledgeAipCentralityTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, skills: 0, nodes: 0, fullyArmed: 0, skillBacked: 0, nodeLinked: 0, dormant: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [kbR, skillR, nodeR] = await Promise.all([
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(`knowledge ${r.status}`)),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : Promise.reject(`skills ${r.status}`)),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(`centrality ${r.status}`)),
      ]);
      const articles = normaliseKbArticles(kbR);
      const skills = normaliseAipSkills(skillR);
      const nodes = normaliseCentralityNodes(nodeR);
      const correlated = correlate(articles, skills, nodes);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        skills: skills.length,
        nodes: nodes.length,
        fullyArmed: correlated.filter(r => r.coverage === 'FULLY_ARMED').length,
        skillBacked: correlated.filter(r => r.coverage === 'SKILL_BACKED').length,
        nodeLinked: correlated.filter(r => r.coverage === 'NODE_LINKED').length,
        dormant: correlated.filter(r => r.coverage === 'DORMANT').length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) setOpen(e.detail.open);
      else setOpen(v => !v);
    };
    window.addEventListener('jarvis:kgcask-toggle', handler);
    return () => window.removeEventListener('jarvis:kgcask-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(s) ||
        r.category.toLowerCase().includes(s) ||
        r.tags.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const total = counts.total || 1;
  const barArmed = (counts.fullyArmed / total * 100).toFixed(1);
  const barSkill = (counts.skillBacked / total * 100).toFixed(1);
  const barNode = (counts.nodeLinked / total * 100).toFixed(1);
  const barDorm = (counts.dormant / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse knowledge article "${row.label}"${row.category ? ' (category: ' + row.category + ')' : ''} for AIP skill and graph centrality coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched skills: ${row.matchedSkills.map(s => s.label).join(', ') || 'none'}. Matched centrality nodes: ${row.matchedNodes.map(n => n.label).join(', ') || 'none'}. ${row.coverage === 'FULLY_ARMED' ? 'This knowledge article has both skill capability and graph centrality backing — assess the completeness of coverage and recommend optimisation.' : row.coverage === 'DORMANT' ? 'This knowledge article has no skill or centrality coverage — assess the knowledge isolation and recommend immediate integration action.' : row.coverage === 'SKILL_BACKED' ? 'This article has skill coverage but no graph centrality context — assess the network grounding gap.' : 'This article has centrality node coverage but no skill backing — assess the capability gap.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.__JARVIS_KEY__ || 'dev-key'}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      /* silent */
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 824080, bottom: 8, zIndex: 500,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Knowledge × AIP Skill × Graph Centrality Triple Coverage (KGCASK)"
      >
        ◈ KGCASK
        {counts.dormant > 0 && (
          <span style={{
            background: '#7c3aed', color: '#f8fafc', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.dormant}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 500,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ KGCASK</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Knowledge × AIP Skill × Graph Centrality Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'KB ARTICLES', val: counts.total, color: '#94a3b8' },
          { label: 'AIP SKILLS', val: counts.skills, color: '#a78bfa' },
          { label: 'CENTRALITY NODES', val: counts.nodes, color: '#06b6d4' },
          { label: 'FULLY ARMED', val: counts.fullyArmed, color: '#22c55e' },
          { label: 'SKILL-BACKED', val: counts.skillBacked, color: '#a78bfa' },
          { label: 'NODE-LINKED', val: counts.nodeLinked, color: '#06b6d4' },
          { label: 'DORMANT', val: counts.dormant, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.6)', borderRadius: 6, padding: '4px 10px',
            border: `1px solid ${s.color}33`,
          }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, background: '#1e293b', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${barArmed}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${barSkill}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
        <div style={{ width: `${barNode}%`, background: '#06b6d4', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDorm}%`, background: '#7c3aed', transition: 'width 0.4s' }} />
      </div>

      {error && (
        <div style={{ margin: '0 14px 6px', color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,197,94,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22c55e' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22c55e' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No articles match current filter.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: 'rgba(30,41,59,0.5)', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${COVER_COLOR[row.coverage]}33`,
              }}
            >
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 110 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.label}</span>
              {row.category && (
                <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.category.slice(0, 18)}</span>
              )}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedSkills.length}sk {row.matchedNodes.length}nd
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.content && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>{row.content.slice(0, 120)}{row.content.length > 120 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* AIP Skills */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>AIP SKILLS ({row.matchedSkills.length})</div>
                    {row.matchedSkills.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched skills.</div>
                      : row.matchedSkills.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(s.score * 400, 100)}%`, height: '100%', background: '#a78bfa' }} />
                            </div>
                            {s.category && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 4px' }}>{s.category.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{s.label}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Centrality Nodes */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>CENTRALITY NODES ({row.matchedNodes.length})</div>
                    {row.matchedNodes.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched nodes.</div>
                      : row.matchedNodes.slice(0, 5).map(n => (
                        <div key={n.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(n.score * 400, 100)}%`, height: '100%', background: '#06b6d4' }} />
                            </div>
                            {n.type && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(6,182,212,0.1)', borderRadius: 3, padding: '1px 4px' }}>{n.type.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{n.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e44',
                    borderRadius: 4, color: '#22c55e', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                    opacity: assessing === row.id ? 0.5 : 1,
                  }}
                >
                  {assessing === row.id ? 'ASSESSING…' : '⬡ ASSESS'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
