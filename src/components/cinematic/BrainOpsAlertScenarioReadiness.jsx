/**
 * BrainOpsAlertScenarioReadiness — F97
 *
 * Fetches /v1/cinematic/brain + /v1/ops/alerts + /v1/scenario/list.
 *
 * Keyword-matches each brain node (label/type) against ops alert messages/types AND
 * scenario names/descriptions to classify:
 *   READY    — node has a matching ops alert AND a matching scenario (fully covered)
 *   ALERTED  — node matches an ops alert but no scenario (operationally visible, no playbook)
 *   SCRIPTED — node matches a scenario but no ops alert (playbook exists, not yet monitored)
 *   BLIND    — no match to any ops alert AND no matching scenario (blind-spot node)
 *
 * Toggle: ◈ BIRSIX button (fixed, bottom strip) left:102680, zIndex:194
 * Stat tiles: nodes / alerts / scenarios / ready / alerted / scripted / blind
 * Red pulse on BLIND count (unmonitored brain gaps — zero operational coverage).
 * Expandable rows: matched ops alerts with severity badge +
 *                  matched scenarios with status badge.
 * Filter tabs: ALL / READY / ALERTED / SCRIPTED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "birsix"/"brain readiness"/"brain ops alert scenario"/"brain coverage"
 *        "brain blind"/"brain scenario"/"brain alert coverage"/"brain intelligence readiness"
 *        "intelligence readiness"/"brain operational"/"brain playbook"/"readiness index"
 *        "brain ops scenario"/"intelligence coverage index"
 * Event: jarvis:birsix-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'READY', 'ALERTED', 'SCRIPTED', 'BLIND'];

const CLS_COLOR = {
  READY:    '#22C55E',
  ALERTED:  '#F97316',
  SCRIPTED: '#38BDF8',
  BLIND:    '#EF4444',
};

const SEV_COLOR = { critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#22C55E' };
const STATUS_COLOR = { active: '#22C55E', running: '#22C55E', complete: '#38BDF8', completed: '#38BDF8', pending: '#F59E0B', draft: '#94A3B8', failed: '#EF4444' };

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeBrain(raw) {
  if (!raw) return [];
  // /v1/cinematic/brain may return { nodes: [...] } or { graph: { nodes: [...] } } or an array
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw.nodes))               return raw.nodes;
  if (Array.isArray(raw.graph?.nodes))        return raw.graph.nodes;
  if (Array.isArray(raw.entities))            return raw.entities;
  if (raw.node_count != null) {
    // Flat stats object — synthesize synthetic node list from known labels
    const labels = raw.labels || raw.node_labels || [];
    if (labels.length) return labels.map(l => ({ label: l, type: l }));
    // Return a single entry summarising the brain
    return [{ label: 'Brain', type: 'brain', count: raw.node_count }];
  }
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.alerts))    return raw.alerts;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  if (Array.isArray(raw?.entities))  return raw.entities;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.scenarios)) return raw.scenarios;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

export function isBirsixQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'birsix', 'brain readiness', 'brain ops alert scenario', 'brain coverage',
    'brain blind', 'brain scenario', 'brain alert coverage', 'brain intelligence readiness',
    'intelligence readiness', 'brain operational', 'brain playbook', 'readiness index',
    'brain ops scenario', 'intelligence coverage index',
  ].some(k => s.includes(k));
}

export function buildBirsixScript() {
  return (
    'Fetch /v1/cinematic/brain, /v1/ops/alerts, and /v1/scenario/list. ' +
    'Keyword-match each brain node label/type against ops alert messages/types AND scenario names/descriptions. ' +
    'Classify each node as READY (matched alert + scenario), ALERTED (alert only), SCRIPTED (scenario only), or BLIND (no match). ' +
    'Report total BLIND count (brain model gaps with zero operational coverage — unmonitored intelligence nodes), ' +
    'identify which BLIND nodes represent the highest operational risk, ' +
    'and recommend which scenarios or ops alert rules should be created to improve intelligence coverage.'
  );
}

export default function BrainOpsAlertScenarioReadiness() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    nodes: 0, alerts: 0, scenarios: 0,
    ready: 0, alerted: 0, scripted: 0, blind: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [brainRaw, alertsRaw, scenariosRaw] = await Promise.all([
        fetch(`${API}/v1/cinematic/brain`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const nodes     = normalizeBrain(brainRaw);
      const alerts    = normalizeAlerts(alertsRaw);
      const scenarios = normalizeScenarios(scenariosRaw);

      const built = nodes.map((node, idx) => {
        const nodeText = [node.label, node.type, node.name, node.description, node.category].filter(Boolean).join(' ');
        const nToks    = tokens(nodeText);

        const matchedAlerts    = alerts.filter(alert => {
          const s = [alert.message, alert.title, alert.type, alert.severity, alert.description, alert.source, alert.category]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const matchedScenarios = scenarios.filter(sc => {
          const s = [sc.name, sc.title, sc.description, sc.category, sc.type, sc.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const hasAlert    = matchedAlerts.length > 0;
        const hasScenario = matchedScenarios.length > 0;

        let cls;
        if (hasAlert && hasScenario)  cls = 'READY';
        else if (hasAlert)            cls = 'ALERTED';
        else if (hasScenario)         cls = 'SCRIPTED';
        else                          cls = 'BLIND';

        return {
          id:               `node-${idx}`,
          label:            node.label || node.name || node.type || `Node ${idx + 1}`,
          type:             node.type || node.category || '',
          centrality:       node.centrality ?? node.score ?? node.weight ?? null,
          cls,
          matchedAlerts,
          matchedScenarios,
        };
      });

      const ready    = built.filter(r => r.cls === 'READY').length;
      const alerted  = built.filter(r => r.cls === 'ALERTED').length;
      const scripted = built.filter(r => r.cls === 'SCRIPTED').length;
      const blind    = built.filter(r => r.cls === 'BLIND').length;

      setRows(built);
      setCounts({ nodes: built.length, alerts: alerts.length, scenarios: scenarios.length, ready, alerted, scripted, blind });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:birsix-toggle', handler);
    return () => window.removeEventListener('jarvis:birsix-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildBirsixScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.blind > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.type.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 102680, zIndex: 194,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ BIRSIX{counts.blind > 0 ? <span style={pulse}> {counts.blind}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 700, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ BRAIN × OPS ALERT × SCENARIO — INTELLIGENCE READINESS INDEX
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'NODES',    val: counts.nodes,    col: '#94A3B8' },
            { label: 'ALERTS',   val: counts.alerts,   col: '#94A3B8' },
            { label: 'SCENARIOS',val: counts.scenarios, col: '#94A3B8' },
            { label: 'READY',    val: counts.ready,    col: CLS_COLOR.READY    },
            { label: 'ALERTED',  val: counts.alerted,  col: CLS_COLOR.ALERTED  },
            { label: 'SCRIPTED', val: counts.scripted, col: CLS_COLOR.SCRIPTED },
            { label: 'BLIND',    val: counts.blind,    col: CLS_COLOR.BLIND    },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}44`,
              borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? CLS_COLOR[t] || '#334155' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${CLS_COLOR[t] || '#334155'}`,
                color: tab === t ? '#000' : CLS_COLOR[t] || '#94A3B8',
                padding: '2px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
              color: '#E2E8F0', padding: '2px 8px', fontSize: 11, borderRadius: 3,
              outline: 'none', flex: 1, minWidth: 120,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '0 14px 8px' }}>
          {loading && <div style={{ color: '#64748B', fontSize: 12, padding: 8 }}>Loading…</div>}
          {error   && <div style={{ color: '#EF4444', fontSize: 12, padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, padding: 8 }}>No nodes match.</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{
              borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6, marginBottom: 6,
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => toggleExpand(row.id)}
              >
                <span style={{
                  fontSize: 9, fontWeight: 700, color: CLS_COLOR[row.cls],
                  border: `1px solid ${CLS_COLOR[row.cls]}`, borderRadius: 3,
                  padding: '1px 5px', whiteSpace: 'nowrap',
                }}>{row.cls}</span>
                {row.type && (
                  <span style={{
                    fontSize: 9, color: '#94A3B8', border: '1px solid #334155',
                    borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                  }}>{row.type.toUpperCase()}</span>
                )}
                <span style={{ color: '#CBD5E1', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.label}
                </span>
                {row.centrality != null && (
                  <span style={{ color: '#475569', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {typeof row.centrality === 'number' ? row.centrality.toFixed(3) : row.centrality}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#F97316', fontSize: 10, marginRight: 6 }}>Ops alerts:</span>
                      {row.matchedAlerts.slice(0, 5).map((alert, i) => {
                        const sev = (alert.severity || '').toLowerCase();
                        const col = SEV_COLOR[sev] || '#94A3B8';
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: `${col}18`, border: `1px solid ${col}`,
                            color: col, fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {alert.message || alert.title || 'Alert'}
                            {sev && <span style={{ opacity: 0.8, marginLeft: 4 }}>[{sev.toUpperCase()}]</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedScenarios.length > 0 && (
                    <div>
                      <span style={{ color: '#38BDF8', fontSize: 10, marginRight: 6 }}>Scenarios:</span>
                      {row.matchedScenarios.slice(0, 5).map((sc, i) => {
                        const st  = (sc.status || sc.state || '').toLowerCase();
                        const col = STATUS_COLOR[st] || '#94A3B8';
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: `${col}18`, border: `1px solid ${col}`,
                            color: col, fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {sc.name || sc.title || 'Scenario'}
                            {st && <span style={{ opacity: 0.8, marginLeft: 4 }}>[{st.toUpperCase()}]</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedAlerts.length === 0 && row.matchedScenarios.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 10 }}>No ops alert or scenario match — blind-spot brain node.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ASSESS */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '4px 16px', fontSize: 11, borderRadius: 4,
              cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace',
            }}>
            {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4,
              color: '#CBD5E1', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
