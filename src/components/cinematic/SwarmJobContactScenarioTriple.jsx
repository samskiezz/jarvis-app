import { useState, useEffect, useCallback } from 'react';

const API = '';

const SJCSTRI_RE = /\b(swarm[._-]?job[._-]?contact[._-]?scenario|sjcstri|swarm[._-]?contact[._-]?scenario|autonomous[._-]?swarm|contactless[._-]?swarm|unplanned[._-]?swarm|swarm[._-]?integration|swarm[._-]?staff|staffed[._-]?swarm|swarm[._-]?coverage[._-]?triple|swarm[._-]?triple)\b/i;

export function isSjcstriQuery(t) {
  return SJCSTRI_RE.test(t || '');
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = ['swarm_jobs', 'swarmjobs', 'jobs', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.job_name || `SwarmJob ${i + 1}`,
    kind:   j.kind || j.type || j.job_type || j.category || '',
    status: j.status || j.state || '',
    target: j.target || j.target_id || j.domain || '',
    desc:   String(j.description || j.objective || j.summary || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'people', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:   c.id || String(i),
    name: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.job_title || '',
    org:  c.org || c.company || c.organisation || c.organization || '',
    desc: String(c.description || c.bio || c.notes || '').slice(0, 200),
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'simulations', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:     s.id || String(i),
    name:   s.name || s.title || s.objective || `Scenario ${i + 1}`,
    kind:   s.kind || s.type || s.category || '',
    status: s.status || s.state || '',
    desc:   String(s.description || s.objective || s.summary || '').slice(0, 200),
    tags:   Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(jobToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title),
    ...tokens(other.role || other.kind || other.type || other.category || ''),
    ...tokens(other.org || ''),
    ...tokens(other.desc || other.description || other.summary || other.objective || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!jobToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (jobToks.has(t)) hits++;
  return hits / Math.max(jobToks.size, otherToks.length);
}

function correlate(jobs, contacts, scenarios) {
  return jobs.map(job => {
    const jobToks = new Set([
      ...tokens(job.name),
      ...tokens(job.kind),
      ...tokens(job.target),
      ...tokens(job.desc),
      ...tokens(job.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(jobToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(jobToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact  = matchedContacts.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let coverage;
    if (hasContact && hasScenario)  coverage = 'FULLY INTEGRATED';
    else if (hasScenario)           coverage = 'CONTACTLESS';
    else if (hasContact)            coverage = 'UNPLANNED';
    else                            coverage = 'AUTONOMOUS';

    return { ...job, _contacts: matchedContacts, _scenarios: matchedScenarios, _coverage: coverage };
  });
}

export async function buildSjcstriScript() {
  const [jR, cR, sR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
  ]);
  const jobs      = normaliseSwarmJobs(jR.status === 'fulfilled' ? jR.value : []);
  const contacts  = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const scenarios = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const enriched  = correlate(jobs, contacts, scenarios);
  const fi  = enriched.filter(j => j._coverage === 'FULLY INTEGRATED').length;
  const cl  = enriched.filter(j => j._coverage === 'CONTACTLESS').length;
  const up  = enriched.filter(j => j._coverage === 'UNPLANNED').length;
  const au  = enriched.filter(j => j._coverage === 'AUTONOMOUS').length;
  return (
    `SwarmJob × Contact × Scenario Triple Coverage: ${jobs.length} swarm jobs cross-referenced against ` +
    `${contacts.length} contacts and ${scenarios.length} scenarios. ` +
    `${fi} FULLY INTEGRATED (contact-managed + scenario-planned); ${cl} CONTACTLESS (scenario exists, no contact owner); ` +
    `${up} UNPLANNED (contact found, no scenario plan); ${au} AUTONOMOUS (no contact or scenario — isolated automation). ` +
    `Autonomous jobs: ${enriched.filter(j => j._coverage === 'AUTONOMOUS').slice(0, 3).map(j => j.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 700;
const PANEL_H = 620;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';
const TE = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY INTEGRATED': GR,
  'CONTACTLESS':      CY,
  'UNPLANNED':        AM,
  'AUTONOMOUS':       RD,
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

const TABS = ['ALL', 'FULLY INTEGRATED', 'CONTACTLESS', 'UNPLANNED', 'AUTONOMOUS'];

export default function SwarmJobContactScenarioTriple() {
  const [open, setOpen]       = useState(false);
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [jR, cR, sR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      ]);
      const raw_j = normaliseSwarmJobs(jR.status === 'fulfilled' ? jR.value : []);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      setJobs(correlate(raw_j, raw_c, raw_s));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjcstri-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjcstri-toggle', toggle);
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
      const brief = await buildSjcstriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `SwarmJob × Contact × Scenario triple coverage: ${brief}. Give a 2-sentence swarm integration assessment.` }),
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
    const autoCount = jobs.filter(j => j._coverage === 'AUTONOMOUS').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="SwarmJob × Contact × Scenario Triple Coverage (SJCSTRI)"
        style={{
          position: 'fixed', left: 721040, bottom: 8, zIndex: 316,
          background: autoCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${autoCount > 0 ? RD : CY + '44'}`,
          color: autoCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SJCSTRI{autoCount > 0 ? ` ⚠${autoCount}` : ''}
      </button>
    );
  }

  const fi = jobs.filter(j => j._coverage === 'FULLY INTEGRATED').length;
  const cl = jobs.filter(j => j._coverage === 'CONTACTLESS').length;
  const up = jobs.filter(j => j._coverage === 'UNPLANNED').length;
  const au = jobs.filter(j => j._coverage === 'AUTONOMOUS').length;

  const visible = jobs.filter(job =>
    (tab === 'ALL' || job._coverage === tab) &&
    (!search || job.name.toLowerCase().includes(search.toLowerCase()) || job.kind.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ SWARMJOB × CONTACT × SCENARIO TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SJCSTRI</span>
        {au > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {au} AUTONOMOUS</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SWARM JOBS',        jobs.length, CY],
          ['FULLY INTEGRATED',  fi, GR],
          ['CONTACTLESS',       cl, CY],
          ['UNPLANNED',         up, AM],
          ['AUTONOMOUS',        au, RD],
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
            [fi, GR], [cl, CY], [up, AM], [au, RD]
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
          }}>{t}{t !== 'ALL' ? ` (${jobs.filter(j => j._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search swarm jobs…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No swarm jobs match filter.</div>}
        {visible.map(job => {
          const color = COVERAGE_COLOR[job._coverage] || CY;
          const isExp = expanded === job.id;
          return (
            <div key={job.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : job.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</span>
                {job.kind   && chip(job.kind, LM)}
                {job.status && chip(job.status, TE)}
                {chip(job._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Contacts */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({job._contacts.length})</div>
                    {job._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact owner</div>
                      : job._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.role && chip(c.role, CY)}
                            {c.org  && chip(c.org, TE)}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>SCENARIOS ({job._scenarios.length})</div>
                    {job._scenarios.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No scenario plan</div>
                      : job._scenarios.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.kind   && chip(s.kind, AM)}
                            {s.status && chip(s.status, GR)}
                          </div>
                          <ScoreBar score={s._score} color={AM} />
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

      {/* Footer: ASSESS */}
      <div style={{ borderTop: '1px solid #00CFFF22', padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          padding: '3px 10px', fontSize: 10, borderRadius: 4, cursor: assessing ? 'default' : 'pointer',
          background: assessing ? '#1a1a2a' : '#00CFFF22', border: '1px solid #00CFFF55', color: CY,
        }}>
          {assessing ? '◌ Assessing…' : '▶ JARVIS ASSESS'}
        </button>
        {assessText && (
          <div style={{ flex: 1, fontSize: 9, color: '#94A3B8', lineHeight: 1.4, overflow: 'hidden' }}>
            {assessText.slice(0, 220)}{assessText.length > 220 ? '…' : ''}
          </div>
        )}
        <button onClick={load} style={{ background: 'none', border: '1px solid #333', color: '#666', borderRadius: 3, padding: '2px 6px', fontSize: 9, cursor: 'pointer' }}>↺</button>
      </div>
    </div>
  );
}
