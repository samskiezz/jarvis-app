/**
 * RiskSignalDatasetInvestigationContact — F246
 *
 * Fetches /entities/RiskSignal + /v1/datasets +
 *         /v1/investigations + /entities/Contact
 *
 * Keyword-matches each risk signal (title/description/category/severity)
 * against datasets, investigations, and contacts to classify:
 *
 *   GROUNDED — matches all 3 sources
 *              (threat backed by dataset evidence, active investigation, AND contact owner)
 *   TRACKED  — matches 2 of 3 sources
 *   LINKED   — matches exactly 1 source
 *   DARK     — no match to any source
 *              (ungrounded threat signals — no dataset backing,
 *               no investigation, no contact owner)
 *
 * Toggle: ◈ RIDIGC button (fixed, bottom strip) left:185560, zIndex:342
 * Stat tiles: risk signals / datasets / investigations / contacts /
 *             grounded / tracked / linked / dark
 * Red pulse on DARK count (blind-spot threats).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched investigations with status badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / GROUNDED / TRACKED / LINKED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ridigc"/"risk signal dataset"/"threat intelligence grounding"/
 *        "dark risk signals"/"ungrounded threats"/"threat data investigation"/
 *        "risk grounding"/"threat contact coverage"/"ridigc coverage"
 * Event: jarvis:ridigc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'TRACKED', 'LINKED', 'DARK'];

const CLS_COLOR = {
  GROUNDED: '#22C55E',
  TRACKED:  '#38BDF8',
  LINKED:   '#F59E0B',
  DARK:     '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeRiskSignals(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.risk_signals))       return raw.risk_signals;
  if (Array.isArray(raw?.signals))            return raw.signals;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.datasets))           return raw.datasets;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.investigations))     return raw.investigations;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.contacts))           return raw.contacts;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function riskText(r) {
  return [r?.title, r?.name, r?.description, r?.category, r?.severity, r?.source, r?.type].join(' ');
}

function datasetText(d) {
  return [d?.name, d?.title, d?.description, d?.category, d?.tags?.join?.(' ')].join(' ');
}

function investigationText(i) {
  return [i?.title, i?.name, i?.description, i?.category, i?.subject, i?.status].join(' ');
}

function contactText(c) {
  return [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.tags?.join?.(' ')].join(' ');
}

function classify(signal, datasets, investigations, contacts) {
  const stoks              = tokens(riskText(signal));
  const matchedDatasets    = datasets.filter(d      => overlaps(stoks, datasetText(d)));
  const matchedInvestigations = investigations.filter(i => overlaps(stoks, investigationText(i)));
  const matchedContacts    = contacts.filter(c      => overlaps(stoks, contactText(c)));
  const hasDs = matchedDatasets.length > 0;
  const hasIn = matchedInvestigations.length > 0;
  const hasCt = matchedContacts.length > 0;
  const srcCnt = [hasDs, hasIn, hasCt].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'GROUNDED';
  else if (srcCnt === 2) cls = 'TRACKED';
  else if (srcCnt === 1) cls = 'LINKED';
  else                   cls = 'DARK';
  return { cls, matchedDatasets, matchedInvestigations, matchedContacts };
}

export function isRidigcQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('ridigc') ||
    s.includes('risk signal dataset') ||
    s.includes('threat intelligence grounding') ||
    s.includes('dark risk signals') ||
    s.includes('ungrounded threats') ||
    s.includes('threat data investigation') ||
    s.includes('risk grounding') ||
    s.includes('threat contact coverage') ||
    s.includes('ridigc coverage') ||
    s.includes('risk dataset investigation') ||
    s.includes('threat grounding')
  );
}

export function buildRidigcScript(counts) {
  return `Analyse the JARVIS RiskSignal × Dataset × Investigation × Contact Threat Intelligence Grounding.
Total risk signals: ${counts.total}. Grounded (all 3 sources): ${counts.grounded}. Tracked (2 sources): ${counts.tracked}. Linked (1 source): ${counts.linked}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} dark threat signals — no dataset backing, no active investigation, and no contact owner.
Identify the highest-severity dark signals and propose grounding steps: link to a relevant dataset for evidence, open an investigation, or assign a responsible contact.`;
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

export default function RiskSignalDatasetInvestigationContact() {
  const [open, setOpen]                 = useState(false);
  const [signals, setSignals]           = useState([]);
  const [datasets, setDatasets]         = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [contacts, setContacts]         = useState([]);
  const [classified, setClass]          = useState([]);
  const [loading, setLoading]           = useState(false);
  const [err, setErr]                   = useState('');
  const [tab, setTab]                   = useState('ALL');
  const [search, setSearch]             = useState('');
  const [expanded, setExpanded]         = useState({});
  const [assessing, setAssessing]       = useState(false);
  const [assessment, setAssess]         = useState('');
  const timerRef                        = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [rRaw, dRaw, iRaw, cRaw] = await Promise.all([
        safeFetch(`${API}/entities/RiskSignal`),
        safeFetch(`${API}/v1/datasets`),
        safeFetch(`${API}/v1/investigations`),
        safeFetch(`${API}/entities/Contact`),
      ]);
      const rArr = normalizeRiskSignals(rRaw);
      const dArr = normalizeDatasets(dRaw);
      const iArr = normalizeInvestigations(iRaw);
      const cArr = normalizeContacts(cRaw);
      setSignals(rArr);
      setDatasets(dArr);
      setInvestigations(iArr);
      setContacts(cArr);
      setClass(rArr.map(s => ({ s, ...classify(s, dArr, iArr, cArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:ridigc-toggle', handler);
    return () => window.removeEventListener('jarvis:ridigc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:    classified.length,
    grounded: classified.filter(c => c.cls === 'GROUNDED').length,
    tracked:  classified.filter(c => c.cls === 'TRACKED').length,
    linked:   classified.filter(c => c.cls === 'LINKED').length,
    dark:     classified.filter(c => c.cls === 'DARK').length,
  };

  const visible = classified.filter(item => {
    if (tab !== 'ALL' && item.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return riskText(item.s).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildRidigcScript(counts);
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
    position: 'fixed', inset: 0, zIndex: 10342,
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

  const severityColor = s => {
    const v = (s || '').toLowerCase();
    if (v === 'critical' || v === 'high')   return '#EF4444';
    if (v === 'medium' || v === 'moderate') return '#F59E0B';
    return '#64748b';
  };

  const statusColor = s => {
    const v = (s || '').toLowerCase();
    if (v === 'open' || v === 'active')   return '#22C55E';
    if (v === 'closed' || v === 'resolved') return '#64748b';
    return '#94a3b8';
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 185560, zIndex: 342,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: darkPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkPulse ? '0 0 6px #EF444488' : 'none',
          animation: darkPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ RIDIGC</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ RISKSIGNAL × DATASET × INVESTIGATION × CONTACT — THREAT INTELLIGENCE GROUNDING
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {signals.length} signals · {datasets.length} datasets · {investigations.length} investigations · {contacts.length} contacts
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('RISK SIGNALS',    counts.total,    '#94a3b8')}
            {tile('DATASETS',        datasets.length, '#64748b')}
            {tile('INVESTIGATIONS',  investigations.length, '#64748b')}
            {tile('CONTACTS',        contacts.length, '#64748b')}
            {tile('GROUNDED',        counts.grounded, '#22C55E')}
            {tile('TRACKED',         counts.tracked,  '#38BDF8')}
            {tile('LINKED',          counts.linked,   '#F59E0B')}
            {tile('DARK',            counts.dark,     '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search risk signals…"
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
              const { s, cls, matchedDatasets, matchedInvestigations, matchedContacts } = item;
              const id = s?.id ?? s?.name ?? i;
              const isExpanded = !!expanded[id];
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 78, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {s?.title || s?.name || s?.id || '—'}
                    </span>
                    {s?.severity && (
                      <span style={{
                        fontSize: 10, color: severityColor(s.severity),
                        background: 'rgba(239,68,68,0.08)', borderRadius: 3, padding: '1px 5px',
                        textTransform: 'uppercase',
                      }}>
                        {s.severity}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      D:{matchedDatasets.length} I:{matchedInvestigations.length} C:{matchedContacts.length}
                      {isExpanded ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedDatasets.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Datasets: </span>
                          {matchedDatasets.slice(0, 4).map((d, di) => (
                            <span key={di} style={{
                              marginRight: 5, background: 'rgba(167,139,250,0.1)',
                              border: '1px solid #a78bfa44', borderRadius: 3,
                              padding: '1px 5px', color: '#a78bfa',
                            }}>
                              {d?.name || d?.title || d?.id}
                              {d?.row_count != null && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{d.row_count.toLocaleString()} rows]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedDatasets.length > 4 && <span style={{ color: '#475569' }}>+{matchedDatasets.length - 4}</span>}
                        </div>
                      )}
                      {matchedInvestigations.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Investigations: </span>
                          {matchedInvestigations.slice(0, 4).map((inv, ii) => (
                            <span key={ii} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.1)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38BDF8',
                            }}>
                              {inv?.title || inv?.name || inv?.id}
                              {inv?.status && (
                                <span style={{ color: statusColor(inv.status), marginLeft: 3, fontSize: 9 }}>
                                  [{inv.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedInvestigations.length > 4 && <span style={{ color: '#475569' }}>+{matchedInvestigations.length - 4}</span>}
                        </div>
                      )}
                      {matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Contacts: </span>
                          {matchedContacts.slice(0, 4).map((c, ci) => (
                            <span key={ci} style={{
                              marginRight: 5, background: 'rgba(34,197,94,0.1)',
                              border: '1px solid #22c55e44', borderRadius: 3,
                              padding: '1px 5px', color: '#22C55E',
                            }}>
                              {c?.name || c?.full_name || c?.id}
                              {(c?.role || c?.organisation || c?.org) && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{c.role || ''}{c.role && (c.organisation || c.org) ? '/' : ''}{c.organisation || c.org || ''}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedContacts.length > 4 && <span style={{ color: '#475569' }}>+{matchedContacts.length - 4}</span>}
                        </div>
                      )}
                      {matchedDatasets.length === 0 && matchedInvestigations.length === 0 && matchedContacts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No dataset backing, no investigation, and no contact owner — dark threat signal.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No risk signals match the current filter.
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
