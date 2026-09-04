import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const IGOETRI_RE = /\b(igoetri|invest\s+graph\s+community\s+ops|investment\s+community\s+ops|invest\s+ops\s+community|investment\s+ops\s+community|alarmed\s+investment|invest\s+ops\s+event|investment\s+community\s+event|community\s+ops\s+invest|ops\s+community\s+invest)\b/i;

export function isIgoetriQuery(t) { return IGOETRI_RE.test(t || ''); }

function kwInvest(i) {
  return [i?.name, i?.title, i?.description, i?.category,
          i?.ticker, i?.type, i?.sector, i?.tags, i?.asset_class]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwCommunity(c) {
  return [c?.name, c?.label, c?.description, c?.category,
          c?.type, c?.tags, c?.domain, c?.keywords]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwOps(o) {
  return [o?.name, o?.title, o?.description, o?.category,
          o?.type, o?.tags, o?.severity, o?.event_type]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildIgoetriScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [iR, cR, oR] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);

  const investments  = (iR.status === 'fulfilled'
    ? (iR.value?.data ?? iR.value?.investments ?? iR.value ?? []) : []).slice(0, 200);
  const communities  = (cR.status === 'fulfilled'
    ? (cR.value?.data ?? cR.value?.communities ?? cR.value ?? []) : []).slice(0, 200);
  const opsEvents    = (oR.status === 'fulfilled'
    ? (oR.value?.data ?? oR.value?.events ?? oR.value ?? []) : []).slice(0, 200);

  let fullyAlarmed = 0, communityTied = 0, opsFlagged = 0, clear = 0;
  for (const inv of investments) {
    const words = kwInvest(inv).split(/\s+/).filter(w => w.length > 3);
    const hasCommunity = communities.some(c => relevance(words, kwCommunity(c)) > 0.12);
    const hasOps       = opsEvents.some(o => relevance(words, kwOps(o)) > 0.12);
    if (hasCommunity && hasOps) fullyAlarmed++;
    else if (hasCommunity)     communityTied++;
    else if (hasOps)           opsFlagged++;
    else                       clear++;
  }

  return `IGOETRI: ${investments.length} investments × ${communities.length} communities × ${opsEvents.length} ops events. ` +
    `${fullyAlarmed} FULLY ALARMED (community+ops), ${communityTied} COMMUNITY-TIED, ${opsFlagged} OPS-FLAGGED, ${clear} CLEAR. ` +
    (fullyAlarmed > 0
      ? `${fullyAlarmed} investments have both graph community context and active ops event alignment — operational exposure confirmed.`
      : 'No investments show combined community and ops event alignment.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const AM  = '#F59E0B';
const EM  = '#10B981';
const OR  = '#F97316';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY ALARMED': AM, 'COMMUNITY-TIED': EM, 'OPS-FLAGGED': OR, CLEAR: GY };

export default function InvestGraphCommunityOpsTriple() {
  const [open, setOpen]             = useState(false);
  const [investments, setInvestments] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [opsEvents, setOpsEvents]     = useState([]);
  const [rows, setRows]             = useState([]);
  const [filter, setFilter]         = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:igoetri-toggle', h);
    return () => window.removeEventListener('jarvis:igoetri-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [iR, cR, oR] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const invs = (iR.status === 'fulfilled'
        ? (iR.value?.data ?? iR.value?.investments ?? iR.value ?? []) : []).slice(0, 200);
      const cms  = (cR.status === 'fulfilled'
        ? (cR.value?.data ?? cR.value?.communities ?? cR.value ?? []) : []).slice(0, 200);
      const ops  = (oR.status === 'fulfilled'
        ? (oR.value?.data ?? oR.value?.events ?? oR.value ?? []) : []).slice(0, 200);
      setInvestments(invs);
      setCommunities(cms);
      setOpsEvents(ops);

      const built = invs.map(inv => {
        const words = kwInvest(inv).split(/\s+/).filter(w => w.length > 3);
        const matchedCommunities = cms
          .map(c => ({ ...c, _r: relevance(words, kwCommunity(c)) }))
          .filter(c => c._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedOps = ops
          .map(o => ({ ...o, _r: relevance(words, kwOps(o)) }))
          .filter(o => o._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasCommunity = matchedCommunities.length > 0;
        const hasOps       = matchedOps.length > 0;
        const state = hasCommunity && hasOps ? 'FULLY ALARMED'
          : hasCommunity                     ? 'COMMUNITY-TIED'
          : hasOps                           ? 'OPS-FLAGGED'
          : 'CLEAR';
        return { ...inv, matchedCommunities, matchedOps, state };
      });
      setRows(built);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyAlarmed  = rows.filter(r => r.state === 'FULLY ALARMED').length;
  const communityTied = rows.filter(r => r.state === 'COMMUNITY-TIED').length;
  const opsFlagged    = rows.filter(r => r.state === 'OPS-FLAGGED').length;
  const clear         = rows.filter(r => r.state === 'CLEAR').length;
  const total         = rows.length || 1;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwInvest(r).includes(s); }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message:
          `Summarise investment graph-community and ops-event exposure in 2 sentences: ` +
          `${fullyAlarmed} FULLY ALARMED (community+ops), ${communityTied} COMMUNITY-TIED, ` +
          `${opsFlagged} OPS-FLAGGED, ${clear} CLEAR out of ${rows.length} investments. ` +
          `Communities: ${communities.length}, ops events: ${opsEvents.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 807280, bottom: 8, zIndex: 470, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ IGOETRI</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>INVESTMENT × COMMUNITY × OPS EVENT</span>
        {fullyAlarmed > 0 && (
          <span style={{ marginLeft: 'auto', background: AM, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{fullyAlarmed} ALARMED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: fullyAlarmed > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['INVEST',      investments.length, CY],
          ['COMMS',       communities.length, EM],
          ['OPS EVT',     opsEvents.length,   OR],
          ['ALARMED',     fullyAlarmed,        AM],
          ['COMM-TIED',   communityTied,       EM],
          ['OPS-FLAGD',   opsFlagged,          OR],
          ['CLEAR',       clear,               GY],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: 'rgba(0,212,255,0.05)', borderRadius: 6,
            padding: '4px 2px', textAlign: 'center' }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 12 }}>{loading ? '…' : val}</div>
            <div style={{ color: '#4A6080', fontSize: 7, letterSpacing: 0.5 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ display: 'flex', height: 4, margin: '0 12px 8px', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${(fullyAlarmed  / total) * 100}%`, background: AM }} />
        <div style={{ width: `${(communityTied / total) * 100}%`, background: EM }} />
        <div style={{ width: `${(opsFlagged    / total) * 100}%`, background: OR }} />
        <div style={{ width: `${(clear         / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY ALARMED', 'COMMUNITY-TIED', 'OPS-FLAGGED', 'CLEAR'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${CY2}`,
            background: 'transparent', color: CY2, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ width: '100%', background: 'rgba(0,212,255,0.05)', border: `1px solid ${BD}`,
            borderRadius: 4, padding: '4px 8px', color: '#DCEBF5', fontSize: 10,
            outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#4A6080', padding: '12px 0', textAlign: 'center' }}>loading…</div>}
        {!loading && filtered.map((r, i) => {
          const id    = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          const label = r.name ?? r.ticker ?? r.title ?? '—';
          const stateCol = STATE_COL[r.state] ?? GY;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateCol, fontSize: 8, minWidth: 118,
                  fontWeight: 700, letterSpacing: 0.5 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {(r.category ?? r.sector) && (
                  <span style={{ color: '#4A6080', fontSize: 9 }}>{r.category ?? r.sector}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '4px 0 8px' }}>
                  {r.matchedCommunities.length === 0 && r.matchedOps.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no community or ops event matched this investment
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'rgba(16,185,129,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: EM, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          COMMUNITIES ({r.matchedCommunities.length})
                        </div>
                        {r.matchedCommunities.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedCommunities.map((c, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 130 }}>{c.name ?? c.label ?? `Community ${k + 1}`}</span>
                                {(c.category ?? c.type) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>
                                    {c.category ?? c.type}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(16,185,129,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(c._r * 100)}%`, background: EM }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1, background: 'rgba(249,115,22,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: OR, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          OPS EVENTS ({r.matchedOps.length})
                        </div>
                        {r.matchedOps.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedOps.map((o, idx) => (
                            <div key={idx} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 110 }}>{o.name ?? o.title ?? `Event ${idx + 1}`}</span>
                                {(o.severity ?? o.type) && (
                                  <span style={{ color: OR, fontSize: 8, flexShrink: 0, marginLeft: 4, fontWeight: 700 }}>
                                    {o.severity ?? o.type}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(249,115,22,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(o._r * 100)}%`, background: OR }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#4A6080', textAlign: 'center', padding: '12px 0' }}>no results</div>
        )}
      </div>
    </div>
  );
}
