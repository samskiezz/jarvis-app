/**
 * ScenarioInvestigationReportClosure — F42
 *
 * Fetches /v1/scenario/list + /v1/investigations + /v1/reports
 * Keyword-matches each scenario against investigations AND reports to classify:
 *   CLOSED       — matched both an investigation AND a report (fully mission-closed)
 *   INVESTIGATED — matched an investigation only (under investigation, not yet reported)
 *   REPORTED     — matched a report only (reported, no active investigation)
 *   OPEN         — no match in either (unhandled scenario, intelligence gap)
 *
 * Toggle: ◈ SCMISS button (fixed, bottom strip) left:72440, zIndex:140
 * Stat tiles: scenarios / investigations / reports / closed / investigated / reported / open
 * Amber pulse on OPEN count.
 * Expandable rows: matched investigations + matched reports.
 * Filter tabs: ALL / CLOSED / INVESTIGATED / REPORTED / OPEN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scenario closure"/"mission closure"/"scmiss"/"scenario investigation"/"scenario mission"/"open scenarios"
 * Event: jarvis:scmiss-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CLOSED', 'INVESTIGATED', 'REPORTED', 'OPEN'];

const CLS_COLOR = {
  CLOSED:       '#22c55e',
  INVESTIGATED: '#29E7FF',
  REPORTED:     '#A78BFA',
  OPEN:         '#F59E0B',
};

const PULSE_CSS = `@keyframes scmiss-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(scenToks, investigations, reports) {
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(scenToks, [inv.title, inv.name, inv.description, inv.summary, inv.tags, inv.type, inv.subject].join(' '))
  );
  const matchedReports = reports.filter(r =>
    overlaps(scenToks, [r.title, r.name, r.description, r.summary, r.tags, r.type, r.subject, r.content].join(' '))
  );
  if (matchedInvestigations.length > 0 && matchedReports.length > 0)
    return { cls: 'CLOSED', matchedInvestigations, matchedReports };
  if (matchedInvestigations.length > 0)
    return { cls: 'INVESTIGATED', matchedInvestigations, matchedReports: [] };
  if (matchedReports.length > 0)
    return { cls: 'REPORTED', matchedInvestigations: [], matchedReports };
  return { cls: 'OPEN', matchedInvestigations: [], matchedReports: [] };
}

export function isScmissQuery(q) {
  return /\b(scenario.clos|mission.clos|scmiss|scenario.invest|scenario.mission|open.scenario|scenario.report|mission.audit)\b/i.test(q);
}
export function buildScmissScript() {
  return 'Opening Scenario × Investigation × Report Mission Closure Audit. Cross-referencing all scenarios against active investigations and reports to identify open unhandled scenarios and mission closure gaps.';
}

export default function ScenarioInvestigationReportClosure() {
  const [open, setOpen]                         = useState(false);
  const [rows, setRows]                         = useState([]);
  const [investigationCount, setInvestigationCount] = useState(0);
  const [reportCount, setReportCount]           = useState(0);
  const [tab, setTab]                           = useState('ALL');
  const [search, setSearch]                     = useState('');
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState('');
  const [expanded, setExpanded]                 = useState(null);
  const [assessing, setAssessing]               = useState(false);
  const [assessment, setAssessment]             = useState('');
  const intervalRef                             = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [scRes, invRes, repRes] = await Promise.all([
        fetch(`${API}/v1/scenario/list`,   { headers: h }),
        fetch(`${API}/v1/investigations`,  { headers: h }),
        fetch(`${API}/v1/reports`,         { headers: h }),
      ]);
      const [scData, invData, repData] = await Promise.all([
        scRes.ok  ? scRes.json()  : [],
        invRes.ok ? invRes.json() : [],
        repRes.ok ? repRes.json() : [],
      ]);
      const scenarios     = Array.isArray(scData)  ? scData  : (scData?.items  || scData?.data  || scData?.results  || scData?.scenarios  || []);
      const investigations = Array.isArray(invData) ? invData : (invData?.items || invData?.data || invData?.results || invData?.investigations || []);
      const reports       = Array.isArray(repData)  ? repData  : (repData?.items  || repData?.data  || repData?.results  || repData?.reports  || []);

      setInvestigationCount(investigations.length);
      setReportCount(reports.length);

      const built = scenarios.map(sc => {
        const toks = tokens([sc.name, sc.title, sc.description, sc.tags, sc.type, sc.objective, sc.subject, sc.summary, sc.id].join(' '));
        const { cls, matchedInvestigations, matchedReports } = classify(toks, investigations, reports);
        return { ...sc, _cls: cls, _investigations: matchedInvestigations, _reports: matchedReports };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:scmiss-toggle', handler);
    return () => window.removeEventListener('jarvis:scmiss-toggle', handler);
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
    const counts = { CLOSED: 0, INVESTIGATED: 0, REPORTED: 0, OPEN: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const prompt = `Mission closure audit: ${rows.length} scenarios total — ${counts.CLOSED} fully closed (investigation+report), ${counts.INVESTIGATED} investigation-only (no report), ${counts.REPORTED} report-only (no investigation), ${counts.OPEN} completely open (no intelligence coverage). Assess mission closure quality and identify the most critical open scenarios requiring immediate investigation or reporting.`;
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

  const counts = { CLOSED: 0, INVESTIGATED: 0, REPORTED: 0, OPEN: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.title, r.type, r.objective, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 72440, zIndex: 140,
          background: 'rgba(245,158,11,0.12)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ SCMISS
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1e3a4a',
        borderRadius: 6, zIndex: 9141, display: 'flex', flexDirection: 'column',
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
            ◈ SCENARIO × INVESTIGATION × REPORT — SCMISS
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'SCENARIOS',     val: rows.length,          color: '#29E7FF' },
            { label: 'INVEST.',       val: investigationCount,    color: '#29E7FF' },
            { label: 'REPORTS',       val: reportCount,           color: '#29E7FF' },
            { label: 'CLOSED',        val: counts.CLOSED,         color: CLS_COLOR.CLOSED },
            { label: 'INVEST-ONLY',   val: counts.INVESTIGATED,   color: CLS_COLOR.INVESTIGATED },
            { label: 'REPORT-ONLY',   val: counts.REPORTED,       color: CLS_COLOR.REPORTED },
            {
              label: 'OPEN', val: counts.OPEN, color: CLS_COLOR.OPEN,
              pulse: counts.OPEN > 0,
            },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'scmiss-pulse 2s ease-in-out infinite' : 'none',
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
            placeholder="search scenarios…"
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
          {visible.map((sc, i) => {
            const isExp = expanded === (sc.id || i);
            return (
              <div key={sc.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (sc.id || i))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[sc._cls]}22`, color: CLS_COLOR[sc._cls],
                    border: `1px solid ${CLS_COLOR[sc._cls]}55`, letterSpacing: 1, minWidth: 88, textAlign: 'center',
                  }}>{sc._cls}</span>
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>
                    {sc.name || sc.title || sc.objective || `Scenario ${i + 1}`}
                  </span>
                  {sc.type && <span style={{ fontSize: 8, color: '#4a7a9a' }}>{sc.type}</span>}
                  {sc.status && <span style={{ fontSize: 8, color: '#3a6a8a' }}>{sc.status}</span>}
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {sc._investigations.length}I {sc._reports.length}R
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {sc._investigations.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>LINKED INVESTIGATIONS</div>
                        {sc._investigations.slice(0, 5).map((inv, ii) => (
                          <div key={ii} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {inv.title || inv.name || `Investigation ${ii + 1}`}
                            {inv.status && <span style={{ color: '#4a7a9a', marginLeft: 4 }}>{inv.status}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {sc._reports.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>LINKED REPORTS</div>
                        {sc._reports.slice(0, 5).map((r, ri) => (
                          <div key={ri} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {r.title || r.name || `Report ${ri + 1}`}
                            {r.date && <span style={{ color: '#5a5a9a', marginLeft: 4 }}>{r.date}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {sc._investigations.length === 0 && sc._reports.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No investigation or report — open scenario with zero intelligence closure.</div>
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
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS MISSION CLOSURE GAPS'}
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
          position: 'fixed', bottom: 8, left: 72440, zIndex: 9141,
          background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ SCMISS ✕
      </button>
    </>
  );
}
