import { useState, useEffect, useCallback } from 'react';

const API = '';
const ADNA_RE = /\b(asset[._-]?dna|repo[._-]?assets?|asset[._-]?health|stale[._-]?assets?|high[._-]?risk[._-]?assets?|adna|asset[._-]?scanner|asset[._-]?registry|which[._-]?assets?[._-]?are[._-]?stale|asset[._-]?quality|file[._-]?health|repo[._-]?health[._-]?scan)\b/i;

export function isAdnaQuery(t) {
  return ADNA_RE.test(t || '');
}

export async function buildAdnaScript() {
  const r = await fetch(`${API}/v1/asset/list?limit=200`).then(r => r.json()).catch(() => ({}));
  const items = normaliseArray(r);
  const ok = items.filter(a => a.health === 'ok').length;
  const warn = items.filter(a => a.health === 'warn').length;
  const stale = items.filter(a => a.health === 'stale').length;
  const high = items.filter(a => a.risk === 'high').length;
  const topStale = items.filter(a => a.health === 'stale').slice(0, 4).map(a => a.name || a.id || '?').join(', ') || 'none';
  return `Asset DNA Scanner: ${items.length} repo assets indexed — ${ok} healthy, ${warn} warn, ${stale} stale, ${high} high-risk. ` +
    `Top stale: ${topStale}. Review high-risk assets for dependency exposure or missing inventory coverage.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'assets', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function healthColor(h) {
  if (h === 'ok') return '#22c55e';
  if (h === 'warn') return '#f59e0b';
  if (h === 'stale') return '#ef4444';
  return '#64748b';
}

function riskColor(r) {
  if (r === 'high') return '#ef4444';
  if (r === 'medium') return '#f59e0b';
  return '#22c55e';
}

function kindColor(k) {
  const m = { py: '#3b82f6', jsx: '#06b6d4', tsx: '#06b6d4', ts: '#3b82f6', js: '#f59e0b', md: '#a78bfa', json: '#34d399', sh: '#f97316', css: '#ec4899' };
  return m[k] || '#64748b';
}

function fmtSize(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function AssetDnaScanner() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch(`${API}/v1/asset/list?limit=200`).then(r => r.json());
      setItems(normaliseArray(r));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:adna-toggle', h);
    return () => window.removeEventListener('jarvis:adna-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [open, load]);

  const loadDetail = useCallback(async (assetId) => {
    if (detail[assetId] !== undefined) return;
    setLoadingDetail(assetId);
    try {
      const r = await fetch(`${API}/v1/asset/${encodeURIComponent(assetId)}`).then(r => r.json());
      setDetail(prev => ({ ...prev, [assetId]: r }));
    } catch {
      setDetail(prev => ({ ...prev, [assetId]: null }));
    } finally {
      setLoadingDetail(null);
    }
  }, [detail]);

  const toggleExpand = useCallback((assetId) => {
    if (expanded === assetId) {
      setExpanded(null);
    } else {
      setExpanded(assetId);
      loadDetail(assetId);
    }
  }, [expanded, loadDetail]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const ok = items.filter(a => a.health === 'ok').length;
    const stale = items.filter(a => a.health === 'stale').length;
    const high = items.filter(a => a.risk === 'high').length;
    const topStale = items.filter(a => a.health === 'stale').slice(0, 5).map(a => a.name || a.id || '?').join(', ') || 'none';
    const prompt =
      `Asset DNA Scanner: ${items.length} repo assets — ${ok} healthy, ${stale} stale, ${high} high-risk. ` +
      `Top stale: ${topStale}. Give a 2-sentence asset health brief.`;
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

  const okCount = items.filter(a => a.health === 'ok').length;
  const warnCount = items.filter(a => a.health === 'warn').length;
  const staleCount = items.filter(a => a.health === 'stale').length;
  const badgeColor = staleCount > 0 ? '#ef4444' : warnCount > 0 ? '#f59e0b' : '#22c55e';
  const badgeVal = staleCount > 0 ? staleCount : okCount;

  const visible = items.filter(asset => {
    const name = (asset.name || asset.id || '').toLowerCase();
    const kind = (asset.kind || '').toLowerCase();
    if (search && !name.includes(search.toLowerCase()) && !kind.includes(search.toLowerCase())) return false;
    if (tab === 'OK') return asset.health === 'ok';
    if (tab === 'WARN') return asset.health === 'warn';
    if (tab === 'STALE') return asset.health === 'stale';
    if (tab === 'HIGH-RISK') return asset.risk === 'high';
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Asset DNA Scanner"
        style={{
          position: 'fixed',
          left: 452160,
          bottom: 8,
          zIndex: 192,
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
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: staleCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        ADNA
        <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
          {badgeVal}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9602,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#34d399' }}>◈ ASSET DNA SCANNER</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={load} style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 6, color: '#34d399', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>↺</button>
              <button
                onClick={assess}
                disabled={assessing || items.length === 0}
                style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: 6, color: '#34d399', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'TOTAL', val: items.length, color: '#94a3b8' },
              { label: 'HEALTHY', val: okCount, color: '#22c55e' },
              { label: 'WARN', val: warnCount, color: '#f59e0b' },
              { label: 'STALE', val: staleCount, color: staleCount > 0 ? '#ef4444' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment block */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, fontSize: 12, color: '#6ee7b7', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'OK', 'WARN', 'STALE', 'HIGH-RISK'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#34d399' : '#94a3b8',
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
              placeholder="Search assets…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {/* Status / error */}
          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Scanning assets…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No assets match the current filter.</div>
          )}

          {/* Asset rows */}
          <div>
            {visible.map((asset, i) => {
              const assetId = asset.id || asset.asset_id || `${asset.kind}:${asset.name}` || String(i);
              const name = asset.name || assetId;
              const kind = asset.kind || '';
              const health = asset.health || 'ok';
              const risk = asset.risk || 'low';
              const ageDays = asset.age_days != null ? asset.age_days : null;
              const size = asset.size != null ? asset.size : null;
              const isExp = expanded === assetId;
              const det = detail[assetId];

              return (
                <div
                  key={assetId}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => toggleExpand(assetId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    {kind && (
                      <span style={{ ...PILL, background: `${kindColor(kind)}22`, color: kindColor(kind), border: `1px solid ${kindColor(kind)}44` }}>
                        {kind}
                      </span>
                    )}
                    <span style={{ ...PILL, background: `${healthColor(health)}18`, color: healthColor(health), border: `1px solid ${healthColor(health)}44` }}>
                      {health.toUpperCase()}
                    </span>
                    {risk !== 'low' && (
                      <span style={{ ...PILL, background: `${riskColor(risk)}18`, color: riskColor(risk), border: `1px solid ${riskColor(risk)}44` }}>
                        {risk.toUpperCase()} RISK
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
                    {size != null && <span style={{ color: '#64748b', fontSize: 10 }}>{fmtSize(size)}</span>}
                    {ageDays != null && <span style={{ color: '#64748b', fontSize: 10 }}>{ageDays}d</span>}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {loadingDetail === assetId && (
                        <div style={{ color: '#64748b', fontSize: 11 }}>Loading detail…</div>
                      )}
                      {det === null && loadingDetail !== assetId && (
                        <div style={{ color: '#ef4444', fontSize: 11 }}>Detail unavailable.</div>
                      )}
                      {det && (
                        <>
                          {det.asset?.deps?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Dependencies ({det.asset.deps.length}):</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {det.asset.deps.slice(0, 12).map((d, j) => (
                                  <span key={j} style={{ ...PILL, background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)', margin: 0 }}>{d}</span>
                                ))}
                                {det.asset.deps.length > 12 && <span style={{ color: '#64748b', fontSize: 10 }}>+{det.asset.deps.length - 12} more</span>}
                              </div>
                            </div>
                          )}
                          {det.asset?.dependents?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Dependents ({det.asset.dependents.length}):</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {det.asset.dependents.slice(0, 8).map((d, j) => (
                                  <span key={j} style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)', margin: 0 }}>{d}</span>
                                ))}
                                {det.asset.dependents.length > 8 && <span style={{ color: '#64748b', fontSize: 10 }}>+{det.asset.dependents.length - 8} more</span>}
                              </div>
                            </div>
                          )}
                          {det.recommendations?.length > 0 && (
                            <div>
                              <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Recommendations:</div>
                              {det.recommendations.slice(0, 3).map((rec, j) => (
                                <div key={j} style={{ color: '#fcd34d', fontSize: 11, marginBottom: 3 }}>• {rec.name || rec.id || JSON.stringify(rec)}</div>
                              ))}
                            </div>
                          )}
                          {!det.asset?.deps?.length && !det.asset?.dependents?.length && !det.recommendations?.length && (
                            <div style={{ color: '#64748b', fontSize: 11 }}>No dependency or recommendation data available.</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {items.length} assets · auto-refresh 120s
          </div>
        </div>
      )}
    </>
  );
}
