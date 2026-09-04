import { useState, useEffect, useCallback } from 'react';

const API = '';
const TACL_RE = /\b(task[._-]?alert|alert[._-]?task|tacl|tasks[._-]?with[._-]?alerts|exposed[._-]?tasks|tasks[._-]?under[._-]?alert|task[._-]?alert[._-]?corr|which[._-]?tasks[._-]?have[._-]?alerts|task[._-]?alert[._-]?coverage|tasks[._-]?affected[._-]?by[._-]?alerts)\b/i;

export function isTaskAlcQuery(t) {
  return TACL_RE.test(t || '');
}

export async function buildTaskAlcScript() {
  const [taskR, alR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/alerts`).then(r => r.json()),
  ]);
  const tasks = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const alerts = normaliseAlerts(alR.status === 'fulfilled' ? alR.value : []);
  const enriched = correlate(tasks, alerts);
  const exposed = enriched.filter(t => t._linked).length;
  const clear = enriched.length - exposed;
  return (
    `Task × Alert Correlator: ${tasks.length} tasks, ${alerts.length} alerts indexed. ` +
    `${exposed} tasks are EXPOSED (linked to active alerts); ${clear} are CLEAR. ` +
    `Top exposed: ${enriched.filter(t => t._linked).slice(0, 4).map(t => t.title || t.name || t.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseTasks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['tasks', 'items', 'results', 'data', 'entities', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseAlerts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['alerts', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(task, alert) {
  const tToks = new Set([
    ...tokens(task.title),
    ...tokens(task.name),
    ...tokens(task.description),
    ...tokens(task.type),
    ...tokens(task.status),
    ...tokens(task.assignee),
    ...tokens(task.category),
  ].filter(Boolean));
  const aToks = [
    ...tokens(alert.type),
    ...tokens(alert.category),
    ...tokens(alert.message),
    ...tokens(alert.title),
    ...tokens(alert.description),
    ...tokens(alert.source),
    ...tokens(alert.severity),
  ].filter(Boolean);
  if (!tToks.size || !aToks.length) return 0;
  let hits = 0;
  for (const t of aToks) if (tToks.has(t)) hits++;
  return hits / Math.max(tToks.size, aToks.length);
}

function correlate(tasks, alerts) {
  return tasks.map(task => {
    const scored = alerts
      .map(alert => ({ alert, score: matchScore(task, alert) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...task, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const VI = '#A78BFA';

function sevColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return RD;
  if (s === 'high') return '#F97316';
  if (s === 'medium' || s === 'warn' || s === 'warning') return AM;
  return '#60A5FA';
}

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function TaskAlertCorrelator() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskR, alR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/alerts`).then(r => r.json()),
      ]);
      setTasks(normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []));
      setAlerts(normaliseAlerts(alR.status === 'fulfilled' ? alR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tacl-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tacl-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(tasks, alerts);
  const exposed = enriched.filter(t => t._linked);
  const clear = enriched.filter(t => !t._linked);
  const badgeCount = exposed.length;
  const badgeColor = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(t => tab === 'ALL' || (tab === 'EXPOSED' ? t._linked : !t._linked))
    .filter(t => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(t.title || '').toLowerCase().includes(s) ||
        String(t.name || '').toLowerCase().includes(s) ||
        String(t.type || '').toLowerCase().includes(s) ||
        String(t.assignee || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${tasks.length} tasks and ${alerts.length} alerts. ${exposed.length} tasks are EXPOSED (linked to active alerts); ${clear.length} are CLEAR. Give a 2-sentence task-alert brief highlighting which tasks are most at risk from active alerts and what operational impact this represents.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = t => t.title || t.name || t.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Task × Alert Correlator (TACL)"
        style={{
          position: 'fixed', left: 807280, bottom: 8, zIndex: 271,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ TACL
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ TASK × ALERT CORRELATOR
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'TASKS', val: tasks.length, col: CY },
              { label: 'ALERTS', val: alerts.length, col: VI },
              { label: 'EXPOSED', val: exposed.length, col: RD },
              { label: 'CLEAR', val: clear.length, col: GR },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'EXPOSED', 'CLEAR'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}22` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No tasks found.'}
              </div>
            ) : filtered.map((task, i) => {
              const isExposed = task._linked;
              const statusColor = isExposed ? RD : GR;
              const isExp = expanded === i;
              return (
                <div
                  key={task.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}${isExposed ? ', 0 0 12px ' + statusColor : ''}`,
                      flexShrink: 0, animation: isExposed ? 'pulse 1.5s infinite' : 'none',
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(task)}</span>
                    {task.status && chip(task.status, '#6E8AA0')}
                    {task.type && chip(task.type, VI)}
                    {chip(isExposed ? 'EXPOSED' : 'CLEAR', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {task._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED ALERTS
                          </div>
                          {task._matches.map(({ alert, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {alert.severity && (
                                <span style={{
                                  padding: '0 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                  background: `${sevColor(alert.severity)}22`, color: sevColor(alert.severity),
                                  border: `1px solid ${sevColor(alert.severity)}44`,
                                }}>{String(alert.severity).toUpperCase()}</span>
                              )}
                              {alert.category && chip(alert.category, CY)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {alert.title || alert.message || alert.type || alert.id || '?'}
                              </span>
                              {scorebar(score, RD)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No alerts matched this task — clear.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
