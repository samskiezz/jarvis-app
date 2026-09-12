/**
 * F75 — Investment × Scenario Coverage (INVSCEN)
 *
 * Parallel-fetches /entities/Investment + /v1/scenario/list, then keyword-correlates
 * each investment's text fields against active scenario titles/descriptions to surface:
 *   EXPOSED  — at least one scenario's domain overlaps this investment
 *   STABLE   — no active scenario alignment detected
 *
 * Stat tiles: investments / scenarios / exposed / stable
 * Filter tabs: ALL | EXPOSED | STABLE + text search
 * Expand any investment → matched scenarios with status badge + relevance score bar.
 * Red badge on EXPOSED count.
 * ▶ ASSESS: 2-sentence portfolio-scenario exposure brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ INVSCEN  at bottom:8 left:688560, zIndex:258.
 * Event:   jarvis:invscen-toggle
 * Voice:   "investment scenario / scenario investment / invscen /
 *           exposed investments / investment threat scenario /
 *           portfolio scenario / scenario portfolio / scenario exposure /
 *           which investments have scenarios"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const POLL_MS = 90_000;
const RD = '#f87171';

// ── regex for voice/text matching ────────────────────────────────────────────
const INVSCEN_RE =
  /\b(investment[._-]?scenario|scenario[._-]?investment|invscen|exposed[._-]?invest(ment)?s?|investment[._-]?threat[._-]?scenario|portfolio[._-]?scenario|scenario[._-]?portfolio|scenario[._-]?exposure|which[._-]?invest(ment)?s?[._-]?(have|match)[._-]?scenario)\b/i;

export function isInvscenQuery(t) {
  return INVSCEN_RE.test(t || '');
}

export async function buildInvscenScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [invR, scenR] = await Promise.allSettled([
      fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
    ]);
    const investments = normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []);
    const scenarios   = normaliseScenarios(scenR.status === 'fulfilled' ? scenR.value : []);
    const enriched    = correlate(investments, scenarios);
    const exposed     = enriched.filter(i => i._exposed).length;
    const stable      = enriched.length - exposed;
    const topExposed  = enriched
      .filter(i => i._exposed)
      .slice(0, 4)
      .map(i => i.name)
      .join(', ') || 'none';

    return (
      `Investment × Scenario Coverage: ${investments.length} investments cross-matched against ` +
      `${scenarios.length} active scenarios. ${exposed} investments are EXPOSED (scenario threat alignment ` +
      `detected); ${stable} are STABLE (no scenario overlap). Top exposed holdings: ${topExposed}.`
    );
  } catch {
    return 'Investment × Scenario Coverage assessment unavailable at this time, sir.';
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = ['investments', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((v, i) => ({
    id:     v.id || String(i),
    name:   v.name || v.title || v.asset || v.ticker || `Investment ${i + 1}`,
    sector: v.sector || v.category || v.type || v.asset_class || '',
    notes:  (v.notes || v.description || v.summary || v.thesis || '').toString().slice(0, 300),
    tags:   Array.isArray(v.tags) ? v.tags.join(' ') : (v.tags || ''),
    ticker: v.ticker || v.symbol || '',
    status: v.status || v.state || '',
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || s.scenario || `Scenario ${i + 1}`,
    description: (s.description || s.summary || s.narrative || s.content || '').toString().slice(0, 300),
    status:      s.status || s.state || s.phase || '',
    category:    s.category || s.type || s.kind || '',
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function matchScore(investment, scenario) {
  const invToks = new Set([
    ...tokens(investment.name),
    ...tokens(investment.sector),
    ...tokens(investment.notes),
    ...tokens(investment.tags),
    ...tokens(investment.ticker),
  ].filter(Boolean));
  const scenToks = [
    ...tokens(scenario.name),
    ...tokens(scenario.description),
    ...tokens(scenario.category),
    ...tokens(scenario.tags),
  ].filter(Boolean);
  if (!invToks.size || !scenToks.length) return 0;
  let hits = 0;
  for (const t of scenToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, scenToks.length);
}

function correlate(investments, scenarios) {
  return investments.map(inv => {
    const scored = scenarios
      .map(s => ({ ...s, _score: matchScore(inv, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...inv, _matches: scored, _exposed: scored.length > 0 };
  });
}

function statusColor(st) {
  const s = String(st || '').toLowerCase();
  if (s.includes('active') || s.includes('live') || s.includes('run'))     return '#22c55e';
  if (s.includes('pend') || s.includes('plan') || s.includes('draft'))     return '#facc15';
  if (s.includes('done') || s.includes('complet') || s.includes('closed')) return '#94a3b8';
  if (s.includes('critical') || s.includes('alert') || s.includes('fail')) return '#f87171';
  return '#64748b';
}

// ── styles ────────────────────────────────────────────────────────────────────
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

// ── component ─────────────────────────────────────────────────────────────────
const TABS = ['ALL', 'EXPOSED', 'STABLE'];

export default function InvestmentScenarioCoverage() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [scenarios,   setScenarios]   = useState([]);
  const [enriched,    setEnriched]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState('');
  const [tab,         setTab]         = useState('ALL');
  const [search,      setSearch]      = useState('');
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [assessment,  setAssessment]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [invR, scenR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawInv  = normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []);
      const rawScen = normaliseScenarios(scenR.status === 'fulfilled' ? scenR.value : []);
      setInvestments(rawInv);
      setScenarios(rawScen);
      setEnriched(correlate(rawInv, rawScen));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:invscen-toggle', h);
    return () => window.removeEventListener('jarvis:invscen-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const exposed = enriched.filter(i => i._exposed).length;
    const stable  = enriched.filter(i => !i._exposed).length;
    const prompt =
      `Investment × Scenario Coverage: ${investments.length} investments cross-matched against ` +
      `${scenarios.length} active scenarios. ${exposed} investments are EXPOSED (scenario threat alignment ` +
      `detected); ${stable} are STABLE (no scenario overlap). ` +
      `Top exposed holdings: ${enriched.filter(i => i._exposed).slice(0, 5).map(i => i.name).join(', ') || 'none'}. ` +
      `Provide a 2-sentence portfolio-scenario exposure assessment: which investment sectors are most ` +
      `scenario-threatened, and what portfolio adjustments or hedging actions are advisable.`;
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

  const exposedCount = enriched.filter(i => i._exposed).length;
  const badgeColor   = exposedCount > 0 ? RD : '#22c55e';

  const visible = enriched.filter(inv => {
    if (search && !inv.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'EXPOSED') return inv._exposed;
    if (tab === 'STABLE')  return !inv._exposed;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Scenario Coverage"
        style={{
          position: 'fixed',
          left: 688560,
          bottom: 8,
          zIndex: 258,
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
          boxShadow: exposedCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        INVSCEN
        {exposedCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {exposedCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9102,
          width: 'min(700px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 14,
          boxShadow: '0 0 60px rgba(248,113,113,0.10)',
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: RD, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ INVESTMENT × SCENARIO COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${investments.length} investments · ${scenarios.length} scenarios`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'INVESTMENTS', val: enriched.length,                           color: '#94a3b8' },
              { label: 'SCENARIOS',   val: scenarios.length,                          color: '#94a3b8' },
              { label: 'EXPOSED',     val: exposedCount,                              color: RD },
              { label: 'STABLE',      val: enriched.filter(i => !i._exposed).length, color: '#22c55e' },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.val}</div>
                <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: tab === t ? RD : 'rgba(255,255,255,0.06)',
                color: tab === t ? '#fff' : '#94a3b8',
                border: 'none',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 170,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map(inv => {
              const isExp    = expanded === inv.id;
              const stateClr = inv._exposed ? RD : '#22c55e';
              return (
                <div key={inv.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : inv.id)}
                    style={{ ...ROW, background: isExp ? 'rgba(248,113,113,0.05)' : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(248,113,113,0.05)' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stateClr + '22', color: stateClr }}>
                        {inv._exposed ? 'EXPOSED' : 'STABLE'}
                      </span>
                      {inv.sector && (
                        <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{inv.sector}</span>
                      )}
                      {inv.ticker && (
                        <span style={{ ...PILL, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>{inv.ticker}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                      {inv._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                          {inv._matches.length} scenario{inv._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched scenarios */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {inv._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>No active scenario alignment — investment appears stable.</div>
                      ) : (
                        inv._matches.map(scen => (
                          <div key={scen.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {scen.status && (
                              <span style={{ ...PILL, background: statusColor(scen.status) + '22', color: statusColor(scen.status), flexShrink: 0 }}>{scen.status}</span>
                            )}
                            {scen.category && (
                              <span style={{ ...PILL, background: 'rgba(248,113,113,0.15)', color: RD, flexShrink: 0 }}>{scen.category}</span>
                            )}
                            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scen.name}</span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, scen._score * 300)}%`, height: '100%', background: RD, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(scen._score * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess + assessment */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${RD}44`,
                background: assessing ? 'rgba(248,113,113,0.15)' : 'rgba(248,113,113,0.08)',
                color: RD, cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              }}
            >
              {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
