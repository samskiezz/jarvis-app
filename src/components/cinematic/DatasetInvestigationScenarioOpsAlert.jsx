/**
 * DatasetInvestigationScenarioOpsAlert — F220
 *
 * Fetches /v1/datasets + /v1/investigations + /v1/scenario/list +
 *         /v1/ops/alerts
 *
 * Keyword-matches each dataset (name/description/tags/type) against
 * investigation titles/descriptions, scenario names/descriptions, and
 * ops alert titles/types to classify:
 *
 *   PROSECUTED — matches all 3 sources (investigation + scenario + alert)
 *                (fully grounded evidence: under investigation, scripted, monitored)
 *   TRACKED    — matches investigation + scenario or investigation + alert (2 sources)
 *                (under investigation with partial operational coverage)
 *   STAGED     — matches scenario only OR alert only (1 source)
 *                (dataset has a playbook or alert but no active investigation)
 *   ORPHAN     — no match to any source
 *                (evidence dead-end: no investigation, no scenario, no alert)
 *
 * Toggle: ◈ DISPRO button (fixed, bottom strip) left:171000, zIndex:316
 * Stat tiles: datasets / investigations / scenarios / alerts /
 *             prosecuted / tracked / staged / orphan
 * Amber pulse on ORPHAN count (evidence blind spots).
 * Expandable rows: matched investigations with status badge +
 *                  matched scenarios with status badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / PROSECUTED / TRACKED / STAGED / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dispro"/"dataset investigation"/"evidence prosecution"/"dataset scenario"/
 *        "evidence gap"/"evidence coverage"/"dataset ops"/"dataset blind spot"/
 *        "investigation evidence"/"evidence dead end"/"orphan dataset"
 * Event: jarvis:dispro-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'PROSECUTED', 'TRACKED', 'STAGED', 'ORPHAN'];

const CLS_COLOR = {
  PROSECUTED: '#22C55E',
  TRACKED:    '#38BDF8',
  STAGED:     '#F59E0B',
  ORPHAN:     '#F59E0B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.datasets))    return raw.datasets;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                   return raw;
  if (Array.isArray(raw?.items))            return raw.items;
  if (Array.isArray(raw?.investigations))   return raw.investigations;
  if (Array.isArray(raw?.results))          return raw.results;
  if (Array.isArray(raw?.data))             return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function dsLabel(ds) {
  return ds?.name || ds?.title || ds?.id || 'Untitled';
}

function dsText(ds) {
  return [ds?.name, ds?.title, ds?.description, ds?.tags?.join?.(' '), ds?.type, ds?.category].join(' ');
}

function classify(ds, investigations, scenarios, alerts) {
  const dtoks = tokens(dsText(ds));

  const matchedInvestigations = investigations.filter(inv =>
    overlaps(dtoks, [inv?.title, inv?.name, inv?.description, inv?.summary, inv?.tags?.join?.(' '), inv?.type].join(' '))
  );
  const matchedScenarios = scenarios.filter(sc =>
    overlaps(dtoks, [sc?.name, sc?.title, sc?.description, sc?.objective, sc?.tags?.join?.(' ')].join(' '))
  );
  const matchedAlerts = alerts.filter(al =>
    overlaps(dtoks, [al?.title, al?.name, al?.type, al?.description, al?.source, al?.category].join(' '))
  );

  const hasInv     = matchedInvestigations.length > 0;
  const hasScenario = matchedScenarios.length > 0;
  const hasAlert   = matchedAlerts.length > 0;

  let cls;
  if (hasInv && hasScenario && hasAlert) {
    cls = 'PROSECUTED';
  } else if (hasInv && (hasScenario || hasAlert)) {
    cls = 'TRACKED';
  } else if (hasInv) {
    cls = 'TRACKED';
  } else if (hasScenario || hasAlert) {
    cls = 'STAGED';
  } else {
    cls = 'ORPHAN';
  }

  return { cls, matchedInvestigations, matchedScenarios, matchedAlerts };
}

/* ─── exported query helper ─── */
export function isDisproQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'dispro', 'dataset investigation', 'evidence prosecution', 'dataset scenario',
    'evidence gap', 'evidence coverage', 'dataset ops', 'dataset blind spot',
    'investigation evidence', 'evidence dead end', 'orphan dataset',
  ].some(k => s.includes(k));
}

export function buildDisproScript() {
  return (
    'Fetch /v1/datasets, /v1/investigations, /v1/scenario/list, ' +
    'and /v1/ops/alerts. ' +
    'Keyword-match each dataset (name/description/tags/type) against ' +
    'investigation titles/descriptions, scenario names/descriptions, ' +
    'and ops alert titles/types. ' +
    'Classify each dataset as PROSECUTED (matches investigation + scenario + alert — ' +
    'fully grounded evidence: under active investigation, scripted in a playbook, and monitored), ' +
    'TRACKED (matches investigation only or investigation + one other source — ' +
    'under investigation but with partial operational coverage), ' +
    'STAGED (matches scenario or alert only — has a playbook or alert but no active investigation), ' +
    'or ORPHAN (no match to any source — evidence dead-end: dataset with no investigation, ' +
    'no scenario playbook, and no ops alert monitoring — full blind spot). ' +
    'Report the total ORPHAN count, identify which orphaned datasets represent the highest ' +
    'evidence risk (e.g. large row counts, sensitive categories, or recently updated), ' +
    'and recommend which investigations should reference them, ' +
    'which scenarios should incorporate them as evidence sources, ' +
    'and which ops alerts should be configured to monitor them.'
  );
}

/* ─── component ─── */
export default function DatasetInvestigationScenarioOpsAlert() {
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
      const [rDs, rInv, rSc, rAl] = await Promise.all([
        fetch(`${API}/v1/datasets`,       { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/investigations`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/scenario/list`,  { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/ops/alerts`,     { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const datasets        = normalizeDatasets(rDs);
      const investigations  = normalizeInvestigations(rInv);
      const scenarios       = normalizeScenarios(rSc);
      const alerts          = normalizeAlerts(rAl);

      const classified = datasets.map(ds => ({
        ds,
        ...classify(ds, investigations, scenarios, alerts),
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
    window.addEventListener('jarvis:dispro-toggle', handler);
    return () => window.removeEventListener('jarvis:dispro-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { PROSECUTED: 0, TRACKED: 0, STAGED: 0, ORPHAN: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return dsLabel(r.ds).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildDisproScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      if (txt) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
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

  const orphanPulse = counts.ORPHAN > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 171000,
    zIndex: 316,
    background: orphanPulse ? 'rgba(245,158,11,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${orphanPulse ? '#F59E0B' : 'rgba(100,116,139,0.5)'}`,
    color: orphanPulse ? '#F59E0B' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: orphanPulse ? 'jarvis-pulse-amber 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 680,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(245,158,11,0.35)',
    borderRadius: 8,
    zIndex: 3160,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(245,158,11,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Dataset × Investigation × Scenario × Ops Alert Evidence Prosecution Coverage">
        ◈ DISPRO{counts.ORPHAN > 0 ? ` [${counts.ORPHAN}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: 12 }}>
              ◈ DATASET × INVESTIGATION × SCENARIO × OPS ALERT
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
            {[
              { label: 'DATASETS',   val: rows.length,           color: '#94A3B8' },
              { label: 'PROSECUTED', val: counts.PROSECUTED,     color: CLS_COLOR.PROSECUTED },
              { label: 'TRACKED',    val: counts.TRACKED,        color: CLS_COLOR.TRACKED },
              { label: 'STAGED',     val: counts.STAGED,         color: CLS_COLOR.STAGED },
              { label: 'ORPHAN',     val: counts.ORPHAN,         color: CLS_COLOR.ORPHAN },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(245,158,11,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(245,158,11,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #F59E0B' : '2px solid transparent',
                color: tab === t ? '#F59E0B' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 170 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No datasets match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { ds, cls, matchedInvestigations, matchedScenarios, matchedAlerts } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 80, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dsLabel(ds)}</span>
                    {ds?.row_count != null && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{ds.row_count.toLocaleString()} rows</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* investigations */}
                      {matchedInvestigations.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>INVESTIGATIONS ({matchedInvestigations.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedInvestigations.slice(0, 6).map((inv, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {inv?.title || inv?.name || inv?.id || '—'} · {inv?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* scenarios */}
                      {matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SCENARIOS ({matchedScenarios.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedScenarios.slice(0, 6).map((sc, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {sc?.name || sc?.title || sc?.id || '—'} · {sc?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* alerts */}
                      {matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>OPS ALERTS ({matchedAlerts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedAlerts.slice(0, 6).map((al, i) => (
                              <span key={i} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {al?.title || al?.name || al?.id || '—'} · {al?.severity || al?.level || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedInvestigations.length === 0 && matchedScenarios.length === 0 && matchedAlerts.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — evidence dead-end.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.2)',
                border: '1px solid #F59E0B', color: '#F59E0B',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS ORPHAN DATASETS'}
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
