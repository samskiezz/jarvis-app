/**
 * F445 — Alert × Task × Investigation Grand Nexus (ATIN)
 *
 * Answers: "For each open alert, is there a task actioning it AND an
 * open investigation case covering it — or is it completely unmanaged?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/alerts?status=open&limit=100  → open alerts
 *   GET /entities/Task                    → task backlog
 *   GET /v1/investigations                → open investigation cases
 *
 * Classification per alert:
 *   FULLY_MANAGED  — ≥1 task match AND ≥1 investigation match
 *   TASK_ONLY      — task match but no investigation
 *   INV_ONLY       — investigation match but no task
 *   UNMANAGED      — no task, no investigation — highest operational risk
 *
 * Stat tiles:  alerts / tasks / investigations / unmanaged
 * Red badge:   UNMANAGED count on button (red pulse when > 0)
 * Expand row:  matched tasks (max 5) + matched investigations (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ ATIN  at left:7740, bottom:18, zIndex:68
 * Event:   jarvis:atin-toggle
 * Voice:   "alert task investigation / atin / managed alerts /
 *           unmanaged alerts / which alerts have tasks /
 *           alert without task / alert without case /
 *           alert triple / alert convergence"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const RD   = '#EF4444';
const CY   = '#06B6D4';
const GR   = '#10B981';
const AM   = '#F59E0B';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GR, INFO: MU };

const FILTERS = ['ALL', 'FULLY_MANAGED', 'TASK_ONLY', 'INV_ONLY', 'UNMANAGED'];
const CLASS_COLOR = {
  FULLY_MANAGED: GR,
  TASK_ONLY:     CY,
  INV_ONLY:      AM,
  UNMANAGED:     RD,
};
const CLASS_LABEL = {
  FULLY_MANAGED: 'FULL',
  TASK_ONLY:     'TASK',
  INV_ONLY:      'INV',
  UNMANAGED:     'NONE',
};

function tokens(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(s => s.length > 2);
}

function score(srcTokens, target) {
  const tgt = tokens(
    [target.name, target.title, target.description, target.subject,
     ...(target.tags || [])].join(' ')
  );
  if (!tgt.length) return 0;
  return srcTokens.filter(t => tgt.includes(t)).length / Math.max(srcTokens.length, 1);
}

function classify(alertToks, tasks, invs) {
  const matchedTasks = tasks
    .map(t => ({ ...t, _rel: score(alertToks, t) }))
    .filter(t => t._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const matchedInvs = invs
    .map(i => ({ ...i, _rel: score(alertToks, i) }))
    .filter(i => i._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const hasTasks = matchedTasks.length > 0;
  const hasInvs  = matchedInvs.length > 0;
  const cls =
    hasTasks && hasInvs ? 'FULLY_MANAGED' :
    hasTasks             ? 'TASK_ONLY' :
    hasInvs              ? 'INV_ONLY' :
                           'UNMANAGED';
  return { cls, matchedTasks, matchedInvs };
}

function hdr(obj) {
  return { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
}

async function fetchJson(url) {
  const r = await fetch(API + url, { headers: hdr() });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function Bar({ pct, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 2, height: 4, flex: 1 }}>
      <div style={{ width: `${Math.min(100, pct * 100)}%`, background: color, height: 4, borderRadius: 2, transition: 'width 0.4s' }} />
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 4, padding: '6px 10px', textAlign: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: 18, color: color || CY, fontWeight: 700 }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: MU, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

export default function AlertTaskInvestigationNexus() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [alertsRaw, tasksRaw, invsRaw] = await Promise.all([
        fetchJson('/v1/alerts?status=open&limit=100'),
        fetchJson('/entities/Task'),
        fetchJson('/v1/investigations'),
      ]);
      const alerts = (alertsRaw?.alerts || alertsRaw?.items || alertsRaw?.data || (Array.isArray(alertsRaw) ? alertsRaw : []));
      const tasks  = (tasksRaw?.items  || tasksRaw?.data  || (Array.isArray(tasksRaw)  ? tasksRaw  : []));
      const invs   = (invsRaw?.investigations || invsRaw?.items || invsRaw?.data || (Array.isArray(invsRaw) ? invsRaw : []));
      const classified = alerts.map(a => {
        const toks = tokens(
          [a.category, a.type, a.message, a.title, a.source, a.description, a.severity,
           ...(a.tags || [])].join(' ')
        );
        const { cls, matchedTasks, matchedInvs } = classify(toks, tasks, invs);
        return { ...a, _cls: cls, _tasks: matchedTasks, _invs: matchedInvs };
      });
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:atin-toggle', handler);
    return () => window.removeEventListener('jarvis:atin-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r._cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.category || r.type || r.message || r.title || '').toLowerCase().includes(q);
    }
    return true;
  });

  const unmanaged = rows.filter(r => r._cls === 'UNMANAGED').length;
  const fully     = rows.filter(r => r._cls === 'FULLY_MANAGED').length;
  const taskOnly  = rows.filter(r => r._cls === 'TASK_ONLY').length;
  const invOnly   = rows.filter(r => r._cls === 'INV_ONLY').length;

  async function assess() {
    setAssessing(true);
    try {
      const summary = `${rows.length} open alerts: ${fully} fully managed, ${taskOnly} task-only, ${invOnly} inv-only, ${unmanaged} unmanaged.`;
      const prompt  = `You are JARVIS. Given: ${summary}. Provide a 2-sentence operational alert management brief covering the biggest risk and recommended immediate action.`;
      const r = await fetch(API + '/v1/jarvis/agent/chat', {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || d?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      console.error('ATIN assess error', e);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 7740, bottom: 18, zIndex: 68,
          background: unmanaged > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(6,182,212,0.10)',
          border: `1px solid ${unmanaged > 0 ? RD : CY}`,
          borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
          fontFamily: MONO, fontSize: 10, color: unmanaged > 0 ? RD : CY,
          display: 'flex', alignItems: 'center', gap: 5,
          animation: unmanaged > 0 ? 'pulse 1.5s infinite' : 'none',
        }}
        title="Alert × Task × Investigation Nexus (ATIN)"
      >
        ◈ ATIN
        {unmanaged > 0 && (
          <span style={{ background: RD, color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {unmanaged}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 18, top: 60, width: 480, maxHeight: '85vh',
      background: BG, border: `1px solid ${CY}`, borderRadius: 8, zIndex: 9900,
      display: 'flex', flexDirection: 'column', fontFamily: MONO, overflow: 'hidden',
      boxShadow: `0 0 30px rgba(6,182,212,0.15)`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1, letterSpacing: 1 }}>
          ◈ ALERT × TASK × INVESTIGATION NEXUS
        </span>
        <button onClick={assess} disabled={assessing} style={{ background: 'rgba(6,182,212,0.15)', border: `1px solid ${CY}`, borderRadius: 3, color: CY, fontSize: 9, padding: '2px 8px', cursor: 'pointer' }}>
          {assessing ? '...' : '▶ ASSESS'}
        </button>
        <button onClick={load} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 12 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px' }}>
        <Tile label="ALERTS"     value={rows.length} />
        <Tile label="FULL"       value={fully}       color={GR} />
        <Tile label="TASK ONLY"  value={taskOnly}    color={CY} />
        <Tile label="INV ONLY"   value={invOnly}     color={AM} />
        <Tile label="UNMANAGED"  value={unmanaged}   color={unmanaged > 0 ? RD : MU} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(6,182,212,0.15)' : 'none',
            border: `1px solid ${filter === f ? CY : BD}`,
            borderRadius: 3, color: filter === f ? CY : MU,
            fontSize: 9, padding: '2px 7px', cursor: 'pointer',
          }}>{f}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 6px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, borderRadius: 3, color: '#cdd6f4', fontSize: 10, padding: '4px 8px', fontFamily: MONO, boxSizing: 'border-box' }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        {loading && <div style={{ color: MU, fontSize: 10, textAlign: 'center', padding: 20 }}>loading…</div>}
        {err    && <div style={{ color: RD, fontSize: 10, padding: 10 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: MU, fontSize: 10, textAlign: 'center', padding: 20 }}>no alerts match</div>
        )}
        {filtered.map((a, i) => {
          const id  = a.id || a._id || i;
          const exp = expanded[id];
          const clr = CLASS_COLOR[a._cls] || MU;
          const sev = a.severity || a.level || '';
          const sevClr = SEV_COLOR[sev?.toUpperCase()] || MU;
          const title = a.title || a.message || a.category || a.type || `Alert ${i + 1}`;
          return (
            <div key={id} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [id]: !p[id] }))}
                style={{
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${BD}`, borderRadius: 4,
                  padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 9, color: clr, fontWeight: 700, minWidth: 38 }}>
                  {CLASS_LABEL[a._cls]}
                </span>
                {sev && (
                  <span style={{ fontSize: 8, color: sevClr, border: `1px solid ${sevClr}`, borderRadius: 2, padding: '1px 4px' }}>
                    {sev.toUpperCase()}
                  </span>
                )}
                <span style={{ flex: 1, fontSize: 10, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
                <span style={{ fontSize: 9, color: MU }}>{exp ? '▲' : '▼'}</span>
              </div>

              {exp && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${BD}`, borderRadius: '0 0 4px 4px', padding: '8px 10px', marginTop: -1 }}>
                  {/* Matched tasks */}
                  {a._tasks.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>MATCHED TASKS ({a._tasks.length})</div>
                      {a._tasks.map((t, ti) => (
                        <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 8, color: t.status === 'DONE' ? GR : AM, border: `1px solid ${t.status === 'DONE' ? GR : AM}`, borderRadius: 2, padding: '1px 3px', minWidth: 30, textAlign: 'center' }}>
                            {(t.status || 'OPEN').slice(0, 6)}
                          </span>
                          <span style={{ flex: 1, fontSize: 9, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.name || t.title || `Task ${ti + 1}`}
                          </span>
                          <Bar pct={t._rel} color={CY} />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched investigations */}
                  {a._invs.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: AM, marginBottom: 4, letterSpacing: 1 }}>MATCHED INVESTIGATIONS ({a._invs.length})</div>
                      {a._invs.map((inv, ii) => (
                        <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 8, color: inv.status === 'open' ? GR : MU, border: `1px solid ${inv.status === 'open' ? GR : MU}`, borderRadius: 2, padding: '1px 3px', minWidth: 30, textAlign: 'center' }}>
                            {(inv.status || 'OPEN').slice(0, 6).toUpperCase()}
                          </span>
                          <span style={{ flex: 1, fontSize: 9, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {inv.title || inv.name || `Case ${ii + 1}`}
                          </span>
                          <Bar pct={inv._rel} color={AM} />
                        </div>
                      ))}
                    </div>
                  )}
                  {a._tasks.length === 0 && a._invs.length === 0 && (
                    <div style={{ fontSize: 9, color: RD }}>No correlated tasks or investigations found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
    </div>
  );
}

// ─── JarvisBrain intent helpers ───────────────────────────────────────────────
const ATIN_TRIGGERS = [
  'alert task investigation', 'atin', 'managed alerts', 'unmanaged alerts',
  'which alerts have tasks', 'alert without task', 'alert without case',
  'alert triple', 'alert convergence', 'alert management triple',
  'unmanaged alert', 'alert task case',
];

export function isAtinQuery(q) {
  const lq = (q || '').toLowerCase();
  return ATIN_TRIGGERS.some(t => lq.includes(t));
}

export async function buildAtinScript() {
  try {
    const [alertsRaw, tasksRaw, invsRaw] = await Promise.all([
      fetch('/v1/alerts?status=open&limit=100', { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      fetch('/entities/Task',                   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      fetch('/v1/investigations',               { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    ]);
    const alerts = alertsRaw?.alerts || alertsRaw?.items || alertsRaw?.data || (Array.isArray(alertsRaw) ? alertsRaw : []);
    const tasks  = tasksRaw?.items   || tasksRaw?.data   || (Array.isArray(tasksRaw)  ? tasksRaw  : []);
    const invs   = invsRaw?.investigations || invsRaw?.items || invsRaw?.data || (Array.isArray(invsRaw) ? invsRaw : []);
    let unmanaged = 0, fully = 0;
    alerts.forEach(a => {
      const toks = tokens([a.category, a.type, a.message, a.title, a.source, a.description, a.severity, ...(a.tags || [])].join(' '));
      const hasTasks = tasks.some(t => score(toks, t) > 0);
      const hasInvs  = invs.some(i => score(toks, i) > 0);
      if (hasTasks && hasInvs) fully++;
      else if (!hasTasks && !hasInvs) unmanaged++;
    });
    return `JARVIS: ${alerts.length} open alerts — ${fully} fully managed, ${unmanaged} unmanaged. Opening ATIN for detailed alert-task-investigation convergence view.`;
  } catch {
    return 'JARVIS: Opening Alert × Task × Investigation Nexus — ATIN panel loading.';
  }
}
