import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const GASJINV_RE = /\b(gasjinv|annotation\s+swarm\s+invest|graph\s+annotation\s+swarm|annotation\s+job\s+invest|annotation\s+swarm\s+investment|exposed\s+annotation|dark\s+annotation\s+job|annotation\s+financial\s+ops|swarm\s+invest\s+annotation|job\s+invest\s+annotation)\b/i;

export function isGasjinvQuery(t) { return GASJINV_RE.test(t || ''); }

function kwAnn(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name, a?.title,
          a?.description, a?.category, a?.tags, a?.kind, a?.target_id]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwJob(j) {
  return [j?.name, j?.title, j?.type, j?.objective, j?.description,
          j?.kind, j?.category, j?.status, j?.tags]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwInv(i) {
  return [i?.name, i?.description, i?.category, i?.ticker,
          i?.type, i?.sector, i?.tags, i?.region]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildGasjinvScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [annR, jobR, invR] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/Investment`, { headers: hdr }).then(r => r.json()),
  ]);

  const annotations = (annR.status === 'fulfilled'
    ? (annR.value?.annotations ?? annR.value?.data ?? annR.value ?? []) : []).slice(0, 80);
  const jobs = (jobR.status === 'fulfilled'
    ? (jobR.value?.data ?? jobR.value?.jobs ?? jobR.value ?? []) : []).slice(0, 200);
  const investments = (invR.status === 'fulfilled'
    ? (invR.value?.data ?? invR.value?.investments ?? invR.value ?? []) : []).slice(0, 200);

  let exposed = 0, jobLinked = 0, investTied = 0, dark = 0;
  for (const ann of annotations) {
    const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
    const hasJob = jobs.some(j => relevance(words, kwJob(j)) > 0.12);
    const hasInv = investments.some(i => relevance(words, kwInv(i)) > 0.12);
    if (hasJob && hasInv) exposed++;
    else if (hasJob) jobLinked++;
    else if (hasInv) investTied++;
    else dark++;
  }

  return `GASJINV: ${annotations.length} graph annotations × ${jobs.length} swarm jobs × ${investments.length} investments. ` +
    `${exposed} FULLY EXPOSED (job+invest), ${jobLinked} JOB-LINKED, ${investTied} INVEST-TIED, ${dark} DARK. ` +
    (dark > 0
      ? `${dark} annotation nodes have no operational or financial coverage — intelligence gaps.`
      : 'All graph annotations have swarm job or investment coverage.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const GR  = '#22C55E';
const VL  = '#A855F7';
const AM  = '#F59E0B';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY EXPOSED': GR, 'JOB-LINKED': VL, 'INVEST-TIED': AM, DARK: GY };

export default function GraphAnnotationSwarmInvestTriple() {
  const [open, setOpen]           = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [jobs, setJobs]           = useState([]);
  const [investments, setInvests] = useState([]);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:gasjinv-toggle', h);
    return () => window.removeEventListener('jarvis:gasjinv-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [aR, jR, iR] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/Investment`, { headers: hdr }).then(r => r.json()),
      ]);
      const anns = (aR.status === 'fulfilled'
        ? (aR.value?.annotations ?? aR.value?.data ?? aR.value ?? []) : []).slice(0, 80);
      const jbs  = (jR.status === 'fulfilled'
        ? (jR.value?.data ?? jR.value?.jobs ?? jR.value ?? []) : []).slice(0, 200);
      const invs = (iR.status === 'fulfilled'
        ? (iR.value?.data ?? iR.value?.investments ?? iR.value ?? []) : []).slice(0, 200);
      setAnnotations(anns);
      setJobs(jbs);
      setInvests(invs);

      const built = anns.map(ann => {
        const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
        const matchedJobs = jbs
          .map(j => ({ ...j, _r: relevance(words, kwJob(j)) }))
          .filter(j => j._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedInvs = invs
          .map(i => ({ ...i, _r: relevance(words, kwInv(i)) }))
          .filter(i => i._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasJob = matchedJobs.length > 0;
        const hasInv = matchedInvs.length > 0;
        const state = hasJob && hasInv ? 'FULLY EXPOSED'
          : hasJob ? 'JOB-LINKED'
          : hasInv ? 'INVEST-TIED'
          : 'DARK';
        return { ...ann, matchedJobs, matchedInvs, state };
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

  const exposed    = rows.filter(r => r.state === 'FULLY EXPOSED').length;
  const jobLinked  = rows.filter(r => r.state === 'JOB-LINKED').length;
  const investTied = rows.filter(r => r.state === 'INVEST-TIED').length;
  const dark       = rows.filter(r => r.state === 'DARK').length;
  const total      = rows.length || 1;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwAnn(r).includes(s); }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message:
          `Summarise graph annotation swarm-job and investment coverage in 2 sentences: ${exposed} FULLY EXPOSED (job+invest), ${jobLinked} JOB-LINKED, ${investTied} INVEST-TIED, ${dark} DARK out of ${rows.length} graph annotations. Swarm jobs: ${jobs.length}, Investments: ${investments.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 805040, bottom: 8, zIndex: 466, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ GASJINV</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>ANNOTATION × SWARM-JOB × INVESTMENT</span>
        {dark > 0 && (
          <span style={{ marginLeft: 'auto', background: '#F59E0B', color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{dark} DARK</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: dark > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['ANNOTATIONS', annotations.length, CY],
          ['SWARM JOBS',  jobs.length,        VL],
          ['INVESTMENTS', investments.length,  AM],
          ['EXPOSED',     exposed,             GR],
          ['JOB-LINKED',  jobLinked,           VL],
          ['INVEST-TIED', investTied,          AM],
          ['DARK',        dark,                GY],
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
        <div style={{ width: `${(exposed    / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(jobLinked  / total) * 100}%`, background: VL }} />
        <div style={{ width: `${(investTied / total) * 100}%`, background: AM }} />
        <div style={{ width: `${(dark       / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY EXPOSED', 'JOB-LINKED', 'INVEST-TIED', 'DARK'].map(f => (
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
          placeholder="search annotations…"
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
          const label = r.text
            ? (r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text)
            : (r.target_id || r.actor || '—');
          const stateCol = STATE_COL[r.state] ?? GY;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateCol, fontSize: 8, minWidth: 100,
                  fontWeight: 700, letterSpacing: 0.5 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {r.target_type && (
                  <span style={{ color: '#4A6080', fontSize: 9 }}>{r.target_type}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '4px 0 8px' }}>
                  {r.matchedJobs.length === 0 && r.matchedInvs.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no swarm job or investment matched this annotation
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'rgba(168,85,247,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: VL, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          SWARM JOBS ({r.matchedJobs.length})
                        </div>
                        {r.matchedJobs.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedJobs.map((j, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 140 }}>{j.name ?? j.title ?? `Job ${k + 1}`}</span>
                                {(j.kind ?? j.type) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>{j.kind ?? j.type}</span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(168,85,247,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(j._r * 100)}%`, background: VL }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1, background: 'rgba(245,158,11,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: AM, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          INVESTMENTS ({r.matchedInvs.length})
                        </div>
                        {r.matchedInvs.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedInvs.map((inv, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 140 }}>{inv.name ?? inv.ticker ?? `Investment ${k + 1}`}</span>
                                {(inv.category ?? inv.sector) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>{inv.category ?? inv.sector}</span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(245,158,11,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(inv._r * 100)}%`, background: AM }} />
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
