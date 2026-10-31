/**
 * ContactGraphSkillBrainCommand — F223
 *
 * Fetches /entities/Contact + /v1/graph/centrality +
 *         /v1/aip/skill + /v1/cinematic/brain
 *
 * Keyword-matches each contact (name/role/org/email/tags) against
 * graph node labels, skill names/descriptions, and brain node labels
 * to classify:
 *
 *   COMMANDING — matches all 3 sources (graph + skill + brain)
 *                (fully networked, capable, and modelled operator)
 *   NETWORKED  — matches 2 of 3 sources
 *                (contact has partial operational coverage)
 *   CAPABLE    — matches exactly 1 source
 *                (contact minimally referenced — only in graph, skill, or brain)
 *   GHOST      — no match to any source
 *                (contact with no graph trace, no skill match, no brain model)
 *
 * Toggle: ◈ CGSBPC button (fixed, bottom strip) left:172680, zIndex:319
 * Stat tiles: contacts / graph / skills / brain nodes /
 *             commanding / networked / capable / ghost
 * Red pulse on GHOST count (untethered operators).
 * Expandable rows: matched graph nodes with centrality score badge +
 *                  matched skills with score badge +
 *                  matched brain nodes with type badge.
 * Filter tabs: ALL / COMMANDING / NETWORKED / CAPABLE / GHOST + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "cgsbpc"/"contact graph skill"/"personnel command"/"contact brain"/
 *        "ghost contact"/"untethered operator"/"contact network"/"operator coverage"/
 *        "contact skill brain"/"personnel intelligence"
 * Event: jarvis:cgsbpc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'NETWORKED', 'CAPABLE', 'GHOST'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  NETWORKED:  '#38BDF8',
  CAPABLE:    '#F59E0B',
  GHOST:      '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeGraph(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.nodes))      return raw.nodes;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.skills))     return raw.skills;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeBrain(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.nodes))      return raw.nodes;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function contactLabel(c) {
  return c?.name || c?.full_name || c?.email || c?.id || 'Unknown';
}

function contactText(c) {
  return [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.email, (c?.tags || []).join(' '), c?.description].join(' ');
}

function classify(contact, graphNodes, skills, brainNodes) {
  const ctoks = tokens(contactText(contact));

  const matchedGraph = graphNodes.filter(n =>
    overlaps(ctoks, [n?.label, n?.name, n?.entity_type, n?.type, n?.description].join(' '))
  );
  const matchedSkills = skills.filter(s =>
    overlaps(ctoks, [s?.name, s?.title, s?.description, s?.category, s?.domain].join(' '))
  );
  const matchedBrain = brainNodes.filter(n =>
    overlaps(ctoks, [n?.label, n?.name, n?.type, n?.entity_type, n?.description, n?.category].join(' '))
  );

  const hasG = matchedGraph.length > 0;
  const hasSk = matchedSkills.length > 0;
  const hasBr = matchedBrain.length > 0;
  const srcCnt = [hasG, hasSk, hasBr].filter(Boolean).length;

  let cls;
  if (srcCnt === 3) cls = 'COMMANDING';
  else if (srcCnt === 2) cls = 'NETWORKED';
  else if (srcCnt === 1) cls = 'CAPABLE';
  else cls = 'GHOST';

  return { cls, matchedGraph, matchedSkills, matchedBrain };
}

/* ─── exported query helper ─── */
export function isCgsbpcQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'cgsbpc', 'contact graph skill', 'personnel command', 'contact brain',
    'ghost contact', 'untethered operator', 'contact network', 'operator coverage',
    'contact skill brain', 'personnel intelligence',
  ].some(k => s.includes(k));
}

export function buildCgsbpcScript() {
  return (
    'Fetch /entities/Contact, /v1/graph/centrality, /v1/aip/skill, and /v1/cinematic/brain. ' +
    'Keyword-match each contact (name/role/org/email/tags) against ' +
    'graph node labels, skill names/descriptions, and brain node labels. ' +
    'Classify each contact as COMMANDING (matches graph + skill + brain — ' +
    'fully networked, capable, and modelled operator), ' +
    'NETWORKED (matches 2 of 3 — partial operational coverage), ' +
    'CAPABLE (matches exactly 1 source — minimally referenced), ' +
    'or GHOST (no match — contact with no graph trace, no skill match, no brain model — ' +
    'untethered operator with zero intelligence footprint). ' +
    'Report total GHOST count, identify which ghost contacts pose the highest operational risk ' +
    '(key personnel with no verifiable skill or graph trace), ' +
    'and recommend which graph nodes should be linked, which skills should be assigned, ' +
    'and which brain model entries should be created to ground them.'
  );
}

/* ─── component ─── */
export default function ContactGraphSkillBrainCommand() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing]   = useState(false);
  const timerRef                    = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const [rCt, rGr, rSk, rBr] = await Promise.all([
        fetch(`${API}/entities/Contact`,       { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/graph/centrality`,    { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/aip/skill`,           { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/cinematic/brain`,     { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const contacts   = normalizeContacts(rCt);
      const graphNodes = normalizeGraph(rGr);
      const skills     = normalizeSkills(rSk);
      const brainNodes = normalizeBrain(rBr);

      const classified = contacts.map(contact => ({
        contact,
        ...classify(contact, graphNodes, skills, brainNodes),
      }));

      setRows(classified);
    } catch (_) {
      // network error — leave existing rows
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:cgsbpc-toggle', handler);
    return () => window.removeEventListener('jarvis:cgsbpc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { COMMANDING: 0, NETWORKED: 0, CAPABLE: 0, GHOST: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return contactLabel(r.contact).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildCgsbpcScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      if (txt) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ text: txt.slice(0, 400) }),
          });
        } catch (_) {}
      }
    } catch (_) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const ghostPulse = counts.GHOST > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 172680,
    zIndex: 319,
    background: ghostPulse ? 'rgba(239,68,68,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${ghostPulse ? '#EF4444' : 'rgba(100,116,139,0.5)'}`,
    color: ghostPulse ? '#EF4444' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: ghostPulse ? 'jarvis-pulse-red 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 680,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8,
    zIndex: 3190,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(239,68,68,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Contact × Graph × Skill × Brain — Personnel Intelligence Command">
        ◈ CGSBPC{counts.GHOST > 0 ? ` [${counts.GHOST}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
              ◈ CONTACT × GRAPH × SKILL × BRAIN — PERSONNEL INTELLIGENCE COMMAND
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {[
              { label: 'CONTACTS',   val: rows.length,           color: '#94A3B8' },
              { label: 'COMMANDING', val: counts.COMMANDING,     color: CLS_COLOR.COMMANDING },
              { label: 'NETWORKED',  val: counts.NETWORKED,      color: CLS_COLOR.NETWORKED },
              { label: 'CAPABLE',    val: counts.CAPABLE,        color: CLS_COLOR.CAPABLE },
              { label: 'GHOST',      val: counts.GHOST,          color: CLS_COLOR.GHOST },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 90, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(239,68,68,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(239,68,68,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #EF4444' : '2px solid transparent',
                color: tab === t ? '#EF4444' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 170 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No contacts match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { contact, cls, matchedGraph, matchedSkills, matchedBrain } = item;
              const isExpanded = expanded[idx];
              const role = contact?.role || contact?.position;
              const org  = contact?.organisation || contact?.org || contact?.company;
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 88, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactLabel(contact)}</span>
                    {role && (
                      <span style={{ color: '#94A3B8', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{role}</span>
                    )}
                    {org && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 2 }}>{org}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* graph nodes */}
                      {matchedGraph.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>GRAPH NODES ({matchedGraph.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedGraph.slice(0, 6).map((n, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {n?.label || n?.name || n?.id || '—'}{n?.centrality != null ? ` · ${Number(n.centrality).toFixed(3)}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* skills */}
                      {matchedSkills.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SKILLS ({matchedSkills.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedSkills.slice(0, 6).map((s, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {s?.name || s?.title || s?.id || '—'}{s?.score != null ? ` · ${s.score}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* brain nodes */}
                      {matchedBrain.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>BRAIN NODES ({matchedBrain.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedBrain.slice(0, 6).map((n, i) => (
                              <span key={i} style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', color: '#FB923C', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {n?.label || n?.name || n?.id || '—'}{n?.type || n?.entity_type ? ` · ${n.type || n.entity_type}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedGraph.length === 0 && matchedSkills.length === 0 && matchedBrain.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No coverage — fully untethered contact with zero intelligence footprint.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
                border: '1px solid #EF4444', color: '#EF4444',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS GHOST CONTACTS'}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
                background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
