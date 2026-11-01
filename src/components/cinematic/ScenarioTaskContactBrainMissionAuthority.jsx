/**
 * ScenarioTaskContactBrainMissionAuthority — F257
 *
 * Fetches /v1/scenario/list
 *         /entities/Task
 *         /entities/Contact
 *         /v1/cinematic/brain
 *
 * Keyword-matches each scenario against tasks, contacts,
 * and brain nodes to classify:
 *
 *   COMMANDING — matches all 3 sources
 *   ACTIVE     — matches 2 of 3 sources
 *   PARTIAL    — matches exactly 1 source
 *   UNARMED    — no match to any source
 *               (fully unsupported scenarios — no active task,
 *                no contact owner, no brain model coverage —
 *                strategic blind spots)
 *
 * Toggle: ◈ STCBMI button (fixed, bottom strip) left:191720, zIndex:353
 * Stat tiles: scenarios / tasks / contacts / brain nodes /
 *             commanding / active / partial / unarmed
 * Red pulse on UNARMED count (strategic blind spots).
 * Expandable rows: matched tasks with status badge +
 *                  matched contacts with role/org +
 *                  matched brain nodes with type badge.
 * Filter tabs: ALL / COMMANDING / ACTIVE / PARTIAL / UNARMED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "stcbmi"/"mission authority"/"scenario authority"/
 *        "unarmed scenarios"/"scenario coverage"/"mission command"/
 *        "scenario brain"/"scenario task contact"
 * Event: jarvis:stcbmi-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ACTIVE', 'PARTIAL', 'UNARMED'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  ACTIVE:     '#F59E0B',
  PARTIAL:    '#38BDF8',
  UNARMED:    '#EF4444',
};

export function isStcbmiQuery(q) {
  const s = (q || '').toLowerCase();
  return s.includes('stcbmi') ||
    s.includes('mission authority') ||
    s.includes('scenario authority') ||
    s.includes('unarmed scenario') ||
    s.includes('scenario brain') ||
    s.includes('scenario task contact') ||
    s.includes('mission command index');
}

export function buildStcbmiScript() {
  return 'Analyse the Scenario × Task × Contact × Brain Mission Authority Index. ' +
    'Identify UNARMED scenarios (no supporting task, contact, or brain model). ' +
    'Recommend the top 3 most urgent scenarios to staff and activate. ' +
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

function normalizeScenarios(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.scenarios))    return raw.scenarios;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.tasks))        return raw.tasks;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.contacts))     return raw.contacts;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function normalizeBrain(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.nodes))        return raw.nodes;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function scenarioText(s) {
  return [s.title, s.name, s.description, s.objective, s.category, s.type, s.tags, s.status]
    .filter(Boolean).join(' ');
}

function classifyScenario(scToks, tasks, contacts, brainNodes) {
  const matchedTasks = tasks.filter(t => {
    const text = [t.title, t.name, t.description, t.type, t.status, t.category, t.tags].filter(Boolean).join(' ');
    return overlaps(scToks, text);
  });
  const matchedContacts = contacts.filter(c => {
    const text = [c.name, c.full_name, c.role, c.organization, c.department, c.email, c.expertise].filter(Boolean).join(' ');
    return overlaps(scToks, text);
  });
  const matchedBrain = brainNodes.filter(n => {
    const text = [n.label, n.name, n.type, n.description, n.category].filter(Boolean).join(' ');
    return overlaps(scToks, text);
  });
  const hits = (matchedTasks.length > 0 ? 1 : 0)
             + (matchedContacts.length > 0 ? 1 : 0)
             + (matchedBrain.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'COMMANDING'
            : hits === 2 ? 'ACTIVE'
            : hits === 1 ? 'PARTIAL'
            : 'UNARMED';
  return { cls, matchedTasks, matchedContacts, matchedBrain };
}

const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function apiFetch(path) {
  const r = await fetch(`${API}${path}`, { headers: hdr });
  if (!r.ok) return null;
  return r.json();
}

export default function ScenarioTaskContactBrainMissionAuthority() {
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
    ACTIVE:     rows.filter(r => r.cls === 'ACTIVE').length,
    PARTIAL:    rows.filter(r => r.cls === 'PARTIAL').length,
    UNARMED:    rows.filter(r => r.cls === 'UNARMED').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scRaw, tkRaw, ctRaw, brRaw] = await Promise.all([
        apiFetch('/v1/scenario/list'),
        apiFetch('/entities/Task'),
        apiFetch('/entities/Contact'),
        apiFetch('/v1/cinematic/brain'),
      ]);
      const scenarios  = normalizeScenarios(scRaw);
      const tasks      = normalizeTasks(tkRaw);
      const contacts   = normalizeContacts(ctRaw);
      const brainNodes = normalizeBrain(brRaw);

      const classified = scenarios.map(sc => {
        const scToks = tokens(scenarioText(sc));
        const { cls, matchedTasks, matchedContacts, matchedBrain } = classifyScenario(scToks, tasks, contacts, brainNodes);
        return { sc, cls, matchedTasks, matchedContacts, matchedBrain };
      });
      setRows(classified);
    } catch { /* network offline — keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:stcbmi-toggle', toggle);
    return () => window.removeEventListener('jarvis:stcbmi-toggle', toggle);
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
      const prompt = buildStcbmiScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || JSON.stringify(d);
      setAdvice(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
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
      const t = (r.sc.title || r.sc.name || '').toLowerCase();
      if (!t.includes(s)) return false;
    }
    return true;
  });

  const unarmedCount = counts.UNARMED;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Task × Contact × Brain Mission Authority Index"
        style={{
          position: 'fixed', left: 191720, bottom: 8, zIndex: 353,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1,
          boxShadow: unarmedCount > 0 ? '0 0 8px #EF444466' : 'none',
        }}
      >
        ◈ STCBMI
        {unarmedCount > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff',
            borderRadius: 4, padding: '1px 5px', fontSize: 10,
            animation: 'stcbmi-pulse 1.4s ease-in-out infinite',
          }}>{unarmedCount}</span>
        )}
        <style>{`@keyframes stcbmi-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
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
          ◈ STCBMI — SCENARIO × TASK × CONTACT × BRAIN MISSION AUTHORITY INDEX
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
          { label: 'SCENARIOS',   val: rows.length,          color: '#22D3EE' },
          { label: 'COMMANDING',  val: counts.COMMANDING,    color: '#22C55E' },
          { label: 'ACTIVE',      val: counts.ACTIVE,        color: '#F59E0B' },
          { label: 'PARTIAL',     val: counts.PARTIAL,       color: '#38BDF8' },
          { label: 'UNARMED',     val: counts.UNARMED,       color: '#EF4444',
            pulse: counts.UNARMED > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(10,16,24,0.7)', border: `1px solid ${color}44`,
            borderRadius: 8, padding: '8px 14px', minWidth: 90, textAlign: 'center',
            boxShadow: pulse ? `0 0 12px ${color}55` : 'none',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{loading ? '…' : val}</div>
            <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#22D3EE22' : 'rgba(10,16,24,0.7)',
            border: `1px solid ${tab === t ? '#22D3EE' : '#22D3EE33'}`,
            color: tab === t ? '#22D3EE' : '#6E8AA0',
            borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            marginLeft: 8, background: 'rgba(10,16,24,0.7)', border: '1px solid #22D3EE33',
            color: '#DCEBF5', borderRadius: 4, padding: '3px 10px', fontSize: 11,
            outline: 'none', width: 180,
          }}
        />
        <button onClick={load} style={{
          marginLeft: 'auto', background: 'rgba(10,16,24,0.7)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
        }}>↻ REFRESH</button>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', marginTop: 40, fontSize: 13 }}>
            No scenarios match the current filter.
          </div>
        )}
        {visible.map((row, i) => {
          const id    = row.sc.id || row.sc.scenario_id || i;
          const title = row.sc.title || row.sc.name || `Scenario ${i + 1}`;
          const status = row.sc.status || row.sc.phase || '';
          const isExp = !!expanded[id];
          return (
            <div key={id} style={{
              background: 'rgba(8,14,22,0.65)',
              border: `1px solid ${CLS_COLOR[row.cls]}33`,
              borderRadius: 8, marginBottom: 7, padding: '10px 14px',
              cursor: 'pointer',
            }} onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: CLS_COLOR[row.cls] + '22',
                  border: `1px solid ${CLS_COLOR[row.cls]}66`,
                  color: CLS_COLOR[row.cls],
                  borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  minWidth: 90, textAlign: 'center',
                }}>{row.cls}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{title}</span>
                {status && (
                  <span style={{
                    background: '#38BDF822', border: '1px solid #38BDF844',
                    color: '#38BDF8', borderRadius: 4, padding: '1px 6px', fontSize: 10,
                  }}>{status}</span>
                )}
                <span style={{ color: '#6E8AA0', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1A2A3A' }}>
                  {/* Tasks */}
                  {row.matchedTasks.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#6E8AA0', letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED TASKS ({row.matchedTasks.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedTasks.slice(0, 8).map((t, j) => (
                          <span key={j} style={{
                            background: '#22C55E22', border: '1px solid #22C55E44',
                            color: '#22C55E', borderRadius: 4, padding: '1px 7px', fontSize: 10,
                          }}>
                            {t.title || t.name || `Task ${j + 1}`}
                            {t.status && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>[{t.status}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#6E8AA0', letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED CONTACTS ({row.matchedContacts.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedContacts.slice(0, 8).map((c, j) => (
                          <span key={j} style={{
                            background: '#F59E0B22', border: '1px solid #F59E0B44',
                            color: '#F59E0B', borderRadius: 4, padding: '1px 7px', fontSize: 10,
                          }}>
                            {c.name || c.full_name || `Contact ${j + 1}`}
                            {(c.role || c.organization) && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                                [{c.role || ''}{c.role && c.organization ? ' · ' : ''}{c.organization || ''}]
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: '#6E8AA0', letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED BRAIN NODES ({row.matchedBrain.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedBrain.slice(0, 8).map((n, j) => (
                          <span key={j} style={{
                            background: '#38BDF822', border: '1px solid #38BDF844',
                            color: '#38BDF8', borderRadius: 4, padding: '1px 7px', fontSize: 10,
                          }}>
                            {n.label || n.name || `Node ${j + 1}`}
                            {n.type && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>[{n.type}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {row.matchedTasks.length === 0 && row.matchedContacts.length === 0 && row.matchedBrain.length === 0 && (
                    <div style={{ color: '#EF4444', fontSize: 11 }}>
                      No matching tasks, contacts, or brain nodes — fully UNARMED scenario.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ marginTop: 12, borderTop: '1px solid #1A2A3A', paddingTop: 12 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#0F1C28' : 'rgba(34,211,238,0.12)',
          border: '1px solid #22D3EE55', color: '#22D3EE',
          borderRadius: 6, padding: '6px 18px', fontSize: 12,
          cursor: assessing ? 'not-allowed' : 'pointer', letterSpacing: 1,
        }}>
          {assessing ? '… ASSESSING' : '▶ ASSESS MISSION AUTHORITY'}
        </button>
        {advice && (
          <div style={{
            marginTop: 10, background: 'rgba(8,14,22,0.7)',
            border: '1px solid #22D3EE33', borderRadius: 8,
            padding: '10px 14px', fontSize: 12, lineHeight: 1.6, color: '#DCEBF5',
          }}>{advice}</div>
        )}
      </div>
    </div>
  );
}
