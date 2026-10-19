/**
 * SwarmDatasetReportPipeline — F44
 *
 * Fetches /entities/SwarmJob + /v1/datasets + /v1/reports
 * Keyword-matches each swarm job against datasets AND reports to classify:
 *   PRODUCING — matched both a dataset AND a report (job is actively producing evidence)
 *   PLANNED   — matched a dataset only (job has input data, no report output yet)
 *   REPORTED  — matched a report only (output exists, no tracked dataset input)
 *   IDLE      — no match in either (job running but producing nothing traceable)
 *
 * Toggle: ◈ SWDRP button (fixed, bottom strip) left:73560, zIndex:142
 * Stat tiles: swarm jobs / datasets / reports / producing / planned / reported / idle
 * Amber pulse on IDLE count.
 * Expandable rows: matched datasets with row-count badge + matched reports with date badge.
 * Filter tabs: ALL / PRODUCING / PLANNED / REPORTED / IDLE + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swarm pipeline"/"production pipeline"/"swdrp"/"swarm dataset"/"swarm report"/"idle swarm"/"pipeline audit"
 * Event: jarvis:swdrp-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'PRODUCING', 'PLANNED', 'REPORTED', 'IDLE'];

const CLS_COLOR = {
  PRODUCING: '#22c55e',
  PLANNED:   '#29E7FF',
  REPORTED:  '#A78BFA',
  IDLE:      '#F59E0B',
};

const PULSE_CSS = `@keyframes swdrp-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(jobToks, datasets, reports) {
  const matchedDatasets = datasets.filter(ds =>
    overlaps(jobToks, [ds.name, ds.title, ds.description, ds.tags, ds.type, ds.category, ds.id, ds.source].join(' '))
  );
  const matchedReports = reports.filter(rp =>
    overlaps(jobToks, [rp.title, rp.name, rp.description, rp.tags, rp.type, rp.category, rp.summary, rp.author].join(' '))
  );
  if (matchedDatasets.length > 0 && matchedReports.length > 0)
    return { cls: 'PRODUCING', matchedDatasets, matchedReports };
  if (matchedDatasets.length > 0)
    return { cls: 'PLANNED', matchedDatasets, matchedReports: [] };
  if (matchedReports.length > 0)
    return { cls: 'REPORTED', matchedDatasets: [], matchedReports };
  return { cls: 'IDLE', matchedDatasets: [], matchedReports: [] };
}

export function isSwdrpQuery(q) {
  return /\b(swarm.pipeline|production.pipeline|swdrp|swarm.dataset|swarm.report|idle.swarm|pipeline.audit|swarm.production|job.pipeline)\b/i.test(q);
}
export function buildSwdrpScript() {
  return 'Opening SwarmJob × Dataset × Report Production Pipeline Audit. Cross-referencing all active swarm jobs against datasets and reports to identify producing pipelines and idle jobs.';
}

export default function SwarmDatasetReportPipeline() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [datasetCount, setDatasetCount] = useState(0);
  const [reportCount, setReportCount]   = useState(0);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState('');
  const intervalRef                   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [swRes, dsRes, rpRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`, { headers: h }),
        fetch(`${API}/v1/datasets`,       { headers: h }),
        fetch(`${API}/v1/reports`,        { headers: h }),
      ]);
      const [swData, dsData, rpData] = await Promise.all([
        swRes.ok ? swRes.json() : [],
        dsRes.ok ? dsRes.json() : [],
        rpRes.ok ? rpRes.json() : [],
      ]);
      const jobs     = Array.isArray(swData) ? swData : (swData?.items || swData?.data || swData?.results || swData?.jobs || []);
      const datasets = Array.isArray(dsData) ? dsData : (dsData?.items || dsData?.data || dsData?.results || dsData?.datasets || []);
      const reports  = Array.isArray(rpData) ? rpData : (rpData?.items || rpData?.data || rpData?.results || rpData?.reports || []);

      setDatasetCount(datasets.length);
      setReportCount(reports.length);

      const built = jobs.map(job => {
        const toks = tokens([job.name, job.title, job.description, job.tags, job.type, job.category, job.summary, job.id, job.target].join(' '));
        const { cls, matchedDatasets, matchedReports } = classify(toks, datasets, reports);
        return { ...job, _cls: cls, _datasets: matchedDatasets, _reports: matchedReports };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:swdrp-toggle', handler);
    return () => window.removeEventListener('jarvis:swdrp-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { PRODUCING: 0, PLANNED: 0, REPORTED: 0, IDLE: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const prompt = `SwarmJob production pipeline audit: ${rows.length} swarm jobs total — ${counts.PRODUCING} fully producing (matched datasets + reports), ${counts.PLANNED} planned (dataset input, no report output), ${counts.REPORTED} reported-only (output exists, no dataset trace), ${counts.IDLE} idle (no dataset or report match). Assess the production pipeline health, identify the highest-priority idle jobs that should be producing, and highlight any pipeline bottlenecks or orphaned outputs.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing]);

  const counts = { PRODUCING: 0, PLANNED: 0, REPORTED: 0, IDLE: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.title, r.type, r.category, r.id, r.target].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 73560, zIndex: 142,
          background: 'rgba(245,158,11,0.12)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ SWDRP
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1e3a4a',
        borderRadius: 6, zIndex: 9143, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #1e3a4a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(245,158,11,0.06)',
        }}>
          <span style={{ fontSize: 11, color: '#F59E0B', letterSpacing: 2 }}>
            ◈ SWARM × DATASET × REPORT — SWDRP
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'JOBS',      val: rows.length,        color: '#29E7FF' },
            { label: 'DATASETS',  val: datasetCount,       color: '#29E7FF' },
            { label: 'REPORTS',   val: reportCount,        color: '#29E7FF' },
            { label: 'PRODUCING', val: counts.PRODUCING,   color: CLS_COLOR.PRODUCING },
            { label: 'PLANNED',   val: counts.PLANNED,     color: CLS_COLOR.PLANNED },
            { label: 'REPORTED',  val: counts.REPORTED,    color: CLS_COLOR.REPORTED },
            {
              label: 'IDLE', val: counts.IDLE, color: CLS_COLOR.IDLE,
              pulse: counts.IDLE > 0,
            },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'swdrp-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #1e3a4a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#29E7FF'}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#2a4a5a'}`,
              color: tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#6A8BA0',
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, letterSpacing: 1,
            }}>{t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ''}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search jobs…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #2a4a5a',
              color: '#e2eaf0', padding: '2px 8px', borderRadius: 3, fontSize: 9, width: 140,
            }}
          />
        </div>

        {/* Status */}
        {loading && <div style={{ padding: '4px 14px', fontSize: 9, color: '#6A8BA0' }}>⟳ loading…</div>}
        {error   && <div style={{ padding: '4px 14px', fontSize: 9, color: '#ef4444' }}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.map((job, i) => {
            const isExp = expanded === (job.id || i);
            return (
              <div key={job.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (job.id || i))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[job._cls]}22`, color: CLS_COLOR[job._cls],
                    border: `1px solid ${CLS_COLOR[job._cls]}55`, letterSpacing: 1, minWidth: 76, textAlign: 'center',
                  }}>{job._cls}</span>
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>
                    {job.name || job.title || job.target || `Job ${i + 1}`}
                  </span>
                  {job.status && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: job.status === 'running' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                      color: job.status === 'running' ? '#22c55e' : '#4a7a9a',
                      border: `1px solid ${job.status === 'running' ? '#22c55e44' : '#2a4a5a'}`,
                    }}>{job.status}</span>
                  )}
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {job._datasets.length}D {job._reports.length}R
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {job._datasets.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED DATASETS</div>
                        {job._datasets.slice(0, 5).map((ds, di) => (
                          <div key={di} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {ds.name || ds.title || `Dataset ${di + 1}`}
                            {(ds.row_count || ds.rows) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {(ds.row_count || ds.rows).toLocaleString()} rows
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {job._reports.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED REPORTS</div>
                        {job._reports.slice(0, 5).map((rp, ri) => (
                          <div key={ri} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {rp.title || rp.name || `Report ${ri + 1}`}
                            {(rp.date || rp.created_at || rp.timestamp) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {(rp.date || rp.created_at || rp.timestamp || '').toString().slice(0, 10)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {job._datasets.length === 0 && job._reports.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No matched datasets or reports — job running with no traceable pipeline output.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1e3a4a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.15)',
              border: '1px solid #F59E0B', color: '#F59E0B',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS PIPELINE'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid #F59E0B', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
