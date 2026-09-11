import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium',
  '02_intelligence_nexus',
  '03_threat_theatre',
  '04_mission_forge',
  '05_signals_bridge',
  '06_synthetic_oracle',
  '07_sovereign_archive',
  '08_field_operations',
  '09_crisis_calculus',
  '10_sentinel_watch',
];

const SCGCASK_RE = /\b(scgcask|scene\s+centrality\s+skill|scene\s+graph\s+skill|cinematic\s+centrality\s+skill|scene\s+aip\s+centrality|scene\s+node\s+skill|centrality\s+skill\s+scene|skill\s+centrality\s+scene|scene\s+network\s+skill|cinematic\s+aip\s+centrality|scene\s+graph\s+aip|scene\s+centrality\s+aip)\b/i;
const THRESHOLD = 0.07;

export function isScgcaskQuery(t) {
  return SCGCASK_RE.test(t || '');
}

export async function buildScgcaskScript() {
  try {
    const [scenesR, centralityRes, skillsRes] = await Promise.all([
      Promise.allSettled(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
      ),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
    ]);
    const rawScenes = scenesR
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
    const scenes = normaliseScenes(rawScenes);
    const nodes = normaliseNodes(centralityRes);
    const skills = normaliseSkills(skillsRes);
    const classified = scenes.map(s => classifyScene(s, nodes, skills));
    const equipped = classified.filter(s => s.state === 'FULLY_EQUIPPED').length;
    const nodeOnly = classified.filter(s => s.state === 'NODE_LINKED').length;
    const skillOnly = classified.filter(s => s.state === 'SKILLED').length;
    const dark = classified.filter(s => s.state === 'DARK').length;
    const pct = scenes.length ? Math.round((equipped / scenes.length) * 100) : 0;
    const darkTitles = classified.filter(s => s.state === 'DARK').slice(0, 3).map(s => s.title).join(', ') || 'none';
    return (
      `SCGCASK: ${scenes.length} cinematic scenes correlated against ${nodes.length} graph centrality nodes and ${skills.length} AIP skills. ` +
      `${equipped} (${pct}%) are FULLY EQUIPPED — both network-centrality-backed and skill-capable. ` +
      `${nodeOnly} are NODE_LINKED (graph context without skill), ${skillOnly} are SKILLED (capability without network backing), ${dark} are DARK with no coverage. ` +
      `Dark scenes: ${darkTitles}.`
    );
  } catch {
    return 'SCGCASK data unavailable — check /v1/cinematic/scene, /v1/graph/centrality, /v1/aip/skill endpoints.';
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

function normaliseScenes(rawArr) {
  return rawArr.map((raw, i) => {
    const id = raw?.id || raw?.scene_id || SCENE_IDS[i] || `scene-${i}`;
    const title = raw?.title || raw?.name || id.replace(/_/g, ' ').replace(/^\d+\s*/, '').toUpperCase();
    const desc  = String(raw?.description || raw?.summary || raw?.briefing || '').slice(0, 300);
    const tags  = Array.isArray(raw?.tags) ? raw.tags.join(' ') : (raw?.tags || '');
    const anchors = Array.isArray(raw?.anchors)
      ? raw.anchors.map(a => (typeof a === 'string' ? a : (a?.label || a?.title || a?.text || ''))).join(' ')
      : '';
    return { id, title, desc, tags, anchors, _text: `${title} ${desc} ${tags} ${anchors}` };
  });
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
    desc:  String(n.description || n.summary || '').slice(0, 200),
    _text: `${n.label || ''} ${n.name || ''} ${n.type || ''} ${n.entity_type || ''} ${n.description || ''} ${n.category || ''}`,
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.skill_name || `Skill ${i + 1}`,
    category: s.category || s.domain || s.type || '',
    desc:     String(s.description || s.summary || '').slice(0, 200),
    _text:    `${s.name || ''} ${s.title || ''} ${s.category || ''} ${s.description || ''} ${Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || '')}`,
  }));
}

function classifyScene(scene, nodes, skills) {
  const toks = tok(scene._text);
  const matchedNodes = nodes
    .map(n => ({ ...n, score: Math.max(matchScore(toks, n._text), matchScore(tok(n._text), scene._text)) }))
    .filter(n => n.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedSkills = skills
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._text), matchScore(tok(s._text), scene._text)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const state = (matchedNodes.length > 0 && matchedSkills.length > 0) ? 'FULLY_EQUIPPED'
    : matchedNodes.length > 0 ? 'NODE_LINKED'
    : matchedSkills.length > 0 ? 'SKILLED' : 'DARK';
  return { ...scene, state, matchedNodes, matchedSkills };
}

const STATE_COLOR = {
  FULLY_EQUIPPED: '#06b6d4',
  NODE_LINKED:    '#10b981',
  SKILLED:        '#8b5cf6',
  DARK:           '#6b7280',
};

const STATE_LABEL = {
  FULLY_EQUIPPED: 'FULLY EQUIPPED',
  NODE_LINKED:    'NODE LINKED',
  SKILLED:        'SKILLED',
  DARK:           'DARK',
};

export default function SceneGraphCentralitySkillTriple() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [scenes,     setScenes]     = useState([]);
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
      const [scenesR, centralityRes, skillsRes] = await Promise.all([
        Promise.allSettled(
          SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
        ),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      ]);
      const rawScenes = scenesR
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
      const sc = normaliseScenes(rawScenes);
      const nd = normaliseNodes(centralityRes);
      const sk = normaliseSkills(skillsRes);
      setScenes(sc);
      setNodes(nd);
      setSkills(sk);
      setClassified(sc.map(s => classifyScene(s, nd, sk)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:scgcask-toggle', handler);
    return () => window.removeEventListener('jarvis:scgcask-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      if (SCGCASK_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const counts = {
        FULLY_EQUIPPED: classified.filter(s => s.state === 'FULLY_EQUIPPED').length,
        NODE_LINKED:    classified.filter(s => s.state === 'NODE_LINKED').length,
        SKILLED:        classified.filter(s => s.state === 'SKILLED').length,
        DARK:           classified.filter(s => s.state === 'DARK').length,
      };
      const prompt = `SCGCASK Scene × Graph Centrality × AIP Skill Triple Coverage: ${scenes.length} cinematic scenes cross-referenced against ${nodes.length} graph centrality nodes and ${skills.length} AIP skills. Coverage: FULLY_EQUIPPED=${counts.FULLY_EQUIPPED} (both graph node context and skill capability confirmed), NODE_LINKED=${counts.NODE_LINKED} (graph node matched, no skill backing), SKILLED=${counts.SKILLED} (skill capability, no centrality node), DARK=${counts.DARK} (neither — operational blind spots with no network or capability coverage). In 2 sentences, identify which scenes have complete network-intelligence and capability coverage versus those that are dark or missing either graph centrality context or skill backing, and recommend priority actions for the uncovered scenes.`;
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
    FULLY_EQUIPPED: classified.filter(s => s.state === 'FULLY_EQUIPPED').length,
    NODE_LINKED:    classified.filter(s => s.state === 'NODE_LINKED').length,
    SKILLED:        classified.filter(s => s.state === 'SKILLED').length,
    DARK:           classified.filter(s => s.state === 'DARK').length,
  };
  const equippedPct = classified.length ? Math.round((counts.FULLY_EQUIPPED / classified.length) * 100) : 0;
  const nodePct     = classified.length ? Math.round((counts.NODE_LINKED    / classified.length) * 100) : 0;
  const skillPct    = classified.length ? Math.round((counts.SKILLED        / classified.length) * 100) : 0;
  const darkPct     = classified.length ? Math.round((counts.DARK           / classified.length) * 100) : 0;

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const mono = "'JetBrains Mono',monospace";

  return (
    <div style={{
      position: 'fixed', left: 852640, bottom: 8, zIndex: 551,
      width: 900, maxHeight: 680, background: '#0a0f1a',
      border: '1px solid #06b6d433', borderRadius: 10,
      fontFamily: mono, fontSize: 11, color: '#cbd5e1',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 0 24px #06b6d422',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', borderBottom: '1px solid #1e293b', background: '#060d18' }}>
        <span style={{ color: '#06b6d4', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ SCGCASK
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>
          SCENE × GRAPH CENTRALITY × AIP SKILL
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {counts.FULLY_EQUIPPED > 0 && (
            <span style={{ background: '#06b6d422', color: '#06b6d4', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.FULLY_EQUIPPED} EQUIPPED
            </span>
          )}
          {counts.DARK > 0 && (
            <span style={{ background: '#6b728022', color: '#9ca3af', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.DARK} DARK
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
          ['SCENES',    scenes.length,          '#94a3b8'],
          ['NODES',     nodes.length,           '#10b981'],
          ['SKILLS',    skills.length,          '#8b5cf6'],
          ['EQUIPPED',  counts.FULLY_EQUIPPED,  '#06b6d4'],
          ['NODE LNK',  counts.NODE_LINKED,     '#10b981'],
          ['SKILLED',   counts.SKILLED,         '#8b5cf6'],
          ['DARK',      counts.DARK,            '#6b7280'],
          ['EQP%',      equippedPct + '%',      '#06b6d4'],
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
          <div style={{ width: equippedPct + '%', background: '#06b6d4' }} title={`FULLY EQUIPPED ${equippedPct}%`} />
          <div style={{ width: nodePct     + '%', background: '#10b981' }} title={`NODE LINKED ${nodePct}%`} />
          <div style={{ width: skillPct    + '%', background: '#8b5cf6' }} title={`SKILLED ${skillPct}%`} />
          <div style={{ width: darkPct     + '%', background: '#374151' }} title={`DARK ${darkPct}%`} />
        </div>
      )}

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px 4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_EQUIPPED', 'NODE_LINKED', 'SKILLED', 'DARK'].map(f => (
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
          placeholder="search scenes…"
          style={{
            marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b',
            color: '#94a3b8', borderRadius: 4, padding: '3px 8px', fontSize: 10,
            fontFamily: mono, outline: 'none', width: 160,
          }}
        />
      </div>

      {/* Scene list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 4px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#334155', padding: 16, textAlign: 'center' }}>
            {classified.length === 0 ? 'No scene data loaded.' : 'No scenes match filter.'}
          </div>
        )}
        {visible.map(scene => (
          <div key={scene.id}>
            <div
              onClick={() => setExpanded(expanded === scene.id ? null : scene.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
                borderRadius: 5, cursor: 'pointer', marginBottom: 2,
                background: expanded === scene.id ? '#0f172a' : 'transparent',
                borderLeft: `3px solid ${STATE_COLOR[scene.state]}`,
              }}
            >
              <span style={{ color: STATE_COLOR[scene.state], fontSize: 10, minWidth: 100, fontWeight: 600 }}>
                {STATE_LABEL[scene.state]}
              </span>
              <span style={{ color: '#e2e8f0', flex: 1, fontSize: 11 }}>{scene.title}</span>
              <span style={{ color: '#475569', fontSize: 10 }}>
                N:{scene.matchedNodes.length} S:{scene.matchedSkills.length}
              </span>
              <span style={{ color: '#334155', fontSize: 10 }}>{expanded === scene.id ? '▲' : '▼'}</span>
            </div>

            {expanded === scene.id && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                padding: '6px 6px 8px', background: '#060d18', borderRadius: 5, marginBottom: 4,
              }}>
                {/* Graph Centrality Nodes */}
                <div>
                  <div style={{ color: '#10b981', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    CENTRALITY NODES ({scene.matchedNodes.length})
                  </div>
                  {scene.matchedNodes.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No node matches.</div>
                  ) : scene.matchedNodes.slice(0, 6).map(nd => (
                    <div key={nd.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#6ee7b7', fontSize: 10 }}>{nd.name}</span>
                        {nd.type && (
                          <span style={{ background: '#06402033', color: '#34d399', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                            {nd.type}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#1e293b', borderRadius: 2 }}>
                        <div style={{ height: 3, width: Math.round(nd.score * 100) + '%', background: '#10b981', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* AIP Skills */}
                <div>
                  <div style={{ color: '#8b5cf6', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    AIP SKILLS ({scene.matchedSkills.length})
                  </div>
                  {scene.matchedSkills.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No skill matches.</div>
                  ) : scene.matchedSkills.slice(0, 6).map(sk => (
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
          background: assessing ? '#1e293b' : '#06b6d41a',
          border: '1px solid #06b6d444',
          color: '#06b6d4', borderRadius: 5, padding: '4px 14px',
          cursor: assessing ? 'default' : 'pointer', fontSize: 11,
          fontFamily: mono, letterSpacing: 1,
        }}>
          {assessing ? '◌ assessing…' : '▶ ASSESS'}
        </button>
      </div>
    </div>
  );
}
