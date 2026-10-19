/**
 * GraphSkillInvestigationCoverage — F46
 *
 * Fetches /v1/graph/centrality + /v1/aip/skill + /v1/investigations
 * Cross-references each graph node against skills AND investigations to classify:
 *   INVESTIGATED — matched both a skill AND an investigation (full coverage)
 *   SKILLED      — matched a skill only (capability exists, no active case)
 *   TRACED       — matched an investigation only (case open, no mapped skill)
 *   DARK         — no match in either (blind spot — high-centrality node with no coverage)
 *
 * Toggle: ◈ GSKICOV button (fixed, bottom strip) left:74680, zIndex:144
 * Stat tiles: nodes / skills / investigations / investigated / skilled / traced / dark
 * Amber pulse on DARK count (blind spots).
 * Expandable rows: matched skills with score badge + matched investigations with status badge.
 * Filter tabs: ALL / INVESTIGATED / SKILLED / TRACED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "graph coverage"/"skill topology"/"graph investigation"/"coverage topology"/
 *        "gskicov"/"graph skill"/"node coverage"/"investigation topology"/"blind spot"
 * Event: jarvis:gskicov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'INVESTIGATED', 'SKILLED', 'TRACED', 'DARK'];

const CLS_COLOR = {
  INVESTIGATED: '#00E5A0',
  SKILLED:      '#29E7FF',
  TRACED:       '#A78BFA',
  DARK:         '#FFB800',
};

const PULSE_CSS = `@keyframes gskicov-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classify(nodeToks, skills, investigations) {
  const matchedSkills = skills.filter(s =>
    overlaps(nodeToks, [s.name, s.title, s.description, s.category, s.domain, s.tags, s.type].join(' '))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(nodeToks, [inv.name, inv.title, inv.subject, inv.description, inv.tags, inv.category, inv.type, inv.target].join(' '))
  );
  const hasSkill = matchedSkills.length > 0;
  const hasInv   = matchedInvestigations.length > 0;
  const cls = hasSkill && hasInv ? 'INVESTIGATED' : hasSkill ? 'SKILLED' : hasInv ? 'TRACED' : 'DARK';
  return { cls, matchedSkills, matchedInvestigations };
}

export function isGskicovQuery(q) {
  return /\b(graph.coverage|skill.topology|graph.investigation|coverage.topology|gskicov|graph.skill|node.coverage|investigation.topology|blind.spot|graph.blind|dark.node|node.blind|coverage.audit|graph.audit|topology.coverage)\b/i.test(q);
}
export function buildGskicovScript() {
  return 'Opening Graph × Skill × Investigation Coverage Topology. Cross-referencing all graph nodes against active skills and investigations to identify blind spots and dark nodes with no coverage.';
}

export default function GraphSkillInvestigationCoverage() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [skillCount, setSkillCount]   = useState(0);
  const [invCount, setInvCount]       = useState(0);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState('');
  const intervalRef                   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [graphRes, skillRes, invRes] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`,  { headers: h }),
        fetch(`${API}/v1/aip/skill`,         { headers: h }),
        fetch(`${API}/v1/investigations`,    { headers: h }),
      ]);
      const [graphRaw, skillRaw, invRaw] = await Promise.all([
        graphRes.ok ? graphRes.json() : [],
        skillRes.ok ? skillRes.json() : [],
        invRes.ok   ? invRes.json()   : [],
      ]);

      const nodes = Array.isArray(graphRaw)
        ? graphRaw
        : (graphRaw?.data || graphRaw?.nodes || graphRaw?.entities || graphRaw?.results || graphRaw?.centrality || []);
      const skills = Array.isArray(skillRaw)
        ? skillRaw
        : (skillRaw?.items || skillRaw?.data || skillRaw?.results || skillRaw?.skills || []);
      const investigations = Array.isArray(invRaw)
        ? invRaw
        : (invRaw?.items || invRaw?.data || invRaw?.results || invRaw?.investigations || []);

      setSkillCount(skills.length);
      setInvCount(investigations.length);

      const built = nodes.map((node, i) => {
        const id    = node.id || node.entity_id || `node-${i}`;
        const name  = node.name || node.label || node.entity || id;
        const type  = node.type || node.entity_type || node.kind || '';
        const score = node.score ?? node.centrality_score ?? node.value ?? node.degree ?? 0;
        const toks  = tokens([name, type, id].join(' '));
        const { cls, matchedSkills, matchedInvestigations } = classify(toks, skills, investigations);
        return { id, name, type, score, _cls: cls, _skills: matchedSkills, _investigations: matchedInvestigations };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:gskicov-toggle', handler);
    return () => window.removeEventListener('jarvis:gskicov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { INVESTIGATED: 0, SKILLED: 0, TRACED: 0, DARK: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const darkNodes = rows.filter(r => r._cls === 'DARK').slice(0, 5).map(r => r.name).join(', ');
    const prompt = `Graph × Skill × Investigation Coverage Topology assessment: ${rows.length} graph nodes cross-referenced against ${skillCount} skills and ${invCount} investigations. ${counts.INVESTIGATED} nodes have full coverage (skill + investigation). ${counts.SKILLED} have skill coverage only. ${counts.TRACED} have investigation tracking only. ${counts.DARK} nodes are dark — no mapped skill or open investigation. ${darkNodes ? `Key dark nodes: ${darkNodes}.` : ''} Assess the blind spots, identify the highest-centrality uncovered nodes, and recommend investigation or skill assignment priorities.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing, skillCount, invCount]);

  const counts = { INVESTIGATED: 0, SKILLED: 0, TRACED: 0, DARK: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.type, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 74680, zIndex: 144,
          background: 'rgba(255,184,0,0.12)', border: '1px solid #FFB800',
          color: '#FFB800', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ GSKICOV
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #2a2a1a',
        borderRadius: 6, zIndex: 9145, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #2a2a1a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,184,0,0.05)',
        }}>
          <span style={{ fontSize: 11, color: '#FFB800', letterSpacing: 2 }}>
            ◈ GRAPH × SKILL × INVESTIGATION — GSKICOV
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'NODES',        val: rows.length,           color: '#29E7FF' },
            { label: 'SKILLS',       val: skillCount,            color: '#29E7FF' },
            { label: 'INVEST',       val: invCount,              color: '#29E7FF' },
            { label: 'INVESTIGATED', val: counts.INVESTIGATED,   color: CLS_COLOR.INVESTIGATED },
            { label: 'SKILLED',      val: counts.SKILLED,        color: CLS_COLOR.SKILLED },
            { label: 'TRACED',       val: counts.TRACED,         color: CLS_COLOR.TRACED },
            { label: 'DARK',         val: counts.DARK,           color: CLS_COLOR.DARK, pulse: counts.DARK > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'gskicov-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #2a2a1a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#29E7FF'}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#2a4a5a'}`,
              color: tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#6A8BA0',
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, letterSpacing: 1,
            }}>{t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ''}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search nodes…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #2a4a5a',
              color: '#e2eaf0', padding: '2px 8px', borderRadius: 3, fontSize: 9, width: 140,
            }}
          />
        </div>

        {/* Status */}
        {loading && <div style={{ padding: '4px 14px', fontSize: 9, color: '#6A8BA0' }}>⟳ loading…</div>}
        {error   && <div style={{ padding: '4px 14px', fontSize: 9, color: '#ef4444' }}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.map((node, i) => {
            const isExp = expanded === (node.id || i);
            return (
              <div key={node.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (node.id || i))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[node._cls]}22`, color: CLS_COLOR[node._cls],
                    border: `1px solid ${CLS_COLOR[node._cls]}55`, letterSpacing: 1,
                    minWidth: 88, textAlign: 'center',
                  }}>{node._cls}</span>
                  {node.type && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(41,231,255,0.08)', color: '#29E7FF',
                      border: '1px solid #29E7FF33',
                    }}>{node.type.toUpperCase().slice(0, 12)}</span>
                  )}
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>{node.name}</span>
                  <span style={{ fontSize: 9, color: '#4a7a9a', fontVariantNumeric: 'tabular-nums' }}>
                    {typeof node.score === 'number' ? node.score.toFixed(3) : ''}
                  </span>
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {node._skills.length}S {node._investigations.length}I
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {node._skills.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED SKILLS</div>
                        {node._skills.slice(0, 5).map((s, si) => (
                          <div key={si} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {s.name || s.title || `Skill ${si + 1}`}
                            {(s.score != null || s.category || s.domain) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[
                                  s.category || s.domain,
                                  s.score != null ? `score:${(+s.score).toFixed(2)}` : null,
                                ].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {node._investigations.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED INVESTIGATIONS</div>
                        {node._investigations.slice(0, 5).map((inv, ii) => (
                          <div key={ii} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {inv.name || inv.title || inv.subject || `Investigation ${ii + 1}`}
                            {(inv.status || inv.priority) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[inv.status, inv.priority].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {node._skills.length === 0 && node._investigations.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No matched skills or investigations — node is dark.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '12px 14px', color: '#6A8BA0', fontSize: 10 }}>No nodes match current filter.</div>
          )}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #2a2a1a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.1)' : 'rgba(255,184,0,0.15)',
              border: '1px solid #FFB800', color: '#FFB800',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS COVERAGE'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,184,0,0.07)', borderLeft: '2px solid #FFB800', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
