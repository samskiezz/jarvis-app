import { useState, useEffect, useCallback } from 'react';

const API = '';

const SKSCEN3_RE = /\b(scenario[._-]?skill[._-]?swarm|skscen3|triple[._-]?arm(ed)?|arm(ed)?[._-]?scenario|scenario[._-]?arsenal|fully[._-]?arm(ed)?|scenario[._-]?coverage[._-]?triple|swarm[._-]?skill[._-]?scenario|skill[._-]?swarm[._-]?scenario|armed[._-]?scen)\b/i;

export function isSkscen3Query(t) {
  return SKSCEN3_RE.test(t || '');
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || `Scenario ${i + 1}`,
    status:      s.status || s.state || '',
    category:    s.category || s.type || '',
    description: String(s.description || s.summary || s.objective || '').slice(0, 300),
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || `Skill ${i + 1}`,
    category:    s.category || s.type || '',
    domain:      s.domain || s.area || '',
    description: String(s.description || s.summary || '').slice(0, 300),
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseSwarm(raw) {
  if (!raw) return [];
  const arr = ['swarm_jobs', 'jobs', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || s.job_id || `Job ${i + 1}`,
    kind:        s.kind || s.type || s.job_type || '',
    status:      s.status || s.state || '',
    description: String(s.description || s.summary || s.target || '').slice(0, 300),
    domain:      s.domain || s.area || '',
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(scenToks, other) {
  const otherToks = [
    ...tokens(other.name),
    ...tokens(other.description),
    ...tokens(other.category),
    ...tokens(other.domain),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!scenToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (scenToks.has(t)) hits++;
  return hits / Math.max(scenToks.size, otherToks.length);
}

function correlate(scenarios, skills, swarm) {
  return scenarios.map(scen => {
    const scenToks = new Set([
      ...tokens(scen.name),
      ...tokens(scen.description),
      ...tokens(scen.category),
      ...tokens(scen.tags),
    ].filter(Boolean));

    const matchedSkills = skills
      .map(sk => ({ ...sk, _score: matchScore(scenToks, sk) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedSwarm = swarm
      .map(sj => ({ ...sj, _score: matchScore(scenToks, sj) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasSkill = matchedSkills.length > 0;
    const hasSwarm = matchedSwarm.length > 0;

    let coverage;
    if (hasSkill && hasSwarm)  coverage = 'FULLY ARMED';
    else if (hasSkill)          coverage = 'SKILLED ONLY';
    else if (hasSwarm)          coverage = 'AUTOMATED ONLY';
    else                        coverage = 'UNARMED';

    return { ...scen, _skills: matchedSkills, _swarm: matchedSwarm, _coverage: coverage };
  });
}

export async function buildSkscen3Script() {
  const [scnR, skR, swR] = await Promise.allSettled([
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const scenarios = normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []);
  const skills    = normaliseSkills(skR.status === 'fulfilled' ? skR.value : []);
  const swarm     = normaliseSwarm(swR.status === 'fulfilled' ? swR.value : []);
  const enriched  = correlate(scenarios, skills, swarm);
  const fa  = enriched.filter(s => s._coverage === 'FULLY ARMED').length;
  const sko = enriched.filter(s => s._coverage === 'SKILLED ONLY').length;
  const auo = enriched.filter(s => s._coverage === 'AUTOMATED ONLY').length;
  const ua  = enriched.filter(s => s._coverage === 'UNARMED').length;
  return (
    `Scenario × Skill × SwarmJob Triple Coverage: ${scenarios.length} scenarios analysed against ${skills.length} skills and ${swarm.length} swarm jobs. ` +
    `${fa} are FULLY ARMED (skill-backed + swarm-automated); ${sko} are SKILLED ONLY (no swarm automation); ` +
    `${auo} are AUTOMATED ONLY (no skill coverage); ${ua} are UNARMED (no backing — capability gap). ` +
    `Top unarmed scenarios: ${enriched.filter(s => s._coverage === 'UNARMED').slice(0, 3).map(s => s.name || s.id || '?').join(', ') || 'none'}.`
  );
}

const PANEL_W = 640;
const PANEL_H = 590;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';
const PU = '#A78BFA';

const COVERAGE_COLOR = {
  'FULLY ARMED':    GR,
  'SKILLED ONLY':   LM,
  'AUTOMATED ONLY': AM,
  'UNARMED':        RD,
};

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 56, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

const TABS = ['ALL', 'FULLY ARMED', 'SKILLED ONLY', 'AUTOMATED ONLY', 'UNARMED'];

export default function ScenarioSkillSwarmCoverage() {
  const [open, setOpen]         = useState(false);
  const [scenarios, setScen]    = useState([]);
  const [skills, setSkills]     = useState([]);
  const [swarm, setSwarm]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scnR, skR, swR] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
      ]);
      setScen(normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []));
      setSkills(normaliseSkills(skR.status === 'fulfilled' ? skR.value : []));
      setSwarm(normaliseSwarm(swR.status === 'fulfilled' ? swR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:skscen3-toggle', onToggle);
    return () => window.removeEventListener('jarvis:skscen3-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched      = correlate(scenarios, skills, swarm);
  const fullyArmed    = enriched.filter(s => s._coverage === 'FULLY ARMED');
  const skilledOnly   = enriched.filter(s => s._coverage === 'SKILLED ONLY');
  const automatedOnly = enriched.filter(s => s._coverage === 'AUTOMATED ONLY');
  const unarmed       = enriched.filter(s => s._coverage === 'UNARMED');
  const badgeCount    = unarmed.length;
  const badgeColor    = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(s => tab === 'ALL' || s._coverage === tab)
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(s.name     || '').toLowerCase().includes(q) ||
        String(s.category || '').toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message:
            `Scenario × Skill × SwarmJob Triple Coverage analysis: ${scenarios.length} scenarios, ${skills.length} skills, ${swarm.length} swarm jobs. ` +
            `${fullyArmed.length} scenarios are FULLY ARMED (skill-backed + swarm-automated); ` +
            `${skilledOnly.length} are SKILLED ONLY (no swarm automation); ` +
            `${automatedOnly.length} are AUTOMATED ONLY (no skill coverage); ` +
            `${unarmed.length} are UNARMED (no skill or swarm backing — capability gap). ` +
            `Give a 2-sentence triple-coverage arsenal readiness brief highlighting the most critical gap and strongest coverage area.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = s => s.name || s.id || '?';

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Scenario × Skill × SwarmJob Triple Coverage (SKSCEN3)"
        style={{
          position: 'fixed', left: 714320, bottom: 8, zIndex: 304,
          width: 72, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ SKSCEN3
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9211,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ SCENARIO × SKILL × SWARM TRIPLE COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'SCENARIOS',    val: scenarios.length,    col: CY },
              { label: 'SKILLS',       val: skills.length,       col: LM },
              { label: 'SWARM JOBS',   val: swarm.length,        col: AM },
              { label: 'FULLY ARMED',  val: fullyArmed.length,   col: GR },
              { label: 'UNARMED',      val: unarmed.length,      col: RD },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '5px 6px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Coverage breakdown bar */}
          {enriched.length > 0 && (
            <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                {[
                  { count: fullyArmed.length,    color: GR },
                  { count: skilledOnly.length,   color: LM },
                  { count: automatedOnly.length, color: AM },
                  { count: unarmed.length,       color: RD },
                ].map(({ count, color }, i) => (
                  <div key={i} style={{
                    flex: count, background: color, minWidth: count > 0 ? 2 : 0, opacity: 0.8,
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {[
                  { label: 'FULLY ARMED',    color: GR, count: fullyArmed.length },
                  { label: 'SKILLED ONLY',   color: LM, count: skilledOnly.length },
                  { label: 'AUTOMATED ONLY', color: AM, count: automatedOnly.length },
                  { label: 'UNARMED',        color: RD, count: unarmed.length },
                ].map(({ label: l, color, count }) => (
                  <span key={l} style={{ color: '#6E8AA0', fontSize: 9 }}>
                    <span style={{ color }}>{count}</span> {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#2a3a4a'}`,
                  background: tab === t ? `${(COVERAGE_COLOR[t] || CY)}22` : 'transparent',
                  color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 140,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No scenarios found.'}
              </div>
            ) : filtered.map((scen, i) => {
              const isExp  = expanded === i;
              const covClr = COVERAGE_COLOR[scen._coverage] || CY;
              return (
                <div
                  key={scen.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: covClr,
                      boxShadow: `0 0 6px ${covClr}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(scen)}</span>
                    {scen.status && chip(String(scen.status).toUpperCase(), covClr)}
                    {chip(scen._coverage, covClr)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4, display: 'flex', gap: 12 }}>
                      {/* Skills */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          SKILLS ({scen._skills.length})
                        </div>
                        {scen._skills.length > 0 ? scen._skills.map((sk, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>{sk.name || sk.id || '?'}</span>
                            {sk.category && chip(sk.category.toUpperCase(), LM)}
                            {scorebar(sk._score, LM)}
                          </div>
                        )) : (
                          <div style={{ color: RD, fontSize: 10 }}>No skills matched.</div>
                        )}
                      </div>
                      {/* Swarm jobs */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          SWARM JOBS ({scen._swarm.length})
                        </div>
                        {scen._swarm.length > 0 ? scen._swarm.map((sj, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>{sj.name || sj.id || '?'}</span>
                            {sj.kind && chip(sj.kind.toUpperCase(), AM)}
                            {scorebar(sj._score, AM)}
                          </div>
                        )) : (
                          <div style={{ color: AM, fontSize: 10 }}>No swarm jobs matched.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
