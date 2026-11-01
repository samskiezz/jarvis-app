/**
 * BrainRiskSignalReportSwarmMatrix — F258
 *
 * Fetches /v1/cinematic/brain
 *         /entities/RiskSignal
 *         /v1/reports
 *         /entities/SwarmJob
 *
 * Keyword-matches each brain node against risk signals, reports,
 * and swarm jobs to classify:
 *
 *   COMMANDED — matches all 3 other sources
 *   SIGNALED  — matches 2 of 3 other sources
 *   PROCESSED — matches exactly 1 other source
 *   DARK      — no match to any source
 *               (brain nodes with no threat signal, no report,
 *                no swarm job grounding — operational blind spots)
 *
 * Toggle: ◈ BRRSWT button (fixed, bottom strip) left:192280, zIndex:354
 * Stat tiles: brain nodes / risk signals / reports / swarm jobs /
 *             commanded / signaled / processed / dark
 * Red pulse on DARK count (operational blind spots).
 * Expandable rows: matched risk signals with severity badge +
 *                  matched reports with date badge +
 *                  matched swarm jobs with status badge.
 * Filter tabs: ALL / COMMANDED / SIGNALED / PROCESSED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "brrswt"/"brain threat matrix"/"brain risk matrix"/
 *        "swarm brain threat"/"brain swarm report"/"brain signal report"
 * Event: jarvis:brrswt-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDED', 'SIGNALED', 'PROCESSED', 'DARK'];

const CLS_COLOR = {
  COMMANDED: '#22C55E',
  SIGNALED:  '#F59E0B',
  PROCESSED: '#38BDF8',
  DARK:      '#EF4444',
};

export function isBrrswtQuery(q) {
  const s = (q || '').toLowerCase();
  return s.includes('brrswt') ||
    s.includes('brain threat matrix') ||
    s.includes('brain risk matrix') ||
    s.includes('swarm brain threat') ||
    s.includes('brain swarm report') ||
    s.includes('brain signal report');
}

export function buildBrrswtScript() {
  return 'Analyse the Brain × RiskSignal × Report × SwarmJob Operational Threat Intelligence Matrix. ' +
    'Identify DARK brain nodes (no risk signal, no report, no swarm job grounding — operational blind spots). ' +
    'Recommend the top 3 most urgent blind-spot nodes to address. ' +
    'Keep the response under 120 words.';
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeBrain(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.nodes))     return raw.nodes;
  if (Array.isArray(raw?.data))      return raw.data;
  if (Array.isArray(raw?.results))   return raw.results;
  return [];
}

function normalizeRiskSignals(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.risk_signals))    return raw.risk_signals;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeReports(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.reports))   return raw.reports;
  if (Array.isArray(raw?.data))      return raw.data;
  if (Array.isArray(raw?.results))   return raw.results;
  return [];
}

function normalizeSwarmJobs(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.swarm_jobs))    return raw.swarm_jobs;
  if (Array.isArray(raw?.data))          return raw.data;
  if (Array.isArray(raw?.results))       return raw.results;
  return [];
}

function nodeText(n) {
  return [n.label, n.name, n.type, n.description, n.category, n.tags].filter(Boolean).join(' ');
}

function classifyNode(nodeToks, riskSignals, reports, swarmJobs) {
  const matchedRisk = riskSignals.filter(r => {
    const text = [r.name, r.title, r.description, r.type, r.category, r.severity, r.tags].filter(Boolean).join(' ');
    return overlaps(nodeToks, text);
  });
  const matchedReports = reports.filter(r => {
    const text = [r.title, r.name, r.description, r.category, r.type, r.tags, r.summary].filter(Boolean).join(' ');
    return overlaps(nodeToks, text);
  });
  const matchedSwarm = swarmJobs.filter(j => {
    const text = [j.name, j.title, j.description, j.type, j.status, j.tags, j.objective].filter(Boolean).join(' ');
    return overlaps(nodeToks, text);
  });
  const hits = (matchedRisk.length > 0 ? 1 : 0)
             + (matchedReports.length > 0 ? 1 : 0)
             + (matchedSwarm.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'COMMANDED'
            : hits === 2 ? 'SIGNALED'
            : hits === 1 ? 'PROCESSED'
            : 'DARK';
  return { cls, matchedRisk, matchedReports, matchedSwarm };
}

const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function apiFetch(path) {
  const r = await fetch(`${API}${path}`, { headers: hdr });
  if (!r.ok) return null;
  return r.json();
}

export default function BrainRiskSignalReportSwarmMatrix() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [advice, setAdvice]       = useState('');
  const timerRef                  = useRef(null);

  const counts = {
    COMMANDED: rows.filter(r => r.cls === 'COMMANDED').length,
    SIGNALED:  rows.filter(r => r.cls === 'SIGNALED').length,
    PROCESSED: rows.filter(r => r.cls === 'PROCESSED').length,
    DARK:      rows.filter(r => r.cls === 'DARK').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [brRaw, rsRaw, rpRaw, sjRaw] = await Promise.all([
        apiFetch('/v1/cinematic/brain'),
        apiFetch('/entities/RiskSignal'),
        apiFetch('/v1/reports'),
        apiFetch('/entities/SwarmJob'),
      ]);
      const brainNodes  = normalizeBrain(brRaw);
      const riskSignals = normalizeRiskSignals(rsRaw);
      const reports     = normalizeReports(rpRaw);
      const swarmJobs   = normalizeSwarmJobs(sjRaw);

      const classified = brainNodes.map(n => {
        const nodeToks = tokens(nodeText(n));
        const { cls, matchedRisk, matchedReports, matchedSwarm } = classifyNode(nodeToks, riskSignals, reports, swarmJobs);
        return { n, cls, matchedRisk, matchedReports, matchedSwarm };
      });
      setRows(classified);
    } catch { /* network offline — keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:brrswt-toggle', toggle);
    return () => window.removeEventListener('jarvis:brrswt-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAdvice('');
    try {
      const prompt = buildBrrswtScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || JSON.stringify(d);
      setAdvice(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST', headers: hdr,
          body: JSON.stringify({ text: text.slice(0, 300) }),
        });
      } catch { /* TTS optional */ }
    } catch { setAdvice('Assessment unavailable — check backend connectivity.'); }
    setAssessing(false);
  }

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const t = (r.n.label || r.n.name || '').toLowerCase();
      if (!t.includes(s)) return false;
    }
    return true;
  });

  const darkCount = counts.DARK;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Brain × RiskSignal × Report × SwarmJob Operational Threat Intelligence Matrix"
        style={{
          position: 'fixed', left: 192280, bottom: 8, zIndex: 354,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkCount > 0 ? '0 0 8px #EF444466' : 'none',
        }}
      >
        ◈ BRRSWT
        {darkCount > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff',
            borderRadius: 4, padding: '1px 5px', fontSize: 10,
            animation: 'brrswt-pulse 1.4s ease-in-out infinite',
          }}>{darkCount}</span>
        )}
        <style>{`@keyframes brrswt-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1060,
      background: 'rgba(2,5,10,0.93)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
      padding: '18px 20px', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span style={{ color: '#22D3EE', fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
          ◈ BRRSWT — BRAIN × RISKSIGNAL × REPORT × SWARMJOB THREAT INTELLIGENCE MATRIX
        </span>
        <button onClick={() => setOpen(false)} style={{
          marginLeft: 'auto', background: 'none', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 4, padding: '2px 10px',
          cursor: 'pointer', fontSize: 12,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { label: 'BRAIN NODES', val: rows.length,          color: '#22D3EE' },
          { label: 'COMMANDED',   val: counts.COMMANDED,     color: '#22C55E' },
          { label: 'SIGNALED',    val: counts.SIGNALED,      color: '#F59E0B' },
          { label: 'PROCESSED',   val: counts.PROCESSED,     color: '#38BDF8' },
          { label: 'DARK',        val: counts.DARK,          color: '#EF4444',
            pulse: counts.DARK > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(10,16,24,0.7)', border: `1px solid ${color}44`,
            borderRadius: 8, padding: '8px 14px', minWidth: 90, textAlign: 'center',
            boxShadow: pulse ? `0 0 12px ${color}55` : 'none',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{loading ? '…' : val}</div>
            <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#22D3EE22' : 'rgba(10,16,24,0.7)',
            border: `1px solid ${tab === t ? '#22D3EE' : '#22D3EE33'}`,
            color: tab === t ? '#22D3EE' : '#6E8AA0',
            borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search brain nodes…"
          style={{
            marginLeft: 8, background: 'rgba(10,16,24,0.7)', border: '1px solid #22D3EE33',
            color: '#DCEBF5', borderRadius: 4, padding: '3px 10px', fontSize: 11,
            outline: 'none', width: 180,
          }}
        />
        <button onClick={load} style={{
          marginLeft: 'auto', background: 'rgba(10,16,24,0.7)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
        }}>↻ REFRESH</button>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', marginTop: 40, fontSize: 13 }}>
            No brain nodes match the current filter.
          </div>
        )}
        {visible.map((row, i) => {
          const id    = row.n.id || row.n.node_id || i;
          const label = row.n.label || row.n.name || `Node ${i + 1}`;
          const type  = row.n.type || '';
          const isExp = !!expanded[id];
          return (
            <div key={id} style={{
              background: 'rgba(8,14,22,0.65)',
              border: `1px solid ${CLS_COLOR[row.cls]}33`,
              borderRadius: 8, marginBottom: 7, padding: '10px 14px',
              cursor: 'pointer',
            }} onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: CLS_COLOR[row.cls] + '22',
                  border: `1px solid ${CLS_COLOR[row.cls]}66`,
                  color: CLS_COLOR[row.cls],
                  borderRadius: 4, padding: '1px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  minWidth: 90, textAlign: 'center',
                }}>{row.cls}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{label}</span>
                {type && (
                  <span style={{
                    background: '#38BDF822', border: '1px solid #38BDF844',
                    color: '#38BDF8', borderRadius: 4, padding: '1px 6px', fontSize: 10,
                  }}>{type}</span>
                )}
                <span style={{ color: '#6E8AA0', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1A2A3A' }}>
                  {/* Risk signals */}
                  {row.matchedRisk.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#6E8AA0', letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED RISK SIGNALS ({row.matchedRisk.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedRisk.slice(0, 8).map((r, j) => (
                          <span key={j} style={{
                            background: '#EF444422', border: '1px solid #EF444444',
                            color: '#EF4444', borderRadius: 4, padding: '1px 7px', fontSize: 10,
                          }}>
                            {r.name || r.title || `Signal ${j + 1}`}
                            {r.severity && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>[{r.severity}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Reports */}
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#6E8AA0', letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED REPORTS ({row.matchedReports.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedReports.slice(0, 8).map((r, j) => (
                          <span key={j} style={{
                            background: '#22C55E22', border: '1px solid #22C55E44',
                            color: '#22C55E', borderRadius: 4, padding: '1px 7px', fontSize: 10,
                          }}>
                            {r.title || r.name || `Report ${j + 1}`}
                            {(r.date || r.created_at || r.updated_at) && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                                [{(r.date || r.created_at || r.updated_at || '').slice(0, 10)}]
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Swarm jobs */}
                  {row.matchedSwarm.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: '#6E8AA0', letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED SWARM JOBS ({row.matchedSwarm.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedSwarm.slice(0, 8).map((j, ji) => (
                          <span key={ji} style={{
                            background: '#F59E0B22', border: '1px solid #F59E0B44',
                            color: '#F59E0B', borderRadius: 4, padding: '1px 7px', fontSize: 10,
                          }}>
                            {j.name || j.title || `Job ${ji + 1}`}
                            {j.status && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>[{j.status}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {row.matchedRisk.length === 0 && row.matchedReports.length === 0 && row.matchedSwarm.length === 0 && (
                    <div style={{ color: '#EF4444', fontSize: 11 }}>
                      No matching risk signals, reports, or swarm jobs — fully DARK node.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ marginTop: 12, borderTop: '1px solid #1A2A3A', paddingTop: 12 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#0F1C28' : 'rgba(34,211,238,0.12)',
          border: '1px solid #22D3EE55', color: '#22D3EE',
          borderRadius: 6, padding: '6px 18px', fontSize: 12,
          cursor: assessing ? 'not-allowed' : 'pointer', letterSpacing: 1,
        }}>
          {assessing ? '… ASSESSING' : '▶ ASSESS THREAT INTELLIGENCE MATRIX'}
        </button>
        {advice && (
          <div style={{
            marginTop: 10, background: 'rgba(8,14,22,0.7)',
            border: '1px solid #22D3EE33', borderRadius: 8,
            padding: '10px 14px', fontSize: 12, lineHeight: 1.6, color: '#DCEBF5',
          }}>{advice}</div>
        )}
      </div>
    </div>
  );
}
