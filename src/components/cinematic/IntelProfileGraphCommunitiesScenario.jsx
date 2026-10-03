import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_MAPPED', 'CLUSTERED_ONLY', 'PLANNED_ONLY', 'UNMAPPED'];

function tokenise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

function overlaps(a, b) {
  const setA = new Set(tokenise(a));
  return tokenise(b).some(t => setA.has(t));
}

function buildCommunityIndex(communities) {
  const idx = new Set();
  (communities || []).forEach(c => {
    const key = (c.id || c.community_id || c.name || '').toString().toLowerCase();
    if (key) idx.add(key);
    (c.members || []).forEach(m => {
      const mk = (m.id || m.entity_id || m || '').toString().toLowerCase();
      if (mk) idx.add(mk);
    });
    (c.tags || []).forEach(t => idx.add(t.toLowerCase()));
    (c.labels || []).forEach(l => idx.add(l.toLowerCase()));
  });
  return idx;
}

function buildScenarioIndex(scenarios) {
  const idx = new Set();
  (scenarios || []).forEach(s => {
    const key = (s.alert_id || s.id || s.name || '').toString().toLowerCase();
    if (key) idx.add(key);
    (s.tags || []).forEach(t => idx.add(t.toLowerCase()));
    (s.labels || []).forEach(l => idx.add(l.toLowerCase()));
  });
  return idx;
}

function matchProfile(profile, communityIndex, scenarioIndex) {
  const tokens = [
    profile.id, profile.entity_id, profile.name, profile.type,
    profile.description, profile.summary,
    ...(profile.tags || []), ...(profile.aliases || []),
  ].filter(Boolean).map(v => v.toString().toLowerCase());

  const hasCluster = tokens.some(t =>
    communityIndex.has(t) || [...communityIndex].some(s => overlaps(t, s))
  );
  const hasScenario = tokens.some(t =>
    scenarioIndex.has(t) || [...scenarioIndex].some(s => overlaps(t, s))
  );
  return { hasCluster, hasScenario };
}

function classify(hasCluster, hasScenario) {
  if (hasCluster && hasScenario) return 'FULLY_MAPPED';
  if (hasCluster) return 'CLUSTERED_ONLY';
  if (hasScenario) return 'PLANNED_ONLY';
  return 'UNMAPPED';
}

export default function IntelProfileGraphCommunitiesScenario() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [profilesRes, communitiesRes, scenariosRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`),
        fetch(`${API}/v1/graph/communities`),
        fetch(`${API}/v1/scenario/list`),
      ]);

      const profilesData = profilesRes.ok ? await profilesRes.json() : {};
      const communitiesData = communitiesRes.ok ? await communitiesRes.json() : {};
      const scenariosData = scenariosRes.ok ? await scenariosRes.json() : {};

      const rawProfiles = profilesData.items || profilesData.data || profilesData.profiles || [];
      const rawCommunities = communitiesData.communities || communitiesData.items || communitiesData.data || [];
      const rawScenarios = scenariosData.scenarios || scenariosData.items || scenariosData.data || [];

      const communityIndex = buildCommunityIndex(rawCommunities);
      const scenarioIndex = buildScenarioIndex(rawScenarios);

      const classified = rawProfiles.map(p => {
        const { hasCluster, hasScenario } = matchProfile(p, communityIndex, scenarioIndex);
        return { ...p, _class: classify(hasCluster, hasScenario), _hasCluster: hasCluster, _hasScenario: hasScenario };
      });

      setProfiles(classified);
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:igcsn-toggle', handler);
    return () => window.removeEventListener('jarvis:igcsn-toggle', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const filtered = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || [r.id, r.entity_id, r.name, r.type, r.description, r.summary]
      .filter(Boolean).some(v => v.toString().toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const counts = {
    ALL: profiles.length,
    FULLY_MAPPED: profiles.filter(p => p._class === 'FULLY_MAPPED').length,
    CLUSTERED_ONLY: profiles.filter(p => p._class === 'CLUSTERED_ONLY').length,
    PLANNED_ONLY: profiles.filter(p => p._class === 'PLANNED_ONLY').length,
    UNMAPPED: profiles.filter(p => p._class === 'UNMAPPED').length,
  };

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.FULLY_MAPPED} fully-mapped, ${counts.CLUSTERED_ONLY} cluster-only, ${counts.PLANNED_ONLY} scenario-only, ${counts.UNMAPPED} unmapped intel profiles with no graph community or scenario coverage.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Intel Profile × Graph Communities × Scenario coverage (IGCSN): ${summary} Provide a 2-sentence operational brief on coverage gaps and recommended intelligence action.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const classColor = {
    FULLY_MAPPED: '#00ff88',
    CLUSTERED_ONLY: '#00bfff',
    PLANNED_ONLY: '#ffd700',
    UNMAPPED: '#ff4444',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8340, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #00bfff',
          color: '#00bfff', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ IGCSN
        {counts.UNMAPPED > 0 && (
          <span style={{
            background: '#ff4444', color: '#000', borderRadius: 10,
            padding: '1px 6px', fontSize: 10, fontWeight: 700,
          }}>
            {counts.UNMAPPED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.92)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #0a2a3a',
        background: 'rgba(0,10,20,0.9)',
      }}>
        <div>
          <span style={{ color: '#00bfff', fontWeight: 700, fontSize: 16 }}>◈ IGCSN</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Intel Profile × Graph Communities × Scenario Intelligence Nexus
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88',
              color: '#00ff88', padding: '4px 12px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '⟳ Assessing…' : '◈ ASSESS'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            ⟳
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
        {Object.entries(counts).filter(([k]) => k !== 'ALL').map(([k, v]) => (
          <div key={k} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${classColor[k]}44`,
            borderRadius: 6, padding: '8px 16px', minWidth: 130, cursor: 'pointer',
            borderLeft: `3px solid ${classColor[k]}`,
          }} onClick={() => setTab(k)}>
            <div style={{ color: classColor[k], fontSize: 22, fontWeight: 700 }}>{v}</div>
            <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
          borderRadius: 6, padding: '8px 16px', minWidth: 130,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{counts.ALL}</div>
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL PROFILES</div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(0,191,255,0.05)',
          border: '1px solid #00bfff44', borderRadius: 6, padding: '8px 12px',
          color: '#00bfff', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(0,191,255,0.2)' : 'transparent',
            border: `1px solid ${tab === t ? '#00bfff' : '#333'}`,
            color: tab === t ? '#00bfff' : '#666',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            {t} ({counts[t] ?? 0})
          </button>
        ))}
        <input
          placeholder="Search intel profiles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333', borderRadius: 4, color: '#e0e0e0',
            padding: '4px 10px', fontSize: 11, width: 220,
          }}
        />
      </div>

      {/* table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {loading && <div style={{ color: '#555', fontSize: 12, padding: 16 }}>⟳ Loading…</div>}
        {err && <div style={{ color: '#ff4444', fontSize: 12, padding: 16 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, padding: 16 }}>No intel profiles match.</div>
        )}
        {!loading && filtered.map(p => {
          const pid = p.id || p.entity_id;
          const isExp = expanded === pid;
          return (
            <div key={pid || Math.random()} style={{
              borderBottom: '1px solid #1a1a1a', padding: '8px 0',
              cursor: 'pointer',
            }} onClick={() => setExpanded(isExp ? null : pid)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  color: classColor[p._class] || '#888',
                  fontSize: 10, minWidth: 110, fontWeight: 600,
                }}>
                  {(p._class || 'UNMAPPED').replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {p.name || p.description || p.type || pid || '—'}
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>
                  {p._hasCluster ? '◈ cluster' : ''}
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>
                  {p._hasScenario ? '◈ scenario' : ''}
                </span>
                <span style={{ color: '#333', fontSize: 10 }}>▾</span>
              </div>
              {isExp && (
                <div style={{
                  marginTop: 6, padding: '8px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4, fontSize: 11, color: '#888',
                }}>
                  <div><b style={{ color: '#aaa' }}>ID:</b> {pid || '—'}</div>
                  <div><b style={{ color: '#aaa' }}>Type:</b> {p.type || '—'}</div>
                  <div><b style={{ color: '#aaa' }}>Summary:</b> {p.summary || p.description || '—'}</div>
                  <div><b style={{ color: '#aaa' }}>Tags:</b> {(p.tags || []).join(', ') || '—'}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                    <span>
                      <b style={{ color: '#aaa' }}>Graph Community:</b>{' '}
                      <span style={{ color: p._hasCluster ? '#00bfff' : '#555' }}>
                        {p._hasCluster ? 'MATCHED' : 'NONE'}
                      </span>
                    </span>
                    <span>
                      <b style={{ color: '#aaa' }}>Scenario:</b>{' '}
                      <span style={{ color: p._hasScenario ? '#ffd700' : '#555' }}>
                        {p._hasScenario ? 'MATCHED' : 'NONE'}
                      </span>
                    </span>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <b style={{ color: '#aaa' }}>Coverage:</b>{' '}
                    <span style={{ color: classColor[p._class] }}>
                      {(p._class || 'UNMAPPED').replace(/_/g, ' ')}
                    </span>
                  </div>
                  {p.created_at && (
                    <div><b style={{ color: '#aaa' }}>Created:</b> {p.created_at}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: '6px 20px', borderTop: '1px solid #1a1a1a',
        color: '#444', fontSize: 10, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>IGCSN — auto-refresh 90s</span>
        <span>{filtered.length} of {profiles.length} intel profiles shown</span>
      </div>
    </div>
  );
}

export { IntelProfileGraphCommunitiesScenario };

export function isIgcsnQuery(q) {
  const lower = q.toLowerCase();
  return [
    'igcsn', 'intel profile graph', 'intel graph communities', 'intel cluster scenario',
    'profile community plan', 'which intel profiles are in clusters',
    'intel community coverage', 'intel profile scenario', 'intel community nexus',
    'graph community intel', 'intel profile cluster',
  ].some(kw => lower.includes(kw));
}

export function buildIgcsnScript() {
  return `Checking Intel Profile × Graph Communities × Scenario coverage (IGCSN)…`;
}
