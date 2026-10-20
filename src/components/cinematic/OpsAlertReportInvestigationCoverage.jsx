/**
 * OpsAlertReportInvestigationCoverage — F79
 *
 * Fetches /v1/ops/alerts + /v1/reports + /v1/investigations
 * Keyword-matches each ops alert against reports (documentation trail) AND
 * investigations (follow-through) to classify:
 *   COVERED       — alert matched a report AND an investigation (fully tracked)
 *   FILED         — alert matched report only (documented, not investigated)
 *   TRACKED       — alert matched investigation only (being worked, not reported)
 *   OPEN          — no report and no investigation (alert with no coverage)
 *
 * Toggle: ◈ ORICOV button (fixed, bottom strip) left:92600, zIndex:176
 * Stat tiles: alerts / reports / investigations / covered / filed / tracked / open
 * Red pulse on OPEN count (uncovered alerts).
 * Expandable rows: matched reports with date badge + matched investigations with status badge.
 * Filter tabs: ALL / COVERED / FILED / TRACKED / OPEN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "oricov"/"ops incident coverage"/"alert coverage"/"incident chain"/
 *        "open alerts"/"uncovered alerts"/"alert report"/"ops investigation"/
 *        "incident coverage chain"/"alert documentation"/"ops report coverage"
 * Event: jarvis:oricov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'FILED', 'TRACKED', 'OPEN'];

const CLS_COLOR = {
  COVERED: '#00FF88',
  FILED:   '#38BDF8',
  TRACKED: '#A78BFA',
  OPEN:    '#FF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isOricovQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'oricov', 'ops incident coverage', 'alert coverage', 'incident chain',
    'open alerts', 'uncovered alerts', 'alert report', 'ops investigation',
    'incident coverage chain', 'alert documentation', 'ops report coverage',
  ].some(k => s.includes(k));
}

export function buildOricovScript() {
  return `Fetch /v1/ops/alerts, /v1/reports, and /v1/investigations. ` +
    `Keyword-match each ops alert against reports AND investigations. ` +
    `Classify each alert as COVERED/FILED/TRACKED/OPEN. ` +
    `Report total OPEN (alerts with no documentation trail and no investigation), ` +
    `identify which alert types are falling through the coverage chain, ` +
    `and recommend which reports or investigations should be created ` +
    `to close incident coverage gaps.`;
}

export default function OpsAlertReportInvestigationCoverage() {
  const [open, setOpen]           = useState(false);
  const [alerts, setAlerts]       = useState([]);
  const [reports, setReports]     = useState([]);
  const [invests, setInvests]     = useState([]);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef                  = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [aRes, rRes, iRes] = await Promise.all([
        fetch(`${API}/v1/ops/alerts`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/v1/reports`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/v1/investigations`, { headers: hdrs }).catch(() => null),
      ]);

      const aJson = aRes?.ok ? await aRes.json().catch(() => ({})) : {};
      const rJson = rRes?.ok ? await rRes.json().catch(() => ({})) : {};
      const iJson = iRes?.ok ? await iRes.json().catch(() => ({})) : {};

      const rawAlerts = normalizeArray(aJson, ['alerts', 'data', 'items', 'results', 'events', 'ops_alerts']);
      const rawReports = normalizeArray(rJson, ['reports', 'data', 'items', 'results']);
      const rawInvests = normalizeArray(iJson, ['investigations', 'data', 'items', 'results', 'cases']);

      setAlerts(rawAlerts);
      setReports(rawReports);
      setInvests(rawInvests);

      const built = rawAlerts.map((alert, idx) => {
        const alertLabel = alert.title || alert.name || alert.message || alert.id || alert.alert_type || `Alert-${idx}`;
        const aToks = tokens([
          alertLabel,
          alert.type, alert.category, alert.service, alert.severity,
          alert.description, alert.source, alert.tags,
        ].join(' '));

        const matchedReports = rawReports.filter(r =>
          overlaps(aToks, [
            r.title, r.name, r.id, r.type, r.category,
            r.description, r.tags, r.summary, r.subject,
          ].join(' '))
        ).slice(0, 5);

        const matchedInvests = rawInvests.filter(inv =>
          overlaps(aToks, [
            inv.title, inv.name, inv.id, inv.type, inv.category,
            inv.description, inv.tags, inv.summary, inv.subject,
          ].join(' '))
        ).slice(0, 5);

        const hasReport = matchedReports.length > 0;
        const hasInvest = matchedInvests.length > 0;
        const cls = hasReport && hasInvest ? 'COVERED'
                  : hasReport              ? 'FILED'
                  : hasInvest             ? 'TRACKED'
                  : 'OPEN';

        return { alertLabel, alert, cls, matchedReports, matchedInvests };
      });

      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:oricov-toggle', handler);
    return () => window.removeEventListener('jarvis:oricov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    const counts = {
      COVERED: rows.filter(r => r.cls === 'COVERED').length,
      FILED:   rows.filter(r => r.cls === 'FILED').length,
      TRACKED: rows.filter(r => r.cls === 'TRACKED').length,
      OPEN:    rows.filter(r => r.cls === 'OPEN').length,
    };
    const prompt = `Ops Alert × Report × Investigation Incident Coverage Chain: ${alerts.length} alerts, ${reports.length} reports, ${invests.length} investigations. COVERED:${counts.COVERED} FILED:${counts.FILED} TRACKED:${counts.TRACKED} OPEN:${counts.OPEN}. Identify the most critical coverage gap and recommend an immediate action to ensure open alerts are documented and investigated.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json().catch(() => ({}));
      const text = j.response || j.message || j.text || j.content || 'Assessment complete.';
      setAssessment(text);
      if (text) {
        fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 300) }),
        }).catch(() => {});
      }
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  }, [rows, alerts, reports, invests]);

  const counts = {
    COVERED: rows.filter(r => r.cls === 'COVERED').length,
    FILED:   rows.filter(r => r.cls === 'FILED').length,
    TRACKED: rows.filter(r => r.cls === 'TRACKED').length,
    OPEN:    rows.filter(r => r.cls === 'OPEN').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search && !r.alertLabel.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Alert × Report × Investigation Incident Coverage Chain"
        style={{
          position: 'fixed', bottom: 8, left: 92600, zIndex: 176,
          background: 'rgba(0,20,40,0.85)', border: '1px solid #FF4444',
          color: '#FF4444', fontFamily: 'monospace', fontSize: 10,
          padding: '3px 7px', cursor: 'pointer', borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        ◈ ORICOV
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 176,
      background: 'rgba(0,6,18,0.97)', color: '#E2E8F0',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #1e3a5f' }}>
        <span style={{ color: '#FF4444', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ ORICOV</span>
        <span style={{ color: '#64748B', fontSize: 11 }}>Ops Alert × Report × Investigation Incident Coverage Chain</span>
        <div style={{ flex: 1 }} />
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#1e3a5f' : '#0f3460', border: '1px solid #38BDF8',
          color: '#38BDF8', fontFamily: 'monospace', fontSize: 10, padding: '3px 10px',
          cursor: assessing ? 'wait' : 'pointer', borderRadius: 3,
        }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={fetchData} disabled={loading} style={{
          background: 'none', border: '1px solid #334155', color: '#94A3B8',
          fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', cursor: 'pointer', borderRadius: 3,
        }}>⟳ REFRESH</button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: '1px solid #334155', color: '#94A3B8',
          fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer', borderRadius: 3,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {[
          ['ALERTS',       alerts.length,   '#94A3B8'],
          ['REPORTS',      reports.length,  '#38BDF8'],
          ['INVEST.',      invests.length,  '#A78BFA'],
          ['COVERED',      counts.COVERED,  CLS_COLOR.COVERED],
          ['FILED',        counts.FILED,    CLS_COLOR.FILED],
          ['TRACKED',      counts.TRACKED,  CLS_COLOR.TRACKED],
          ['OPEN',         counts.OPEN,     CLS_COLOR.OPEN],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: 'rgba(0,20,40,0.7)', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '5px 12px', textAlign: 'center', minWidth: 70,
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700,
              animation: label === 'OPEN' && val > 0 ? 'pulse-red 1.5s ease-in-out infinite' : 'none' }}>
              {loading ? '…' : val}
            </div>
            <div style={{ color: '#64748B', fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{ padding: '8px 16px', background: 'rgba(56,189,248,0.06)', borderBottom: '1px solid #1e3a5f', fontSize: 11, color: '#CBD5E1', lineHeight: 1.5 }}>
          <span style={{ color: '#38BDF8', fontWeight: 700, marginRight: 6 }}>◈ ASSESSMENT:</span>
          {assessment}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid #1e3a5f', alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (CLS_COLOR[t] || '#1e3a5f') : 'rgba(0,20,40,0.7)',
            border: `1px solid ${CLS_COLOR[t] || '#334155'}`,
            color: tab === t ? '#000' : (CLS_COLOR[t] || '#94A3B8'),
            fontFamily: 'monospace', fontSize: 10, padding: '3px 10px',
            cursor: 'pointer', borderRadius: 3, fontWeight: tab === t ? 700 : 400,
          }}>
            {t}{t !== 'ALL' ? ` (${counts[t] ?? ''})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{
            background: 'rgba(0,20,40,0.8)', border: '1px solid #334155', color: '#E2E8F0',
            fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', borderRadius: 3,
            outline: 'none', marginLeft: 8, width: 180,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {error && <div style={{ color: '#FF4444', fontSize: 11, marginBottom: 8 }}>Error: {error}</div>}
        {loading && rows.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>Loading incident coverage data…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>No alerts match current filter.</div>
        )}
        {visible.map((r, i) => {
          const key = r.alertLabel + i;
          const isExp = !!expanded[key];
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggleRow(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  background: 'rgba(0,20,40,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`,
                  borderRadius: 4, padding: '5px 10px',
                  borderLeft: `3px solid ${CLS_COLOR[r.cls]}`,
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 9, fontWeight: 700, minWidth: 58 }}>{r.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1 }}>{r.alertLabel}</span>
                {r.alert.severity && (
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 2,
                    background: r.alert.severity === 'critical' ? '#FF444433' : r.alert.severity === 'high' ? '#FF990033' : '#33333355',
                    color: r.alert.severity === 'critical' ? '#FF4444' : r.alert.severity === 'high' ? '#FF9900' : '#94A3B8',
                  }}>{r.alert.severity}</span>
                )}
                <span style={{ color: '#38BDF8', fontSize: 9 }}>{r.matchedReports.length} reports</span>
                <span style={{ color: '#A78BFA', fontSize: 9 }}>{r.matchedInvests.length} invest.</span>
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ background: 'rgba(0,10,30,0.7)', border: '1px solid #1e3a5f', borderRadius: '0 0 4px 4px', padding: '8px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#38BDF8', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED REPORTS</div>
                    {r.matchedReports.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedReports.map((rep, ri) => (
                        <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{rep.title || rep.name || rep.id || '(report)'}</span>
                          {(rep.date || rep.created_at) && (
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, background: '#38BDF833', color: '#38BDF8' }}>
                              {(rep.date || rep.created_at || '').slice(0, 10)}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#A78BFA', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED INVESTIGATIONS</div>
                    {r.matchedInvests.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedInvests.map((inv, ii) => (
                        <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{inv.title || inv.name || inv.id || '(investigation)'}</span>
                          {inv.status && (
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, background: '#A78BFA33', color: '#A78BFA' }}>
                              {inv.status}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-red {
          0%,100% { opacity:1; }
          50% { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}
