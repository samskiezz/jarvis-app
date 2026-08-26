/**
 * F285 — Risk Signal × Contact × Task Grand Convergence (RCTG)
 *
 * Answers: "For each active risk signal, is there a contact who could own
 * it AND a task that's actioning it — or is it completely unmanaged?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/RiskSignal  → active risk signals
 *   GET /entities/Contact     → contact directory
 *   GET /entities/Task        → task backlog
 *
 * Classification per risk signal:
 *   FULLY_MANAGED  — ≥1 contact match AND ≥1 task match
 *   TASK_ONLY      — task match but no contact
 *   CONTACT_ONLY   — contact match but no task
 *   UNMANAGED      — no contact, no task — highest operational risk
 *
 * Stat tiles:  signals / contacts / tasks / unmanaged
 * Red badge:   UNMANAGED count on button (red pulse when > 0)
 * Expand row:  matched contacts (max 4) + matched tasks (max 4) with relevance bars
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ RCTG  at left:6840, bottom:18, zIndex:68
 * Event:   jarvis:rctg-toggle
 * Voice:   "risk contact task / rctg / unmanaged risks /
 *           risk grand convergence / who owns the risk / risk owner task /
 *           risk task contact / risk without owner / risk without task"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const RD   = '#EF4444';
const CY   = '#06B6D4';
const GR   = '#10B981';
const AM   = '#F59E0B';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GR, INFO: MU };

const FILTERS = ['ALL', 'FULLY_MANAGED', 'TASK_ONLY', 'CONTACT_ONLY', 'UNMANAGED'];
const CLASS_COLOR = {
  FULLY_MANAGED: GR,
  TASK_ONLY:     CY,
  CONTACT_ONLY:  AM,
  UNMANAGED:     RD,
};
const CLASS_LABEL = {
  FULLY_MANAGED: 'FULL',
  TASK_ONLY:     'TASK',
  CONTACT_ONLY:  'CNTCT',
  UNMANAGED:     'UNMGD',
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const RCTG_RE =
  /\b(risk[._-]?contact[._-]?task|rctg|unmanaged[._-]?risk|risk[._-]?grand[._-]?convergence|who[._-]?owns[._-]?the[._-]?risk|risk[._-]?owner[._-]?task|risk[._-]?task[._-]?contact|risk[._-]?without[._-]?owner|risk[._-]?without[._-]?task)\b/i;

export function isRctgQuery(t) {
  return RCTG_RE.test(t || '');
}

export async function buildRctgScript() {
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [sigRaw, cntRaw, tskRaw] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Contact`,    { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Task`,       { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const signals   = normSignals(sigRaw);
    const contacts  = normContacts(cntRaw);
    const tasks     = normTasks(tskRaw);
    const classified = classify(signals, contacts, tasks);
    const unmanaged = classified.filter(s => s.classification === 'UNMANAGED').length;
    const full      = classified.filter(s => s.classification === 'FULLY_MANAGED').length;
    const critical  = classified.filter(s => s.severity === 'CRITICAL').length;
    return `Risk Signal × Contact × Task Grand Convergence: ${signals.length} active risk signals assessed against ${contacts.length} contacts and ${tasks.length} tasks. ${full} signals are FULLY_MANAGED with both a contact owner and an actioning task; ${unmanaged} signals are UNMANAGED (no owner, no task) including ${Math.min(unmanaged, critical)} critical-severity signals — these represent the highest-priority operational exposure requiring immediate assignment.`;
  } catch {
    return 'Risk Signal × Contact × Task convergence data temporarily unavailable.';
  }
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normSignals(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.data ?? raw?.results ?? raw?.signals ?? []);
  return arr.slice(0, 80).map(s => ({
    id:       s.id ?? s.signal_id ?? String(Math.random()),
    name:     s.title ?? s.name ?? s.id ?? '—',
    severity: (s.severity ?? s.level ?? 'MEDIUM').toUpperCase(),
    desc:     s.description ?? s.summary ?? '',
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags ?? ''),
    tokens:   tokenize([s.title, s.name, s.description, s.category, s.source, s.tags].join(' ')),
  }));
}

function normContacts(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.contacts ?? raw?.items ?? raw?.data ?? raw?.results ?? []);
  return arr.slice(0, 120).map(c => ({
    id:    c.id ?? c.contact_id ?? String(Math.random()),
    name:  c.name ?? c.full_name ?? c.display_name ?? c.email ?? '—',
    role:  c.role ?? c.title ?? c.position ?? '',
    org:   c.organization ?? c.company ?? '',
    tokens: tokenize([c.name, c.full_name, c.email, c.role, c.title, c.organization, c.tags].join(' ')),
  }));
}

function normTasks(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.tasks ?? raw?.items ?? raw?.data ?? raw?.results ?? []);
  return arr.slice(0, 120).map(t => ({
    id:       t.id ?? t.task_id ?? String(Math.random()),
    name:     t.name ?? t.title ?? t.id ?? '—',
    status:   t.status ?? t.state ?? '—',
    priority: t.priority ?? t.urgency ?? '',
    tokens:   tokenize([t.name, t.title, t.description, t.priority, t.tags].join(' ')),
  }));
}

function tokenize(s) {
  return (s || '').toLowerCase().split(/[\s,._\-/\\]+/).filter(t => t.length > 2);
}

function matchItems(signal, catalog) {
  const matched = [];
  for (const item of catalog) {
    const overlap = item.tokens.filter(t => signal.tokens.includes(t));
    if (overlap.length > 0) {
      matched.push({ ...item, score: Math.min(1, overlap.length / Math.max(1, item.tokens.length)) });
    }
  }
  return matched.sort((a, b) => b.score - a.score).slice(0, 4);
}

function classify(signals, contacts, tasks) {
  return signals.map(sig => {
    const mContacts = matchItems(sig, contacts);
    const mTasks    = matchItems(sig, tasks);
    const hasCnt    = mContacts.length > 0;
    const hasTsk    = mTasks.length > 0;
    const cls = hasCnt && hasTsk ? 'FULLY_MANAGED'
              : hasTsk            ? 'TASK_ONLY'
              : hasCnt            ? 'CONTACT_ONLY'
              :                     'UNMANAGED';
    return { ...sig, classification: cls, matchedContacts: mContacts, matchedTasks: mTasks };
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export default function RiskContactTaskConvergence() {
  const [open,      setOpen]      = useState(false);
  const [signals,   setSignals]   = useState([]);
  const [contacts,  setContacts]  = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState('');
  const timerRef = useRef(null);

  const classified   = classify(signals, contacts, tasks);
  const unmanagedCnt = classified.filter(s => s.classification === 'UNMANAGED').length;

  const load = useCallback(async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [sr, cr, tr] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`,    { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Task`,       { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      setSignals(normSignals(sr));
      setContacts(normContacts(cr));
      setTasks(normTasks(tr));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rctg-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rctg-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
    try {
      const c        = classify(signals, contacts, tasks);
      const unmanaged = c.filter(s => s.classification === 'UNMANAGED').length;
      const full      = c.filter(s => s.classification === 'FULLY_MANAGED').length;
      const critical  = c.filter(s => s.severity === 'CRITICAL' && s.classification === 'UNMANAGED').length;
      const prompt = `JARVIS: We have ${signals.length} active risk signals. ${full} are FULLY_MANAGED with both contact owner and actioning task; ${unmanaged} are UNMANAGED (no owner, no task) — ${critical} of these are CRITICAL severity. Provide a 2-sentence operational convergence assessment with recommended immediate action.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const txt = d.response ?? d.message ?? d.content ?? JSON.stringify(d);
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) { setBrief(`Assessment error: ${e.message}`); }
    setAssessing(false);
  }, [signals, contacts, tasks]);

  if (!open) {
    const pulse = unmanagedCnt > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 6840, bottom: 18, zIndex: 68,
          background: pulse ? 'rgba(239,68,68,0.15)' : 'rgba(10,12,20,0.85)',
          border: `1px solid ${pulse ? RD : BD}`,
          color: pulse ? RD : MU,
          fontFamily: MONO, fontSize: 11, padding: '4px 10px',
          borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
          whiteSpace: 'nowrap',
          animation: pulse ? 'rctgPulse 2s ease-in-out infinite' : 'none',
        }}
        title="Risk Signal × Contact × Task Grand Convergence (RCTG)"
      >
        ◈ RCTG{unmanagedCnt > 0 ? ` ${unmanagedCnt}` : ''}
        <style>{`@keyframes rctgPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}`}</style>
      </button>
    );
  }

  const filtered = classified
    .filter(s => filter === 'ALL' || s.classification === filter)
    .filter(s => !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.severity.toLowerCase().includes(search.toLowerCase()));

  const counts = {
    total:          classified.length,
    fully_managed:  classified.filter(s => s.classification === 'FULLY_MANAGED').length,
    task_only:      classified.filter(s => s.classification === 'TASK_ONLY').length,
    contact_only:   classified.filter(s => s.classification === 'CONTACT_ONLY').length,
    unmanaged:      unmanagedCnt,
  };

  return (
    <div style={{
      position: 'fixed', top: 60, right: 20, width: 560, maxHeight: 'calc(100vh - 80px)',
      background: BG, border: `1px solid ${BD}`, borderRadius: 8,
      zIndex: 68, overflowY: 'auto', fontFamily: MONO,
    }}>
      {/* header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: RD, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ RISK × CONTACT × TASK CONVERGENCE
        </span>
        {loading && <span style={{ color: MU, fontSize: 10 }}>POLLING…</span>}
        <button onClick={assess} disabled={assessing} style={{
          background: 'none', border: `1px solid ${CY}`, color: CY,
          fontFamily: MONO, fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
        }}>▶ ASSESS</button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: MU, fontSize: 14, cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '10px 16px' }}>
        {[
          ['SIGNALS',   counts.total,          '#94A3B8'],
          ['FULL',      counts.fully_managed,  GR],
          ['CONTACTS',  contacts.length,        AM],
          ['UNMANAGED', counts.unmanaged,       RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`,
            borderRadius: 4, padding: '6px 8px', textAlign: 'center',
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {counts.total > 0 && (
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
            {[
              [counts.fully_managed, GR],
              [counts.task_only,     CY],
              [counts.contact_only,  AM],
              [counts.unmanaged,     RD],
            ].map(([n, col], i) => (
              <div key={i} style={{ flex: n, background: col, opacity: 0.85 }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {[['FULL', GR, counts.fully_managed], ['TASK', CY, counts.task_only], ['CNTCT', AM, counts.contact_only], ['UNMGD', RD, counts.unmanaged]].map(([l, c, n]) => (
              <span key={l} style={{ color: c, fontSize: 9 }}>{l}:{n}</span>
            ))}
          </div>
        </div>
      )}

      {/* brief */}
      {brief && (
        <div style={{ margin: '0 16px 8px', padding: '8px 10px', background: 'rgba(6,182,212,0.08)', border: `1px solid ${CY}`, borderRadius: 4, color: CY, fontSize: 11 }}>
          {brief}
        </div>
      )}

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 8px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(239,68,68,0.18)' : 'none',
            border: `1px solid ${filter === f ? RD : BD}`,
            color: filter === f ? RD : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
          }}>{f === 'FULLY_MANAGED' ? 'FULL' : f === 'TASK_ONLY' ? 'TASK' : f === 'CONTACT_ONLY' ? 'CNTCT' : f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            flex: 1, minWidth: 80,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`,
            color: '#e2e8f0', fontFamily: MONO, fontSize: 10, padding: '2px 6px', borderRadius: 3, outline: 'none',
          }}
        />
      </div>

      {/* rows */}
      <div style={{ padding: '0 16px 16px' }}>
        {filtered.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', padding: 20 }}>
            {loading ? 'Loading…' : 'No signals match.'}
          </div>
        )}
        {filtered.map(sig => (
          <div key={sig.id} style={{
            marginBottom: 6, background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${expanded === sig.id ? RD : BD}`,
            borderRadius: 4, overflow: 'hidden',
          }}>
            <div
              onClick={() => setExpanded(expanded === sig.id ? null : sig.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}
            >
              <span style={{
                background: `${CLASS_COLOR[sig.classification]}22`,
                border: `1px solid ${CLASS_COLOR[sig.classification]}`,
                color: CLASS_COLOR[sig.classification],
                fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700, minWidth: 38, textAlign: 'center',
              }}>{CLASS_LABEL[sig.classification]}</span>
              <span style={{
                background: `${SEV_COLOR[sig.severity] ?? MU}22`,
                border: `1px solid ${SEV_COLOR[sig.severity] ?? MU}`,
                color: SEV_COLOR[sig.severity] ?? MU,
                fontSize: 9, padding: '1px 4px', borderRadius: 2, fontWeight: 600,
              }}>{sig.severity}</span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sig.name}
              </span>
              <span style={{ color: MU, fontSize: 10 }}>
                {sig.matchedContacts.length}C {sig.matchedTasks.length}T
              </span>
            </div>

            {expanded === sig.id && (
              <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${BD}` }}>
                {sig.matchedContacts.length > 0 && (
                  <>
                    <div style={{ color: AM, fontSize: 9, marginTop: 8, marginBottom: 4 }}>MATCHED CONTACTS</div>
                    {sig.matchedContacts.map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: AM, fontSize: 9, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                        {c.role && <span style={{ color: MU, fontSize: 8 }}>{c.role}</span>}
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${(c.score * 100).toFixed(0)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                        </div>
                        <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{(c.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </>
                )}
                {sig.matchedTasks.length > 0 && (
                  <>
                    <div style={{ color: CY, fontSize: 9, marginTop: 8, marginBottom: 4 }}>MATCHED TASKS</div>
                    {sig.matchedTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: CY, fontSize: 9, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </span>
                        {t.priority && <span style={{ color: MU, fontSize: 8 }}>{t.priority}</span>}
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${(t.score * 100).toFixed(0)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                        </div>
                        <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{(t.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </>
                )}
                {sig.matchedContacts.length === 0 && sig.matchedTasks.length === 0 && (
                  <div style={{ color: RD, fontSize: 10, marginTop: 8 }}>No contact owner or actioning task found — signal is UNMANAGED.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
