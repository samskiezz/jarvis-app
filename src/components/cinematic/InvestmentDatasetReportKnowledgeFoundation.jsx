/**
 * InvestmentDatasetReportKnowledgeFoundation — F234
 *
 * Fetches /entities/Investment + /v1/datasets + /v1/reports + /knowledge/
 *
 * Keyword-matches each investment (name/type/sector/description) against
 * datasets, reports, and knowledge articles to classify:
 *
 *   FORTIFIED — matched all 3 sources (dataset + report + knowledge)
 *               (full intelligence foundation: data-backed, documented, researched)
 *   SOURCED   — matched 2 of 3 sources
 *               (partially grounded investment with some data support)
 *   REPORTED  — matched 1 source only
 *               (minimal intelligence backing — wealth blind risk)
 *   EXPOSED   — no match to any source
 *               (full wealth blind spot: no dataset, no report, no knowledge article)
 *
 * Toggle: ◈ WIFDTN button (fixed, bottom strip) left:178840, zIndex:330
 * Stat tiles: investments / datasets / reports / knowledge / fortified / sourced / reported / exposed
 * Red pulse on EXPOSED count (wealth blind spots).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched reports with date badge +
 *                  matched knowledge articles with category badge.
 * Filter tabs: ALL / FORTIFIED / SOURCED / REPORTED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "wifdtn"/"wealth foundation"/"investment knowledge"/"investment data"/"investment report"/
 *        "exposed investment"/"wealth blind spot"/"investment intelligence"/"investment coverage"
 * Event: jarvis:wifdtn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'FORTIFIED', 'SOURCED', 'REPORTED', 'EXPOSED'];

const CLS_COLOR = {
  FORTIFIED: '#00E5A0',
  SOURCED:   '#38BDF8',
  REPORTED:  '#A78BFA',
  EXPOSED:   '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeList(raw, altKey) {
  if (Array.isArray(raw))                         return raw;
  if (altKey && Array.isArray(raw?.[altKey]))     return raw[altKey];
  if (Array.isArray(raw?.items))                  return raw.items;
  if (Array.isArray(raw?.results))                return raw.results;
  if (Array.isArray(raw?.data))                   return raw.data;
  return [];
}

function investmentLabel(inv) {
  return inv?.name || inv?.title || inv?.id || '—';
}

function investmentText(inv) {
  return [
    inv?.name, inv?.title, inv?.type, inv?.sector, inv?.description,
    inv?.asset_class, inv?.tags?.join?.(' '),
  ].join(' ');
}

function classify(inv, datasets, reports, knowledge) {
  const itoks = tokens(investmentText(inv));

  const matchedDatasets = datasets.filter(d =>
    overlaps(itoks, [d?.name, d?.title, d?.description, d?.category, d?.tags?.join?.(' ')].join(' '))
  );
  const matchedReports = reports.filter(r =>
    overlaps(itoks, [r?.title, r?.name, r?.summary, r?.description, r?.type, r?.tags?.join?.(' ')].join(' '))
  );
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(itoks, [k?.title, k?.name, k?.summary, k?.description, k?.category, k?.tags?.join?.(' ')].join(' '))
  );

  const srcCount = [
    matchedDatasets.length > 0,
    matchedReports.length > 0,
    matchedKnowledge.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (srcCount === 3)      cls = 'FORTIFIED';
  else if (srcCount === 2) cls = 'SOURCED';
  else if (srcCount === 1) cls = 'REPORTED';
  else                     cls = 'EXPOSED';

  return { cls, matchedDatasets, matchedReports, matchedKnowledge };
}

/* ─── exported query helpers ─── */
export function isWifdtnQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'wifdtn', 'wealth foundation', 'investment knowledge', 'investment data',
    'investment report', 'exposed investment', 'wealth blind spot',
    'investment intelligence', 'investment coverage',
  ].some(k => s.includes(k));
}

export function buildWifdtnScript() {
  return (
    'Fetch /entities/Investment, /v1/datasets, /v1/reports, and /knowledge/. ' +
    'Keyword-match each investment (name/type/sector/description) against ' +
    'dataset names/descriptions, report titles/summaries, and knowledge article titles/summaries. ' +
    'Classify each investment as FORTIFIED (matched dataset + report + knowledge — ' +
    'full intelligence foundation: data-backed, documented, researched), ' +
    'SOURCED (matched 2 of 3 sources — partially grounded), ' +
    'REPORTED (matched 1 source only — minimal intelligence backing), ' +
    'or EXPOSED (no match to any source — full wealth blind spot with no dataset, no report, no knowledge). ' +
    'Report the total EXPOSED count, identify which exposed investments represent the highest ' +
    'financial risk, and recommend which datasets should be linked, ' +
    'which reports should be filed, and which knowledge articles should be created.'
  );
}

/* ─── component ─── */
export default function InvestmentDatasetReportKnowledgeFoundation() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing]   = useState(false);
  const timerRef                    = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };

      const [rInvestments, rDatasets, rReports, rKnowledge] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase()}/v1/datasets`,         { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase()}/v1/reports`,          { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase()}/knowledge/`,          { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const investments = normalizeList(rInvestments, 'investments');
      const datasets    = normalizeList(rDatasets,    'datasets');
      const reports     = normalizeList(rReports,     'reports');
      const knowledge   = normalizeList(rKnowledge,   'articles');

      const classified = investments.map(inv => ({
        inv,
        ...classify(inv, datasets, reports, knowledge),
      }));

      setRows(classified);
    } catch (_) {
      // network error — leave existing rows
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:wifdtn-toggle', handler);
    return () => window.removeEventListener('jarvis:wifdtn-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { FORTIFIED: 0, SOURCED: 0, REPORTED: 0, EXPOSED: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return investmentLabel(r.inv).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildWifdtnScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      if (txt) {
        try {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ text: txt.slice(0, 400) }),
          });
        } catch (_) {}
      }
    } catch (_) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const exposedPulse = counts.EXPOSED > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 178840,
    zIndex: 330,
    background: exposedPulse ? 'rgba(239,68,68,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${exposedPulse ? '#EF4444' : 'rgba(100,116,139,0.5)'}`,
    color: exposedPulse ? '#EF4444' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: exposedPulse ? 'jarvis-pulse-red 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 700,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8,
    zIndex: 3300,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(239,68,68,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Investment × Dataset × Report × Knowledge Wealth Intelligence Foundation">
        ◈ WIFDTN{counts.EXPOSED > 0 ? ` [${counts.EXPOSED}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
              ◈ INVESTMENT × DATASET × REPORT × KNOWLEDGE
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {[
              { label: 'INVESTMENTS', val: rows.length,          color: '#94A3B8' },
              { label: 'FORTIFIED',   val: counts.FORTIFIED,     color: CLS_COLOR.FORTIFIED },
              { label: 'SOURCED',     val: counts.SOURCED,       color: CLS_COLOR.SOURCED },
              { label: 'REPORTED',    val: counts.REPORTED,      color: CLS_COLOR.REPORTED },
              { label: 'EXPOSED',     val: counts.EXPOSED,       color: CLS_COLOR.EXPOSED },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 88, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(239,68,68,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(239,68,68,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #EF4444' : '2px solid transparent',
                color: tab === t ? '#EF4444' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 180 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No investments match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { inv, cls, matchedDatasets, matchedReports, matchedKnowledge } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 72, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{investmentLabel(inv)}</span>
                    {inv?.type && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{inv.type}</span>
                    )}
                    {inv?.value != null && (
                      <span style={{ color: '#475569', fontSize: 9, background: 'rgba(255,255,255,0.03)', padding: '1px 5px', borderRadius: 2 }}>
                        {typeof inv.value === 'number' ? `$${inv.value.toLocaleString()}` : inv.value}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* datasets */}
                      {matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>DATASETS ({matchedDatasets.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedDatasets.slice(0, 6).map((d, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {d?.name || d?.title || d?.id || '—'}{d?.row_count != null ? ` · ${d.row_count.toLocaleString()} rows` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* reports */}
                      {matchedReports.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>REPORTS ({matchedReports.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedReports.slice(0, 6).map((r, i) => (
                              <span key={i} style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {r?.title || r?.name || r?.id || '—'}{r?.date || r?.created_at ? ` · ${(r.date || r.created_at || '').slice(0, 10)}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* knowledge */}
                      {matchedKnowledge.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>KNOWLEDGE ({matchedKnowledge.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedKnowledge.slice(0, 6).map((k, i) => (
                              <span key={i} style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', color: '#00E5A0', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {k?.title || k?.name || k?.id || '—'}{k?.category ? ` · ${k.category}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedDatasets.length === 0 && matchedReports.length === 0 && matchedKnowledge.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — full wealth blind spot with no data, report, or knowledge foundation.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
                border: '1px solid #EF4444', color: '#EF4444',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS EXPOSED INVESTMENTS'}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
                background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
