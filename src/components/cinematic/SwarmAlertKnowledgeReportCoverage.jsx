/**
 * SwarmAlertKnowledgeReportCoverage — F127
 *
 * Fetches /entities/SwarmJob + /v1/ops/alerts + /knowledge/ + /v1/reports.
 *
 * Keyword-matches each swarm job against ops alerts, knowledge articles, and reports
 * to classify automated response coverage:
 *
 *   RESPONSIVE  — swarm job matches ops alert AND knowledge AND report
 *                 (fully grounded: triggered, documented, and reported)
 *   ALERTED     — matches ops alert AND knowledge but no report
 *                 (aware and backed but undocumented in reports)
 *   DOCUMENTED  — matches knowledge AND report but no ops alert
 *                 (documented but not alert-triggered — passive coverage)
 *   BLIND       — no match to any source
 *                 (automation blind spots: no trigger, no knowledge, no report)
 *
 * Toggle: ◈ SWARKMAT button (fixed, bottom strip) left:119480, zIndex:224
 * Stat tiles: swarm jobs / ops alerts / knowledge articles / reports / responsive / alerted / documented / blind
 * Amber pulse on BLIND count (automation blind spots).
 * Expandable rows: matched ops alerts with severity badge +
 *                  matched knowledge articles with category badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / RESPONSIVE / ALERTED / DOCUMENTED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swarkmat"/"swarm alert"/"automated response coverage"/"swarm response"
 *        "automation coverage"/"swarm knowledge report"/"swarm alert knowledge"
 *        "blind automation"/"automation blind spot"/"swarm coverage audit"
 *        "swarm ops coverage"/"swarm response readiness"/"automation readiness"
 *        "alert swarm coverage"/"knowledge swarm"/"swarm report coverage"
 * Event: jarvis:swarkmat-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'RESPONSIVE', 'ALERTED', 'DOCUMENTED', 'BLIND'];

const CLS_COLOR = {
  RESPONSIVE:  '#22C55E',
  ALERTED:     '#3B82F6',
  DOCUMENTED:  '#F97316',
  BLIND:       '#F59E0B',
};

export function isSwarkmatQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'swarkmat', 'swarm alert', 'automated response coverage', 'swarm response',
    'automation coverage', 'swarm knowledge report', 'swarm alert knowledge',
    'blind automation', 'automation blind spot', 'swarm coverage audit',
    'swarm ops coverage', 'swarm response readiness', 'automation readiness',
    'alert swarm coverage', 'knowledge swarm', 'swarm report coverage',
    'swarm automated response', 'swarm knowledge ops', 'automation gap',
  ].some(kw => s.includes(kw));
}

export function buildSwarkmatScript(q) {
  return `JARVIS swarm-alert-knowledge-report automated response coverage triggered by: "${q}". Fetch /entities/SwarmJob + /v1/ops/alerts + /knowledge/ + /v1/reports. Classify each swarm job as RESPONSIVE/ALERTED/DOCUMENTED/BLIND. Report the blind count and top 3 automation blind spots with no alert trigger, no knowledge grounding, and no report output.`;
}

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

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function swarmLabel(sw) {
  return sw.name || sw.title || sw.job_name || sw.type || sw.id || 'Unknown';
}

function swarmTokens(sw) {
  return tokens(
    `${sw.name || ''} ${sw.title || ''} ${sw.job_name || ''} ${sw.type || ''} ${sw.description || ''} ${sw.category || ''} ${sw.tags ? (Array.isArray(sw.tags) ? sw.tags.join(' ') : sw.tags) : ''}`
  );
}

function classifySwarmJob(sw, alerts, knowledge, reports) {
  const toks = swarmTokens(sw);

  const mAlerts = alerts.filter(a =>
    overlaps(toks, `${a.title || ''} ${a.message || ''} ${a.type || ''} ${a.category || ''} ${a.description || ''}`)
  );
  const mKnowledge = knowledge.filter(k =>
    overlaps(toks, `${k.title || ''} ${k.name || ''} ${k.content || ''} ${k.category || ''} ${k.type || ''} ${k.tags ? (Array.isArray(k.tags) ? k.tags.join(' ') : k.tags) : ''}`)
  );
  const mReports = reports.filter(r =>
    overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.description || ''} ${r.category || ''} ${r.type || ''} ${r.tags ? (Array.isArray(r.tags) ? r.tags.join(' ') : r.tags) : ''}`)
  );

  const hasAlert     = mAlerts.length > 0;
  const hasKnowledge = mKnowledge.length > 0;
  const hasReport    = mReports.length > 0;

  let cls;
  if (hasAlert && hasKnowledge && hasReport)  cls = 'RESPONSIVE';
  else if (hasAlert && hasKnowledge)           cls = 'ALERTED';
  else if (hasKnowledge && hasReport)          cls = 'DOCUMENTED';
  else                                         cls = 'BLIND';

  return { sw, cls, mAlerts, mKnowledge, mReports };
}

export default function SwarmAlertKnowledgeReportCoverage() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [swarmRaw, alertRaw, knowledgeRaw, reportRaw] = await Promise.all([
        fetcher('/entities/SwarmJob'),
        fetcher('/v1/ops/alerts'),
        fetcher('/knowledge/'),
        fetcher('/v1/reports'),
      ]);

      const swarmJobs = normalizeArray(swarmRaw,    ['swarm_jobs', 'swarmJobs', 'jobs', 'data', 'items', 'results']);
      const alerts    = normalizeArray(alertRaw,    ['alerts', 'data', 'items', 'results']);
      const knowledge = normalizeArray(knowledgeRaw,['articles', 'knowledge', 'data', 'items', 'results']);
      const reports   = normalizeArray(reportRaw,   ['reports', 'data', 'items', 'results']);

      setRows(swarmJobs.map(sw => classifySwarmJob(sw, alerts, knowledge, reports)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:swarkmat-toggle', handler);
    return () => window.removeEventListener('jarvis:swarkmat-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    RESPONSIVE:  rows.filter(r => r.cls === 'RESPONSIVE').length,
    ALERTED:     rows.filter(r => r.cls === 'ALERTED').length,
    DOCUMENTED:  rows.filter(r => r.cls === 'DOCUMENTED').length,
    BLIND:       rows.filter(r => r.cls === 'BLIND').length,
  };

  const alertCount     = rows.reduce((n, r) => n + r.mAlerts.length,     0);
  const knowledgeCount = rows.reduce((n, r) => n + r.mKnowledge.length,  0);
  const reportCount    = rows.reduce((n, r) => n + r.mReports.length,    0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return swarmLabel(r.sw).toLowerCase().includes(s) ||
             (r.sw.type || r.sw.category || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `SwarmJobs: ${rows.length}. Responsive: ${counts.RESPONSIVE}. Alerted: ${counts.ALERTED}. Documented: ${counts.DOCUMENTED}. Blind: ${counts.BLIND}.`;
    const prompt = `JARVIS swarm-alert-knowledge-report automated response coverage: ${summary}. Identify the most critical BLIND automation jobs — those with no ops alert trigger, no knowledge grounding, and no filed report. Provide a 2-sentence advisory on the highest-risk blind swarm jobs and priority actions to anchor them to alerts, knowledge articles, and reports to close the automation intelligence gap.`;
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
          position: 'fixed', bottom: 8, left: 119480, zIndex: 224,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ SWARKMAT</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 224, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ SWARKMAT</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>SwarmJob × Ops Alert × Knowledge × Report — Automated Response Coverage</span>
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
          { label: 'JOBS',        val: rows.length,          color: '#94a3b8' },
          { label: 'ALERTS',      val: alertCount,            color: '#F87171' },
          { label: 'KNOWLEDGE',   val: knowledgeCount,        color: '#22D3EE' },
          { label: 'REPORTS',     val: reportCount,           color: '#a78bfa' },
          { label: 'RESPONSIVE',  val: counts.RESPONSIVE,    color: CLS_COLOR.RESPONSIVE },
          { label: 'ALERTED',     val: counts.ALERTED,       color: CLS_COLOR.ALERTED },
          { label: 'DOCUMENTED',  val: counts.DOCUMENTED,    color: CLS_COLOR.DOCUMENTED },
          { label: 'BLIND',       val: counts.BLIND,         color: CLS_COLOR.BLIND, pulse: counts.BLIND > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'swarkmat-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search swarm jobs…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
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
                  {swarmLabel(r.sw)}
                </span>
                {r.sw.status && (
                  <span style={{ background: '#030c18', border: '1px solid #1e3a5f', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.sw.status}
                  </span>
                )}
                {r.sw.type && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.sw.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#F87171', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((a, k) => (
                          <span key={k} style={{ background: '#150505', border: '1px solid #7f1d1d', color: '#F87171', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.message || a.id}
                            {a.severity && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{a.severity}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mKnowledge.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE ({r.mKnowledge.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mKnowledge.slice(0, 8).map((k, ki) => (
                          <span key={ki} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {k.title || k.name || k.id}
                            {k.category && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{k.category}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rp, ri) => (
                          <span key={ri} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rp.title || rp.name || rp.id}
                            {(rp.date || rp.created_at || rp.timestamp) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(rp.date || rp.created_at || rp.timestamp || '').slice(0, 10)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length === 0 && r.mKnowledge.length === 0 && r.mReports.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No ops alert trigger, no knowledge grounding, no filed report — automation blind spot with zero response coverage.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes swarkmat-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
