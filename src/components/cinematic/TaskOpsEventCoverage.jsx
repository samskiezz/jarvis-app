import { useState, useEffect, useCallback } from 'react';

const API = '';
const TKOPS_RE = /\b(task[._-]?ops(?:eration)?s?|ops?[._-]?task|tkops|responding[._-]?tasks?|task[._-]?ops?[._-]?coverage|ops?[._-]?event[._-]?tasks?|unresponsive[._-]?ops?)\b/i;

export function isTkopsQuery(t) {
  return TKOPS_RE.test(t || '');
}

export async function buildTkopsScript() {
  const [taskR, opsR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const tasks = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const events = normaliseEvents(opsR.status === 'fulfilled' ? opsR.value : []);
  const enriched = correlate(tasks, events);
  const responding = enriched.filter(t => t._linked).length;
  const uncovered = events.filter(ev => !enriched.some(t => t._linked && t._matches.some(m => m.ev === ev))).length;
  return (
    `Task × Ops Event Coverage: ${tasks.length} active tasks, ${events.length} live ops events. ` +
    `${responding} tasks are RESPONDING (ops event alignment found); ${tasks.length - responding} are UNRESPONSIVE. ` +
    `Approx ${uncovered} ops events have no task coverage — immediate attention recommended.`
  );
}

function normaliseTasks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['tasks', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseEvents(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['events', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(task, ev) {
  const taskToks = new Set([
    ...tokens(task.name),
    ...tokens(task.title),
    ...tokens(task.description),
    ...tokens(task.mission),
    ...tokens(task.priority),
    ...tokens(task.tags),
    ...tokens(task.category),
    ...tokens(task.type),
  ].filter(Boolean));
  const evToks = [
    ...tokens(ev.name),
    ...tokens(ev.title),
    ...tokens(ev.description),
    ...tokens(ev.category),
    ...tokens(ev.type),
    ...tokens(ev.severity),
    ...tokens(ev.source),
  ].filter(Boolean);
  if (!taskToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (taskToks.has(t)) hits++;
  return hits / Math.max(taskToks.size, evToks.length);
}

function correlate(tasks, events) {
  return tasks.map(task => {
    const scored = events
      .map(ev => ({ ev, score: matchScore(task, ev) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...task, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const RD = '#EF4444';
const GR = '#22C55E';
const AM = '#F59E0B';
const OR = '#FB923C';

const SEV_COLORS = {
  critical: RD,
  high: OR,
  warning: AM,
  info: CY,
  low: GR,
};

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = AM) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function TaskOpsEventCoverage() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskR, opsR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      setTasks(normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []));
      setEvents(normaliseEvents(opsR.status === 'fulfilled' ? opsR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tkops-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tkops-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(tasks, events);
  const responding = enriched.filter(t => t._linked);
  const unresponsive = enriched.filter(t => !t._linked);
  const badgeCount = unresponsive.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(t => tab === 'ALL' || (tab === 'RESPONDING' ? t._linked : !t._linked))
    .filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(t.name || '').toLowerCase().includes(q) ||
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.description || '').toLowerCase().includes(q) ||
        String(t.type || '').toLowerCase().includes(q)
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
          message: `You have ${tasks.length} active tasks and ${events.length} live ops events. ` +
            `${responding.length} tasks are RESPONDING (aligned with at least one active ops event); ` +
            `${unresponsive.length} tasks are UNRESPONSIVE (no ops event alignment). ` +
            `Top responding tasks: ${responding.slice(0, 3).map(t => t.name || t.title || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence ops readiness brief highlighting the coverage gap and which unresponsive tasks need immediate ops alignment.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = t => t.name || t.title || t.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Task × Ops Event Coverage (TKOPS)"
        style={{
          position: 'fixed', left: 682400, bottom: 8, zIndex: 247,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ TKOPS
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
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${AM}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${AM}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AM}` }}>
              ◈ TASK × OPS EVENT COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${AM}55`,
                  background: 'transparent', color: AM, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
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
              { label: 'OPS EVENTS', val: events.length, col: OR },
              { label: 'RESPONDING', val: responding.length, col: GR },
              { label: 'UNRESPONSIVE', val: unresponsive.length, col: AM },
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
            {['ALL', 'RESPONDING', 'UNRESPONSIVE'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? AM : '#2a3a4a'}`,
                  background: tab === t ? `${AM}22` : 'transparent',
                  color: tab === t ? AM : '#6E8AA0',
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
              const isResp = task._linked;
              const statusColor = isResp ? GR : AM;
              const isExp = expanded === i;
              return (
                <div
                  key={task.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(task)}</span>
                    {task.status && chip(String(task.status).toUpperCase(), CY)}
                    {task.priority && chip(String(task.priority).toUpperCase(), isResp ? GR : '#6E8AA0')}
                    {chip(isResp ? 'RESPONDING' : 'UNRESPONSIVE', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {task._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING OPS EVENTS
                          </div>
                          {task._matches.map(({ ev, score }, j) => {
                            const sev = String(ev.severity || ev.level || '').toLowerCase();
                            const sevColor = SEV_COLORS[sev] || CY;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {sev && chip(sev.toUpperCase(), sevColor)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {ev.name || ev.title || ev.type || ev.id || '?'}
                                </span>
                                {scorebar(score, AM)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No ops event alignment detected for this task.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${AM}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(245,158,11,0.03)',
            }}>
              <span style={{ color: AM, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
