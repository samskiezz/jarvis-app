/**
 * DatasetSwarmContactOpsAccountability — F226
 *
 * Fetches /v1/datasets + /entities/SwarmJob +
 *         /entities/Contact + /v1/ops/alerts
 *
 * Keyword-matches each dataset (name/description/type/tags) against
 * swarm job names/descriptions, contact names/roles/orgs, and ops alert
 * titles/descriptions to classify:
 *
 *   ACCOUNTABLE — matches all 3 sources (swarm + contact + alert)
 *                 (dataset is actively processed, owned, and monitored)
 *   OWNED       — matches 2 of 3 sources
 *                 (dataset partially accounted for)
 *   PROCESSING  — matches exactly 1 source
 *                 (dataset minimally tracked)
 *   ORPHAN      — no match to any source
 *                 (unaccountable dataset — no swarm job, no contact owner, no ops alert)
 *
 * Toggle: ◈ DACOV button (fixed, bottom strip) left:174360, zIndex:322
 * Stat tiles: datasets / swarm jobs / contacts / alerts /
 *             accountable / owned / processing / orphan
 * Red pulse on ORPHAN count (unaccountable datasets).
 * Expandable rows: matched swarm jobs with status badge +
 *                  matched contacts with role/org badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / ACCOUNTABLE / OWNED / PROCESSING / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dacov"/"dataset accountability"/"data ownership"/"production accountability"/
 *        "orphan dataset"/"unaccountable data"/"dataset coverage"/"data production"/
 *        "swarm data"/"dataset swarm"/"data contact"/"dataset ops"
 * Event: jarvis:dacov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACCOUNTABLE', 'OWNED', 'PROCESSING', 'ORPHAN'];

const CLS_COLOR = {
  ACCOUNTABLE: '#22C55E',
  OWNED:       '#38BDF8',
  PROCESSING:  '#F59E0B',
  ORPHAN:      '#EF4444',
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
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.datasets))  return raw.datasets;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeSwarmJobs(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.swarm_jobs)) return raw.swarm_jobs;
  if (Array.isArray(raw?.jobs))       return raw.jobs;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function datasetLabel(d) {
  return d?.name || d?.title || d?.dataset_name || d?.id || 'Unknown';
}

function datasetText(d) {
  return [d?.name, d?.title, d?.dataset_name, d?.description, d?.type, d?.category, (d?.tags || []).join(' ')].join(' ');
}

function classify(dataset, swarmJobs, contacts, alerts) {
  const dtoks = tokens(datasetText(dataset));

  const matchedSwarm = swarmJobs.filter(j =>
    overlaps(dtoks, [j?.name, j?.title, j?.description, j?.type, j?.status, j?.dataset, j?.source].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(dtoks, [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.email, (c?.tags || []).join(' ')].join(' '))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(dtoks, [a?.title, a?.name, a?.description, a?.type, a?.alert_type, a?.severity, a?.category].join(' '))
  );

  const hasS = matchedSwarm.length > 0;
  const hasC = matchedContacts.length > 0;
  const hasA = matchedAlerts.length > 0;
  const srcCnt = [hasS, hasC, hasA].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'ACCOUNTABLE';
  else if (srcCnt === 2) cls = 'OWNED';
  else if (srcCnt === 1) cls = 'PROCESSING';
  else                   cls = 'ORPHAN';

  return { cls, matchedSwarm, matchedContacts, matchedAlerts };
}

export function isDacovQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('dacov') ||
    s.includes('dataset accountability') ||
    s.includes('data ownership') ||
    s.includes('production accountability') ||
    s.includes('orphan dataset') ||
    s.includes('unaccountable data') ||
    s.includes('dataset coverage') ||
    s.includes('data production') ||
    s.includes('swarm data') ||
    s.includes('dataset swarm') ||
    s.includes('data contact') ||
    s.includes('dataset ops')
  );
}

export function buildDacovScript(counts) {
  return `Analyse the JARVIS Dataset Production Accountability Coverage.
Total datasets: ${counts.total}. Accountable: ${counts.accountable}. Owned: ${counts.owned}. Processing: ${counts.processing}. Orphan: ${counts.orphan}.
Focus on the ${counts.orphan} orphaned datasets — datasets with no matching swarm job, no contact owner, and no ops alert coverage.
Identify the highest-priority orphaned datasets and propose concrete accountability actions: assign a swarm processing job, assign a contact data owner, or create an ops alert for monitoring.`;
}

export default function DatasetSwarmContactOpsAccountability() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [swarmJobs, setSwarmJobs] = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef                  = useRef(null);

  const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dRes, sRes, cRes, aRes] = await Promise.all([
        fetch(`${API}/v1/datasets`,          { headers: hdrs }),
        fetch(`${API}/entities/SwarmJob`,    { headers: hdrs }),
        fetch(`${API}/entities/Contact`,     { headers: hdrs }),
        fetch(`${API}/v1/ops/alerts`,        { headers: hdrs }),
      ]);
      const [dRaw, sRaw, cRaw, aRaw] = await Promise.all([
        dRes.ok ? dRes.json() : [],
        sRes.ok ? sRes.json() : [],
        cRes.ok ? cRes.json() : [],
        aRes.ok ? aRes.json() : [],
      ]);
      const datasets = normalizeDatasets(dRaw);
      const swarms   = normalizeSwarmJobs(sRaw);
      const ctcts    = normalizeContacts(cRaw);
      const alrts    = normalizeAlerts(aRaw);
      setSwarmJobs(swarms); setContacts(ctcts); setAlerts(alrts);
      setRows(datasets.map(d => ({ dataset: d, ...classify(d, swarms, ctcts, alrts) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:dacov-toggle', toggle);
    return () => window.removeEventListener('jarvis:dacov-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const orphan = rows.filter(r => r.cls === 'ORPHAN').length;
    const script = buildDacovScript({
      total:       rows.length,
      accountable: rows.filter(r => r.cls === 'ACCOUNTABLE').length,
      owned:       rows.filter(r => r.cls === 'OWNED').length,
      processing:  rows.filter(r => r.cls === 'PROCESSING').length,
      orphan,
    });
    setAssessing(true); setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: script }),
      });
      const j = await res.json();
      const txt = j?.response || j?.message || j?.content || JSON.stringify(j);
      setAssessment(txt);
      if (window.__jarvisTTS) window.__jarvisTTS(txt.slice(0, 300));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = {
    total:       rows.length,
    accountable: rows.filter(r => r.cls === 'ACCOUNTABLE').length,
    owned:       rows.filter(r => r.cls === 'OWNED').length,
    processing:  rows.filter(r => r.cls === 'PROCESSING').length,
    orphan:      rows.filter(r => r.cls === 'ORPHAN').length,
  };
  const orphanPulse = counts.orphan > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || datasetLabel(r.dataset).toLowerCase().includes(search.toLowerCase()))
  );

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const TILE = (label, val, color) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', minWidth: 70, textAlign: 'center' }}>
      <div style={{ color, fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{val}</div>
      <div style={{ color: '#64748B', fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 174360, zIndex: 322,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${open ? '#EF4444' : 'rgba(239,68,68,0.3)'}`,
          color: '#EF4444', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ DACOV
        {orphanPulse && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff', borderRadius: 9,
            padding: '1px 5px', fontSize: 9, fontWeight: 700,
            animation: 'pulse 1.5s infinite',
          }}>
            {counts.orphan}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 36, left: 0, right: 0, margin: '0 auto',
          width: 740, maxHeight: '70vh', zIndex: 10322,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 700 }}>◈ DATASET PRODUCTION ACCOUNTABILITY</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F226 · /v1/datasets + /entities/SwarmJob + /entities/Contact + /v1/ops/alerts</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {TILE('DATASETS',    counts.total,       '#94A3B8')}
            {TILE('SWARM JOBS',  swarmJobs.length,   '#818CF8')}
            {TILE('CONTACTS',    contacts.length,    '#38BDF8')}
            {TILE('ALERTS',      alerts.length,      '#F472B6')}
            {TILE('ACCOUNTABLE', counts.accountable, '#22C55E')}
            {TILE('OWNED',       counts.owned,       '#38BDF8')}
            {TILE('PROCESSING',  counts.processing,  '#F59E0B')}
            {TILE('ORPHAN',      counts.orphan,      '#EF4444')}
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid rgba(239,68,68,0.1)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(239,68,68,0.2)' : 'transparent',
                  border: `1px solid ${tab === t ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
                  color: tab === t ? '#EF4444' : '#64748B',
                  padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1',
                padding: '2px 8px', fontSize: 10, borderRadius: 4, width: 160,
              }}
            />
          </div>

          {/* Row list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
            {loading && <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>Loading…</div>}
            {error   && <div style={{ color: '#EF4444', fontSize: 11, padding: 12 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>No datasets match this filter.</div>
            )}
            {visible.map((row, i) => {
              const id     = row.dataset?.id || row.dataset?.name || i;
              const isOpen = !!expanded[id];
              const color  = CLS_COLOR[row.cls];
              const rows_  = row.dataset?.row_count ?? row.dataset?.rows ?? row.dataset?.count;
              return (
                <div key={id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => toggleRow(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 5,
                      background: isOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isOpen ? 'rgba(239,68,68,0.2)' : 'transparent'}`,
                    }}
                  >
                    <span style={{ color, fontSize: 9, minWidth: 76, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {datasetLabel(row.dataset)}
                    </span>
                    {rows_ != null && (
                      <span style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.3)', color: '#94A3B8', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {rows_.toLocaleString()} rows
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.matchedSwarm.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SWARM JOBS ({row.matchedSwarm.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedSwarm.slice(0, 6).map((j, ji) => (
                              <span key={ji} style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: '#818CF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {j?.name || j?.title || j?.id || '—'}
                                {j?.status ? ` · ${j.status}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>CONTACTS ({row.matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedContacts.slice(0, 6).map((c, ci) => (
                              <span key={ci} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || c?.full_name || c?.email || '—'}
                                {(c?.role || c?.organisation || c?.org) ? ` · ${c.role || c.organisation || c.org}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>OPS ALERTS ({row.matchedAlerts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedAlerts.slice(0, 6).map((a, ai) => (
                              <span key={ai} style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.3)', color: '#F472B6', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {a?.title || a?.name || a?.id || '—'}
                                {(a?.severity || a?.level) ? ` · ${a.severity || a.level}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedSwarm.length === 0 && row.matchedContacts.length === 0 && row.matchedAlerts.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No matched sources — unaccountable orphan dataset.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS button + result */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(239,68,68,0.1)' }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
                border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444',
                padding: '4px 14px', fontSize: 10, cursor: assessing ? 'not-allowed' : 'pointer',
                borderRadius: 4,
              }}
            >
              {assessing ? '▶ ASSESSING…' : '▶ ASSESS ORPHAN DATASETS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 6, color: '#CBD5E1', fontSize: 10, lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
