/**
 * IntelProfileOpsAlertTaskEscalation — F82
 *
 * Fetches /entities/IntelProfile + /v1/ops/alerts + /entities/Task.
 * Keyword-matches each intel profile against live ops alerts AND active tasks to classify:
 *   ESCALATED — profile has both a matched ops alert AND a matched task (fully active)
 *   ALERTED   — profile matched ops alerts only (live threat signal, no task assigned)
 *   TASKED    — profile matched tasks only (work underway, no live alert)
 *   DORMANT   — no ops alert and no task match (blind-spot profile)
 *
 * Toggle: ◈ IPELSC button (fixed, bottom strip) left:94280, zIndex:179
 * Stat tiles: profiles / alerts / tasks / escalated / alerted / tasked / dormant
 * Red pulse on DORMANT count.
 * Expandable rows: matched ops alerts with severity badge + matched tasks with status badge.
 * Filter tabs: ALL / ESCALATED / ALERTED / TASKED / DORMANT + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ipelsc"/"intel escalation"/"intel ops task"/"escalation pipeline"/
 *        "dormant intel"/"intel alert task"/"profile escalation"/"intel dormant"
 * Event: jarvis:ipelsc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ESCALATED', 'ALERTED', 'TASKED', 'DORMANT'];

const CLS_COLOR = {
  ESCALATED: '#FF4444',
  ALERTED:   '#F97316',
  TASKED:    '#38BDF8',
  DORMANT:   '#94A3B8',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
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

export function isIpelscQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ipelsc', 'intel escalation', 'intel ops task',
    'escalation pipeline', 'dormant intel', 'intel alert task',
    'profile escalation', 'intel dormant',
  ].some(k => s.includes(k));
}

export function buildIpelscScript() {
  return `Fetch /entities/IntelProfile, /v1/ops/alerts, and /entities/Task. ` +
    `Keyword-match each intel profile name and category against live ops alerts AND active tasks. ` +
    `Classify each profile as ESCALATED/ALERTED/TASKED/DORMANT. ` +
    `Report total DORMANT count (profiles with no ops alert and no task — blind spots), ` +
    `identify which intel profiles lack both alert coverage and task assignment, ` +
    `and recommend which profiles should be escalated by creating tasks or triggering alerts ` +
    `to bring dormant profiles to ESCALATED status.`;
}

export default function IntelProfileOpsAlertTaskEscalation() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    profiles:0, alerts:0, tasks:0, escalated:0, alerted:0, tasked:0, dormant:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [iRaw, aRaw, tRaw] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Task`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const profiles = normalizeArray(iRaw, ['items','profiles','results','data']);
      const alerts   = normalizeArray(aRaw, ['items','alerts','results','data']);
      const tasks    = normalizeArray(tRaw, ['items','tasks','results','data']);

      const built = profiles.map(prof => {
        const profText = [
          prof.name, prof.label, prof.category, prof.type, prof.tags, prof.description, prof.subject,
        ].filter(Boolean).join(' ');
        const pToks = tokens(profText);

        const matchedAlerts = alerts.filter(a => {
          const aStr = [a.title, a.name, a.message, a.description, a.category, a.source, a.type].filter(Boolean).join(' ');
          return overlaps(pToks, aStr);
        });
        const matchedTasks = tasks.filter(t => {
          const tStr = [t.title, t.name, t.description, t.type, t.tags, t.assignee, t.category].filter(Boolean).join(' ');
          return overlaps(pToks, tStr);
        });

        const hasAlerts = matchedAlerts.length > 0;
        const hasTasks  = matchedTasks.length > 0;
        const cls = hasAlerts && hasTasks ? 'ESCALATED'
                  : hasAlerts             ? 'ALERTED'
                  : hasTasks              ? 'TASKED'
                  :                         'DORMANT';
        return {
          id:            prof.id || prof.profile_id || String(Math.random()),
          name:          prof.name || prof.label || prof.subject || '(profile)',
          category:      prof.category || prof.type || '',
          cls,
          matchedAlerts,
          matchedTasks,
        };
      });

      const c = { profiles: built.length, alerts: alerts.length, tasks: tasks.length,
                  escalated:0, alerted:0, tasked:0, dormant:0 };
      built.forEach(r => { c[r.cls.toLowerCase()]++; });
      setRows(built);
      setCounts(c);
    } catch (e) {
      setError(e.message || 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:ipelsc-toggle', handler);
    return () => window.removeEventListener('jarvis:ipelsc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: buildIpelscScript() }),
      });
      const d = await res.json();
      const text = d?.response || d?.message || d?.content || 'No assessment returned.';
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s) || r.category.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed', bottom:8, left:94280, zIndex:179,
          background:'rgba(0,10,30,0.85)', border:'1px solid #FF4444',
          color:'#FF4444', fontSize:9, padding:'3px 7px', borderRadius:3,
          cursor:'pointer', letterSpacing:1, fontFamily:'monospace',
          whiteSpace:'nowrap',
        }}
        title="IntelProfile × Ops Alert × Task Escalation Pipeline"
      >
        ◈ IPELSC
        {counts.dormant > 0 && (
          <span style={{ marginLeft:4, color:'#FF4444', animation:'pulse-red 1.5s infinite' }}>
            {counts.dormant}▲
          </span>
        )}
        <style>{`@keyframes pulse-red{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9900,
      background:'rgba(0,0,10,0.92)', display:'flex', flexDirection:'column',
      fontFamily:'monospace', color:'#E2E8F0',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px',
                    borderBottom:'1px solid #1e3a5f', background:'rgba(0,5,20,0.95)' }}>
        <span style={{ color:'#FF4444', fontWeight:700, letterSpacing:2, fontSize:12 }}>◈ IPELSC</span>
        <span style={{ color:'#94A3B8', fontSize:10 }}>INTELPROFILE × OPS ALERT × TASK  ESCALATION PIPELINE</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchData} style={{ background:'transparent', border:'1px solid #334155',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ↺ REFRESH
          </button>
          <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'1px solid #475569',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ✕ CLOSE
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display:'flex', gap:8, padding:'8px 16px', flexWrap:'wrap',
                    borderBottom:'1px solid #1e3a5f' }}>
        {[
          { label:'PROFILES',  val: counts.profiles,  col:'#94A3B8' },
          { label:'ALERTS',    val: counts.alerts,    col:'#94A3B8' },
          { label:'TASKS',     val: counts.tasks,     col:'#94A3B8' },
          { label:'ESCALATED', val: counts.escalated, col: CLS_COLOR.ESCALATED },
          { label:'ALERTED',   val: counts.alerted,   col: CLS_COLOR.ALERTED   },
          { label:'TASKED',    val: counts.tasked,    col: CLS_COLOR.TASKED    },
          { label:'DORMANT',   val: counts.dormant,   col: CLS_COLOR.DORMANT   },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background:'rgba(0,10,30,0.8)', border:`1px solid ${col}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:80 }}>
            <div style={{ color: col, fontSize:16, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#64748B', fontSize:8, letterSpacing:1 }}>{label}</div>
          </div>
        ))}

        <button onClick={assess} disabled={assessing} style={{
          marginLeft:'auto', background: assessing ? '#1e3a5f' : 'rgba(255,68,68,0.15)',
          border:'1px solid #FF4444', color:'#FF4444', padding:'4px 12px',
          borderRadius:3, cursor: assessing ? 'default' : 'pointer', fontSize:9, letterSpacing:1,
        }}>
          {assessing ? '…ASSESSING' : '▶ ASSESS'}
        </button>
      </div>

      {assessment && (
        <div style={{ margin:'6px 16px', padding:'8px 12px', background:'rgba(255,68,68,0.08)',
          border:'1px solid #FF444466', borderRadius:4, fontSize:10, color:'#E2E8F0',
          maxHeight:80, overflowY:'auto' }}>
          {assessment}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display:'flex', gap:4, padding:'6px 16px', alignItems:'center',
                    borderBottom:'1px solid #1e3a5f', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? `${CLS_COLOR[t] || '#334155'}22` : 'transparent',
            border: `1px solid ${tab===t ? (CLS_COLOR[t]||'#334155') : '#334155'}`,
            color: tab===t ? (CLS_COLOR[t]||'#E2E8F0') : '#64748B',
            padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9, letterSpacing:1,
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ marginLeft:'auto', background:'rgba(0,10,30,0.7)', border:'1px solid #334155',
            color:'#E2E8F0', padding:'2px 8px', borderRadius:3, fontSize:9, width:180, outline:'none' }} />
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 16px' }}>
        {loading && <div style={{ color:'#64748B', fontSize:10, padding:8 }}>Loading…</div>}
        {error   && <div style={{ color:'#FF4444', fontSize:10, padding:8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#475569', fontSize:10, padding:8 }}>No profiles match the current filter.</div>
        )}
        {visible.map(r => {
          const isExp = !!expanded[r.id];
          return (
            <div key={r.id} style={{ marginBottom:3 }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px',
                  background:'rgba(0,10,30,0.6)', border:`1px solid ${CLS_COLOR[r.cls]}33`,
                  borderRadius: isExp ? '4px 4px 0 0' : 4, cursor:'pointer' }}
              >
                <span style={{ fontSize:9, padding:'1px 6px', borderRadius:2,
                  background:`${CLS_COLOR[r.cls]}22`, color: CLS_COLOR[r.cls], letterSpacing:1 }}>
                  {r.cls}
                </span>
                <span style={{ color:'#E2E8F0', fontSize:10, flex:1 }}>{r.name}</span>
                {r.category && (
                  <span style={{ color:'#64748B', fontSize:9 }}>{r.category}</span>
                )}
                <span style={{ color:'#475569', fontSize:9 }}>
                  {r.matchedAlerts.length}A · {r.matchedTasks.length}T
                </span>
                <span style={{ color:'#475569', fontSize:9 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background:'rgba(0,10,30,0.7)', border:`1px solid ${CLS_COLOR[r.cls]}22`,
                  borderRadius:'0 0 4px 4px', padding:'8px 12px', display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#F97316', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED OPS ALERTS
                    </div>
                    {r.matchedAlerts.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedAlerts.map((a, ai) => (
                        <div key={ai} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {a.title || a.name || a.message || '(alert)'}
                          </span>
                          {(a.severity || a.level || a.priority) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#F9731633', color:'#F97316' }}>
                              {a.severity || a.level || a.priority}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#38BDF8', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED TASKS
                    </div>
                    {r.matchedTasks.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedTasks.map((t, ti) => (
                        <div key={ti} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {t.title || t.name || t.id || '(task)'}
                          </span>
                          {(t.status || t.state) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#38BDF833', color:'#38BDF8' }}>
                              {t.status || t.state}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-red {
          0%,100% { opacity:1; }
          50% { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}
