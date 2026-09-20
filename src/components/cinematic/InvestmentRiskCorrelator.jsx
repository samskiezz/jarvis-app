import { useState, useEffect, useCallback } from 'react';

const API = '';
const IVRC_RE = /\b(investment[._-]?risk|risk[._-]?signal|ivrc|exposed[._-]?invest|investment[._-]?alert|invest[._-]?risk[._-]?signal|risky[._-]?invest|which[._-]?invest[._-]?have[._-]?risk|invest[._-]?coverage|risk[._-]?invest)\b/i;

export function isIvrcQuery(t) {
  return IVRC_RE.test(t || '');
}

export async function buildIvrcScript() {
  const [invR, rsR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const investments = normaliseArray(invR.status === 'fulfilled' ? invR.value : []);
  const riskSignals = normaliseArray(rsR.status === 'fulfilled' ? rsR.value : []);
  const enriched = correlate(investments, riskSignals);
  const exposed = enriched.filter(i => i._linked).length;
  const clear = enriched.filter(i => !i._linked).length;
  return `Investment × Risk Signal Correlator: ${investments.length} investments, ${riskSignals.length} risk signals indexed. ` +
    `${exposed} investments are EXPOSED (matched to active risk signals); ${clear} are CLEAR. ` +
    `Top exposed investments: ${enriched.filter(i => i._linked).slice(0, 4).map(i => i.name || i.title || i.id || '?').join(', ') || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'investments', 'risk_signals', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(investment, signal) {
  const invToks = new Set([
    ...tokens(investment.name),
    ...tokens(investment.title),
    ...tokens(investment.description),
    ...tokens(investment.sector),
    ...tokens(investment.type),
    ...tokens(investment.ticker),
  ].filter(Boolean));
  const sigToks = [
    ...tokens(signal.name),
    ...tokens(signal.title),
    ...tokens(signal.description),
    ...tokens(signal.category),
    ...tokens(signal.sector),
    ...tokens(signal.source),
  ].filter(Boolean);
  if (!invToks.size || !sigToks.length) return 0;
  let hits = 0;
  for (const t of sigToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, sigToks.length);
}

function correlate(investments, signals) {
  return investments.map(inv => {
    const scored = signals
      .map(sig => ({ sig, score: matchScore(inv, sig) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { ...inv, _matches: scored, _linked: scored.length > 0 };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function sevColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical' || s === 'high') return '#ef4444';
  if (s === 'medium' || s === 'warn' || s === 'warning') return '#f59e0b';
  return '#60a5fa';
}

export default function InvestmentRiskCorrelator() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [signals, setSignals] = useState([]);
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
      const [invR, rsR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const inv = normaliseArray(invR.status === 'fulfilled' ? invR.value : []);
      const rs = normaliseArray(rsR.status === 'fulfilled' ? rsR.value : []);
      setInvestments(inv);
      setSignals(rs);
      setEnriched(correlate(inv, rs));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:ivrc-toggle', h);
    return () => window.removeEventListener('jarvis:ivrc-toggle', h);
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
    const exposed = enriched.filter(i => i._linked);
    const clear = enriched.filter(i => !i._linked);
    const prompt =
      `Investment × Risk Signal Correlator: ${investments.length} total investments, ${signals.length} risk signals. ` +
      `${exposed.length} investments are EXPOSED (matched risk signals); ${clear.length} are CLEAR. ` +
      `Top exposed: ${exposed.slice(0, 5).map(i => i.name || i.title || i.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence investment risk correlation brief.`;
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

  const exposedCount = enriched.filter(i => i._linked).length;
  const badge = exposedCount > 0 ? '#ef4444' : '#22c55e';

  const visible = enriched.filter(inv => {
    const label = (inv.name || inv.title || inv.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'EXPOSED') return inv._linked;
    if (tab === 'CLEAR') return !inv._linked;
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Risk Signal Correlator"
        style={{
          position: 'fixed',
          left: 443040,
          bottom: 8,
          zIndex: 190,
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
          boxShadow: exposedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        IVRC
        {exposedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {exposedCount}
          </span>
        )}
      </button>

      {/* Panel */}
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
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#ef4444' }}>◈ INVESTMENT × RISK CORRELATOR</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, color: '#ef4444', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'INVESTMENTS', val: investments.length, color: '#60a5fa' },
              { label: 'RISK SIGNALS', val: signals.length, color: '#a78bfa' },
              { label: 'EXPOSED', val: exposedCount, color: exposedCount > 0 ? '#ef4444' : '#64748b' },
              { label: 'CLEAR', val: enriched.filter(i => !i._linked).length, color: '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment block */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'EXPOSED', 'CLEAR'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#ef4444' : '#94a3b8',
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

          {/* Status / error */}
          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {/* Investment rows */}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No investments match the current filter.</div>
          )}

          <div>
            {visible.map((inv, i) => {
              const id = inv.id || inv.investment_id || i;
              const label = inv.name || inv.title || `Investment ${id}`;
              const sector = inv.sector || inv.type || '';
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
                      background: inv._linked ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: inv._linked ? '#ef4444' : '#22c55e',
                      border: `1px solid ${inv._linked ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                    }}>
                      {inv._linked ? 'EXPOSED' : 'CLEAR'}
                    </span>
                    {sector && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        {sector}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {inv.description && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(inv.description).slice(0, 200)}</div>
                      )}
                      {inv._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched risk signals:</div>
                          {inv._matches.map(({ sig, score }, j) => {
                            const sigLabel = sig.name || sig.title || sig.description || sig.id || `signal-${j}`;
                            const sev = sig.severity || sig.level || sig.priority || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#fca5a5', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sigLabel}</span>
                                  {sev && (
                                    <span style={{ ...PILL, background: `${sevColor(sev)}22`, color: sevColor(sev), border: `1px solid ${sevColor(sev)}44` }}>
                                      {sev.toUpperCase()}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#ef4444', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#22c55e', fontSize: 11 }}>✓ No risk signal correlation for this investment.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} investments · {signals.length} risk signals indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
