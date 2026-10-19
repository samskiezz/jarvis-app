/**
 * ContactScenarioTaskMissionMatrix — F57
 *
 * Fetches /entities/Contact + /v1/scenario/list + /entities/Task
 * Cross-references each contact against the scenario catalogue AND task list:
 *   ACTIVE  — matched both a scenario AND a task (contact engaged in live missions)
 *   SCENED  — matched a scenario only (contact scenario-referenced but not yet tasked)
 *   TASKED  — matched a task only (contact has tasks but no scenario context)
 *   SHADOW  — no match in either (contact with no active mission footprint)
 *
 * Toggle: ◈ CSTMX button (fixed, bottom strip) left:80280, zIndex:154
 * Stat tiles: contacts / scenarios / tasks / active / scened / tasked / shadow
 * Amber pulse on SHADOW count (contacts with no mission linkage).
 * Expandable rows: matched scenarios with status badge + matched tasks with status badge.
 * Filter tabs: ALL / ACTIVE / SCENED / TASKED / SHADOW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "contact mission"/"mission activation"/"cstmx"/"contact scenario task"/
 *        "shadow contacts"/"mission matrix"/"contact mission matrix"/"unlinked contacts"/
 *        "contact activation"/"contact task scenario"/"dark contacts"/"mission coverage"
 * Event: jarvis:cstmx-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVE', 'SCENED', 'TASKED', 'SHADOW'];

const CLS_COLOR = {
  ACTIVE:  '#00E5A0',
  SCENED:  '#29E7FF',
  TASKED:  '#A78BFA',
  SHADOW:  '#FFB800',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function classify(contactToks, scenarios, tasks) {
  const matchedScenarios = scenarios.filter(s =>
    overlaps(contactToks, [
      s.name, s.title, s.description, s.summary, s.objective,
      s.tags, s.type, s.domain, s.category, s.target, s.actors,
    ].join(' '))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(contactToks, [
      t.name, t.title, t.description, t.summary, t.assignee,
      t.tags, t.type, t.category, t.project, t.owner, t.contact,
    ].join(' '))
  );
  const hasScen = matchedScenarios.length > 0;
  const hasTask = matchedTasks.length > 0;
  const cls = hasScen && hasTask ? 'ACTIVE'
            : hasScen            ? 'SCENED'
            : hasTask            ? 'TASKED'
            : 'SHADOW';
  return {
    cls,
    matchedScenarios: matchedScenarios.slice(0, 4),
    matchedTasks: matchedTasks.slice(0, 4),
  };
}

export function isCstmxQuery(q) {
  return /\b(cstmx|contact.mission|mission.activation|contact.scenario.task|shadow.contact|mission.matrix|contact.mission.matrix|unlinked.contact|contact.activation|contact.task.scenario|dark.contact|mission.coverage)\b/i.test(q);
}
export function buildCstmxScript() {
  return 'Opening Contact × Scenario × Task Mission Activation Matrix. Cross-referencing contacts against the scenario catalogue and task list to surface active vs shadow mission footprints.';
}

export default function ContactScenarioTaskMissionMatrix() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [scenCount, setScenCount]     = useState(0);
  const [taskCount, setTaskCount]     = useState(0);
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
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, sRes, tRes] = await Promise.all([
        fetch(`${API}/entities/Contact`, { headers: h }),
        fetch(`${API}/v1/scenario/list`, { headers: h }),
        fetch(`${API}/entities/Task`,    { headers: h }),
      ]);
      const [cRaw, sRaw, tRaw] = await Promise.all([
        cRes.ok ? cRes.json() : {},
        sRes.ok ? sRes.json() : {},
        tRes.ok ? tRes.json() : {},
      ]);
      const contacts  = normalizeArray(cRaw, ['contacts', 'items', 'data', 'results']);
      const scenarios = normalizeArray(sRaw, ['scenarios', 'items', 'data', 'results']);
      const tasks     = normalizeArray(tRaw, ['tasks', 'items', 'data', 'results']);
      setScenCount(scenarios.length);
      setTaskCount(tasks.length);
      const built = contacts.map(c => {
        const label = c.name || c.full_name || c.display_name || c.email || c.id || 'Contact';
        const toks  = tokens([c.name, c.full_name, c.display_name, c.email, c.role,
                              c.org, c.organisation, c.company, c.domain, c.tags,
                              c.description, c.notes].join(' '));
        const { cls, matchedScenarios, matchedTasks } = classify(toks, scenarios, tasks);
        return { _id: c.id || c._id || label, _label: label, _cls: cls,
                 _scenarios: matchedScenarios, _tasks: matchedTasks,
                 _role: c.role || c.title || '', _org: c.org || c.organisation || c.company || '' };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:cstmx-toggle', toggle);
    return () => window.removeEventListener('jarvis:cstmx-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment('');
    const shadowCount = rows.filter(r => r._cls === 'SHADOW').length;
    const prompt = `Mission Activation Matrix: ${rows.length} contacts cross-referenced against ${scenCount} scenarios and ${taskCount} tasks. ACTIVE:${rows.filter(r=>r._cls==='ACTIVE').length} SCENED:${rows.filter(r=>r._cls==='SCENED').length} TASKED:${rows.filter(r=>r._cls==='TASKED').length} SHADOW:${shadowCount}. Provide a 2-sentence strategic assessment of mission activation coverage and which shadow contacts warrant immediate tasking.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(answer);
      if (answer) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: answer }),
          });
        } catch {}
      }
    } catch (e) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    ACTIVE: rows.filter(r => r._cls === 'ACTIVE').length,
    SCENED: rows.filter(r => r._cls === 'SCENED').length,
    TASKED: rows.filter(r => r._cls === 'TASKED').length,
    SHADOW: rows.filter(r => r._cls === 'SHADOW').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search && !JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Scenario × Task Mission Activation Matrix"
        style={{
          position: 'fixed', bottom: 8, left: 80280, zIndex: 154,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #29E7FF55',
          color: '#29E7FF', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ CSTMX</button>
    );
  }

  return (
    <>
      {/* backdrop */}
      <div onClick={() => setOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 153, background: 'rgba(0,0,0,0.45)',
      }} />

      {/* panel */}
      <div style={{
        position: 'fixed', bottom: 38, left: '50%', transform: 'translateX(-50%)',
        width: 'min(820px,96vw)', maxHeight: '72vh',
        background: 'rgba(5,8,13,0.97)', border: '1px solid #29E7FF33',
        borderRadius: 8, zIndex: 154, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', overflow: 'hidden',
        boxShadow: '0 0 60px rgba(41,231,255,0.08)',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          <span style={{ color: '#29E7FF', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ CONTACT × SCENARIO × TASK — MISSION ACTIVATION MATRIX
          </span>
          {loading && <span style={{ color: '#666', fontSize: 9 }}>loading…</span>}
          {error   && <span style={{ color: '#FF4444', fontSize: 9 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{
            marginLeft: 'auto', background: 'none', border: 'none', color: '#666',
            fontSize: 14, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'CONTACTS',  val: rows.length,     color: '#29E7FF' },
            { label: 'SCENARIOS', val: scenCount,        color: '#29E7FF' },
            { label: 'TASKS',     val: taskCount,        color: '#29E7FF' },
            { label: 'ACTIVE',    val: counts.ACTIVE,   color: '#00E5A0' },
            { label: 'SCENED',    val: counts.SCENED,   color: '#29E7FF' },
            { label: 'TASKED',    val: counts.TASKED,   color: '#A78BFA' },
            {
              label: 'SHADOW', val: counts.SHADOW, color: '#FFB800',
              pulse: counts.SHADOW > 0,
            },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              background: 'rgba(41,231,255,0.04)', border: `1px solid ${color}22`,
              borderRadius: 4, padding: '4px 10px', minWidth: 64, textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color,
                animation: pulse ? 'cstmx-pulse 1.6s ease-in-out infinite' : 'none' }}>{val}</div>
              <div style={{ fontSize: 8, color: '#555', letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderBottom: '1px solid #1a1a1a' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'rgba(41,231,255,0.12)' : 'none',
              border: tab === t ? '1px solid #29E7FF55' : '1px solid transparent',
              color: tab === t ? '#29E7FF' : '#555', fontSize: 9, padding: '2px 8px',
              borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="filter…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
              color: '#aaa', fontSize: 10, padding: '2px 8px', borderRadius: 3,
              outline: 'none', width: 140,
            }}
          />
        </div>

        {/* rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#444', fontSize: 11, padding: 20, textAlign: 'center' }}>no contacts match</div>
          )}
          {visible.map(row => {
            const isExp = expanded === row._id;
            return (
              <div key={row._id} style={{ borderBottom: '1px solid #111' }}>
                <div
                  onClick={() => setExpanded(isExp ? null : row._id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 10,
                    background: `${CLS_COLOR[row._cls]}11`, border: `1px solid ${CLS_COLOR[row._cls]}44`,
                    color: CLS_COLOR[row._cls], minWidth: 54, textAlign: 'center', letterSpacing: 1,
                  }}>{row._cls}</span>
                  <span style={{ color: '#ccc', fontSize: 11 }}>{row._label}</span>
                  {row._role && <span style={{ color: '#555', fontSize: 9 }}>{row._role}</span>}
                  {row._org  && <span style={{ color: '#444', fontSize: 9 }}>@ {row._org}</span>}
                  <span style={{ marginLeft: 'auto', color: '#333', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 10px 38px', background: 'rgba(255,255,255,0.01)' }}>
                    {row._scenarios.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED SCENARIOS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._scenarios.map((s, i) => {
                            const status = s.status || s.state || s.phase || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(41,231,255,0.08)', border: '1px solid #29E7FF33',
                                color: '#29E7FF',
                              }}>
                                {s.name || s.title || 'Scenario'}
                                {status && (
                                  <span style={{ marginLeft: 4, color: '#29E7FF88' }}>{status}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._tasks.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED TASKS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._tasks.map((t, i) => {
                            const status = t.status || t.state || t.priority || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(167,139,250,0.08)', border: '1px solid #A78BFA33',
                                color: '#A78BFA',
                              }}>
                                {t.name || t.title || 'Task'}
                                {status && (
                                  <span style={{ marginLeft: 4, color: '#A78BFA88' }}>{status}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._scenarios.length === 0 && row._tasks.length === 0 && (
                      <div style={{ color: '#FFB800', fontSize: 10 }}>⚠ No scenario or task linkage found — contact has no active mission footprint.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(41,231,255,0.05)' : 'rgba(41,231,255,0.10)',
              border: '1px solid #29E7FF55', color: '#29E7FF',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS MISSION ACTIVATION'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(41,231,255,0.03)',
              border: '1px solid #29E7FF22', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes cstmx-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
