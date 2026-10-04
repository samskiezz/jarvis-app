import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_DOCUMENTED', 'SCENARIO_ONLY', 'REPORT_ONLY', 'DARK'];

const CLASS_COLOR = {
  FULLY_DOCUMENTED: '#00ff88',
  SCENARIO_ONLY:    '#ffd700',
  REPORT_ONLY:      '#00bfff',
  DARK:             '#ff4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aTokens, bStr) {
  const setB = new Set(tokens(bStr));
  return aTokens.some(t => setB.has(t));
}

export default function SwarmScenarioReportNexus() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [jobsRes, scenRes, rptRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`),
        fetch(`${API}/v1/scenario/list`),
        fetch(`${API}/v1/reports`),
      ]);
      const jobsData = jobsRes.ok ? await jobsRes.json() : {};
      const scenData = scenRes.ok ? await scenRes.json() : {};
      const rptData  = rptRes.ok  ? await rptRes.json()  : {};

      const jobs      = jobsData.items     || jobsData.data      || jobsData.jobs      || [];
      const scenarios = scenData.scenarios || scenData.items     || scenData.data      || [];
      const reports   = rptData.reports    || rptData.items      || rptData.data       || [];

      // Build text blobs
      const scenBlobs = scenarios.map(s => ({
        id:    s.id || s.scenario_id,
        title: s.name || s.title || '',
        text:  [s.name, s.title, s.description, s.type, ...(s.tags || [])].filter(Boolean).join(' '),
      }));
      const rptBlobs = reports.map(r => ({
        id:    r.id || r.report_id,
        title: r.title || r.name || '',
        topic: r.topic || r.type || '',
        text:  [r.title, r.name, r.topic, r.summary, r.type, ...(r.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = jobs.map(job => {
        const jobToks = [
          job.name, job.title, job.description, job.target,
          job.objective, job.type, job.status,
          ...(job.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedScen = scenBlobs.filter(s => overlaps(jobToks, s.text)).slice(0, 4);
        const matchedRpt  = rptBlobs.filter(r => overlaps(jobToks, r.text)).slice(0, 4);

        const hasScen = matchedScen.length > 0;
        const hasRpt  = matchedRpt.length > 0;

        let cls;
        if (hasScen && hasRpt) cls = 'FULLY_DOCUMENTED';
        else if (hasScen)      cls = 'SCENARIO_ONLY';
        else if (hasRpt)       cls = 'REPORT_ONLY';
        else                   cls = 'DARK';

        return { ...job, _class: cls, _scen: matchedScen, _rpt: matchedRpt };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:ssrin-toggle', handler);
    return () => window.removeEventListener('jarvis:ssrin-toggle', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const counts = {
    ALL:               rows.length,
    FULLY_DOCUMENTED:  rows.filter(r => r._class === 'FULLY_DOCUMENTED').length,
    SCENARIO_ONLY:     rows.filter(r => r._class === 'SCENARIO_ONLY').length,
    REPORT_ONLY:       rows.filter(r => r._class === 'REPORT_ONLY').length,
    DARK:              rows.filter(r => r._class === 'DARK').length,
  };

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.title, r.description, r.status, r.target]
      .filter(Boolean).some(v => v.toLowerCase().includes(q));
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.FULLY_DOCUMENTED} swarm jobs fully documented (scenario+report), ${counts.SCENARIO_ONLY} scenario-only, ${counts.REPORT_ONLY} report-only, ${counts.DARK} dark (no coverage).`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `SwarmJob × Scenario × Report Intelligence Nexus (SSRIN): ${summary} Provide a 2-sentence operational brief on which dark swarm jobs represent the highest mission documentation risk and what actions are recommended.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8460, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #7c3aed',
          color: '#7c3aed', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ SSRIN
        {counts.DARK > 0 && (
          <span style={{
            background: '#ff4444', color: '#fff', borderRadius: 10,
            padding: '1px 6px', fontSize: 10, fontWeight: 700,
          }}>
            {counts.DARK}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.93)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #1a0033',
        background: 'rgba(5,0,15,0.9)',
      }}>
        <div>
          <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: 16 }}>◈ SSRIN</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            SwarmJob × Scenario × Report Intelligence Nexus
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(124,58,237,0.1)', border: '1px solid #7c3aed',
              color: '#7c3aed', padding: '4px 12px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            ⟳
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
        {[
          ['FULLY_DOCUMENTED', counts.FULLY_DOCUMENTED],
          ['SCENARIO_ONLY',    counts.SCENARIO_ONLY],
          ['REPORT_ONLY',      counts.REPORT_ONLY],
          ['DARK',             counts.DARK],
        ].map(([k, v]) => (
          <div
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${CLASS_COLOR[k]}44`,
              borderLeft: `3px solid ${CLASS_COLOR[k]}`,
              borderRadius: 6, padding: '8px 16px', minWidth: 160, cursor: 'pointer',
            }}
          >
            <div style={{ color: CLASS_COLOR[k], fontSize: 22, fontWeight: 700 }}>{v}</div>
            <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
          borderRadius: 6, padding: '8px 16px', minWidth: 120,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{counts.ALL}</div>
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL JOBS</div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(124,58,237,0.05)',
          border: '1px solid #7c3aed44', borderRadius: 6, padding: '8px 12px',
          color: '#a78bfa', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(124,58,237,0.2)' : 'transparent',
            border: `1px solid ${tab === t ? '#7c3aed' : '#333'}`,
            color: tab === t ? '#7c3aed' : '#666',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            {t} ({counts[t] ?? 0})
          </button>
        ))}
        <input
          placeholder="Search jobs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333', borderRadius: 4, color: '#e0e0e0',
            padding: '4px 10px', fontSize: 11, width: 220,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {loading && <div style={{ color: '#555', fontSize: 12, padding: 16 }}>⟳ Loading…</div>}
        {err && <div style={{ color: '#ff4444', fontSize: 12, padding: 16 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, padding: 16 }}>No swarm jobs match.</div>
        )}
        {!loading && filtered.map((job, i) => {
          const jid = job.id || job.job_id || i;
          const isExp = expanded === jid;
          const col = CLASS_COLOR[job._class] || '#888';
          return (
            <div
              key={jid}
              onClick={() => setExpanded(isExp ? null : jid)}
              style={{ borderBottom: '1px solid #1a1a1a', padding: '8px 0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, minWidth: 150, fontWeight: 600 }}>
                  {job._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {job.name || job.title || job.description || `Job ${jid}`}
                </span>
                {job.status && (
                  <span style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid #333',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#888',
                  }}>
                    {job.status}
                  </span>
                )}
                <span style={{ color: '#333', fontSize: 10 }}>▾</span>
              </div>

              {isExp && (
                <div style={{
                  marginTop: 6, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4, fontSize: 11,
                }}>
                  {job.description && (
                    <div style={{ color: '#888', marginBottom: 8 }}>{job.description}</div>
                  )}

                  {/* Scenario matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#ffd700', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      SCENARIOS ({job._scen.length})
                    </div>
                    {job._scen.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No scenarios matched.</div>
                      : job._scen.map((s, si) => (
                        <div key={si} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          <span style={{ color: '#ffd700', fontSize: 10, flex: 1 }}>{s.title || s.id}</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* Report matches */}
                  <div>
                    <div style={{ color: '#00bfff', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      REPORTS ({job._rpt.length})
                    </div>
                    {job._rpt.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No reports matched.</div>
                      : job._rpt.map((r, ri) => (
                        <div key={ri} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {r.topic && (
                            <span style={{
                              background: '#00bfff22', border: '1px solid #00bfff',
                              color: '#00bfff', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {r.topic}
                            </span>
                          )}
                          <span style={{ color: '#00bfff', fontSize: 10, flex: 1 }}>{r.title || r.id}</span>
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

      {/* footer */}
      <div style={{
        padding: '6px 20px', borderTop: '1px solid #1a1a1a',
        color: '#444', fontSize: 10, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>SSRIN — auto-refresh 90s · /entities/SwarmJob · /v1/scenario/list · /v1/reports</span>
        <span>{filtered.length} of {rows.length} shown</span>
      </div>
    </div>
  );
}

export function isSsrinQuery(q) {
  const lower = q.toLowerCase();
  return [
    'ssrin', 'swarm scenario report', 'swarm report scenario',
    'swarm documentation', 'dark swarm', 'undocumented swarm',
    'swarm mission report', 'job scenario report', 'swarm scenario nexus',
    'swarm report nexus', 'swarm nexus', 'job documentation coverage',
    'which swarm jobs have reports', 'swarm coverage nexus',
  ].some(kw => lower.includes(kw));
}

export function buildSsrinScript() {
  return 'Opening SwarmJob × Scenario × Report Intelligence Nexus…';
}
