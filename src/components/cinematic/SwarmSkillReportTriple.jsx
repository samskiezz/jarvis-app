/**
 * F284 — SwarmJob × AIP Skill × Report Triple (SART)
 *
 * Answers: "For each swarm job, is there an AIP skill supporting it AND
 * a report documenting its outcome — or does it operate blind?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob   → active swarm jobs
 *   GET /v1/aip/skill        → AIP skill catalog
 *   GET /v1/reports          → report catalog
 *
 * Classification per swarm job:
 *   FULLY_COVERED  — ≥1 skill match AND ≥1 report match
 *   SKILL_ONLY     — skill match but no report
 *   REPORT_ONLY    — report match but no skill
 *   DARK           — no skill, no report — flying blind
 *
 * Stat tiles:  jobs / skills / reports / dark
 * Amber badge: DARK count on button
 * Expand row:  matched skills (max 4) + matched reports (max 4) with relevance bars
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ SSRT  at left:6780, bottom:18, zIndex:68
 * Event:   jarvis:ssrt-toggle
 * Voice:   "swarm skill report / sart / swarm coverage triple /
 *           swarm aip report / skill swarm report / swarm documentation /
 *           swarm support coverage / swarm triple"
 * Refresh: 90 s auto-poll.
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
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const VI   = '#8B5CF6';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'FULLY_COVERED', 'SKILL_ONLY', 'REPORT_ONLY', 'DARK'];
const CLASS_COLOR = {
  FULLY_COVERED: GR,
  SKILL_ONLY:    CY,
  REPORT_ONLY:   VI,
  DARK:          AM,
};
const CLASS_LABEL = {
  FULLY_COVERED: 'FULL',
  SKILL_ONLY:    'SKILL',
  REPORT_ONLY:   'RPT',
  DARK:          'DARK',
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const SSRT_RE =
  /\b(swarm[._-]?skill[._-]?report|sart|swarm[._-]?coverage[._-]?triple|swarm[._-]?aip[._-]?report|skill[._-]?swarm[._-]?report|swarm[._-]?documentation|swarm[._-]?support[._-]?coverage|swarm[._-]?triple)\b/i;

export function isSsrtQuery(t) {
  return SSRT_RE.test(t || '');
}

export async function buildSsrtScript() {
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [jobsRaw, skillsRaw, reportsRaw] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const jobs    = normJobs(jobsRaw);
    const skills  = normSkills(skillsRaw);
    const reports = normReports(reportsRaw);
    const classified = classify(jobs, skills, reports);
    const dark = classified.filter(j => j.classification === 'DARK').length;
    const full = classified.filter(j => j.classification === 'FULLY_COVERED').length;
    return `SwarmJob × AIP Skill × Report coverage: ${jobs.length} swarm jobs assessed against ${skills.length} skills and ${reports.length} reports. ${full} jobs are FULLY_COVERED with both skill backing and report documentation; ${dark} jobs are DARK — operating with no skill support and no report evidence, representing the highest operational blind-spot risk.`;
  } catch {
    return 'SwarmJob × AIP Skill × Report data temporarily unavailable.';
  }
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normJobs(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.data ?? raw?.results ?? raw?.jobs ?? []);
  return arr.slice(0, 80).map(j => ({
    id:     j.id ?? j.job_id ?? String(Math.random()),
    name:   j.name ?? j.title ?? j.job_name ?? j.id ?? '—',
    status: j.status ?? j.state ?? '—',
    target: j.target ?? j.objective ?? '',
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags ?? ''),
    desc:   j.description ?? j.summary ?? '',
    tokens: tokenize([j.name, j.title, j.target, j.objective, j.description, j.tags].join(' ')),
  }));
}

function normSkills(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.skills ?? raw?.items ?? raw?.data ?? raw?.results ?? []);
  return arr.slice(0, 120).map(s => ({
    id:    s.id ?? s.skill_id ?? String(Math.random()),
    name:  s.name ?? s.title ?? s.id ?? '—',
    desc:  s.description ?? s.summary ?? '',
    tags:  Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags ?? ''),
    tokens: tokenize([s.name, s.title, s.description, s.category, s.tags].join(' ')),
  }));
}

function normReports(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.reports ?? raw?.items ?? raw?.data ?? raw?.results ?? []);
  return arr.slice(0, 120).map(r => ({
    id:    r.id ?? r.report_id ?? String(Math.random()),
    title: r.title ?? r.name ?? r.id ?? '—',
    topic: r.topic ?? r.type ?? r.category ?? '',
    desc:  r.description ?? r.summary ?? r.body ?? '',
    tokens: tokenize([r.title, r.name, r.topic, r.type, r.description, r.summary].join(' ')),
  }));
}

function tokenize(s) {
  return (s || '').toLowerCase().split(/[\s,._\-/\\]+/).filter(t => t.length > 2);
}

function matchItems(job, catalog) {
  const matched = [];
  for (const item of catalog) {
    const overlap = item.tokens.filter(t => job.tokens.includes(t));
    if (overlap.length > 0) {
      matched.push({ ...item, score: Math.min(1, overlap.length / Math.max(1, item.tokens.length)) });
    }
  }
  return matched.sort((a, b) => b.score - a.score).slice(0, 4);
}

function classify(jobs, skills, reports) {
  return jobs.map(j => {
    const mSkills  = matchItems(j, skills);
    const mReports = matchItems(j, reports);
    const hasSkill  = mSkills.length > 0;
    const hasReport = mReports.length > 0;
    const cls = hasSkill && hasReport ? 'FULLY_COVERED'
              : hasSkill              ? 'SKILL_ONLY'
              : hasReport             ? 'REPORT_ONLY'
              :                        'DARK';
    return { ...j, classification: cls, matchedSkills: mSkills, matchedReports: mReports };
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export default function SwarmSkillReportTriple() {
  const [open,      setOpen]      = useState(false);
  const [jobs,      setJobs]      = useState([]);
  const [skills,    setSkills]    = useState([]);
  const [reports,   setReports]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState('');
  const timerRef = useRef(null);

  const classified = classify(jobs, skills, reports);
  const darkCount  = classified.filter(j => j.classification === 'DARK').length;

  const load = useCallback(async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [jr, sr, rr] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`,      { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/reports`,        { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      setJobs(normJobs(jr));
      setSkills(normSkills(sr));
      setReports(normReports(rr));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:ssrt-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ssrt-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
    try {
      const c = classify(jobs, skills, reports);
      const dark = c.filter(j => j.classification === 'DARK').length;
      const full = c.filter(j => j.classification === 'FULLY_COVERED').length;
      const prompt = `JARVIS: We have ${jobs.length} swarm jobs. ${full} are FULLY_COVERED with skill and report backing, ${dark} are DARK (no skill, no report). Give a 2-sentence swarm-coverage assessment with recommended priority action.`;
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
  }, [jobs, skills, reports]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 6780, bottom: 18, zIndex: 68,
          background: darkCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(10,12,20,0.85)',
          border: `1px solid ${darkCount > 0 ? AM : BD}`,
          color: darkCount > 0 ? AM : MU,
          fontFamily: MONO, fontSize: 11, padding: '4px 10px',
          borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="SwarmJob × AIP Skill × Report Triple (SART)"
      >
        ◈ SSRT{darkCount > 0 ? ` ${darkCount}` : ''}
      </button>
    );
  }

  const filtered = classified
    .filter(j => filter === 'ALL' || j.classification === filter)
    .filter(j => !search || j.name.toLowerCase().includes(search.toLowerCase()) ||
                 j.status.toLowerCase().includes(search.toLowerCase()));

  const counts = {
    total:          classified.length,
    fully_covered:  classified.filter(j => j.classification === 'FULLY_COVERED').length,
    skill_only:     classified.filter(j => j.classification === 'SKILL_ONLY').length,
    report_only:    classified.filter(j => j.classification === 'REPORT_ONLY').length,
    dark:           darkCount,
  };

  return (
    <div style={{
      position: 'fixed', top: 60, right: 20, width: 540, maxHeight: 'calc(100vh - 80px)',
      background: BG, border: `1px solid ${BD}`, borderRadius: 8,
      zIndex: 68, overflowY: 'auto', fontFamily: MONO,
    }}>
      {/* header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: AM, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ SWARM × SKILL × REPORT TRIPLE
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
          ['JOBS',   counts.total,          '#94A3B8'],
          ['FULL',   counts.fully_covered,  GR],
          ['SKILLS', skills.length,         CY],
          ['DARK',   counts.dark,           AM],
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
            background: filter === f ? 'rgba(245,158,11,0.18)' : 'none',
            border: `1px solid ${filter === f ? AM : BD}`,
            color: filter === f ? AM : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
          }}>{f === 'FULLY_COVERED' ? 'FULL' : f}</button>
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
            {loading ? 'Loading…' : 'No jobs match.'}
          </div>
        )}
        {filtered.map(job => (
          <div key={job.id} style={{
            marginBottom: 6, background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${expanded === job.id ? AM : BD}`,
            borderRadius: 4, overflow: 'hidden',
          }}>
            <div
              onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}
            >
              <span style={{
                background: `${CLASS_COLOR[job.classification]}22`,
                border: `1px solid ${CLASS_COLOR[job.classification]}`,
                color: CLASS_COLOR[job.classification],
                fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 700, minWidth: 36, textAlign: 'center',
              }}>{CLASS_LABEL[job.classification]}</span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.name}
              </span>
              <span style={{ color: MU, fontSize: 10 }}>{job.status}</span>
              <span style={{ color: MU, fontSize: 10 }}>
                {job.matchedSkills.length}S {job.matchedReports.length}R
              </span>
            </div>

            {expanded === job.id && (
              <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${BD}` }}>
                {job.matchedSkills.length > 0 && (
                  <>
                    <div style={{ color: CY, fontSize: 9, marginTop: 8, marginBottom: 4 }}>MATCHED SKILLS</div>
                    {job.matchedSkills.map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: CY, fontSize: 9, minWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.name}
                        </span>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${(s.score * 100).toFixed(0)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                        </div>
                        <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{(s.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </>
                )}
                {job.matchedReports.length > 0 && (
                  <>
                    <div style={{ color: VI, fontSize: 9, marginTop: 8, marginBottom: 4 }}>MATCHED REPORTS</div>
                    {job.matchedReports.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: VI, fontSize: 9, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title}
                        </span>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${(r.score * 100).toFixed(0)}%`, height: '100%', background: VI, borderRadius: 2 }} />
                        </div>
                        <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{(r.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </>
                )}
                {job.matchedSkills.length === 0 && job.matchedReports.length === 0 && (
                  <div style={{ color: AM, fontSize: 10, marginTop: 8 }}>No skill or report coverage found.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
