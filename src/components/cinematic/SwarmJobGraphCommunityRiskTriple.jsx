import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const SJGCRISK_RE = /\b(sjgcrisk|swarm\s+job\s+graph\s+community\s+risk|swarm\s+community\s+risk|swarm\s+graph\s+risk|swarm\s+job\s+risk\s+community|swarm\s+risk\s+community|community\s+risk\s+swarm|risk\s+swarm\s+community|alarmed\s+swarm\s+job|unmonitored\s+swarm|swarm\s+job\s+risk\s+signal|swarm\s+community\s+risk\s+signal|swarm\s+risk\s+signal\s+community)\b/i;

export function isSjgcriskQuery(t) { return SJGCRISK_RE.test(t || ''); }

function kwSwarm(j) {
  return [j?.name, j?.title, j?.type, j?.objective, j?.description,
          j?.kind, j?.tags, j?.status, j?.domain]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwCommunity(c) {
  return [c?.name, c?.label, c?.description, c?.category,
          c?.type, c?.tags, c?.domain, c?.keywords]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwRisk(r) {
  return [r?.name, r?.title, r?.description, r?.category,
          r?.type, r?.tags, r?.sector, r?.source, r?.region]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildSjgcriskScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [jR, cR, rR] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`,        { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`,     { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`,      { headers: hdr }).then(r => r.json()),
  ]);

  const jobs       = (jR.status === 'fulfilled'
    ? (jR.value?.data ?? jR.value?.jobs ?? jR.value ?? []) : []).slice(0, 200);
  const communities = (cR.status === 'fulfilled'
    ? (cR.value?.data ?? cR.value?.communities ?? cR.value ?? []) : []).slice(0, 200);
  const risks      = (rR.status === 'fulfilled'
    ? (rR.value?.data ?? rR.value?.signals ?? rR.value ?? []) : []).slice(0, 200);

  let fullyAlarmed = 0, communityMapped = 0, riskFlagged = 0, unmonitored = 0;
  for (const job of jobs) {
    const words = kwSwarm(job).split(/\s+/).filter(w => w.length > 3);
    const hasCommunity = communities.some(c => relevance(words, kwCommunity(c)) > 0.12);
    const hasRisk      = risks.some(r => relevance(words, kwRisk(r)) > 0.12);
    if (hasCommunity && hasRisk) fullyAlarmed++;
    else if (hasCommunity)      communityMapped++;
    else if (hasRisk)           riskFlagged++;
    else                        unmonitored++;
  }

  return `SJGCRISK: ${jobs.length} swarm jobs × ${communities.length} communities × ${risks.length} risk signals. ` +
    `${fullyAlarmed} FULLY ALARMED (community+risk), ${communityMapped} COMMUNITY-MAPPED, ` +
    `${riskFlagged} RISK-FLAGGED, ${unmonitored} UNMONITORED. ` +
    (fullyAlarmed > 0
      ? `${fullyAlarmed} swarm jobs have both graph community context and active risk signal alignment — threat exposure confirmed.`
      : 'No swarm jobs show combined community and risk signal alignment.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const RD  = '#EF4444';
const EM  = '#10B981';
const AM  = '#F59E0B';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY ALARMED': RD, 'COMMUNITY-MAPPED': EM, 'RISK-FLAGGED': AM, UNMONITORED: GY };

export default function SwarmJobGraphCommunityRiskTriple() {
  const [open, setOpen]             = useState(false);
  const [jobs, setJobs]             = useState([]);
  const [communities, setCommunities] = useState([]);
  const [risks, setRisks]           = useState([]);
  const [rows, setRows]             = useState([]);
  const [filter, setFilter]         = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjgcrisk-toggle', h);
    return () => window.removeEventListener('jarvis:sjgcrisk-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [jR, cR, rR] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`,    { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }).then(r => r.json()),
      ]);
      const js = (jR.status === 'fulfilled'
        ? (jR.value?.data ?? jR.value?.jobs ?? jR.value ?? []) : []).slice(0, 200);
      const cs = (cR.status === 'fulfilled'
        ? (cR.value?.data ?? cR.value?.communities ?? cR.value ?? []) : []).slice(0, 200);
      const rs = (rR.status === 'fulfilled'
        ? (rR.value?.data ?? rR.value?.signals ?? rR.value ?? []) : []).slice(0, 200);
      setJobs(js);
      setCommunities(cs);
      setRisks(rs);

      const built = js.map(job => {
        const words = kwSwarm(job).split(/\s+/).filter(w => w.length > 3);
        const matchedCommunities = cs
          .map(c => ({ ...c, _r: relevance(words, kwCommunity(c)) }))
          .filter(c => c._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedRisks = rs
          .map(r => ({ ...r, _r: relevance(words, kwRisk(r)) }))
          .filter(r => r._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasCommunity = matchedCommunities.length > 0;
        const hasRisk      = matchedRisks.length > 0;
        const state = hasCommunity && hasRisk ? 'FULLY ALARMED'
          : hasCommunity                      ? 'COMMUNITY-MAPPED'
          : hasRisk                           ? 'RISK-FLAGGED'
          : 'UNMONITORED';
        return { ...job, matchedCommunities, matchedRisks, state };
      });
      setRows(built);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyAlarmed   = rows.filter(r => r.state === 'FULLY ALARMED').length;
  const communityMapped = rows.filter(r => r.state === 'COMMUNITY-MAPPED').length;
  const riskFlagged    = rows.filter(r => r.state === 'RISK-FLAGGED').length;
  const unmonitored    = rows.filter(r => r.state === 'UNMONITORED').length;
  const total          = rows.length || 1;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwSwarm(r).includes(s); }
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
          `Summarise swarm job graph-community and risk-signal exposure in 2 sentences: ` +
          `${fullyAlarmed} FULLY ALARMED (community+risk), ${communityMapped} COMMUNITY-MAPPED, ` +
          `${riskFlagged} RISK-FLAGGED, ${unmonitored} UNMONITORED out of ${rows.length} swarm jobs. ` +
          `Communities: ${communities.length}, risk signals: ${risks.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 807840, bottom: 8, zIndex: 471, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ SJGCRISK</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>SWARM JOB × COMMUNITY × RISK SIGNAL</span>
        {fullyAlarmed > 0 && (
          <span style={{ marginLeft: 'auto', background: RD, color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{fullyAlarmed} ALARMED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: fullyAlarmed > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['SWARM',       jobs.length,        CY],
          ['COMMS',       communities.length, EM],
          ['RISKS',       risks.length,       AM],
          ['ALARMED',     fullyAlarmed,       RD],
          ['COMM-MAP',    communityMapped,    EM],
          ['RISK-FLG',    riskFlagged,        AM],
          ['UNMONITORED', unmonitored,        GY],
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
        <div style={{ width: `${(fullyAlarmed    / total) * 100}%`, background: RD }} />
        <div style={{ width: `${(communityMapped / total) * 100}%`, background: EM }} />
        <div style={{ width: `${(riskFlagged     / total) * 100}%`, background: AM }} />
        <div style={{ width: `${(unmonitored     / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY ALARMED', 'COMMUNITY-MAPPED', 'RISK-FLAGGED', 'UNMONITORED'].map(f => (
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
          placeholder="search swarm jobs…"
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
          const label = r.name ?? r.title ?? r.type ?? '—';
          const stateCol = STATE_COL[r.state] ?? GY;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateCol, fontSize: 8, minWidth: 128,
                  fontWeight: 700, letterSpacing: 0.5 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {(r.kind ?? r.type) && (
                  <span style={{ color: '#4A6080', fontSize: 9 }}>{r.kind ?? r.type}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '4px 0 8px' }}>
                  {r.matchedCommunities.length === 0 && r.matchedRisks.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no community or risk signal matched this swarm job
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
                      <div style={{ flex: 1, background: 'rgba(239,68,68,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: RD, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          RISK SIGNALS ({r.matchedRisks.length})
                        </div>
                        {r.matchedRisks.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedRisks.map((rk, idx) => (
                            <div key={idx} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 110 }}>{rk.name ?? rk.title ?? `Risk ${idx + 1}`}</span>
                                {(rk.severity ?? rk.type) && (
                                  <span style={{ color: RD, fontSize: 8, flexShrink: 0, marginLeft: 4, fontWeight: 700 }}>
                                    {rk.severity ?? rk.type}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(239,68,68,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(rk._r * 100)}%`, background: RD }} />
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
