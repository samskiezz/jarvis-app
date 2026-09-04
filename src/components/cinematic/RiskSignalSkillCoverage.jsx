import { useState, useEffect, useCallback } from 'react';

const API = '';

const RSSK_RE = /\b(risk[._-]?signal[._-]?skill|skill[._-]?risk[._-]?signal|rssk|unmitigated[._-]?risk|risk[._-]?skill[._-]?coverage|skill[._-]?risk[._-]?coverage|risk[._-]?mitigation[._-]?skill|mitigated[._-]?risk|which[._-]?risks?[._-]?have[._-]?skills?|risk[._-]?capability[._-]?gap|risk[._-]?skill[._-]?gap|signal[._-]?skill[._-]?coverage|unmitigated[._-]?signal)\b/i;

export function isRsskQuery(t) {
  return RSSK_RE.test(t || '');
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [hint, 'signals', 'skills', 'items', 'results', 'data', 'records', 'entities'].filter(Boolean);
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function signalTokens(sig) {
  return new Set([
    ...tokens(sig.title),
    ...tokens(sig.name),
    ...tokens(sig.signal),
    ...tokens(sig.description),
    ...tokens(sig.category),
    ...tokens(sig.type),
    ...tokens(sig.sector),
    ...tokens(sig.source),
    ...(Array.isArray(sig.tags) ? sig.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean));
}

function skillTokens(skill) {
  return [
    ...tokens(skill.name),
    ...tokens(skill.title),
    ...tokens(skill.description),
    ...tokens(skill.category),
    ...tokens(skill.domain),
    ...(Array.isArray(skill.tags) ? skill.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean);
}

function matchScore(signal, skill) {
  const sigToks = signalTokens(signal);
  const skToks = skillTokens(skill);
  if (!sigToks.size || !skToks.length) return 0;
  let hits = 0;
  for (const t of skToks) if (sigToks.has(t)) hits++;
  return hits / Math.max(sigToks.size, skToks.length);
}

function correlate(signals, skills) {
  return signals.map(sig => {
    const scored = skills
      .map(skill => ({ skill, score: matchScore(sig, skill) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...sig, _matches: scored, _mitigated: scored.length > 0 };
  });
}

export async function buildRsskScript() {
  const [rsR, skR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const signals = normaliseArray(rsR.status === 'fulfilled' ? rsR.value : [], 'signals');
  const skills = normaliseArray(skR.status === 'fulfilled' ? skR.value : [], 'skills');
  const enriched = correlate(signals, skills);
  const unmitigated = enriched.filter(s => !s._mitigated).length;
  const mitigated = enriched.length - unmitigated;
  const topUnmitigated = enriched
    .filter(s => !s._mitigated)
    .slice(0, 3)
    .map(s => s.title || s.name || s.signal || '?')
    .join(', ') || 'none';
  return (
    `Risk Signal × Skill Coverage: ${signals.length} active risk signals, ${skills.length} JARVIS skills indexed. ` +
    `${mitigated} signal${mitigated !== 1 ? 's' : ''} have at least one matching skill (MITIGATED); ` +
    `${unmitigated} signal${unmitigated !== 1 ? 's' : ''} lack any skill coverage (UNMITIGATED — capability gap). ` +
    `Top unmitigated signals: ${topUnmitigated}.`
  );
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '#ef4444';
  if (s === 'high') return '#f97316';
  if (s === 'medium') return '#eab308';
  if (s === 'low') return '#22c55e';
  return '#64748b';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function RiskSignalSkillCoverage() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [skills, setSkills] = useState([]);
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
      const [rsR, skR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      const rawSignals = normaliseArray(rsR.status === 'fulfilled' ? rsR.value : [], 'signals');
      const rawSkills = normaliseArray(skR.status === 'fulfilled' ? skR.value : [], 'skills');
      setSignals(rawSignals);
      setSkills(rawSkills);
      setEnriched(correlate(rawSignals, rawSkills));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:rssk-toggle', h);
    return () => window.removeEventListener('jarvis:rssk-toggle', h);
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
    const unmitigated = enriched.filter(s => !s._mitigated).length;
    const mitigated = enriched.filter(s => s._mitigated).length;
    const topUnmitigated = enriched
      .filter(s => !s._mitigated)
      .map(s => s.title || s.name || s.signal || '?')
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Risk Signal × Skill Coverage: ${signals.length} active risk signals, ${skills.length} JARVIS skills. ` +
      `${mitigated} signals have at least one skill providing coverage (MITIGATED); ` +
      `${unmitigated} signals have zero skill coverage (UNMITIGATED — capability gap). ` +
      `Top unmitigated signals: ${topUnmitigated}. ` +
      `Give a 2-sentence risk-skill capability gap brief.`;
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

  const unmitigatedCount = enriched.filter(s => !s._mitigated).length;
  const badge = unmitigatedCount > 0 ? '#f97316' : '#22c55e';

  const visible = enriched.filter(signal => {
    const label = (signal.title || signal.name || signal.signal || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'MITIGATED') return signal._mitigated;
    if (tab === 'UNMITIGATED') return !signal._mitigated;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Risk Signal × Skill Coverage"
        style={{
          position: 'fixed',
          left: 703680,
          bottom: 8,
          zIndex: 285,
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
          boxShadow: unmitigatedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        RSSK
        {unmitigatedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unmitigatedCount}
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
          zIndex: 9670,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f97316' }}>◈ RISK SIGNAL × SKILL COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 6, color: '#f97316', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SIGNALS', val: signals.length, color: '#f97316' },
              { label: 'SKILLS', val: skills.length, color: '#a78bfa' },
              { label: 'MITIGATED', val: enriched.filter(s => s._mitigated).length, color: '#22c55e' },
              { label: 'UNMITIGATED', val: unmitigatedCount, color: unmitigatedCount > 0 ? '#f97316' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, fontSize: 12, color: '#fdba74', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'MITIGATED', 'UNMITIGATED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f97316' : '#94a3b8',
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
              placeholder="Search signals…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No signals match the current filter.</div>
          )}

          <div>
            {visible.map((signal, i) => {
              const id = signal.id || signal._id || i;
              const label = signal.title || signal.name || signal.signal || `Signal ${i + 1}`;
              const sev = signal.severity || signal.level || signal.priority || '';
              const desc = signal.description || signal.summary || '';
              const cat = signal.category || signal.type || '';
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
                      background: signal._mitigated ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)',
                      color: signal._mitigated ? '#22c55e' : '#f97316',
                      border: `1px solid ${signal._mitigated ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`,
                    }}>
                      {signal._mitigated ? 'MITIGATED' : 'UNMITIGATED'}
                    </span>
                    {sev && (
                      <span style={{ ...PILL, background: `${severityColor(sev)}22`, color: severityColor(sev), border: `1px solid ${severityColor(sev)}44` }}>
                        {String(sev).toUpperCase()}
                      </span>
                    )}
                    {cat && (
                      <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                        {String(cat).toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {signal._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{signal._matches.length} skill{signal._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {desc && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(desc).slice(0, 220)}</div>
                      )}
                      {signal._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched skills:</div>
                          {signal._matches.map(({ skill, score }, j) => {
                            const skillLabel = skill.title || skill.name || `skill-${j}`;
                            const skillCat = skill.category || '';
                            const skillDomain = skill.domain || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#c4b5fd', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skillLabel}</span>
                                  {skillCat && (
                                    <span style={{ ...PILL, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
                                      {String(skillCat).toUpperCase()}
                                    </span>
                                  )}
                                  {skillDomain && (
                                    <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                                      {String(skillDomain).toLowerCase()}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f97316', fontSize: 11 }}>⚠ No JARVIS skill found that covers this risk signal — capability gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} signals · {skills.length} skills indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
