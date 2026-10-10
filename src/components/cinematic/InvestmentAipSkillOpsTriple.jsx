import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IASOE_RE = /\b(iasoe|investment[\s_-]*aip[\s_-]*skill[\s_-]*ops?|invest[\s_-]*skill[\s_-]*ops?|portfolio[\s_-]*skill[\s_-]*ops?|investment[\s_-]*capability[\s_-]*ops?|invest[\s_-]*aip[\s_-]*event|portfolio[\s_-]*aip[\s_-]*ops?|invest[\s_-]*ops[\s_-]*skill|skill[\s_-]*ops[\s_-]*invest|fully[\s_-]*hedged[\s_-]*invest|exposed[\s_-]*invest(?:ment)?|investment[\s_-]*ops[\s_-]*gap|portfolio[\s_-]*ops[\s_-]*gap|investment[\s_-]*skill[\s_-]*gap)\b/i;

const THRESHOLD = 0.07;

export function isIasoeQuery(t) { return IASOE_RE.test(t || ''); }

export async function buildIasoeScript() {
  try {
    const [invRes, skillRes, opsRes] = await Promise.all([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const investments = Array.isArray(invRes) ? invRes : (invRes.items || invRes.data || []);
    const skills = Array.isArray(skillRes) ? skillRes : (skillRes.items || skillRes.data || []);
    const ops = Array.isArray(opsRes) ? opsRes : (opsRes.items || opsRes.data || []);
    let hedged = 0, skillOnly = 0, opsOnly = 0, exposed = 0;
    for (const inv of investments) {
      const toks = tok(`${inv.name || ''} ${inv.ticker || ''} ${inv.sector || ''} ${inv.notes || ''} ${(inv.tags || []).join(' ')}`);
      const hasSkill = skills.some(s => matchScore(toks, `${s.name || ''} ${s.description || ''} ${s.category || ''} ${(s.tags || []).join(' ')}`) >= THRESHOLD);
      const hasOps = ops.some(o => matchScore(toks, `${o.name || ''} ${o.description || ''} ${o.type || ''} ${o.severity || ''}`) >= THRESHOLD);
      if (hasSkill && hasOps) hedged++;
      else if (hasSkill) skillOnly++;
      else if (hasOps) opsOnly++;
      else exposed++;
    }
    const total = investments.length;
    const pct = total ? Math.round((hedged / total) * 100) : 0;
    return `IASOE Investment × AIP Skill × Ops Event coverage: ${total} investments, ${hedged} fully-hedged (${pct}%), ${skillOnly} skill-backed, ${opsOnly} ops-flagged, ${exposed} exposed. ${exposed > 0 ? `${exposed} investment(s) have no AIP skill or ops event correlation — portfolio operational gap.` : 'All investments have skill or ops event backing.'} AIP skills catalogued: ${skills.length}. Active ops events: ${ops.length}.`;
  } catch {
    return 'IASOE: unable to build coverage script — check endpoints.';
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

function normaliseInv(raw) {
  return (Array.isArray(raw) ? raw : (raw.items || raw.data || [])).map(i => ({
    id: i.id || i._id || Math.random().toString(36).slice(2),
    name: i.name || i.ticker || '(investment)',
    ticker: i.ticker || '',
    sector: i.sector || '',
    notes: i.notes || '',
    tags: i.tags || [],
    _raw: `${i.name || ''} ${i.ticker || ''} ${i.sector || ''} ${i.notes || ''} ${(i.tags || []).join(' ')}`,
  }));
}

function normaliseSkill(raw) {
  return (Array.isArray(raw) ? raw : (raw.items || raw.data || [])).map(s => ({
    id: s.id || s._id || Math.random().toString(36).slice(2),
    name: s.name || '(skill)',
    category: s.category || '',
    description: s.description || '',
    tags: s.tags || [],
    _raw: `${s.name || ''} ${s.description || ''} ${s.category || ''} ${(s.tags || []).join(' ')}`,
  }));
}

function normaliseOps(raw) {
  return (Array.isArray(raw) ? raw : (raw.items || raw.data || [])).map(o => ({
    id: o.id || o._id || Math.random().toString(36).slice(2),
    name: o.name || o.title || '(event)',
    type: o.type || '',
    severity: o.severity || '',
    description: o.description || '',
    _raw: `${o.name || ''} ${o.title || ''} ${o.description || ''} ${o.type || ''} ${o.severity || ''}`,
  }));
}

function classifyInv(inv, skills, ops) {
  const toks = tok(inv._raw);
  const matchedSkills = skills.filter(s => matchScore(toks, s._raw) >= THRESHOLD)
    .map(s => ({ ...s, score: matchScore(toks, s._raw) }))
    .sort((a, b) => b.score - a.score);
  const matchedOps = ops.filter(o => matchScore(toks, o._raw) >= THRESHOLD)
    .map(o => ({ ...o, score: matchScore(toks, o._raw) }))
    .sort((a, b) => b.score - a.score);
  const hasSkill = matchedSkills.length > 0;
  const hasOps = matchedOps.length > 0;
  let state;
  if (hasSkill && hasOps) state = 'FULLY_HEDGED';
  else if (hasSkill) state = 'SKILL_BACKED';
  else if (hasOps) state = 'OPS_FLAGGED';
  else state = 'EXPOSED';
  return { ...inv, state, matchedSkills, matchedOps };
}

const STATE_COLOR = {
  FULLY_HEDGED: '#00e676',
  SKILL_BACKED: '#7c3aed',
  OPS_FLAGGED: '#f59e0b',
  EXPOSED: '#ef4444',
};
const STATE_LABEL = {
  FULLY_HEDGED: 'FULLY HEDGED',
  SKILL_BACKED: 'SKILL BACKED',
  OPS_FLAGGED: 'OPS FLAGGED',
  EXPOSED: 'EXPOSED',
};

const FILTERS = ['ALL', 'FULLY_HEDGED', 'SKILL_BACKED', 'OPS_FLAGGED', 'EXPOSED'];

export default function InvestmentAipSkillOpsTriple() {
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
      const [invRes, skillRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const investments = normaliseInv(invRes);
      const skills = normaliseSkill(skillRes);
      const ops = normaliseOps(opsRes);
      setItems(investments.map(inv => classifyInv(inv, skills, ops)));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:iasoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:iasoe-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = useCallback(async (item) => {
    if (assessing === item.id) return;
    setAssessing(item.id);
    setBrief(b => ({ ...b, [item.id]: '' }));
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Investment "${item.name}" (sector: ${item.sector || 'N/A'}, ticker: ${item.ticker || 'N/A'}) has coverage state: ${item.state}. AIP skills matched: ${item.matchedSkills.map(s => s.name).join(', ') || 'none'}. Ops events matched: ${item.matchedOps.map(o => o.name).join(', ') || 'none'}. Provide a 2-sentence operational intelligence brief on this investment's portfolio capability and ops coverage posture.`,
        }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.answer || data.content || JSON.stringify(data);
      setBrief(b => ({ ...b, [item.id]: text }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief(b => ({ ...b, [item.id]: 'Assessment unavailable.' }));
    }
    setAssessing(null);
  }, [assessing]);

  if (!open) return null;

  const sq = tok(search);
  const visible = items.filter(it =>
    (filter === 'ALL' || it.state === filter) &&
    (!sq.length || matchScore(sq, it._raw) >= THRESHOLD)
  );

  const counts = { FULLY_HEDGED: 0, SKILL_BACKED: 0, OPS_FLAGGED: 0, EXPOSED: 0 };
  for (const it of items) counts[it.state] = (counts[it.state] || 0) + 1;
  const total = items.length;
  const hedgedPct = total ? Math.round((counts.FULLY_HEDGED / total) * 100) : 0;

  const barSegments = [
    { state: 'FULLY_HEDGED', color: STATE_COLOR.FULLY_HEDGED },
    { state: 'SKILL_BACKED', color: STATE_COLOR.SKILL_BACKED },
    { state: 'OPS_FLAGGED', color: STATE_COLOR.OPS_FLAGGED },
    { state: 'EXPOSED', color: STATE_COLOR.EXPOSED },
  ];

  return (
    <div style={{
      position: 'fixed', left: 870000, bottom: 8, zIndex: 562,
      background: 'rgba(0,10,20,0.97)', border: '1px solid rgba(0,230,118,0.25)',
      borderRadius: 10, width: 620, maxHeight: '88vh',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#c8d8e8', fontSize: 11, boxShadow: '0 0 32px rgba(0,230,118,0.10)',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(0,230,118,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#00e676', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ IASOE</span>
        <span style={{ flex: 1, color: '#7a9ab8', fontSize: 10 }}>Investment × AIP Skill × Ops Event</span>
        {loading && <span style={{ color: '#f59e0b', fontSize: 9, letterSpacing: 1 }}>LOADING…</span>}
        <span
          onClick={() => setOpen(false)}
          style={{ cursor: 'pointer', color: '#4a6a8a', fontSize: 14, lineHeight: 1 }}
        >✕</span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px 6px', flexWrap: 'wrap' }}>
        {[
          { label: 'INVESTMENTS', val: total, color: '#7a9ab8' },
          { label: 'FULLY HEDGED', val: counts.FULLY_HEDGED, color: STATE_COLOR.FULLY_HEDGED },
          { label: 'SKILL BACKED', val: counts.SKILL_BACKED, color: STATE_COLOR.SKILL_BACKED },
          { label: 'OPS FLAGGED', val: counts.OPS_FLAGGED, color: STATE_COLOR.OPS_FLAGGED },
          { label: 'EXPOSED', val: counts.EXPOSED, color: STATE_COLOR.EXPOSED },
          { label: 'HEDGED %', val: `${hedgedPct}%`, color: hedgedPct >= 60 ? '#00e676' : hedgedPct >= 30 ? '#f59e0b' : '#ef4444' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 8px', minWidth: 70 }}>
            <div style={{ color: '#4a6a8a', fontSize: 8, letterSpacing: 1 }}>{label}</div>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 6px', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', display: 'flex', overflow: 'hidden' }}>
        {total > 0 && barSegments.map(({ state, color }) => (
          <div key={state} style={{ width: `${(counts[state] / total) * 100}%`, background: color, transition: 'width 0.4s' }} />
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? STATE_COLOR[f] || 'rgba(0,230,118,0.25)' : 'rgba(255,255,255,0.05)',
              border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
              color: filter === f ? '#000' : '#7a9ab8', fontSize: 9, fontFamily: 'inherit', letterSpacing: 1,
            }}
          >{f === 'ALL' ? 'ALL' : STATE_LABEL[f]}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,230,118,0.15)',
            borderRadius: 4, padding: '2px 8px', color: '#c8d8e8', fontSize: 10, fontFamily: 'inherit', outline: 'none',
          }}
        />
      </div>

      {/* Item list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#4a6a8a', fontSize: 10, padding: '12px 0', textAlign: 'center' }}>
            {loading ? 'Fetching coverage data…' : 'No investments match.'}
          </div>
        )}
        {visible.map(it => (
          <div key={it.id} style={{ marginBottom: 5 }}>
            <div
              onClick={() => setExpanded(expanded === it.id ? null : it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '5px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${STATE_COLOR[it.state]}22`,
              }}
            >
              <span style={{ color: STATE_COLOR[it.state], fontWeight: 700, fontSize: 9, letterSpacing: 1, minWidth: 90 }}>
                {STATE_LABEL[it.state]}
              </span>
              <span style={{ flex: 1, color: '#c8d8e8', fontSize: 11 }}>{it.name}</span>
              {it.ticker && <span style={{ color: '#4a6a8a', fontSize: 9 }}>{it.ticker}</span>}
              {it.sector && (
                <span style={{ background: 'rgba(0,230,118,0.12)', color: '#00e676', fontSize: 8, padding: '1px 5px', borderRadius: 3 }}>
                  {it.sector}
                </span>
              )}
              <span style={{ color: '#4a6a8a', fontSize: 9 }}>
                {it.matchedSkills.length}S · {it.matchedOps.length}O
              </span>
              <span style={{ color: '#4a6a8a', fontSize: 10 }}>{expanded === it.id ? '▲' : '▼'}</span>
            </div>

            {expanded === it.id && (
              <div style={{ padding: '8px 8px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 6px 6px', borderTop: 'none' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  {/* AIP Skills */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#7c3aed', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>AIP SKILLS ({it.matchedSkills.length})</div>
                    {it.matchedSkills.length === 0
                      ? <div style={{ color: '#4a6a8a', fontSize: 9 }}>No skills matched.</div>
                      : it.matchedSkills.slice(0, 5).map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s.score * 100)}%`, height: '100%', background: '#7c3aed' }} />
                          </div>
                          <span style={{ color: '#c8d8e8', fontSize: 9, minWidth: 140, textAlign: 'right' }}>{s.name}</span>
                          {s.category && (
                            <span style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa', fontSize: 7, padding: '1px 4px', borderRadius: 2 }}>
                              {s.category}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  {/* Ops Events */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f59e0b', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS ({it.matchedOps.length})</div>
                    {it.matchedOps.length === 0
                      ? <div style={{ color: '#4a6a8a', fontSize: 9 }}>No ops events matched.</div>
                      : it.matchedOps.slice(0, 5).map(o => (
                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(o.score * 100)}%`, height: '100%', background: '#f59e0b' }} />
                          </div>
                          <span style={{ color: '#c8d8e8', fontSize: 9, minWidth: 140, textAlign: 'right' }}>{o.name}</span>
                          {o.severity && (
                            <span style={{ background: 'rgba(245,158,11,0.2)', color: '#fcd34d', fontSize: 7, padding: '1px 4px', borderRadius: 2 }}>
                              {o.severity}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* ASSESS */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => assess(it)}
                    disabled={assessing === it.id}
                    style={{
                      background: assessing === it.id ? 'rgba(0,230,118,0.1)' : 'rgba(0,230,118,0.18)',
                      border: '1px solid rgba(0,230,118,0.35)', borderRadius: 4, padding: '3px 10px',
                      color: '#00e676', fontSize: 9, fontFamily: 'inherit', cursor: assessing === it.id ? 'wait' : 'pointer', letterSpacing: 1,
                    }}
                  >{assessing === it.id ? '⟳ ASSESSING…' : '▶ ASSESS'}</button>
                  {brief[it.id] && (
                    <span style={{ color: '#a0b8c8', fontSize: 9, flex: 1 }}>{brief[it.id]}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 14px', borderTop: '1px solid rgba(0,230,118,0.10)', color: '#2a4a6a', fontSize: 8, letterSpacing: 1 }}>
        /entities/Investment × /v1/aip/skill × /v1/ops/events · 90s auto-refresh
      </div>
    </div>
  );
}
