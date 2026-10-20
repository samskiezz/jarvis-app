/**
 * ReportRiskSignalGraphWeb — F78
 *
 * Fetches /v1/reports + /entities/RiskSignal + /v1/graph/centrality
 * Keyword-matches each report against risk signals AND graph nodes to classify:
 *   CONNECTED  — report matches a risk signal AND a graph node (fully traced)
 *   SIGNALED   — report matches a risk signal only (threat-linked, not graph-traced)
 *   GRAPHED    — report matches a graph node only (graph-anchored, no threat signal)
 *   ISOLATED   — no risk signal and no graph match (orphaned report)
 *
 * Toggle: ◈ RRGWEB button (fixed, bottom strip) left:92040, zIndex:175
 * Stat tiles: reports / signals / nodes / connected / signaled / graphed / isolated
 * Red pulse on ISOLATED count (orphaned reports).
 * Expandable rows: matched risk signals with severity badge
 *                  + matched graph nodes with centrality score badge.
 * Filter tabs: ALL / CONNECTED / SIGNALED / GRAPHED / ISOLATED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rrgweb"/"report risk graph"/"report intelligence web"/"isolated reports"/
 *        "report graph"/"report signals"/"intelligence web"/"orphaned reports"/
 *        "report threat graph"/"report network"
 * Event: jarvis:rrgweb-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CONNECTED', 'SIGNALED', 'GRAPHED', 'ISOLATED'];

const CLS_COLOR = {
  CONNECTED: '#00FF88',
  SIGNALED:  '#FF4444',
  GRAPHED:   '#38BDF8',
  ISOLATED:  '#FF6B6B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1);
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

export function isRrgwebQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'rrgweb', 'report risk graph', 'report intelligence web', 'isolated reports',
    'report graph', 'report signals', 'intelligence web', 'orphaned reports',
    'report threat graph', 'report network',
  ].some(k => s.includes(k));
}

export function buildRrgwebScript() {
  return `Fetch /v1/reports, /entities/RiskSignal, and /v1/graph/centrality. ` +
    `Keyword-match each report against risk signals AND graph centrality nodes. ` +
    `Classify each report as CONNECTED/SIGNALED/GRAPHED/ISOLATED. ` +
    `Report total ISOLATED (orphaned reports with no threat signal and no graph trace), ` +
    `identify which report domains are unlinked to the threat and graph models, ` +
    `and recommend which risk signals or graph nodes should be created or extended ` +
    `to close intelligence gaps.`;
}

export default function ReportRiskSignalGraphWeb() {
  const [open, setOpen]         = useState(false);
  const [reports, setReports]   = useState([]);
  const [signals, setSignals]   = useState([]);
  const [nodes, setNodes]       = useState([]);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef                = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [rRes, sRes, gRes] = await Promise.all([
        fetch(`${API}/v1/reports`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/entities/RiskSignal`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/v1/graph/centrality`, { headers: hdrs }).catch(() => null),
      ]);

      const rJson = rRes?.ok ? await rRes.json().catch(() => ({})) : {};
      const sJson = sRes?.ok ? await sRes.json().catch(() => ({})) : {};
      const gJson = gRes?.ok ? await gRes.json().catch(() => ({})) : {};

      const rawReports = normalizeArray(rJson, ['reports', 'items', 'data', 'results']);
      const rawSignals = normalizeArray(sJson, ['signals', 'items', 'data', 'results', 'risk_signals']);
      const rawNodes   = normalizeArray(gJson, ['nodes', 'items', 'data', 'results', 'entities']);

      setReports(rawReports);
      setSignals(rawSignals);
      setNodes(rawNodes);

      const built = rawReports.map(report => {
        const reportLabel = report.title || report.name || report.id || '';
        const reportBody  = [reportLabel, report.summary, report.content, report.type, report.tags]
          .filter(Boolean).join(' ');
        const reportToks  = tokens(reportBody);

        const matchedSignals = rawSignals.filter(s => {
          const sStr = [s.name, s.signal_name, s.description, s.category, s.type, s.source]
            .filter(Boolean).join(' ');
          return overlaps(reportToks, sStr);
        });

        const matchedNodes = rawNodes.filter(n => {
          const nStr = [n.label, n.name, n.id, n.type, n.category, n.description]
            .filter(Boolean).join(' ');
          return overlaps(reportToks, nStr);
        });

        const hasSignal = matchedSignals.length > 0;
        const hasNode   = matchedNodes.length > 0;
        const cls = hasSignal && hasNode ? 'CONNECTED'
                  : hasSignal            ? 'SIGNALED'
                  : hasNode              ? 'GRAPHED'
                  :                        'ISOLATED';

        return { report, reportLabel, cls, matchedSignals, matchedNodes };
      });

      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:rrgweb-toggle', handler);
    return () => window.removeEventListener('jarvis:rrgweb-toggle', handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res  = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ message: buildRrgwebScript() }),
      });
      const j = res.ok ? await res.json().catch(() => ({})) : {};
      const reply = j.response || j.message || j.content || j.text || 'Assessment complete.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: reply } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: 'Assessment unavailable.' } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const counts = {
    CONNECTED: rows.filter(r => r.cls === 'CONNECTED').length,
    SIGNALED:  rows.filter(r => r.cls === 'SIGNALED').length,
    GRAPHED:   rows.filter(r => r.cls === 'GRAPHED').length,
    ISOLATED:  rows.filter(r => r.cls === 'ISOLATED').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search && !r.reportLabel.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report × RiskSignal × Graph Intelligence Web"
        style={{
          position: 'fixed', bottom: 8, left: 92040, zIndex: 175,
          background: 'rgba(0,20,40,0.85)', border: '1px solid #FF6B6B',
          color: '#FF6B6B', fontFamily: 'monospace', fontSize: 10,
          padding: '3px 7px', cursor: 'pointer', borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        ◈ RRGWEB
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 175,
      background: 'rgba(0,6,18,0.97)', color: '#E2E8F0',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #1e3a5f' }}>
        <span style={{ color: '#FF6B6B', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ RRGWEB</span>
        <span style={{ color: '#64748B', fontSize: 11 }}>Report × RiskSignal × Graph Intelligence Web</span>
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
          ['REPORTS',   reports.length,   '#94A3B8'],
          ['SIGNALS',   signals.length,   '#FF4444'],
          ['NODES',     nodes.length,     '#38BDF8'],
          ['CONNECTED', counts.CONNECTED, CLS_COLOR.CONNECTED],
          ['SIGNALED',  counts.SIGNALED,  CLS_COLOR.SIGNALED],
          ['GRAPHED',   counts.GRAPHED,   CLS_COLOR.GRAPHED],
          ['ISOLATED',  counts.ISOLATED,  CLS_COLOR.ISOLATED],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: 'rgba(0,20,40,0.7)', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '5px 12px', textAlign: 'center', minWidth: 70,
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700,
              animation: label === 'ISOLATED' && val > 0 ? 'pulse-red 1.5s ease-in-out infinite' : 'none' }}>
              {loading ? '…' : val}
            </div>
            <div style={{ color: '#64748B', fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

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
          placeholder="search reports…"
          style={{
            background: 'rgba(0,20,40,0.8)', border: '1px solid #334155', color: '#E2E8F0',
            fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', borderRadius: 3,
            outline: 'none', marginLeft: 8, width: 180,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {error && (
          <div style={{ color: '#FF4444', fontSize: 11, marginBottom: 8 }}>Error: {error}</div>
        )}
        {loading && rows.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>Loading intelligence web data…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>No reports match current filter.</div>
        )}
        {visible.map((r, i) => {
          const key = r.reportLabel + i;
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
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 9, fontWeight: 700, minWidth: 66 }}>{r.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1 }}>{r.reportLabel || '(unnamed)'}</span>
                {r.report.date && (
                  <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>
                    {r.report.date}
                  </span>
                )}
                <span style={{ color: '#FF4444', fontSize: 9 }}>{r.matchedSignals.length} signals</span>
                <span style={{ color: '#38BDF8', fontSize: 9 }}>{r.matchedNodes.length} nodes</span>
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ background: 'rgba(0,10,30,0.7)', border: '1px solid #1e3a5f', borderRadius: '0 0 4px 4px', padding: '8px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#FF4444', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED RISK SIGNALS</div>
                    {r.matchedSignals.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedSignals.map((s, si) => (
                        <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{s.signal_name || s.name || s.id || '(signal)'}</span>
                          {s.severity && (
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 2,
                              background: s.severity === 'critical' ? '#FF444433' : s.severity === 'high' ? '#FF990033' : '#33333355',
                              color: s.severity === 'critical' ? '#FF4444' : s.severity === 'high' ? '#FF9900' : '#94A3B8',
                            }}>
                              {s.severity}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#38BDF8', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED GRAPH NODES</div>
                    {r.matchedNodes.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedNodes.map((n, ni) => (
                        <div key={ni} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{n.label || n.name || n.id || '(node)'}</span>
                          {(n.score !== undefined || n.centrality !== undefined) && (
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 2,
                              background: '#38BDF833', color: '#38BDF8',
                            }}>
                              {n.score !== undefined ? n.score.toFixed(3) : n.centrality?.toFixed(3)}
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
