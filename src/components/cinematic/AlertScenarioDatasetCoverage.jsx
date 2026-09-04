import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULL_COVERAGE', 'SCENARIO_ONLY', 'DATA_ONLY', 'DARK'];

function classify(alertId, scenarioIds, datasetIds) {
  const hasScenario = scenarioIds.has(alertId);
  const hasDataset = datasetIds.has(alertId);
  if (hasScenario && hasDataset) return 'FULL_COVERAGE';
  if (hasScenario) return 'SCENARIO_ONLY';
  if (hasDataset) return 'DATA_ONLY';
  return 'DARK';
}

function tokenise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

function overlaps(a, b) {
  const setA = new Set(tokenise(a));
  return tokenise(b).some(t => setA.has(t));
}

function buildScenarioIndex(scenarios) {
  const idx = new Set();
  (scenarios || []).forEach(s => {
    const key = (s.alert_id || s.id || s.name || '').toString().toLowerCase();
    if (key) idx.add(key);
    (s.tags || []).forEach(t => idx.add(t.toLowerCase()));
  });
  return idx;
}

function buildDatasetIndex(datasets) {
  const idx = new Set();
  (datasets || []).forEach(d => {
    const key = (d.alert_id || d.id || d.name || '').toString().toLowerCase();
    if (key) idx.add(key);
    (d.tags || []).forEach(t => idx.add(t.toLowerCase()));
  });
  return idx;
}

function matchAlert(alert, scenarioIndex, datasetIndex) {
  const tokens = [
    alert.id, alert.type, alert.title, alert.message, alert.source,
    ...(alert.tags || [])
  ].filter(Boolean).map(v => v.toString().toLowerCase());

  const hasScenario = tokens.some(t => scenarioIndex.has(t) || [...scenarioIndex].some(s => overlaps(t, s)));
  const hasDataset = tokens.some(t => datasetIndex.has(t) || [...datasetIndex].some(s => overlaps(t, s)));
  return { hasScenario, hasDataset };
}

export default function AlertScenarioDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [alertsRes, scenariosRes, datasetsRes] = await Promise.all([
        fetch(`${API}/v1/alerts?status=open&limit=100`),
        fetch(`${API}/v1/scenario/list`),
        fetch(`${API}/v1/datasets`),
      ]);

      const alertsData = alertsRes.ok ? await alertsRes.json() : { alerts: [], items: [] };
      const scenariosData = scenariosRes.ok ? await scenariosRes.json() : { scenarios: [], items: [] };
      const datasetsData = datasetsRes.ok ? await datasetsRes.json() : { datasets: [], items: [] };

      const rawAlerts = alertsData.alerts || alertsData.items || alertsData.data || [];
      const rawScenarios = scenariosData.scenarios || scenariosData.items || scenariosData.data || [];
      const rawDatasets = datasetsData.datasets || datasetsData.items || datasetsData.data || [];

      const scenarioIndex = buildScenarioIndex(rawScenarios);
      const datasetIndex = buildDatasetIndex(rawDatasets);

      const classified = rawAlerts.map(a => {
        const { hasScenario, hasDataset } = matchAlert(a, scenarioIndex, datasetIndex);
        return {
          ...a,
          _class: classify(
            (a.id || a.alert_id || '').toString().toLowerCase(),
            scenarioIndex,
            datasetIndex
          ) === 'DARK' && (hasScenario || hasDataset)
            ? (hasScenario && hasDataset ? 'FULL_COVERAGE' : hasScenario ? 'SCENARIO_ONLY' : 'DATA_ONLY')
            : classify(
                (a.id || a.alert_id || '').toString().toLowerCase(),
                scenarioIndex,
                datasetIndex
              ),
        };
      });

      setAlerts(classified);
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:asdc-toggle', handler);
    return () => window.removeEventListener('jarvis:asdc-toggle', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 60000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const filtered = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || [r.id, r.title, r.message, r.type, r.source]
      .filter(Boolean).some(v => v.toString().toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const counts = {
    ALL: alerts.length,
    FULL_COVERAGE: alerts.filter(a => a._class === 'FULL_COVERAGE').length,
    SCENARIO_ONLY: alerts.filter(a => a._class === 'SCENARIO_ONLY').length,
    DATA_ONLY: alerts.filter(a => a._class === 'DATA_ONLY').length,
    DARK: alerts.filter(a => a._class === 'DARK').length,
  };

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.FULL_COVERAGE} full-coverage, ${counts.SCENARIO_ONLY} scenario-only, ${counts.DATA_ONLY} data-only, ${counts.DARK} dark alerts with no coverage.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Alert-Scenario-Dataset coverage: ${summary} Provide a 2-sentence operational brief on coverage gaps and recommended action.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const classColor = {
    FULL_COVERAGE: '#00ff88',
    SCENARIO_ONLY: '#00bfff',
    DATA_ONLY: '#ffd700',
    DARK: '#ff4444',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8160, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #ff4444',
          color: '#ff4444', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ ASDC
        {counts.DARK > 0 && (
          <span style={{
            background: '#ff4444', color: '#000', borderRadius: 10,
            padding: '1px 6px', fontSize: 10, fontWeight: 700,
          }}>
            {counts.DARK}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.92)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #1a3a2a',
        background: 'rgba(0,20,10,0.9)',
      }}>
        <div>
          <span style={{ color: '#ff4444', fontWeight: 700, fontSize: 16 }}>◈ ASDC</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Alert × Scenario × Dataset Response Coverage
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88',
              color: '#00ff88', padding: '4px 12px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '⟳ Assessing…' : '◈ ASSESS'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            ⟳
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
        {Object.entries(counts).filter(([k]) => k !== 'ALL').map(([k, v]) => (
          <div key={k} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${classColor[k]}44`,
            borderRadius: 6, padding: '8px 16px', minWidth: 120, cursor: 'pointer',
            borderLeft: `3px solid ${classColor[k]}`,
          }} onClick={() => setTab(k)}>
            <div style={{ color: classColor[k], fontSize: 22, fontWeight: 700 }}>{v}</div>
            <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
          borderRadius: 6, padding: '8px 16px', minWidth: 120,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{counts.ALL}</div>
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL ALERTS</div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(0,255,136,0.05)',
          border: '1px solid #00ff8844', borderRadius: 6, padding: '8px 12px',
          color: '#00ff88', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(255,68,68,0.2)' : 'transparent',
            border: `1px solid ${tab === t ? '#ff4444' : '#333'}`,
            color: tab === t ? '#ff4444' : '#666',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            {t} ({counts[t] ?? 0})
          </button>
        ))}
        <input
          placeholder="Search alerts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333', borderRadius: 4, color: '#e0e0e0',
            padding: '4px 10px', fontSize: 11, width: 200,
          }}
        />
      </div>

      {/* table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {loading && <div style={{ color: '#555', fontSize: 12, padding: 16 }}>⟳ Loading…</div>}
        {err && <div style={{ color: '#ff4444', fontSize: 12, padding: 16 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, padding: 16 }}>No alerts match.</div>
        )}
        {!loading && filtered.map(a => {
          const isExp = expanded === (a.id || a.alert_id);
          return (
            <div key={a.id || a.alert_id || Math.random()} style={{
              borderBottom: '1px solid #1a1a1a', padding: '8px 0',
              cursor: 'pointer',
            }} onClick={() => setExpanded(isExp ? null : (a.id || a.alert_id))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  color: classColor[a._class] || '#888',
                  fontSize: 10, minWidth: 100, fontWeight: 600,
                }}>
                  {(a._class || 'DARK').replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {a.title || a.message || a.type || a.id || '—'}
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>
                  {a.severity || a.level || ''}
                </span>
                <span style={{ color: '#444', fontSize: 10 }}>
                  {a.source || ''}
                </span>
                <span style={{ color: '#333', fontSize: 10 }}>▾</span>
              </div>
              {isExp && (
                <div style={{
                  marginTop: 6, padding: '8px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4, fontSize: 11, color: '#888',
                }}>
                  <div><b style={{ color: '#aaa' }}>ID:</b> {a.id || a.alert_id || '—'}</div>
                  <div><b style={{ color: '#aaa' }}>Type:</b> {a.type || '—'}</div>
                  <div><b style={{ color: '#aaa' }}>Message:</b> {a.message || '—'}</div>
                  <div><b style={{ color: '#aaa' }}>Tags:</b> {(a.tags || []).join(', ') || '—'}</div>
                  <div><b style={{ color: '#aaa' }}>Coverage:</b>{' '}
                    <span style={{ color: classColor[a._class] }}>
                      {(a._class || 'DARK').replace(/_/g, ' ')}
                    </span>
                  </div>
                  {a.created_at && (
                    <div><b style={{ color: '#aaa' }}>Created:</b> {a.created_at}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: '6px 20px', borderTop: '1px solid #1a1a1a',
        color: '#444', fontSize: 10, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>ASDC — auto-refresh 60s</span>
        <span>{filtered.length} of {alerts.length} alerts shown</span>
      </div>
    </div>
  );
}

export { AlertScenarioDatasetCoverage };
export function isAsdcQuery(q) {
  const lower = q.toLowerCase();
  return [
    'alert scenario dataset', 'asdc', 'alert coverage', 'dark alerts',
    'which alerts have scenarios', 'alert dataset', 'alert response coverage',
    'coverage gap', 'uncovered alerts',
  ].some(kw => lower.includes(kw));
}

export function buildAsdcScript() {
  return `Checking Alert-Scenario-Dataset coverage (ASDC)…`;
}
