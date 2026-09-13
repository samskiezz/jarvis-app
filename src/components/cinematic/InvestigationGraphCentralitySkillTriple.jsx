import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const INVGCASK_RE = /\b(invgcask|investigation\s+centrality\s+skill|investigation\s+graph\s+skill|investigation\s+aip\s+centrality|investigation\s+node\s+skill|invest\s+centrality\s+skill|invest\s+graph\s+skill|investigation\s+skill\s+centrality|case\s+centrality\s+skill|case\s+graph\s+skill|investigation\s+network\s+skill|equipped\s+investigation|dark\s+investigation\s+skill|investigation\s+skill\s+gap|invest\s+centrality\s+aip)\b/i;
const THRESHOLD = 0.07;

export function isInvgcaskQuery(t) {
  return INVGCASK_RE.test(t || '');
}

export async function buildInvgcaskScript() {
  try {
    const [invRes, centralityRes, skillsRes] = await Promise.all([
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
    ]);
    const cases = normaliseCases(invRes);
    const nodes = normaliseNodes(centralityRes);
    const skills = normaliseSkills(skillsRes);
    const classified = cases.map(c => classifyCase(c, nodes, skills));
    const fullyEquipped = classified.filter(c => c.state === 'FULLY_EQUIPPED').length;
    const nodeLinked = classified.filter(c => c.state === 'NODE_LINKED').length;
    const skilled = classified.filter(c => c.state === 'SKILLED').length;
    const dark = classified.filter(c => c.state === 'DARK').length;
    const pct = cases.length ? Math.round((fullyEquipped / cases.length) * 100) : 0;
    const darkNames = classified.filter(c => c.state === 'DARK').slice(0, 3).map(c => c.name).join(', ') || 'none';
    return (
      `INVGCASK: ${cases.length} open investigations correlated against ${nodes.length} graph centrality nodes and ${skills.length} AIP skills. ` +
      `${fullyEquipped} (${pct}%) are FULLY_EQUIPPED — both high-influence node alignment and skill coverage confirmed. ` +
      `${nodeLinked} are NODE_LINKED (graph context without skill backing), ${skilled} are SKILLED (capability without graph alignment), ${dark} are DARK with neither coverage. ` +
      `Dark cases: ${darkNames}.`
    );
  } catch {
    return 'INVGCASK data unavailable — check /v1/investigations, /v1/graph/centrality, /v1/aip/skill endpoints.';
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

function normaliseCases(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:       c.id || String(i),
    name:     c.title || c.name || c.subject || `Investigation ${i + 1}`,
    kind:     c.kind || c.type || c.category || '',
    status:   c.status || c.state || '',
    priority: c.priority || '',
    desc:     String(c.description || c.summary || '').slice(0, 200),
    _text:    `${c.title || ''} ${c.name || ''} ${c.subject || ''} ${c.kind || ''} ${c.type || ''} ${c.description || ''} ${c.summary || ''} ${Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || '')}`,
  }));
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'items', 'results', 'data', 'records', 'centrality'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((n, i) => ({
    id:    n.id || n.node_id || String(i),
    name:  n.label || n.name || n.title || n.entity || `Node ${i + 1}`,
    type:  n.type || n.entity_type || n.category || '',
    score: n.score || n.centrality_score || n.betweenness || n.pagerank || 0,
    _text: `${n.label || ''} ${n.name || ''} ${n.type || ''} ${n.entity_type || ''} ${n.description || ''} ${n.category || ''}`,
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((sk, i) => ({
    id:       sk.id || String(i),
    name:     sk.name || sk.skill_name || sk.title || `Skill ${i + 1}`,
    category: sk.category || sk.type || sk.domain || '',
    desc:     String(sk.description || sk.summary || '').slice(0, 200),
    _text:    `${sk.name || ''} ${sk.skill_name || ''} ${sk.category || ''} ${sk.type || ''} ${sk.description || ''} ${sk.domain || ''}`,
  }));
}

function classifyCase(inv, nodes, skills) {
  const toks = tok(inv._text);
  const matchedNodes = nodes
    .map(n => ({ ...n, score: matchScore(toks, n._text) }))
    .filter(n => n.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedSkills = skills
    .map(sk => ({ ...sk, score: matchScore(toks, sk._text) }))
    .filter(sk => sk.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const hasNode = matchedNodes.length > 0;
  const hasSkill = matchedSkills.length > 0;
  const state = hasNode && hasSkill ? 'FULLY_EQUIPPED'
    : hasNode ? 'NODE_LINKED'
    : hasSkill ? 'SKILLED'
    : 'DARK';
  return { ...inv, state, matchedNodes, matchedSkills };
}

const STATE_COLORS = {
  FULLY_EQUIPPED: '#22d3ee',
  NODE_LINKED:    '#34d399',
  SKILLED:        '#a78bfa',
  DARK:           '#6b7280',
};

const STATE_LABELS = {
  FULLY_EQUIPPED: 'FULLY EQUIPPED',
  NODE_LINKED:    'NODE LINKED',
  SKILLED:        'SKILLED',
  DARK:           'DARK',
};

export default function InvestigationGraphCentralitySkillTriple() {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, centralityRes, skillsRes] = await Promise.all([
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      ]);
      setNodes(normaliseNodes(centralityRes));
      setSkills(normaliseSkills(skillsRes));
      setCases(normaliseCases(invRes).map(c =>
        classifyCase(c, normaliseNodes(centralityRes), normaliseSkills(skillsRes))
      ));
    } catch {
      /* silently fail — backend may be unreachable */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener('jarvis:invgcask-toggle', toggle);
    return () => window.removeEventListener('jarvis:invgcask-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const fullyEquipped = cases.filter(c => c.state === 'FULLY_EQUIPPED').length;
  const nodeLinked    = cases.filter(c => c.state === 'NODE_LINKED').length;
  const skilled       = cases.filter(c => c.state === 'SKILLED').length;
  const dark          = cases.filter(c => c.state === 'DARK').length;

  const filtered = cases.filter(c => {
    if (tab !== 'ALL' && c.state !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.kind.toLowerCase().includes(q);
    }
    return true;
  });

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildInvgcaskScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const ans = d.answer || script;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: ans } }));
    } catch {
      const fallback = await buildInvgcaskScript();
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: fallback } }));
    }
    setAssessing(false);
  }, []);

  if (!open) {
    const badge = dark > 0 ? dark : fullyEquipped;
    const badgeColor = dark > 0 ? '#ef4444' : '#22d3ee';
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: 'fixed', bottom: 8, left: 854320, zIndex: 554,
          background: '#0a0f1a', border: '1px solid #22d3ee44',
          color: '#22d3ee', fontFamily: 'monospace', fontSize: 10,
          padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        ◈ INVGCASK
        {badge > 0 && (
          <span style={{
            background: badgeColor, color: '#000', borderRadius: '50%',
            width: 16, height: 16, fontSize: 9, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          }}>{badge}</span>
        )}
      </button>
    );
  }

  const barTotal = cases.length || 1;

  return (
    <div style={{
      position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
      width: 780, maxHeight: '80vh', background: '#080d1a',
      border: '1px solid #22d3ee66', borderRadius: 10, zIndex: 554,
      display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      boxShadow: '0 0 40px #22d3ee22',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #22d3ee33',
      }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>
          ◈ INVGCASK — Investigation × Graph Centrality × AIP Skill
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleAssess} disabled={assessing} style={{
            background: assessing ? '#333' : '#22d3ee22', border: '1px solid #22d3ee',
            color: '#22d3ee', fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
          }}>{assessing ? '…' : '▶ ASSESS'}</button>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#888', fontSize: 16, cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'CASES', val: cases.length, color: '#94a3b8' },
          { label: 'NODES', val: nodes.length, color: '#94a3b8' },
          { label: 'SKILLS', val: skills.length, color: '#94a3b8' },
          { label: 'FULLY EQUIPPED', val: fullyEquipped, color: '#22d3ee' },
          { label: 'NODE LINKED', val: nodeLinked, color: '#34d399' },
          { label: 'SKILLED', val: skilled, color: '#a78bfa' },
          { label: 'DARK', val: dark, color: '#6b7280' },
          { label: 'EQUIPPED %', val: cases.length ? `${Math.round(fullyEquipped / cases.length * 100)}%` : '—', color: '#22d3ee' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: '#0d1526', border: `1px solid ${color}44`,
            borderRadius: 6, padding: '5px 10px', minWidth: 90, textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#64748b', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ margin: '0 14px 10px', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
        {[
          { n: fullyEquipped, c: '#22d3ee' },
          { n: nodeLinked,    c: '#34d399' },
          { n: skilled,       c: '#a78bfa' },
          { n: dark,          c: '#374151' },
        ].map(({ n, c }, i) => (
          <div key={i} style={{ flex: n / barTotal, background: c, transition: 'flex 0.4s' }} />
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_EQUIPPED', 'NODE_LINKED', 'SKILLED', 'DARK'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#22d3ee22' : 'transparent',
            border: `1px solid ${tab === t ? '#22d3ee' : '#334'}`,
            color: tab === t ? '#22d3ee' : '#64748b',
            fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
          }}>{t.replace('_', ' ')}</button>
        ))}
        <input
          placeholder="search…" value={search} onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: '#0d1526', border: '1px solid #334',
            color: '#94a3b8', fontSize: 10, padding: '3px 8px', borderRadius: 4, width: 140,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        {loading && <div style={{ color: '#64748b', fontSize: 11, textAlign: 'center', padding: 20 }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#64748b', fontSize: 11, textAlign: 'center', padding: 20 }}>No results.</div>
        )}
        {filtered.map(c => {
          const isExp = expanded === c.id;
          return (
            <div key={c.id} style={{ marginBottom: 6, borderRadius: 6, overflow: 'hidden', border: '1px solid #1e2a3a' }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', background: '#0d1526', cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: 8, padding: '2px 6px', borderRadius: 3,
                  background: `${STATE_COLORS[c.state]}22`,
                  color: STATE_COLORS[c.state], fontWeight: 700, minWidth: 90, textAlign: 'center',
                }}>{STATE_LABELS[c.state]}</span>
                <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                {c.kind && <span style={{ color: '#475569', fontSize: 9 }}>{c.kind}</span>}
                {c.status && <span style={{ color: '#64748b', fontSize: 9, marginLeft: 4 }}>{c.status}</span>}
                <span style={{ color: '#334', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background: '#06080f', padding: 10, display: 'flex', gap: 10 }}>
                  {/* centrality nodes pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#34d399', fontSize: 9, fontWeight: 700, marginBottom: 6 }}>
                      CENTRALITY NODES ({c.matchedNodes.length})
                    </div>
                    {c.matchedNodes.length === 0
                      ? <div style={{ color: '#374151', fontSize: 9 }}>No matching centrality nodes.</div>
                      : c.matchedNodes.map((n, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#cbd5e1', fontSize: 10 }}>{n.name}</span>
                            <span style={{ color: '#34d399', fontSize: 9 }}>{Math.round(n.score * 100)}%</span>
                          </div>
                          {n.type && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 2, background: '#1a2a1a', color: '#34d399' }}>{n.type}</span>}
                          <div style={{ height: 3, background: '#1a2a1a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{ width: `${n.score * 100}%`, height: '100%', background: '#34d399', borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* skills pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a78bfa', fontSize: 9, fontWeight: 700, marginBottom: 6 }}>
                      AIP SKILLS ({c.matchedSkills.length})
                    </div>
                    {c.matchedSkills.length === 0
                      ? <div style={{ color: '#374151', fontSize: 9 }}>No matching AIP skills.</div>
                      : c.matchedSkills.map((sk, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#cbd5e1', fontSize: 10 }}>{sk.name}</span>
                            <span style={{ color: '#a78bfa', fontSize: 9 }}>{Math.round(sk.score * 100)}%</span>
                          </div>
                          {sk.category && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 2, background: '#1a1a2a', color: '#a78bfa' }}>{sk.category}</span>}
                          <div style={{ height: 3, background: '#1a1a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{ width: `${sk.score * 100}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                          </div>
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
    </div>
  );
}
