import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPGCSC_RE = /\b(ipgcsc|intel\s+profile\s+graph\s+scenario|intel\s+profile\s+community\s+scenario|profile\s+community\s+scenario|undeployed\s+intel|intel\s+community\s+scenario|intel\s+graph\s+scenario|intel\s+profile\s+network\s+scenario|profile\s+network\s+scenario|intel\s+profile\s+scenario\s+community|profile\s+scenario\s+community|intel\s+profile\s+deployed|intel\s+network\s+scenario)\b/i;

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

function normaliseIntelProfiles(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.profiles) ? data.profiles
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(p => ({
    id: p.id || p._id || p.profileId || String(Math.random()),
    name: p.name || p.fullName || p.label || 'Unknown Profile',
    role: p.role || p.title || p.position || '',
    company: p.company || p.organisation || p.organization || p.affiliation || '',
    sector: p.sector || p.industry || '',
    nationality: p.nationality || p.country || '',
    aliases: Array.isArray(p.aliases) ? p.aliases.join(' ') : String(p.aliases || ''),
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    raw: p,
  }));
}

function normaliseCommunitites(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.communities) ? data.communities
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || c.communityId || String(Math.random()),
    name: c.name || c.label || c.title || 'Unnamed Community',
    type: c.type || c.kind || c.category || '',
    description: c.description || c.desc || c.summary || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.scenarios) ? data.scenarios
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || s.scenarioId || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Scenario',
    category: s.category || s.type || s.kind || '',
    description: s.description || s.desc || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function correlate(profiles, communities, scenarios) {
  return profiles.map(profile => {
    const toks = tok([profile.name, profile.role, profile.company, profile.sector, profile.nationality, profile.aliases, profile.tags].join(' '));

    const matchedCommunities = communities
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.type),
          matchScore(toks, c.description),
          matchScore(toks, c.tags),
        );
        return { ...c, score };
      })
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedScenarios = scenarios
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

    const hasCommunity = matchedCommunities.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let state;
    if (hasCommunity && hasScenario) state = 'FULLY DEPLOYED';
    else if (hasCommunity) state = 'NETWORK-MAPPED';
    else if (hasScenario) state = 'SCENARIO-PLANNED';
    else state = 'UNDEPLOYED';

    return { profile, matchedCommunities, matchedScenarios, state };
  });
}

export function isIpgcscQuery(t) {
  return IPGCSC_RE.test(t || '');
}

export async function buildIpgcscScript() {
  try {
    const [pRes, cRes, sRes] = await Promise.allSettled([
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
    ]);
    const profiles = normaliseIntelProfiles(pRes.status === 'fulfilled' ? pRes.value : null);
    const communities = normaliseCommunitites(cRes.status === 'fulfilled' ? cRes.value : null);
    const scenarios = normaliseScenarios(sRes.status === 'fulfilled' ? sRes.value : null);
    const rows = correlate(profiles, communities, scenarios);
    const fully = rows.filter(r => r.state === 'FULLY DEPLOYED').length;
    const networked = rows.filter(r => r.state === 'NETWORK-MAPPED').length;
    const planned = rows.filter(r => r.state === 'SCENARIO-PLANNED').length;
    const undeployed = rows.filter(r => r.state === 'UNDEPLOYED').length;
    return `IPGCSC IntelProfile×GraphCommunity×Scenario: ${rows.length} intel profiles analysed. ` +
      `${fully} FULLY DEPLOYED (community + scenario), ` +
      `${networked} NETWORK-MAPPED (community only), ${planned} SCENARIO-PLANNED (scenario only), ${undeployed} UNDEPLOYED. ` +
      (undeployed > 0 ? `${undeployed} intel profiles have no network or scenario coverage — personnel deployment gap.` :
        fully > 0 ? `Top deployed: ${rows.find(r => r.state === 'FULLY DEPLOYED')?.profile.name || 'see panel'}.` :
        'No fully deployed intel profiles at this time.');
  } catch {
    return 'IPGCSC: data fetch failed.';
  }
}

export default function IntelProfileGraphCommunityScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:ipgcsc-toggle', handler);
    return () => window.removeEventListener('jarvis:ipgcsc-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [pRes, cRes, sRes] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const profiles = normaliseIntelProfiles(pRes.status === 'fulfilled' ? pRes.value : null);
      const communities = normaliseCommunitites(cRes.status === 'fulfilled' ? cRes.value : null);
      const scenarios = normaliseScenarios(sRes.status === 'fulfilled' ? sRes.value : null);
      if (!profiles.length && !communities.length && !scenarios.length) {
        setErr('No data returned from IntelProfile, Graph Communities, or Scenario endpoints.');
      }
      setRows(correlate(profiles, communities, scenarios));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully = rows.filter(r => r.state === 'FULLY DEPLOYED').length;
  const networked = rows.filter(r => r.state === 'NETWORK-MAPPED').length;
  const planned = rows.filter(r => r.state === 'SCENARIO-PLANNED').length;
  const undeployed = rows.filter(r => r.state === 'UNDEPLOYED').length;

  const TABS = ['ALL', 'FULLY DEPLOYED', 'NETWORK-MAPPED', 'SCENARIO-PLANNED', 'UNDEPLOYED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.profile.name.toLowerCase().includes(q) ||
        r.profile.role.toLowerCase().includes(q) ||
        r.profile.company.toLowerCase().includes(q) ||
        r.matchedCommunities.some(c => c.name.toLowerCase().includes(q)) ||
        r.matchedScenarios.some(s => s.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const coverageBarWidth = total > 0 ? {
    fully: (fully / total) * 100,
    networked: (networked / total) * 100,
    planned: (planned / total) * 100,
    undeployed: (undeployed / total) * 100,
  } : { fully: 0, networked: 0, planned: 0, undeployed: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Intel profile "${row.profile.name}" [${row.state}]: ` +
      `graph communities: ${row.matchedCommunities.map(c => c.name).join(', ') || 'none'}. ` +
      `scenarios: ${row.matchedScenarios.map(s => s.name).join(', ') || 'none'}. ` +
      `Role: ${row.profile.role || 'unknown'}. Company: ${row.profile.company || 'unknown'}. ` +
      `Sector: ${row.profile.sector || 'unspecified'}. ` +
      `Give a 2-sentence intel profile network and scenario deployment coverage brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  const STATE_COLOUR = {
    'FULLY DEPLOYED': '#00ff88',
    'NETWORK-MAPPED': '#10b981',
    'SCENARIO-PLANNED': '#8b5cf6',
    'UNDEPLOYED': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 810640,
          bottom: 8,
          zIndex: 476,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00ff8844',
          color: '#00ff88',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ IPGCSC
        {undeployed > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#555',
            color: '#ccc',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {undeployed}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00ff8855',
      borderRadius: 8,
      zIndex: 476,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00ff8822',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00ff8822',
        background: 'rgba(0,255,136,0.05)',
      }}>
        <span style={{ color: '#00ff88', fontWeight: 700, letterSpacing: 1 }}>
          ◈ INTEL PROFILE × GRAPH COMMUNITY × SCENARIO
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #00ff8844',
              color: '#00ff88',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00ff8811' }}>
        {[
          { label: 'FULLY DEPLOYED', val: fully, col: '#00ff88' },
          { label: 'NETWORK-MAPPED', val: networked, col: '#10b981' },
          { label: 'SCENARIO-PLANNED', val: planned, col: '#8b5cf6' },
          { label: 'UNDEPLOYED', val: undeployed, col: '#555' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,255,136,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00ff8811' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#001a0a' }}>
            <div style={{ width: `${coverageBarWidth.fully}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.networked}%`, background: '#10b981', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.planned}%`, background: '#8b5cf6', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.undeployed}%`, background: '#333', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ DEPLOYED</span>
            <span style={{ color: '#10b981' }}>■ NETWORK-MAPPED</span>
            <span style={{ color: '#8b5cf6' }}>■ SCENARIO-PLANNED</span>
            <span style={{ color: '#444' }}>■ UNDEPLOYED</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#00ff8822' : 'none',
              border: `1px solid ${filter === t ? '#00ff88' : '#00ff8833'}`,
              color: filter === t ? '#00ff88' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,255,136,0.05)',
            border: '1px solid #00ff8833',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching intel profiles.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.profile.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.profile.id}
              style={{
                borderBottom: '1px solid #00ff880d',
                background: isExp ? 'rgba(0,255,136,0.03)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.profile.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.profile.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.profile.role && (
                  <span style={{ color: '#8888ff', fontSize: 9, marginLeft: 4 }}>
                    [{row.profile.role}]
                  </span>
                )}
                {row.profile.company && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    {row.profile.company}
                  </span>
                )}
                <span style={{ color: '#00ff8844', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.profile.sector && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.profile.sector}{row.profile.nationality ? ` · ${row.profile.nationality}` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched communities */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#10b981', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        GRAPH COMMUNITIES ({row.matchedCommunities.length})
                      </div>
                      {row.matchedCommunities.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No graph communities matched.</div>
                      )}
                      {row.matchedCommunities.slice(0, 5).map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#a7f3d0', fontWeight: 600 }}>{c.name}</span>
                            <span style={{ color: '#10b981', fontSize: 10 }}>{(c.score * 100).toFixed(0)}%</span>
                          </div>
                          {c.type && (
                            <div style={{ color: '#556', fontSize: 10 }}>{c.type}</div>
                          )}
                          <div style={{ height: 3, background: '#001a0a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(c.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #10b981, #065f46)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched scenarios */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#8b5cf6', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No scenarios matched.</div>
                      )}
                      {row.matchedScenarios.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ddd6fe', fontWeight: 600 }}>{s.name}</span>
                            <span style={{ color: '#8b5cf6', fontSize: 10 }}>{(s.score * 100).toFixed(0)}%</span>
                          </div>
                          {s.category && (
                            <div style={{ color: '#556', fontSize: 10 }}>{s.category}</div>
                          )}
                          <div style={{ height: 3, background: '#0d0010', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(s.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #8b5cf6, #4c1d95)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(0,255,136,0.08)',
                      border: '1px solid #00ff8855',
                      color: '#00ff88',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
