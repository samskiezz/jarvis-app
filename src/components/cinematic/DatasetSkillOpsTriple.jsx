import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const DASOETRI_RE = /\b(dasoetri|dataset\s+skill\s+ops|dataset\s+aip\s+ops|dataset\s+ops\s+skill|dataset\s+ops\s+aip|data\s+skill\s+ops|data\s+aip\s+ops|fully\s+armed\s+dataset|armed\s+dataset|dark\s+dataset\s+ops|ops\s+skill\s+dataset|aip\s+ops\s+dataset|skill\s+ops\s+dataset|dataset\s+operational\s+skill|dataset\s+capability\s+ops|dataset\s+ops\s+coverage)\b/i;

export function isDasoetriQuery(t) {
  return DASOETRI_RE.test(t || '');
}

export async function buildDasoetriScript() {
  try {
    const [dsRes, skRes, oeRes] = await Promise.all([
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const ds = normaliseDatasets(dsRes);
    const sk = normaliseSkills(skRes);
    const oe = normaliseOpsEvents(oeRes);
    const classified = ds.map(d => classifyDataset(d, sk, oe));
    const fullyArmed = classified.filter(d => d.state === 'FULLY_ARMED').length;
    const dark = classified.filter(d => d.state === 'DARK').length;
    return `DASOETRI analysis: ${ds.length} datasets cross-referenced against ${sk.length} AIP skills and ${oe.length} ops events. ${fullyArmed} datasets are FULLY ARMED with both capability backing and live operational trigger. ${dark} datasets are DARK — no skill or ops event coverage — representing intelligence and operational blind spots that require immediate capability assignment and operational monitoring.`;
  } catch {
    return 'DASOETRI data unavailable — check /v1/datasets, /v1/aip/skill, and /v1/ops/events endpoints.';
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

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.datasets) ? raw.datasets
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    label: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || '',
    description: d.description || d.summary || d.notes || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags || ''),
    source: d.source || d.provider || '',
    _searchText: [d.name, d.title, d.kind, d.type, d.category, d.description, d.summary, d.tags, d.source].filter(Boolean).join(' '),
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

function classifyDataset(ds, skills, opsEvents) {
  const toks = tok(ds._searchText);
  const skillMatches = skills
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._searchText), matchScore(tok(s._searchText), ds._searchText)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const opsMatches = opsEvents
    .map(e => ({ ...e, score: Math.max(matchScore(toks, e._searchText), matchScore(tok(e._searchText), ds._searchText)) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasSkill = skillMatches.length > 0;
  const hasOps = opsMatches.length > 0;
  let state;
  if (hasSkill && hasOps) state = 'FULLY_ARMED';
  else if (hasSkill) state = 'SKILL_BACKED';
  else if (hasOps) state = 'OPS_TRIGGERED';
  else state = 'DARK';
  return { ...ds, state, skillMatches, opsMatches };
}

const STATE_LABELS = {
  FULLY_ARMED: 'FULLY ARMED',
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

export default function DatasetSkillOpsTriple() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
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
      const [dsRes, skRes, oeRes] = await Promise.all([
        fetch(`${API}/v1/datasets`, { headers }),
        fetch(`${API}/v1/aip/skill`, { headers }),
        fetch(`${API}/v1/ops/events`, { headers }),
      ]);
      const [dsJson, skJson, oeJson] = await Promise.all([dsRes.json(), skRes.json(), oeRes.json()]);
      const ds = normaliseDatasets(dsJson);
      const sk = normaliseSkills(skJson);
      const oe = normaliseOpsEvents(oeJson);
      setDatasets(ds);
      setSkills(sk);
      setOpsEvents(oe);
      setClassified(ds.map(d => classifyDataset(d, sk, oe)));
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
    window.addEventListener('jarvis:dasoetri-toggle', handler);
    return () => window.removeEventListener('jarvis:dasoetri-toggle', handler);
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
      if (DASOETRI_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_ARMED: classified.filter(d => d.state === 'FULLY_ARMED').length,
    SKILL_BACKED: classified.filter(d => d.state === 'SKILL_BACKED').length,
    OPS_TRIGGERED: classified.filter(d => d.state === 'OPS_TRIGGERED').length,
    DARK: classified.filter(d => d.state === 'DARK').length,
  };

  const visible = classified.filter(d => {
    if (filter !== 'ALL' && d.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return d._searchText.toLowerCase().includes(q) || d.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `DASOETRI Dataset × AIP Skill × Ops Event Triple Coverage summary: ${datasets.length} datasets, ${skills.length} AIP skills, ${opsEvents.length} ops events. Coverage: FULLY ARMED=${counts.FULLY_ARMED}, SKILL-BACKED=${counts.SKILL_BACKED}, OPS-TRIGGERED=${counts.OPS_TRIGGERED}, DARK=${counts.DARK}. In 2 sentences, assess dataset operational readiness and identify the most critical coverage gaps.`;
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

  const armedPct = classified.length ? Math.round((counts.FULLY_ARMED / classified.length) * 100) : 0;
  const skillPct = classified.length ? Math.round((counts.SKILL_BACKED / classified.length) * 100) : 0;
  const opsPct = classified.length ? Math.round((counts.OPS_TRIGGERED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 830800, bottom: 8, zIndex: 512,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1e40af',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(30,64,175,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13 }}>◈ DASOETRI</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Dataset × AIP Skill × Ops Event Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#38bdf8', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'DATASETS', val: datasets.length, color: '#38bdf8' },
          { label: 'SKILLS', val: skills.length, color: '#a78bfa' },
          { label: 'OPS EVENTS', val: opsEvents.length, color: '#fb923c' },
          { label: 'FULLY ARMED', val: counts.FULLY_ARMED, color: '#4ade80' },
          { label: 'SKILL-BACKED', val: counts.SKILL_BACKED, color: '#a78bfa' },
          { label: 'OPS-TRIGGERED', val: counts.OPS_TRIGGERED, color: '#fb923c' },
          { label: 'DARK', val: counts.DARK, color: '#ef4444', badge: counts.DARK > 0 },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid #ef4444' : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 16 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#4ade80' }}>{armedPct}% fully armed</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {armedPct > 0 && <div style={{ width: `${armedPct}%`, background: '#4ade80' }} />}
          {skillPct > 0 && <div style={{ width: `${skillPct}%`, background: '#a78bfa' }} />}
          {opsPct > 0 && <div style={{ width: `${opsPct}%`, background: '#fb923c' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#4ade80' }}>● FULLY ARMED</span>
          <span style={{ color: '#a78bfa' }}>● SKILL-BACKED</span>
          <span style={{ color: '#fb923c' }}>● OPS-TRIGGERED</span>
          <span style={{ color: '#374151' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_ARMED', 'SKILL_BACKED', 'OPS_TRIGGERED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1e40af' : '#0f172a',
            border: `1px solid ${filter === f ? '#3b82f6' : '#1e293b'}`,
            color: filter === f ? '#93c5fd' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No datasets match current filter.</div>
        )}
        {visible.map(ds => {
          const stateColor = ds.state === 'FULLY_ARMED' ? '#4ade80' : ds.state === 'SKILL_BACKED' ? '#a78bfa' : ds.state === 'OPS_TRIGGERED' ? '#fb923c' : '#ef4444';
          const isExp = expanded === ds.id;
          return (
            <div key={ds.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#1e40af' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : ds.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 120 }}>{STATE_LABELS[ds.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{ds.label}</span>
                {ds.kind && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{ds.kind}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {ds.description && <div style={{ color: '#64748b', fontSize: 11, margin: '6px 0' }}>{ds.description.slice(0, 200)}{ds.description.length > 200 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* AIP Skills pane */}
                    <div>
                      <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>AIP SKILLS ({ds.skillMatches.length})</div>
                      {ds.skillMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No skill coverage</div>
                        : ds.skillMatches.slice(0, 6).map(s => (
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
                      <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>OPS EVENTS ({ds.opsMatches.length})</div>
                      {ds.opsMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No ops event coverage</div>
                        : ds.opsMatches.slice(0, 6).map(e => (
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
            background: assessing ? '#1e293b' : '#1e3a5f', border: '1px solid #2563eb',
            color: assessing ? '#475569' : '#93c5fd', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
