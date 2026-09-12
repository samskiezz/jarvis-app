import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPGCOE_RE = /\b(ipgcoe|intel[_\s-]?profile[_\s-]?graph[_\s-]?(?:community|ops)|intel[_\s-]?ops[_\s-]?(?:community|graph)|profile[_\s-]?graph[_\s-]?community[_\s-]?ops|intel[_\s-]?community[_\s-]?ops|unmonitored[_\s-]?intel[_\s-]?profile|profile[_\s-]?surveillance[_\s-]?gap|intel[_\s-]?graph[_\s-]?ops)\b/i;

export function isIpgcoeQuery(t) { return IPGCOE_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function normProfiles(raw) {
  return normaliseArray(raw).map(p => ({
    id: p.id || p._id || String(Math.random()),
    label: p.name || p.title || p.subject || 'Unknown Profile',
    category: p.category || p.type || p.kind || '',
    nationality: p.nationality || p.country || p.origin || '',
    description: String(p.description || p.summary || p.bio || '').slice(0, 300),
    aliases: Array.isArray(p.aliases) ? p.aliases : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
  }));
}

function normCommunities(raw) {
  return normaliseArray(raw).map(c => ({
    id: c.id || c._id || String(Math.random()),
    label: c.label || c.name || c.title || 'Community',
    type: c.type || c.kind || '',
    summary: String(c.summary || c.description || c.detail || ''),
    tags: Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normOpsEvents(raw) {
  return normaliseArray(raw).map(e => ({
    id: e.id || e._id || String(Math.random()),
    title: e.title || e.name || e.event || e.type || 'Ops Event',
    severity: e.severity || e.level || e.priority || 'INFO',
    description: String(e.description || e.detail || e.message || '').slice(0, 200),
    category: e.category || e.kind || '',
    type: e.type || e.event_type || '',
  }));
}

function matchScore(profileToks, fields) {
  if (!profileToks.length) return 0;
  const pool = tok(fields.join(' '));
  if (!pool.length) return 0;
  const hits = profileToks.filter(t => pool.includes(t)).length;
  return hits / Math.max(profileToks.length, pool.length);
}

const THRESHOLD = 0.08;

function correlate(profiles, communities, opsEvents) {
  return profiles.map(profile => {
    const profileToks = tok([
      profile.label,
      profile.category,
      profile.nationality,
      profile.description,
      ...profile.aliases,
      ...profile.tags,
    ].join(' '));

    const bestComm = communities.reduce((best, c) => {
      const s = matchScore(profileToks, [c.label, c.summary, c.type, ...c.tags]);
      return s > best.score ? { score: s, item: c } : best;
    }, { score: 0, item: null });

    const bestOps = opsEvents.reduce((best, e) => {
      const s = matchScore(profileToks, [e.title, e.description, e.category, e.type]);
      return s > best.score ? { score: s, item: e } : best;
    }, { score: 0, item: null });

    const hasComm = bestComm.score >= THRESHOLD;
    const hasOps = bestOps.score >= THRESHOLD;

    let state;
    if (hasComm && hasOps) state = 'FULLY TRACKED';
    else if (hasComm) state = 'COMMUNITY-MAPPED';
    else if (hasOps) state = 'OPS-FLAGGED';
    else state = 'UNMONITORED';

    return { ...profile, state, comm: hasComm ? bestComm : null, ops: hasOps ? bestOps : null };
  });
}

export async function buildIpgcoeScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [pR, cR, oR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);
  const profiles = normProfiles(pR.status === 'fulfilled' ? pR.value : []);
  const communities = normCommunities(cR.status === 'fulfilled' ? cR.value : []);
  const opsEvents = normOpsEvents(oR.status === 'fulfilled' ? oR.value : []);
  const rows = correlate(profiles, communities, opsEvents);
  const ft = rows.filter(r => r.state === 'FULLY TRACKED').length;
  const cm = rows.filter(r => r.state === 'COMMUNITY-MAPPED').length;
  const of_ = rows.filter(r => r.state === 'OPS-FLAGGED').length;
  const um = rows.filter(r => r.state === 'UNMONITORED').length;
  return `IPGCOE Intel Profile × Graph Community × Ops Event: ${profiles.length} intel profiles cross-referenced against ${communities.length} graph communities and ${opsEvents.length} ops events. ` +
    `FULLY TRACKED: ${ft} (network community context + live ops event). ` +
    `COMMUNITY-MAPPED: ${cm} (graph community found, no ops event). ` +
    `OPS-FLAGGED: ${of_} (ops event match, no community context). ` +
    `UNMONITORED: ${um} (no graph community or ops event coverage — surveillance gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 88, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY TRACKED': '#22d3ee',
  'COMMUNITY-MAPPED': '#34d399',
  'OPS-FLAGGED': '#f97316',
  'UNMONITORED': '#f59e0b',
};
const STATE_ORDER = ['FULLY TRACKED', 'COMMUNITY-MAPPED', 'OPS-FLAGGED', 'UNMONITORED'];

const SEV_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', WARNING: '#f59e0b', MEDIUM: '#f59e0b', INFO: '#64748b', LOW: '#64748b' };

export default function IntelProfileGraphCommunityOpsTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [pR, cR, oR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const profiles = normProfiles(pR.status === 'fulfilled' ? pR.value : []);
      const comm = normCommunities(cR.status === 'fulfilled' ? cR.value : []);
      const ops = normOpsEvents(oR.status === 'fulfilled' ? oR.value : []);
      setCommunities(comm);
      setOpsEvents(ops);
      setRows(correlate(profiles, comm, ops));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:ipgcoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:ipgcoe-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const ft = rows.filter(r => r.state === 'FULLY TRACKED').length;
    const um = rows.filter(r => r.state === 'UNMONITORED').length;
    const summary = `IPGCOE: ${rows.length} intel profiles. FULLY TRACKED: ${ft}. COMMUNITY-MAPPED: ${rows.filter(r => r.state === 'COMMUNITY-MAPPED').length}. OPS-FLAGGED: ${rows.filter(r => r.state === 'OPS-FLAGGED').length}. UNMONITORED (surveillance gap): ${um}. ${communities.length} graph communities, ${opsEvents.length} ops events indexed.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this IPGCOE intel profile graph community and ops event surveillance state. Identify the two highest-priority unmonitored intel profiles and the surveillance gaps they represent: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows, communities, opsEvents]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || r.label.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase()))
  );
  const unmonitoredCount = stateCounts['UNMONITORED'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9987, width: 720, maxHeight: 640,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.06)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="IPGCOE Intel Profile × Graph Community × Ops Event Triple Coverage" style={{
        position: 'fixed', left: 766400, bottom: 8, zIndex: 397,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ IPGCOE
        {unmonitoredCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {unmonitoredCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const fullyTracked = stateCounts['FULLY TRACKED'] ?? 0;
  const pct = total > 0 ? Math.round((fullyTracked / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ IPGCOE</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Intel Profile × Graph Community × Ops Event Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>TOTAL</div>
          <div style={VAL}>{total}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>COMMUNITIES</div>
          <div style={{ ...VAL, fontSize: 16 }}>{communities.length}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>OPS EVENTS</div>
          <div style={{ ...VAL, fontSize: 16 }}>{opsEvents.length}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY TRACKED COVERAGE</span>
          <span>{pct}% · {communities.length} communities · {opsEvents.length} ops events</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#f59e0b') : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search intel profiles…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no intel profiles match</div>
        ) : visible.map((profile, i) => (
          <div key={profile.id ?? i} style={{
            padding: '7px 10px', marginBottom: 5, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[profile.state]}22`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (profile.comm || profile.ops) ? 4 : 0 }}>
              <span style={{ fontSize: 8, color: STATE_COLOR[profile.state], minWidth: 140, letterSpacing: 0.5, flexShrink: 0 }}>{profile.state}</span>
              <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.label || '—'}
              </span>
              {profile.category && (
                <span style={{ fontSize: 8, color: '#64748b', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{profile.category}</span>
              )}
              {profile.nationality && (
                <span style={{ fontSize: 8, color: '#475569', flexShrink: 0 }}>{profile.nationality}</span>
              )}
            </div>
            {(profile.comm || profile.ops) && (
              <div style={{ paddingLeft: 148, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {profile.comm && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#22d3ee', minWidth: 20 }}>GC</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.comm.item?.label}</span>
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(profile.comm.score * 100)}%`, background: '#22d3ee', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(profile.comm.score * 100)}%</span>
                  </div>
                )}
                {profile.ops && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: SEV_COLOR[profile.ops.item?.severity?.toUpperCase?.()] ?? '#f97316', minWidth: 20 }}>OE</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.ops.item?.title}</span>
                    <span style={{ fontSize: 7, color: SEV_COLOR[profile.ops.item?.severity?.toUpperCase?.()] ?? '#f97316', background: 'rgba(255,255,255,0.04)', borderRadius: 2, padding: '1px 4px', flexShrink: 0 }}>
                      {profile.ops.item?.severity || 'INFO'}
                    </span>
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(profile.ops.score * 100)}%`, background: '#f97316', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(profile.ops.score * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
          color: '#f59e0b', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>

      <div style={{ padding: '4px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 8, color: 'rgba(0,212,255,0.25)', textAlign: 'right' }}>
        /entities/IntelProfile × /v1/graph/communities × /v1/ops/events
      </div>
    </div>
  );
}
