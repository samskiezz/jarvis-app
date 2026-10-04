import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCSKLI_RE = /\b(gcskli|graph\s+community\s+skill|community\s+aip\s+skill|community\s+skill\s+live|skill\s+live\s+community|graph\s+community\s+live|community\s+live\s+skill|aip\s+skill\s+community|live\s+community\s+skill|community\s+skill\s+intel|graph\s+skill\s+live|skill\s+community\s+intel|community\s+intel\s+skill|live\s+skill\s+community|graph\s+community\s+aip|aip\s+community\s+live|dormant\s+community|fully\s+activated\s+community|community\s+activation)\b/i;

const THRESHOLD = 0.08;

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

function normaliseGCommunities(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.communities) ? data.communities
    : Array.isArray(data.clusters) ? data.clusters
    : Array.isArray(data.groups) ? data.groups
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: c.name || c.label || c.community_id || c.cluster_id || 'Community ' + (c.id || '?'),
    type: c.type || c.community_type || c.kind || '',
    size: typeof c.size === 'number' ? c.size : typeof c.member_count === 'number' ? c.member_count : 0,
    description: c.description || c.summary || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    members: Array.isArray(c.members) ? c.members.map(m => String(m.name || m.label || m)).join(' ') : '',
    raw: c,
  }));
}

function normaliseAipSkills(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.skills) ? data.skills
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || s.name || String(Math.random()),
    name: s.name || s.skill_name || s.label || 'Unnamed Skill',
    category: s.category || s.type || s.kind || '',
    description: s.description || s.summary || s.prompt || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function normaliseLiveIntel(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.incidents) ? data.incidents
    : Array.isArray(data.signals) ? data.signals
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || String(Math.random()),
    name: e.title || e.name || e.headline || e.message || e.description || 'Live Event',
    type: e.type || e.category || e.event_type || e.kind || '',
    region: e.region || e.location || e.country || e.area || '',
    description: e.description || e.summary || e.details || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function correlate(communities, skills, intelEvents) {
  return communities.map(community => {
    const toks = tok([community.name, community.type, community.description, community.tags, community.members].join(' '));

    const matchedSkills = skills
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.category),
          matchScore(toks, s.description),
          matchScore(toks, s.tags),
        );
        return { ...s, score };
      })
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedIntel = intelEvents
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.type),
          matchScore(toks, e.region),
          matchScore(toks, e.description),
          matchScore(toks, e.tags),
        );
        return { ...e, score };
      })
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasSkill = matchedSkills.length > 0;
    const hasIntel = matchedIntel.length > 0;

    const state = hasSkill && hasIntel ? 'FULLY ACTIVATED'
      : hasSkill ? 'SKILLED'
      : hasIntel ? 'LIVE-ONLY'
      : 'DORMANT';

    return { ...community, state, matchedSkills, matchedIntel };
  });
}

export function isGcskliQuery(t) { return GCSKLI_RE.test(t || ''); }

export async function buildGcskliScript() {
  try {
    const [commRes, skillRes, intelRes] = await Promise.allSettled([
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : null),
    ]);
    const comms = normaliseGCommunities(commRes.status === 'fulfilled' ? commRes.value : null);
    const skills = normaliseAipSkills(skillRes.status === 'fulfilled' ? skillRes.value : null);
    const intel = normaliseLiveIntel(intelRes.status === 'fulfilled' ? intelRes.value : null);
    const rows = correlate(comms, skills, intel);
    const activated = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
    const dormant = rows.filter(r => r.state === 'DORMANT').length;
    return `Graph community × AIP skill × live intel triple coverage: ${rows.length} communities analysed — ${activated} fully activated (skill + live intel), ${rows.filter(r => r.state === 'SKILLED').length} skilled-only, ${rows.filter(r => r.state === 'LIVE-ONLY').length} live-only, ${dormant} dormant. ${dormant > 0 ? `${dormant} communities have no skill or live intel coverage — operational blind spots requiring attention.` : 'All communities have at least partial skill or live intel coverage.'}`;
  } catch {
    return 'Graph community × AIP skill × live intel coverage data unavailable.';
  }
}

const STATE_COLOR = {
  'FULLY ACTIVATED': '#69f0ae',
  'SKILLED': '#00e5ff',
  'LIVE-ONLY': '#ff9800',
  'DORMANT': '#7c4dff',
};

const TABS = ['ALL', 'FULLY ACTIVATED', 'SKILLED', 'LIVE-ONLY', 'DORMANT'];

export default function GraphCommunitySkillLiveTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [commRes, skillRes, intelRes] = await Promise.allSettled([
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : null),
      ]);
      const comms = normaliseGCommunities(commRes.status === 'fulfilled' ? commRes.value : null);
      const skills = normaliseAipSkills(skillRes.status === 'fulfilled' ? skillRes.value : null);
      const intel = normaliseLiveIntel(intelRes.status === 'fulfilled' ? intelRes.value : null);
      setRows(correlate(comms, skills, intel));
    } catch (e) {
      setError(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:gcskli-toggle', handler);
    return () => window.removeEventListener('jarvis:gcskli-toggle', handler);
  }, []);

  useEffect(() => {
    if (open && !rows.length) load();
    if (open) {
      timerRef.current = setInterval(load, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load, rows.length]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const activated = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
      const dormant = rows.filter(r => r.state === 'DORMANT').length;
      const prompt = `JARVIS graph community × AIP skill × live intel triple coverage: ${rows.length} communities, ${activated} fully activated (matched both skill and live intel), ${rows.filter(r => r.state === 'SKILLED').length} skilled-only, ${rows.filter(r => r.state === 'LIVE-ONLY').length} live-only, ${dormant} dormant. In 2 sentences: summarise coverage health and identify the highest-priority action.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const json = await res.json();
      const text = json.response || json.message || json.text || JSON.stringify(json);
      setAssessText(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch (e) {
      setAssessText('Assessment unavailable: ' + (e.message || 'error'));
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const counts = {
    total: rows.length,
    activated: rows.filter(r => r.state === 'FULLY ACTIVATED').length,
    skilled: rows.filter(r => r.state === 'SKILLED').length,
    liveOnly: rows.filter(r => r.state === 'LIVE-ONLY').length,
    dormant: rows.filter(r => r.state === 'DORMANT').length,
  };

  const visible = rows
    .filter(r => tab === 'ALL' || r.state === tab)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.type.toLowerCase().includes(search.toLowerCase()));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × AIP Skill × Live Intel Triple Coverage"
        style={{
          position: 'fixed', left: 820160, bottom: 8, zIndex: 493,
          background: 'rgba(10,12,18,0.92)', border: '1px solid #69f0ae44',
          borderRadius: 6, padding: '4px 10px', color: '#69f0ae',
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: 'pointer',
          letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ GCSKLI
        {counts.dormant > 0 && (
          <span style={{
            background: '#7c4dff', color: '#fff', borderRadius: 10,
            padding: '1px 6px', fontSize: 9, fontWeight: 700,
          }}>{counts.dormant}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, width: 700,
      maxHeight: 'calc(100vh - 80px)', zIndex: 493,
      background: 'rgba(8,10,16,0.97)', border: '1px solid #69f0ae33',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#c8d8e8',
      boxShadow: '0 0 40px #69f0ae18',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #69f0ae22',
        background: 'rgba(105,240,174,0.04)',
      }}>
        <span style={{ color: '#69f0ae', fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
          ◈ GCSKLI — GRAPH COMMUNITY × AIP SKILL × LIVE INTEL
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} style={btnStyle('#69f0ae')}>
            {loading ? '…' : '↺'}
          </button>
          <button onClick={() => setOpen(false)} style={btnStyle('#ff5252')}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'COMMUNITIES', val: counts.total, col: '#90a4ae' },
          { label: 'FULLY ACTIVATED', val: counts.activated, col: '#69f0ae' },
          { label: 'SKILLED', val: counts.skilled, col: '#00e5ff' },
          { label: 'LIVE-ONLY', val: counts.liveOnly, col: '#ff9800' },
          { label: 'DORMANT', val: counts.dormant, col: '#7c4dff' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 6,
            padding: '6px 10px', flex: '1 1 100px', textAlign: 'center',
          }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#607080', fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {counts.total > 0 && (
        <div style={{ display: 'flex', height: 6, margin: '0 14px 10px', borderRadius: 4, overflow: 'hidden' }}>
          {[
            { state: 'FULLY ACTIVATED', count: counts.activated },
            { state: 'SKILLED', count: counts.skilled },
            { state: 'LIVE-ONLY', count: counts.liveOnly },
            { state: 'DORMANT', count: counts.dormant },
          ].map(({ state, count }) => (
            <div key={state} style={{
              width: `${(count / counts.total) * 100}%`,
              background: STATE_COLOR[state],
              transition: 'width 0.4s',
            }} />
          ))}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? STATE_COLOR[t] || '#69f0ae' : 'rgba(255,255,255,0.04)',
            border: 'none', borderRadius: 4, padding: '3px 8px',
            color: tab === t ? '#000' : '#8090a0', fontSize: 9,
            fontFamily: "'JetBrains Mono',monospace", cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
            letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.06)',
            border: '1px solid #ffffff18', borderRadius: 4, padding: '3px 8px',
            color: '#c8d8e8', fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
            width: 160, outline: 'none',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '0 14px 8px', padding: 8, background: '#ff525218', borderRadius: 6, color: '#ff5252', fontSize: 10 }}>
          {error}
        </div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#607080', padding: 16, textAlign: 'center' }}>
            {rows.length === 0 ? 'No community data loaded.' : 'No results for current filter.'}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 0', borderBottom: '1px solid #ffffff0c',
                cursor: 'pointer',
              }}
            >
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: 1,
                color: STATE_COLOR[row.state], background: STATE_COLOR[row.state] + '22',
                borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap',
              }}>{row.state}</span>
              <span style={{ flex: 1, color: '#dde8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.name}
              </span>
              {row.type && (
                <span style={{ color: '#607080', fontSize: 9 }}>{row.type}</span>
              )}
              {row.size > 0 && (
                <span style={{ color: '#90a4ae', fontSize: 9 }}>×{row.size}</span>
              )}
              <span style={{ color: '#607080', fontSize: 10 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{
                display: 'flex', gap: 8, padding: '8px 0 12px',
                borderBottom: '1px solid #69f0ae22',
              }}>
                {/* Matched skills */}
                <div style={{ flex: 1, background: 'rgba(0,229,255,0.04)', borderRadius: 6, padding: 8 }}>
                  <div style={{ color: '#00e5ff', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    AIP SKILLS ({row.matchedSkills.length})
                  </div>
                  {row.matchedSkills.length === 0 ? (
                    <div style={{ color: '#607080', fontSize: 9 }}>No skill match</div>
                  ) : row.matchedSkills.slice(0, 5).map(s => (
                    <div key={s.id} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#c8d8e8', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{s.name}</span>
                        {s.category && (
                          <span style={{ color: '#00e5ff', fontSize: 8, background: '#00e5ff22', borderRadius: 3, padding: '1px 4px' }}>{s.category}</span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#ffffff11', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, s.score * 100 / 0.3)}%`, height: '100%', background: '#00e5ff' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Matched live intel */}
                <div style={{ flex: 1, background: 'rgba(255,152,0,0.04)', borderRadius: 6, padding: 8 }}>
                  <div style={{ color: '#ff9800', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    LIVE INTEL ({row.matchedIntel.length})
                  </div>
                  {row.matchedIntel.length === 0 ? (
                    <div style={{ color: '#607080', fontSize: 9 }}>No live event match</div>
                  ) : row.matchedIntel.slice(0, 5).map(e => (
                    <div key={e.id} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#c8d8e8', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{e.name}</span>
                        {e.type && (
                          <span style={{ color: '#ff9800', fontSize: 8, background: '#ff980022', borderRadius: 3, padding: '1px 4px' }}>{e.type}</span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#ffffff11', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, e.score * 100 / 0.3)}%`, height: '100%', background: '#ff9800' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ASSESS */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #69f0ae22' }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: assessing ? 'rgba(105,240,174,0.1)' : 'rgba(105,240,174,0.15)',
            border: '1px solid #69f0ae55', borderRadius: 6, padding: '6px 18px',
            color: '#69f0ae', fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
            cursor: assessing ? 'wait' : 'pointer', letterSpacing: 1, fontWeight: 700,
          }}
        >
          {assessing ? '◌ ASSESSING…' : '⊕ ASSESS'}
        </button>
        {assessText && (
          <div style={{
            marginTop: 8, padding: 8, background: 'rgba(105,240,174,0.06)',
            borderRadius: 6, color: '#c8d8e8', fontSize: 10, lineHeight: 1.5,
          }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}

function btnStyle(col) {
  return {
    background: 'none', border: `1px solid ${col}44`, borderRadius: 4,
    color: col, fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
    padding: '2px 8px', cursor: 'pointer',
  };
}
