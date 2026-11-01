/**
 * F263 — Ops Alert × Dataset × Investigation × Brain Operational Evidence Continuity Chain
 * ◈ OADIBC
 *
 * For each ops alert, cross-references it against datasets, investigations, and brain nodes
 * to assess whether the alert has evidence grounding, active investigation, and a model.
 *
 * GROUNDED  — brain model + dataset + investigation all present.
 * SUPPORTED — at least two of three sources match.
 * TRACKED   — only one source matches.
 * BLIND     — no dataset, no investigation, no brain node — fully ungrounded alert.
 *
 * Data sources (real endpoints):
 *   GET /v1/ops/alerts          → operational alerts
 *   GET /v1/datasets            → data catalog
 *   GET /v1/investigations      → open/closed cases
 *   GET /v1/cinematic/brain     → brain graph stats + nodes
 *
 * Stat tiles:  alerts / datasets / investigations / brain nodes /
 *              grounded / supported / tracked / blind
 * Red badge:   blind count on button.
 * Expand row:  matched datasets with row-count badge + relevance bar
 *              + matched investigations with status badge
 *              + matched brain nodes with centrality score badge.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ OADIBC at left:195080 bottom:18, zIndex:359.
 * Event:   jarvis:oadibc-toggle
 * Voice:   "ops evidence chain / oadibc / blind alerts / evidence continuity /
 *           ungrounded alerts / alert evidence / operational continuity /
 *           alert dataset brain / alert investigation grounding"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const OADIBC_RE =
  /\b(ops[._-]?evidence[._-]?chain|oadibc|blind[._-]?alerts?|evidence[._-]?continuity|ungrounded[._-]?alerts?|alert[._-]?evidence|operational[._-]?continuity|alert[._-]?dataset[._-]?brain|alert[._-]?investigation[._-]?grounding)\b/i;

export function isOadibcQuery(t) {
  return OADIBC_RE.test(t || '');
}

// ─── normalisers ─────────────────────────────────────────────────────────────

function normAlerts(raw) {
  if (!raw) return [];
  for (const k of ['alerts', 'ops_alerts', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normDatasets(raw) {
  if (!raw) return [];
  for (const k of ['datasets', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normInvestigations(raw) {
  if (!raw) return [];
  for (const k of ['investigations', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normBrainNodes(raw) {
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

function alertTokens(a) {
  return tokens(
    [a.title, a.name, a.message, a.description, a.type, a.category,
     a.severity, a.service, a.source,
     ...(Array.isArray(a.tags) ? a.tags : [])].join(' ')
  );
}

function datasetTokens(d) {
  return tokens(
    [d.name, d.title, d.description, d.category, d.type, d.source,
     ...(Array.isArray(d.tags) ? d.tags : [])].join(' ')
  );
}

function investTokens(inv) {
  return tokens(
    [inv.name, inv.title, inv.description, inv.type, inv.category,
     inv.status, inv.priority,
     ...(Array.isArray(inv.tags) ? inv.tags : [])].join(' ')
  );
}

function brainNodeTokens(n) {
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

function enrich(alerts, datasets, investigations, brainNodes) {
  return alerts.map(alert => {
    const at = alertTokens(alert);
    const dMatches = datasets
      .map(d => ({ d, score: score(at, datasetTokens(d)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const iMatches = investigations
      .map(inv => ({ inv, score: score(at, investTokens(inv)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const bMatches = brainNodes
      .map(n => ({ n, score: score(at, brainNodeTokens(n)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasD = dMatches.length > 0;
    const hasI = iMatches.length > 0;
    const hasB = bMatches.length > 0;
    const matchCount = (hasD ? 1 : 0) + (hasI ? 1 : 0) + (hasB ? 1 : 0);
    const _class = matchCount === 3
      ? 'GROUNDED'
      : matchCount === 2
      ? 'SUPPORTED'
      : matchCount === 1
      ? 'TRACKED'
      : 'BLIND';
    return { ...alert, _class, _dMatches: dMatches, _iMatches: iMatches, _bMatches: bMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildOadibcScript() {
  const [aR, dR, iR, bR] = await Promise.allSettled([
    fetch(`${API}/v1/ops/alerts`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/cinematic/brain`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const alerts       = normAlerts(aR.status === 'fulfilled' ? aR.value : []);
  const datasets     = normDatasets(dR.status === 'fulfilled' ? dR.value : []);
  const investigations = normInvestigations(iR.status === 'fulfilled' ? iR.value : []);
  const brainNodes   = normBrainNodes(bR.status === 'fulfilled' ? bR.value : []);
  const enriched     = enrich(alerts, datasets, investigations, brainNodes);
  const blind        = enriched.filter(e => e._class === 'BLIND').length;
  const grounded     = enriched.filter(e => e._class === 'GROUNDED').length;
  const blindNames   = enriched
    .filter(e => e._class === 'BLIND').slice(0, 3)
    .map(e => e.title || e.name || e.id).join(', ');
  return (
    `Ops Alert × Dataset × Investigation × Brain Continuity: ${alerts.length} alerts cross-referenced ` +
    `against ${datasets.length} datasets, ${investigations.length} investigations, ${brainNodes.length} brain nodes. ` +
    `${grounded} GROUNDED (all 3 sources); ${blind} BLIND — no evidence grounding at all ` +
    `(gaps: ${blindNames || 'none'}).`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const PRP = '#B485FF';
const RED = '#FF4D6D';

const CLASS_COL = {
  GROUNDED:  GRN,
  SUPPORTED: CY,
  TRACKED:   PRP,
  BLIND:     RED,
};

const FILTER_TABS = ['ALL', 'GROUNDED', 'SUPPORTED', 'TRACKED', 'BLIND'];

const SEV_COL = { critical: RED, high: RED, medium: AMB, low: GRN, info: CY };
const STA_COL = { done: GRN, complete: GRN, completed: GRN, open: AMB, active: CY, closed: GRN, pending: AMB };

const BASE = {
  position: 'fixed',
  fontFamily: "'JetBrains Mono', monospace",
  color: '#DCEBF5',
  zIndex: 359,
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

export default function OpsAlertDatasetInvestigationBrainContinuity() {
  const [open, setOpen]           = useState(false);
  const [alerts, setAlerts]       = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [invests, setInvests]     = useState([]);
  const [brainNodes, setBrainNodes] = useState([]);
  const [enriched, setEnriched]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const headers = { Authorization: `Bearer ${API_KEY}` };

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [aR, dR, iR, bR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/alerts`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/investigations`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/cinematic/brain`, { headers }).then(r => r.json()),
      ]);
      const a  = normAlerts(aR.status === 'fulfilled' ? aR.value : []);
      const d  = normDatasets(dR.status === 'fulfilled' ? dR.value : []);
      const iv = normInvestigations(iR.status === 'fulfilled' ? iR.value : []);
      const bn = normBrainNodes(bR.status === 'fulfilled' ? bR.value : []);
      setAlerts(a); setDatasets(d); setInvests(iv); setBrainNodes(bn);
      setEnriched(enrich(a, d, iv, bn));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:oadibc-toggle', handler);
    return () => window.removeEventListener('jarvis:oadibc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90_000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  const blind     = enriched.filter(e => e._class === 'BLIND').length;
  const grounded  = enriched.filter(e => e._class === 'GROUNDED').length;
  const supported = enriched.filter(e => e._class === 'SUPPORTED').length;
  const tracked   = enriched.filter(e => e._class === 'TRACKED').length;

  const visible = enriched.filter(e => {
    if (filter !== 'ALL' && e._class !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [e.title, e.name, e.message, e.description, e.type, e.severity, e.id]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const handleAssess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const prompt =
        `Ops Alert × Dataset × Investigation × Brain Continuity: ${alerts.length} alerts, ` +
        `${datasets.length} datasets, ${invests.length} investigations, ${brainNodes.length} brain nodes. ` +
        `${grounded} GROUNDED, ${supported} SUPPORTED, ${tracked} TRACKED, ${blind} BLIND. ` +
        `Top blind alerts: ${enriched.filter(e => e._class === 'BLIND')
          .slice(0, 3).map(e => e.title || e.name || e.id).join(', ') || 'none'}. ` +
        `Provide a 2-sentence operational intelligence brief on evidence continuity gaps.`;
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
        title="Ops Alert × Dataset × Investigation × Brain Continuity (OADIBC)"
        style={{
          ...BASE,
          left: 195080, bottom: 18, padding: '4px 10px',
          background: 'rgba(4,8,14,0.75)',
          border: `1px solid ${blind > 0 ? RED : CY}55`,
          borderRadius: 6, cursor: 'pointer', fontSize: 11,
          color: blind > 0 ? RED : CY,
          boxShadow: blind > 0 ? `0 0 12px ${RED}33` : 'none',
        }}
      >
        ◈ OADIBC{blind > 0 && (
          <span style={{ marginLeft: 5, background: RED, color: '#fff',
            borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
            {blind}
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
          ◈ OPS ALERT × DATASET × INVESTIGATION × BRAIN CONTINUITY
        </span>
        {blind > 0 && (
          <span style={{ background: RED, color: '#fff', borderRadius: 8,
            padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
            {blind} BLIND
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
        <Tile label="ALERTS"       value={alerts.length}   col={CY} />
        <Tile label="DATASETS"     value={datasets.length} col={CY} />
        <Tile label="INVEST."      value={invests.length}  col={CY} />
        <Tile label="BRAIN NODES"  value={brainNodes.length} col={PRP} />
        <Tile label="GROUNDED"     value={grounded}        col={GRN} />
        <Tile label="SUPPORTED"    value={supported}       col={CY} />
        <Tile label="TRACKED"      value={tracked}         col={PRP} />
        <Tile label="BLIND"        value={blind}           col={RED} />
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
          placeholder="search alerts…"
          style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(41,231,255,0.05)',
            border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
            fontFamily: 'inherit', fontSize: 11, outline: 'none', minWidth: 160 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', padding: 40, fontSize: 12 }}>
            No alerts match current filter.
          </div>
        )}
        {visible.map((alert, i) => {
          const col   = CLASS_COL[alert._class] || CY;
          const rowId = alert.id || alert.alert_id || i;
          const isExp = expanded === rowId;
          const sev   = (alert.severity || alert.level || '').toLowerCase();
          return (
            <div key={rowId}
              style={{ marginBottom: 6, border: `1px solid ${col}22`, borderRadius: 8,
                background: 'rgba(4,8,14,0.5)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : rowId)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 90 }}>
                  {alert._class}
                </span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {alert.title || alert.name || alert.message || alert.id || '—'}
                </span>
                {sev && <Badge label={sev.toUpperCase()} col={SEV_COL[sev] || AMB} />}
                <span style={{ color: '#6E8AA0', fontSize: 10, marginLeft: 4 }}>
                  {alert._dMatches.length}D · {alert._iMatches.length}I · {alert._bMatches.length}B
                </span>
                <span style={{ color: '#6E8AA0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: `1px solid ${col}22` }}>
                  {alert.description && (
                    <div style={{ fontSize: 11, color: '#8AAABB', padding: '6px 0' }}>
                      {alert.description}
                    </div>
                  )}

                  {/* matched datasets */}
                  {alert._dMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED DATASETS ({alert._dMatches.length})
                      </div>
                      {alert._dMatches.map((m, di) => (
                        <div key={di} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            {m.d.row_count != null && (
                              <Badge label={`${m.d.row_count} rows`} col={GRN} />
                            )}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' }}>
                              {m.d.name || m.d.title || m.d.id}
                            </span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: GRN }}>
                              {Math.round(m.score * 100)}%
                            </span>
                          </div>
                          <Bar pct={m.score} col={GRN} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* matched investigations */}
                  {alert._iMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: PRP, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED INVESTIGATIONS ({alert._iMatches.length})
                      </div>
                      {alert._iMatches.map((m, ii) => {
                        const sta = (m.inv.status || '').toLowerCase();
                        return (
                          <div key={ii} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                              {sta && <Badge label={sta.toUpperCase()} col={STA_COL[sta] || CY} />}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.inv.name || m.inv.title || m.inv.id}
                              </span>
                              <span style={{ fontSize: 10, color: PRP }}>
                                {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <Bar pct={m.score} col={PRP} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* matched brain nodes */}
                  {alert._bMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED BRAIN NODES ({alert._bMatches.length})
                      </div>
                      {alert._bMatches.map((m, bi) => (
                        <div key={bi} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            {m.n.centrality != null && (
                              <Badge label={`c:${m.n.centrality.toFixed ? m.n.centrality.toFixed(2) : m.n.centrality}`} col={AMB} />
                            )}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' }}>
                              {m.n.label || m.n.name || m.n.id}
                            </span>
                            <span style={{ fontSize: 10, color: AMB }}>
                              {Math.round(m.score * 100)}%
                            </span>
                          </div>
                          <Bar pct={m.score} col={AMB} />
                        </div>
                      ))}
                    </div>
                  )}

                  {alert._dMatches.length === 0 && alert._iMatches.length === 0 && alert._bMatches.length === 0 && (
                    <div style={{ fontSize: 11, color: RED, padding: '6px 0' }}>
                      No dataset, investigation, or brain node references this alert — full blind spot.
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
