/**
 * ContactReportTaskChain — F35
 *
 * Fetches /entities/Contact + /v1/reports + /entities/Task
 * Keyword-matches each contact against intelligence reports AND active tasks to classify:
 *   ACTIVE   — contact appears in both a report AND a task (fully tracked)
 *   TRACKED  — appears in tasks but not in reports (operationally tracked, not briefed)
 *   BRIEFED  — appears in reports but not in tasks (briefed, no active ops)
 *   DARK     — no matches in either (untracked, intelligence gap)
 *
 * Toggle: ◈ CRTACT button (fixed, bottom strip)
 * Stat tiles: contacts / active / tracked / briefed / dark / reports / tasks
 * Amber pulse on DARK count.
 * Expandable rows: matched reports + matched tasks.
 * Filter tabs: ALL / ACTIVE / TRACKED / BRIEFED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "contact report"/"contact task"/"action chain"/"dark contacts"/"contact chain"/"crtact"
 * Event: jarvis:crtact-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVE', 'TRACKED', 'BRIEFED', 'DARK'];

const CLS_COLOR = {
  ACTIVE:   '#22c55e',
  TRACKED:  '#29E7FF',
  BRIEFED:  '#A78BFA',
  DARK:     '#F59E0B',
};

const PULSE_CSS = `@keyframes crtact-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classifyContact(cToks, reports, tasks) {
  const matchedReports = reports.filter(r =>
    overlaps(cToks, [r.title, r.summary, r.content, r.tags, r.author].join(' '))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(cToks, [t.name, t.description, t.assignee, t.tags, t.owner].join(' '))
  );
  if (matchedReports.length > 0 && matchedTasks.length > 0)
    return { cls: 'ACTIVE', matchedReports, matchedTasks };
  if (matchedTasks.length > 0)
    return { cls: 'TRACKED', matchedReports: [], matchedTasks };
  if (matchedReports.length > 0)
    return { cls: 'BRIEFED', matchedReports, matchedTasks: [] };
  return { cls: 'DARK', matchedReports: [], matchedTasks: [] };
}

export function isCrtactQuery(q) {
  return /\b(contact.report|contact.task|action.chain|dark.contact|contact.chain|crtact|contact.intel.task|untracked.contact|contact.ops)\b/i.test(q);
}
export function buildCrtactScript() {
  return 'Opening Contact-Report-Task Action Chain. Cross-referencing contacts against intelligence reports and active tasks to surface dark contacts with no coverage.';
}

export default function ContactReportTaskChain() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [reportCount, setRptCount]  = useState(0);
  const [taskCount, setTskCount]    = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [cRes, rRes, tRes] = await Promise.all([
        fetch(`${API}/entities/Contact`, { headers }),
        fetch(`${API}/v1/reports`, { headers }),
        fetch(`${API}/entities/Task`, { headers }),
      ]);
      const cData = cRes.ok ? await cRes.json() : [];
      const rData = rRes.ok ? await rRes.json() : [];
      const tData = tRes.ok ? await tRes.json() : [];
      const contacts  = Array.isArray(cData) ? cData : (cData.items || cData.data || []);
      const reports   = Array.isArray(rData) ? rData : (rData.items || rData.data || rData.reports || []);
      const tasks     = Array.isArray(tData) ? tData : (tData.items || tData.data || []);
      setRptCount(reports.length);
      setTskCount(tasks.length);
      const classified = contacts.map(c => {
        const name = [c.name, c.first_name, c.last_name, c.full_name].filter(Boolean).join(' ');
        const cToks = tokens([name, c.role, c.organization, c.email, c.bio, c.tags].join(' '));
        const { cls, matchedReports, matchedTasks } = classifyContact(cToks, reports, tasks);
        return { ...c, _name: name || c.id || 'Unknown', _cls: cls, _reports: matchedReports, _tasks: matchedTasks };
      });
      setRows(classified);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(v => !v); };
    window.addEventListener('jarvis:crtact-toggle', handler);
    return () => window.removeEventListener('jarvis:crtact-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const counts = { ACTIVE: 0, TRACKED: 0, BRIEFED: 0, DARK: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r._name + r.role + r.organization).toLowerCase().includes(q);
    }
    return true;
  });

  const speak = useCallback(text => {
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const darkContacts = rows.filter(r => r._cls === 'DARK').map(r => r._name).slice(0, 5).join(', ');
    const prompt = `Contact-Report-Task Action Chain analysis: ${rows.length} contacts total. ` +
      `ACTIVE: ${counts.ACTIVE}, TRACKED: ${counts.TRACKED}, BRIEFED: ${counts.BRIEFED}, DARK: ${counts.DARK}. ` +
      `${counts.DARK > 0 ? `Dark contacts (no report or task coverage): ${darkContacts || 'multiple'}. ` : ''}` +
      `Reports in corpus: ${reportCount}. Active tasks: ${taskCount}. ` +
      `In two sentences, identify the intelligence coverage gap and recommend immediate action.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const txt = d.response || d.message || d.reply || d.content || 'No response.';
      setAssessment(txt);
      speak(txt);
    } catch (e) {
      setAssessment(e.message);
    } finally {
      setAssessing(false);
    }
  }, [rows, counts, reportCount, taskCount, speak]);

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 68520, zIndex: 133,
            background: 'rgba(0,0,0,0.75)', border: '1px solid #F59E0B',
            color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ CRTACT
          {counts.DARK > 0 && (
            <span style={{ marginLeft: 4, color: '#F59E0B', animation: 'crtact-pulse 1.5s infinite' }}>
              {counts.DARK}▲
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
        width: 820, maxHeight: '80vh', overflowY: 'auto',
        background: 'rgba(8,12,18,0.97)', border: '1px solid #F59E0B',
        borderRadius: 8, zIndex: 9133, fontFamily: 'monospace', fontSize: 11, color: '#c8d8e0',
        boxShadow: '0 0 30px rgba(245,158,11,0.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #1e3a4a' }}>
          <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2 }}>◈ CONTACT × REPORT × TASK — ACTION CHAIN</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #F59E0B', color: '#F59E0B', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #1e3a4a', flexWrap: 'wrap' }}>
          {[
            ['CONTACTS', rows.length, '#c8d8e0'],
            ['ACTIVE',   counts.ACTIVE, CLS_COLOR.ACTIVE],
            ['TRACKED',  counts.TRACKED, CLS_COLOR.TRACKED],
            ['BRIEFED',  counts.BRIEFED, CLS_COLOR.BRIEFED],
            ['DARK',     counts.DARK, CLS_COLOR.DARK],
            ['REPORTS',  reportCount, '#c8d8e0'],
            ['TASKS',    taskCount, '#c8d8e0'],
          ].map(([label, val, col]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center' }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#6A8BA0', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', alignItems: 'center', borderBottom: '1px solid #1e3a4a' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CLS_COLOR[t] || '#F59E0B' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${CLS_COLOR[t] || '#F59E0B'}`,
              color: tab === t ? '#000' : (CLS_COLOR[t] || '#F59E0B'),
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #1e3a4a', color: '#c8d8e0', padding: '3px 8px', borderRadius: 3, fontSize: 10 }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '4px 14px' }}>
          {loading && <div style={{ color: '#6A8BA0', padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#FF4D6D', padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && <div style={{ color: '#6A8BA0', padding: 12 }}>No contacts match filter.</div>}
          {visible.map((c, i) => {
            const isExp = expanded === i;
            return (
              <div key={c.id || i} style={{ borderBottom: '1px solid #1a2a36', padding: '6px 0' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : i)}
                >
                  <span style={{ color: CLS_COLOR[c._cls], fontSize: 9, minWidth: 56, fontWeight: 700 }}>{c._cls}</span>
                  <span style={{ flex: 1, color: '#e2eaf0' }}>{c._name}</span>
                  {c.role && <span style={{ color: '#6A8BA0', fontSize: 9 }}>{c.role}</span>}
                  {c.organization && <span style={{ color: '#29E7FF', fontSize: 9 }}>{c.organization}</span>}
                  <span style={{ color: '#4a6a7a', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ marginTop: 6, paddingLeft: 16, paddingBottom: 6 }}>
                    {c._reports.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#A78BFA', fontSize: 9, marginBottom: 3 }}>INTELLIGENCE REPORTS ({c._reports.length})</div>
                        {c._reports.slice(0, 4).map((r, ri) => (
                          <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                            <span style={{ color: '#29E7FF', fontSize: 9 }}>📄</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{r.title || r.name || `Report ${ri + 1}`}</span>
                            {r.date && <span style={{ color: '#6A8BA0', fontSize: 9 }}>{r.date}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {c._tasks.length > 0 && (
                      <div>
                        <div style={{ color: '#22c55e', fontSize: 9, marginBottom: 3 }}>ACTIVE TASKS ({c._tasks.length})</div>
                        {c._tasks.slice(0, 4).map((t, ti) => (
                          <div key={ti} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#F59E0B', fontSize: 9 }}>◉</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{t.name || t.title || `Task ${ti + 1}`}</span>
                            {t.status && (
                              <span style={{
                                fontSize: 8, padding: '1px 4px', borderRadius: 2,
                                background: t.status === 'open' ? '#22c55e33' : '#29E7FF33',
                                color: t.status === 'open' ? '#22c55e' : '#29E7FF',
                              }}>{t.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {c._reports.length === 0 && c._tasks.length === 0 && (
                      <div style={{ color: '#F59E0B', fontSize: 9 }}>⚠ No intelligence reports or tasks match this contact.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1e3a4a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.15)',
              border: '1px solid #F59E0B', color: '#F59E0B',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS COVERAGE'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid #F59E0B', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>

      {/* Collapsed toggle */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 68520, zIndex: 9134,
          background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ CRTACT ✕
      </button>
    </>
  );
}
