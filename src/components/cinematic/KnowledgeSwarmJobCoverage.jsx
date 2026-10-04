/**
 * F74 — Knowledge × SwarmJob Coverage (SWKB)
 *
 * Parallel-fetches /knowledge/ + /entities/SwarmJob, then keyword-correlates
 * each swarm job's domain text against KB articles to surface:
 *   INFORMED    — at least one KB article covers this swarm job's domain
 *   FLYING-BLIND — no KB coverage (operational knowledge gap)
 *
 * Stat tiles: swarm jobs / KB articles / informed / flying-blind
 * Filter tabs: ALL | INFORMED | FLYING-BLIND + text search
 * Expand any job → matched KB articles with category badge + relevance score bar.
 * Amber badge on FLYING-BLIND count.
 * ▶ ASSESS: 2-sentence swarm-knowledge brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ SWKB  at bottom:8 left:688000, zIndex:257.
 * Event:   jarvis:swkb-toggle
 * Voice:   "swarm knowledge / knowledge swarm / swkb / swarm kb /
 *           informed swarm / flying blind swarm / swarm intel base /
 *           swarm without knowledge / kb swarm / swarm knowledge gap /
 *           which swarm jobs have knowledge"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const POLL_MS = 90_000;
const AM = '#f59e0b';

// ── regex for voice/text matching ────────────────────────────────────────────
const SWKB_RE =
  /\b(swarm[._-]?knowledge|knowledge[._-]?swarm|swkb|swarm[._-]?kb|informed[._-]?swarm|flying[._-]?blind[._-]?swarm|swarm[._-]?intel[._-]?base|swarm[._-]?without[._-]?knowledge|kb[._-]?swarm|swarm[._-]?knowledge[._-]?gap|which[._-]?swarm[._-]?jobs?[._-]?(have|lack)[._-]?knowledge)\b/i;

export function isSwkbQuery(t) {
  return SWKB_RE.test(t || '');
}

export async function buildSwkbScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [kbR, jobsR] = await Promise.allSettled([
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    ]);
    const articles = normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []);
    const jobs = normaliseJobs(jobsR.status === 'fulfilled' ? jobsR.value : []);
    const enriched = correlate(jobs, articles);
    const informed = enriched.filter(j => j._informed).length;
    const blind = enriched.length - informed;
    const topBlind = enriched
      .filter(j => !j._informed)
      .slice(0, 4)
      .map(j => j.name)
      .join(', ') || 'none';

    return (
      `Knowledge × SwarmJob Coverage: ${jobs.length} active swarm jobs cross-matched against ` +
      `${articles.length} knowledge base articles. ${informed} jobs are INFORMED (KB article found); ` +
      `${blind} are FLYING-BLIND (no knowledge base coverage — operational knowledge gap). ` +
      `Top uninformed jobs: ${topBlind}.`
    );
  } catch {
    return 'Knowledge × SwarmJob Coverage assessment unavailable at this time, sir.';
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'knowledge', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    title:    a.title || a.name || a.headline || `Article ${i + 1}`,
    category: a.category || a.type || a.domain || '',
    summary:  (a.summary || a.body || a.content || a.description || '').toString().slice(0, 300),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.jobs)                    ? raw.jobs
    : Array.isArray(raw?.swarm_jobs)              ? raw.swarm_jobs
    : Array.isArray(raw?.items)                   ? raw.items
    : Array.isArray(raw?.results)                 ? raw.results
    : Array.isArray(raw?.data)                    ? raw.data
    : [];
  return arr.map((j, i) => ({
    id:          j.id || j.job_id || String(i),
    name:        j.name || j.job_name || j.title || `Job ${i + 1}`,
    type:        j.type || j.kind || j.job_type || '',
    status:      j.status || j.state || '',
    description: (j.description || j.summary || j.target || j.objective || '').toString().slice(0, 300),
    domain:      j.domain || j.category || '',
    tags:        Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function matchScore(job, article) {
  const jobToks = new Set([
    ...tokens(job.name),
    ...tokens(job.description),
    ...tokens(job.domain),
    ...tokens(job.type),
    ...tokens(job.tags),
  ].filter(Boolean));
  const artToks = [
    ...tokens(article.title),
    ...tokens(article.summary),
    ...tokens(article.category),
    ...tokens(article.tags),
  ].filter(Boolean);
  if (!jobToks.size || !artToks.length) return 0;
  let hits = 0;
  for (const t of artToks) if (jobToks.has(t)) hits++;
  return hits / Math.max(jobToks.size, artToks.length);
}

function correlate(jobs, articles) {
  return jobs.map(job => {
    const scored = articles
      .map(a => ({ ...a, _score: matchScore(job, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...job, _matches: scored, _informed: scored.length > 0 };
  });
}

function statusColor(st) {
  const s = String(st || '').toLowerCase();
  if (s.includes('run') || s.includes('active') || s.includes('live'))   return '#22c55e';
  if (s.includes('pend') || s.includes('queue') || s.includes('wait'))   return '#facc15';
  if (s.includes('done') || s.includes('complet') || s.includes('success')) return '#94a3b8';
  if (s.includes('fail') || s.includes('error') || s.includes('abort'))  return '#f87171';
  return '#64748b';
}

// ── styles ────────────────────────────────────────────────────────────────────
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

// ── component ─────────────────────────────────────────────────────────────────
const TABS = ['ALL', 'INFORMED', 'FLYING-BLIND'];

export default function KnowledgeSwarmJobCoverage() {
  const [open,       setOpen]       = useState(false);
  const [articles,   setArticles]   = useState([]);
  const [jobs,       setJobs]       = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState('');
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [kbR, jobsR] = await Promise.allSettled([
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawArticles = normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []);
      const rawJobs     = normaliseJobs(jobsR.status === 'fulfilled' ? jobsR.value : []);
      setArticles(rawArticles);
      setJobs(rawJobs);
      setEnriched(correlate(rawJobs, rawArticles));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:swkb-toggle', h);
    return () => window.removeEventListener('jarvis:swkb-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const informed = enriched.filter(j => j._informed).length;
    const blind    = enriched.filter(j => !j._informed).length;
    const prompt =
      `Knowledge × SwarmJob Coverage: ${jobs.length} active swarm jobs cross-matched against ` +
      `${articles.length} knowledge base articles. ${informed} jobs are INFORMED (KB backing found); ` +
      `${blind} are FLYING-BLIND (no knowledge base coverage — operational knowledge gap). ` +
      `Uninformed jobs: ${enriched.filter(j => !j._informed).slice(0, 5).map(j => j.name).join(', ') || 'none'}. ` +
      `Provide a 2-sentence swarm-knowledge assessment: which swarm job domains are well-documented ` +
      `in the knowledge base, and which operational gaps need immediate KB article creation.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const blindCount = enriched.filter(j => !j._informed).length;
  const badgeColor = blindCount > 0 ? AM : '#22c55e';

  const visible = enriched.filter(job => {
    if (search && !job.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'INFORMED')      return job._informed;
    if (tab === 'FLYING-BLIND')  return !job._informed;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × SwarmJob Coverage"
        style={{
          position: 'fixed',
          left: 688000,
          bottom: 8,
          zIndex: 257,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: blindCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        SWKB
        {blindCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {blindCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9101,
          width: 'min(700px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 14,
          boxShadow: '0 0 60px rgba(245,158,11,0.12)',
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ KNOWLEDGE × SWARMJOB COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${jobs.length} jobs · ${articles.length} KB articles`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'SWARM JOBS',    val: enriched.length,                          color: '#94a3b8' },
              { label: 'KB ARTICLES',   val: articles.length,                          color: '#94a3b8' },
              { label: 'INFORMED',      val: enriched.filter(j => j._informed).length, color: '#22c55e' },
              { label: 'FLYING-BLIND',  val: blindCount,                               color: AM },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.val}</div>
                <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: tab === t ? AM : 'rgba(255,255,255,0.06)',
                color: tab === t ? '#000' : '#94a3b8',
                border: 'none',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search jobs…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map((job) => {
              const isExp    = expanded === job.id;
              const stateClr = job._informed ? '#22c55e' : AM;
              return (
                <div key={job.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : job.id)}
                    style={{ ...ROW, background: isExp ? 'rgba(245,158,11,0.05)' : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(245,158,11,0.05)' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stateClr + '22', color: stateClr }}>
                        {job._informed ? 'INFORMED' : 'FLYING-BLIND'}
                      </span>
                      {job.type && (
                        <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{job.type}</span>
                      )}
                      {job.status && (
                        <span style={{ ...PILL, background: statusColor(job.status) + '22', color: statusColor(job.status) }}>{job.status}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</span>
                      {job._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                          {job._matches.length} article{job._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched KB articles */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {job._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>No KB articles cover this swarm job's domain — operational knowledge gap.</div>
                      ) : (
                        job._matches.map((art) => (
                          <div key={art.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {art.category && (
                              <span style={{ ...PILL, background: 'rgba(99,102,241,0.2)', color: '#818cf8', flexShrink: 0 }}>{art.category}</span>
                            )}
                            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.title}</span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, art._score * 300)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(art._score * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess + assessment */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${AM}44`,
                background: assessing ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)',
                color: AM, cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              }}
            >
              {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
