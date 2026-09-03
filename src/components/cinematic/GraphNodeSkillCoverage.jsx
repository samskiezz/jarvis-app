import { useState, useEffect, useCallback } from 'react';

const API = '';
const GNSK_RE = /\b(graph[._-]?skill[s]?|skill[s]?[._-]?(?:graph|node)[s]?|gnsk|unskilled[._-]?node[s]?|node[._-]?skill[._-]?(?:coverage|gap)|graph[._-]?capability[._-]?gap|graph[._-]?skill[._-]?(?:coverage|gap|readiness)|skill[._-]?node[._-]?coverage)\b/i;

export function isGnskQuery(t) {
  return GNSK_RE.test(t || '');
}

export async function buildGnskScript() {
  const [grR, skR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const nodes = normaliseNodes(grR.status === 'fulfilled' ? grR.value : []);
  const skills = normaliseSkills(skR.status === 'fulfilled' ? skR.value : []);
  const enriched = correlate(nodes, skills);
  const covered = enriched.filter(n => n._linked).length;
  const unskilled = enriched.filter(n => !n._linked).length;
  return (
    `Graph Node × Skill Coverage: ${nodes.length} top-influence nodes, ${skills.length} JARVIS skills. ` +
    `${covered} nodes are COVERED (skill domain alignment found); ${unskilled} are UNSKILLED (no JARVIS skill addresses this node's domain — capability gap). ` +
    `Top unskilled nodes: ${enriched.filter(n => !n._linked).slice(0, 3).map(n => n.label || n.name || '?').join(', ') || 'none'}.`
  );
}

function normaliseNodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'items', 'results', 'data', 'records', 'centrality']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['skills', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(node, skill) {
  const nodeToks = new Set([
    ...tokens(node.label),
    ...tokens(node.name),
    ...tokens(node.type),
    ...tokens(node.category),
    ...tokens(node.description),
    ...tokens(node.tags),
  ].filter(Boolean));
  const skillToks = [
    ...tokens(skill.name),
    ...tokens(skill.title),
    ...tokens(skill.description),
    ...tokens(skill.category),
    ...tokens(skill.domain),
    ...tokens(skill.tags),
  ].filter(Boolean);
  if (!nodeToks.size || !skillToks.length) return 0;
  let hits = 0;
  for (const t of skillToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, skillToks.length);
}

function correlate(nodes, skills) {
  return nodes.map(node => {
    const scored = skills
      .map(sk => ({ sk, score: matchScore(node, sk) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...node, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const PU = '#A78BFA';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = AM) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function GraphNodeSkillCoverage() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grR, skR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      setNodes(normaliseNodes(grR.status === 'fulfilled' ? grR.value : []));
      setSkills(normaliseSkills(skR.status === 'fulfilled' ? skR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnsk-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gnsk-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(nodes, skills);
  const covered = enriched.filter(n => n._linked);
  const unskilled = enriched.filter(n => !n._linked);
  const badgeCount = unskilled.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(n => tab === 'ALL' || (tab === 'COVERED' ? n._linked : !n._linked))
    .filter(n => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(n.label || '').toLowerCase().includes(q) ||
        String(n.name || '').toLowerCase().includes(q) ||
        String(n.type || '').toLowerCase().includes(q) ||
        String(n.category || '').toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${nodes.length} top-influence graph nodes and ${skills.length} JARVIS skills. ` +
            `${covered.length} nodes are COVERED (at least one skill addresses the node's domain); ` +
            `${unskilled.length} are UNSKILLED (no JARVIS skill covers this node's domain — capability gap). ` +
            `Top unskilled nodes: ${unskilled.slice(0, 3).map(n => n.label || n.name || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence graph-skill readiness brief highlighting the biggest capability gaps and which influential nodes need new skill development.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const nodeLabel = n => n.label || n.name || n.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Graph Node × Skill Coverage (GNSK)"
        style={{
          position: 'fixed', left: 683520, bottom: 8, zIndex: 249,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ GNSK
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${AM}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${AM}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AM}` }}>
              ◈ GRAPH NODE × SKILL COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${AM}55`,
                  background: 'transparent', color: AM, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'NODES', val: nodes.length, col: CY },
              { label: 'SKILLS', val: skills.length, col: PU },
              { label: 'COVERED', val: covered.length, col: GR },
              { label: 'UNSKILLED', val: unskilled.length, col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'COVERED', 'UNSKILLED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? AM : '#2a3a4a'}`,
                  background: tab === t ? `${AM}22` : 'transparent',
                  color: tab === t ? AM : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search nodes…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No graph nodes found.'}
              </div>
            ) : filtered.map((node, i) => {
              const isCovered = node._linked;
              const statusColor = isCovered ? GR : AM;
              const isExp = expanded === i;
              return (
                <div
                  key={node.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{nodeLabel(node)}</span>
                    {node.type && chip(String(node.type).slice(0, 14), CY)}
                    {node.category && chip(String(node.category).slice(0, 14), PU)}
                    {typeof node.score === 'number' && (
                      <span style={{ color: '#6E8AA0', fontSize: 9 }}>
                        inf:{node.score.toFixed(2)}
                      </span>
                    )}
                    {chip(isCovered ? 'COVERED' : 'UNSKILLED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {node._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING SKILLS
                          </div>
                          {node._matches.map(({ sk, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {sk.category && chip(String(sk.category).toUpperCase().slice(0, 14), PU)}
                              {sk.domain && chip(String(sk.domain).toUpperCase().slice(0, 12), CY)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {sk.name || sk.title || sk.id || '?'}
                              </span>
                              {scorebar(score, AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No skill coverage found for this node's domain.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${AM}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(245,158,11,0.03)',
            }}>
              <span style={{ color: AM, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
