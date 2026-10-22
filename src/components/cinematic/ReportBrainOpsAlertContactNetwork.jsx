/**
 * ReportBrainOpsAlertContactNetwork — F113
 *
 * Fetches /v1/reports + /v1/cinematic/brain + /v1/ops/alerts + /entities/Contact.
 *
 * Keyword-matches each report (title/summary/type/category) against
 * brain node labels/types, ops alert titles/descriptions/severities, and
 * contact names/roles/orgs to classify:
 *
 *   DISTRIBUTED — report matches brain AND ops alert AND contact
 *                 (fully circulated: modelled, actioned, and owned)
 *   MODELED     — report matches 2 of the 3 sources
 *                 (partially circulated — missing one distribution axis)
 *   ALERTED     — report matches only 1 of the 3 sources
 *                 (thin reach — report exists but isn't propagated)
 *   ISOLATED    — no match to any source
 *                 (intelligence dead-end — report with zero distribution)
 *
 * Toggle: ◈ RBACDN button (fixed, bottom strip) left:111640, zIndex:210
 * Stat tiles: reports / brain nodes / alerts / contacts / distributed / modeled / alerted / isolated
 * Amber pulse on ISOLATED count (intelligence dead-ends).
 * Expandable rows: matched brain nodes with centrality score badge +
 *                  matched ops alerts with severity badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / DISTRIBUTED / MODELED / ALERTED / ISOLATED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rbacdn"/"report distribution"/"intel distribution"/"report brain"
 *        "report network"/"report ops"/"report contact"/"isolated reports"
 *        "distributed reports"/"report circulation"/"intelligence network"
 *        "report coverage"/"report reach"/"report alert contact"
 *        "intelligence distribution"/"report propagation"/"report dead end"
 * Event: jarvis:rbacdn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DISTRIBUTED', 'MODELED', 'ALERTED', 'ISOLATED'];

const CLS_COLOR = {
  DISTRIBUTED: '#22C55E',
  MODELED:     '#3B82F6',
  ALERTED:     '#F97316',
  ISOLATED:    '#F59E0B',
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

export function isRbadnQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'rbacdn', 'report distribution', 'intel distribution', 'report brain',
    'report network', 'report ops', 'report contact', 'isolated reports',
    'distributed reports', 'report circulation', 'intelligence network',
    'report coverage', 'report reach', 'report alert contact',
    'intelligence distribution', 'report propagation', 'report dead end',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classifyReport(report, brainNodes, alerts, contacts) {
  const toks = tokens(
    `${report.title || ''} ${report.summary || ''} ${report.type || ''} ${report.category || ''} ${report.description || ''}`
  );
  const mNodes    = brainNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.name || ''}`));
  const mAlerts   = alerts.filter(a => overlaps(toks, `${a.title || ''} ${a.description || ''} ${a.severity || ''} ${a.type || ''}`));
  const mContacts = contacts.filter(c => overlaps(toks, `${c.name || ''} ${c.role || ''} ${c.org || ''} ${c.organisation || ''}`));

  const matchCount = (mNodes.length > 0 ? 1 : 0) + (mAlerts.length > 0 ? 1 : 0) + (mContacts.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'DISTRIBUTED';
  else if (matchCount === 2) cls = 'MODELED';
  else if (matchCount === 1) cls = 'ALERTED';
  else cls = 'ISOLATED';

  return { report, cls, mNodes, mAlerts, mContacts };
}

export default function ReportBrainOpsAlertContactNetwork() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [repRaw, brainRaw, alertRaw, ctcRaw] = await Promise.all([
        fetcher('/v1/reports'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/v1/ops/alerts'),
        fetcher('/entities/Contact'),
      ]);

      const reports    = normalizeArray(repRaw,   ['reports', 'data', 'items', 'results']);
      const brainNodes = normalizeArray(brainRaw, ['nodes', 'entities', 'data', 'items', 'results']);
      const alerts     = normalizeArray(alertRaw, ['alerts', 'data', 'items', 'results']);
      const contacts   = normalizeArray(ctcRaw,   ['contacts', 'data', 'items', 'results']);

      setRows(reports.map(r => classifyReport(r, brainNodes, alerts, contacts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:rbacdn-toggle', handler);
    return () => window.removeEventListener('jarvis:rbacdn-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    DISTRIBUTED: rows.filter(r => r.cls === 'DISTRIBUTED').length,
    MODELED:     rows.filter(r => r.cls === 'MODELED').length,
    ALERTED:     rows.filter(r => r.cls === 'ALERTED').length,
    ISOLATED:    rows.filter(r => r.cls === 'ISOLATED').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.report.title || r.report.name || '').toLowerCase().includes(s) ||
             (r.report.summary || r.report.description || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Reports: ${rows.length}. Distributed: ${counts.DISTRIBUTED}. Modeled: ${counts.MODELED}. Alerted: ${counts.ALERTED}. Isolated: ${counts.ISOLATED}.`;
    const prompt = `JARVIS intelligence distribution audit: ${summary}. Identify the most critical isolated reports — those with no brain model grounding, no ops alert linkage, and no contact ownership. Provide 2-sentence advisory on distribution gaps and recommended escalation paths.`;
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
          position: 'fixed', bottom: 8, left: 111640, zIndex: 210,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ RBACDN</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ RBACDN</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Report × Brain × Ops Alert × Contact — Intelligence Distribution Network</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #F59E0B55', color: '#F59E0B', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'REPORTS',     val: rows.length,           color: '#94a3b8' },
          { label: 'DISTRIBUTED', val: counts.DISTRIBUTED,    color: CLS_COLOR.DISTRIBUTED },
          { label: 'MODELED',     val: counts.MODELED,        color: CLS_COLOR.MODELED },
          { label: 'ALERTED',     val: counts.ALERTED,        color: CLS_COLOR.ALERTED },
          { label: 'ISOLATED',    val: counts.ISOLATED,       color: CLS_COLOR.ISOLATED, pulse: counts.ISOLATED > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'rbacdn-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B44', borderRadius: 5, fontSize: 11, color: '#fcd34d', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#F59E0B22' : 'none',
            border: `1px solid ${tab === t ? '#F59E0B' : '#1e293b'}`,
            color: tab === t ? '#F59E0B' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
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
                  {r.report.title || r.report.name || r.report.id || '(untitled)'}
                </span>
                {(r.report.type || r.report.category) && (
                  <span style={{ background: '#071428', border: '1px solid #075985', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.report.type || r.report.category}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(r.report.summary || r.report.description) && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.report.summary || r.report.description}</div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#22d3ee', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#071420', border: '1px solid #0e7490', color: '#67e8f9', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.centrality != null && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}]</span>
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
                          <span key={k} style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.message || a.id}
                            {a.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{a.severity}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.id}
                            {(c.role || c.org || c.organisation) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> {[c.role, c.org || c.organisation].filter(Boolean).join(' / ')}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length === 0 && r.mAlerts.length === 0 && r.mContacts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No brain model, ops alert, or contact match — intelligence dead-end.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes rbacdn-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
