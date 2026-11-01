/**
 * DatasetOpsScenarioContactActivation — F250
 *
 * Fetches /v1/datasets + /v1/ops/alerts +
 *         /v1/scenario/list + /entities/Contact
 *
 * Keyword-matches each dataset (name/description/tags)
 * against ops alerts, scenarios, and contacts to classify:
 *
 *   ACTIVATED — matches all 3 sources
 *   MONITORED — matches 2 of 3 sources
 *   STAGED    — matches exactly 1 source
 *   DARK      — no match to any source
 *               (datasets with no alert, no scenario, no contact owner)
 *
 * Toggle: ◈ DOSCAM button (fixed, bottom strip) left:187800, zIndex:346
 * Stat tiles: datasets / alerts / scenarios / contacts /
 *             activated / monitored / staged / dark
 * Red pulse on DARK count (evidence blind spots).
 * Expandable rows: matched ops alerts with severity badge +
 *                  matched scenarios with status badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / ACTIVATED / MONITORED / STAGED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "doscam"/"dataset ops scenario"/"evidence activation"/
 *        "dark datasets"/"dataset contact"/"evidence blind spots"/
 *        "dataset activation"/"data evidence coverage"
 * Event: jarvis:doscam-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVATED', 'MONITORED', 'STAGED', 'DARK'];

const CLS_COLOR = {
  ACTIVATED: '#22C55E',
  MONITORED: '#38BDF8',
  STAGED:    '#F59E0B',
  DARK:      '#EF4444',
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
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.datasets))   return raw.datasets;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.alerts))     return raw.alerts;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.scenarios))  return raw.scenarios;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function datasetText(d) {
  return [d?.name, d?.title, d?.description, d?.category, d?.tags?.join?.(' ')].join(' ');
}

function alertText(a) {
  return [a?.name, a?.title, a?.message, a?.category, a?.type, a?.source].join(' ');
}

function scenarioText(s) {
  return [s?.name, s?.title, s?.description, s?.phase, s?.type].join(' ');
}

function contactText(c) {
  return [c?.name, c?.title, c?.role, c?.org, c?.organisation, c?.department, c?.tags?.join?.(' ')].join(' ');
}

function classify(dataset, alerts, scenarios, contacts) {
  const dtoks           = tokens(datasetText(dataset));
  const matchedAlerts   = alerts.filter(a   => overlaps(dtoks, alertText(a)));
  const matchedScens    = scenarios.filter(s => overlaps(dtoks, scenarioText(s)));
  const matchedContacts = contacts.filter(c  => overlaps(dtoks, contactText(c)));
  const hasAl = matchedAlerts.length > 0;
  const hasSc = matchedScens.length > 0;
  const hasCo = matchedContacts.length > 0;
  const srcCnt = [hasAl, hasSc, hasCo].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'ACTIVATED';
  else if (srcCnt === 2) cls = 'MONITORED';
  else if (srcCnt === 1) cls = 'STAGED';
  else                   cls = 'DARK';
  return { cls, matchedAlerts, matchedScens, matchedContacts };
}

export function isDoscamQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('doscam') ||
    s.includes('dataset ops scenario') ||
    s.includes('evidence activation') ||
    s.includes('dark datasets') ||
    s.includes('dataset contact') ||
    s.includes('evidence blind spots') ||
    s.includes('dataset activation') ||
    s.includes('data evidence coverage') ||
    s.includes('dataset evidence') ||
    s.includes('dataset scenario contact')
  );
}

export function buildDoscamScript(counts) {
  return `Analyse the JARVIS Dataset × Ops Alert × Scenario × Contact Evidence Intelligence Activation Map.
Total datasets: ${counts.total}. Activated (all 3 sources): ${counts.activated}. Monitored (2 sources): ${counts.monitored}. Staged (1 source): ${counts.staged}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} dark datasets — evidence blind spots with no ops alert coverage, no scenario playbook, and no assigned contact owner.
Identify the highest-priority dark datasets and propose steps to activate them: create alert monitoring rules, link to operational scenarios, or assign a responsible contact.`;
}

const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` });

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdr() });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export default function DatasetOpsScenarioContactActivation() {
  const [open, setOpen]             = useState(false);
  const [datasets, setDatasets]     = useState([]);
  const [alerts, setAlerts]         = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [contacts, setContacts]     = useState([]);
  const [classified, setClass]      = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState('');
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssess]     = useState('');
  const timerRef                    = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [dRaw, aRaw, sRaw, cRaw] = await Promise.all([
        safeFetch(`${API}/v1/datasets`),
        safeFetch(`${API}/v1/ops/alerts`),
        safeFetch(`${API}/v1/scenario/list`),
        safeFetch(`${API}/entities/Contact`),
      ]);
      const dArr = normalizeDatasets(dRaw);
      const aArr = normalizeAlerts(aRaw);
      const sArr = normalizeScenarios(sRaw);
      const cArr = normalizeContacts(cRaw);
      setDatasets(dArr);
      setAlerts(aArr);
      setScenarios(sArr);
      setContacts(cArr);
      setClass(dArr.map(d => ({ d, ...classify(d, aArr, sArr, cArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:doscam-toggle', handler);
    return () => window.removeEventListener('jarvis:doscam-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:     classified.length,
    activated: classified.filter(x => x.cls === 'ACTIVATED').length,
    monitored: classified.filter(x => x.cls === 'MONITORED').length,
    staged:    classified.filter(x => x.cls === 'STAGED').length,
    dark:      classified.filter(x => x.cls === 'DARK').length,
  };

  const visible = classified.filter(item => {
    if (tab !== 'ALL' && item.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return datasetText(item.d).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildDoscamScript(counts);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ message: script }),
      });
      const j = await r.json();
      const text = j?.response || j?.message || j?.result || 'No assessment returned.';
      setAssess(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST', headers: hdr(),
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch {}
    } catch (e) {
      setAssess(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const darkPulse = counts.dark > 0;

  const panel = {
    position: 'fixed', inset: 0, zIndex: 10346,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#e2e8f0',
  };
  const header = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 18px',
    borderBottom: '1px solid #1e3a5f',
    background: 'rgba(10,20,40,0.95)',
  };
  const tileRow = {
    display: 'flex', gap: 10, padding: '10px 18px',
    borderBottom: '1px solid #1e3a5f',
    flexWrap: 'wrap',
  };
  const tile = (label, val, color) => (
    <div key={label} style={{
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${color}44`,
      borderRadius: 6, padding: '6px 14px', minWidth: 90, textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  );
  const tabRow = {
    display: 'flex', gap: 6, padding: '8px 18px',
    borderBottom: '1px solid #1e3a5f',
  };
  const tabBtn = (t) => (
    <button key={t} onClick={() => setTab(t)} style={{
      background: tab === t ? '#1e3a5f' : 'transparent',
      border: `1px solid ${tab === t ? '#38bdf8' : '#334155'}`,
      color: tab === t ? '#38bdf8' : '#94a3b8',
      borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11,
    }}>{t}</button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 187800, zIndex: 346,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: darkPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkPulse ? '0 0 6px #EF444488' : 'none',
          animation: darkPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ DOSCAM</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ DATASET × OPS ALERT × SCENARIO × CONTACT — EVIDENCE INTELLIGENCE ACTIVATION MAP
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {datasets.length} datasets · {alerts.length} alerts · {scenarios.length} scenarios · {contacts.length} contacts
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('DATASETS',  counts.total,     '#94a3b8')}
            {tile('ALERTS',    alerts.length,    '#64748b')}
            {tile('SCENARIOS', scenarios.length, '#64748b')}
            {tile('CONTACTS',  contacts.length,  '#64748b')}
            {tile('ACTIVATED', counts.activated, '#22C55E')}
            {tile('MONITORED', counts.monitored, '#38BDF8')}
            {tile('STAGED',    counts.staged,    '#F59E0B')}
            {tile('DARK',      counts.dark,      '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
                border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', fontSize: 11, padding: '3px 8px', outline: 'none',
              }}
            />
          </div>

          {loading && (
            <div style={{ padding: 18, color: '#64748b', fontSize: 12 }}>Loading data…</div>
          )}
          {err && (
            <div style={{ padding: 18, color: '#EF4444', fontSize: 11 }}>Error: {err}</div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px' }}>
            {visible.map((item, i) => {
              const { d, cls, matchedAlerts, matchedScens, matchedContacts } = item;
              const id = d?.id ?? d?.name ?? i;
              const isExp = !!expanded[id];
              return (
                <div key={id} style={{ borderBottom: '1px solid #1e2a3a', padding: '7px 0' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    onClick={() => toggleRow(id)}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1,
                      color: CLS_COLOR[cls],
                      border: `1px solid ${CLS_COLOR[cls]}44`,
                      borderRadius: 3, padding: '1px 6px', minWidth: 90, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {d?.name || d?.title || d?.id || '—'}
                    </span>
                    {d?.row_count != null && (
                      <span style={{
                        fontSize: 10, color: '#94a3b8',
                        background: 'rgba(148,163,184,0.08)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {d.row_count.toLocaleString()} rows
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      A:{matchedAlerts.length} S:{matchedScens.length} C:{matchedContacts.length}
                      {isExp ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Alerts: </span>
                          {matchedAlerts.slice(0, 4).map((a, ai) => (
                            <span key={ai} style={{
                              marginRight: 5, background: 'rgba(239,68,68,0.1)',
                              border: '1px solid #ef444444', borderRadius: 3,
                              padding: '1px 5px', color: '#EF4444',
                            }}>
                              {a?.name || a?.title || a?.message?.slice(0, 40) || a?.id}
                              {a?.severity && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{a.severity}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedAlerts.length > 4 && <span style={{ color: '#475569' }}>+{matchedAlerts.length - 4}</span>}
                        </div>
                      )}
                      {matchedScens.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Scenarios: </span>
                          {matchedScens.slice(0, 4).map((s, si) => (
                            <span key={si} style={{
                              marginRight: 5, background: 'rgba(245,158,11,0.1)',
                              border: '1px solid #f59e0b44', borderRadius: 3,
                              padding: '1px 5px', color: '#F59E0B',
                            }}>
                              {s?.name || s?.title || s?.id}
                              {s?.status && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{s.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedScens.length > 4 && <span style={{ color: '#475569' }}>+{matchedScens.length - 4}</span>}
                        </div>
                      )}
                      {matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Contacts: </span>
                          {matchedContacts.slice(0, 4).map((c, ci) => (
                            <span key={ci} style={{
                              marginRight: 5, background: 'rgba(34,197,94,0.08)',
                              border: '1px solid #22c55e44', borderRadius: 3,
                              padding: '1px 5px', color: '#22C55E',
                            }}>
                              {c?.name || c?.title || c?.id}
                              {(c?.role || c?.org) && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{[c.role, c.org].filter(Boolean).join(' / ')}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedContacts.length > 4 && <span style={{ color: '#475569' }}>+{matchedContacts.length - 4}</span>}
                        </div>
                      )}
                      {matchedAlerts.length === 0 && matchedScens.length === 0 && matchedContacts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No alert, scenario, or contact — dark dataset with zero evidence activation grounding.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No datasets match the current filter.
              </div>
            )}
          </div>

          <div style={{
            padding: '10px 18px',
            borderTop: '1px solid #1e3a5f',
            background: 'rgba(10,20,40,0.95)',
          }}>
            {assessment && (
              <div style={{
                marginBottom: 8, padding: 10,
                background: 'rgba(56,189,248,0.05)',
                border: '1px solid #1e3a5f', borderRadius: 6,
                fontSize: 11, color: '#94a3b8', maxHeight: 100, overflowY: 'auto',
              }}>{assessment}</div>
            )}
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? 'rgba(56,189,248,0.1)' : 'rgba(56,189,248,0.15)',
              border: '1px solid #38bdf8', color: '#38bdf8',
              borderRadius: 4, padding: '5px 16px', cursor: assessing ? 'not-allowed' : 'pointer',
              fontSize: 11, letterSpacing: 1,
            }}>
              {assessing ? 'ASSESSING…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
