/**
 * InvestigationTaskContactBrainProsecutionCommand — F219
 *
 * Fetches /v1/investigations + /entities/Task + /entities/Contact +
 *         /v1/cinematic/brain
 *
 * Keyword-matches each investigation (title/description/tags/type) against
 * task names/descriptions, contact names/roles/orgs, and brain node labels/types
 * to classify:
 *
 *   PROSECUTING — matches all 3 sources (task + contact + brain)
 *                 (fully grounded prosecution: tasked, owned, modelled)
 *   ACTIVE      — matches task + brain (2 sources, no contact owner)
 *                 (active case with task and brain model, but no assigned contact)
 *   STAFFED     — matches contact only (investigation has an owner, no task/brain)
 *                 (staffed but untasked and unmodelled)
 *   COLD        — no match to any source
 *                 (prosecution dead-end: open case with no task, no contact, no brain model)
 *
 * Toggle: ◈ ITCBPC button (fixed, bottom strip) left:170440, zIndex:315
 * Stat tiles: investigations / tasks / contacts / brain-nodes /
 *             prosecuting / active / staffed / cold
 * Red pulse on COLD count (prosecution blind spots).
 * Expandable rows: matched tasks with status badge +
 *                  matched contacts with role/org +
 *                  matched brain nodes with centrality score badge.
 * Filter tabs: ALL / PROSECUTING / ACTIVE / STAFFED / COLD + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "itcbpc"/"investigation prosecution"/"cold cases"/"prosecution command"/
 *        "investigation task contact"/"investigation brain"/"undefended cases"/
 *        "prosecution blind spot"/"case command"/"open investigation"
 * Event: jarvis:itcbpc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'PROSECUTING', 'ACTIVE', 'STAFFED', 'COLD'];

const CLS_COLOR = {
  PROSECUTING: '#22C55E',
  ACTIVE:      '#38BDF8',
  STAFFED:     '#F59E0B',
  COLD:        '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                   return raw;
  if (Array.isArray(raw?.items))            return raw.items;
  if (Array.isArray(raw?.investigations))   return raw.investigations;
  if (Array.isArray(raw?.results))          return raw.results;
  if (Array.isArray(raw?.data))             return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.tasks))    return raw.tasks;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeBrain(raw) {
  const arr =
    raw?.nodes || raw?.results || raw?.data ||
    (Array.isArray(raw) ? raw : null);
  return Array.isArray(arr) ? arr : [];
}

function invLabel(inv) {
  return inv?.title || inv?.name || inv?.id || 'Untitled';
}

function invText(inv) {
  return [inv?.title, inv?.name, inv?.description, inv?.summary, inv?.tags?.join?.(' '), inv?.type, inv?.status].join(' ');
}

function classify(inv, tasks, contacts, brainNodes) {
  const itoks = tokens(invText(inv));

  const matchedTasks = tasks.filter(t =>
    overlaps(itoks, [t?.name, t?.title, t?.description, t?.type, t?.status].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(itoks, [c?.name, c?.role, c?.organisation, c?.org, c?.title, c?.email].join(' '))
  );
  const matchedBrain = brainNodes.filter(n =>
    overlaps(itoks, [n?.label, n?.type, n?.name, n?.id].join(' '))
  );

  const hasTask    = matchedTasks.length > 0;
  const hasContact = matchedContacts.length > 0;
  const hasBrain   = matchedBrain.length > 0;

  let cls;
  if (hasTask && hasContact && hasBrain) {
    cls = 'PROSECUTING';
  } else if (hasTask && hasBrain && !hasContact) {
    cls = 'ACTIVE';
  } else if (hasContact && !hasTask && !hasBrain) {
    cls = 'STAFFED';
  } else if (hasTask || hasBrain) {
    cls = 'ACTIVE';
  } else {
    cls = 'COLD';
  }

  return { cls, matchedTasks, matchedContacts, matchedBrain };
}

/* ─── exported query helper ─── */
export function isItcbpcQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'itcbpc', 'investigation prosecution', 'cold cases', 'prosecution command',
    'investigation task contact', 'investigation brain', 'undefended cases',
    'prosecution blind spot', 'case command', 'open investigation',
  ].some(k => s.includes(k));
}

export function buildItcbpcScript() {
  return (
    'Fetch /v1/investigations, /entities/Task, /entities/Contact, ' +
    'and /v1/cinematic/brain. ' +
    'Keyword-match each investigation (title/description/tags/type) against ' +
    'task names/descriptions, contact names/roles/orgs, and brain node labels/types. ' +
    'Classify each investigation as PROSECUTING (matches task + contact + brain — ' +
    'fully grounded: tasked, owned, and modelled), ' +
    'ACTIVE (matches task + brain — active case with automation and brain model, no contact owner), ' +
    'STAFFED (matches contact only — has an owner but no task or brain model grounding), ' +
    'or COLD (no match to any source — prosecution dead-end: open case with no task, ' +
    'no contact owner, and no brain model — operational blind spot). ' +
    'Report the total COLD count, identify which cold cases represent the highest ' +
    'prosecution risk (e.g. long-open, unresolved, or high-severity cases), ' +
    'and recommend which tasks should be assigned to drive them, ' +
    'which contacts should own them, and which brain models should be built ' +
    'to eliminate these prosecution blind spots.'
  );
}

/* ─── component ─── */
export default function InvestigationTaskContactBrainProsecutionCommand() {
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
      const [rInv, rTask, rContact, rBrain] = await Promise.all([
        fetch(`${API}/v1/investigations`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Task`,     { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Contact`,  { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/cinematic/brain`,{ headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const investigations = normalizeInvestigations(rInv);
      const tasks          = normalizeTasks(rTask);
      const contacts       = normalizeContacts(rContact);
      const brainNodes     = normalizeBrain(rBrain);

      const classified = investigations.map(inv => ({
        inv,
        ...classify(inv, tasks, contacts, brainNodes),
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
    window.addEventListener('jarvis:itcbpc-toggle', handler);
    return () => window.removeEventListener('jarvis:itcbpc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { PROSECUTING: 0, ACTIVE: 0, STAFFED: 0, COLD: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return invLabel(r.inv).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildItcbpcScript();
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

  const coldPulse = counts.COLD > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 170440,
    zIndex: 315,
    background: coldPulse ? 'rgba(239,68,68,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${coldPulse ? '#EF4444' : 'rgba(100,116,139,0.5)'}`,
    color: coldPulse ? '#EF4444' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: coldPulse ? 'jarvis-pulse-red 1.6s infinite' : 'none',
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
    zIndex: 3150,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(239,68,68,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Investigation × Task × Contact × Brain Prosecution Command Intelligence">
        ◈ ITCBPC{counts.COLD > 0 ? ` [${counts.COLD}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
              ◈ INVESTIGATION × TASK × CONTACT × BRAIN
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
              { label: 'CASES',       val: rows.length,            color: '#94A3B8' },
              { label: 'PROSECUTING', val: counts.PROSECUTING,     color: CLS_COLOR.PROSECUTING },
              { label: 'ACTIVE',      val: counts.ACTIVE,          color: CLS_COLOR.ACTIVE },
              { label: 'STAFFED',     val: counts.STAFFED,         color: CLS_COLOR.STAFFED },
              { label: 'COLD',        val: counts.COLD,            color: CLS_COLOR.COLD },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center' }}>
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
              placeholder="search investigations…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 170 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No investigations match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { inv, cls, matchedTasks, matchedContacts, matchedBrain } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 80, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invLabel(inv)}</span>
                    {inv?.status && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{inv.status}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* tasks */}
                      {matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>TASKS ({matchedTasks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedTasks.slice(0, 6).map((t, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {t?.name || t?.title || t?.id || '—'} · {t?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* contacts */}
                      {matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>CONTACTS ({matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedContacts.slice(0, 6).map((c, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || '—'} · {c?.role || c?.title || '?'} / {c?.organisation || c?.org || '?'}
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
                              <span key={i} style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {n?.label || n?.name || n?.id || '—'} · {(n?.centrality_score ?? n?.score ?? '?').toString().slice(0, 5)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedTasks.length === 0 && matchedContacts.length === 0 && matchedBrain.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — prosecution dead-end.</div>
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
              {assessing ? 'Assessing…' : '▶ ASSESS COLD CASES'}
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
