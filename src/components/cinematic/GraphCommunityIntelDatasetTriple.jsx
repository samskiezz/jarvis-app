import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCIPDS_RE = /\b(gcipds|graph\s+community\s+intel\s+dataset|community\s+intel\s+dataset|graph\s+intel\s+dataset|community\s+intel\s+data|graph\s+community\s+intelligence\s+data|community\s+dataset\s+intel|fully\s+armed\s+community|intel\s+dataset\s+community|blind\s+community\s+triple|community\s+data\s+gap|graph\s+armed\s+community)\b/i;
export function isGcipdsQuery(t) { return GCIPDS_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.communities) ? raw.communities
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c.community_id || String(i),
    label: c.label || c.name || c.title || `Community ${i + 1}`,
    size: c.size || c.node_count || c.members || 0,
    desc: [c.label, c.name, c.title, c.description, c.type, c.category, c.theme].filter(Boolean).join(' '),
  }));
}

function normaliseIntelProfiles(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.intel_profiles) ? raw.intel_profiles
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || String(i),
    text: [r.name, r.subject, r.description, r.category, r.nationality, r.aliases, r.type, r.tags].filter(Boolean).join(' '),
    label: r.name || r.subject || `IntelProfile ${i + 1}`,
    category: r.category || r.type || '',
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.datasets) ? raw.datasets
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((d, i) => ({
    id: d.id || d._id || String(i),
    text: [d.name, d.title, d.description, d.category, d.source, d.type, d.tags].filter(Boolean).join(' '),
    label: d.name || d.title || `Dataset ${i + 1}`,
    category: d.category || d.type || '',
  }));
}

function matchScore(communityToks, fieldText) {
  if (!communityToks.length) return 0;
  const fToks = new Set(tok(fieldText));
  let hits = 0;
  for (const t of communityToks) if (fToks.has(t)) hits++;
  return hits / communityToks.length;
}

const THRESHOLD = 0.08;

function correlate(communities, intelProfiles, datasets) {
  return communities.map(comm => {
    const toks = tok(comm.desc);
    let bestIntel = null, intelScore = 0;
    for (const ip of intelProfiles) {
      const s = matchScore(toks, ip.text);
      if (s > intelScore) { intelScore = s; bestIntel = ip; }
    }
    let bestDs = null, dsScore = 0;
    for (const ds of datasets) {
      const s = matchScore(toks, ds.text);
      if (s > dsScore) { dsScore = s; bestDs = ds; }
    }
    const hasIntel = intelScore >= THRESHOLD;
    const hasDs = dsScore >= THRESHOLD;
    let state;
    if (hasIntel && hasDs) state = 'FULLY ARMED';
    else if (hasIntel) state = 'INTEL-ONLY';
    else if (hasDs) state = 'DATA-BACKED';
    else state = 'BLIND';
    return { ...comm, state, bestIntel, intelScore, bestDs, dsScore };
  });
}

export async function buildGcipdsScript() {
  const key = (typeof localStorage !== 'undefined' && localStorage.getItem('jarvis_api_key')) || 'dev-key';
  const h = { Authorization: `Bearer ${key}` };
  const base = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
  const [gcRes, ipRes, dsRes] = await Promise.allSettled([
    fetch(`${base}/v1/graph/communities`, { headers: h }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()),
    fetch(`${base}/v1/datasets`, { headers: h }).then(r => r.json()),
  ]);
  const comms = normaliseCommunities(gcRes.status === 'fulfilled' ? gcRes.value : null);
  const intels = normaliseIntelProfiles(ipRes.status === 'fulfilled' ? ipRes.value : []);
  const datasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : []);
  const rows = correlate(comms, intels, datasets);
  const armed = rows.filter(r => r.state === 'FULLY ARMED').length;
  const blind = rows.filter(r => r.state === 'BLIND').length;
  return `GCIPDS: ${rows.length} graph communities cross-referenced against ${intels.length} intel profiles and ${datasets.length} datasets. ${armed} FULLY ARMED (intel profile + dataset coverage), ${blind} BLIND (no intel profile or dataset match). ${armed > 0 ? `${armed} community${armed > 1 ? 'ies' : ''} have both threat intelligence profiling and dataset backing — fully armed intelligence clusters.` : 'No communities are fully armed.'} ${blind > 0 ? `${blind} community${blind > 1 ? 'ies' : ''} lack both intel profile and dataset coverage — potential intelligence blind spots.` : 'All communities have at least intel or dataset coverage.'}`;
}

const TILE = { background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 10px', textAlign: 'center', minWidth: 72 };
const LBL = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 };
const VAL = { fontSize: 18, fontWeight: 700, color: '#e2e8f0' };
const STATE_COLOR = { 'FULLY ARMED': '#22d3ee', 'INTEL-ONLY': '#a78bfa', 'DATA-BACKED': '#34d399', 'BLIND': '#64748b' };
const STATE_ORDER = ['FULLY ARMED', 'INTEL-ONLY', 'DATA-BACKED', 'BLIND'];

export default function GraphCommunityIntelDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const h = { Authorization: `Bearer ${key}` };
      const [gcRes, ipRes, dsRes] = await Promise.allSettled([
        fetch(`${API}/v1/graph/communities`, { headers: h }).then(r => r.json()),
        fetch(`${API}/entities/IntelProfile`, { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: h }).then(r => r.json()),
      ]);
      const comms = normaliseCommunities(gcRes.status === 'fulfilled' ? gcRes.value : null);
      const intels = normaliseIntelProfiles(ipRes.status === 'fulfilled' ? ipRes.value : []);
      const datasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : []);
      setRows(correlate(comms, intels, datasets));
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:gcipds-toggle', handler);
    return () => window.removeEventListener('jarvis:gcipds-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.label.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const armed = rows.filter(r => r.state === 'FULLY ARMED').length;
  const intelOnly = rows.filter(r => r.state === 'INTEL-ONLY').length;
  const dataBacked = rows.filter(r => r.state === 'DATA-BACKED').length;
  const blind = rows.filter(r => r.state === 'BLIND').length;

  const assess = async () => {
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `GCIPDS graph community intel-profile dataset triple coverage: ${rows.length} communities, ${armed} FULLY ARMED, ${blind} BLIND. In 2 sentences, identify the highest-priority blind community clusters and recommend immediate intelligence actions.` }),
      });
      const d = await r.json();
      const text = (d.answer || '').trim();
      if (text) {
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
        fetch(`${API}/v1/voice/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ text }) }).catch(() => {});
      }
    } catch {}
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × Intel Profile × Dataset Triple Coverage"
        style={{ position: 'fixed', left: 772560, bottom: 8, zIndex: 408, background: 'rgba(34,211,238,0.13)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 6, color: '#22d3ee', fontSize: 10, padding: '3px 7px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1 }}
      >
        ◈ GCIPDS{blind > 0 ? <span style={{ marginLeft: 4, background: '#f59e0b', color: '#000', borderRadius: 3, padding: '0 4px', fontWeight: 700 }}>{blind}</span> : null}
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', left: 772560 > window.innerWidth - 420 ? window.innerWidth - 440 : 772560, bottom: 48, zIndex: 408, width: 420, maxHeight: '80vh', overflowY: 'auto', background: 'rgba(10,15,28,0.97)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 10, padding: 14, fontFamily: 'monospace', color: '#e2e8f0', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 12 }}>◈ GCIPDS — Graph Community × Intel × Dataset</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {[['COMMUNITIES', rows.length, '#e2e8f0'], ['ARMED', armed, '#22d3ee'], ['INTEL-ONLY', intelOnly, '#a78bfa'], ['DATA-BACKED', dataBacked, '#34d399'], ['BLIND', blind, '#f59e0b']].map(([l, v, c]) => (
          <div key={l} style={TILE}><div style={LBL}>{l}</div><div style={{ ...VAL, color: c }}>{v}</div></div>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 3 }}>FULLY ARMED COVERAGE</div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((armed / rows.length) * 100)}%`, background: 'linear-gradient(90deg,#22d3ee,#06b6d4)', borderRadius: 3, transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{Math.round((armed / rows.length) * 100)}% armed</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${filter === f ? '#22d3ee' : 'rgba(255,255,255,0.1)'}`, borderRadius: 4, color: filter === f ? '#22d3ee' : '#94a3b8', fontSize: 9, padding: '2px 6px', cursor: 'pointer' }}>{f}</button>
        ))}
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search communities…"
        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontSize: 10, padding: '4px 8px', marginBottom: 8, boxSizing: 'border-box' }}
      />

      {loading && <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 6 }}>Loading…</div>}
      {err && <div style={{ color: '#f87171', fontSize: 10, marginBottom: 6 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '45vh', overflowY: 'auto' }}>
        {visible.map(row => (
          <div key={row.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px', borderLeft: `3px solid ${STATE_COLOR[row.state]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
              <span style={{ fontWeight: 600, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              <span style={{ fontSize: 9, background: `${STATE_COLOR[row.state]}22`, color: STATE_COLOR[row.state], borderRadius: 3, padding: '1px 5px', marginLeft: 6, whiteSpace: 'nowrap' }}>{row.state}</span>
              {row.size > 0 && <span style={{ fontSize: 9, color: '#64748b', marginLeft: 4 }}>{row.size}n</span>}
            </div>
            {expanded === row.id && (
              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#a78bfa', marginBottom: 3 }}>INTEL PROFILE</div>
                  {row.bestIntel ? (
                    <>
                      <div style={{ fontSize: 10, color: '#e2e8f0' }}>{row.bestIntel.label}</div>
                      {row.bestIntel.category && <div style={{ fontSize: 9, color: '#94a3b8' }}>{row.bestIntel.category}</div>}
                      <div style={{ height: 4, background: 'rgba(167,139,250,0.15)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.round(row.intelScore * 100))}%`, background: '#a78bfa', borderRadius: 2 }} />
                      </div>
                    </>
                  ) : <div style={{ fontSize: 9, color: '#64748b' }}>No match</div>}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#34d399', marginBottom: 3 }}>DATASET</div>
                  {row.bestDs ? (
                    <>
                      <div style={{ fontSize: 10, color: '#e2e8f0' }}>{row.bestDs.label}</div>
                      {row.bestDs.category && <div style={{ fontSize: 9, color: '#94a3b8' }}>{row.bestDs.category}</div>}
                      <div style={{ height: 4, background: 'rgba(52,211,153,0.15)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.round(row.dsScore * 100))}%`, background: '#34d399', borderRadius: 2 }} />
                      </div>
                    </>
                  ) : <div style={{ fontSize: 9, color: '#64748b' }}>No match</div>}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && <div style={{ color: '#64748b', fontSize: 10 }}>No communities match filter.</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button onClick={assess} style={{ background: 'rgba(34,211,238,0.13)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 4, color: '#22d3ee', fontSize: 10, padding: '3px 10px', cursor: 'pointer' }}>ASSESS</button>
        <span style={{ fontSize: 9, color: '#475569' }}>{lastRefresh ? `refreshed ${lastRefresh}` : ''}</span>
        <button onClick={load} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '2px 8px', cursor: 'pointer' }}>↻</button>
      </div>
    </div>
  );
}
