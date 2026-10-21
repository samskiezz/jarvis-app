/**
 * LiveIntelTaskOpsAlertThreatResponse — F88
 *
 * Fetches /functions/getLiveIntel + /entities/Task + /v1/ops/alerts.
 * Keyword-matches each live event category against tasks AND ops alerts to classify:
 *   RESPONDING  — live event has both a matched task AND a matched ops alert (full coverage)
 *   TASKED      — live event matched tasks only (operationalised but no alert monitoring)
 *   ALERTED     — live event matched ops alerts only (monitored but no active task)
 *   UNTRACKED   — no matching task or ops alert (live threat with zero operational coverage)
 *
 * Toggle: ◈ LTORCA button (fixed, bottom strip) left:97640, zIndex:185
 * Stat tiles: events / tasks / alerts / responding / tasked / alerted / untracked
 * Red pulse on UNTRACKED count.
 * Expandable rows: matched tasks with status badge + matched ops alerts with severity badge.
 * Filter tabs: ALL / RESPONDING / TASKED / ALERTED / UNTRACKED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ltorca"/"live intel task ops"/"threat response"/"untracked threats"
 *        "live threat response"/"operational threat response"/"live event task"
 *        "ops alert live intel"/"threat coverage"/"live event untracked"
 *        "incident response chain"/"threat response pipeline"
 * Event: jarvis:ltorca-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'RESPONDING', 'TASKED', 'ALERTED', 'UNTRACKED'];

const CLS_COLOR = {
  RESPONDING: '#22C55E',
  TASKED:     '#38BDF8',
  ALERTED:    '#F59E0B',
  UNTRACKED:  '#EF4444',
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

function extractLiveEvents(raw) {
  if (!raw) return [];
  const events = [];
  // earthquakes
  const quakes = raw.earthquakes || raw.quakes || [];
  (Array.isArray(quakes) ? quakes : []).forEach(q => {
    events.push({
      id: `quake-${q.id || q.place || Math.random()}`,
      label: q.place || q.location || 'Earthquake',
      category: 'earthquake',
      detail: `M${q.magnitude || '?'} ${q.place || ''}`,
      severity: q.magnitude >= 6 ? 'high' : q.magnitude >= 4 ? 'medium' : 'low',
    });
  });
  // crypto
  const crypto = raw.crypto || raw.cryptoPrices || [];
  (Array.isArray(crypto) ? crypto : []).slice(0, 5).forEach(c => {
    events.push({
      id: `crypto-${c.symbol || c.id || Math.random()}`,
      label: c.symbol || c.name || 'Crypto',
      category: 'crypto',
      detail: `${c.symbol} ${c.changePercent24h >= 0 ? '+' : ''}${(c.changePercent24h || 0).toFixed(2)}%`,
      severity: Math.abs(c.changePercent24h || 0) >= 5 ? 'high' : 'low',
    });
  });
  // fx
  const fx = raw.fx || raw.forex || [];
  (Array.isArray(fx) ? fx : []).slice(0, 5).forEach(f => {
    events.push({
      id: `fx-${f.pair || f.symbol || Math.random()}`,
      label: f.pair || f.symbol || 'FX',
      category: 'fx',
      detail: f.pair || f.symbol || '',
      severity: 'low',
    });
  });
  return events;
}

export function isLtorcaQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ltorca', 'live intel task ops', 'threat response', 'untracked threats',
    'live threat response', 'operational threat response', 'live event task',
    'ops alert live intel', 'threat coverage', 'live event untracked',
    'incident response chain', 'threat response pipeline',
  ].some(k => s.includes(k));
}

export function buildLtorcaScript() {
  return `Fetch /functions/getLiveIntel, /entities/Task, and /v1/ops/alerts. ` +
    `Keyword-match each live event (earthquake region, crypto symbol, FX pair) against task titles/descriptions AND ops alert messages/types. ` +
    `Classify each live event as RESPONDING/TASKED/ALERTED/UNTRACKED. ` +
    `Report total UNTRACKED count (live threats with no active task and no ops alert — operational blind spots), ` +
    `identify which UNTRACKED events are highest severity, ` +
    `and recommend task creation or ops alert configuration to close the threat response gap.`;
}

export default function LiveIntelTaskOpsAlertThreatResponse() {
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
    events:0, tasks:0, alerts:0, responding:0, tasked:0, alerted:0, untracked:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [intelRaw, taskRaw, alertRaw] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Task`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const liveEvents = extractLiveEvents(intelRaw);
      const tasks      = normalizeArray(taskRaw,  ['items','tasks','results','data','entities']);
      const opsAlerts  = normalizeArray(alertRaw, ['items','alerts','results','data']);

      const built = liveEvents.map(ev => {
        const evText = [ev.label, ev.category, ev.detail].filter(Boolean).join(' ');
        const evToks = tokens(evText);

        const matchedTasks = tasks.filter(t => {
          const tStr = [t.title, t.name, t.description, t.type, t.category, t.tags, t.status].filter(Boolean).join(' ');
          return overlaps(evToks, tStr);
        });
        const matchedAlerts = opsAlerts.filter(a => {
          const aStr = [a.message, a.title, a.name, a.type, a.category, a.service, a.description].filter(Boolean).join(' ');
          return overlaps(evToks, aStr);
        });

        const hasTasks  = matchedTasks.length > 0;
        const hasAlerts = matchedAlerts.length > 0;
        const cls = hasTasks && hasAlerts ? 'RESPONDING'
                  : hasTasks             ? 'TASKED'
                  : hasAlerts            ? 'ALERTED'
                  :                       'UNTRACKED';

        return { ev, cls, matchedTasks, matchedAlerts };
      });

      setRows(built);
      const c = {
        events: built.length, tasks: tasks.length, alerts: opsAlerts.length,
        responding:0, tasked:0, alerted:0, untracked:0,
      };
      built.forEach(r => { c[r.cls.toLowerCase()]++; });
      setCounts(c);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:ltorca-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ltorca-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: buildLtorcaScript() }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = (r.ev.label || r.ev.category || '').toLowerCase();
      if (!name.includes(s)) return false;
    }
    return true;
  });

  const CY = '#38BDF8';

  if (!open) {
    const hasUntracked = counts.untracked > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Task × Ops Alert Operational Threat Response"
        style={{
          position:'fixed', bottom:8, left:97640, zIndex:185,
          background:'rgba(5,8,13,0.82)', border:`1px solid ${CY}55`,
          color: hasUntracked ? '#EF4444' : CY, padding:'3px 10px', borderRadius:6,
          fontFamily:"'JetBrains Mono',monospace", fontSize:11, cursor:'pointer',
          letterSpacing:1,
          boxShadow: hasUntracked ? '0 0 10px #EF444466' : 'none',
          animation: hasUntracked ? 'ltorcaPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        ◈ LTORCA{counts.untracked > 0 ? ` ●${counts.untracked}` : ''}
        <style>{`@keyframes ltorcaPulse{0%,100%{box-shadow:0 0 6px #EF444444}50%{box-shadow:0 0 18px #EF4444cc}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9100,
      background:'rgba(4,6,10,0.92)', backdropFilter:'blur(8px)',
      fontFamily:"'JetBrains Mono',monospace", color:'#DCEBF5',
      display:'flex', flexDirection:'column', overflow:'hidden',
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px',
        borderBottom:`1px solid ${CY}33`, flexShrink:0 }}>
        <span style={{ color:CY, fontSize:13, letterSpacing:2, fontWeight:700 }}>◈ LTORCA</span>
        <span style={{ color:'#6E8AA0', fontSize:11 }}>Live Intel × Task × Ops Alert — Operational Threat Response</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={fetchData} disabled={loading}
            style={{ background:'transparent', border:`1px solid ${CY}55`, color:CY,
              padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11 }}>
            {loading ? '…' : '↻'}
          </button>
          <button onClick={assess} disabled={assessing}
            style={{ background:'transparent', border:`1px solid #22C55E55`, color:'#22C55E',
              padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11 }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background:'transparent', border:`1px solid #ffffff33`, color:'#8899AA',
              padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:10, padding:'12px 20px', flexShrink:0, flexWrap:'wrap' }}>
        {[
          ['EVENTS',      counts.events,      CY],
          ['TASKS',       counts.tasks,       '#38BDF8'],
          ['ALERTS',      counts.alerts,      '#F59E0B'],
          ['RESPONDING',  counts.responding,  '#22C55E'],
          ['TASKED',      counts.tasked,      '#38BDF8'],
          ['ALERTED',     counts.alerted,     '#F59E0B'],
          ['UNTRACKED',   counts.untracked,   '#EF4444'],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background:'rgba(14,22,34,0.7)', border:`1px solid ${col}33`,
            borderRadius:8, padding:'8px 14px', minWidth:90, textAlign:'center',
          }}>
            <div style={{ color:col, fontSize:18, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#6E8AA0', fontSize:9, letterSpacing:1, marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin:'0 20px 10px', padding:'10px 14px',
          background:'rgba(14,22,34,0.7)', border:`1px solid #22C55E33`,
          borderRadius:8, fontSize:12, color:'#DCEBF5', lineHeight:1.6, flexShrink:0 }}>
          {assessment}
        </div>
      )}

      {/* filter */}
      <div style={{ display:'flex', gap:6, padding:'0 20px 10px', flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? `${CLS_COLOR[t] || CY}22` : 'transparent',
            border:`1px solid ${tab===t ? (CLS_COLOR[t] || CY) : '#2A3A4A'}`,
            color: tab===t ? (CLS_COLOR[t] || CY) : '#6E8AA0',
            padding:'3px 10px', borderRadius:5, cursor:'pointer', fontSize:11,
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search live events…"
          style={{ marginLeft:'auto', background:'rgba(14,22,34,0.7)',
            border:`1px solid ${CY}33`, color:CY, padding:'4px 10px',
            borderRadius:5, fontSize:11, width:200, outline:'none' }} />
      </div>

      {/* rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px 20px' }}>
        {error && <div style={{ color:'#EF4444', fontSize:12, padding:'8px 0' }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#6E8AA0', fontSize:12, padding:'8px 0' }}>No live events match the current filter.</div>
        )}
        {visible.map((r, i) => {
          const id    = r.ev.id || i;
          const label = r.ev.label || r.ev.category || `Event ${id}`;
          const detail = r.ev.detail || '';
          const isExp = !!expanded[id];
          const col   = CLS_COLOR[r.cls];
          const sevColor = r.ev.severity === 'high' ? '#EF4444' : r.ev.severity === 'medium' ? '#F59E0B' : '#6E8AA0';
          return (
            <div key={id} style={{
              marginBottom:6, background:'rgba(14,22,34,0.6)',
              border:`1px solid ${col}33`, borderRadius:8, overflow:'hidden',
            }}>
              <div onClick={() => setExpanded(p => ({ ...p, [id]: !p[id] }))}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', cursor:'pointer' }}>
                <span style={{ color:col, fontSize:10, fontWeight:700, letterSpacing:1,
                  background:`${col}18`, padding:'2px 8px', borderRadius:4 }}>{r.cls}</span>
                <span style={{ flex:1, fontSize:12, color:'#DCEBF5' }}>{label}</span>
                {detail && (
                  <span style={{ fontSize:10, color:'#6E8AA0', background:'rgba(30,42,54,0.8)',
                    padding:'2px 6px', borderRadius:4 }}>{detail}</span>
                )}
                <span style={{ fontSize:10, color:sevColor, background:`${sevColor}18`,
                  padding:'2px 6px', borderRadius:4 }}>{(r.ev.severity || 'low').toUpperCase()}</span>
                <span style={{ fontSize:11, color:CY,
                  marginLeft:8 }}>{r.matchedTasks.length}T / {r.matchedAlerts.length}A</span>
                <span style={{ color:'#6E8AA0', fontSize:12, marginLeft:6 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding:'0 12px 10px', borderTop:`1px solid ${col}22` }}>
                  {r.matchedTasks.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#38BDF8', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED TASKS</div>
                      {r.matchedTasks.map((t, j) => (
                        <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                          padding:'4px 8px', background:'rgba(56,189,248,0.06)',
                          borderRadius:5, marginBottom:3 }}>
                          <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>{t.title || t.name || `Task ${j+1}`}</span>
                          {(t.status || t.state) && (
                            <span style={{ fontSize:10, color:'#38BDF8', background:'rgba(56,189,248,0.15)',
                              padding:'1px 6px', borderRadius:3 }}>{t.status || t.state}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {r.matchedAlerts.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ color:'#F59E0B', fontSize:10, letterSpacing:1, marginBottom:4 }}>MATCHED OPS ALERTS</div>
                      {r.matchedAlerts.map((a, j) => {
                        const sev = a.severity || a.level || a.priority || null;
                        const sevCol = sev && ['critical','high','severe'].includes(String(sev).toLowerCase())
                          ? '#EF4444' : '#F59E0B';
                        return (
                          <div key={j} style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'4px 8px', background:'rgba(245,158,11,0.06)',
                            borderRadius:5, marginBottom:3 }}>
                            <span style={{ color:'#DCEBF5', fontSize:11, flex:1 }}>
                              {a.message || a.title || a.name || `Alert ${j+1}`}
                            </span>
                            {sev && (
                              <span style={{ fontSize:10, color:sevCol, background:`${sevCol}22`,
                                padding:'1px 6px', borderRadius:3 }}>{sev}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {r.matchedTasks.length === 0 && r.matchedAlerts.length === 0 && (
                    <div style={{ color:'#6E8AA0', fontSize:11, padding:'6px 0' }}>No matched tasks or ops alerts — untracked live threat event.</div>
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
