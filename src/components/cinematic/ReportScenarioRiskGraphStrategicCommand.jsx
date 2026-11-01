/**
 * F264 — Report × Scenario × RiskSignal × Graph Strategic Intelligence Command Network
 * ◈ RSGCN
 *
 * For each report, cross-references it against scenarios, risk signals, and graph nodes
 * to assess whether the report has a playbook, threat signal, and network trace.
 *
 * COMMANDED — scenario + risk signal + graph all present.
 * SCRIPTED  — at least two of three sources match.
 * SIGNALED  — only one source matches.
 * ADRIFT    — no scenario, no risk signal, no graph trace — fully unsupported report.
 *
 * Data sources (real endpoints):
 *   GET /v1/reports             → intelligence reports
 *   GET /v1/scenario/list       → playbooks / scenarios
 *   GET /entities/RiskSignal    → threat risk signals
 *   GET /v1/graph/centrality    → graph node centrality
 *
 * Stat tiles:  reports / scenarios / risk signals / graph nodes /
 *              commanded / scripted / signaled / adrift
 * Red badge:   adrift count on button.
 * Expand row:  matched scenarios with status badge
 *              + matched risk signals with severity badge
 *              + matched graph nodes with centrality score badge.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ RSGCN at left:195640 bottom:18, zIndex:360.
 * Event:   jarvis:rsgcn-toggle
 * Voice:   "strategic command network / rsgcn / adrift reports / report scenario risk /
 *           unsupported reports / report graph / strategic coverage /
 *           report risk signal graph / command coverage"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const RSGCN_RE =
  /\b(strategic[._-]?command[._-]?network|rsgcn|adrift[._-]?reports?|report[._-]?scenario[._-]?risk|unsupported[._-]?reports?|report[._-]?graph|strategic[._-]?coverage|report[._-]?risk[._-]?signal[._-]?graph|command[._-]?coverage)\b/i;

export function isRsgcnQuery(t) {
  return RSGCN_RE.test(t || '');
}

// ─── normalisers ─────────────────────────────────────────────────────────────

function normReports(raw) {
  if (!raw) return [];
  for (const k of ['reports', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normScenarios(raw) {
  if (!raw) return [];
  for (const k of ['scenarios', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normRiskSignals(raw) {
  if (!raw) return [];
  for (const k of ['risk_signals', 'riskSignals', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normGraphNodes(raw) {
  if (!raw) return [];
  const nodes = raw?.nodes || raw?.graph?.nodes || raw?.data?.nodes || [];
  if (Array.isArray(nodes)) return nodes;
  return [];
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function reportTokens(r) {
  return tokens(
    [r.title, r.name, r.description, r.type, r.category, r.subject,
     r.author, r.source,
     ...(Array.isArray(r.tags) ? r.tags : [])].join(' ')
  );
}

function scenarioTokens(s) {
  return tokens(
    [s.name, s.title, s.description, s.type, s.category, s.phase,
     s.status,
     ...(Array.isArray(s.tags) ? s.tags : [])].join(' ')
  );
}

function riskTokens(r) {
  return tokens(
    [r.name, r.title, r.description, r.type, r.category,
     r.severity, r.level, r.signal_type,
     ...(Array.isArray(r.tags) ? r.tags : [])].join(' ')
  );
}

function graphNodeTokens(n) {
  return tokens(
    [n.label, n.name, n.type, n.category, n.description,
     ...(Array.isArray(n.tags) ? n.tags : [])].join(' ')
  );
}

function score(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const a = new Set(aToks);
  const b = new Set(bToks);
  let hits = 0;
  for (const tt of a) if (b.has(tt)) hits++;
  return hits / Math.max(a.size, b.size);
}

// ─── enrichment ───────────────────────────────────────────────────────────────

const THRESHOLD = 0.05;

function enrich(reports, scenarios, riskSignals, graphNodes) {
  return reports.map(report => {
    const rt = reportTokens(report);
    const sMatches = scenarios
      .map(s => ({ s, score: score(rt, scenarioTokens(s)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const rMatches = riskSignals
      .map(r => ({ r, score: score(rt, riskTokens(r)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const gMatches = graphNodes
      .map(n => ({ n, score: score(rt, graphNodeTokens(n)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasS = sMatches.length > 0;
    const hasR = rMatches.length > 0;
    const hasG = gMatches.length > 0;
    const matchCount = (hasS ? 1 : 0) + (hasR ? 1 : 0) + (hasG ? 1 : 0);
    const _class = matchCount === 3
      ? 'COMMANDED'
      : matchCount === 2
      ? 'SCRIPTED'
      : matchCount === 1
      ? 'SIGNALED'
      : 'ADRIFT';
    return { ...report, _class, _sMatches: sMatches, _rMatches: rMatches, _gMatches: gMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildRsgcnScript() {
  const [rpR, scR, rsR, grR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const reports     = normReports(rpR.status === 'fulfilled' ? rpR.value : []);
  const scenarios   = normScenarios(scR.status === 'fulfilled' ? scR.value : []);
  const riskSignals = normRiskSignals(rsR.status === 'fulfilled' ? rsR.value : []);
  const graphNodes  = normGraphNodes(grR.status === 'fulfilled' ? grR.value : []);
  const enriched    = enrich(reports, scenarios, riskSignals, graphNodes);
  const adrift      = enriched.filter(e => e._class === 'ADRIFT').length;
  const commanded   = enriched.filter(e => e._class === 'COMMANDED').length;
  const adriftNames = enriched
    .filter(e => e._class === 'ADRIFT').slice(0, 3)
    .map(e => e.title || e.name || e.id).join(', ');
  return (
    `Report × Scenario × RiskSignal × Graph Strategic Command Network: ${reports.length} reports cross-referenced ` +
    `against ${scenarios.length} scenarios, ${riskSignals.length} risk signals, ${graphNodes.length} graph nodes. ` +
    `${commanded} COMMANDED (all 3 sources); ${adrift} ADRIFT — no scenario, no risk signal, no graph trace ` +
    `(gaps: ${adriftNames || 'none'}).`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const PRP = '#B485FF';
const RED = '#FF4D6D';

const CLASS_COL = {
  COMMANDED: GRN,
  SCRIPTED:  CY,
  SIGNALED:  PRP,
  ADRIFT:    RED,
};

const FILTER_TABS = ['ALL', 'COMMANDED', 'SCRIPTED', 'SIGNALED', 'ADRIFT'];

const SEV_COL = { critical: RED, high: RED, medium: AMB, low: GRN, info: CY };
const STA_COL = { done: GRN, complete: GRN, completed: GRN, open: AMB, active: CY, closed: GRN, pending: AMB };

const BASE = {
  position: 'fixed',
  fontFamily: "'JetBrains Mono', monospace",
  color: '#DCEBF5',
  zIndex: 360,
};

const PANEL = {
  ...BASE,
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(4,8,14,0.92)',
  backdropFilter: 'blur(14px)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

function Tile({ label, value, col }) {
  return (
    <div style={{ flex: '1 1 90px', minWidth: 90, padding: '8px 10px',
      background: 'rgba(41,231,255,0.04)',
      border: `1px solid ${col || CY}33`, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col || CY }}>{value ?? '—'}</div>
      <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Bar({ pct, col }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, borderRadius: 2,
        background: col || CY, transition: 'width 0.4s' }} />
    </div>
  );
}

function Badge({ label, col }) {
  return (
    <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
      border: `1px solid ${col || CY}55`, color: col || CY, letterSpacing: 1 }}>
      {label}
    </span>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportScenarioRiskGraphStrategicCommand() {
  const [open, setOpen]             = useState(false);
  const [reports, setReports]       = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [riskSignals, setRiskSignals] = useState([]);
  const [graphNodes, setGraphNodes] = useState([]);
  const [enriched, setEnriched]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [filter, setFilter]         = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');

  const headers = { Authorization: `Bearer ${API_KEY}` };

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rpR, scR, rsR, grR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`, { headers }).then(r => r.json()),
      ]);
      const rp = normReports(rpR.status === 'fulfilled' ? rpR.value : []);
      const sc = normScenarios(scR.status === 'fulfilled' ? scR.value : []);
      const rs = normRiskSignals(rsR.status === 'fulfilled' ? rsR.value : []);
      const gn = normGraphNodes(grR.status === 'fulfilled' ? grR.value : []);
      setReports(rp); setScenarios(sc); setRiskSignals(rs); setGraphNodes(gn);
      setEnriched(enrich(rp, sc, rs, gn));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:rsgcn-toggle', handler);
    return () => window.removeEventListener('jarvis:rsgcn-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90_000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  const adrift    = enriched.filter(e => e._class === 'ADRIFT').length;
  const commanded = enriched.filter(e => e._class === 'COMMANDED').length;
  const scripted  = enriched.filter(e => e._class === 'SCRIPTED').length;
  const signaled  = enriched.filter(e => e._class === 'SIGNALED').length;

  const visible = enriched.filter(e => {
    if (filter !== 'ALL' && e._class !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [e.title, e.name, e.description, e.type, e.subject, e.id]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const handleAssess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const prompt =
        `Report × Scenario × RiskSignal × Graph Strategic Command Network: ${reports.length} reports, ` +
        `${scenarios.length} scenarios, ${riskSignals.length} risk signals, ${graphNodes.length} graph nodes. ` +
        `${commanded} COMMANDED, ${scripted} SCRIPTED, ${signaled} SIGNALED, ${adrift} ADRIFT. ` +
        `Top adrift reports: ${enriched.filter(e => e._class === 'ADRIFT')
          .slice(0, 3).map(e => e.title || e.name || e.id).join(', ') || 'none'}. ` +
        `Provide a 2-sentence strategic intelligence brief on command coverage gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const text = res.response || res.content || res.message || res.text || '';
      setAssessText(text);
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessText('Assessment unavailable: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report × Scenario × RiskSignal × Graph Strategic Command Network (RSGCN)"
        style={{
          ...BASE,
          left: 195640, bottom: 18, padding: '4px 10px',
          background: 'rgba(4,8,14,0.75)',
          border: `1px solid ${adrift > 0 ? RED : CY}55`,
          borderRadius: 6, cursor: 'pointer', fontSize: 11,
          color: adrift > 0 ? RED : CY,
          boxShadow: adrift > 0 ? `0 0 12px ${RED}33` : 'none',
        }}
      >
        ◈ RSGCN{adrift > 0 && (
          <span style={{ marginLeft: 5, background: RED, color: '#fff',
            borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
            {adrift}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      {/* header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${CY}22`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          ◈ REPORT × SCENARIO × RISK SIGNAL × GRAPH STRATEGIC COMMAND
        </span>
        {adrift > 0 && (
          <span style={{ background: RED, color: '#fff', borderRadius: 8,
            padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
            {adrift} ADRIFT
          </span>
        )}
        {loading && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6E8AA0' }}>loading…</span>}
        {error && <span style={{ marginLeft: 'auto', fontSize: 10, color: RED }}>{error}</span>}
        <button onClick={() => setOpen(false)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none',
            color: '#6E8AA0', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 18px',
        flexShrink: 0, borderBottom: `1px solid ${CY}11` }}>
        <Tile label="REPORTS"      value={reports.length}     col={CY} />
        <Tile label="SCENARIOS"    value={scenarios.length}   col={CY} />
        <Tile label="RISK SIGNALS" value={riskSignals.length} col={AMB} />
        <Tile label="GRAPH NODES"  value={graphNodes.length}  col={PRP} />
        <Tile label="COMMANDED"    value={commanded}          col={GRN} />
        <Tile label="SCRIPTED"     value={scripted}           col={CY} />
        <Tile label="SIGNALED"     value={signaled}           col={PRP} />
        <Tile label="ADRIFT"       value={adrift}             col={RED} />
      </div>

      {/* filter + search */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 18px', flexShrink: 0,
        flexWrap: 'wrap', borderBottom: `1px solid ${CY}11` }}>
        {FILTER_TABS.map(tab => (
          <button key={tab} onClick={() => setFilter(tab)}
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              background: filter === tab ? CY : 'rgba(41,231,255,0.05)',
              color: filter === tab ? '#04060A' : CY,
              border: `1px solid ${CY}44`, fontFamily: 'inherit', letterSpacing: 1 }}>
            {tab}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(41,231,255,0.05)',
            border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
            fontFamily: 'inherit', fontSize: 11, outline: 'none', minWidth: 160 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', padding: 40, fontSize: 12 }}>
            No reports match current filter.
          </div>
        )}
        {visible.map((report, i) => {
          const col   = CLASS_COL[report._class] || CY;
          const rowId = report.id || report.report_id || i;
          const isExp = expanded === rowId;
          return (
            <div key={rowId}
              style={{ marginBottom: 6, border: `1px solid ${col}22`, borderRadius: 8,
                background: 'rgba(4,8,14,0.5)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : rowId)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 100 }}>
                  {report._class}
                </span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {report.title || report.name || report.subject || report.id || '—'}
                </span>
                {report.type && <Badge label={report.type.toUpperCase()} col={CY} />}
                <span style={{ color: '#6E8AA0', fontSize: 10, marginLeft: 4 }}>
                  {report._sMatches.length}S · {report._rMatches.length}R · {report._gMatches.length}G
                </span>
                <span style={{ color: '#6E8AA0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: `1px solid ${col}22` }}>
                  {report.description && (
                    <div style={{ fontSize: 11, color: '#8AAABB', padding: '6px 0' }}>
                      {report.description}
                    </div>
                  )}

                  {/* matched scenarios */}
                  {report._sMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED SCENARIOS ({report._sMatches.length})
                      </div>
                      {report._sMatches.map((m, si) => {
                        const sta = (m.s.status || '').toLowerCase();
                        return (
                          <div key={si} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                              {sta && <Badge label={sta.toUpperCase()} col={STA_COL[sta] || CY} />}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.s.name || m.s.title || m.s.id}
                              </span>
                              <span style={{ fontSize: 10, color: CY }}>
                                {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <Bar pct={m.score} col={CY} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* matched risk signals */}
                  {report._rMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED RISK SIGNALS ({report._rMatches.length})
                      </div>
                      {report._rMatches.map((m, ri) => {
                        const sev = (m.r.severity || m.r.level || '').toLowerCase();
                        return (
                          <div key={ri} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                              {sev && <Badge label={sev.toUpperCase()} col={SEV_COL[sev] || AMB} />}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.r.name || m.r.title || m.r.id}
                              </span>
                              <span style={{ fontSize: 10, color: AMB }}>
                                {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <Bar pct={m.score} col={AMB} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* matched graph nodes */}
                  {report._gMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: PRP, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED GRAPH NODES ({report._gMatches.length})
                      </div>
                      {report._gMatches.map((m, gi) => (
                        <div key={gi} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            {m.n.centrality != null && (
                              <Badge label={`c:${m.n.centrality.toFixed ? m.n.centrality.toFixed(2) : m.n.centrality}`} col={PRP} />
                            )}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' }}>
                              {m.n.label || m.n.name || m.n.id}
                            </span>
                            <span style={{ fontSize: 10, color: PRP }}>
                              {Math.round(m.score * 100)}%
                            </span>
                          </div>
                          <Bar pct={m.score} col={PRP} />
                        </div>
                      ))}
                    </div>
                  )}

                  {report._sMatches.length === 0 && report._rMatches.length === 0 && report._gMatches.length === 0 && (
                    <div style={{ fontSize: 11, color: RED, padding: '6px 0' }}>
                      No scenario, risk signal, or graph node references this report — strategic blind spot.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess footer */}
      <div style={{ padding: '10px 18px', borderTop: `1px solid ${CY}22`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleAssess} disabled={assessing}
          style={{ padding: '5px 14px', background: 'none', border: `1px solid ${CY}66`,
            borderRadius: 5, color: CY, cursor: assessing ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 11 }}>
          {assessing ? '⋯ assessing…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 11, color: '#AABBC8', flex: 1 }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
