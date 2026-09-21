/**
 * F268 — SwarmJob × Scenario × Contact Triple (SSCT)
 *
 * Answers: "For each swarm job, is there a scenario plan AND a contact owner?
 * FULL_COVERAGE (both), SCENARIO_ONLY, CONTACT_ONLY, or DARK (neither)?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob  → live swarm jobs
 *   GET /v1/scenario/list   → scenario response plans
 *   GET /entities/Contact   → contact directory
 *
 * Classification:
 *   FULL_COVERAGE  — swarm job has BOTH a scenario plan AND a contact
 *   SCENARIO_ONLY  — scenario matched, no contact
 *   CONTACT_ONLY   — contact matched, no scenario
 *   DARK           — neither (unplanned + unowned)
 *
 * Stat tiles:  jobs / scenarios / contacts / dark
 * Red badge:   dark count on button (unowned + unplanned swarm jobs are highest risk).
 * Expand row:  matched scenarios + matched contacts with relevance bars.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SSCT  at left:5820 bottom:18, zIndex:68.
 * Event:   jarvis:ssct-toggle
 * Voice:   "swarm scenario contact / ssct / swarm coverage / unowned swarms /
 *           unplanned swarms / swarm contact / swarm scenario / swarm triple"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const SSCT_RE =
  /\b(swarm[._-]?scenario[._-]?contact|ssct|unowned[._-]?swarm(?:s)?|unplanned[._-]?swarm(?:s)?|swarm[._-]?coverage[._-]?triple|swarm[._-]?contact|swarm[._-]?scenario|swarm[._-]?triple)\b/i;

export function isSsctQuery(t) {
  return SSCT_RE.test(t || '');
}

export async function buildSsctScript() {
  const [jobR, scR, conR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const jobs = normJobs(jobR.status === 'fulfilled' ? jobR.value : []);
  const scenarios = normScenarios(scR.status === 'fulfilled' ? scR.value : []);
  const contacts = normContacts(conR.status === 'fulfilled' ? conR.value : []);
  const enriched = enrich(jobs, scenarios, contacts);
  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  return (
    `SwarmJob × Scenario × Contact: ${jobs.length} jobs, ${scenarios.length} scenarios, ${contacts.length} contacts. ` +
    `${full} jobs have full coverage (planned + owned); ${dark} are DARK (no scenario plan, no contact owner — highest operational risk). ` +
    `Top unowned/unplanned jobs: ${enriched.filter(r => r._class === 'DARK').slice(0, 3).map(r => r.name || r.title || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────

function normJobs(raw) {
  if (!raw) return [];
  for (const k of ['swarm_jobs', 'jobs', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normScenarios(raw) {
  if (!raw) return [];
  for (const k of ['scenarios', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normContacts(raw) {
  if (!raw) return [];
  for (const k of ['contacts', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── keyword scoring ─────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function jobTokens(j) {
  return tokens(
    [j.name, j.title, j.description, j.objective, j.target, j.status,
     ...(Array.isArray(j.tags) ? j.tags : [])].join(' ')
  );
}

function scenarioTokens(s) {
  return tokens(
    [s.name, s.title, s.description, s.type, s.category,
     ...(Array.isArray(s.tags) ? s.tags : [])].join(' ')
  );
}

function contactTokens(c) {
  return tokens(
    [c.name, c.first_name, c.last_name, c.email, c.role, c.title,
     c.organization, c.sector, c.region,
     ...(Array.isArray(c.tags) ? c.tags : [])].join(' ')
  );
}

function score(jobToks, otherToks) {
  if (!jobToks.length || !otherToks.length) return 0;
  const a = new Set(jobToks);
  const b = new Set(otherToks);
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.max(a.size, b.size);
}

// ─── enrich ──────────────────────────────────────────────────────────────────

function enrich(jobs, scenarios, contacts) {
  const THRESHOLD = 0.07;
  return jobs.map(job => {
    const jt = jobTokens(job);
    const scMatches = scenarios
      .map(s => ({ sc: s, score: score(jt, scenarioTokens(s)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const conMatches = contacts
      .map(c => ({ con: c, score: score(jt, contactTokens(c)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasSc = scMatches.length > 0;
    const hasCon = conMatches.length > 0;
    const _class = hasSc && hasCon ? 'FULL_COVERAGE'
      : hasSc ? 'SCENARIO_ONLY'
      : hasCon ? 'CONTACT_ONLY'
      : 'DARK';
    return { ...job, _class, _scMatches: scMatches, _conMatches: conMatches };
  });
}

// ─── colours ─────────────────────────────────────────────────────────────────

const MONO = "'JetBrains Mono','Fira Code',monospace";
const BG = 'rgba(0,0,0,0.88)';
const BD = 'rgba(255,255,255,0.08)';
const MU = '#64748B';
const RD = '#EF4444';
const AM = '#F59E0B';
const CY = '#22D3EE';
const GR = '#22C55E';

const CLASS_COLOR = {
  FULL_COVERAGE: GR,
  SCENARIO_ONLY: CY,
  CONTACT_ONLY: AM,
  DARK: RD,
};

const FILTERS = ['ALL', 'FULL_COVERAGE', 'SCENARIO_ONLY', 'CONTACT_ONLY', 'DARK'];

// ─── component ───────────────────────────────────────────────────────────────

export default function SwarmScenarioContactTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [lastFetch, setLastFetch] = useState(0);

  const poll = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 88000) return;
    setLoading(true); setErr('');
    try {
      const [jR, sR, cR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const j = normJobs(jR.status === 'fulfilled' ? jR.value : []);
      const s = normScenarios(sR.status === 'fulfilled' ? sR.value : []);
      const c = normContacts(cR.status === 'fulfilled' ? cR.value : []);
      setJobs(j); setScenarios(s); setContacts(c);
      setEnriched(enrich(j, s, c));
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
    window.addEventListener('jarvis:ssct-toggle', toggle);
    return () => window.removeEventListener('jarvis:ssct-toggle', toggle);
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
      const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
      const ctx = [
        `SwarmJob × Scenario × Contact analysis: ${jobs.length} swarm jobs, ${scenarios.length} scenarios, ${contacts.length} contacts.`,
        `Full coverage: ${full}, scenario-only: ${enriched.filter(r => r._class === 'SCENARIO_ONLY').length}, contact-only: ${enriched.filter(r => r._class === 'CONTACT_ONLY').length}, dark (neither): ${dark}.`,
        `Top dark jobs (unowned+unplanned): ${enriched.filter(r => r._class === 'DARK').slice(0, 5).map(r => r.name || r.title || '?').join('; ')}.`,
      ].join(' ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `JARVIS, assess this swarm job coverage: ${ctx} Give a 2-sentence operational assessment.` }),
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

  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  const scOnly = enriched.filter(r => r._class === 'SCENARIO_ONLY').length;
  const conOnly = enriched.filter(r => r._class === 'CONTACT_ONLY').length;

  const q = search.toLowerCase();
  const visible = enriched.filter(j => {
    if (filter !== 'ALL' && j._class !== filter) return false;
    if (!q) return true;
    const haystack = [j.name, j.title, j.description, j.status].join(' ').toLowerCase();
    return haystack.includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); poll(true); }}
        title="SwarmJob × Scenario × Contact Triple (SSCT)"
        style={{
          position: 'fixed', left: 5820, bottom: 18, zIndex: 68,
          background: dark > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${dark > 0 ? RD : 'rgba(255,255,255,0.14)'}`,
          color: dark > 0 ? RD : '#94A3B8', borderRadius: 4,
          padding: '3px 8px', fontSize: 9, cursor: 'pointer',
          fontFamily: MONO, letterSpacing: 1,
          boxShadow: dark > 0 ? `0 0 8px ${RD}44` : 'none',
          animation: dark > 0 ? 'ssct-pulse 2s infinite' : 'none',
        }}
      >
        <style>{`@keyframes ssct-pulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>
        ◈ SSCT{dark > 0 ? ` [${dark}]` : ''}
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
        <span style={{ color: RD, fontSize: 11, letterSpacing: 1, flex: 1 }}>
          ◈ SWARM × SCENARIO × CONTACT
          {loading && <span style={{ color: MU, marginLeft: 8 }}>⟳</span>}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '10px 14px 4px' }}>
        {[
          { label: 'JOBS', val: jobs.length, c: '#94A3B8' },
          { label: 'SCEN', val: scenarios.length, c: CY },
          { label: 'CTCTS', val: contacts.length, c: AM },
          { label: 'DARK', val: dark, c: RD },
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
            {full > 0 && <div style={{ flex: full, background: GR, borderRadius: 3 }} title={`FULL: ${full}`} />}
            {scOnly > 0 && <div style={{ flex: scOnly, background: CY }} title={`SC_ONLY: ${scOnly}`} />}
            {conOnly > 0 && <div style={{ flex: conOnly, background: AM }} title={`CON_ONLY: ${conOnly}`} />}
            {dark > 0 && <div style={{ flex: dark, background: RD, borderRadius: 3 }} title={`DARK: ${dark}`} />}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 7.5, color: MU }}>
            <span style={{ color: GR }}>■ FULL {full}</span>
            <span style={{ color: CY }}>■ SC_ONLY {scOnly}</span>
            <span style={{ color: AM }}>■ CON_ONLY {conOnly}</span>
            <span style={{ color: RD }}>■ DARK {dark}</span>
          </div>
        </div>
      )}

      {/* filters */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${filter === f ? RD : 'rgba(255,255,255,0.1)'}`,
            color: filter === f ? RD : MU, borderRadius: 3,
            padding: '2px 7px', fontSize: 8, cursor: 'pointer', letterSpacing: 0.5,
          }}>
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          placeholder="Search jobs…"
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
        {err && <div style={{ color: RD, fontSize: 10, marginBottom: 8 }}>{err}</div>}
        {visible.length === 0 && !loading && (
          <div style={{ color: MU, fontSize: 10, textAlign: 'center', paddingTop: 20 }}>No jobs match.</div>
        )}
        {visible.map((job, i) => {
          const id = job.id || job._id || i;
          const isExp = expanded[id];
          const cc = CLASS_COLOR[job._class] || MU;
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
                    {job.name || job.title || `Job ${id}`}
                  </div>
                  {(job.status || job.objective) && (
                    <div style={{ fontSize: 8.5, color: MU, marginTop: 1 }}>
                      {job.status && <span style={{ marginRight: 6 }}>{job.status}</span>}
                      {job.objective && <span style={{ color: CY, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{job.objective}</span>}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 8, color: cc, background: `${cc}22`, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                  {job._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: MU, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 5px 5px', padding: '8px 10px', borderLeft: `3px solid ${cc}` }}>
                  {/* Scenario matches */}
                  <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS ({job._scMatches.length})</div>
                  {job._scMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU, marginBottom: 6 }}>No scenarios matched.</div>
                    : job._scMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.sc.name || m.sc.title || '(untitled)'}
                            {m.sc.type && <span style={{ color: CY, marginLeft: 4, fontSize: 7.5 }}>[{m.sc.type}]</span>}
                          </span>
                          <span style={{ color: CY }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                  {/* Contact matches */}
                  <div style={{ fontSize: 8, color: AM, letterSpacing: 1, marginBottom: 4, marginTop: 8 }}>CONTACTS ({job._conMatches.length})</div>
                  {job._conMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU }}>No contacts matched.</div>
                    : job._conMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.con.name || [m.con.first_name, m.con.last_name].filter(Boolean).join(' ') || '(untitled)'}
                            {m.con.role && <span style={{ color: AM, marginLeft: 4, fontSize: 7.5 }}>[{m.con.role}]</span>}
                          </span>
                          <span style={{ color: AM }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: AM, borderRadius: 2 }} />
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
      <div style={{ padding: '8px 14px', borderTop: `1px solid rgba(239,68,68,0.2)` }}>
        <button onClick={assess} disabled={assessing}
          style={{
            background: assessing ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.18)',
            border: `1px solid ${RD}`, color: RD, borderRadius: 4, padding: '4px 12px',
            fontSize: 10, cursor: 'pointer', letterSpacing: 1, width: '100%',
          }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <div style={{ fontSize: 9.5, color: '#CBD5E1', marginTop: 8, lineHeight: 1.5, background: 'rgba(239,68,68,0.05)', borderRadius: 4, padding: '6px 8px' }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}
