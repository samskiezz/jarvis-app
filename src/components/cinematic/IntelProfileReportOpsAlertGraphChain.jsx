/**
 * IntelProfileReportOpsAlertGraphChain — F109
 *
 * Fetches /entities/IntelProfile + /v1/reports + /v1/ops/alerts + /v1/graph/centrality.
 *
 * Keyword-matches each intel profile (name/category/description) against
 * report titles/categories, ops alert titles/messages/types, and graph node
 * labels/types to classify:
 *
 *   HIGH_IMPACT — profile matches reports AND ops alerts AND graph nodes
 *                 (fully grounded: filed, alerted, traced — active intelligence actor)
 *   DOCUMENTED  — profile matches reports + at least one other source
 *                 (documented presence but partially unmonitored)
 *   ALERTED     — profile matches ops alerts or graph nodes but NO report
 *                 (active signal but undocumented)
 *   DORMANT     — no match to any source (total blind spot — no report, no alert, no graph)
 *
 * Toggle: ◈ IRAIGC button (fixed, bottom strip) left:109400, zIndex:206
 * Stat tiles: profiles / reports / alerts / graph nodes / high_impact / documented / alerted / dormant
 * Red pulse on DORMANT count (intelligence dead-ends with zero operational footprint).
 * Expandable rows: matched reports with date badge +
 *                  matched ops alerts with severity badge +
 *                  matched graph nodes with centrality score badge.
 * Filter tabs: ALL / HIGH_IMPACT / DOCUMENTED / ALERTED / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "iraigc"/"intel impact"/"intel chain"/"profile impact"/"intel profile report"
 *        "dormant profiles"/"intel ops alert"/"profile graph"/"intelligence chain"
 *        "intel alert graph"/"profile blind spot"/"impact chain"/"intel grounding"
 *        "intelligence impact chain"/"intel report alert"
 * Event: jarvis:iraigc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'HIGH_IMPACT', 'DOCUMENTED', 'ALERTED', 'DORMANT'];

const CLS_COLOR = {
  HIGH_IMPACT: '#EF4444',
  DOCUMENTED:  '#22C55E',
  ALERTED:     '#F97316',
  DORMANT:     '#94a3b8',
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
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export function isIraigcQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'iraigc', 'intel impact', 'intel chain', 'profile impact', 'intel profile report',
    'dormant profiles', 'intel ops alert', 'profile graph', 'intelligence chain',
    'intel alert graph', 'profile blind spot', 'impact chain', 'intel grounding',
    'intelligence impact chain', 'intel report alert',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(profile, reports, alerts, graphNodes) {
  const toks = tokens(`${profile.name || ''} ${profile.category || ''} ${profile.description || ''}`);
  const mReports = reports.filter(r => overlaps(toks, `${r.title || ''} ${r.category || ''} ${r.summary || ''}`));
  const mAlerts  = alerts.filter(a => overlaps(toks, `${a.title || ''} ${a.message || ''} ${a.type || ''}`));
  const mNodes   = graphNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''}`));

  let cls;
  if (mReports.length && mAlerts.length && mNodes.length) cls = 'HIGH_IMPACT';
  else if (mReports.length && (mAlerts.length || mNodes.length)) cls = 'DOCUMENTED';
  else if (mAlerts.length || mNodes.length) cls = 'ALERTED';
  else cls = 'DORMANT';

  return { profile, cls, mReports, mAlerts, mNodes };
}

export default function IntelProfileReportOpsAlertGraphChain() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [profileRaw, reportRaw, alertRaw, graphRaw] = await Promise.all([
        fetcher('/entities/IntelProfile'),
        fetcher('/v1/reports'),
        fetcher('/v1/ops/alerts'),
        fetcher('/v1/graph/centrality'),
      ]);

      const profiles   = normalizeArray(profileRaw, ['profiles', 'intelProfiles', 'data', 'items', 'results']);
      const reports    = normalizeArray(reportRaw,  ['reports', 'data', 'items', 'results']);
      const alerts     = normalizeArray(alertRaw,   ['alerts', 'data', 'items', 'results']);
      const graphNodes = normalizeArray(graphRaw,   ['nodes', 'centrality', 'data', 'items', 'results']);

      setRows(profiles.map(p => classify(p, reports, alerts, graphNodes)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:iraigc-toggle', handler);
    return () => window.removeEventListener('jarvis:iraigc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    HIGH_IMPACT: rows.filter(r => r.cls === 'HIGH_IMPACT').length,
    DOCUMENTED:  rows.filter(r => r.cls === 'DOCUMENTED').length,
    ALERTED:     rows.filter(r => r.cls === 'ALERTED').length,
    DORMANT:     rows.filter(r => r.cls === 'DORMANT').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.profile.name || '').toLowerCase().includes(s) ||
             (r.profile.category || '').toLowerCase().includes(s) ||
             (r.profile.description || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Intel Profiles: ${rows.length}. High-Impact: ${counts.HIGH_IMPACT}. Documented: ${counts.DOCUMENTED}. Alerted: ${counts.ALERTED}. Dormant: ${counts.DORMANT}.`;
    const prompt = `JARVIS intel-profile intelligence impact chain audit: ${summary}. Identify the most dangerous dormant profiles with zero report, ops alert, or graph grounding. Provide 2-sentence advisory.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 109400, zIndex: 206,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ IRAIGC</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 206, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ IRAIGC</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>IntelProfile × Report × Ops Alert × Graph — Intelligence Impact Chain</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'PROFILES',    val: rows.length,          color: '#94a3b8' },
          { label: 'HIGH_IMPACT', val: counts.HIGH_IMPACT,   color: CLS_COLOR.HIGH_IMPACT },
          { label: 'DOCUMENTED',  val: counts.DOCUMENTED,    color: CLS_COLOR.DOCUMENTED },
          { label: 'ALERTED',     val: counts.ALERTED,       color: CLS_COLOR.ALERTED },
          { label: 'DORMANT',     val: counts.DORMANT,       color: CLS_COLOR.DORMANT, pulse: counts.DORMANT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'iraigc-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.profile.name || r.profile.id || '(unnamed)'}
                </span>
                {r.profile.category && (
                  <span style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.profile.category}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.profile.description && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.profile.description}</div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#22c55e', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rp, k) => (
                          <span key={k} style={{ background: '#071a0f', border: '1px solid #166534', color: '#86efac', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rp.title || rp.id}
                            {(rp.date || rp.created_at) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> {(rp.date || rp.created_at || '').slice(0, 10)}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((a, k) => (
                          <span key={k} style={{ background: '#1c0707', border: '1px solid #7c2d12', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.id}
                            {a.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {a.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.id}
                            {n.centrality != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> c:{Number(n.centrality).toFixed(2)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length === 0 && r.mAlerts.length === 0 && r.mNodes.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No report, ops alert, or graph match — dormant intelligence profile.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes iraigc-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
