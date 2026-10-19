/**
 * TaskInvestigationKnowledgeClosure — F39
 *
 * Fetches /entities/Task + /v1/investigations + /knowledge/
 * Keyword-matches each task against investigations AND knowledge items to classify:
 *   ANCHORED    — matched both an investigation AND a knowledge item (fully tracked)
 *   TRACKED     — matched an investigation only (in-progress, no knowledge capture)
 *   DOCUMENTED  — matched a knowledge item only (documented, no open investigation)
 *   ORPHAN      — no match in either (unlinked task, potential closure gap)
 *
 * Toggle: ◈ TKINV button (fixed, bottom strip) left:70760, zIndex:137
 * Stat tiles: tasks / investigations / knowledge / anchored / tracked / documented / orphan
 * Amber pulse on ORPHAN count.
 * Expandable rows: matched investigations + matched knowledge items.
 * Filter tabs: ALL / ANCHORED / TRACKED / DOCUMENTED / ORPHAN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "task investigation"/"knowledge closure"/"task closure"/"tkinv"/"orphan task"/"task knowledge"/"task audit"
 * Event: jarvis:tkinv-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ANCHORED', 'TRACKED', 'DOCUMENTED', 'ORPHAN'];

const CLS_COLOR = {
  ANCHORED:   '#22c55e',
  TRACKED:    '#29E7FF',
  DOCUMENTED: '#A78BFA',
  ORPHAN:     '#F59E0B',
};

const PULSE_CSS = `@keyframes tkinv-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(taskToks, investigations, knowledge) {
  const matchedInvs = investigations.filter(inv =>
    overlaps(taskToks, [inv.title, inv.name, inv.description, inv.tags, inv.status, inv.type, inv.subject].join(' '))
  );
  const matchedKnow = knowledge.filter(k =>
    overlaps(taskToks, [k.title, k.name, k.description, k.tags, k.type, k.category, k.content].join(' '))
  );
  if (matchedInvs.length > 0 && matchedKnow.length > 0)
    return { cls: 'ANCHORED', matchedInvs, matchedKnow };
  if (matchedInvs.length > 0)
    return { cls: 'TRACKED', matchedInvs, matchedKnow: [] };
  if (matchedKnow.length > 0)
    return { cls: 'DOCUMENTED', matchedInvs: [], matchedKnow };
  return { cls: 'ORPHAN', matchedInvs: [], matchedKnow: [] };
}

export function isTkinvQuery(q) {
  return /\b(task.investig|knowledge.clos|task.clos|tkinv|orphan.task|task.knowledge|task.audit|closure.audit|task.track)\b/i.test(q);
}
export function buildTkinvScript() {
  return 'Opening Task-Investigation-Knowledge Closure Audit. Cross-referencing all tasks against open investigations and knowledge base to identify orphaned tasks and closure gaps.';
}

export default function TaskInvestigationKnowledgeClosure() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [invCount, setInvCount]     = useState(0);
  const [knowCount, setKnowCount]   = useState(0);
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
      const [taskRes, invRes, knowRes] = await Promise.all([
        fetch(`${API}/entities/Task`, { headers }),
        fetch(`${API}/v1/investigations`, { headers }),
        fetch(`${API}/knowledge/`, { headers }),
      ]);
      const taskData = taskRes.ok ? await taskRes.json() : [];
      const invData  = invRes.ok  ? await invRes.json()  : [];
      const knowData = knowRes.ok ? await knowRes.json() : [];

      const tasks         = Array.isArray(taskData) ? taskData : (taskData.items || taskData.data || taskData.tasks        || []);
      const investigations = Array.isArray(invData)  ? invData  : (invData.items  || invData.data  || invData.investigations || invData.cases || []);
      const knowledge     = Array.isArray(knowData)  ? knowData : (knowData.items || knowData.data || knowData.documents   || knowData.entries || []);

      setInvCount(investigations.length);
      setKnowCount(knowledge.length);

      const classified = tasks.map(task => {
        const name     = task.title || task.name || task.description || task.id || '';
        const taskToks = tokens([name, task.description, task.tags, task.type, task.category, task.assignee, task.project].join(' '));
        const { cls, matchedInvs, matchedKnow } = classify(taskToks, investigations, knowledge);
        return { ...task, _name: name || task.id || 'Unknown', _cls: cls, _invs: matchedInvs, _know: matchedKnow };
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
    window.addEventListener('jarvis:tkinv-toggle', handler);
    return () => window.removeEventListener('jarvis:tkinv-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const counts = { ANCHORED: 0, TRACKED: 0, DOCUMENTED: 0, ORPHAN: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r._name + (r.description || '') + (r.type || '') + (r.status || '')).toLowerCase().includes(q);
    }
    return true;
  });

  const speak = useCallback(text => {
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const orphanNames = rows.filter(r => r._cls === 'ORPHAN').map(r => r._name).slice(0, 5).join(', ');
    const prompt = `Task-Investigation-Knowledge Closure Audit: ${rows.length} tasks total. ` +
      `ANCHORED (both inv+knowledge): ${counts.ANCHORED}, TRACKED (investigation only): ${counts.TRACKED}, ` +
      `DOCUMENTED (knowledge only): ${counts.DOCUMENTED}, ORPHAN (unlinked): ${counts.ORPHAN}. ` +
      `${counts.ORPHAN > 0 ? `Orphaned tasks include: ${orphanNames || 'multiple'}. ` : ''}` +
      `Active investigations: ${invCount}. Knowledge base items: ${knowCount}. ` +
      `In two sentences, identify the most critical closure gap and recommend the immediate action to reduce orphaned tasks.`;
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
  }, [rows, counts, invCount, knowCount, speak]);

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 70760, zIndex: 137,
            background: 'rgba(0,0,0,0.75)', border: '1px solid #F59E0B',
            color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ TKINV
          {counts.ORPHAN > 0 && (
            <span style={{ marginLeft: 4, color: '#F59E0B', animation: 'tkinv-pulse 1.5s infinite' }}>
              {counts.ORPHAN}▲
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
        borderRadius: 8, zIndex: 9137, fontFamily: 'monospace', fontSize: 11, color: '#c8d8e0',
        boxShadow: '0 0 30px rgba(245,158,11,0.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #1e3a4a' }}>
          <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2 }}>◈ TASK × INVESTIGATION × KNOWLEDGE — CLOSURE AUDIT</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #F59E0B', color: '#F59E0B', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #1e3a4a', flexWrap: 'wrap' }}>
          {[
            ['TASKS',       rows.length,        '#c8d8e0'],
            ['INVEST.',     invCount,            '#c8d8e0'],
            ['KNOWLEDGE',   knowCount,           '#c8d8e0'],
            ['ANCHORED',    counts.ANCHORED,     CLS_COLOR.ANCHORED],
            ['TRACKED',     counts.TRACKED,      CLS_COLOR.TRACKED],
            ['DOCUMENTED',  counts.DOCUMENTED,   CLS_COLOR.DOCUMENTED],
            ['ORPHAN',      counts.ORPHAN,       CLS_COLOR.ORPHAN],
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
            placeholder="search tasks…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #1e3a4a', color: '#c8d8e0', padding: '3px 8px', borderRadius: 3, fontSize: 10 }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '4px 14px' }}>
          {loading && <div style={{ color: '#6A8BA0', padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#FF4D6D', padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && <div style={{ color: '#6A8BA0', padding: 12 }}>No tasks match filter.</div>}
          {visible.map((task, i) => {
            const isExp = expanded === i;
            return (
              <div key={task.id || i} style={{ borderBottom: '1px solid #1a2a36', padding: '6px 0' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : i)}
                >
                  <span style={{ color: CLS_COLOR[task._cls], fontSize: 9, minWidth: 82, fontWeight: 700 }}>{task._cls}</span>
                  <span style={{ flex: 1, color: '#e2eaf0' }}>{task._name}</span>
                  {task.status && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(41,231,255,0.1)', color: '#29E7FF' }}>{task.status}</span>
                  )}
                  {task.priority && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>P:{task.priority}</span>
                  )}
                  <span style={{ color: '#4a6a7a', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ marginTop: 6, paddingLeft: 16, paddingBottom: 6 }}>
                    {task._invs.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#29E7FF', fontSize: 9, marginBottom: 3 }}>LINKED INVESTIGATIONS ({task._invs.length})</div>
                        {task._invs.slice(0, 4).map((inv, ii) => (
                          <div key={ii} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#29E7FF', fontSize: 9 }}>◈</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{inv.title || inv.name || `Investigation ${ii + 1}`}</span>
                            {inv.status && (
                              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#29E7FF22', color: '#29E7FF' }}>{inv.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {task._know.length > 0 && (
                      <div>
                        <div style={{ color: '#A78BFA', fontSize: 9, marginBottom: 3 }}>MATCHED KNOWLEDGE ITEMS ({task._know.length})</div>
                        {task._know.slice(0, 4).map((k, ki) => (
                          <div key={ki} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#A78BFA', fontSize: 9 }}>⬡</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{k.title || k.name || `Knowledge ${ki + 1}`}</span>
                            {k.type && (
                              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#A78BFA22', color: '#A78BFA' }}>{k.type}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {task._invs.length === 0 && task._know.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No investigation or knowledge linked — orphaned task, potential closure gap.</div>
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
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS CLOSURE GAPS'}
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
          position: 'fixed', bottom: 8, left: 70760, zIndex: 9138,
          background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ TKINV ✕
      </button>
    </>
  );
}
