import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ISLTRI_RE = /\b(isltri|investigation\s+skill\s+live|invest\s+skill\s+live|skill\s+backed\s+invest|live\s+investigation\s+skill|invest\s+skill\s+intel|dark\s+investigation\s+skill|fully\s+active\s+investigation)\b/i;

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investigations) ? data.investigations
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(i => ({
    id: i.id || i._id || i.investigationId || String(Math.random()),
    name: i.name || i.title || i.label || 'Untitled Investigation',
    description: i.description || i.summary || i.objective || i.notes || '',
    status: i.status || i.state || i.phase || '',
    type: i.type || i.category || i.kind || '',
    tags: Array.isArray(i.tags) ? i.tags.join(' ') : String(i.tags || ''),
    raw: i,
  }));
}

function normaliseSkills(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.skills) ? data.skills
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || s.skillId || String(Math.random()),
    name: s.name || s.title || s.label || 'Untitled Skill',
    description: s.description || s.summary || s.purpose || '',
    category: s.category || s.type || s.domain || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function normaliseLiveIntel(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.intel) ? data.intel
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || e.eventId || String(Math.random()),
    name: e.name || e.title || e.headline || e.summary || 'Live Event',
    description: e.description || e.body || e.content || e.details || '',
    source: e.source || e.origin || e.feed || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function correlate(investigations, skills, liveIntel) {
  return investigations.map(inv => {
    const toks = tok([inv.name, inv.description, inv.type, inv.status, inv.tags].join(' '));

    const matchedSkills = skills
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.description),
          matchScore(toks, s.category),
          matchScore(toks, s.tags),
        );
        return { ...s, matchScore: score };
      })
      .filter(s => s.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedLiveIntel = liveIntel
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.description),
          matchScore(toks, e.source),
          matchScore(toks, e.tags),
        );
        return { ...e, matchScore: score };
      })
      .filter(e => e.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasSkill = matchedSkills.length > 0;
    const hasLive = matchedLiveIntel.length > 0;

    let state;
    if (hasSkill && hasLive) state = 'FULLY ACTIVE';
    else if (hasSkill) state = 'SKILL-BACKED';
    else if (hasLive) state = 'LIVE-TRIGGERED';
    else state = 'DARK';

    return { inv, matchedSkills, matchedLiveIntel, state };
  });
}

export function isIsltriQuery(t) {
  return ISLTRI_RE.test(t || '');
}

export async function buildIsltriScript() {
  try {
    const apiBase = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
    const key = (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';
    const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    const [iRes, sRes, lRes] = await Promise.all([
      fetch(`${apiBase}/v1/investigations`, { headers: hdr }),
      fetch(`${apiBase}/v1/aip/skill`, { headers: hdr }),
      fetch(`${apiBase}/functions/getLiveIntel`, { headers: hdr }),
    ]);
    const [iData, sData, lData] = await Promise.all([iRes.json(), sRes.json(), lRes.json()]);
    const invs = normaliseInvestigations(iData);
    const skills = normaliseSkills(sData);
    const live = normaliseLiveIntel(lData);
    const rows = correlate(invs, skills, live);
    const fully = rows.filter(r => r.state === 'FULLY ACTIVE').length;
    const skillBacked = rows.filter(r => r.state === 'SKILL-BACKED').length;
    const liveTrig = rows.filter(r => r.state === 'LIVE-TRIGGERED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    return `ISLTRI coverage across ${rows.length} investigations: ${fully} fully active (skill + live event), ${skillBacked} skill-backed, ${liveTrig} live-triggered, ${dark} dark with no skill or live coverage. ${dark > 0 ? `${dark} investigation${dark > 1 ? 's' : ''} lack both skill alignment and live intelligence — recommend review.` : 'All investigations have at least one coverage layer.'}`;
  } catch {
    return 'ISLTRI coverage data unavailable — check investigation, skill, and live intel endpoints.';
  }
}

const STATE_COLOR = {
  'FULLY ACTIVE': '#22d3ee',
  'SKILL-BACKED': '#a78bfa',
  'LIVE-TRIGGERED': '#fb923c',
  'DARK': '#6b7280',
};

const TABS = ['ALL', 'FULLY ACTIVE', 'SKILL-BACKED', 'LIVE-TRIGGERED', 'DARK'];

export default function InvestigationSkillLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const apiBase = () => (typeof window !== 'undefined' && window.__JARVIS_API__) || API;
  const apiKey = () => (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` };
      const [iRes, sRes, lRes] = await Promise.all([
        fetch(`${apiBase()}/v1/investigations`, { headers: hdr }),
        fetch(`${apiBase()}/v1/aip/skill`, { headers: hdr }),
        fetch(`${apiBase()}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      const [iData, sData, lData] = await Promise.all([iRes.json(), sRes.json(), lRes.json()]);
      const invs = normaliseInvestigations(iData);
      const skills = normaliseSkills(sData);
      const live = normaliseLiveIntel(lData);
      setRows(correlate(invs, skills, live));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:isltri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:isltri-toggle', onToggle);
  }, []);

  const counts = {
    'ALL': rows.length,
    'FULLY ACTIVE': rows.filter(r => r.state === 'FULLY ACTIVE').length,
    'SKILL-BACKED': rows.filter(r => r.state === 'SKILL-BACKED').length,
    'LIVE-TRIGGERED': rows.filter(r => r.state === 'LIVE-TRIGGERED').length,
    'DARK': rows.filter(r => r.state === 'DARK').length,
  };

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.state === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || r.inv.name.toLowerCase().includes(q) || r.inv.description.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess(row) {
    setAssessing(true);
    try {
      const msg = `Assess investigation "${row.inv.name}" (${row.state}): ${row.matchedSkills.length} skill(s) matched, ${row.matchedLiveIntel.length} live event(s). Summarise coverage and recommend next action in 2 sentences.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const text = (d.answer || '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { /* swallow */ } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    const darkCount = counts['DARK'];
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × Skill × Live Intel Triple Coverage"
        style={{
          position: 'fixed', left: 778160, bottom: 8, zIndex: 418,
          background: darkCount > 0 ? 'rgba(107,114,128,0.15)' : 'rgba(34,211,238,0.08)',
          border: `1px solid ${darkCount > 0 ? '#6b728066' : '#22d3ee44'}`,
          color: darkCount > 0 ? '#9ca3af' : '#22d3ee',
          padding: '3px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
          fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ ISLTRI{darkCount > 0 && <span style={{ marginLeft: 5, background: '#6b7280', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9 }}>{darkCount}</span>}
      </button>
    );
  }

  const fully = counts['FULLY ACTIVE'];
  const total = counts['ALL'];
  const pct = total > 0 ? Math.round((fully / total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 778160, bottom: 48, zIndex: 418,
      width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,10,18,0.97)', border: '1px solid #22d3ee33',
      borderRadius: 8, fontFamily: 'monospace', overflow: 'hidden',
      boxShadow: '0 0 40px #22d3ee11',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #22d3ee22', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ ISLTRI</span>
        <span style={{ color: '#6b7280', fontSize: 10, flex: 1 }}>Investigation × Skill × Live Intel</span>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', color: '#22d3ee88', cursor: 'pointer', fontSize: 12 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #22d3ee11' }}>
        {[
          { label: 'FULLY ACTIVE', val: counts['FULLY ACTIVE'], col: '#22d3ee' },
          { label: 'SKILL-BACKED', val: counts['SKILL-BACKED'], col: '#a78bfa' },
          { label: 'LIVE-TRIGGERED', val: counts['LIVE-TRIGGERED'], col: '#fb923c' },
          { label: 'DARK', val: counts['DARK'], col: '#6b7280' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: col + '88', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '4px 12px 6px', borderBottom: '1px solid #22d3ee11' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#6b7280', fontSize: 9 }}>FULLY ACTIVE COVERAGE</span>
          <span style={{ color: '#22d3ee', fontSize: 9 }}>{pct}% ({fully}/{total})</span>
        </div>
        <div style={{ height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#22d3ee,#a78bfa)', transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #22d3ee11', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${STATE_COLOR[t] || '#22d3ee'}22` : 'none',
            border: `1px solid ${tab === t ? (STATE_COLOR[t] || '#22d3ee') + '66' : '#22d3ee22'}`,
            color: tab === t ? (STATE_COLOR[t] || '#22d3ee') : '#6b7280',
            padding: '2px 7px', borderRadius: 3, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {t} {counts[t] !== undefined ? `(${counts[t]})` : ''}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #22d3ee22',
            color: '#c8e6ff', padding: '2px 7px', borderRadius: 3, fontSize: 9, fontFamily: 'monospace', outline: 'none', width: 90,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {loading && <div style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: '#f87171', fontSize: 10, padding: 8 }}>{err}</div>}

        {visible.map((row, i) => {
          const isExpanded = expanded[row.inv.id];
          return (
            <div key={row.inv.id + i} style={{
              marginBottom: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${STATE_COLOR[row.state]}22`,
              borderRadius: 4, padding: '5px 8px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setExpanded(e => ({ ...e, [row.inv.id]: !e[row.inv.id] }))}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1, color: STATE_COLOR[row.state],
                  background: `${STATE_COLOR[row.state]}18`, border: `1px solid ${STATE_COLOR[row.state]}44`,
                  borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {row.inv.name}
                </span>
                <span style={{ fontSize: 9, color: '#a78bfa88' }}>{row.matchedSkills.length}SK</span>
                <span style={{ fontSize: 9, color: '#fb923c88' }}>{row.matchedLiveIntel.length}LI</span>
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Skills */}
                  <div style={{ flex: 1, background: 'rgba(167,139,250,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      SKILLS ({row.matchedSkills.length})
                    </div>
                    {row.matchedSkills.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No skill match</div>
                    ) : (
                      row.matchedSkills.slice(0, 5).map((s, k) => (
                        <div key={s.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{s.name}</span>
                            {s.category && <span style={{ fontSize: 9, color: '#a78bfa88' }}>{s.category}</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s.matchScore * 100)}%`, background: '#a78bfa', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Live Intel */}
                  <div style={{ flex: 1, background: 'rgba(251,146,60,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#fb923c', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      LIVE INTEL ({row.matchedLiveIntel.length})
                    </div>
                    {row.matchedLiveIntel.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No live event match</div>
                    ) : (
                      row.matchedLiveIntel.slice(0, 5).map((e, k) => (
                        <div key={e.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{e.name}</span>
                            {e.source && <span style={{ fontSize: 9, color: '#fb923c88' }}>{e.source}</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(e.matchScore * 100)}%`, background: '#fb923c', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(34,211,238,0.1)', border: '1px solid #22d3ee44',
                      color: '#22d3ee', padding: '3px 12px', borderRadius: 3,
                      fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
