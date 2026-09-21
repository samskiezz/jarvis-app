import { useState, useEffect, useCallback } from 'react';

const API = '';

const GCIPSWJ_RE = /\b(gcipswj|community[._-]?intel[._-]?swarm|intel[._-]?swarm[._-]?community|graph[._-]?community[._-]?intel|network[._-]?threat[._-]?hunt(?:ing)?|community[._-]?threat[._-]?hunt|blind[._-]?communit(?:y|ies)|hunted[._-]?cluster|threat[._-]?hunted[._-]?cluster|network[._-]?intel[._-]?swarm|community[._-]?hunt(?:ing)?)\b/i;

export function isGcipswjQuery(t) {
  return GCIPSWJ_RE.test(t || '');
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'clusters', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.label || c.name || c.title || `Community ${i + 1}`,
    type:    c.type || c.kind || '',
    members: Array.isArray(c.members) ? c.members.join(' ') : (c.members || ''),
    summary: String(c.summary || c.description || '').slice(0, 250),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = ['intel_profiles', 'profiles', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((p, i) => ({
    id:          p.id || String(i),
    name:        p.name || p.subject || p.title || `Profile ${i + 1}`,
    category:    p.category || p.type || p.actor_type || '',
    nationality: p.nationality || p.country || p.origin || '',
    desc:        String(p.description || p.summary || p.bio || '').slice(0, 200),
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(' ') : (p.aliases || ''),
    tags:        Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = ['jobs', 'swarm_jobs', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.job || `Job ${i + 1}`,
    kind:   j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.summary || j.target || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(comToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || other.subject),
    ...tokens(other.category || other.kind || other.type || ''),
    ...tokens(other.nationality || other.status || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.aliases || other.members || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!comToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (comToks.has(t)) hits++;
  return hits / Math.max(comToks.size, otherToks.length);
}

function correlate(communities, profiles, jobs) {
  return communities.map(com => {
    const comToks = new Set([
      ...tokens(com.name),
      ...tokens(com.type),
      ...tokens(com.members),
      ...tokens(com.summary),
      ...tokens(com.tags),
    ].filter(Boolean));

    const matchedProfiles = profiles
      .map(p => ({ ...p, _score: matchScore(comToks, p) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedJobs = jobs
      .map(j => ({ ...j, _score: matchScore(comToks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasProfile = matchedProfiles.length > 0;
    const hasJob     = matchedJobs.length > 0;

    let coverage;
    if (hasProfile && hasJob) coverage = 'FULLY COVERED';
    else if (hasProfile)      coverage = 'THREAT-ONLY';
    else if (hasJob)          coverage = 'HUNTED';
    else                      coverage = 'BLIND';

    return { ...com, _profiles: matchedProfiles, _jobs: matchedJobs, _coverage: coverage };
  });
}

export async function buildGcipswjScript() {
  const [cR, pR, jR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const communities = normaliseCommunities(cR.status === 'fulfilled' ? cR.value : []);
  const profiles    = normaliseProfiles(pR.status === 'fulfilled' ? pR.value : []);
  const jobs        = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
  const enriched    = correlate(communities, profiles, jobs);
  const fc  = enriched.filter(c => c._coverage === 'FULLY COVERED').length;
  const tho = enriched.filter(c => c._coverage === 'THREAT-ONLY').length;
  const hun = enriched.filter(c => c._coverage === 'HUNTED').length;
  const bli = enriched.filter(c => c._coverage === 'BLIND').length;
  return (
    `Graph Community × Intel Profile × SwarmJob Triple Coverage: ${communities.length} network clusters cross-referenced against ` +
    `${profiles.length} intel profiles and ${jobs.length} swarm jobs. ` +
    `${fc} FULLY COVERED (threat-profiled + swarm-automated); ${tho} THREAT-ONLY (intel profile found, no swarm hunting); ` +
    `${hun} HUNTED (swarm coverage, no intel profile); ${bli} BLIND (no threat intel or swarm coverage — network blind spot). ` +
    `Blind clusters: ${enriched.filter(c => c._coverage === 'BLIND').slice(0, 3).map(c => c.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';
const PU = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY COVERED': LM,
  'THREAT-ONLY':   AM,
  'HUNTED':        PU,
  'BLIND':         RD,
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

const TABS = ['ALL', 'FULLY COVERED', 'THREAT-ONLY', 'HUNTED', 'BLIND'];

export default function GraphCommunityIntelSwarmTriple() {
  const [open, setOpen]         = useState(false);
  const [communities, setComs]  = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cR, pR, jR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
      ]);
      const raw_c = normaliseCommunities(cR.status === 'fulfilled' ? cR.value : []);
      const raw_p = normaliseProfiles(pR.status === 'fulfilled' ? pR.value : []);
      const raw_j = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
      setComs(correlate(raw_c, raw_p, raw_j));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gcipswj-toggle', toggle);
    return () => window.removeEventListener('jarvis:gcipswj-toggle', toggle);
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
      const brief = await buildGcipswjScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Network threat-hunting coverage brief: ${brief}. Give a 2-sentence network threat-hunting coverage assessment.` }),
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
    const blindCount = communities.filter(c => c._coverage === 'BLIND').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × Intel Profile × SwarmJob Triple Coverage (GCIPSWJ)"
        style={{
          position: 'fixed', left: 722720, bottom: 8, zIndex: 319,
          background: blindCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${blindCount > 0 ? RD : CY + '44'}`,
          color: blindCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GCIPSWJ{blindCount > 0 ? ` ⚠${blindCount}` : ''}
      </button>
    );
  }

  const fc  = communities.filter(c => c._coverage === 'FULLY COVERED').length;
  const tho = communities.filter(c => c._coverage === 'THREAT-ONLY').length;
  const hun = communities.filter(c => c._coverage === 'HUNTED').length;
  const bli = communities.filter(c => c._coverage === 'BLIND').length;

  const visible = communities.filter(com =>
    (tab === 'ALL' || com._coverage === tab) &&
    (!search || com.name.toLowerCase().includes(search.toLowerCase()) || com.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ COMMUNITY × INTEL PROFILE × SWARM JOB TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GCIPSWJ</span>
        {bli > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {bli} BLIND</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['CLUSTERS',      communities.length, CY],
          ['FULLY COVERED', fc,                 LM],
          ['THREAT-ONLY',   tho,                AM],
          ['HUNTED',        hun,                PU],
          ['BLIND',         bli,                RD],
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
          {communities.length > 0 && [
            [fc, LM], [tho, AM], [hun, PU], [bli, RD]
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
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${communities.filter(c => c._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search communities…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No communities match filter.</div>}
        {visible.map(com => {
          const color = COVERAGE_COLOR[com._coverage] || CY;
          const isExp = expanded === com.id;
          return (
            <div key={com.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : com.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{com.name}</span>
                {com.type && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{com.type}</span>}
                {chip(com._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Intel Profiles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>INTEL PROFILES ({com._profiles.length})</div>
                    {com._profiles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No intel profile alignment</div>
                      : com._profiles.map(p => (
                        <div key={p.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            {p.category && chip(p.category, AM)}
                            {p.nationality && chip(p.nationality, '#888')}
                          </div>
                          <ScoreBar score={p._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: SwarmJobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SWARM JOBS ({com._jobs.length})</div>
                    {com._jobs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No swarm job alignment</div>
                      : com._jobs.map(j => (
                        <div key={j.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                            {j.kind && chip(j.kind, LM)}
                            {j.status && chip(j.status, '#888')}
                          </div>
                          <ScoreBar score={j._score} color={LM} />
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
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#EF444422', border: `1px solid ${RD}55`, color: RD, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
