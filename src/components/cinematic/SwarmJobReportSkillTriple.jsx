import { useState, useEffect, useCallback } from 'react';

const API = '';

const SJRSK_RE = /\b(sjrsk|swarm[._-]?report[._-]?skill|swarm[._-]?intel[._-]?capabilit|equipped[._-]?swarm|unsupported[._-]?swarm|swarm[._-]?report[._-]?skill[._-]?coverage|swarm[._-]?capabilit[._-]?report|swarm[._-]?skill[._-]?report)\b/i;

export function isSjrskQuery(t) {
  return SJRSK_RE.test(t || '');
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = ['swarm_jobs', 'jobs', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.label || `SwarmJob ${i + 1}`,
    kind:   j.kind || j.type || j.category || '',
    status: j.status || j.state || '',
    target: j.target || j.domain || j.scope || '',
    desc:   String(j.description || j.summary || j.notes || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data', 'records', 'documents'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:   r.id || String(i),
    name: r.name || r.title || r.subject || `Report ${i + 1}`,
    type: r.type || r.kind || r.category || '',
    desc: String(r.description || r.summary || r.content || r.body || '').slice(0, 200),
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.label || `Skill ${i + 1}`,
    category: s.category || s.domain || s.type || '',
    desc:     String(s.description || s.summary || s.notes || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(jobToks, other) {
  const otherToks = [
    ...tokens(other.name   || ''),
    ...tokens(other.type   || other.category || other.domain || other.kind || ''),
    ...tokens(other.desc   || other.description || other.summary || ''),
    ...tokens(other.tags   || ''),
  ].filter(Boolean);
  if (!jobToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (jobToks.has(t)) hits++;
  return hits / Math.max(jobToks.size, otherToks.length);
}

function correlate(jobs, reports, skills) {
  return jobs.map(job => {
    const toks = new Set([
      ...tokens(job.name),
      ...tokens(job.kind),
      ...tokens(job.target),
      ...tokens(job.desc),
      ...tokens(job.tags),
    ].filter(Boolean));

    const matchedReports = reports
      .map(r => ({ ...r, _score: matchScore(toks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedSkills = skills
      .map(s => ({ ...s, _score: matchScore(toks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasReport = matchedReports.length > 0;
    const hasSkill  = matchedSkills.length > 0;

    let coverage;
    if (hasReport && hasSkill) coverage = 'FULLY EQUIPPED';
    else if (hasReport)        coverage = 'DOCUMENTED';
    else if (hasSkill)         coverage = 'SKILLED';
    else                       coverage = 'UNSUPPORTED';

    return { ...job, _reports: matchedReports, _skills: matchedSkills, _coverage: coverage };
  });
}

export async function buildSjrskScript() {
  const [jR, rR, sR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const jobs    = normaliseJobs(jR.status    === 'fulfilled' ? jR.value : []);
  const reports = normaliseReports(rR.status === 'fulfilled' ? rR.value : []);
  const skills  = normaliseSkills(sR.status  === 'fulfilled' ? sR.value : []);
  const enriched = correlate(jobs, reports, skills);
  const fe   = enriched.filter(e => e._coverage === 'FULLY EQUIPPED').length;
  const doc  = enriched.filter(e => e._coverage === 'DOCUMENTED').length;
  const skl  = enriched.filter(e => e._coverage === 'SKILLED').length;
  const uns  = enriched.filter(e => e._coverage === 'UNSUPPORTED').length;
  return (
    `SwarmJob × Report × Skill Triple Coverage: ${jobs.length} swarm jobs cross-referenced against ` +
    `${reports.length} intelligence reports and ${skills.length} JARVIS skills. ` +
    `${fe} FULLY EQUIPPED (report-documented + skill-backed); ` +
    `${doc} DOCUMENTED (report coverage only, no skill backing); ` +
    `${skl} SKILLED (skill found, no report documentation); ` +
    `${uns} UNSUPPORTED (no report or skill coverage — automation without intelligence or capability backing). ` +
    `Critical unsupported jobs: ${enriched.filter(e => e._coverage === 'UNSUPPORTED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY  = '#00CFFF';
const AM  = '#F59E0B';
const LI  = '#84CC16';
const GR  = '#22C55E';

const COVERAGE_COLOR = {
  'FULLY EQUIPPED': GR,
  'DOCUMENTED':     AM,
  'SKILLED':        LI,
  'UNSUPPORTED':    '#555',
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY EQUIPPED', 'DOCUMENTED', 'SKILLED', 'UNSUPPORTED'];

export default function SwarmJobReportSkillTriple() {
  const [open, setOpen]             = useState(false);
  const [jobs, setJobs]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [jR, rR, sR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      const raw_j = normaliseJobs(jR.status    === 'fulfilled' ? jR.value : []);
      const raw_r = normaliseReports(rR.status === 'fulfilled' ? rR.value : []);
      const raw_s = normaliseSkills(sR.status  === 'fulfilled' ? sR.value : []);
      setJobs(correlate(raw_j, raw_r, raw_s));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjrsk-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjrsk-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildSjrskScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `SwarmJob intelligence and capability coverage brief: ${brief}. Give a 2-sentence assessment of swarm automation gaps in report documentation and skill backing.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const unsCount = jobs.filter(j => j._coverage === 'UNSUPPORTED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="SwarmJob × Report × Skill Triple Coverage (SJRSK)"
        style={{
          position: 'fixed', left: 735600, bottom: 8, zIndex: 342,
          background: unsCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${unsCount > 0 ? AM : CY + '44'}`,
          color: unsCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SJRSK{unsCount > 0 ? ` ⚠${unsCount}` : ''}
      </button>
    );
  }

  const fe  = jobs.filter(j => j._coverage === 'FULLY EQUIPPED').length;
  const doc = jobs.filter(j => j._coverage === 'DOCUMENTED').length;
  const skl = jobs.filter(j => j._coverage === 'SKILLED').length;
  const uns = jobs.filter(j => j._coverage === 'UNSUPPORTED').length;

  const visible = jobs.filter(j =>
    (tab === 'ALL' || j._coverage === tab) &&
    (!search || j.name.toLowerCase().includes(search.toLowerCase()) ||
      j.kind.toLowerCase().includes(search.toLowerCase()) ||
      j.target.toLowerCase().includes(search.toLowerCase()) ||
      j.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ SWARMJOB × REPORT × SKILL TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SJRSK</span>
        {uns > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {uns} UNSUPPORTED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SWARM JOBS',      jobs.length, CY],
          ['FULLY EQUIPPED',  fe,          GR],
          ['DOCUMENTED',      doc,         AM],
          ['SKILLED',         skl,         LI],
          ['UNSUPPORTED',     uns,         '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {jobs.length > 0 && [
            [fe, GR], [doc, AM], [skl, LI], [uns, '#444']
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${jobs.filter(j => j._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search swarm jobs…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No swarm jobs match filter.</div>}
        {visible.map(job => {
          const color = COVERAGE_COLOR[job._coverage] || CY;
          const isExp = expanded === job.id;
          return (
            <div key={job.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : job.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</span>
                {job.kind   && chip(job.kind,   '#888')}
                {job.status && chip(job.status, '#888')}
                {chip(job._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>REPORTS ({job._reports.length})</div>
                    {job._reports.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No report alignment</div>
                      : job._reports.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.type && chip(r.type, '#888')}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LI, marginBottom: 4, fontWeight: 600 }}>SKILLS ({job._skills.length})</div>
                    {job._skills.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No skill alignment</div>
                      : job._skills.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.category && chip(s.category, '#888')}
                          </div>
                          <ScoreBar score={s._score} color={LI} />
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

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
