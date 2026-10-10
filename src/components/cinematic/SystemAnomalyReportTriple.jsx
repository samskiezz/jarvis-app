/**
 * F264 — System Status × Anomaly × Report Triple (SART)
 *
 * Answers: "Which active anomalies have report documentation AND map to a
 * degraded service — and which are completely dark?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/jarvis/system/status  → live service health
 *   GET /v1/jarvis/analytics/anomalies → active metric anomalies
 *   GET /v1/reports               → report catalog
 *
 * Each anomaly is correlated against:
 *   1. System services (by metric/name token matching) → AFFECTED service?
 *   2. Reports (by metric/description/tags)            → REPORTED?
 *
 * Classification:
 *   REPORTED+AFFECTED — anomaly has both a covering report AND a linked degraded service
 *   REPORTED_ONLY     — has a report but no service mapping found
 *   AFFECTED_ONLY     — maps to a degraded service but no report covers it
 *   BLIND             — no report, no service match (highest priority gap)
 *
 * Stat tiles:  anomalies / services / reports / blind
 * Red badge:   blind count on button.
 * Expand row:  matched services + matched reports with relevance bars.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SART  at left:5580 bottom:18, zIndex:68.
 * Event:   jarvis:sart-toggle
 * Voice:   "system anomaly report / sart / anomaly report / service report anomaly /
 *           which anomalies have reports / anomaly service report / report anomaly coverage"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const SART_RE =
  /\b(system[._-]?anomal[._-]?report|sart|anomal[._-]?report|service[._-]?report[._-]?anomal|which[._-]?anomal[._-]?have[._-]?report|anomal[._-]?service[._-]?report|report[._-]?anomal[._-]?coverage|anomal[._-]?coverage[._-]?report)\b/i;

export function isSartQuery(t) {
  return SART_RE.test(t || '');
}

export async function buildSartScript() {
  const [sysR, anR, repR] = await Promise.allSettled([
    fetch(`${API}/v1/jarvis/system/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/jarvis/analytics/anomalies?limit=40`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const services = normServices(sysR.status === 'fulfilled' ? sysR.value : {});
  const anomalies = normAnomalies(anR.status === 'fulfilled' ? anR.value : []);
  const reports = normReports(repR.status === 'fulfilled' ? repR.value : []);
  const enriched = enrich(anomalies, services, reports);
  const blind = enriched.filter(a => a._class === 'BLIND').length;
  const repAff = enriched.filter(a => a._class === 'REPORTED_AFFECTED').length;
  return (
    `System × Anomaly × Report: ${anomalies.length} anomalies, ${services.length} services, ${reports.length} reports. ` +
    `${repAff} anomalies are fully covered (reported + service-linked); ${blind} are BLIND (no report, no service match). ` +
    `Top blind: ${enriched.filter(a => a._class === 'BLIND').slice(0, 3).map(a => a.metric || a.name || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────

function normServices(raw) {
  if (!raw) return [];
  const svcMap = raw.services || raw.service_health || raw.components || raw.checks || {};
  if (typeof svcMap === 'object' && !Array.isArray(svcMap)) {
    return Object.entries(svcMap).map(([name, val]) => {
      const status =
        typeof val === 'object'
          ? (val.status || val.state || 'UNKNOWN').toUpperCase()
          : String(val).toUpperCase();
      return { name, status, description: typeof val === 'object' ? (val.message || val.description || '') : '' };
    });
  }
  if (Array.isArray(svcMap)) {
    return svcMap.map(s => ({
      name: s.name || s.service || s.id || '?',
      status: (s.status || s.state || 'UNKNOWN').toUpperCase(),
      description: s.message || s.description || '',
    }));
  }
  return [];
}

function normAnomalies(raw) {
  if (!raw) return [];
  for (const k of ['anomalies', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normReports(raw) {
  if (!raw) return [];
  for (const k of ['reports', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── token helpers ────────────────────────────────────────────────────────────

function toks(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function anomToks(a) {
  return new Set([
    ...toks(a.metric),
    ...toks(a.metric_name),
    ...toks(a.name),
    ...toks(a.description),
    ...toks(a.source),
    ...toks(a.component),
  ]);
}

function svcScore(anomaly, service) {
  const at = anomToks(anomaly);
  const st = new Set([...toks(service.name), ...toks(service.description)]);
  if (!at.size || !st.size) return 0;
  let hits = 0;
  for (const t of at) if (st.has(t)) hits++;
  return hits / Math.max(at.size, st.size);
}

function repScore(anomaly, report) {
  const at = anomToks(anomaly);
  const rt = new Set([
    ...toks(report.title),
    ...toks(report.name),
    ...toks(report.description),
    ...toks(report.summary),
    ...toks(report.type),
    ...toks(report.category),
    ...(Array.isArray(report.tags) ? report.tags.flatMap(toks) : toks(report.tags)),
  ]);
  if (!at.size || !rt.size) return 0;
  let hits = 0;
  for (const t of at) if (rt.has(t)) hits++;
  return hits / Math.max(at.size, rt.size);
}

// ─── enrichment ──────────────────────────────────────────────────────────────

function enrich(anomalies, services, reports) {
  const degraded = services.filter(s =>
    ['DOWN', 'DEGRADED', 'UNHEALTHY', 'ERROR', 'FAILED', 'CRITICAL', 'WARNING'].includes(s.status)
  );

  return anomalies.map(a => {
    const svcMatches = degraded
      .map(s => ({ svc: s, score: svcScore(a, s) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const repMatches = reports
      .map(r => ({ rep: r, score: repScore(a, r) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const hasService = svcMatches.length > 0;
    const hasReport = repMatches.length > 0;
    const _class =
      hasReport && hasService
        ? 'REPORTED_AFFECTED'
        : hasReport
        ? 'REPORTED_ONLY'
        : hasService
        ? 'AFFECTED_ONLY'
        : 'BLIND';
    return { ...a, _class, _svcMatches: svcMatches, _repMatches: repMatches };
  });
}

// ─── constants ────────────────────────────────────────────────────────────────

const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const MU = '#6E8AA0';
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const CLASS_COLOR = {
  REPORTED_AFFECTED: GR,
  REPORTED_ONLY: CY,
  AFFECTED_ONLY: AM,
  BLIND: RD,
};

const SEVERITY_COLOR = {
  HIGH: RD,
  CRITICAL: RD,
  MEDIUM: AM,
  LOW: GR,
  INFO: CY,
};

const chip = (label, color = CY) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 4,
      border: `1px solid ${color}44`,
      background: `${color}14`,
      color,
      fontSize: 10,
      letterSpacing: 1,
      marginRight: 4,
    }}
  >
    {label}
  </span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div
      style={{
        width: 60,
        height: 4,
        background: '#1a2535',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.round(score * 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
        }}
      />
    </div>
    <span style={{ color: MU, fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

// ─── component ───────────────────────────────────────────────────────────────

export default function SystemAnomalyReportTriple() {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sysR, anR, repR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/jarvis/analytics/anomalies?limit=40`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      setServices(normServices(sysR.status === 'fulfilled' ? sysR.value : {}));
      setAnomalies(normAnomalies(anR.status === 'fulfilled' ? anR.value : []));
      setReports(normReports(repR.status === 'fulfilled' ? repR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sart-toggle', onToggle);
    return () => window.removeEventListener('jarvis:sart-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 60_000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = enrich(anomalies, services, reports);
  const blind = enriched.filter(a => a._class === 'BLIND');
  const repAff = enriched.filter(a => a._class === 'REPORTED_AFFECTED');
  const repOnly = enriched.filter(a => a._class === 'REPORTED_ONLY');
  const affOnly = enriched.filter(a => a._class === 'AFFECTED_ONLY');
  const badgeCount = blind.length;

  const TABS = ['ALL', 'REPORTED_AFFECTED', 'REPORTED_ONLY', 'AFFECTED_ONLY', 'BLIND'];

  const filtered = enriched
    .filter(a => tab === 'ALL' || a._class === tab)
    .filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(a.metric || '').toLowerCase().includes(q) ||
        String(a.metric_name || '').toLowerCase().includes(q) ||
        String(a.name || '').toLowerCase().includes(q) ||
        String(a.description || '').toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `System × Anomaly × Report: ${anomalies.length} anomalies across ${services.length} services and ${reports.length} reports. ` +
            `${repAff.length} fully covered (reported+service-linked), ${repOnly.length} report-only, ${affOnly.length} service-only, ${blind.length} BLIND. ` +
            `Top blind anomalies: ${blind.slice(0, 3).map(a => a.metric || a.name || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence operational intelligence brief identifying the key coverage gap and highest-priority blind anomaly.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setBrief('Agent unavailable.');
    }
    setAssessing(false);
  }

  const anomLabel = a => a.metric || a.metric_name || a.name || a.id || '?';
  const sevColor = a => {
    const s = (a.severity || a.level || '').toUpperCase();
    return SEVERITY_COLOR[s] || MU;
  };

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="System Status × Anomaly × Report Triple (SART)"
        style={{
          position: 'fixed',
          left: 5580,
          bottom: 18,
          zIndex: 68,
          width: 60,
          height: 22,
          borderRadius: 3,
          border: `1px solid ${badgeCount > 0 ? RD : CY}77`,
          cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)',
          color: badgeCount > 0 ? RD : CY,
          fontSize: 9,
          letterSpacing: 1,
          backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeCount > 0 ? RD : CY}44`,
          fontFamily: MONO,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
        }}
      >
        ◈ SART
        {badgeCount > 0 && (
          <span
            style={{
              background: RD,
              color: '#04060A',
              borderRadius: 3,
              padding: '0 4px',
              fontSize: 8,
              fontWeight: 700,
              minWidth: 14,
              textAlign: 'center',
            }}
          >
            {badgeCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 620,
            maxHeight: '82vh',
            zIndex: 9200,
            background: 'rgba(6,10,18,0.97)',
            border: `1px solid ${CY}33`,
            borderRadius: 12,
            backdropFilter: 'blur(16px)',
            boxShadow: `0 0 60px ${CY}22`,
            fontFamily: MONO,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${CY}22`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: CY,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
                textShadow: `0 0 12px ${CY}`,
              }}
            >
              ◈ SYSTEM × ANOMALY × REPORT
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: MU, fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px',
                  borderRadius: 3,
                  border: `1px solid ${CY}55`,
                  background: 'transparent',
                  color: CY,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 1,
                  fontFamily: MONO,
                }}
              >
                {assessing ? 'assessing…' : '▶ ASSESS'}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: MU,
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ✕
              </button>
            </span>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'ANOMALIES', val: anomalies.length, col: CY },
              { label: 'SERVICES', val: services.length, col: AM },
              { label: 'REPORTS', val: reports.length, col: GR },
              { label: 'BLIND', val: blind.length, col: RD },
            ].map(({ label: l, val, col }) => (
              <div
                key={l}
                style={{
                  flex: 1,
                  background: `${col}0d`,
                  border: `1px solid ${col}33`,
                  borderRadius: 6,
                  padding: '6px 8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: MU, fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* tabs + search */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '0 14px 8px',
              flexShrink: 0,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 1,
                  border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : '#2a3a4a'}`,
                  background: tab === t ? `${CLASS_COLOR[t] || CY}22` : 'transparent',
                  color: tab === t ? (CLASS_COLOR[t] || CY) : MU,
                  fontFamily: MONO,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search anomalies…"
              style={{
                marginLeft: 'auto',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid #2a3a4a',
                borderRadius: 4,
                color: '#DCEBF5',
                padding: '2px 8px',
                fontSize: 10,
                outline: 'none',
                fontFamily: MONO,
                width: 150,
              }}
            />
          </div>

          {/* AI brief */}
          {brief && (
            <div
              style={{
                margin: '0 14px 8px',
                padding: '8px 10px',
                background: `${CY}0d`,
                border: `1px solid ${CY}33`,
                borderRadius: 6,
                color: '#DCEBF5',
                fontSize: 11,
                lineHeight: 1.5,
                flexShrink: 0,
              }}
            >
              {brief}
            </div>
          )}

          {/* anomaly list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No anomalies found.'}
              </div>
            ) : (
              filtered.map((a, i) => {
                const isExp = expanded === i;
                const classCol = CLASS_COLOR[a._class] || MU;
                const sc = sevColor(a);
                return (
                  <div
                    key={a.metric || a.id || i}
                    style={{
                      borderBottom: `1px solid ${CY}11`,
                      paddingBottom: 6,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      onClick={() => setExpanded(isExp ? null : i)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        padding: '4px 0',
                      }}
                    >
                      <span style={{ color: classCol, fontSize: 10, minWidth: 16 }}>
                        {isExp ? '▼' : '▶'}
                      </span>
                      <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1, minWidth: 0 }}>
                        {anomLabel(a)}
                      </span>
                      {chip(a._class.replace('_', ' '), classCol)}
                      {(a.severity || a.level) &&
                        chip((a.severity || a.level).toUpperCase(), sc)}
                      {a.zscore != null && (
                        <span style={{ color: sc, fontSize: 10 }}>
                          z={Number(a.zscore).toFixed(1)}
                        </span>
                      )}
                    </div>

                    {isExp && (
                      <div
                        style={{
                          marginLeft: 22,
                          paddingTop: 6,
                          borderTop: `1px solid ${CY}11`,
                        }}
                      >
                        {/* matched services */}
                        {a._svcMatches.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                              AFFECTED SERVICES
                            </div>
                            {a._svcMatches.map((m, j) => (
                              <div
                                key={j}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 3,
                                }}
                              >
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {m.svc.name}
                                </span>
                                {chip(m.svc.status, ['DOWN','DEGRADED','ERROR','FAILED','CRITICAL'].includes(m.svc.status) ? RD : AM)}
                                {scorebar(m.score, AM)}
                              </div>
                            ))}
                          </div>
                        )}
                        {a._svcMatches.length === 0 && (
                          <div style={{ color: MU, fontSize: 10, marginBottom: 6 }}>
                            No degraded service mapped.
                          </div>
                        )}

                        {/* matched reports */}
                        {a._repMatches.length > 0 && (
                          <div>
                            <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                              COVERING REPORTS
                            </div>
                            {a._repMatches.map((m, j) => (
                              <div
                                key={j}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 3,
                                }}
                              >
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {m.rep.title || m.rep.name || m.rep.id || '?'}
                                </span>
                                {(m.rep.type || m.rep.category) &&
                                  chip(m.rep.type || m.rep.category, GR)}
                                {scorebar(m.score, GR)}
                              </div>
                            ))}
                          </div>
                        )}
                        {a._repMatches.length === 0 && (
                          <div style={{ color: MU, fontSize: 10 }}>
                            No covering report found.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
