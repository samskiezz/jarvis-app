import { useState, useEffect, useCallback } from 'react';

const API = '';

const SJSKTRI_RE = /\b(swarm[._-]?skill[._-]?kb|sjsktri|skill[._-]?swarm[._-]?kb|swarm[._-]?knowledge[._-]?skill|dark[._-]?swarm|swarm[._-]?capability[._-]?knowledge|swarm[._-]?skill[._-]?knowledge|skill[._-]?knowledge[._-]?swarm)\b/i;

export function isSjsktriQuery(t) {
  return SJSKTRI_RE.test(t || '');
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function jobTokens(job) {
  return new Set([
    ...tokens(job.name || job.title || job.label || ''),
    ...tokens(job.type || job.kind || job.category || ''),
    ...tokens(job.description || job.desc || job.summary || ''),
    ...tokens(Array.isArray(job.tags) ? job.tags.join(' ') : (job.tags || '')),
    ...tokens(job.target || job.objective || ''),
  ].filter(Boolean));
}

function skillScore(jToks, skill) {
  const sToks = [
    ...tokens(skill.name || skill.title || ''),
    ...tokens(skill.category || skill.domain || ''),
    ...tokens(skill.description || skill.summary || ''),
    ...tokens(Array.isArray(skill.tags) ? skill.tags.join(' ') : (skill.tags || '')),
  ].filter(Boolean);
  if (!jToks.size || !sToks.length) return 0;
  let hits = 0;
  for (const t of sToks) if (jToks.has(t)) hits++;
  return hits / Math.max(jToks.size, sToks.length);
}

function kbScore(jToks, article) {
  const aToks = [
    ...tokens(article.title || article.name || article.label || ''),
    ...tokens(article.category || article.type || article.kind || ''),
    ...tokens(article.description || article.summary || article.content || ''),
    ...tokens(Array.isArray(article.tags) ? article.tags.join(' ') : (article.tags || '')),
  ].filter(Boolean);
  if (!jToks.size || !aToks.length) return 0;
  let hits = 0;
  for (const t of aToks) if (jToks.has(t)) hits++;
  return hits / Math.max(jToks.size, aToks.length);
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = ['jobs', 'swarm_jobs', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.label || `SwarmJob ${i + 1}`,
    type:   j.type || j.kind || j.job_type || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.desc || j.summary || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
    target: j.target || j.objective || '',
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || `Skill ${i + 1}`,
    category: s.category || s.domain || '',
    domain:   s.domain || s.area || '',
    desc:     String(s.description || s.summary || '').slice(0, 150),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'knowledge', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    title:    a.title || a.name || a.label || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    desc:     String(a.description || a.summary || a.content || '').slice(0, 150),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function correlate(jobs, skills, articles) {
  return jobs.map(job => {
    const jToks = jobTokens(job);

    const matchedSkills = skills
      .map(s => ({ ...s, _score: skillScore(jToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedArticles = articles
      .map(a => ({ ...a, _score: kbScore(jToks, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasSkill = matchedSkills.length > 0;
    const hasKb    = matchedArticles.length > 0;

    let coverage;
    if (hasSkill && hasKb)  coverage = 'FULLY COVERED';
    else if (hasSkill)      coverage = 'SKILLED';
    else if (hasKb)         coverage = 'DOCUMENTED';
    else                    coverage = 'DARK';

    return { ...job, _skills: matchedSkills, _articles: matchedArticles, _coverage: coverage };
  });
}

export async function buildSjsktriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [jR, sR, kR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);
  const jobs     = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
  const skills   = normaliseSkills(sR.status === 'fulfilled' ? sR.value : []);
  const articles = normaliseArticles(kR.status === 'fulfilled' ? kR.value : []);
  const enriched = correlate(jobs, skills, articles);
  const fc   = enriched.filter(j => j._coverage === 'FULLY COVERED').length;
  const sk   = enriched.filter(j => j._coverage === 'SKILLED').length;
  const doc  = enriched.filter(j => j._coverage === 'DOCUMENTED').length;
  const dark = enriched.filter(j => j._coverage === 'DARK').length;
  const darkNames = enriched.filter(j => j._coverage === 'DARK').slice(0, 3).map(j => j.name).join(', ') || 'none';
  return (
    `SwarmJob × Skill × Knowledge Triple Coverage: ${jobs.length} swarm jobs cross-referenced against ${skills.length} JARVIS skills and ${articles.length} KB articles. ` +
    `${fc} jobs are FULLY COVERED (skill-backed + KB-documented); ${sk} are SKILLED (skill match only); ` +
    `${doc} are DOCUMENTED (KB only); ${dark} are DARK (no skill or knowledge coverage — automation gap). ` +
    `Dark jobs: ${darkNames}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY  = '#00CFFF';
const AM  = '#F59E0B';
const RD  = '#EF4444';
const GR  = '#22C55E';
const PU  = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY COVERED': GR,
  'SKILLED':       CY,
  'DOCUMENTED':    AM,
  'DARK':          RD,
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

const TABS = ['ALL', 'FULLY COVERED', 'SKILLED', 'DOCUMENTED', 'DARK'];

export default function SwarmJobSkillKnowledgeTriple() {
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
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [jR, sR, kR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawJobs    = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
      const rawSkills  = normaliseSkills(sR.status === 'fulfilled' ? sR.value : []);
      const rawArticles = normaliseArticles(kR.status === 'fulfilled' ? kR.value : []);
      setJobs(correlate(rawJobs, rawSkills, rawArticles));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjsktri-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjsktri-toggle', toggle);
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
      const brief = await buildSjsktriScript();
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `SwarmJob × Skill × Knowledge triple coverage: ${brief}. Give a 2-sentence swarm automation readiness assessment.` }),
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
    const darkCount = jobs.filter(j => j._coverage === 'DARK').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="SwarmJob × Skill × Knowledge Triple Coverage (SJSKTRI)"
        style={{
          position: 'fixed', left: 746800, bottom: 8, zIndex: 362,
          background: darkCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${darkCount > 0 ? AM : PU + '44'}`,
          color: darkCount > 0 ? AM : PU, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SJSKTRI{darkCount > 0 ? ` ⚠${darkCount}` : ''}
      </button>
    );
  }

  const fc   = jobs.filter(j => j._coverage === 'FULLY COVERED').length;
  const sk   = jobs.filter(j => j._coverage === 'SKILLED').length;
  const doc  = jobs.filter(j => j._coverage === 'DOCUMENTED').length;
  const dark = jobs.filter(j => j._coverage === 'DARK').length;

  const visible = jobs.filter(j =>
    (tab === 'ALL' || j._coverage === tab) &&
    (!search || j.name.toLowerCase().includes(search.toLowerCase()) || j.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #A855F733', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #A855F718',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #A855F722', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: PU, fontWeight: 700, fontSize: 11 }}>◈ SWARMJOB × SKILL × KNOWLEDGE TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SJSKTRI</span>
        {dark > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {dark} DARK</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SWARM JOBS',     jobs.length, PU],
          ['FULLY COVERED',  fc,          GR],
          ['SKILLED',        sk,          CY],
          ['DOCUMENTED',     doc,         AM],
          ['DARK',           dark,        RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {jobs.length > 0 && [
            [fc, GR], [sk, CY], [doc, AM], [dark, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || PU) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || PU) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || PU) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${jobs.filter(j => j._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search swarm jobs…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #A855F733', borderRadius: 4, color: PU, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No jobs match filter.</div>}
        {visible.map(job => {
          const color = COVERAGE_COLOR[job._coverage] || PU;
          const isExp = expanded === job.id;
          return (
            <div key={job.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : job.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</span>
                {job.type && chip(job.type, PU)}
                {job.status && chip(job.status, job.status === 'running' ? GR : '#888')}
                {chip(job._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Skills */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>SKILLS ({job._skills.length})</div>
                    {job._skills.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No skill alignment</div>
                      : job._skills.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.category && chip(s.category, CY)}
                            {s.domain && chip(s.domain, GR)}
                          </div>
                          <ScoreBar score={s._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: KB Articles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>KB ARTICLES ({job._articles.length})</div>
                    {job._articles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No KB article alignment</div>
                      : job._articles.map(a => (
                        <div key={a.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                            {a.category && chip(a.category, AM)}
                          </div>
                          <ScoreBar score={a._score} color={AM} />
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

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #A855F722', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #A855F744', color: PU, cursor: 'pointer' }}>
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
