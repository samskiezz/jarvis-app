import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const DGCOE_RE = /\b(dgcoe|dataset[\s_-]*graph[\s_-]*community[\s_-]*ops|dataset[\s_-]*community[\s_-]*ops|dataset[\s_-]*ops[\s_-]*community|community[\s_-]*ops[\s_-]*dataset|dataset[\s_-]*ops[\s_-]*event[\s_-]*community|dataset[\s_-]*community[\s_-]*event|ops[\s_-]*community[\s_-]*dataset|dataset[\s_-]*graph[\s_-]*ops|dataset[\s_-]*network[\s_-]*ops|community[\s_-]*dataset[\s_-]*ops)\b/i;

export function isDgcoeQuery(t) { return DGCOE_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter(t => bSet.has(t)).length;
  return hits / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.08;

const COV = {
  FULLY_WIRED: 'FULLY_WIRED',
  COMMUNITY_MAPPED: 'COMMUNITY_MAPPED',
  OPS_TRIGGERED: 'OPS_TRIGGERED',
  DARK: 'DARK',
};

function classifyDataset(dsTokens, communities, opsEvents) {
  let bestComm = null, bestCommScore = 0;
  let bestOps = null, bestOpsScore = 0;
  for (const c of communities) {
    const ct = tok([c?.name, c?.label, c?.description, c?.category, c?.type, (c?.tags || []).join(' ')].join(' '));
    const s = matchScore(dsTokens, ct);
    if (s > bestCommScore) { bestCommScore = s; bestComm = c; }
  }
  for (const o of opsEvents) {
    const ot = tok([o?.name, o?.title, o?.description, o?.type, o?.eventType, o?.category, (o?.tags || []).join(' ')].join(' '));
    const s = matchScore(dsTokens, ot);
    if (s > bestOpsScore) { bestOpsScore = s; bestOps = o; }
  }
  const hasComm = bestCommScore >= THRESHOLD;
  const hasOps = bestOpsScore >= THRESHOLD;
  let cov;
  if (hasComm && hasOps) cov = COV.FULLY_WIRED;
  else if (hasComm) cov = COV.COMMUNITY_MAPPED;
  else if (hasOps) cov = COV.OPS_TRIGGERED;
  else cov = COV.DARK;
  return { cov, bestComm, bestCommScore, bestOps, bestOpsScore };
}

export async function buildDgcoeScript() {
  try {
    const [dsRes, commRes, opsRes] = await Promise.all([
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const datasets = Array.isArray(dsRes) ? dsRes : (dsRes?.items ?? dsRes?.data ?? []);
    const communities = Array.isArray(commRes) ? commRes : (commRes?.items ?? commRes?.data ?? commRes?.communities ?? []);
    const opsEvents = Array.isArray(opsRes) ? opsRes : (opsRes?.items ?? opsRes?.data ?? opsRes?.events ?? []);
    const counts = { [COV.FULLY_WIRED]: 0, [COV.COMMUNITY_MAPPED]: 0, [COV.OPS_TRIGGERED]: 0, [COV.DARK]: 0 };
    for (const ds of datasets) {
      const dst = tok([ds?.name, ds?.description, ds?.kind, ds?.source, (ds?.tags || []).join(' ')].join(' '));
      const { cov } = classifyDataset(dst, communities, opsEvents);
      counts[cov]++;
    }
    const total = datasets.length;
    return `DGCOE: ${total} datasets — ${counts[COV.FULLY_WIRED]} fully wired (community+ops), ${counts[COV.COMMUNITY_MAPPED]} community-mapped, ${counts[COV.OPS_TRIGGERED]} ops-triggered, ${counts[COV.DARK]} dark. ${communities.length} graph communities, ${opsEvents.length} ops events indexed. ${counts[COV.DARK] > 0 ? `${counts[COV.DARK]} datasets have no community or ops coverage — intelligence and operational blind spots.` : 'All datasets have at least one coverage dimension.'}`;
  } catch {
    return 'DGCOE: unable to fetch dataset, graph community, or ops event data — check endpoints.';
  }
}

export default function DatasetGraphCommunityOpsTriple() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dsRes, commRes, opsRes] = await Promise.all([
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      setDatasets(Array.isArray(dsRes) ? dsRes : (dsRes?.items ?? dsRes?.data ?? []));
      setCommunities(Array.isArray(commRes) ? commRes : (commRes?.items ?? commRes?.data ?? commRes?.communities ?? []));
      setOpsEvents(Array.isArray(opsRes) ? opsRes : (opsRes?.items ?? opsRes?.data ?? opsRes?.events ?? []));
    } catch { /* silently ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:dgcoe-toggle', handler);
    return () => window.removeEventListener('jarvis:dgcoe-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) return null;

  const classified = datasets.map(ds => {
    const label = ds?.name ?? ds?.title ?? '(unnamed)';
    const kind = ds?.kind ?? ds?.type ?? '';
    const dst = tok([ds?.name, ds?.description, ds?.kind, ds?.source, (ds?.tags || []).join(' ')].join(' '));
    const result = classifyDataset(dst, communities, opsEvents);
    return { label, kind, ...result };
  });

  const counts = { [COV.FULLY_WIRED]: 0, [COV.COMMUNITY_MAPPED]: 0, [COV.OPS_TRIGGERED]: 0, [COV.DARK]: 0 };
  classified.forEach(r => counts[r.cov]++);

  const covColor = {
    [COV.FULLY_WIRED]: '#22c55e',
    [COV.COMMUNITY_MAPPED]: '#34d399',
    [COV.OPS_TRIGGERED]: '#fb923c',
    [COV.DARK]: '#475569',
  };
  const covLabel = {
    [COV.FULLY_WIRED]: 'FULLY WIRED',
    [COV.COMMUNITY_MAPPED]: 'COMMUNITY MAPPED',
    [COV.OPS_TRIGGERED]: 'OPS TRIGGERED',
    [COV.DARK]: 'DARK',
  };

  const total = classified.length;
  const wiredPct = total ? Math.round((counts[COV.FULLY_WIRED] / total) * 100) : 0;

  const searchLower = search.toLowerCase();
  const visible = classified.filter(r => {
    if (filter !== 'ALL' && r.cov !== filter) return false;
    if (searchLower && !r.label.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText('');
    try {
      const prompt = `DGCOE dataset community-ops coverage: ${total} datasets — ${counts[COV.FULLY_WIRED]} fully wired (community+ops), ${counts[COV.COMMUNITY_MAPPED]} community-mapped only, ${counts[COV.OPS_TRIGGERED]} ops-triggered only, ${counts[COV.DARK]} dark. ${communities.length} graph communities, ${opsEvents.length} ops events indexed. Provide a 2-sentence assessment of dataset network and operational coverage, and one actionable recommendation.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j.response || j.message || j.content || '';
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
      }
    } catch { /* silently ignore */ }
    setAssessing(false);
  }

  const GR = '#22c55e';

  return (
    <div style={{
      position: 'fixed', left: 874480, bottom: 8, zIndex: 570, width: 360,
      background: 'rgba(8,12,20,0.97)', border: `1px solid ${GR}44`,
      borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: 12,
      color: '#e2e8f0', boxShadow: `0 0 28px ${GR}11`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: GR, fontWeight: 700, fontSize: 13 }}>◈ DGCOE — Dataset × Graph Community × Ops Event</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {Object.values(COV).map(cov => (
          <div key={cov} style={{ background: covColor[cov] + '11', border: `1px solid ${covColor[cov]}44`, borderRadius: 6, padding: '6px 8px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setFilter(f => f === cov ? 'ALL' : cov)}>
            <div style={{ fontSize: 22, fontWeight: 700, color: covColor[cov] }}>{counts[cov]}</div>
            <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 1 }}>{covLabel[cov]}</div>
          </div>
        ))}
      </div>

      {/* Source tiles */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        {[['Datasets', total, GR], ['Communities', communities.length, '#34d399'], ['Ops Events', opsEvents.length, '#fb923c']].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: col + '11', border: `1px solid ${col}33`, borderRadius: 5, padding: '4px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
          {Object.values(COV).map(cov => (
            <div key={cov} style={{ flex: counts[cov] || 0.01, background: covColor[cov], transition: 'flex 0.4s' }} />
          ))}
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, color: '#64748b', marginTop: 2 }}>{wiredPct}% fully wired</div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', ...Object.values(COV)].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer', fontWeight: filter === f ? 700 : 400,
            background: filter === f ? (f === 'ALL' ? GR + '22' : covColor[f] + '22') : 'transparent',
            border: `1px solid ${filter === f ? (f === 'ALL' ? GR : covColor[f]) : '#1e293b'}`,
            color: filter === f ? (f === 'ALL' ? GR : covColor[f]) : '#64748b',
          }}>{f === 'ALL' ? 'ALL' : covLabel[f].split(' ')[0]}</button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)} placeholder="Search datasets…"
        style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, padding: '4px 8px', color: '#94a3b8', fontSize: 11, marginBottom: 8 }}
      />

      {/* Rows */}
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.slice(0, 30).map((row, i) => (
          <div key={i}>
            <div
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: '#0f172a', border: `1px solid ${covColor[row.cov]}22` }}
            >
              <span style={{ color: '#cbd5e1', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{row.label}</span>
              <span style={{ fontSize: 8, color: covColor[row.cov], fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>{covLabel[row.cov].split(' ')[0]}</span>
            </div>
            {expanded === i && (
              <div style={{ padding: '6px 8px', background: '#080c14', borderRadius: 4, marginTop: 2, fontSize: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ color: '#34d399', fontWeight: 700, marginBottom: 4 }}>COMMUNITY</div>
                    {row.bestComm ? (
                      <>
                        <div style={{ color: '#cbd5e1' }}>{row.bestComm?.name ?? row.bestComm?.label ?? '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{row.bestComm?.type ?? row.bestComm?.category ?? ''}</div>
                        <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                          <div style={{ width: `${Math.round(row.bestCommScore * 100)}%`, background: '#34d399', height: '100%', borderRadius: 2 }} />
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 8 }}>{Math.round(row.bestCommScore * 100)}%</div>
                      </>
                    ) : <div style={{ color: '#475569' }}>No match</div>}
                  </div>
                  <div>
                    <div style={{ color: '#fb923c', fontWeight: 700, marginBottom: 4 }}>OPS EVENT</div>
                    {row.bestOps ? (
                      <>
                        <div style={{ color: '#cbd5e1' }}>{row.bestOps?.name ?? row.bestOps?.title ?? row.bestOps?.description ?? '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{row.bestOps?.type ?? row.bestOps?.eventType ?? row.bestOps?.severity ?? ''}</div>
                        <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                          <div style={{ width: `${Math.round(row.bestOpsScore * 100)}%`, background: '#fb923c', height: '100%', borderRadius: 2 }} />
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 8 }}>{Math.round(row.bestOpsScore * 100)}%</div>
                      </>
                    ) : <div style={{ color: '#475569' }}>No match</div>}
                  </div>
                </div>
                {row.kind && (
                  <div style={{ marginTop: 5, fontSize: 9, color: '#64748b' }}>
                    <span style={{ background: '#1e293b', padding: '1px 5px', borderRadius: 3 }}>{row.kind}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: 8 }}>No datasets match</div>}
        {visible.length > 30 && <div style={{ fontSize: 9, color: '#334155', textAlign: 'center' }}>…+{visible.length - 30} more</div>}
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 8 }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : GR + '11', border: `1px solid ${GR}`, borderRadius: 4, color: GR, cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — DGCOE coverage brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s`}
      </div>
    </div>
  );
}
