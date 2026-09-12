import { useState, useEffect, useCallback } from 'react';

const API = '';

const SKSCEN_RE = /\b(skill[._-]?scenario|scenario[._-]?skill|skscen|applied[._-]?skills?|untested[._-]?skills?|skill[._-]?readiness[._-]?scenario|scenario[._-]?skill[._-]?coverage|skill[._-]?scenario[._-]?coverage|which[._-]?skills?[._-]?have[._-]?scenarios?|skill[._-]?scenario[._-]?gap|scenario[._-]?backed[._-]?skill)\b/i;

export function isSkscenQuery(t) {
  return SKSCEN_RE.test(t || '');
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [hint, 'skills', 'scenarios', 'items', 'results', 'data', 'records', 'entities'].filter(Boolean);
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function skillTokens(skill) {
  return new Set([
    ...tokens(skill.name),
    ...tokens(skill.title),
    ...tokens(skill.description),
    ...tokens(skill.category),
    ...tokens(skill.domain),
    ...(Array.isArray(skill.tags) ? skill.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean));
}

function scenarioTokens(sc) {
  return [
    ...tokens(sc.title),
    ...tokens(sc.name),
    ...tokens(sc.description),
    ...tokens(sc.objective),
    ...tokens(sc.category),
    ...tokens(sc.type),
    ...(Array.isArray(sc.tags) ? sc.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean);
}

function matchScore(skill, scenario) {
  const skToks = skillTokens(skill);
  const scToks = scenarioTokens(scenario);
  if (!skToks.size || !scToks.length) return 0;
  let hits = 0;
  for (const t of scToks) if (skToks.has(t)) hits++;
  return hits / Math.max(skToks.size, scToks.length);
}

function correlate(skills, scenarios) {
  return skills.map(skill => {
    const scored = scenarios
      .map(sc => ({ sc, score: matchScore(skill, sc) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...skill, _matches: scored, _applied: scored.length > 0 };
  });
}

export async function buildSkscenScript() {
  const [skR, scR] = await Promise.allSettled([
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
  ]);
  const skills = normaliseArray(skR.status === 'fulfilled' ? skR.value : [], 'skills');
  const scenarios = normaliseArray(scR.status === 'fulfilled' ? scR.value : [], 'scenarios');
  const enriched = correlate(skills, scenarios);
  const untested = enriched.filter(s => !s._applied).length;
  const applied = enriched.length - untested;
  const topUntested = enriched
    .filter(s => !s._applied)
    .slice(0, 3)
    .map(s => s.title || s.name || '?')
    .join(', ') || 'none';
  return (
    `Skill × Scenario Coverage: ${skills.length} JARVIS skills, ${scenarios.length} operational scenarios indexed. ` +
    `${applied} skill${applied !== 1 ? 's' : ''} have at least one scenario exercising their domain (APPLIED); ` +
    `${untested} skill${untested !== 1 ? 's' : ''} lack any scenario coverage (UNTESTED — readiness gap). ` +
    `Top untested skills: ${topUntested}.`
  );
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active' || s === 'running') return '#22c55e';
  if (s === 'pending' || s === 'draft') return '#eab308';
  if (s === 'completed' || s === 'done') return '#64748b';
  return '#94a3b8';
}

export default function SkillScenarioCoverage() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [skR, scR] = await Promise.allSettled([
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      ]);
      const rawSkills = normaliseArray(skR.status === 'fulfilled' ? skR.value : [], 'skills');
      const rawScenarios = normaliseArray(scR.status === 'fulfilled' ? scR.value : [], 'scenarios');
      setSkills(rawSkills);
      setScenarios(rawScenarios);
      setEnriched(correlate(rawSkills, rawScenarios));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:skscen-toggle', h);
    return () => window.removeEventListener('jarvis:skscen-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const untested = enriched.filter(s => !s._applied).length;
    const applied = enriched.filter(s => s._applied).length;
    const topUntested = enriched
      .filter(s => !s._applied)
      .map(s => s.title || s.name || '?')
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Skill × Scenario Coverage: ${skills.length} JARVIS skills, ${scenarios.length} operational scenarios. ` +
      `${applied} skills have at least one scenario exercising their domain (APPLIED); ` +
      `${untested} skills have zero scenario coverage (UNTESTED — readiness gap). ` +
      `Top untested skills: ${topUntested}. ` +
      `Give a 2-sentence skill readiness and scenario coverage gap brief.`;
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

  const untestedCount = enriched.filter(s => !s._applied).length;
  const badge = untestedCount > 0 ? '#f97316' : '#84cc16';

  const visible = enriched.filter(skill => {
    const label = (skill.title || skill.name || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'APPLIED') return skill._applied;
    if (tab === 'UNTESTED') return !skill._applied;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Skill × Scenario Coverage"
        style={{
          position: 'fixed',
          left: 704800,
          bottom: 8,
          zIndex: 287,
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
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: untestedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        SKSCEN
        {untestedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {untestedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 620,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9671,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#84cc16' }}>◈ SKILL × SCENARIO COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(132,204,22,0.15)', border: '1px solid rgba(132,204,22,0.35)', borderRadius: 6, color: '#84cc16', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SKILLS', val: skills.length, color: '#84cc16' },
              { label: 'SCENARIOS', val: scenarios.length, color: '#38bdf8' },
              { label: 'APPLIED', val: enriched.filter(s => s._applied).length, color: '#22c55e' },
              { label: 'UNTESTED', val: untestedCount, color: untestedCount > 0 ? '#f97316' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.2)', borderRadius: 8, fontSize: 12, color: '#bef264', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'APPLIED', 'UNTESTED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(132,204,22,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(132,204,22,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#84cc16' : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search skills…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No skills match the current filter.</div>
          )}

          <div>
            {visible.map((skill, i) => {
              const id = skill.id || skill._id || i;
              const label = skill.title || skill.name || `Skill ${i + 1}`;
              const cat = skill.category || '';
              const domain = skill.domain || '';
              const desc = skill.description || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: skill._applied ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)',
                      color: skill._applied ? '#22c55e' : '#f97316',
                      border: `1px solid ${skill._applied ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`,
                    }}>
                      {skill._applied ? 'APPLIED' : 'UNTESTED'}
                    </span>
                    {cat && (
                      <span style={{ ...PILL, background: 'rgba(132,204,22,0.12)', color: '#84cc16', border: '1px solid rgba(132,204,22,0.3)' }}>
                        {String(cat).toUpperCase()}
                      </span>
                    )}
                    {domain && (
                      <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                        {String(domain).toLowerCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {skill._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{skill._matches.length} scenario{skill._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {desc && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(desc).slice(0, 220)}</div>
                      )}
                      {skill._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched scenarios:</div>
                          {skill._matches.map(({ sc, score }, j) => {
                            const scLabel = sc.title || sc.name || `scenario-${j}`;
                            const scStatus = sc.status || '';
                            const scCat = sc.category || sc.type || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#7dd3fc', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scLabel}</span>
                                  {scStatus && (
                                    <span style={{ ...PILL, background: `${statusColor(scStatus)}22`, color: statusColor(scStatus), border: `1px solid ${statusColor(scStatus)}44` }}>
                                      {String(scStatus).toUpperCase()}
                                    </span>
                                  )}
                                  {scCat && (
                                    <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                                      {String(scCat).toUpperCase()}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#84cc16', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f97316', fontSize: 11 }}>⚠ No operational scenario found that exercises this skill — readiness gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} skills · {scenarios.length} scenarios indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
