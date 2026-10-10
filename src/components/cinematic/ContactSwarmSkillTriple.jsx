/**
 * F447 — Contact × SwarmJob × AIP Skill Intelligence Triple (CSAT)
 *
 * Answers: "For each contact, is there both a swarm job tracking them
 * AND an AIP skill capable of reasoning about them — or are they dark?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Contact   → all contacts
 *   GET /entities/SwarmJob  → all swarm jobs
 *   GET /v1/aip/skill       → all registered AIP skills
 *
 * Classification per contact:
 *   FULLY_SUPPORTED  — ≥1 swarm job + ≥1 AIP skill both keyword-match
 *   SWARM_ONLY       — swarm job match, no skill
 *   SKILL_ONLY       — skill match, no swarm job
 *   DARK             — neither — complete intelligence blind spot
 *
 * Stat tiles:  contacts / swarm jobs / AIP skills / dark
 * Red badge:   DARK count on button
 * Expand row:  matched swarm jobs (max 4) + matched skills (max 4) with
 *              status/category badge + relevance bar
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ CSAT  at left:7860, bottom:18, zIndex:68
 * Event:   jarvis:csat-toggle
 * Voice:   "contact swarm skill / csat / dark contacts / contact skill swarm /
 *           contact coverage triple / swarm skill contact / contact triple /
 *           contact intelligence triple / which contacts have both"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const AM   = '#F59E0B';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'FULLY_SUPPORTED', 'SWARM_ONLY', 'SKILL_ONLY', 'DARK'];
const CLASS_COLOR = {
  FULLY_SUPPORTED: GR,
  SWARM_ONLY:      CY,
  SKILL_ONLY:      AM,
  DARK:            RD,
};
const CLASS_SHORT = {
  FULLY_SUPPORTED: 'FULL',
  SWARM_ONLY:      'SWM',
  SKILL_ONLY:      'SKL',
  DARK:            'DARK',
};

const STATUS_COLOR = {
  running:   CY,
  queued:    AM,
  completed: GR,
  failed:    RD,
};

function tokens(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(s => s.length > 2);
}

function score(srcTokens, target) {
  const tgt = tokens(
    [target.name, target.description, target.target, target.objective,
     target.category, ...(target.tags || [])].join(' ')
  );
  if (!tgt.length) return 0;
  return srcTokens.filter(t => tgt.includes(t)).length / Math.max(srcTokens.length, 1);
}

function hdr() {
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

export default function ContactSwarmSkillTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalSkills, setTotalSkills] = useState(0);
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [contactsRaw, jobsRaw, skillsRaw] = await Promise.all([
        fetchJson('/entities/Contact'),
        fetchJson('/entities/SwarmJob'),
        fetchJson('/v1/aip/skill'),
      ]);
      const contacts = contactsRaw?.items || contactsRaw?.data || (Array.isArray(contactsRaw) ? contactsRaw : []);
      const jobs     = jobsRaw?.items     || jobsRaw?.data     || (Array.isArray(jobsRaw)     ? jobsRaw     : []);
      const skills   = skillsRaw?.items   || skillsRaw?.data   || skillsRaw?.skills || (Array.isArray(skillsRaw) ? skillsRaw : []);

      setTotalJobs(jobs.length);
      setTotalSkills(skills.length);

      const classified = contacts.map(contact => {
        const toks = tokens(
          [contact.name, contact.email, contact.organization, contact.role,
           contact.title, contact.company, contact.description,
           ...(contact.tags || [])].join(' ')
        );

        const matchedJobs = jobs
          .map(j => ({ ...j, rel: score(toks, j) }))
          .filter(j => j.rel > 0)
          .sort((a, b) => b.rel - a.rel)
          .slice(0, 4);

        const matchedSkills = skills
          .map(s => ({ ...s, rel: score(toks, s) }))
          .filter(s => s.rel > 0)
          .sort((a, b) => b.rel - a.rel)
          .slice(0, 4);

        const hasJob   = matchedJobs.length   > 0;
        const hasSkill = matchedSkills.length > 0;

        let cls;
        if (hasJob && hasSkill)       cls = 'FULLY_SUPPORTED';
        else if (hasJob && !hasSkill) cls = 'SWARM_ONLY';
        else if (!hasJob && hasSkill) cls = 'SKILL_ONLY';
        else                          cls = 'DARK';

        return { ...contact, _cls: cls, _jobs: matchedJobs, _skills: matchedSkills };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = e => {
      setOpen(v => !v);
      if (!rows.length) load();
    };
    window.addEventListener('jarvis:csat-toggle', handler);
    return () => window.removeEventListener('jarvis:csat-toggle', handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const dark    = rows.filter(r => r._cls === 'DARK').length;
      const full    = rows.filter(r => r._cls === 'FULLY_SUPPORTED').length;
      const total   = rows.length;
      const prompt  = `JARVIS contact-swarm-skill triple analysis: ${total} contacts total. ` +
                      `${full} fully supported (swarm + skill), ${dark} dark (no swarm, no skill). ` +
                      `Provide a 2-sentence operational coverage assessment.`;
      const r = await fetch(API + '/v1/jarvis/agent/chat', {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || 'Assessment complete.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      /* swallow */
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const dark    = rows.filter(r => r._cls === 'DARK').length;
  const full    = rows.filter(r => r._cls === 'FULLY_SUPPORTED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r._cls !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.name || '').toLowerCase().includes(q) ||
           (r.email || '').toLowerCase().includes(q) ||
           (r.organization || '').toLowerCase().includes(q);
  });

  const btnStyle = {
    position: 'fixed',
    left: 7860,
    bottom: 18,
    zIndex: 68,
    background: open ? 'rgba(239,68,68,0.15)' : 'rgba(10,12,20,0.85)',
    border: `1px solid ${open ? RD : BD}`,
    color: open ? RD : MU,
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1,
    padding: '4px 8px',
    borderRadius: 3,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => { setOpen(true); if (!rows.length) load(); }}>
        ◈ CSAT
        {dark > 0 && (
          <span style={{ marginLeft: 4, background: RD, color: '#fff', borderRadius: 2, padding: '1px 4px', fontSize: 8 }}>
            {dark}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>◈ CSAT ✕</button>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 520, maxHeight: 'calc(100vh - 100px)',
        background: BG, border: `1px solid ${RD}`, borderRadius: 8,
        display: 'flex', flexDirection: 'column', zIndex: 4000,
        fontFamily: MONO, fontSize: 11, color: '#e2e8f0',
        boxShadow: `0 0 30px rgba(239,68,68,0.15)`,
      }}>
        {/* Header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: RD, fontSize: 12, fontWeight: 700, flex: 1 }}>
            ◈ CONTACT × SWARM × SKILL TRIPLE
          </span>
          {loading && <span style={{ color: MU, fontSize: 9 }}>LOADING…</span>}
          <button
            onClick={assess}
            disabled={assessing || !rows.length}
            style={{ background: 'rgba(16,185,129,0.1)', border: `1px solid ${GR}`, color: GR, fontFamily: MONO, fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer' }}
          >
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 12 }}>↺</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${BD}` }}>
          <Tile label="CONTACTS"  value={rows.length}  color={CY} />
          <Tile label="JOBS"      value={totalJobs}    color={CY} />
          <Tile label="SKILLS"    value={totalSkills}  color={CY} />
          <Tile label="FULL COV"  value={full}         color={GR} />
          <Tile label="DARK"      value={dark}         color={RD} />
        </div>

        {/* Coverage bar */}
        {rows.length > 0 && (
          <div style={{ display: 'flex', height: 6, margin: '0 14px 2px' }}>
            {['FULLY_SUPPORTED','SWARM_ONLY','SKILL_ONLY','DARK'].map(cls => {
              const cnt = rows.filter(r => r._cls === cls).length;
              return cnt > 0 ? (
                <div key={cls} style={{ flex: cnt, background: CLASS_COLOR[cls], height: 6 }} title={`${cls}: ${cnt}`} />
              ) : null;
            })}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: `1px solid ${BD}` }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? 'rgba(255,255,255,0.08)' : 'none',
              border: `1px solid ${filter === f ? BD : 'transparent'}`,
              color: filter === f ? '#fff' : MU, fontFamily: MONO, fontSize: 8,
              padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
            }}>{f}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, color: '#e2e8f0', fontFamily: MONO, fontSize: 9, padding: '2px 8px', borderRadius: 3, width: 110, outline: 'none' }}
          />
        </div>

        {/* Error */}
        {err && <div style={{ padding: '6px 14px', color: RD, fontSize: 9 }}>ERR: {err}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.length === 0 && !loading && (
            <div style={{ padding: '16px 14px', color: MU, textAlign: 'center', fontSize: 10 }}>No contacts match.</div>
          )}
          {visible.map((row, i) => {
            const isExp = !!expanded[row.id || i];
            const clsColor = CLASS_COLOR[row._cls];
            return (
              <div key={row.id || i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <div
                  onClick={() => setExpanded(p => ({ ...p, [row.id || i]: !p[row.id || i] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                >
                  <span style={{ color: clsColor, fontSize: 8, fontWeight: 700, minWidth: 34 }}>{CLASS_SHORT[row._cls]}</span>
                  <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name || row.email || `Contact ${i + 1}`}
                  </span>
                  {row.organization && (
                    <span style={{ color: MU, fontSize: 9 }}>{row.organization.slice(0, 20)}</span>
                  )}
                  <span style={{ color: clsColor, fontSize: 9 }}>
                    {row._jobs.length}J {row._skills.length}S
                  </span>
                  <span style={{ color: MU }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '4px 14px 10px 28px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Jobs */}
                    {row._jobs.length > 0 && (
                      <div>
                        <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>SWARM JOBS</div>
                        {row._jobs.map((j, ji) => (
                          <div key={ji} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ color: STATUS_COLOR[j.status] || MU, fontSize: 8, minWidth: 28 }}>{(j.status || 'unk').slice(0,3).toUpperCase()}</span>
                            <span style={{ flex: 1, color: '#cbd5e1', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name || j.target || `Job ${ji+1}`}</span>
                            <Bar pct={j.rel} color={CY} />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Skills */}
                    {row._skills.length > 0 && (
                      <div>
                        <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>AIP SKILLS</div>
                        {row._skills.map((s, si) => (
                          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ color: AM, fontSize: 8, minWidth: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(s.category || 'GEN').slice(0,4).toUpperCase()}</span>
                            <span style={{ flex: 1, color: '#cbd5e1', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || `Skill ${si+1}`}</span>
                            <Bar pct={s.rel} color={AM} />
                          </div>
                        ))}
                      </div>
                    )}
                    {row._jobs.length === 0 && row._skills.length === 0 && (
                      <div style={{ color: RD, fontSize: 9 }}>No swarm jobs or skills correlated — complete dark coverage.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '6px 14px', borderTop: `1px solid ${BD}`, color: MU, fontSize: 8 }}>
          {visible.length}/{rows.length} contacts · CSAT · 90s refresh
        </div>
      </div>
    </>
  );
}

/* ─── Intent helpers exported for JarvisBrain ─── */

export function isCsatQuery(q) {
  const l = q.toLowerCase();
  return ['contact swarm skill','csat','dark contacts','contact skill swarm',
          'contact coverage triple','swarm skill contact','contact triple',
          'contact intelligence triple','which contacts have both',
          'contact swarm aip','swarm skill contact triple'].some(kw => l.includes(kw));
}

export async function buildCsatScript() {
  const hd = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  try {
    const [contactsRaw, jobsRaw, skillsRaw] = await Promise.all([
      fetch('/entities/Contact',  { headers: hd }).then(r => r.json()),
      fetch('/entities/SwarmJob', { headers: hd }).then(r => r.json()),
      fetch('/v1/aip/skill',      { headers: hd }).then(r => r.json()),
    ]);
    const contacts = contactsRaw?.items || contactsRaw?.data || (Array.isArray(contactsRaw) ? contactsRaw : []);
    const jobs     = jobsRaw?.items     || jobsRaw?.data     || (Array.isArray(jobsRaw)     ? jobsRaw     : []);
    const skills   = skillsRaw?.items   || skillsRaw?.data   || skillsRaw?.skills || (Array.isArray(skillsRaw) ? skillsRaw : []);
    const dark = contacts.filter(c => {
      const toks = tokens([c.name,c.email,c.organization,c.role,c.description,...(c.tags||[])].join(' '));
      const hasJob   = jobs.some(j   => score(toks, j)   > 0);
      const hasSkill = skills.some(s => score(toks, s)   > 0);
      return !hasJob && !hasSkill;
    }).length;
    return `Contact triple analysis: ${contacts.length} contacts, ${jobs.length} swarm jobs, ${skills.length} AIP skills. ${dark} contacts are completely dark — no swarm coverage and no AIP skill correlation.`;
  } catch {
    return 'Contact swarm skill triple data unavailable.';
  }
}
