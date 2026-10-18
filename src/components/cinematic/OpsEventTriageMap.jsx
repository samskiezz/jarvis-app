import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'TRIAGED', 'ACTIVE', 'UNASSIGNED'];
const CLS_COLOR = {
  TRIAGED:    '#22c55e',
  ACTIVE:     '#ffd700',
  UNASSIGNED: '#ef4444',
};
const PULSE_CSS = `@keyframes otmap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

export function isOpsTriageQuery(q) {
  return /\b(ops triage|event triage|ops tasks|event tasks|triage map|otmap|ops investigation|event investigation|ops event map)\b/i.test(q);
}
export function buildOpsTriageScript() {
  return 'Opening Ops Event Triage Map. Cross-referencing operational events against active investigations and tasks to identify unassigned incidents requiring immediate action.';
}

export default function OpsEventTriageMap() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [invCount, setInvCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef             = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [evRes, invRes, taskRes] = await Promise.all([
        fetch(`${API}/v1/ops/events`),
        fetch(`${API}/v1/investigations`),
        fetch(`${API}/entities/Task`),
      ]);
      const evJson   = evRes.ok   ? await evRes.json()   : {};
      const invJson  = invRes.ok  ? await invRes.json()  : {};
      const taskJson = taskRes.ok ? await taskRes.json() : {};

      const events = Array.isArray(evJson)   ? evJson   : evJson.events        || evJson.results  || [];
      const invs   = Array.isArray(invJson)  ? invJson  : invJson.investigations|| invJson.results || [];
      const tasks  = Array.isArray(taskJson) ? taskJson : taskJson.tasks        || taskJson.results || [];

      setInvCount(invs.length);
      setTaskCount(tasks.length);

      const built = events.map(ev => {
        const evText = [ev.title, ev.description, ev.type, ev.severity, ev.source, ev.category].join(' ');
        const evToks = tokens(evText);

        const matchedInvs = invs.filter(inv => {
          const invText = [inv.title, inv.description, inv.name, inv.category, inv.type].join(' ');
          return overlaps(evToks, invText);
        });

        const matchedTasks = tasks.filter(t => {
          const tText = [t.title, t.name, t.description, t.type, t.category].join(' ');
          return overlaps(evToks, tText);
        });

        const cls = matchedInvs.length > 0 && matchedTasks.length > 0 ? 'TRIAGED'
                  : matchedInvs.length > 0 || matchedTasks.length > 0 ? 'ACTIVE'
                  :                                                       'UNASSIGNED';

        return { ev, cls, matchedInvs, matchedTasks };
      });

      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    document.addEventListener('jarvis:otmap-toggle', handler);
    return () => document.removeEventListener('jarvis:otmap-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const counts = { TRIAGED: 0, ACTIVE: 0, UNASSIGNED: 0 };
  rows.forEach(r => counts[r.cls]++);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = [r.ev.title, r.ev.type, r.ev.severity, r.ev.source].join(' ').toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  const assessAll = async () => {
    const context = `Ops events: ${rows.length}, Triaged (inv+task): ${counts.TRIAGED}, Active (inv or task only): ${counts.ACTIVE}, Unassigned: ${counts.UNASSIGNED}. Investigations: ${invCount}, Tasks: ${taskCount}.`;
    setAssessing(true);
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Provide a 2-sentence ops event triage brief. ${context}` }),
      });
      const d = await res.json();
      const script = (d.answer || '').trim();
      setAssessment(script);
      if (script) document.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          title="Ops Event Triage Map (OTMAP)"
          style={{
            position: 'fixed', left: 65720, bottom: 8, zIndex: 126,
            background: 'rgba(5,8,13,0.82)', border: '1px solid #00bfff55',
            color: '#00bfff', borderRadius: 6, padding: '3px 9px',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            cursor: 'pointer', letterSpacing: 1, backdropFilter: 'blur(6px)',
          }}
        >
          {counts.UNASSIGNED > 0 && (
            <span style={{
              display: 'inline-block', marginRight: 5, background: '#ef4444',
              color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 10,
              animation: 'otmap-pulse 1.5s ease-in-out infinite',
            }}>{counts.UNASSIGNED}</span>
          )}
          ◈ OTMAP
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={() => setOpen(false)}
      >
        <div
          style={{
            background: 'rgba(6,10,16,0.97)', border: '1px solid #00bfff44',
            borderRadius: 12, width: 820, maxHeight: '88vh', display: 'flex',
            flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 0 40px #00bfff22', fontFamily: "'JetBrains Mono',monospace",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #00bfff22', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#00bfff', fontSize: 13, letterSpacing: 2 }}>
                ◈ OPS EVENT TRIAGE MAP
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#00bfff88', cursor: 'pointer', fontSize: 16 }}
              >✕</button>
            </div>
            <div style={{ color: '#00bfff55', fontSize: 10, marginTop: 3, letterSpacing: 1 }}>
              /v1/ops/events × /v1/investigations × /entities/Task — incident triage coverage
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 18px', flexShrink: 0, flexWrap: 'wrap' }}>
            {[
              { label: 'EVENTS',     val: rows.length,       color: '#00bfff' },
              { label: 'TRIAGED',    val: counts.TRIAGED,    color: '#22c55e' },
              { label: 'ACTIVE',     val: counts.ACTIVE,     color: '#ffd700' },
              { label: 'UNASSIGNED', val: counts.UNASSIGNED, color: '#ef4444' },
              { label: 'INVEST.',    val: invCount,          color: '#a78bfa' },
              { label: 'TASKS',      val: taskCount,         color: '#38bdf8' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: 'rgba(0,191,255,0.05)', border: `1px solid ${color}44`,
                borderRadius: 8, padding: '6px 14px', minWidth: 80, textAlign: 'center',
              }}>
                <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#00bfff55', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
            <button
              onClick={assessAll}
              disabled={assessing}
              style={{
                marginLeft: 'auto', background: 'rgba(0,191,255,0.1)',
                border: '1px solid #00bfff44', color: '#00bfff', borderRadius: 6,
                padding: '6px 14px', fontSize: 11, cursor: assessing ? 'wait' : 'pointer',
                letterSpacing: 1,
              }}
            >
              {assessing ? '◌ ASSESSING…' : '▶ ASSESS'}
            </button>
          </div>

          {assessment && (
            <div style={{ padding: '0 18px 10px', color: '#22c55e', fontSize: 11, flexShrink: 0, lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '0 18px 10px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(0,191,255,0.2)' : 'rgba(0,191,255,0.05)',
                border: `1px solid ${tab === t ? '#00bfff' : '#00bfff33'}`,
                color: tab === t ? '#00bfff' : '#00bfff88',
                borderRadius: 5, padding: '3px 10px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: 'auto', background: 'rgba(0,191,255,0.06)',
                border: '1px solid #00bfff33', color: '#00bfff',
                borderRadius: 5, padding: '3px 10px', fontSize: 10,
                outline: 'none', fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px' }}>
            {loading && <div style={{ color: '#00bfff66', fontSize: 11, padding: 12 }}>Loading…</div>}
            {error   && <div style={{ color: '#ef4444', fontSize: 11, padding: 12 }}>{error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#00bfff44', fontSize: 11, padding: 12 }}>No events match.</div>
            )}
            {visible.map((row, i) => {
              const ev = row.ev;
              const id = ev.id || ev._id || i;
              const isExp = expanded === id;
              const sev = (ev.severity || '').toUpperCase();
              const sevColor = sev === 'CRITICAL' ? '#ef4444' : sev === 'HIGH' ? '#f97316' : sev === 'MEDIUM' ? '#ffd700' : '#00bfff66';
              return (
                <div key={id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: isExp ? 'rgba(0,191,255,0.08)' : 'rgba(0,191,255,0.03)',
                      border: `1px solid ${CLS_COLOR[row.cls]}33`,
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 700, minWidth: 80, letterSpacing: 1 }}>
                      {row.cls}
                    </span>
                    <span style={{ color: sevColor, fontSize: 10, minWidth: 64 }}>{sev || '—'}</span>
                    <span style={{ color: '#00bfff', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title || ev.name || ev.type || `Event ${id}`}
                    </span>
                    {ev.type && (
                      <span style={{ background: 'rgba(0,191,255,0.1)', border: '1px solid #00bfff33', color: '#00bfff88', borderRadius: 4, padding: '1px 7px', fontSize: 9 }}>
                        {ev.type}
                      </span>
                    )}
                    <span style={{ color: '#00bfff44', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: '10px 18px', background: 'rgba(0,191,255,0.04)', borderRadius: '0 0 8px 8px', borderTop: 'none' }}>
                      {ev.description && (
                        <div style={{ color: '#00bfff99', fontSize: 10, marginBottom: 8, lineHeight: 1.6 }}>{ev.description}</div>
                      )}

                      {row.matchedInvs.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: '#a78bfa', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                            INVESTIGATIONS ({row.matchedInvs.length})
                          </div>
                          {row.matchedInvs.map((inv, j) => (
                            <div key={inv.id || j} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                              <span style={{
                                background: (inv.status || '').toLowerCase() === 'open' ? 'rgba(34,197,94,0.15)' : 'rgba(0,191,255,0.1)',
                                border: `1px solid ${(inv.status || '').toLowerCase() === 'open' ? '#22c55e44' : '#00bfff33'}`,
                                color: (inv.status || '').toLowerCase() === 'open' ? '#22c55e' : '#00bfff88',
                                borderRadius: 4, padding: '1px 7px', fontSize: 9,
                              }}>{(inv.status || 'unknown').toUpperCase()}</span>
                              <span style={{ color: '#a78bfacc', fontSize: 10 }}>{inv.title || inv.name || inv.id}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#38bdf8', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                            TASKS ({row.matchedTasks.length})
                          </div>
                          {row.matchedTasks.map((t, j) => (
                            <div key={t.id || j} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                              <span style={{
                                background: 'rgba(56,189,248,0.1)', border: '1px solid #38bdf833',
                                color: '#38bdf8aa', borderRadius: 4, padding: '1px 7px', fontSize: 9,
                              }}>{(t.status || 'unknown').toUpperCase()}</span>
                              <span style={{ color: '#38bdf8cc', fontSize: 10 }}>{t.title || t.name || t.id}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedInvs.length === 0 && row.matchedTasks.length === 0 && (
                        <div style={{ color: '#ef444488', fontSize: 10 }}>No matching investigations or tasks found.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
