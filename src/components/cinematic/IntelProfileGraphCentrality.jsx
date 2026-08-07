import { useState, useEffect, useCallback } from 'react';

const API = '';
const IGCP_RE = /\b(intel[._-]?graph[._-]?central|intel[._-]?network[._-]?rank|igcp|intel[._-]?profile[._-]?central|high[._-]?profile[._-]?intel|intel[._-]?central|intel[._-]?network[._-]?rank|which[._-]?intel[._-]?profiles?[._-]?are[._-]?central|intel[._-]?by[._-]?network|central[._-]?intel[._-]?profiles?|network[._-]?intel)\b/i;

export function isIgcpQuery(t) {
  return IGCP_RE.test(t || '');
}

export async function buildIgcpScript() {
  const [iR, cR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
  ]);
  const profiles = normaliseProfiles(iR.status === 'fulfilled' ? iR.value : []);
  const nodes = normaliseNodes(cR.status === 'fulfilled' ? cR.value : []);
  const enriched = correlate(profiles, nodes);
  const highProfile = enriched.filter(p => p._matches.length > 0).length;
  const peripheral = enriched.length - highProfile;
  const topNames = enriched.filter(p => p._matches.length > 0).slice(0, 4)
    .map(p => p.name || p.subject || p.id || '?').join(', ') || 'none';
  return (
    `Intel Profile × Graph Centrality: ${profiles.length} intel profiles, ${nodes.length} central nodes indexed. ` +
    `${highProfile} profiles are HIGH-PROFILE (graph-linked); ${peripheral} are PERIPHERAL. ` +
    `Top graph-linked profiles: ${topNames}.`
  );
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'profiles', 'results', 'data', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseNodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'items', 'results', 'data', 'centrality', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
}

function matchScore(profile, node) {
  const pToks = new Set([
    ...tokens(profile.name),
    ...tokens(profile.subject),
    ...tokens(profile.description),
    ...tokens(profile.category),
    ...tokens(profile.nationality),
    ...tokens(profile.title),
  ].filter(Boolean));
  const nToks = [
    ...tokens(node.label),
    ...tokens(node.name),
    ...tokens(node.id),
    ...tokens(node.type),
    ...tokens(node.entity_type),
  ].filter(Boolean);
  if (!pToks.size || !nToks.length) return 0;
  let hits = 0;
  for (const t of nToks) if (pToks.has(t)) hits++;
  return hits / Math.max(pToks.size, nToks.length);
}

function correlate(profiles, nodes) {
  return profiles.map(p => {
    const scored = nodes
      .map(n => ({ n, score: matchScore(p, n) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...p, _matches: scored };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };
const ACCENT = '#a78bfa';

export default function IntelProfileGraphCentrality() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [nodes, setNodes] = useState([]);
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
      const [iR, cR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
      ]);
      const p = normaliseProfiles(iR.status === 'fulfilled' ? iR.value : []);
      const n = normaliseNodes(cR.status === 'fulfilled' ? cR.value : []);
      setProfiles(p);
      setNodes(n);
      setEnriched(correlate(p, n));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:igcp-toggle', h);
    return () => window.removeEventListener('jarvis:igcp-toggle', h);
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
    const high = enriched.filter(p => p._matches.length > 0);
    const prompt =
      `Intel Profile × Graph Centrality: ${profiles.length} profiles, ${nodes.length} central nodes. ` +
      `${high.length} profiles are HIGH-PROFILE (graph-linked); ${enriched.length - high.length} are PERIPHERAL. ` +
      `Top linked: ${high.slice(0, 5).map(p => p.name || p.subject || p.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence network intelligence brief.`;
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

  const highCount = enriched.filter(p => p._matches.length > 0).length;
  const badge = highCount > 0 ? '#22c55e' : '#64748b';

  const visible = enriched.filter(p => {
    const label = (p.name || p.subject || p.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'HIGH-PROFILE') return p._matches.length > 0;
    if (tab === 'PERIPHERAL') return p._matches.length === 0;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Intel Profile × Graph Centrality"
        style={{
          position: 'fixed',
          left: 570720,
          bottom: 8,
          zIndex: 218,
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
          boxShadow: highCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        IGCP
        {highCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {highCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 560,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: ACCENT }}>◈ INTEL PROFILE × GRAPH CENTRALITY</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)', borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'INTEL PROFILES', val: profiles.length, color: '#a78bfa' },
              { label: 'CENTRAL NODES', val: nodes.length, color: '#60a5fa' },
              { label: 'HIGH-PROFILE', val: highCount, color: highCount > 0 ? '#22c55e' : '#64748b' },
              { label: 'PERIPHERAL', val: enriched.length - highCount, color: '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, fontSize: 12, color: '#c4b5fd', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'HIGH-PROFILE', 'PERIPHERAL'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? ACCENT : '#94a3b8',
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
              placeholder="Search intel profiles…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No profiles match the current filter.</div>
          )}

          <div>
            {visible.map((p, i) => {
              const id = p.id || p._id || i;
              const label = p.name || p.subject || `Profile ${id}`;
              const cat = p.category || p.nationality || '';
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
                      background: p._matches.length > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
                      color: p._matches.length > 0 ? '#22c55e' : '#64748b',
                      border: `1px solid ${p._matches.length > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.25)'}`,
                    }}>
                      {p._matches.length > 0 ? 'HIGH-PROFILE' : 'PERIPHERAL'}
                    </span>
                    {cat && (
                      <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                        {cat}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {p._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{p._matches.length} node{p._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {p._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched centrality nodes:</div>
                          {p._matches.map(({ n, score }, j) => {
                            const nLabel = n.label || n.name || n.id || `node-${j}`;
                            const centrality = typeof n.centrality === 'number' ? n.centrality : (typeof n.score === 'number' ? n.score : null);
                            return (
                              <div key={j} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nLabel}</span>
                                  {centrality !== null && (
                                    <span style={{ color: '#64748b', fontSize: 10 }}>c={centrality.toFixed(4)}</span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: ACCENT, borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: 11 }}>No central graph nodes matched for this intel profile.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} profiles · {nodes.length} central nodes indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
