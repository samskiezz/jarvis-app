import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSGCASK_RE = /\b(rsgcask|risk\s+signal\s+centrality\s+skill|risk\s+centrality\s+skill|risk\s+signal\s+graph\s+skill|risk\s+graph\s+skill|risk\s+signal\s+aip\s+centrality|risk\s+node\s+skill|centrality\s+risk\s+skill|skill\s+centrality\s+risk|risk\s+network\s+skill|risk\s+signal\s+network\s+skill|risk\s+graph\s+aip|fully\s+mitigated\s+risk|exposed\s+risk\s+signal|risk\s+signal\s+centrality\s+aip|mitigated\s+risk\s+centrality)\b/i;
const THRESHOLD = 0.07;

export function isRsgcaskQuery(t) {
  return RSGCASK_RE.test(t || '');
}

export async function buildRsgcaskScript() {
  try {
    const [signalsRes, centralityRes, skillsRes] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
    ]);
    const signals = normaliseSignals(signalsRes);
    const nodes = normaliseNodes(centralityRes);
    const skills = normaliseSkills(skillsRes);
    const classified = signals.map(s => classifySignal(s, nodes, skills));
    const fullyMitigated = classified.filter(s => s.state === 'FULLY_MITIGATED').length;
    const nodeMapped = classified.filter(s => s.state === 'NODE_MAPPED').length;
    const skillCovered = classified.filter(s => s.state === 'SKILL_COVERED').length;
    const exposed = classified.filter(s => s.state === 'EXPOSED').length;
    const pct = signals.length ? Math.round((fullyMitigated / signals.length) * 100) : 0;
    const exposedNames = classified.filter(s => s.state === 'EXPOSED').slice(0, 3).map(s => s.name).join(', ') || 'none';
    return (
      `RSGCASK: ${signals.length} risk signals correlated against ${nodes.length} graph centrality nodes and ${skills.length} AIP skills. ` +
      `${fullyMitigated} (${pct}%) are FULLY_MITIGATED — both network-centrality-mapped and skill-covered. ` +
      `${nodeMapped} are NODE_MAPPED (graph context without skill backing), ${skillCovered} are SKILL_COVERED (capability without graph alignment), ${exposed} are EXPOSED with no coverage. ` +
      `Exposed signals: ${exposedNames}.`
    );
  } catch {
    return 'RSGCASK data unavailable — check /entities/RiskSignal, /v1/graph/centrality, /v1/aip/skill endpoints.';
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

function normaliseSignals(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'risks', 'signals', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.signal_name || `Risk Signal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || s.signal_type || '',
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
    desc:     String(s.description || s.summary || s.details || '').slice(0, 200),
    _text:    `${s.name || ''} ${s.title || ''} ${s.severity || ''} ${s.category || ''} ${s.type || ''} ${s.description || ''} ${s.summary || ''} ${Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || '')}`,
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

function classifySignal(signal, nodes, skills) {
  const toks = tok(signal._text);
  const matchedNodes = nodes
    .map(n => ({ ...n, score: Math.max(matchScore(toks, n._text), matchScore(tok(n._text), signal._text)) }))
    .filter(n => n.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedSkills = skills
    .map(sk => ({ ...sk, score: Math.max(matchScore(toks, sk._text), matchScore(tok(sk._text), signal._text)) }))
    .filter(sk => sk.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const state = (matchedNodes.length > 0 && matchedSkills.length > 0) ? 'FULLY_MITIGATED'
    : matchedNodes.length > 0 ? 'NODE_MAPPED'
    : matchedSkills.length > 0 ? 'SKILL_COVERED' : 'EXPOSED';
  return { ...signal, state, matchedNodes, matchedSkills };
}

const STATE_COLOR = {
  FULLY_MITIGATED: '#10b981',
  NODE_MAPPED:     '#06b6d4',
  SKILL_COVERED:   '#8b5cf6',
  EXPOSED:         '#ef4444',
};

const STATE_LABEL = {
  FULLY_MITIGATED: 'FULLY MITIGATED',
  NODE_MAPPED:     'NODE MAPPED',
  SKILL_COVERED:   'SKILL COVERED',
  EXPOSED:         'EXPOSED',
};

export default function RiskSignalGraphCentralitySkillTriple() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [signals,    setSignals]    = useState([]);
  const [nodes,      setNodes]      = useState([]);
  const [skills,     setSkills]     = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter,     setFilter]     = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [signalsRes, centralityRes, skillsRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      ]);
      const sg = normaliseSignals(signalsRes);
      const nd = normaliseNodes(centralityRes);
      const sk = normaliseSkills(skillsRes);
      setSignals(sg);
      setNodes(nd);
      setSkills(sk);
      setClassified(sg.map(s => classifySignal(s, nd, sk)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:rsgcask-toggle', handler);
    return () => window.removeEventListener('jarvis:rsgcask-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      if (RSGCASK_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const counts = {
        FULLY_MITIGATED: classified.filter(s => s.state === 'FULLY_MITIGATED').length,
        NODE_MAPPED:     classified.filter(s => s.state === 'NODE_MAPPED').length,
        SKILL_COVERED:   classified.filter(s => s.state === 'SKILL_COVERED').length,
        EXPOSED:         classified.filter(s => s.state === 'EXPOSED').length,
      };
      const prompt = `RSGCASK Risk Signal × Graph Centrality × AIP Skill Triple Coverage: ${signals.length} risk signals cross-referenced against ${nodes.length} graph centrality nodes and ${skills.length} AIP skills. Coverage: FULLY_MITIGATED=${counts.FULLY_MITIGATED} (both graph-centrality-mapped and skill-covered), NODE_MAPPED=${counts.NODE_MAPPED} (graph centrality context without skill backing), SKILL_COVERED=${counts.SKILL_COVERED} (skill capability without graph alignment), EXPOSED=${counts.EXPOSED} (neither — risk signals with no graph centrality or skill coverage — unmitigated threat gap). In 2 sentences, identify which risk signals are most fully covered across both network and capability dimensions versus those that are exposed or missing either graph centrality context or AIP skill backing, and recommend priority mitigation actions.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || j.answer || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const counts = {
    FULLY_MITIGATED: classified.filter(s => s.state === 'FULLY_MITIGATED').length,
    NODE_MAPPED:     classified.filter(s => s.state === 'NODE_MAPPED').length,
    SKILL_COVERED:   classified.filter(s => s.state === 'SKILL_COVERED').length,
    EXPOSED:         classified.filter(s => s.state === 'EXPOSED').length,
  };
  const mitigatedPct = classified.length ? Math.round((counts.FULLY_MITIGATED / classified.length) * 100) : 0;
  const nodePct      = classified.length ? Math.round((counts.NODE_MAPPED     / classified.length) * 100) : 0;
  const skillPct     = classified.length ? Math.round((counts.SKILL_COVERED   / classified.length) * 100) : 0;
  const exposedPct   = classified.length ? Math.round((counts.EXPOSED         / classified.length) * 100) : 0;

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q)
        || s.severity.toLowerCase().includes(q)
        || s.category.toLowerCase().includes(q);
    }
    return true;
  });

  const mono = "'JetBrains Mono',monospace";

  return (
    <div style={{
      position: 'fixed', left: 853760, bottom: 8, zIndex: 553,
      width: 900, maxHeight: 680, background: '#0a0f1a',
      border: '1px solid #10b98133', borderRadius: 10,
      fontFamily: mono, fontSize: 11, color: '#cbd5e1',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 0 24px #10b98122',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', borderBottom: '1px solid #1e293b', background: '#060d18' }}>
        <span style={{ color: '#10b981', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ RSGCASK
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>
          RISK SIGNAL × GRAPH CENTRALITY × AIP SKILL
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {counts.FULLY_MITIGATED > 0 && (
            <span style={{ background: '#10b98122', color: '#10b981', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.FULLY_MITIGATED} MITIGATED
            </span>
          )}
          {counts.EXPOSED > 0 && (
            <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.EXPOSED} EXPOSED
            </span>
          )}
          {loading && <span style={{ color: '#64748b' }}>◌</span>}
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {error && (
        <div style={{ color: '#f87171', padding: '4px 12px', fontSize: 10, background: '#1a0a0a' }}>
          ⚠ {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4, padding: '8px 12px 0' }}>
        {[
          ['SIGNALS',   signals.length,          '#94a3b8'],
          ['NODES',     nodes.length,            '#06b6d4'],
          ['SKILLS',    skills.length,           '#8b5cf6'],
          ['MITIGATED', counts.FULLY_MITIGATED,  '#10b981'],
          ['NODE MAP',  counts.NODE_MAPPED,      '#06b6d4'],
          ['SKILL CVR', counts.SKILL_COVERED,    '#8b5cf6'],
          ['EXPOSED',   counts.EXPOSED,          '#ef4444'],
          ['MIT%',      mitigatedPct + '%',      '#10b981'],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: '#0f172a', borderRadius: 5, padding: '5px 4px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {classified.length > 0 && (
        <div style={{ margin: '8px 12px 0', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: mitigatedPct + '%', background: '#10b981' }} title={`FULLY MITIGATED ${mitigatedPct}%`} />
          <div style={{ width: nodePct      + '%', background: '#06b6d4' }} title={`NODE MAPPED ${nodePct}%`} />
          <div style={{ width: skillPct     + '%', background: '#8b5cf6' }} title={`SKILL COVERED ${skillPct}%`} />
          <div style={{ width: exposedPct   + '%', background: '#ef4444' }} title={`EXPOSED ${exposedPct}%`} />
        </div>
      )}

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px 4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_MITIGATED', 'NODE_MAPPED', 'SKILL_COVERED', 'EXPOSED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] || '#334155' : '#0f172a',
            color: filter === f ? '#000' : '#64748b',
            border: '1px solid ' + (filter === f ? STATE_COLOR[f] || '#475569' : '#1e293b'),
            borderRadius: 4, padding: '2px 9px', cursor: 'pointer', fontSize: 10, fontFamily: mono,
          }}>
            {f === 'ALL' ? 'ALL' : STATE_LABEL[f]}
            {f !== 'ALL' && <span style={{ marginLeft: 4, opacity: 0.8 }}>({counts[f] || 0})</span>}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{
            marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b',
            color: '#94a3b8', borderRadius: 4, padding: '3px 8px', fontSize: 10,
            fontFamily: mono, outline: 'none', width: 160,
          }}
        />
      </div>

      {/* Signal list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 4px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#334155', padding: 16, textAlign: 'center' }}>
            {classified.length === 0 ? 'No risk signal data loaded.' : 'No signals match filter.'}
          </div>
        )}
        {visible.map(signal => (
          <div key={signal.id}>
            <div
              onClick={() => setExpanded(expanded === signal.id ? null : signal.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
                borderRadius: 5, cursor: 'pointer', marginBottom: 2,
                background: expanded === signal.id ? '#0f172a' : 'transparent',
                borderLeft: `3px solid ${STATE_COLOR[signal.state]}`,
              }}
            >
              <span style={{ color: STATE_COLOR[signal.state], fontSize: 10, minWidth: 120, fontWeight: 600 }}>
                {STATE_LABEL[signal.state]}
              </span>
              <span style={{ color: '#e2e8f0', flex: 1, fontSize: 11 }}>{signal.name}</span>
              {signal.severity && (
                <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '0 5px', fontSize: 9 }}>
                  {signal.severity}
                </span>
              )}
              {signal.category && (
                <span style={{ color: '#64748b', fontSize: 10 }}>{signal.category}</span>
              )}
              <span style={{ color: '#475569', fontSize: 10 }}>
                N:{signal.matchedNodes.length} S:{signal.matchedSkills.length}
              </span>
              <span style={{ color: '#334155', fontSize: 10 }}>{expanded === signal.id ? '▲' : '▼'}</span>
            </div>

            {expanded === signal.id && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                padding: '6px 6px 8px', background: '#060d18', borderRadius: 5, marginBottom: 4,
              }}>
                {/* Graph Centrality Nodes */}
                <div>
                  <div style={{ color: '#06b6d4', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    CENTRALITY NODES ({signal.matchedNodes.length})
                  </div>
                  {signal.matchedNodes.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No node matches.</div>
                  ) : signal.matchedNodes.slice(0, 6).map(nd => (
                    <div key={nd.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#67e8f9', fontSize: 10 }}>{nd.name}</span>
                        {nd.type && (
                          <span style={{ background: '#0c4a6e33', color: '#38bdf8', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                            {nd.type}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#1e293b', borderRadius: 2 }}>
                        <div style={{ height: 3, width: Math.round(nd.score * 100) + '%', background: '#06b6d4', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* AIP Skills */}
                <div>
                  <div style={{ color: '#8b5cf6', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    AIP SKILLS ({signal.matchedSkills.length})
                  </div>
                  {signal.matchedSkills.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No skill matches.</div>
                  ) : signal.matchedSkills.slice(0, 6).map(sk => (
                    <div key={sk.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#c4b5fd', fontSize: 10 }}>{sk.name}</span>
                        {sk.category && (
                          <span style={{ background: '#4c1d9533', color: '#a78bfa', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                            {sk.category}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#1e293b', borderRadius: 2 }}>
                        <div style={{ height: 3, width: Math.round(sk.score * 100) + '%', background: '#8b5cf6', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ASSESS footer */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #1e293b', background: '#060d18' }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{assessment}</div>
        )}
        <button onClick={assess} disabled={assessing || classified.length === 0} style={{
          background: assessing ? '#1e293b' : '#10b9811a',
          border: '1px solid #10b98144',
          color: '#10b981', borderRadius: 5, padding: '4px 14px',
          cursor: assessing ? 'default' : 'pointer', fontSize: 11,
          fontFamily: mono, letterSpacing: 1,
        }}>
          {assessing ? '◌ assessing…' : '▶ ASSESS'}
        </button>
      </div>
    </div>
  );
}
