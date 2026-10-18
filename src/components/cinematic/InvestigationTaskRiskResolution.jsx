/**
 * InvestigationTaskRiskResolution — F36
 *
 * Fetches /v1/investigations + /entities/Task + /entities/RiskSignal
 * Keyword-matches each investigation against tasks AND risk signals to classify:
 *   CONTAINED — matched both tasks AND risk signals (actively worked + risks known)
 *   TASKED    — matched tasks only (work is happening, risk is uncharted)
 *   SIGNALED  — matched risk signals only (risk known, no assigned work)
 *   OPEN      — no match in either (investigation floating, needs triage)
 *
 * Toggle: ◈ INVRES button (fixed, bottom strip)
 * Stat tiles: investigations / contained / tasked / signaled / open / tasks / risks
 * Amber pulse on OPEN count.
 * Expandable rows: matched tasks with status badge + matched risks with severity badge.
 * Filter tabs: ALL / CONTAINED / TASKED / SIGNALED / OPEN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "investigation resolution"/"open investigation"/"case resolution"/"invres"/"investigation risk"/"investigation task"
 * Event: jarvis:invres-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CONTAINED', 'TASKED', 'SIGNALED', 'OPEN'];

const CLS_COLOR = {
  CONTAINED: '#22c55e',
  TASKED:    '#29E7FF',
  SIGNALED:  '#A78BFA',
  OPEN:      '#F59E0B',
};

const SEVERITY_COLOR = {
  critical: '#FF4D6D',
  high:     '#F59E0B',
  medium:   '#29E7FF',
  low:      '#22c55e',
};

const PULSE_CSS = `@keyframes invres-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classifyInvestigation(invToks, tasks, risks) {
  const matchedTasks = tasks.filter(t =>
    overlaps(invToks, [t.name, t.title, t.description, t.assignee, t.tags, t.owner].join(' '))
  );
  const matchedRisks = risks.filter(r =>
    overlaps(invToks, [r.name, r.title, r.description, r.category, r.tags, r.source].join(' '))
  );
  if (matchedTasks.length > 0 && matchedRisks.length > 0)
    return { cls: 'CONTAINED', matchedTasks, matchedRisks };
  if (matchedTasks.length > 0)
    return { cls: 'TASKED', matchedTasks, matchedRisks: [] };
  if (matchedRisks.length > 0)
    return { cls: 'SIGNALED', matchedTasks: [], matchedRisks };
  return { cls: 'OPEN', matchedTasks: [], matchedRisks: [] };
}

export function isInvresQuery(q) {
  return /\b(investigation.resolution|open.investigation|case.resolution|invres|investigation.risk|investigation.task|unresolved.case|case.gap|investigation.coverage)\b/i.test(q);
}
export function buildInvresScript() {
  return 'Opening Investigation-Task-Risk Resolution Chain. Cross-referencing open cases against assigned tasks and active risk signals to surface unresolved investigations with no coverage.';
}

export default function InvestigationTaskRiskResolution() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [taskCount, setTaskCount]   = useState(0);
  const [riskCount, setRiskCount]   = useState(0);
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
      const [invRes, taskRes, riskRes] = await Promise.all([
        fetch(`${API}/v1/investigations`, { headers }),
        fetch(`${API}/entities/Task`, { headers }),
        fetch(`${API}/entities/RiskSignal`, { headers }),
      ]);
      const invData  = invRes.ok  ? await invRes.json()  : [];
      const taskData = taskRes.ok ? await taskRes.json() : [];
      const riskData = riskRes.ok ? await riskRes.json() : [];
      const investigations = Array.isArray(invData)  ? invData  : (invData.items  || invData.data  || invData.investigations || []);
      const tasks          = Array.isArray(taskData) ? taskData : (taskData.items || taskData.data || []);
      const risks          = Array.isArray(riskData) ? riskData : (riskData.items || riskData.data || []);
      setTaskCount(tasks.length);
      setRiskCount(risks.length);
      const classified = investigations.map(inv => {
        const title = inv.title || inv.name || inv.subject || '';
        const invToks = tokens([title, inv.description, inv.summary, inv.tags, inv.category].join(' '));
        const { cls, matchedTasks, matchedRisks } = classifyInvestigation(invToks, tasks, risks);
        return { ...inv, _title: title || inv.id || 'Unknown', _cls: cls, _tasks: matchedTasks, _risks: matchedRisks };
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
    window.addEventListener('jarvis:invres-toggle', handler);
    return () => window.removeEventListener('jarvis:invres-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const counts = { CONTAINED: 0, TASKED: 0, SIGNALED: 0, OPEN: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r._title + (r.description || '') + (r.status || '')).toLowerCase().includes(q);
    }
    return true;
  });

  const speak = useCallback(text => {
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const openInv = rows.filter(r => r._cls === 'OPEN').map(r => r._title).slice(0, 5).join(', ');
    const prompt = `Investigation-Task-Risk Resolution Chain analysis: ${rows.length} investigations total. ` +
      `CONTAINED (tasks+risks): ${counts.CONTAINED}, TASKED (tasks only): ${counts.TASKED}, ` +
      `SIGNALED (risks only): ${counts.SIGNALED}, OPEN (no coverage): ${counts.OPEN}. ` +
      `${counts.OPEN > 0 ? `Open investigations with no task or risk coverage: ${openInv || 'multiple'}. ` : ''}` +
      `Active tasks: ${taskCount}. Risk signals: ${riskCount}. ` +
      `In two sentences, identify the most critical resolution gap and recommend the immediate triage action.`;
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
  }, [rows, counts, taskCount, riskCount, speak]);

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 69080, zIndex: 134,
            background: 'rgba(0,0,0,0.75)', border: '1px solid #F59E0B',
            color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ INVRES
          {counts.OPEN > 0 && (
            <span style={{ marginLeft: 4, color: '#F59E0B', animation: 'invres-pulse 1.5s infinite' }}>
              {counts.OPEN}▲
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
        borderRadius: 8, zIndex: 9134, fontFamily: 'monospace', fontSize: 11, color: '#c8d8e0',
        boxShadow: '0 0 30px rgba(245,158,11,0.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #1e3a4a' }}>
          <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2 }}>◈ INVESTIGATION × TASK × RISK — RESOLUTION CHAIN</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #F59E0B', color: '#F59E0B', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #1e3a4a', flexWrap: 'wrap' }}>
          {[
            ['CASES',     rows.length,       '#c8d8e0'],
            ['CONTAINED', counts.CONTAINED,  CLS_COLOR.CONTAINED],
            ['TASKED',    counts.TASKED,     CLS_COLOR.TASKED],
            ['SIGNALED',  counts.SIGNALED,   CLS_COLOR.SIGNALED],
            ['OPEN',      counts.OPEN,       CLS_COLOR.OPEN],
            ['TASKS',     taskCount,         '#c8d8e0'],
            ['RISKS',     riskCount,         '#c8d8e0'],
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
            placeholder="search investigations…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #1e3a4a', color: '#c8d8e0', padding: '3px 8px', borderRadius: 3, fontSize: 10 }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '4px 14px' }}>
          {loading && <div style={{ color: '#6A8BA0', padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#FF4D6D', padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && <div style={{ color: '#6A8BA0', padding: 12 }}>No investigations match filter.</div>}
          {visible.map((inv, i) => {
            const isExp = expanded === i;
            return (
              <div key={inv.id || i} style={{ borderBottom: '1px solid #1a2a36', padding: '6px 0' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : i)}
                >
                  <span style={{ color: CLS_COLOR[inv._cls], fontSize: 9, minWidth: 64, fontWeight: 700 }}>{inv._cls}</span>
                  <span style={{ flex: 1, color: '#e2eaf0' }}>{inv._title}</span>
                  {inv.status && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(41,231,255,0.1)', color: '#29E7FF' }}>{inv.status}</span>
                  )}
                  {inv.category && <span style={{ color: '#6A8BA0', fontSize: 9 }}>{inv.category}</span>}
                  <span style={{ color: '#4a6a7a', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ marginTop: 6, paddingLeft: 16, paddingBottom: 6 }}>
                    {inv._tasks.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#29E7FF', fontSize: 9, marginBottom: 3 }}>ASSIGNED TASKS ({inv._tasks.length})</div>
                        {inv._tasks.slice(0, 4).map((t, ti) => (
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
                    {inv._risks.length > 0 && (
                      <div>
                        <div style={{ color: '#FF4D6D', fontSize: 9, marginBottom: 3 }}>LINKED RISK SIGNALS ({inv._risks.length})</div>
                        {inv._risks.slice(0, 4).map((r, ri) => (
                          <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: SEVERITY_COLOR[r.severity] || '#F59E0B', fontSize: 9 }}>⚠</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{r.name || r.title || `Risk ${ri + 1}`}</span>
                            {r.severity && (
                              <span style={{
                                fontSize: 8, padding: '1px 4px', borderRadius: 2,
                                background: (SEVERITY_COLOR[r.severity] || '#F59E0B') + '22',
                                color: SEVERITY_COLOR[r.severity] || '#F59E0B',
                              }}>{r.severity}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {inv._tasks.length === 0 && inv._risks.length === 0 && (
                      <div style={{ color: '#F59E0B', fontSize: 9 }}>⚠ No tasks or risk signals matched to this investigation — triage required.</div>
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
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS RESOLUTION'}
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
          position: 'fixed', bottom: 8, left: 69080, zIndex: 9135,
          background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ INVRES ✕
      </button>
    </>
  );
}
