import { useState, useEffect, useCallback } from 'react';

const API = '';

const INVDS_RE = /\b(investment[._-]?dataset|dataset[._-]?investment|invds|blind[._-]?investment|investment[._-]?data[._-]?gap|data[._-]?backed[._-]?investment|covered[._-]?investment|portfolio[._-]?dataset|investment[._-]?data[._-]?coverage|dataset[._-]?portfolio|which[._-]?investments?[._-]?have[._-]?datasets?|investments?[._-]?without[._-]?data|data[._-]?gap[._-]?investment)\b/i;

export function isInvdsQuery(t) {
  return INVDS_RE.test(t || '');
}

export async function buildInvdsScript() {
  const [invR, dsR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
  ]);
  const investments = normaliseArray(invR.status === 'fulfilled' ? invR.value : [], 'investments');
  const datasets = normaliseArray(dsR.status === 'fulfilled' ? dsR.value : [], 'datasets');
  const enriched = correlate(investments, datasets);
  const blind = enriched.filter(i => !i._covered).length;
  const covered = enriched.length - blind;
  const topBlind = enriched
    .filter(i => !i._covered)
    .slice(0, 3)
    .map(i => i._label)
    .join(', ') || 'none';
  return (
    `Investment × Dataset Coverage: ${enriched.length} investments, ${datasets.length} datasets indexed. ` +
    `${covered} investment${covered !== 1 ? 's' : ''} have at least one dataset backing their domain (COVERED); ` +
    `${blind} investment${blind !== 1 ? 's' : ''} have no dataset coverage (BLIND — data gap). ` +
    `Blind investments: ${topBlind}.`
  );
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [hint, 'investments', 'datasets', 'items', 'results', 'data', 'records'].filter(Boolean);
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
}

function investmentTokens(inv) {
  return new Set([
    ...tokens(inv.name), ...tokens(inv.title), ...tokens(inv.sector),
    ...tokens(inv.industry), ...tokens(inv.notes), ...tokens(inv.description),
    ...tokens(inv.ticker), ...tokens(inv.symbol),
    ...(Array.isArray(inv.tags) ? inv.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean));
}

function datasetTokens(ds) {
  return [
    ...tokens(ds.name), ...tokens(ds.title), ...tokens(ds.description),
    ...tokens(ds.kind), ...tokens(ds.type), ...tokens(ds.category),
    ...tokens(ds.domain), ...tokens(ds.source),
    ...(Array.isArray(ds.tags) ? ds.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean);
}

function matchScore(inv, ds) {
  const iToks = investmentTokens(inv);
  const dToks = datasetTokens(ds);
  if (!iToks.size || !dToks.length) return 0;
  let hits = 0;
  for (const t of dToks) if (iToks.has(t)) hits++;
  return hits / Math.max(iToks.size, dToks.length);
}

function correlate(investments, datasets) {
  return investments.map(inv => {
    const label = inv.name || inv.title || inv.ticker || `Investment`;
    const scored = datasets
      .map(ds => ({ ds, score: matchScore(inv, ds) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...inv, _label: label, _matches: scored, _covered: scored.length > 0 };
  });
}

function kindColor(kind) {
  const k = String(kind || '').toLowerCase();
  if (k.includes('market') || k.includes('financial') || k.includes('price')) return '#22c55e';
  if (k.includes('risk') || k.includes('threat')) return '#ef4444';
  if (k.includes('geo') || k.includes('spatial')) return '#60a5fa';
  if (k.includes('time') || k.includes('series')) return '#a78bfa';
  if (k.includes('event') || k.includes('ops')) return '#f97316';
  return '#64748b';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function InvestmentDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [datasets, setDatasets] = useState([]);
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
      const [invR, dsR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
      ]);
      const rawInv = normaliseArray(invR.status === 'fulfilled' ? invR.value : [], 'investments');
      const rawDs = normaliseArray(dsR.status === 'fulfilled' ? dsR.value : [], 'datasets');
      setInvestments(rawInv);
      setDatasets(rawDs);
      setEnriched(correlate(rawInv, rawDs));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:invds-toggle', h);
    return () => window.removeEventListener('jarvis:invds-toggle', h);
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
    const blind = enriched.filter(i => !i._covered).length;
    const covered = enriched.filter(i => i._covered).length;
    const topBlind = enriched
      .filter(i => !i._covered)
      .map(i => i._label)
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Investment × Dataset Coverage: ${investments.length} investments, ${datasets.length} datasets. ` +
      `${covered} investments are COVERED by at least one dataset; ` +
      `${blind} investments are BLIND (no dataset coverage — data gap). ` +
      `Blind investments: ${topBlind}. ` +
      `Give a 2-sentence portfolio-data coverage brief.`;
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

  const blindCount = enriched.filter(i => !i._covered).length;
  const badge = blindCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(inv => {
    const label = inv._label.toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'COVERED') return inv._covered;
    if (tab === 'BLIND') return !inv._covered;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Dataset Coverage"
        style={{
          position: 'fixed',
          left: 699760,
          bottom: 8,
          zIndex: 278,
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
          boxShadow: blindCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        INVDS
        {blindCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {blindCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 620,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9690,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ INVESTMENT × DATASET COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'INVESTMENTS', val: investments.length, color: '#60a5fa' },
              { label: 'DATASETS', val: datasets.length, color: '#a78bfa' },
              { label: 'COVERED', val: enriched.filter(i => i._covered).length, color: '#22c55e' },
              { label: 'BLIND', val: blindCount, color: blindCount > 0 ? '#f59e0b' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'COVERED', 'BLIND'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f59e0b' : '#94a3b8',
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
              placeholder="Search investments…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No investments match the current filter.</div>
          )}

          <div>
            {visible.map((inv, i) => {
              const id = inv.id || inv._id || i;
              const label = inv._label;
              const sector = inv.sector || inv.industry || '';
              const ticker = inv.ticker || inv.symbol || '';
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
                      background: inv._covered ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: inv._covered ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${inv._covered ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {inv._covered ? 'COVERED' : 'BLIND'}
                    </span>
                    {ticker && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.25)', fontSize: 10 }}>
                        {ticker}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {sector && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{sector}</span>
                    )}
                    {inv._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{inv._matches.length} dataset{inv._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {inv.notes && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(inv.notes).slice(0, 200)}</div>
                      )}
                      {inv._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched datasets:</div>
                          {inv._matches.map(({ ds, score }, j) => {
                            const dsLabel = ds.name || ds.title || `Dataset ${j + 1}`;
                            const dsKind = ds.kind || ds.type || ds.category || '';
                            const dsRows = ds.row_count || ds.rows || ds.count || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#c4b5fd', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dsLabel}</span>
                                  {dsKind && (
                                    <span style={{ ...PILL, background: `${kindColor(dsKind)}22`, color: kindColor(dsKind), border: `1px solid ${kindColor(dsKind)}44` }}>
                                      {String(dsKind).toUpperCase()}
                                    </span>
                                  )}
                                  {dsRows !== '' && (
                                    <span style={{ color: '#64748b', fontSize: 10 }}>{Number(dsRows).toLocaleString()} rows</span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No dataset covers this investment — data gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} investments · {datasets.length} datasets indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
