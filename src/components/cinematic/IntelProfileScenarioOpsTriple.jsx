import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPSCOE_RE = /\b(ipscoe|intel[\s_-]*profile[\s_-]*scenario[\s_-]*ops|intel[\s_-]*scenario[\s_-]*ops|profile[\s_-]*scenario[\s_-]*ops|threat[\s_-]*actor[\s_-]*scenario[\s_-]*ops|intel[\s_-]*profile[\s_-]*ops[\s_-]*event|intel[\s_-]*ops[\s_-]*scenario|actor[\s_-]*scenario[\s_-]*ops|profile[\s_-]*ops[\s_-]*event|threat[\s_-]*ops[\s_-]*scenario|intel[\s_-]*fully[\s_-]*covered|actor[\s_-]*triple[\s_-]*coverage|intel[\s_-]*profile[\s_-]*triple)\b/i;

const THRESHOLD = 0.07;

export function isIpscoeQuery(t) { return IPSCOE_RE.test(t || ''); }

export async function buildIpscoeScript() {
  try {
    const [profRes, scenRes, opsRes] = await Promise.all([
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const profiles = Array.isArray(profRes) ? profRes : (profRes?.items || profRes?.data || []);
    const scenarios = Array.isArray(scenRes) ? scenRes : (scenRes?.scenarios || scenRes?.items || scenRes?.data || []);
    const ops = Array.isArray(opsRes) ? opsRes : (opsRes?.events || opsRes?.items || opsRes?.data || []);
    let fullyCovered = 0, scenarioOnly = 0, opsOnly = 0, uncovered = 0;
    for (const p of profiles) {
      const raw = [p.name, p.subject, p.description, p.category, p.nationality, ...(p.aliases || []), ...(p.tags || [])].join(' ');
      const toks = tok(raw);
      const hasScen = scenarios.some(s => matchScore(toks, [s.name, s.title, s.description, s.category, ...(s.tags || [])].join(' ')) >= THRESHOLD);
      const hasOps = ops.some(o => matchScore(toks, [o.name, o.type, o.description, o.category, ...(o.tags || [])].join(' ')) >= THRESHOLD);
      if (hasScen && hasOps) fullyCovered++;
      else if (hasScen) scenarioOnly++;
      else if (hasOps) opsOnly++;
      else uncovered++;
    }
    const total = profiles.length || 1;
    const pct = Math.round(((fullyCovered + scenarioOnly + opsOnly) / total) * 100);
    return `IPSCOE triple coverage: ${profiles.length} intel profiles × ${scenarios.length} scenarios × ${ops.length} ops events. Fully covered (scenario+ops): ${fullyCovered} (${Math.round(fullyCovered/total*100)}%). Scenario only: ${scenarioOnly}. Ops only: ${opsOnly}. Uncovered: ${uncovered} (${Math.round(uncovered/total*100)}% — threat actor blind spot). Overall coverage: ${pct}%.`;
  } catch {
    return 'IPSCOE: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

function normaliseProfile(raw) {
  return {
    id: raw.id || raw._id || raw.profile_id || String(Math.random()),
    name: raw.name || raw.subject || raw.profile_id || 'Unnamed Profile',
    category: raw.category || '',
    nationality: raw.nationality || '',
    description: raw.description || '',
    aliases: raw.aliases || [],
    tags: raw.tags || [],
    _raw: [raw.name, raw.subject, raw.description, raw.category, raw.nationality, ...(raw.aliases || []), ...(raw.tags || [])].join(' '),
  };
}

function normaliseScenario(raw) {
  return {
    id: raw.id || raw._id || raw.scenario_id || String(Math.random()),
    title: raw.title || raw.name || raw.scenario_id || 'Unnamed Scenario',
    status: raw.status || '',
    category: raw.category || '',
    _raw: [raw.name, raw.title, raw.description, raw.category, ...(raw.tags || [])].join(' '),
  };
}

function normaliseOps(raw) {
  return {
    id: raw.id || raw._id || raw.event_id || String(Math.random()),
    name: raw.name || raw.type || raw.event_id || 'Unnamed Event',
    severity: raw.severity || raw.level || '',
    type: raw.type || '',
    _raw: [raw.name, raw.type, raw.description, raw.category, ...(raw.tags || [])].join(' '),
  };
}

function classifyProfile(profile, scenarios, ops) {
  const toks = tok(profile._raw);
  const matchedScenarios = scenarios
    .filter(s => matchScore(toks, s._raw) >= THRESHOLD)
    .map(s => ({ ...s, score: matchScore(toks, s._raw) }))
    .sort((a, b) => b.score - a.score);
  const matchedOps = ops
    .filter(o => matchScore(toks, o._raw) >= THRESHOLD)
    .map(o => ({ ...o, score: matchScore(toks, o._raw) }))
    .sort((a, b) => b.score - a.score);
  const hasScen = matchedScenarios.length > 0;
  const hasOps = matchedOps.length > 0;
  let state;
  if (hasScen && hasOps) state = 'FULLY_COVERED';
  else if (hasScen) state = 'SCENARIO_ONLY';
  else if (hasOps) state = 'OPS_ONLY';
  else state = 'UNCOVERED';
  return { ...profile, state, matchedScenarios, matchedOps };
}

const STATE_COLOR = {
  FULLY_COVERED: '#06b6d4',
  SCENARIO_ONLY: '#8b5cf6',
  OPS_ONLY: '#f59e0b',
  UNCOVERED: '#4a5568',
};

const STATE_LABEL = {
  FULLY_COVERED: 'FULLY COVERED',
  SCENARIO_ONLY: 'SCENARIO ONLY',
  OPS_ONLY: 'OPS ONLY',
  UNCOVERED: 'UNCOVERED',
};

export default function IntelProfileScenarioOpsTriple() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [brief, setBrief] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, scenRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const profiles = (Array.isArray(profRes) ? profRes : (profRes?.items || profRes?.data || [])).map(normaliseProfile);
      const scenarios = (Array.isArray(scenRes) ? scenRes : (scenRes?.scenarios || scenRes?.items || scenRes?.data || [])).map(normaliseScenario);
      const ops = (Array.isArray(opsRes) ? opsRes : (opsRes?.events || opsRes?.items || opsRes?.data || [])).map(normaliseOps);
      setItems(profiles.map(p => classifyProfile(p, scenarios, ops)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:ipscoe-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ipscoe-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async (profile) => {
    setAssessing(profile.id);
    try {
      const prompt = `Intel profile "${profile.name}" (category: ${profile.category || 'unknown'}, nationality: ${profile.nationality || 'unknown'}) — triple coverage state: ${STATE_LABEL[profile.state]}. Matched scenarios: ${profile.matchedScenarios.map(s => s.title).join(', ') || 'none'}. Matched ops events: ${profile.matchedOps.map(o => o.name).join(', ') || 'none'}. Give a 2-sentence threat actor operational coverage brief and recommend the single highest-priority action.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const d = r.ok ? await r.json() : {};
      const text = d.response || d.text || d.message || 'No assessment available.';
      setBrief(b => ({ ...b, [profile.id]: text }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief(b => ({ ...b, [profile.id]: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  }, []);

  if (!open) return null;

  const fullyCovered = items.filter(i => i.state === 'FULLY_COVERED').length;
  const scenarioOnly = items.filter(i => i.state === 'SCENARIO_ONLY').length;
  const opsOnly = items.filter(i => i.state === 'OPS_ONLY').length;
  const uncovered = items.filter(i => i.state === 'UNCOVERED').length;
  const total = items.length || 1;
  const coveredPct = Math.round(fullyCovered / total * 100);

  const visible = items.filter(it => {
    if (filter !== 'ALL' && it.state !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!it.name.toLowerCase().includes(s) && !it.category.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const barSegs = [
    { state: 'FULLY_COVERED', count: fullyCovered },
    { state: 'SCENARIO_ONLY', count: scenarioOnly },
    { state: 'OPS_ONLY', count: opsOnly },
    { state: 'UNCOVERED', count: uncovered },
  ];

  const TILE = { minWidth: 80, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', textAlign: 'center' };
  const CY = '#06b6d4';

  return (
    <div style={{
      position: 'fixed', left: 871680, bottom: 8, zIndex: 565,
      width: 520, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,11,18,0.97)', border: `1px solid ${CY}44`,
      borderRadius: 12, boxShadow: `0 0 40px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${CY}22`, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 15, textShadow: `0 0 10px ${CY}` }}>◈</span>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>IPSCOE</span>
        <span style={{ fontSize: 10, color: '#6E8AA0', marginLeft: 4 }}>INTEL PROFILE × SCENARIO × OPS</span>
        {loading && <span style={{ marginLeft: 'auto', fontSize: 10, color: CY, opacity: 0.7 }}>loading…</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: '#DCEBF5' }}>{items.length}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>PROFILES</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.FULLY_COVERED }}>{fullyCovered}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>FULLY COVERED</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.SCENARIO_ONLY }}>{scenarioOnly}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>SCENARIO ONLY</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.OPS_ONLY }}>{opsOnly}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>OPS ONLY</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.UNCOVERED }}>{uncovered}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>UNCOVERED</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.FULLY_COVERED }}>{coveredPct}%</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>COVERED %</div></div>
      </div>

      {/* Coverage bar */}
      <div style={{ height: 6, display: 'flex', margin: '0 14px 10px', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
        {barSegs.map(seg => (
          <div key={seg.state} style={{ flex: seg.count || 0.01, background: STATE_COLOR[seg.state], transition: 'flex 0.4s' }} title={`${STATE_LABEL[seg.state]}: ${seg.count}`} />
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_COVERED', 'SCENARIO_ONLY', 'OPS_ONLY', 'UNCOVERED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '3px 9px', borderRadius: 4, fontSize: 9, cursor: 'pointer', letterSpacing: 1,
            border: `1px solid ${filter === f ? CY : '#2a3a4a'}`,
            background: filter === f ? `${CY}22` : 'transparent',
            color: filter === f ? CY : '#6E8AA0',
          }}>{f.replace(/_/g, ' ')}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: `1px solid #2a3a4a`, borderRadius: 6, padding: '5px 10px', color: '#DCEBF5', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 14px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>
            {loading ? 'Loading…' : 'No profiles match.'}
          </div>
        )}
        {visible.map(profile => {
          const isExp = expanded === profile.id;
          const col = STATE_COLOR[profile.state];
          return (
            <div key={profile.id} style={{ marginBottom: 6, borderRadius: 8, border: `1px solid ${col}33`, background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : profile.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0, boxShadow: `0 0 6px ${col}` }} />
                <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name}</span>
                {profile.category && <span style={{ fontSize: 9, color: '#6E8AA0', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>{profile.category}</span>}
                <span style={{ fontSize: 9, color: col, letterSpacing: 1, flexShrink: 0 }}>{STATE_LABEL[profile.state]}</span>
                <span style={{ fontSize: 10, color: '#6E8AA0' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}22` }}>
                  {profile.nationality && (
                    <div style={{ fontSize: 10, color: '#6E8AA0', marginTop: 6, marginBottom: 4 }}>Nationality: <span style={{ color: '#DCEBF5' }}>{profile.nationality}</span></div>
                  )}

                  {/* Matched scenarios */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: STATE_COLOR.SCENARIO_ONLY, letterSpacing: 1, marginBottom: 4 }}>MATCHED SCENARIOS ({profile.matchedScenarios.length})</div>
                    {profile.matchedScenarios.length === 0
                      ? <div style={{ fontSize: 10, color: '#4a5568' }}>No scenario coverage</div>
                      : profile.matchedScenarios.slice(0, 4).map(s => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: '#DCEBF5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                            {s.status && <span style={{ fontSize: 8, color: '#6E8AA0', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>{s.status}</span>}
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: '#1a2a3a', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round(s.score * 100)}%`, background: STATE_COLOR.SCENARIO_ONLY, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>

                  {/* Matched ops events */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: STATE_COLOR.OPS_ONLY, letterSpacing: 1, marginBottom: 4 }}>MATCHED OPS EVENTS ({profile.matchedOps.length})</div>
                    {profile.matchedOps.length === 0
                      ? <div style={{ fontSize: 10, color: '#4a5568' }}>No ops event coverage</div>
                      : profile.matchedOps.slice(0, 4).map(o => (
                        <div key={o.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: '#DCEBF5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                            {o.severity && <span style={{ fontSize: 8, color: o.severity === 'CRITICAL' ? '#ef4444' : o.severity === 'WARNING' ? '#f59e0b' : '#6E8AA0', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>{o.severity}</span>}
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: '#1a2a3a', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round(o.score * 100)}%`, background: STATE_COLOR.OPS_ONLY, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(profile)}
                    disabled={assessing === profile.id}
                    style={{
                      marginTop: 10, padding: '5px 14px', borderRadius: 5, fontSize: 10, cursor: 'pointer',
                      border: `1px solid ${CY}66`, background: `${CY}18`, color: CY, letterSpacing: 1,
                      opacity: assessing === profile.id ? 0.5 : 1,
                    }}
                  >
                    {assessing === profile.id ? '…assessing' : '▶ ASSESS'}
                  </button>

                  {brief[profile.id] && (
                    <div style={{ marginTop: 8, fontSize: 10, color: '#DCEBF5', lineHeight: 1.5, background: 'rgba(6,182,212,0.06)', borderRadius: 6, padding: '8px 10px', borderLeft: `2px solid ${CY}66` }}>
                      {brief[profile.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
