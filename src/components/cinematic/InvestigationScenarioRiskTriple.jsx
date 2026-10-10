import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ISRTRIP_RE = /\b(isrtrip|invest(?:igation)?\s+scenario\s+risk|scenario\s+risk\s+invest(?:igation)?|risk\s+invest(?:igation)?\s+scenario|investigation\s+threat\s+plan|case\s+scenario\s+risk|risk\s+case\s+scenario|activated\s+investigation|investigation\s+response\s+plan|case\s+risk\s+signal|case\s+threat\s+plan|investigation\s+risk\s+plan|scenario\s+invest\s+risk|invest\s+risk\s+scenario|open\s+case\s+risk\s+signal|investigation\s+scenario\s+threat)\b/i;

const THRESHOLD = 0.08;

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

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investigations) ? data.investigations
    : Array.isArray(data.cases) ? data.cases
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(i => ({
    id: i.id || i._id || i.caseId || String(Math.random()),
    name: i.name || i.title || i.subject || i.label || 'Unnamed Investigation',
    description: i.description || i.summary || i.abstract || '',
    status: i.status || i.state || '',
    kind: i.kind || i.type || i.category || '',
    tags: Array.isArray(i.tags) ? i.tags.join(' ') : String(i.tags || ''),
    seedCount: i.seed_count || i.seeds || 0,
    annotationCount: i.annotation_count || i.annotations || 0,
    raw: i,
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
    id: s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Scenario',
    description: s.description || s.summary || s.abstract || '',
    status: s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function normaliseRiskSignals(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.risks) ? data.risks
    : Array.isArray(data.signals) ? data.signals
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    name: r.name || r.title || r.label || 'Unnamed Risk',
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.kind || '',
    description: r.description || r.summary || r.detail || '',
    source: r.source || r.origin || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function correlate(investigations, scenarios, risks) {
  return investigations.map(inv => {
    const toks = tok([inv.name, inv.description, inv.kind, inv.tags].join(' '));

    const matchedScenarios = scenarios
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.description),
          matchScore(toks, s.category),
          matchScore(toks, s.tags),
        );
        return { ...s, score };
      })
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedRisks = risks
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.category),
          matchScore(toks, r.description),
          matchScore(toks, r.source),
          matchScore(toks, r.tags),
        );
        return { ...r, score };
      })
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasScenario = matchedScenarios.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let state;
    if (hasScenario && hasRisk) state = 'FULLY ACTIVATED';
    else if (hasScenario) state = 'SCENARIO-BACKED';
    else if (hasRisk) state = 'RISK-FLAGGED';
    else state = 'UNACTIVATED';

    return { inv, matchedScenarios, matchedRisks, state };
  });
}

export function isIsrtripQuery(t) {
  return ISRTRIP_RE.test(t || '');
}

export async function buildIsrtripScript() {
  try {
    const [iRes, sRes, rRes] = await Promise.allSettled([
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : null),
    ]);
    const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
    const scenarios = normaliseScenarios(sRes.status === 'fulfilled' ? sRes.value : null);
    const risks = normaliseRiskSignals(rRes.status === 'fulfilled' ? rRes.value : null);
    const rows = correlate(investigations, scenarios, risks);
    const fully = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
    const scenBacked = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
    const riskFlagged = rows.filter(r => r.state === 'RISK-FLAGGED').length;
    const unactivated = rows.filter(r => r.state === 'UNACTIVATED').length;
    return `ISRTRIP Investigation×Scenario×RiskSignal: ${rows.length} investigations analysed. ` +
      `${fully} FULLY ACTIVATED (scenario + risk signal), ` +
      `${scenBacked} SCENARIO-BACKED (plan only), ${riskFlagged} RISK-FLAGGED (threat only), ${unactivated} UNACTIVATED. ` +
      (unactivated > 0 ? `${unactivated} investigations have no scenario or risk signal coverage — response gap.` :
        fully > 0 ? `Top activated: ${rows.find(r => r.state === 'FULLY ACTIVATED')?.inv.name || 'see panel'}.` :
        'No fully activated investigations at this time.');
  } catch {
    return 'ISRTRIP: data fetch failed.';
  }
}

export default function InvestigationScenarioRiskTriple() {
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
    window.addEventListener('jarvis:isrtrip-toggle', handler);
    return () => window.removeEventListener('jarvis:isrtrip-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iRes, sRes, rRes] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
      const scenarios = normaliseScenarios(sRes.status === 'fulfilled' ? sRes.value : null);
      const risks = normaliseRiskSignals(rRes.status === 'fulfilled' ? rRes.value : null);
      if (!investigations.length && !scenarios.length && !risks.length) {
        setErr('No data returned from Investigations, Scenarios, or RiskSignal endpoints.');
      }
      setRows(correlate(investigations, scenarios, risks));
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
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
  const scenBacked = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const riskFlagged = rows.filter(r => r.state === 'RISK-FLAGGED').length;
  const unactivated = rows.filter(r => r.state === 'UNACTIVATED').length;

  const TABS = ['ALL', 'FULLY ACTIVATED', 'SCENARIO-BACKED', 'RISK-FLAGGED', 'UNACTIVATED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.inv.name.toLowerCase().includes(q) ||
        r.inv.description.toLowerCase().includes(q) ||
        r.matchedScenarios.some(s => s.name.toLowerCase().includes(q)) ||
        r.matchedRisks.some(rk => rk.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const coverageBarWidth = total > 0 ? {
    fully: (fully / total) * 100,
    scenBacked: (scenBacked / total) * 100,
    riskFlagged: (riskFlagged / total) * 100,
    unactivated: (unactivated / total) * 100,
  } : { fully: 0, scenBacked: 0, riskFlagged: 0, unactivated: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Investigation "${row.inv.name}" [${row.state}]: ` +
      `scenarios: ${row.matchedScenarios.map(s => s.name).join(', ') || 'none'}. ` +
      `risk signals: ${row.matchedRisks.map(r => r.name).join(', ') || 'none'}. ` +
      `Status: ${row.inv.status || 'unknown'}. Kind: ${row.inv.kind || 'unknown'}. ` +
      `Give a 2-sentence investigation scenario and risk coverage brief.`;
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
    'FULLY ACTIVATED': '#00ff88',
    'SCENARIO-BACKED': '#a855f7',
    'RISK-FLAGGED': '#ff6b35',
    'UNACTIVATED': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 814000,
          bottom: 8,
          zIndex: 482,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00ff8844',
          color: '#00ff88',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ ISRTRIP
        {unactivated > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ff6b35',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {unactivated}
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
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00ff8855',
      borderRadius: 8,
      zIndex: 482,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00ff8822',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00ff8822',
        background: 'rgba(0,255,136,0.05)',
      }}>
        <span style={{ color: '#00ff88', fontWeight: 700, letterSpacing: 1 }}>
          ◈ INVESTIGATION × SCENARIO × RISK SIGNAL
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
              border: '1px solid #00ff8844',
              color: '#00ff88',
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
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00ff8811' }}>
        {[
          { label: 'FULLY ACTIVATED', val: fully, col: '#00ff88' },
          { label: 'SCENARIO-BACKED', val: scenBacked, col: '#a855f7' },
          { label: 'RISK-FLAGGED', val: riskFlagged, col: '#ff6b35' },
          { label: 'UNACTIVATED', val: unactivated, col: '#555' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,255,136,0.04)',
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
      {total > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00ff8811' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#001a0a' }}>
            <div style={{ width: `${coverageBarWidth.fully}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.scenBacked}%`, background: '#a855f7', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.riskFlagged}%`, background: '#ff6b35', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.unactivated}%`, background: '#333', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ ACTIVATED</span>
            <span style={{ color: '#a855f7' }}>■ SCENARIO-BACKED</span>
            <span style={{ color: '#ff6b35' }}>■ RISK-FLAGGED</span>
            <span style={{ color: '#444' }}>■ UNACTIVATED</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#00ff8822' : 'none',
              border: `1px solid ${filter === t ? '#00ff88' : '#00ff8833'}`,
              color: filter === t ? '#00ff88' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
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
            background: 'rgba(0,255,136,0.05)',
            border: '1px solid #00ff8833',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching investigations.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.inv.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.inv.id}
              style={{
                borderBottom: '1px solid #00ff880d',
                background: isExp ? 'rgba(0,255,136,0.03)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.inv.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.inv.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.inv.kind && (
                  <span style={{ color: '#667', fontSize: 9, marginLeft: 4 }}>
                    [{row.inv.kind}]
                  </span>
                )}
                {row.inv.status && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    {row.inv.status}
                  </span>
                )}
                <span style={{ color: '#00ff8844', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.inv.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.inv.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched scenarios */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#a855f7', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No scenarios matched.</div>
                      )}
                      {row.matchedScenarios.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#e0c8ff', fontWeight: 600 }}>{s.name}</span>
                            <span style={{ color: '#a855f7', fontSize: 10 }}>{(s.score * 100).toFixed(0)}%</span>
                          </div>
                          {s.category && (
                            <span style={{
                              display: 'inline-block',
                              background: '#a855f722',
                              color: '#a855f7',
                              borderRadius: 3,
                              padding: '1px 5px',
                              fontSize: 9,
                              marginTop: 2,
                            }}>
                              {s.category}
                            </span>
                          )}
                          {s.status && (
                            <span style={{
                              display: 'inline-block',
                              background: '#55337722',
                              color: '#aa88cc',
                              borderRadius: 3,
                              padding: '1px 5px',
                              fontSize: 9,
                              marginTop: 2,
                              marginLeft: 4,
                            }}>
                              {s.status}
                            </span>
                          )}
                          <div style={{ height: 3, background: '#1a0a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(s.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #a855f7, #7c3aed)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched risk signals */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ff6b35', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        RISK SIGNALS ({row.matchedRisks.length})
                      </div>
                      {row.matchedRisks.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No risk signals matched.</div>
                      )}
                      {row.matchedRisks.slice(0, 5).map(rk => (
                        <div key={rk.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffc8a0', fontWeight: 600 }}>{rk.name}</span>
                            <span style={{ color: '#ff6b35', fontSize: 10 }}>{(rk.score * 100).toFixed(0)}%</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            {rk.severity && (
                              <span style={{
                                background: rk.severity.toLowerCase() === 'critical' ? '#ff000033' : '#ff6b3522',
                                color: rk.severity.toLowerCase() === 'critical' ? '#ff4444' : '#ff6b35',
                                borderRadius: 3,
                                padding: '1px 5px',
                                fontSize: 9,
                              }}>
                                {rk.severity}
                              </span>
                            )}
                            {rk.category && (
                              <span style={{
                                background: '#ff6b3515',
                                color: '#ff9966',
                                borderRadius: 3,
                                padding: '1px 5px',
                                fontSize: 9,
                              }}>
                                {rk.category}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#2a0a00', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(rk.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #ff6b35, #cc4400)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(0,255,136,0.08)',
                      border: '1px solid #00ff8855',
                      color: '#00ff88',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
