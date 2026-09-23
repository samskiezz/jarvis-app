import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IRSCN_RE = /\b(irscn|investment\s+risk\s+(signal\s+)?scenario|investment\s+scenario\s+risk|risk\s+assessed\s+investment|scenario\s+placed\s+investment|unassessed\s+investment|invest\s+risk\s+scene|risk\s+mapped\s+invest(ment)?)\b/i;

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseInvestments(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investments) ? data.investments
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(inv => ({
    id: inv.id || inv._id || inv.investmentId || String(Math.random()),
    name: inv.name || inv.title || inv.label || inv.asset || 'Untitled Investment',
    description: inv.description || inv.summary || inv.notes || '',
    category: inv.category || inv.type || inv.sector || inv.class || '',
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : String(inv.tags || ''),
    value: inv.value || inv.amount || inv.size || null,
    status: inv.status || inv.state || '',
    raw: inv,
  }));
}

function normaliseRiskSignals(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.risk_signals) ? data.risk_signals
    : Array.isArray(data.riskSignals) ? data.riskSignals
    : Array.isArray(data.signals) ? data.signals
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || r.signalId || String(Math.random()),
    name: r.name || r.title || r.label || 'Unknown Risk',
    severity: r.severity || r.level || r.risk_level || '',
    category: r.category || r.type || r.risk_type || '',
    description: r.description || r.summary || r.detail || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.scenarios) ? data.scenarios
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || s.scenarioId || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Scenario',
    description: s.description || s.summary || s.detail || '',
    type: s.type || s.category || s.scenario_type || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function correlate(investments, riskSignals, scenarios) {
  return investments.map(inv => {
    const toks = tok([inv.name, inv.description, inv.category, inv.tags, inv.status].join(' '));

    const matchedRisks = riskSignals
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.category),
          matchScore(toks, r.description),
          matchScore(toks, r.tags),
          matchScore(toks, r.severity),
        );
        return { ...r, matchScore: score };
      })
      .filter(r => r.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedScenarios = scenarios
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.description),
          matchScore(toks, s.type),
          matchScore(toks, s.tags),
        );
        return { ...s, matchScore: score };
      })
      .filter(s => s.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasRisk = matchedRisks.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let state;
    if (hasRisk && hasScenario) state = 'FULLY MAPPED';
    else if (hasRisk) state = 'RISK-ASSESSED';
    else if (hasScenario) state = 'SCENARIO-PLACED';
    else state = 'UNASSESSED';

    return { inv, matchedRisks, matchedScenarios, state };
  });
}

export function isIrscnQuery(t) {
  return IRSCN_RE.test(t || '');
}

export async function buildIrscnScript() {
  try {
    const [invRes, rskRes, scnRes] = await Promise.allSettled([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
    ]);
    const investments = normaliseInvestments(invRes.status === 'fulfilled' ? invRes.value : null);
    const riskSignals = normaliseRiskSignals(rskRes.status === 'fulfilled' ? rskRes.value : null);
    const scenarios = normaliseScenarios(scnRes.status === 'fulfilled' ? scnRes.value : null);
    const rows = correlate(investments, riskSignals, scenarios);
    const fullyMapped = rows.filter(r => r.state === 'FULLY MAPPED').length;
    const riskAssessed = rows.filter(r => r.state === 'RISK-ASSESSED').length;
    const scenarioPlaced = rows.filter(r => r.state === 'SCENARIO-PLACED').length;
    const unassessed = rows.filter(r => r.state === 'UNASSESSED').length;
    return `IRSCN Investment×RiskSignal×Scenario: ${rows.length} investments analysed. ` +
      `${fullyMapped} FULLY MAPPED (risk signal + scenario), ` +
      `${riskAssessed} RISK-ASSESSED only, ${scenarioPlaced} SCENARIO-PLACED only, ${unassessed} UNASSESSED. ` +
      (unassessed > 0
        ? `Top unassessed: "${rows.find(r => r.state === 'UNASSESSED')?.inv.name || 'see panel'}" — no risk signal or scenario coverage.`
        : 'All investments have risk signal or scenario coverage.');
  } catch {
    return 'IRSCN: data fetch failed.';
  }
}

export default function InvRiskScenTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:irscn-toggle', handler);
    return () => window.removeEventListener('jarvis:irscn-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [invRes, rskRes, scnRes] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const investments = normaliseInvestments(invRes.status === 'fulfilled' ? invRes.value : null);
      const riskSignals = normaliseRiskSignals(rskRes.status === 'fulfilled' ? rskRes.value : null);
      const scenarios = normaliseScenarios(scnRes.status === 'fulfilled' ? scnRes.value : null);
      if (!investments.length && !riskSignals.length && !scenarios.length) {
        setErr('No data returned from Investment, RiskSignal, or Scenario endpoints.');
      }
      setRows(correlate(investments, riskSignals, scenarios));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 120000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyMapped = rows.filter(r => r.state === 'FULLY MAPPED').length;
  const riskAssessed = rows.filter(r => r.state === 'RISK-ASSESSED').length;
  const scenarioPlaced = rows.filter(r => r.state === 'SCENARIO-PLACED').length;
  const unassessed = rows.filter(r => r.state === 'UNASSESSED').length;

  const TABS = ['ALL', 'FULLY MAPPED', 'RISK-ASSESSED', 'SCENARIO-PLACED', 'UNASSESSED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.inv.name.toLowerCase().includes(q) ||
        r.inv.description.toLowerCase().includes(q) ||
        r.matchedRisks.some(rk => rk.name.toLowerCase().includes(q)) ||
        r.matchedScenarios.some(s => s.name.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Investment "${row.inv.name}" [${row.state}]: ` +
      `risk signals: ${row.matchedRisks.map(r => r.name).join(', ') || 'none'}. ` +
      `scenarios: ${row.matchedScenarios.map(s => s.name).join(', ') || 'none'}. ` +
      `Category: ${row.inv.category || 'unknown'}. ` +
      `Give a 2-sentence investment risk and scenario coverage brief — does this investment have adequate risk signal assessment and operational scenario context, or is it an unassessed exposure?`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  const STATE_COLOUR = {
    'FULLY MAPPED': '#f59e0b',
    'RISK-ASSESSED': '#ef4444',
    'SCENARIO-PLACED': '#22d3ee',
    'UNASSESSED': '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 775920,
          bottom: 8,
          zIndex: 414,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00e5ff44',
          color: '#00e5ff',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ IRSCN
        {unassessed > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ef4444',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {unassessed}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 700,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00e5ff55',
      borderRadius: 8,
      zIndex: 414,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00e5ff22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00e5ff22',
        background: 'rgba(0,229,255,0.05)',
      }}>
        <span style={{ color: '#00e5ff', fontWeight: 700, letterSpacing: 1 }}>
          ◈ INVESTMENT × RISK SIGNAL × SCENARIO
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #00e5ff44',
              color: '#00e5ff',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00e5ff11' }}>
        {[
          { label: 'FULLY MAPPED', val: fullyMapped, col: '#f59e0b' },
          { label: 'RISK-ASSESSED', val: riskAssessed, col: '#ef4444' },
          { label: 'SCENARIO-PLACED', val: scenarioPlaced, col: '#22d3ee' },
          { label: 'UNASSESSED', val: unassessed, col: '#888' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,229,255,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00e5ff11' }}>
          <div style={{ fontSize: 10, color: '#556', marginBottom: 3 }}>
            COVERAGE — {rows.length > 0 ? Math.round((fullyMapped / rows.length) * 100) : 0}% fully mapped
          </div>
          <div style={{ height: 4, background: '#111', borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${rows.length ? (fullyMapped / rows.length) * 100 : 0}%`, background: '#f59e0b' }} />
            <div style={{ width: `${rows.length ? (riskAssessed / rows.length) * 100 : 0}%`, background: '#ef4444' }} />
            <div style={{ width: `${rows.length ? (scenarioPlaced / rows.length) * 100 : 0}%`, background: '#22d3ee' }} />
            <div style={{ width: `${rows.length ? (unassessed / rows.length) * 100 : 0}%`, background: '#333' }} />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #00e5ff11', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? 'rgba(0,229,255,0.18)' : 'none',
              border: `1px solid ${filter === t ? '#00e5ff' : '#00e5ff22'}`,
              color: filter === t ? '#00e5ff' : '#556',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,229,255,0.05)',
            border: '1px solid #00e5ff22',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontFamily: 'monospace',
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ padding: '6px 12px', color: '#ff4444', fontSize: 11 }}>
          {err}
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div style={{ padding: '16px 12px', color: '#556', textAlign: 'center' }}>
          Loading…
        </div>
      )}

      {/* Rows */}
      <div>
        {visible.map((row, i) => {
          const isExpanded = expanded === (row.inv.id + i);
          return (
            <div
              key={row.inv.id + i}
              style={{
                borderBottom: '1px solid #00e5ff0a',
                padding: '6px 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : (row.inv.id + i))}
              >
                <span style={{
                  display: 'inline-block',
                  minWidth: 112,
                  fontSize: 9,
                  fontWeight: 700,
                  color: STATE_COLOUR[row.state],
                  background: `${STATE_COLOUR[row.state]}18`,
                  border: `1px solid ${STATE_COLOUR[row.state]}44`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.inv.name}
                </span>
                {row.inv.category && (
                  <span style={{ fontSize: 9, color: '#00e5ff88', background: 'rgba(0,229,255,0.08)', borderRadius: 3, padding: '1px 5px' }}>
                    {row.inv.category}
                  </span>
                )}
                {row.inv.status && (
                  <span style={{ fontSize: 9, color: '#556' }}>
                    {row.inv.status}
                  </span>
                )}
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Risk Signals */}
                  <div style={{ flex: 1, background: 'rgba(239,68,68,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      RISK SIGNALS ({row.matchedRisks.length})
                    </div>
                    {row.matchedRisks.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No risk signal match</div>
                    ) : (
                      row.matchedRisks.slice(0, 5).map((r, j) => (
                        <div key={r.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 1 }}>{r.name}</div>
                          {(r.severity || r.category) && (
                            <div style={{ fontSize: 9, color: '#ef444488' }}>
                              {[r.severity, r.category].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(r.matchScore * 100)}%`, background: '#ef4444', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Scenarios */}
                  <div style={{ flex: 1, background: 'rgba(34,211,238,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#22d3ee', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      SCENARIOS ({row.matchedScenarios.length})
                    </div>
                    {row.matchedScenarios.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No scenario match</div>
                    ) : (
                      row.matchedScenarios.slice(0, 5).map((s, j) => (
                        <div key={s.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 1 }}>{s.name}</div>
                          {s.type && (
                            <div style={{ fontSize: 9, color: '#22d3ee88' }}>{s.type}</div>
                          )}
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s.matchScore * 100)}%`, background: '#22d3ee', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(0,229,255,0.1)',
                      border: '1px solid #00e5ff44',
                      color: '#00e5ff',
                      padding: '3px 12px',
                      borderRadius: 3,
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
