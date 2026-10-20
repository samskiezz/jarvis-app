/**
 * IntelProfileSwarmReportLedger — F65
 *
 * Fetches /entities/IntelProfile + /entities/SwarmJob + /v1/reports
 * Keyword-matches each intel profile against swarm jobs AND reports to classify:
 *   EXECUTING — profile matched both a SwarmJob AND a Report (active + documented)
 *   SWARMED   — profile matched a SwarmJob only (active execution, not yet filed)
 *   FILED     — profile matched a Report only (documented, no active swarm)
 *   SHADOW    — no match (dormant / unexecuted profile)
 *
 * Toggle: ◈ IELGR button (fixed, bottom strip) left:84760, zIndex:162
 * Stat tiles: profiles / jobs / reports / executing / swarmed / filed / shadow
 * Red pulse on SHADOW count.
 * Expandable rows: matched swarm jobs with status badge + matched reports with date badge.
 * Filter tabs: ALL / EXECUTING / SWARMED / FILED / SHADOW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ielgr"/"intel execution"/"intel ledger"/"execution ledger"/"profile execution"/
 *        "swarm report"/"intel swarm"/"intel filing"/"execution coverage"/"profile filing"
 * Event: jarvis:ielgr-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'EXECUTING', 'SWARMED', 'FILED', 'SHADOW'];

const CLS_COLOR = {
  EXECUTING: '#00FF88',
  SWARMED:   '#38BDF8',
  FILED:     '#A78BFA',
  SHADOW:    '#FF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
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

function classify(profToks, jobs, reports) {
  const matchedJobs = jobs.filter(j =>
    overlaps(profToks, [
      j.id, j.name, j.title, j.type, j.category,
      j.description, j.tags, j.target, j.topic, j.domain,
    ].join(' '))
  );
  const matchedReports = reports.filter(r =>
    overlaps(profToks, [
      r.id, r.name, r.title, r.type, r.category,
      r.summary, r.description, r.tags, r.topic, r.subject,
    ].join(' '))
  );
  const hasJob    = matchedJobs.length > 0;
  const hasReport = matchedReports.length > 0;
  const cls = hasJob && hasReport ? 'EXECUTING'
            : hasJob              ? 'SWARMED'
            : hasReport           ? 'FILED'
            : 'SHADOW';
  return {
    cls,
    matchedJobs:    matchedJobs.slice(0, 4),
    matchedReports: matchedReports.slice(0, 4),
  };
}

export function isIelgrQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('ielgr') ||
    s.includes('intel execution') ||
    s.includes('intel ledger') ||
    s.includes('execution ledger') ||
    s.includes('profile execution') ||
    s.includes('swarm report') ||
    s.includes('intel swarm') ||
    s.includes('intel filing') ||
    s.includes('execution coverage') ||
    s.includes('profile filing')
  );
}

export default function IntelProfileSwarmReportLedger() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, jobsRes, repsRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/entities/SwarmJob`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/reports`,            { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [profRaw, jobsRaw, repsRaw] = await Promise.all([
        profRes.ok ? profRes.json() : {},
        jobsRes.ok ? jobsRes.json() : {},
        repsRes.ok ? repsRes.json() : {},
      ]);

      const profiles = normalizeArray(profRaw, ['profiles', 'intel_profiles', 'items', 'data', 'results', 'entities']);
      const jobs     = normalizeArray(jobsRaw, ['jobs', 'swarm_jobs', 'items', 'data', 'results', 'entities']);
      const reports  = normalizeArray(repsRaw, ['reports', 'items', 'data', 'results', 'entities']);

      const classified = profiles.map(prof => {
        const label = [
          prof.id, prof.name, prof.title, prof.type, prof.category,
          prof.description, prof.tags, prof.domain, prof.entity, prof.subject,
          prof.aliases, prof.threat_type, prof.actor,
        ].join(' ');
        const toks = tokens(label);
        const { cls, matchedJobs, matchedReports } = classify(toks, jobs, reports);
        return { ...prof, cls, matchedJobs, matchedReports, _label: label };
      });

      setRows(classified);
    } catch (_) {
      /* network error — leave existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:ielgr-toggle', handler);
    return () => window.removeEventListener('jarvis:ielgr-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setAssessment('');
    const shadowCount    = rows.filter(r => r.cls === 'SHADOW').length;
    const executingCount = rows.filter(r => r.cls === 'EXECUTING').length;
    const prompt = `Jarvis, I have ${rows.length} intel profiles. ${shadowCount} are SHADOW (no swarm job or report — dormant with no execution trail). ${executingCount} are EXECUTING (active swarm job AND filed report). Provide a 2-sentence operational advisory on activating dormant profiles and ensuring all active swarm executions are documented in filed reports.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.message || data.answer || data.content || '';
      setAssessment(text);
      if (text) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice: 'ash' }),
          });
        } catch (_) { /* TTS is best-effort */ }
      }
    } catch (_) { /* assessment failed */ } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    total:     rows.length,
    executing: rows.filter(r => r.cls === 'EXECUTING').length,
    swarmed:   rows.filter(r => r.cls === 'SWARMED').length,
    filed:     rows.filter(r => r.cls === 'FILED').length,
    shadow:    rows.filter(r => r.cls === 'SHADOW').length,
  };

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || (r._label || '').toLowerCase().includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 84760, zIndex: 162,
          background: 'rgba(255,68,68,0.08)', border: '1px solid #FF444444',
          color: '#FF4444', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="IntelProfile × SwarmJob × Report Intelligence Execution Ledger"
      >◈ IELGR</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 162,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FF444433',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(255,68,68,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FF444422',
          background: 'rgba(255,68,68,0.04)',
        }}>
          <span style={{ color: '#FF4444', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ IELGR — INTEL EXECUTION LEDGER
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FF444477', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FF444466', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',     counts.total,     '#888'],
            ['EXECUTING', counts.executing, '#00FF88'],
            ['SWARMED',   counts.swarmed,   '#38BDF8'],
            ['FILED',     counts.filed,     '#A78BFA'],
            ['SHADOW',    counts.shadow,    '#FF4444', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${
                color === '#00FF88' ? '0,255,136'
                : color === '#38BDF8' ? '56,189,248'
                : color === '#A78BFA' ? '167,139,250'
                : color === '#FF4444' ? '255,68,68'
                : '136,136,136'
              },0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'ielgr-pulse 1.8s ease-in-out infinite' : 'none',
              }}>{val}</span>
              <span style={{ fontSize: 8, color: `${color}99`, letterSpacing: 1 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(255,68,68,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FF4444' : '#FF444433'}`,
                color: tab === t ? '#FF4444' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,68,68,0.04)',
              border: '1px solid #FF444433', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No intel profiles loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((prof, idx) => {
            const id = prof.id || prof.name || prof.title || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[prof.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4,
                background: `rgba(${
                  color === '#00FF88' ? '0,255,136'
                  : color === '#38BDF8' ? '56,189,248'
                  : color === '#A78BFA' ? '167,139,250'
                  : '255,68,68'
                },0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 80 }}>{prof.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {prof.name || prof.title || prof.actor || id}
                  </span>
                  {prof.threat_type && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{prof.threat_type}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {prof.type && (
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 6 }}>
                        type: <span style={{ color: '#aaa' }}>{prof.type}</span>
                      </div>
                    )}
                    {/* Matched SwarmJobs */}
                    {prof.matchedJobs.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED SWARM JOBS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {prof.matchedJobs.map((j, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {j.name || j.title || j.id}
                              {j.status && (
                                <span style={{ color: '#38BDF877', marginLeft: 4 }}>{j.status}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Reports */}
                    {prof.matchedReports.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED REPORTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {prof.matchedReports.map((r, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {r.name || r.title || r.id}
                              {(r.date || r.created_at || r.timestamp) && (
                                <span style={{ color: '#A78BFA77', marginLeft: 4 }}>
                                  {(r.date || r.created_at || r.timestamp || '').slice(0, 10)}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {prof.matchedJobs.length === 0 && prof.matchedReports.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FF444466' }}>No matching swarm jobs or reports found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FF444411' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,68,68,0.05)' : 'rgba(255,68,68,0.10)',
              border: '1px solid #FF444455', color: '#FF4444',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS EXECUTION LEDGER'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,68,68,0.03)',
              border: '1px solid #FF444422', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 84760, zIndex: 162,
          background: 'rgba(255,68,68,0.15)', border: '1px solid #FF4444',
          color: '#FF4444', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ IELGR ✕</button>

      <style>{`
        @keyframes ielgr-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
