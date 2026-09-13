import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GNKSCEN_RE = /\b(gnkscen|graph[_\s-]?node[_\s-]?knowledge[_\s-]?scenario|node[_\s-]?knowledge[_\s-]?scenario|graph[_\s-]?knowledge[_\s-]?scenario|knowledge[_\s-]?scenario[_\s-]?(?:node|graph)|scenario[_\s-]?knowledge[_\s-]?(?:node|graph)|unprepared[_\s-]?(?:node|graph)|graph[_\s-]?node[_\s-]?(?:scenario|knowledge)[_\s-]?(?:scenario|knowledge)|node[_\s-]?readiness|graph[_\s-]?readiness)\b/i;

export function isGnkscenQuery(t) { return GNKSCEN_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function normNodes(raw) {
  return normaliseArray(raw).map(n => ({
    id: n.id || n._id || String(Math.random()),
    label: n.label || n.name || n.title || 'Node',
    type: n.type || n.kind || n.category || '',
    category: n.category || n.type || '',
    influence: typeof n.influence_score === 'number' ? n.influence_score : (typeof n.score === 'number' ? n.score : 0),
  }));
}

function normArticles(raw) {
  const arr = (() => {
    if (Array.isArray(raw)) return raw;
    for (const k of ['articles', 'knowledge', 'items', 'results', 'data']) {
      if (raw && Array.isArray(raw[k])) return raw[k];
    }
    if (raw && typeof raw === 'object') return Object.values(raw);
    return [];
  })();
  return arr.map(a => ({
    id: a.id || a._id || String(Math.random()),
    label: a.title || a.name || a.label || 'Article',
    category: a.category || a.type || '',
    summary: String(a.summary || a.description || a.content || '').slice(0, 200),
    tags: Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normScenarios(raw) {
  return normaliseArray(raw).map(s => ({
    id: s.id || s._id || String(Math.random()),
    label: s.title || s.name || s.label || 'Scenario',
    status: s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    description: String(s.description || s.summary || '').slice(0, 200),
    tags: Array.isArray(s.tags) ? s.tags : [],
  }));
}

function matchScore(nodeToks, fields) {
  if (!nodeToks.length) return 0;
  const pool = tok(fields.join(' '));
  if (!pool.length) return 0;
  const hits = nodeToks.filter(t => pool.includes(t)).length;
  return hits / Math.max(nodeToks.length, pool.length);
}

const THRESHOLD = 0.08;

function correlate(nodes, articles, scenarios) {
  return nodes.map(node => {
    const nodeToks = tok([node.label, node.type, node.category].join(' '));

    const bestKB = articles.reduce((best, a) => {
      const s = matchScore(nodeToks, [a.label, a.category, a.summary, ...a.tags]);
      return s > best.score ? { score: s, item: a } : best;
    }, { score: 0, item: null });

    const bestScen = scenarios.reduce((best, sc) => {
      const s = matchScore(nodeToks, [sc.label, sc.category, sc.description, ...sc.tags]);
      return s > best.score ? { score: s, item: sc } : best;
    }, { score: 0, item: null });

    const hasKB = bestKB.score >= THRESHOLD;
    const hasScen = bestScen.score >= THRESHOLD;

    let state;
    if (hasKB && hasScen) state = 'FULLY PREPARED';
    else if (hasKB) state = 'KB-ONLY';
    else if (hasScen) state = 'SCENARIO-ONLY';
    else state = 'UNPREPARED';

    return { ...node, state, kb: hasKB ? bestKB : null, scen: hasScen ? bestScen : null };
  });
}

export async function buildGnkscenScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [nR, kR, sR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
  ]);
  const nodes = normNodes(nR.status === 'fulfilled' ? nR.value : []);
  const articles = normArticles(kR.status === 'fulfilled' ? kR.value : []);
  const scenarios = normScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const rows = correlate(nodes, articles, scenarios);
  const fp = rows.filter(r => r.state === 'FULLY PREPARED').length;
  const kb = rows.filter(r => r.state === 'KB-ONLY').length;
  const sc = rows.filter(r => r.state === 'SCENARIO-ONLY').length;
  const up = rows.filter(r => r.state === 'UNPREPARED').length;
  return `GNKSCEN Graph Node × Knowledge × Scenario: ${nodes.length} top-influence graph nodes cross-referenced against ${articles.length} KB articles and ${scenarios.length} scenarios. ` +
    `FULLY PREPARED: ${fp} (KB-backed + scenario-covered — node has both knowledge and operational planning). ` +
    `KB-ONLY: ${kb} (knowledge article found, no scenario playbook). ` +
    `SCENARIO-ONLY: ${sc} (scenario match found, no knowledge article). ` +
    `UNPREPARED: ${up} (no KB article or scenario coverage — critical knowledge and planning gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 88, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY PREPARED': '#22d3ee',
  'KB-ONLY': '#34d399',
  'SCENARIO-ONLY': '#a78bfa',
  'UNPREPARED': '#f59e0b',
};
const STATE_ORDER = ['FULLY PREPARED', 'KB-ONLY', 'SCENARIO-ONLY', 'UNPREPARED'];

const STATUS_COLOR = { active: '#22d3ee', completed: '#34d399', pending: '#f59e0b', draft: '#64748b' };

export default function GraphNodeKnowledgeScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [articles, setArticles] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [nR, kR, sR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
      ]);
      const nodes = normNodes(nR.status === 'fulfilled' ? nR.value : []);
      const arts = normArticles(kR.status === 'fulfilled' ? kR.value : []);
      const scens = normScenarios(sR.status === 'fulfilled' ? sR.value : []);
      setArticles(arts);
      setScenarios(scens);
      setRows(correlate(nodes, arts, scens));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:gnkscen-toggle', toggle);
    return () => window.removeEventListener('jarvis:gnkscen-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const fp = rows.filter(r => r.state === 'FULLY PREPARED').length;
    const up = rows.filter(r => r.state === 'UNPREPARED').length;
    const summary = `GNKSCEN: ${rows.length} graph nodes. FULLY PREPARED: ${fp}. KB-ONLY: ${rows.filter(r => r.state === 'KB-ONLY').length}. SCENARIO-ONLY: ${rows.filter(r => r.state === 'SCENARIO-ONLY').length}. UNPREPARED (critical gap — no KB or scenario): ${up}. ${articles.length} KB articles, ${scenarios.length} scenarios indexed.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this GNKSCEN graph node knowledge and scenario readiness state. Identify the two highest-priority unprepared nodes and the knowledge/planning gaps they represent: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows, articles, scenarios]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || r.label.toLowerCase().includes(search.toLowerCase()) || r.type.toLowerCase().includes(search.toLowerCase()))
  );
  const unpreparedCount = stateCounts['UNPREPARED'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9987, width: 720, maxHeight: 640,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.06)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="GNKSCEN Graph Node × Knowledge × Scenario Triple Coverage" style={{
        position: 'fixed', left: 766960, bottom: 8, zIndex: 398,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ GNKSCEN
        {unpreparedCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {unpreparedCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const fullyPrepared = stateCounts['FULLY PREPARED'] ?? 0;
  const pct = total > 0 ? Math.round((fullyPrepared / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ GNKSCEN</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Graph Node × Knowledge × Scenario Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>TOTAL</div>
          <div style={VAL}>{total}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>KB ARTICLES</div>
          <div style={{ ...VAL, fontSize: 16 }}>{articles.length}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>SCENARIOS</div>
          <div style={{ ...VAL, fontSize: 16 }}>{scenarios.length}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY PREPARED COVERAGE</span>
          <span>{pct}% · {articles.length} KB articles · {scenarios.length} scenarios</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#f59e0b') : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search graph nodes…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no graph nodes match</div>
        ) : visible.map((node, i) => (
          <div key={node.id ?? i} style={{
            padding: '7px 10px', marginBottom: 5, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[node.state]}22`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (node.kb || node.scen) ? 4 : 0 }}>
              <span style={{ fontSize: 8, color: STATE_COLOR[node.state], minWidth: 130, letterSpacing: 0.5, flexShrink: 0 }}>{node.state}</span>
              <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {node.label || '—'}
              </span>
              {node.type && (
                <span style={{ fontSize: 8, color: '#64748b', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{node.type}</span>
              )}
              {node.influence > 0 && (
                <span style={{ fontSize: 7, color: '#475569', flexShrink: 0 }}>inf:{node.influence.toFixed ? node.influence.toFixed(2) : node.influence}</span>
              )}
            </div>
            {(node.kb || node.scen) && (
              <div style={{ paddingLeft: 138, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {node.kb && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#34d399', minWidth: 20 }}>KB</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.kb.item?.label}</span>
                    {node.kb.item?.category && (
                      <span style={{ fontSize: 7, color: '#64748b', background: 'rgba(255,255,255,0.04)', borderRadius: 2, padding: '1px 4px', flexShrink: 0 }}>{node.kb.item.category}</span>
                    )}
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(node.kb.score * 100)}%`, background: '#34d399', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(node.kb.score * 100)}%</span>
                  </div>
                )}
                {node.scen && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#a78bfa', minWidth: 20 }}>SC</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.scen.item?.label}</span>
                    {node.scen.item?.status && (
                      <span style={{ fontSize: 7, color: STATUS_COLOR[node.scen.item.status?.toLowerCase?.()] ?? '#64748b', background: 'rgba(255,255,255,0.04)', borderRadius: 2, padding: '1px 4px', flexShrink: 0 }}>{node.scen.item.status}</span>
                    )}
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(node.scen.score * 100)}%`, background: '#a78bfa', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(node.scen.score * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
          color: '#f59e0b', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>

      <div style={{ padding: '4px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 8, color: 'rgba(0,212,255,0.25)', textAlign: 'right' }}>
        /v1/graph/centrality × /knowledge/* × /v1/scenario/list
      </div>
    </div>
  );
}
