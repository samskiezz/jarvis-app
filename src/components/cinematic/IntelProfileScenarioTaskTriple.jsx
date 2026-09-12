import { useState, useEffect, useCallback } from 'react';

const API = '';

const IPSTRI_RE = /\b(intel[._-]?profile[._-]?scenario[._-]?task|ipstri|threat[._-]?counter|threat[._-]?response[._-]?plan|fully[._-]?countered|uncountered[._-]?threat|profile[._-]?response|scenario[._-]?intel[._-]?task|intel[._-]?triple|profile[._-]?triple[._-]?cover|threat[._-]?actor[._-]?response)\b/i;

export function isIpstriQuery(t) {
  return IPSTRI_RE.test(t || '');
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = ['intel_profiles', 'intelProfiles', 'profiles', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((p, i) => ({
    id:          p.id || String(i),
    name:        p.name || p.subject || p.title || `Profile ${i + 1}`,
    category:    p.category || p.type || p.actor_type || '',
    nationality: p.nationality || p.country || p.origin || '',
    description: String(p.description || p.summary || p.background || '').slice(0, 300),
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(' ') : (p.aliases || ''),
    tags:        Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || s.scenario || `Scenario ${i + 1}`,
    status:      s.status || s.state || '',
    category:    s.category || s.type || '',
    description: String(s.description || s.summary || s.objective || '').slice(0, 200),
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.name || t.title || t.task || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.summary || t.mission || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(profileToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.category || other.sector || other.kind || ''),
    ...tokens(other.description || other.desc || other.summary || other.objective || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!profileToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (profileToks.has(t)) hits++;
  return hits / Math.max(profileToks.size, otherToks.length);
}

function correlate(profiles, scenarios, tasks) {
  return profiles.map(profile => {
    const pToks = new Set([
      ...tokens(profile.name),
      ...tokens(profile.category),
      ...tokens(profile.description),
      ...tokens(profile.aliases),
      ...tokens(profile.tags),
    ].filter(Boolean));

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(pToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(pToks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasScenario = matchedScenarios.length > 0;
    const hasTask     = matchedTasks.length > 0;

    let coverage;
    if (hasScenario && hasTask) coverage = 'FULLY COUNTERED';
    else if (hasScenario)       coverage = 'PLANNED';
    else if (hasTask)           coverage = 'TRACKED';
    else                        coverage = 'UNCOUNTERED';

    return { ...profile, _scenarios: matchedScenarios, _tasks: matchedTasks, _coverage: coverage };
  });
}

export async function buildIpstriScript() {
  const [pR, sR, tR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const profiles   = normaliseProfiles(pR.status === 'fulfilled' ? pR.value : []);
  const scenarios  = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const tasks      = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
  const enriched   = correlate(profiles, scenarios, tasks);
  const fc  = enriched.filter(p => p._coverage === 'FULLY COUNTERED').length;
  const pl  = enriched.filter(p => p._coverage === 'PLANNED').length;
  const tr  = enriched.filter(p => p._coverage === 'TRACKED').length;
  const unc = enriched.filter(p => p._coverage === 'UNCOUNTERED').length;
  return (
    `Intel Profile × Scenario × Task Triple Coverage: ${profiles.length} threat actor profiles cross-referenced against ${scenarios.length} scenarios and ${tasks.length} tasks. ` +
    `${fc} are FULLY COUNTERED (scenario-planned + task-backed); ${pl} are PLANNED (scenario exists, no task response); ` +
    `${tr} are TRACKED (task exists, no scenario plan); ${unc} are UNCOUNTERED (no scenario or task — threat response gap). ` +
    `Uncountered profiles: ${enriched.filter(p => p._coverage === 'UNCOUNTERED').slice(0, 3).map(p => p.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const PU = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY COUNTERED': GR,
  'PLANNED':         AM,
  'TRACKED':         CY,
  'UNCOUNTERED':     RD,
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

const TABS = ['ALL', 'FULLY COUNTERED', 'PLANNED', 'TRACKED', 'UNCOUNTERED'];

export default function IntelProfileScenarioTaskTriple() {
  const [open, setOpen]         = useState(false);
  const [profiles, setProfiles] = useState([]);
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
      const [pR, sR, tR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_p = normaliseProfiles(pR.status === 'fulfilled' ? pR.value : []);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      const raw_t = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
      setProfiles(correlate(raw_p, raw_s, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ipstri-toggle', toggle);
    return () => window.removeEventListener('jarvis:ipstri-toggle', toggle);
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
      const brief = await buildIpstriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Intel profile × scenario × task triple coverage brief: ${brief}. Give a 2-sentence threat response assessment.` }),
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
    const uncCount = profiles.filter(p => p._coverage === 'UNCOUNTERED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Scenario × Task Triple Coverage (IPSTRI)"
        style={{
          position: 'fixed', left: 718800, bottom: 8, zIndex: 312,
          background: uncCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${uncCount > 0 ? RD : CY + '44'}`,
          color: uncCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ IPSTRI{uncCount > 0 ? ` ⚠${uncCount}` : ''}
      </button>
    );
  }

  const fc  = profiles.filter(p => p._coverage === 'FULLY COUNTERED').length;
  const pl  = profiles.filter(p => p._coverage === 'PLANNED').length;
  const tr  = profiles.filter(p => p._coverage === 'TRACKED').length;
  const unc = profiles.filter(p => p._coverage === 'UNCOUNTERED').length;

  const visible = profiles.filter(prof =>
    (tab === 'ALL' || prof._coverage === tab) &&
    (!search || prof.name.toLowerCase().includes(search.toLowerCase()) || prof.category.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ INTEL PROFILE × SCENARIO × TASK TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>IPSTRI</span>
        {unc > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {unc} UNCOUNTERED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['PROFILES',         profiles.length, CY],
          ['FULLY COUNTERED',  fc,  GR],
          ['PLANNED',          pl,  AM],
          ['TRACKED',          tr,  PU],
          ['UNCOUNTERED',      unc, RD],
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
          {profiles.length > 0 && [
            [fc, GR], [pl, AM], [tr, PU], [unc, RD]
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
          }}>{t}{t !== 'ALL' ? ` (${profiles.filter(p => p._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search intel profiles…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No intel profiles match filter.</div>}
        {visible.map(prof => {
          const color = COVERAGE_COLOR[prof._coverage] || CY;
          const isExp = expanded === prof.id;
          return (
            <div key={prof.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : prof.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prof.name}</span>
                {prof.category && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{prof.category}</span>}
                {prof.nationality && chip(prof.nationality, PU)}
                {chip(prof._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>SCENARIOS ({prof._scenarios.length})</div>
                    {prof._scenarios.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No scenario alignment</div>
                      : prof._scenarios.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.status && chip(s.status, AM)}
                            {s.category && chip(s.category, CY)}
                          </div>
                          <ScoreBar score={s._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({prof._tasks.length})</div>
                    {prof._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task alignment</div>
                      : prof._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status && chip(t.status, GR)}
                            {t.priority && chip(t.priority, t.priority?.toLowerCase().includes('high') || t.priority?.toLowerCase().includes('crit') ? RD : AM)}
                          </div>
                          <ScoreBar score={t._score} color={GR} />
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
