import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const IGCKCO_RE = /\b(igckco|invest\s+graph\s+community|investment\s+community\s+knowledge|invest\s+knowledge\s+community|grounded\s+investment|dark\s+investment\s+community|investment\s+kb\s+community|investment\s+knowledge\s+graph|investment\s+graph\s+community\s+kb|invest\s+community\s+kb|investment\s+graph\s+knowledge|invest\s+community\s+knowledge)\b/i;

export function isIgckcoQuery(t) { return IGCKCO_RE.test(t || ''); }

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

function kwKb(k) {
  return [k?.title, k?.name, k?.content, k?.summary,
          k?.category, k?.tags, k?.keywords, k?.topic]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildIgckcoScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [iR, cR, kR] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);

  const investments = (iR.status === 'fulfilled'
    ? (iR.value?.data ?? iR.value?.investments ?? iR.value ?? []) : []).slice(0, 200);
  const communities = (cR.status === 'fulfilled'
    ? (cR.value?.data ?? cR.value?.communities ?? cR.value ?? []) : []).slice(0, 200);
  const kbArticles  = (kR.status === 'fulfilled'
    ? (kR.value?.data ?? kR.value?.articles ?? kR.value ?? []) : []).slice(0, 200);

  let fullyGrounded = 0, communityBacked = 0, kbOnly = 0, dark = 0;
  for (const inv of investments) {
    const words = kwInvest(inv).split(/\s+/).filter(w => w.length > 3);
    const hasCommunity = communities.some(c => relevance(words, kwCommunity(c)) > 0.12);
    const hasKb        = kbArticles.some(k => relevance(words, kwKb(k)) > 0.12);
    if (hasCommunity && hasKb) fullyGrounded++;
    else if (hasCommunity)     communityBacked++;
    else if (hasKb)            kbOnly++;
    else                       dark++;
  }

  return `IGCKCO: ${investments.length} investments × ${communities.length} communities × ${kbArticles.length} KB articles. ` +
    `${fullyGrounded} FULLY GROUNDED (community+KB), ${communityBacked} COMMUNITY-BACKED, ${kbOnly} KB-ONLY, ${dark} DARK. ` +
    (dark > 0
      ? `${dark} investments have no graph community or knowledge coverage — intelligence grounding gaps.`
      : 'All investments have graph or knowledge coverage.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const GR  = '#22C55E';
const EM  = '#10B981';
const AM  = '#F59E0B';
const IN  = '#6366F1';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY GROUNDED': GR, 'COMMUNITY-BACKED': EM, 'KB-ONLY': IN, DARK: GY };

export default function InvestGraphCommunityKnowledgeTriple() {
  const [open, setOpen]             = useState(false);
  const [investments, setInvestments] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [kbArticles, setKbArticles]   = useState([]);
  const [rows, setRows]             = useState([]);
  const [filter, setFilter]         = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:igckco-toggle', h);
    return () => window.removeEventListener('jarvis:igckco-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [iR, cR, kR] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const invs = (iR.status === 'fulfilled'
        ? (iR.value?.data ?? iR.value?.investments ?? iR.value ?? []) : []).slice(0, 200);
      const cms  = (cR.status === 'fulfilled'
        ? (cR.value?.data ?? cR.value?.communities ?? cR.value ?? []) : []).slice(0, 200);
      const kbs  = (kR.status === 'fulfilled'
        ? (kR.value?.data ?? kR.value?.articles ?? kR.value ?? []) : []).slice(0, 200);
      setInvestments(invs);
      setCommunities(cms);
      setKbArticles(kbs);

      const built = invs.map(inv => {
        const words = kwInvest(inv).split(/\s+/).filter(w => w.length > 3);
        const matchedCommunities = cms
          .map(c => ({ ...c, _r: relevance(words, kwCommunity(c)) }))
          .filter(c => c._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedKb = kbs
          .map(k => ({ ...k, _r: relevance(words, kwKb(k)) }))
          .filter(k => k._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasCommunity = matchedCommunities.length > 0;
        const hasKb        = matchedKb.length > 0;
        const state = hasCommunity && hasKb ? 'FULLY GROUNDED'
          : hasCommunity                    ? 'COMMUNITY-BACKED'
          : hasKb                           ? 'KB-ONLY'
          : 'DARK';
        return { ...inv, matchedCommunities, matchedKb, state };
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

  const fullyGrounded   = rows.filter(r => r.state === 'FULLY GROUNDED').length;
  const communityBacked = rows.filter(r => r.state === 'COMMUNITY-BACKED').length;
  const kbOnly          = rows.filter(r => r.state === 'KB-ONLY').length;
  const dark            = rows.filter(r => r.state === 'DARK').length;
  const total           = rows.length || 1;

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
          `Summarise investment graph-community and knowledge coverage in 2 sentences: ` +
          `${fullyGrounded} FULLY GROUNDED (community+KB), ${communityBacked} COMMUNITY-BACKED, ` +
          `${kbOnly} KB-ONLY, ${dark} DARK out of ${rows.length} investments. ` +
          `Communities: ${communities.length}, KB articles: ${kbArticles.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 806720, bottom: 8, zIndex: 469, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ IGCKCO</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>INVESTMENT × COMMUNITY × KNOWLEDGE</span>
        {fullyGrounded > 0 && (
          <span style={{ marginLeft: 'auto', background: GR, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{fullyGrounded} GROUNDED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: fullyGrounded > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['INVEST',    investments.length, CY],
          ['COMMS',     communities.length, EM],
          ['KB',        kbArticles.length,  IN],
          ['GROUNDED',  fullyGrounded,      GR],
          ['COMM-BKND', communityBacked,    EM],
          ['KB-ONLY',   kbOnly,             IN],
          ['DARK',      dark,               GY],
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
        <div style={{ width: `${(fullyGrounded   / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(communityBacked / total) * 100}%`, background: EM }} />
        <div style={{ width: `${(kbOnly          / total) * 100}%`, background: IN }} />
        <div style={{ width: `${(dark            / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY GROUNDED', 'COMMUNITY-BACKED', 'KB-ONLY', 'DARK'].map(f => (
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
                <span style={{ color: stateCol, fontSize: 8, minWidth: 130,
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
                  {r.matchedCommunities.length === 0 && r.matchedKb.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no community or knowledge article matched this investment
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
                      <div style={{ flex: 1, background: 'rgba(99,102,241,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: IN, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          KB ARTICLES ({r.matchedKb.length})
                        </div>
                        {r.matchedKb.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedKb.map((k, idx) => (
                            <div key={idx} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 130 }}>{k.title ?? k.name ?? `Article ${idx + 1}`}</span>
                                {(k.category ?? k.topic) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>
                                    {k.category ?? k.topic}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(99,102,241,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(k._r * 100)}%`, background: IN }} />
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
