import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPSOE_RE = /\b(ipsoe|intel\s+profile\s+skill\s+ops|intel\s+skill\s+ops|intel\s+ops\s+skill|wired\s+intel\s+profile|dark\s+intel\s+profile\s+ops|intel\s+capability\s+ops|intel\s+profile\s+ops\s+event|intel\s+skill\s+event|intel\s+ops\s+capability|profile\s+skill\s+ops|intel\s+profile\s+operational\s+skill|intel\s+profile\s+ops\s+coverage|intel\s+ops\s+skill\s+coverage)\b/i;

export function isIpsoeQuery(t) {
  return IPSOE_RE.test(t || '');
}

export async function buildIpsoeScript() {
  try {
    const [ipRes, skRes, oeRes] = await Promise.all([
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const profiles = normaliseProfiles(ipRes);
    const skills = normaliseSkills(skRes);
    const ops = normaliseOpsEvents(oeRes);
    const classified = profiles.map(p => classifyProfile(p, skills, ops));
    const fullyWired = classified.filter(p => p.state === 'FULLY_WIRED').length;
    const dark = classified.filter(p => p.state === 'DARK').length;
    return `IPSOE analysis: ${profiles.length} intel profiles cross-referenced against ${skills.length} AIP skills and ${ops.length} ops events. ${fullyWired} profiles are FULLY WIRED with both capability backing and live operational trigger. ${dark} profiles are DARK — no skill or ops event coverage — representing intelligence gaps requiring immediate capability assignment and operational monitoring.`;
  } catch {
    return 'IPSOE data unavailable — check /entities/IntelProfile, /v1/aip/skill, and /v1/ops/events endpoints.';
  }
}

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.profiles) ? raw.profiles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((p, i) => ({
    id: p.id || p._id || `ip-${i}`,
    label: p.name || p.full_name || `Intel Profile ${i + 1}`,
    company: p.company || p.organisation || p.organization || '',
    role: p.role || p.title || p.position || '',
    sector: p.sector || p.industry || '',
    nationality: p.nationality || p.country || '',
    aliases: Array.isArray(p.aliases) ? p.aliases.join(' ') : String(p.aliases || ''),
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    _searchText: [p.name, p.full_name, p.company, p.organisation, p.organization, p.role, p.title, p.position, p.sector, p.industry, p.nationality, p.country, p.aliases, p.tags].filter(Boolean).join(' '),
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.skills) ? raw.skills
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `sk-${i}`,
    label: s.name || s.title || s.skill_name || `Skill ${i + 1}`,
    category: s.category || s.domain || s.type || '',
    description: s.description || s.summary || s.objective || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    _searchText: [s.name, s.title, s.skill_name, s.category, s.domain, s.description, s.summary, s.tags].filter(Boolean).join(' '),
  }));
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.events) ? raw.events
    : Array.isArray(raw.ops_events) ? raw.ops_events
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => ({
    id: e.id || e._id || `oe-${i}`,
    label: e.name || e.title || e.event_name || e.type || `Ops Event ${i + 1}`,
    type: e.type || e.event_type || e.kind || '',
    severity: e.severity || e.priority || e.level || '',
    description: e.description || e.summary || e.details || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    _searchText: [e.name, e.title, e.type, e.event_type, e.severity, e.description, e.summary, e.tags].filter(Boolean).join(' '),
  }));
}

function classifyProfile(profile, skills, opsEvents) {
  const toks = tok(profile._searchText);
  const skillMatches = skills
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._searchText), matchScore(tok(s._searchText), profile._searchText)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const opsMatches = opsEvents
    .map(e => ({ ...e, score: Math.max(matchScore(toks, e._searchText), matchScore(tok(e._searchText), profile._searchText)) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasSkill = skillMatches.length > 0;
  const hasOps = opsMatches.length > 0;
  let state;
  if (hasSkill && hasOps) state = 'FULLY_WIRED';
  else if (hasSkill) state = 'SKILL_BACKED';
  else if (hasOps) state = 'OPS_TRIGGERED';
  else state = 'DARK';
  return { ...profile, state, skillMatches, opsMatches };
}

const STATE_LABELS = {
  FULLY_WIRED: 'FULLY WIRED',
  SKILL_BACKED: 'SKILL-BACKED',
  OPS_TRIGGERED: 'OPS-TRIGGERED',
  DARK: 'DARK',
};

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280', '': '#6b7280' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function IntelProfileSkillOpsTriple() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [ipRes, skRes, oeRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`, { headers }),
        fetch(`${API}/v1/aip/skill`, { headers }),
        fetch(`${API}/v1/ops/events`, { headers }),
      ]);
      const [ipJson, skJson, oeJson] = await Promise.all([ipRes.json(), skRes.json(), oeRes.json()]);
      const ip = normaliseProfiles(ipJson);
      const sk = normaliseSkills(skJson);
      const oe = normaliseOpsEvents(oeJson);
      setProfiles(ip);
      setSkills(sk);
      setOpsEvents(oe);
      setClassified(ip.map(p => classifyProfile(p, sk, oe)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:ipsoe-toggle', handler);
    return () => window.removeEventListener('jarvis:ipsoe-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (IPSOE_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_WIRED: classified.filter(p => p.state === 'FULLY_WIRED').length,
    SKILL_BACKED: classified.filter(p => p.state === 'SKILL_BACKED').length,
    OPS_TRIGGERED: classified.filter(p => p.state === 'OPS_TRIGGERED').length,
    DARK: classified.filter(p => p.state === 'DARK').length,
  };

  const visible = classified.filter(p => {
    if (filter !== 'ALL' && p.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p._searchText.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `IPSOE IntelProfile × AIP Skill × Ops Event Triple Coverage summary: ${profiles.length} intel profiles, ${skills.length} AIP skills, ${opsEvents.length} ops events. Coverage: FULLY WIRED=${counts.FULLY_WIRED}, SKILL-BACKED=${counts.SKILL_BACKED}, OPS-TRIGGERED=${counts.OPS_TRIGGERED}, DARK=${counts.DARK}. In 2 sentences, assess intel profile operational readiness and identify the most critical coverage gaps requiring immediate capability assignment.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const wiredPct = classified.length ? Math.round((counts.FULLY_WIRED / classified.length) * 100) : 0;
  const skillPct = classified.length ? Math.round((counts.SKILL_BACKED / classified.length) * 100) : 0;
  const opsPct = classified.length ? Math.round((counts.OPS_TRIGGERED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 837520, bottom: 8, zIndex: 524,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #155e75',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(21,94,117,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13 }}>◈ IPSOE</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>IntelProfile × AIP Skill × Ops Event Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#38bdf8', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'PROFILES', val: profiles.length, color: '#38bdf8' },
          { label: 'SKILLS', val: skills.length, color: '#a78bfa' },
          { label: 'OPS EVENTS', val: opsEvents.length, color: '#fb923c' },
          { label: 'FULLY WIRED', val: counts.FULLY_WIRED, color: '#38bdf8', badge: counts.FULLY_WIRED > 0 },
          { label: 'SKILL-BACKED', val: counts.SKILL_BACKED, color: '#a78bfa' },
          { label: 'OPS-TRIGGERED', val: counts.OPS_TRIGGERED, color: '#fb923c' },
          { label: 'DARK', val: counts.DARK, color: '#ef4444', badge: counts.DARK > 0 },
          { label: 'COVERAGE', val: `${wiredPct}%`, color: '#4ade80' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#38bdf8' }}>{wiredPct}% fully wired</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {wiredPct > 0 && <div style={{ width: `${wiredPct}%`, background: '#38bdf8' }} />}
          {skillPct > 0 && <div style={{ width: `${skillPct}%`, background: '#a78bfa' }} />}
          {opsPct > 0 && <div style={{ width: `${opsPct}%`, background: '#fb923c' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#38bdf8' }}>● FULLY WIRED</span>
          <span style={{ color: '#a78bfa' }}>● SKILL-BACKED</span>
          <span style={{ color: '#fb923c' }}>● OPS-TRIGGERED</span>
          <span style={{ color: '#374151' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_WIRED', 'SKILL_BACKED', 'OPS_TRIGGERED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#0c4a6e' : '#0f172a',
            border: `1px solid ${filter === f ? '#0ea5e9' : '#1e293b'}`,
            color: filter === f ? '#7dd3fc' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No intel profiles match current filter.</div>
        )}
        {visible.map(p => {
          const stateColor = p.state === 'FULLY_WIRED' ? '#38bdf8' : p.state === 'SKILL_BACKED' ? '#a78bfa' : p.state === 'OPS_TRIGGERED' ? '#fb923c' : '#ef4444';
          const isExp = expanded === p.id;
          return (
            <div key={p.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#155e75' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 120 }}>{STATE_LABELS[p.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{p.label}</span>
                {p.company && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{p.company}</span>}
                {p.role && <span style={{ background: '#0c4a6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{p.role}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b', margin: '6px 0' }}>
                    {p.sector && <span>Sector: <span style={{ color: '#94a3b8' }}>{p.sector}</span></span>}
                    {p.nationality && <span>Nationality: <span style={{ color: '#94a3b8' }}>{p.nationality}</span></span>}
                    {p.aliases && <span>Aliases: <span style={{ color: '#94a3b8' }}>{p.aliases.slice(0, 80)}</span></span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* AIP Skills pane */}
                    <div>
                      <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>AIP SKILLS ({p.skillMatches.length})</div>
                      {p.skillMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No skill coverage</div>
                        : p.skillMatches.slice(0, 6).map(s => (
                          <div key={s.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#c4b5fd', fontSize: 11 }}>{s.label}</span>
                              {s.category && <span style={{ background: '#2e1065', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{s.category}</span>}
                            </div>
                            <ScoreBar score={s.score} color="#a78bfa" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Ops Events pane */}
                    <div>
                      <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>OPS EVENTS ({p.opsMatches.length})</div>
                      {p.opsMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No ops event coverage</div>
                        : p.opsMatches.slice(0, 6).map(e => (
                          <div key={e.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#fdba74', fontSize: 11 }}>{e.label}</span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {e.type && <span style={{ background: '#431407', color: '#fb923c', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{e.type}</span>}
                                {e.severity && <span style={{ color: SEV_COLOR[e.severity?.toLowerCase()] || '#6b7280', fontSize: 9 }}>{e.severity.toUpperCase()}</span>}
                              </div>
                            </div>
                            <ScoreBar score={e.score} color="#fb923c" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#0c4a6e', border: '1px solid #0ea5e9',
            color: assessing ? '#475569' : '#7dd3fc', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
