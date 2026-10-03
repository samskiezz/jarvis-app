/**
 * F277 — IntelProfile × Task × Investigation Mesh (ITIM)
 *
 * Answers: "For each intel profile, is there an active task AND an open
 * investigation? FULLY_TRACKED (both), TASK_ONLY, INV_ONLY, or DARK (neither)?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/IntelProfile  → intel profiles
 *   GET /entities/Task          → active tasks
 *   GET /v1/investigations      → open investigation cases
 *
 * Classification:
 *   FULLY_TRACKED — profile has BOTH a matched task AND a matched investigation
 *   TASK_ONLY     — task matched, no investigation
 *   INV_ONLY      — investigation matched, no task
 *   DARK          — neither (no task, no case — highest intelligence gap)
 *
 * Stat tiles:  profiles / tasks / cases / dark
 * Amber badge: dark count on button
 * Expand row:  matched tasks + matched investigations with relevance bars
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ ITIM  at left:6360 bottom:18, zIndex:68
 * Event:   jarvis:itim-toggle
 * Voice:   "intel task investigation / itim / dark intel / untracked intel /
 *           intel without task / intel without case / intel mesh /
 *           intel profile coverage / which intel profiles are tracked"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B'; // amber — dark badge
const CY   = '#06B6D4'; // cyan — task
const RO   = '#A78BFA'; // rose/violet — investigation
const GR   = '#10B981'; // green — fully tracked
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS    = ['ALL', 'FULLY_TRACKED', 'TASK_ONLY', 'INV_ONLY', 'DARK'];
const CLASS_COLOR = {
  FULLY_TRACKED : GR,
  TASK_ONLY     : CY,
  INV_ONLY      : RO,
  DARK          : AM,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const ITIM_RE =
  /\b(intel[._-]?task[._-]?invest(?:igation)?|intel[._-]?(?:task|invest(?:igation)?)[._-]?mesh|itim|dark[._-]?intel(?:[._-]?profiles?)?|untracked[._-]?intel|intel[._-]?without[._-]?(?:task|case)|which[._-]?intel[._-]?profiles?[._-]?are[._-]?tracked|intel[._-]?mesh|intel[._-]?profile[._-]?coverage)\b/i;

export function isItimQuery(t) {
  return ITIM_RE.test(t || '');
}

export async function buildItimScript() {
  const [ipR, tkR, ivR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const profiles = normProfiles(ipR.status === 'fulfilled' ? ipR.value : []);
  const tasks    = normTasks(tkR.status   === 'fulfilled' ? tkR.value : []);
  const invs     = normInvs(ivR.status    === 'fulfilled' ? ivR.value : []);
  const enriched = enrich(profiles, tasks, invs);
  const dark     = enriched.filter(r => r._class === 'DARK').length;
  const full     = enriched.filter(r => r._class === 'FULLY_TRACKED').length;
  return (
    `IntelProfile × Task × Investigation Mesh: ${profiles.length} intel profiles, ` +
    `${tasks.length} tasks, ${invs.length} investigations. ` +
    `${full} profiles are fully tracked (task + investigation match); ` +
    `${dark} are DARK (no task, no open case — intelligence gap). ` +
    `Dark profiles: ${enriched.filter(r => r._class === 'DARK').slice(0, 3)
      .map(r => r.name || r.title || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────
function normProfiles(raw) {
  if (!raw) return [];
  for (const k of ['intel_profiles', 'profiles', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normTasks(raw) {
  if (!raw) return [];
  for (const k of ['tasks', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normInvs(raw) {
  if (!raw) return [];
  for (const k of ['investigations', 'cases', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── keyword scoring ─────────────────────────────────────────────────────────
function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,;|/\-_().[\]]+/)
    .filter(t => t.length > 2);
}

function overlap(aStr, bStr) {
  const a = new Set(tokens(aStr));
  const b = tokens(bStr);
  if (!a.size || !b.length) return 0;
  const hits = b.filter(t => a.has(t)).length;
  return hits / Math.max(a.size, b.length);
}

function profileText(p) {
  return [
    p.name, p.title, p.description, p.subject, p.aliases,
    p.role, p.organization, p.tags,
  ].join(' ');
}

function taskText(t) {
  return [t.name, t.title, t.description, t.status, t.priority, t.tags].join(' ');
}

function invText(iv) {
  return [
    iv.title, iv.name, iv.description, iv.subject,
    iv.notes, iv.type, iv.tags,
    (iv.annotations || []).map(a => [a.text, a.actor, a.target].join(' ')).join(' '),
    (iv.seeds || []).join(' '),
  ].join(' ');
}

function scoreTask(profile, task) {
  return overlap(profileText(profile), taskText(task));
}

function scoreInv(profile, inv) {
  return overlap(profileText(profile), invText(inv));
}

// ─── enrichment ──────────────────────────────────────────────────────────────
const MIN_SCORE = 0.05;

function enrich(profiles, tasks, invs) {
  return profiles.map(p => {
    const tkMatches = tasks
      .map(t => ({ task: t, score: scoreTask(p, t) }))
      .filter(m => m.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const ivMatches = invs
      .map(iv => ({ inv: iv, score: scoreInv(p, iv) }))
      .filter(m => m.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const hasTask = tkMatches.length > 0;
    const hasInv  = ivMatches.length > 0;

    const _class = hasTask && hasInv ? 'FULLY_TRACKED'
      : hasTask                      ? 'TASK_ONLY'
      : hasInv                       ? 'INV_ONLY'
      :                                'DARK';

    return { ...p, _class, _tkMatches: tkMatches, _ivMatches: ivMatches };
  }).sort((a, b) => {
    const order = { DARK: 0, INV_ONLY: 1, TASK_ONLY: 2, FULLY_TRACKED: 3 };
    return (order[a._class] ?? 4) - (order[b._class] ?? 4);
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export default function IntelProfileTaskInvestigationMesh() {
  const [open, setOpen]         = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [invs, setInvs]         = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [lastFetch, setLastFetch] = useState(0);

  const poll = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 88000) return;
    setLoading(true); setErr('');
    try {
      const [ipR, tkR, ivR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const p = normProfiles(ipR.status === 'fulfilled' ? ipR.value : []);
      const t = normTasks(tkR.status   === 'fulfilled' ? tkR.value : []);
      const v = normInvs(ivR.status    === 'fulfilled' ? ivR.value : []);
      setProfiles(p); setTasks(t); setInvs(v);
      setEnriched(enrich(p, t, v));
      setLastFetch(Date.now());
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [lastFetch]);

  useEffect(() => {
    const toggle = () => {
      setOpen(v => {
        const next = !v;
        if (next) poll(true);
        return next;
      });
    };
    window.addEventListener('jarvis:itim-toggle', toggle);
    return () => window.removeEventListener('jarvis:itim-toggle', toggle);
  }, [poll]);

  useEffect(() => {
    if (!open) return;
    poll(true);
    const id = setInterval(() => poll(false), 90000);
    return () => clearInterval(id);
  }, [open, poll]);

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const dark = enriched.filter(r => r._class === 'DARK').length;
      const full = enriched.filter(r => r._class === 'FULLY_TRACKED').length;
      const ctx = [
        `IntelProfile × Task × Investigation Mesh: ${profiles.length} profiles, ${tasks.length} tasks, ${invs.length} investigations.`,
        `Fully tracked: ${full}, task-only: ${enriched.filter(r => r._class === 'TASK_ONLY').length}, inv-only: ${enriched.filter(r => r._class === 'INV_ONLY').length}, dark (neither): ${dark}.`,
        `Dark profiles (no task, no case): ${enriched.filter(r => r._class === 'DARK').slice(0, 5).map(r => r.name || r.title || '?').join('; ') || 'none'}.`,
      ].join(' ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `JARVIS, assess this intel profile coverage: ${ctx} Give a 2-sentence intelligence gap assessment.`,
        }),
      }).then(r => r.json());
      const txt = r?.response || r?.message || r?.content || r?.text || '';
      setAssessText(txt);
      if (txt) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } catch (e) {
      setAssessText(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const dark    = enriched.filter(r => r._class === 'DARK').length;
  const full    = enriched.filter(r => r._class === 'FULLY_TRACKED').length;
  const tkOnly  = enriched.filter(r => r._class === 'TASK_ONLY').length;
  const ivOnly  = enriched.filter(r => r._class === 'INV_ONLY').length;

  const q = search.toLowerCase();
  const visible = enriched.filter(p => {
    if (filter !== 'ALL' && p._class !== filter) return false;
    if (!q) return true;
    const hay = [p.name, p.title, p.description, p.role, p.organization].join(' ').toLowerCase();
    return hay.includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); poll(true); }}
        title="IntelProfile × Task × Investigation Mesh (ITIM)"
        style={{
          position: 'fixed', left: 6360, bottom: 18, zIndex: 68,
          background: dark > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${dark > 0 ? AM : 'rgba(255,255,255,0.14)'}`,
          color: dark > 0 ? AM : '#94A3B8', borderRadius: 4,
          padding: '3px 8px', fontSize: 9, cursor: 'pointer',
          fontFamily: MONO, letterSpacing: 1,
          boxShadow: dark > 0 ? `0 0 8px ${AM}44` : 'none',
          animation: dark > 0 ? 'itim-pulse 2s infinite' : 'none',
        }}
      >
        <style>{`@keyframes itim-pulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>
        ◈ ITIM{dark > 0 ? ` [${dark}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 20, top: 60, width: 420, maxHeight: '82vh',
      background: BG, border: `1px solid ${BD}`, borderRadius: 8,
      zIndex: 9000, display: 'flex', flexDirection: 'column',
      fontFamily: MONO, boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: AM, fontSize: 11, letterSpacing: 1, flex: 1 }}>
          ◈ INTEL × TASK × INVESTIGATION
          {loading && <span style={{ color: MU, marginLeft: 8 }}>⟳</span>}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '10px 14px 4px' }}>
        {[
          { label: 'PROFILES', val: profiles.length, c: '#94A3B8' },
          { label: 'TASKS',    val: tasks.length,    c: CY },
          { label: 'CASES',    val: invs.length,     c: RO },
          { label: 'DARK',     val: dark,            c: AM },
        ].map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: t.c, fontWeight: 700 }}>{t.val}</div>
            <div style={{ fontSize: 7.5, color: MU, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {enriched.length > 0 && (
        <div style={{ padding: '4px 14px 8px' }}>
          <div style={{ height: 5, borderRadius: 3, display: 'flex', overflow: 'hidden', gap: 1 }}>
            {full   > 0 && <div style={{ flex: full,   background: GR }} title={`FULL: ${full}`}   />}
            {tkOnly > 0 && <div style={{ flex: tkOnly, background: CY }} title={`TASK_ONLY: ${tkOnly}`} />}
            {ivOnly > 0 && <div style={{ flex: ivOnly, background: RO }} title={`INV_ONLY: ${ivOnly}`}  />}
            {dark   > 0 && <div style={{ flex: dark,   background: AM }} title={`DARK: ${dark}`}   />}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 7.5, color: MU }}>
            <span style={{ color: GR }}>■ FULL {full}</span>
            <span style={{ color: CY }}>■ TASK {tkOnly}</span>
            <span style={{ color: RO }}>■ INV {ivOnly}</span>
            <span style={{ color: AM }}>■ DARK {dark}</span>
          </div>
        </div>
      )}

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${filter === f ? AM : 'rgba(255,255,255,0.1)'}`,
            color: filter === f ? AM : MU, borderRadius: 3,
            padding: '2px 7px', fontSize: 8, cursor: 'pointer', letterSpacing: 0.5,
          }}>
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          placeholder="Search intel profiles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`,
            color: '#E2E8F0', borderRadius: 4, padding: '4px 8px', fontSize: 10,
            boxSizing: 'border-box', outline: 'none', fontFamily: MONO,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {err && <div style={{ color: AM, fontSize: 10, marginBottom: 8 }}>{err}</div>}
        {visible.length === 0 && !loading && (
          <div style={{ color: MU, fontSize: 10, textAlign: 'center', paddingTop: 20 }}>No intel profiles match.</div>
        )}
        {visible.map((profile, i) => {
          const id  = profile.id || profile._id || i;
          const isExp = expanded[id];
          const cc  = CLASS_COLOR[profile._class] || MU;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '7px 10px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  borderLeft: `3px solid ${cc}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {profile.name || profile.title || `Profile ${id}`}
                  </div>
                  {(profile.role || profile.organization) && (
                    <div style={{ fontSize: 8.5, color: MU, marginTop: 1 }}>
                      {profile.role         && <span style={{ marginRight: 6 }}>{profile.role}</span>}
                      {profile.organization && <span style={{ color: CY, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{profile.organization}</span>}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 8, color: cc, background: `${cc}22`, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                  {profile._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: MU, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 5px 5px', padding: '8px 10px', borderLeft: `3px solid ${cc}` }}>
                  {/* task matches */}
                  <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                    TASKS ({profile._tkMatches.length})
                  </div>
                  {profile._tkMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU, marginBottom: 6 }}>No tasks matched.</div>
                    : profile._tkMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.task.name || m.task.title || '(untitled)'}
                            {m.task.status   && <span style={{ color: MU, marginLeft: 4, fontSize: 7.5 }}>[{m.task.status}]</span>}
                            {m.task.priority && <span style={{ color: CY, marginLeft: 4, fontSize: 7.5 }}>{m.task.priority}</span>}
                          </span>
                          <span style={{ color: CY }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }

                  {/* investigation matches */}
                  <div style={{ fontSize: 8, color: RO, letterSpacing: 1, marginBottom: 4, marginTop: 8 }}>
                    INVESTIGATIONS ({profile._ivMatches.length})
                  </div>
                  {profile._ivMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU }}>No investigations matched.</div>
                    : profile._ivMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.inv.title || m.inv.name || '(untitled)'}
                            {m.inv.type && <span style={{ color: RO, marginLeft: 4, fontSize: 7.5 }}>[{m.inv.type}]</span>}
                          </span>
                          <span style={{ color: RO }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: RO, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess */}
      <div style={{ padding: '8px 14px', borderTop: `1px solid rgba(245,158,11,0.2)` }}>
        <button onClick={assess} disabled={assessing}
          style={{
            background: assessing ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.18)',
            border: `1px solid ${AM}`, color: AM, borderRadius: 4, padding: '4px 12px',
            fontSize: 10, cursor: 'pointer', letterSpacing: 1, width: '100%',
          }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <div style={{ fontSize: 9.5, color: '#CBD5E1', marginTop: 8, lineHeight: 1.5, background: 'rgba(245,158,11,0.05)', borderRadius: 4, padding: '6px 8px' }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}
