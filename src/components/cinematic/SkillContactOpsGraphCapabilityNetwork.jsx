/**
 * SkillContactOpsGraphCapabilityNetwork — F259
 *
 * Fetches /v1/aip/skill
 *         /entities/Contact
 *         /v1/ops/alerts
 *         /v1/graph/centrality
 *
 * Keyword-matches each skill against contacts, ops alerts,
 * and graph nodes to classify:
 *
 *   COMMANDING — matches all 3 other sources
 *   STAFFED    — matches 2 of 3 other sources
 *   ALERTED    — matches exactly 1 other source
 *   DARK       — no match to any source
 *               (isolated skills with no contact owner, no ops alert
 *                coverage, no graph trace — capability blind spots)
 *
 * Toggle: ◈ SCOAGC button (fixed, bottom strip) left:192840, zIndex:355
 * Stat tiles: skills / contacts / ops alerts / graph nodes /
 *             commanding / staffed / alerted / dark
 * Red pulse on DARK count (capability blind spots).
 * Expandable rows: matched contacts with role/org +
 *                  matched ops alerts with severity badge +
 *                  matched graph nodes with centrality score badge.
 * Filter tabs: ALL / COMMANDING / STAFFED / ALERTED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scoagc"/"skill command network"/"capability command"/
 *        "skill contact ops"/"skill graph command"/"capability blind spot"
 * Event: jarvis:scoagc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'STAFFED', 'ALERTED', 'DARK'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  STAFFED:    '#F59E0B',
  ALERTED:    '#38BDF8',
  DARK:       '#EF4444',
};

export function isScoagcQuery(q) {
  const s = (q || '').toLowerCase();
  return s.includes('scoagc') ||
    s.includes('skill command network') ||
    s.includes('capability command') ||
    s.includes('skill contact ops') ||
    s.includes('skill graph command') ||
    s.includes('capability blind spot');
}

export function buildScoagcScript() {
  return 'Analyse the Skill × Contact × Ops Alert × Graph Capability Command Network. ' +
    'Identify DARK skills (no contact owner, no ops alert coverage, no graph trace — capability blind spots). ' +
    'Recommend the top 3 most critical blind-spot capabilities to address. ' +
    'Keep the response under 120 words.';
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.skills))   return raw.skills;
  if (Array.isArray(raw?.data))     return raw.data;
  if (Array.isArray(raw?.results))  return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.data))      return raw.data;
  if (Array.isArray(raw?.results))   return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.data))     return raw.data;
  if (Array.isArray(raw?.results))  return raw.results;
  return [];
}

function normalizeGraph(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.nodes))    return raw.nodes;
  if (Array.isArray(raw?.data))     return raw.data;
  if (Array.isArray(raw?.results))  return raw.results;
  return [];
}

function skillText(s) {
  return [s.name, s.title, s.description, s.category, s.type, s.tags].filter(Boolean).join(' ');
}

function classifySkill(skillToks, contacts, alerts, graphNodes) {
  const matchedContacts = contacts.filter(c => {
    const text = [c.name, c.role, c.org, c.organization, c.title, c.department, c.tags].filter(Boolean).join(' ');
    return overlaps(skillToks, text);
  });
  const matchedAlerts = alerts.filter(a => {
    const text = [a.name, a.title, a.description, a.type, a.category, a.severity, a.tags].filter(Boolean).join(' ');
    return overlaps(skillToks, text);
  });
  const matchedGraph = graphNodes.filter(n => {
    const text = [n.label, n.name, n.type, n.description, n.category, n.tags].filter(Boolean).join(' ');
    return overlaps(skillToks, text);
  });
  const hits = (matchedContacts.length > 0 ? 1 : 0)
             + (matchedAlerts.length > 0 ? 1 : 0)
             + (matchedGraph.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'COMMANDING'
            : hits === 2 ? 'STAFFED'
            : hits === 1 ? 'ALERTED'
            : 'DARK';
  return { cls, matchedContacts, matchedAlerts, matchedGraph };
}

const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function apiFetch(path) {
  const r = await fetch(`${API}${path}`, { headers: hdr });
  if (!r.ok) return null;
  return r.json();
}

export default function SkillContactOpsGraphCapabilityNetwork() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [advice, setAdvice]       = useState('');
  const timerRef                  = useRef(null);

  const counts = {
    COMMANDING: rows.filter(r => r.cls === 'COMMANDING').length,
    STAFFED:    rows.filter(r => r.cls === 'STAFFED').length,
    ALERTED:    rows.filter(r => r.cls === 'ALERTED').length,
    DARK:       rows.filter(r => r.cls === 'DARK').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [skRaw, ctRaw, alRaw, grRaw] = await Promise.all([
        apiFetch('/v1/aip/skill'),
        apiFetch('/entities/Contact'),
        apiFetch('/v1/ops/alerts'),
        apiFetch('/v1/graph/centrality'),
      ]);
      const skills     = normalizeSkills(skRaw);
      const contacts   = normalizeContacts(ctRaw);
      const alerts     = normalizeAlerts(alRaw);
      const graphNodes = normalizeGraph(grRaw);

      const classified = skills.map(s => {
        const skillToks = tokens(skillText(s));
        const { cls, matchedContacts, matchedAlerts, matchedGraph } =
          classifySkill(skillToks, contacts, alerts, graphNodes);
        return { s, cls, matchedContacts, matchedAlerts, matchedGraph };
      });
      setRows(classified);
    } catch { /* network offline — keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:scoagc-toggle', toggle);
    return () => window.removeEventListener('jarvis:scoagc-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAdvice('');
    try {
      const prompt = buildScoagcScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || JSON.stringify(d);
      setAdvice(text);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: 'POST', headers: hdr,
          body: JSON.stringify({ text: text.slice(0, 300) }),
        });
      } catch { /* TTS optional */ }
    } catch { setAdvice('Assessment unavailable — check backend connectivity.'); }
    setAssessing(false);
  }

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const t = (r.s.name || r.s.title || '').toLowerCase();
      if (!t.includes(s)) return false;
    }
    return true;
  });

  const darkCount = counts.DARK;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Skill × Contact × Ops Alert × Graph Capability Command Network"
        style={{
          position: 'fixed', left: 192840, bottom: 8, zIndex: 355,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkCount > 0 ? '0 0 8px #EF444466' : 'none',
        }}
      >
        ◈ SCOAGC
        {darkCount > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff',
            borderRadius: 4, padding: '1px 5px', fontSize: 10,
            animation: 'scoagc-pulse 1.4s ease-in-out infinite',
          }}>{darkCount}</span>
        )}
        <style>{`@keyframes scoagc-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1060,
      background: 'rgba(2,5,10,0.93)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
      padding: '18px 20px', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span style={{ color: '#22D3EE', fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
          ◈ SCOAGC — SKILL × CONTACT × OPS ALERT × GRAPH CAPABILITY COMMAND NETWORK
        </span>
        <button onClick={() => setOpen(false)} style={{
          marginLeft: 'auto', background: 'none', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 4, padding: '2px 10px',
          cursor: 'pointer', fontSize: 12,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { label: 'SKILLS',     val: rows.length,         color: '#22D3EE' },
          { label: 'CONTACTS',   val: rows.reduce((a,r)=>a+r.matchedContacts.length,0), color: '#A78BFA' },
          { label: 'OPS ALERTS', val: rows.reduce((a,r)=>a+r.matchedAlerts.length,0),   color: '#F59E0B' },
          { label: 'GRAPH',      val: rows.reduce((a,r)=>a+r.matchedGraph.length,0),     color: '#38BDF8' },
          { label: 'COMMANDING', val: counts.COMMANDING, color: CLS_COLOR.COMMANDING },
          { label: 'STAFFED',    val: counts.STAFFED,    color: CLS_COLOR.STAFFED    },
          { label: 'ALERTED',    val: counts.ALERTED,    color: CLS_COLOR.ALERTED    },
          { label: 'DARK',       val: counts.DARK,       color: CLS_COLOR.DARK       },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`,
            borderRadius: 6, padding: '6px 12px', minWidth: 90, textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#8899AA', fontSize: 10, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{ color: '#22D3EE88', fontSize: 11, marginBottom: 8 }}>
          ⟳ Loading capability data…
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#22D3EE22' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === t ? '#22D3EE' : '#22D3EE22'}`,
            color: tab === t ? '#22D3EE' : '#8899AA',
            borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
          }}>{t} {t !== 'ALL' ? `(${counts[t] ?? 0})` : `(${rows.length})`}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid #22D3EE22',
            color: '#DCEBF5', borderRadius: 4, padding: '3px 10px', fontSize: 11,
            outline: 'none', minWidth: 160,
          }}
        />
      </div>

      {/* ASSESS button */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#22D3EE22' : '#22D3EE33',
          border: '1px solid #22D3EE66', color: '#22D3EE',
          borderRadius: 4, padding: '4px 14px', fontSize: 11,
          cursor: assessing ? 'not-allowed' : 'pointer',
        }}>
          {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
        </button>
        {advice && (
          <div style={{
            marginTop: 8, background: 'rgba(34,211,238,0.06)',
            border: '1px solid #22D3EE33', borderRadius: 6,
            padding: '8px 12px', fontSize: 12, color: '#AACCDD',
            maxWidth: 700, lineHeight: 1.5,
          }}>{advice}</div>
        )}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#8899AA', fontSize: 12, padding: '12px 0' }}>
            No skills match the current filter.
          </div>
        )}
        {visible.map((row, i) => {
          const id = row.s.id || row.s.name || i;
          const isExp = !!expanded[id];
          return (
            <div key={id} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${CLS_COLOR[row.cls]}22`,
              borderRadius: 6, marginBottom: 6, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 12px', cursor: 'pointer',
                }}
              >
                <span style={{
                  color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`,
                  borderRadius: 3, padding: '1px 6px', minWidth: 84, textAlign: 'center',
                }}>{row.cls}</span>
                <span style={{ color: '#DCEBF5', fontSize: 12, flex: 1 }}>
                  {row.s.name || row.s.title || `skill-${id}`}
                </span>
                {row.s.score !== undefined && (
                  <span style={{
                    color: '#8899AA', fontSize: 10,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3, padding: '1px 6px',
                  }}>score {row.s.score}</span>
                )}
                <span style={{ color: '#22D3EE', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid #22D3EE11' }}>
                  {/* Matched contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 4 }}>
                        CONTACTS ({row.matchedContacts.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedContacts.map((c, ci) => (
                          <span key={ci} style={{
                            background: '#A78BFA22', border: '1px solid #A78BFA44',
                            color: '#A78BFA', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {c.name || c.title || `contact-${ci}`}
                            {(c.role || c.org || c.organization) && (
                              <span style={{ color: '#8899AA', marginLeft: 4 }}>
                                {[c.role, c.org || c.organization].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matched ops alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 4 }}>
                        OPS ALERTS ({row.matchedAlerts.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedAlerts.map((a, ai) => (
                          <span key={ai} style={{
                            background: '#F59E0B22', border: '1px solid #F59E0B44',
                            color: '#F59E0B', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {a.name || a.title || a.message || `alert-${ai}`}
                            {a.severity && (
                              <span style={{
                                marginLeft: 5, background: '#EF444422',
                                color: '#EF4444', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>{a.severity}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matched graph nodes */}
                  {row.matchedGraph.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 4 }}>
                        GRAPH NODES ({row.matchedGraph.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedGraph.map((n, ni) => (
                          <span key={ni} style={{
                            background: '#38BDF822', border: '1px solid #38BDF844',
                            color: '#38BDF8', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {n.label || n.name || `node-${ni}`}
                            {n.centrality !== undefined && (
                              <span style={{
                                marginLeft: 5, background: '#38BDF822',
                                color: '#22D3EE', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>{typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {row.matchedContacts.length === 0 && row.matchedAlerts.length === 0 && row.matchedGraph.length === 0 && (
                    <div style={{ color: '#8899AA', fontSize: 11, marginTop: 8 }}>
                      No contacts, ops alerts, or graph nodes matched this skill.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
