/**
 * DatasetReportScenarioEvidenceGap — F37
 *
 * Fetches /v1/datasets + /v1/reports + /v1/scenario/list
 * Keyword-matches each dataset against reports AND scenarios to classify:
 *   EVIDENCED — matched both a report AND a scenario (fully covered)
 *   SCRIPTED  — matched a scenario only (ready to run, not yet reported)
 *   REPORTED  — matched a report only (analyzed, no scenario linked)
 *   RAW       — no match in either (orphan dataset, needs triage)
 *
 * Toggle: ◈ DRSEG button (fixed, bottom strip)
 * Stat tiles: datasets / reports / scenarios / evidenced / scripted / reported / raw
 * Amber pulse on RAW count.
 * Expandable rows: matched reports + matched scenarios.
 * Filter tabs: ALL / EVIDENCED / SCRIPTED / REPORTED / RAW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "evidence gap"/"dataset report"/"dataset scenario"/"drseg"/"raw dataset"/"orphan dataset"
 * Event: jarvis:drseg-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'EVIDENCED', 'SCRIPTED', 'REPORTED', 'RAW'];

const CLS_COLOR = {
  EVIDENCED: '#22c55e',
  SCRIPTED:  '#29E7FF',
  REPORTED:  '#A78BFA',
  RAW:       '#F59E0B',
};

const PULSE_CSS = `@keyframes drseg-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(dsToks, reports, scenarios) {
  const matchedReports   = reports.filter(r =>
    overlaps(dsToks, [r.title, r.name, r.description, r.tags, r.type, r.subject].join(' '))
  );
  const matchedScenarios = scenarios.filter(s =>
    overlaps(dsToks, [s.name, s.title, s.description, s.tags, s.type].join(' '))
  );
  if (matchedReports.length > 0 && matchedScenarios.length > 0)
    return { cls: 'EVIDENCED', matchedReports, matchedScenarios };
  if (matchedScenarios.length > 0)
    return { cls: 'SCRIPTED', matchedReports: [], matchedScenarios };
  if (matchedReports.length > 0)
    return { cls: 'REPORTED', matchedReports, matchedScenarios: [] };
  return { cls: 'RAW', matchedReports: [], matchedScenarios: [] };
}

export function isDrsegQuery(q) {
  return /\b(evidence.gap|dataset.report|dataset.scenario|drseg|raw.dataset|orphan.dataset|dataset.coverage|evidence.coverage|report.scenario)\b/i.test(q);
}
export function buildDrsegScript() {
  return 'Opening Dataset-Report-Scenario Evidence Gap. Cross-referencing all datasets against published reports and active scenarios to surface raw orphan datasets with no evidence trail.';
}

export default function DatasetReportScenarioEvidenceGap() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [reportCount, setReportCount]     = useState(0);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [dsRes, repRes, scnRes] = await Promise.all([
        fetch(`${API}/v1/datasets`, { headers }),
        fetch(`${API}/v1/reports`, { headers }),
        fetch(`${API}/v1/scenario/list`, { headers }),
      ]);
      const dsData  = dsRes.ok  ? await dsRes.json()  : [];
      const repData = repRes.ok ? await repRes.json() : [];
      const scnData = scnRes.ok ? await scnRes.json() : [];

      const datasets  = Array.isArray(dsData)  ? dsData  : (dsData.items  || dsData.data  || dsData.datasets  || []);
      const reports   = Array.isArray(repData) ? repData : (repData.items || repData.data || repData.reports   || []);
      const scenarios = Array.isArray(scnData) ? scnData : (scnData.items || scnData.data || scnData.scenarios || []);

      setReportCount(reports.length);
      setScenarioCount(scenarios.length);

      const classified = datasets.map(ds => {
        const name  = ds.name || ds.title || ds.id || '';
        const dsToks = tokens([name, ds.description, ds.tags, ds.type, ds.category, ds.topic].join(' '));
        const { cls, matchedReports, matchedScenarios } = classify(dsToks, reports, scenarios);
        return { ...ds, _name: name || ds.id || 'Unknown', _cls: cls, _reports: matchedReports, _scenarios: matchedScenarios };
      });
      setRows(classified);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(v => !v); };
    window.addEventListener('jarvis:drseg-toggle', handler);
    return () => window.removeEventListener('jarvis:drseg-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const counts = { EVIDENCED: 0, SCRIPTED: 0, REPORTED: 0, RAW: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r._name + (r.description || '') + (r.type || '')).toLowerCase().includes(q);
    }
    return true;
  });

  const speak = useCallback(text => {
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const rawNames = rows.filter(r => r._cls === 'RAW').map(r => r._name).slice(0, 5).join(', ');
    const prompt = `Dataset-Report-Scenario Evidence Gap analysis: ${rows.length} datasets total. ` +
      `EVIDENCED (report+scenario): ${counts.EVIDENCED}, SCRIPTED (scenario only): ${counts.SCRIPTED}, ` +
      `REPORTED (report only): ${counts.REPORTED}, RAW (orphan, no coverage): ${counts.RAW}. ` +
      `${counts.RAW > 0 ? `Orphan datasets with no evidence trail: ${rawNames || 'multiple'}. ` : ''}` +
      `Published reports: ${reportCount}. Active scenarios: ${scenarioCount}. ` +
      `In two sentences, identify the most critical evidence gap and recommend the immediate triage action.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const txt = d.response || d.message || d.reply || d.content || 'No response.';
      setAssessment(txt);
      speak(txt);
    } catch (e) {
      setAssessment(e.message);
    } finally {
      setAssessing(false);
    }
  }, [rows, counts, reportCount, scenarioCount, speak]);

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 69640, zIndex: 135,
            background: 'rgba(0,0,0,0.75)', border: '1px solid #F59E0B',
            color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ DRSEG
          {counts.RAW > 0 && (
            <span style={{ marginLeft: 4, color: '#F59E0B', animation: 'drseg-pulse 1.5s infinite' }}>
              {counts.RAW}▲
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
        width: 820, maxHeight: '80vh', overflowY: 'auto',
        background: 'rgba(8,12,18,0.97)', border: '1px solid #F59E0B',
        borderRadius: 8, zIndex: 9135, fontFamily: 'monospace', fontSize: 11, color: '#c8d8e0',
        boxShadow: '0 0 30px rgba(245,158,11,0.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #1e3a4a' }}>
          <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2 }}>◈ DATASET × REPORT × SCENARIO — EVIDENCE GAP</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #F59E0B', color: '#F59E0B', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #1e3a4a', flexWrap: 'wrap' }}>
          {[
            ['DATASETS',  rows.length,       '#c8d8e0'],
            ['REPORTS',   reportCount,       '#c8d8e0'],
            ['SCENARIOS', scenarioCount,     '#c8d8e0'],
            ['EVIDENCED', counts.EVIDENCED,  CLS_COLOR.EVIDENCED],
            ['SCRIPTED',  counts.SCRIPTED,   CLS_COLOR.SCRIPTED],
            ['REPORTED',  counts.REPORTED,   CLS_COLOR.REPORTED],
            ['RAW',       counts.RAW,        CLS_COLOR.RAW],
          ].map(([label, val, col]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center' }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#6A8BA0', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', alignItems: 'center', borderBottom: '1px solid #1e3a4a' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CLS_COLOR[t] || '#F59E0B' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${CLS_COLOR[t] || '#F59E0B'}`,
              color: tab === t ? '#000' : (CLS_COLOR[t] || '#F59E0B'),
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search datasets…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #1e3a4a', color: '#c8d8e0', padding: '3px 8px', borderRadius: 3, fontSize: 10 }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '4px 14px' }}>
          {loading && <div style={{ color: '#6A8BA0', padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#FF4D6D', padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && <div style={{ color: '#6A8BA0', padding: 12 }}>No datasets match filter.</div>}
          {visible.map((ds, i) => {
            const isExp = expanded === i;
            return (
              <div key={ds.id || i} style={{ borderBottom: '1px solid #1a2a36', padding: '6px 0' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : i)}
                >
                  <span style={{ color: CLS_COLOR[ds._cls], fontSize: 9, minWidth: 68, fontWeight: 700 }}>{ds._cls}</span>
                  <span style={{ flex: 1, color: '#e2eaf0' }}>{ds._name}</span>
                  {ds.type && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(41,231,255,0.1)', color: '#29E7FF' }}>{ds.type}</span>
                  )}
                  {ds.rows_count !== undefined && (
                    <span style={{ color: '#6A8BA0', fontSize: 9 }}>{ds.rows_count.toLocaleString()} rows</span>
                  )}
                  <span style={{ color: '#4a6a7a', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ marginTop: 6, paddingLeft: 16, paddingBottom: 6 }}>
                    {ds._reports.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#A78BFA', fontSize: 9, marginBottom: 3 }}>LINKED REPORTS ({ds._reports.length})</div>
                        {ds._reports.slice(0, 4).map((r, ri) => (
                          <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#A78BFA', fontSize: 9 }}>◉</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{r.title || r.name || `Report ${ri + 1}`}</span>
                            {r.type && (
                              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#A78BFA22', color: '#A78BFA' }}>{r.type}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {ds._scenarios.length > 0 && (
                      <div>
                        <div style={{ color: '#29E7FF', fontSize: 9, marginBottom: 3 }}>LINKED SCENARIOS ({ds._scenarios.length})</div>
                        {ds._scenarios.slice(0, 4).map((s, si) => (
                          <div key={si} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#29E7FF', fontSize: 9 }}>▶</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{s.name || s.title || `Scenario ${si + 1}`}</span>
                            {s.type && (
                              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#29E7FF22', color: '#29E7FF' }}>{s.type}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {ds._reports.length === 0 && ds._scenarios.length === 0 && (
                      <div style={{ color: '#F59E0B', fontSize: 9 }}>⚠ No reports or scenarios linked — orphan dataset, triage required.</div>
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
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS EVIDENCE GAP'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid #F59E0B', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>

      {/* Collapsed toggle */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 69640, zIndex: 9136,
          background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ DRSEG ✕
      </button>
    </>
  );
}
