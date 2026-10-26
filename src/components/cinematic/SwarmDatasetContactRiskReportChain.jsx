/**
 * SwarmDatasetContactRiskReportChain — F210
 *
 * Fetches /entities/SwarmJob + /v1/datasets + /entities/Contact +
 *         /entities/RiskSignal + /v1/reports.
 *
 * Keyword-matches each swarm job (name/type/description/status) against
 * dataset names/descriptions, contact names/roles/orgs, risk signal
 * names/categories, and report titles/categories to classify:
 *
 *   COVERED   — job matches a dataset + contact + risk signal + report
 *               (fully grounded: data-linked, owned, threat-mapped, filed)
 *   OWNED     — job matches a contact + at least two other sources (no full coverage)
 *               (partially managed)
 *   PARTIAL   — job matches at least one source but not enough for COVERED/OWNED
 *               (some grounding present)
 *   ISOLATED  — no match to any source
 *               (automation blind spot — unmonitored and unowned)
 *
 * Toggle: ◈ SDCRR button (fixed, bottom strip) left:165400, zIndex:306
 * Stat tiles: jobs / datasets / contacts / signals / reports / covered / owned / partial / isolated
 * Red pulse on ISOLATED count (full automation blind spots).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched contacts with role/org +
 *                  matched risk signals with severity badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / COVERED / OWNED / PARTIAL / ISOLATED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sdcrr"/"swarm coverage"/"automation coverage"/"swarm production"
 *        "isolated swarm"/"swarm blind spot"/"automation blind spot"
 *        "swarm data contact"/"swarm report"/"automation production coverage"
 *        "swarm risk report"/"swarm ownership"/"automation ownership"
 * Event: jarvis:sdcrr-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'OWNED', 'PARTIAL', 'ISOLATED'];

const CLS_COLOR = {
  COVERED:  '#22C55E',
  OWNED:    '#38BDF8',
  PARTIAL:  '#F97316',
  ISOLATED: '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSwarmJobs(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.swarm_jobs))  return raw.swarm_jobs;
  if (Array.isArray(raw?.swarmJobs))   return raw.swarmJobs;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.entities))    return raw.entities;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.datasets))    return raw.datasets;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.entities))   return raw.entities;
  return [];
}

function normalizeRiskSignals(raw) {
  if (Array.isArray(raw))                 return raw;
  if (Array.isArray(raw?.items))          return raw.items;
  if (Array.isArray(raw?.risk_signals))   return raw.risk_signals;
  if (Array.isArray(raw?.riskSignals))    return raw.riskSignals;
  if (Array.isArray(raw?.results))        return raw.results;
  if (Array.isArray(raw?.data))           return raw.data;
  if (Array.isArray(raw?.entities))       return raw.entities;
  return [];
}

function normalizeReports(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.reports))     return raw.reports;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

export function isSdcrrQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sdcrr', 'swarm coverage', 'automation coverage', 'swarm production',
    'isolated swarm', 'swarm blind spot', 'automation blind spot',
    'swarm data contact', 'swarm report', 'automation production coverage',
    'swarm risk report', 'swarm ownership', 'automation ownership',
  ].some(k => s.includes(k));
}

export function buildSdcrrScript() {
  return (
    'Fetch /entities/SwarmJob, /v1/datasets, /entities/Contact, /entities/RiskSignal, and /v1/reports. ' +
    'Keyword-match each swarm job (name/type/description/status) against dataset names/descriptions, ' +
    'contact names/roles/orgs, risk signal names/categories, and report titles/categories. ' +
    'Classify each job as COVERED (matches dataset + contact + risk signal + report), ' +
    'OWNED (matches contact + at least two others), ' +
    'PARTIAL (matches at least one source), ' +
    'or ISOLATED (no match to any source — automation blind spot). ' +
    'Report total ISOLATED count, identify which isolated jobs carry the highest operational risk ' +
    '(by type, status, or recency), and recommend which datasets should be linked, ' +
    'which contacts should be assigned ownership, which risk signals should be mapped, ' +
    'and which reports should be filed to eliminate automation blind spots.'
  );
}

export default function SwarmDatasetContactRiskReportChain() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    jobs: 0, datasets: 0, contacts: 0, signals: 0, reports: 0,
    covered: 0, owned: 0, partial: 0, isolated: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [jobsRaw, datasetsRaw, contactsRaw, signalsRaw, reportsRaw] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`,   { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/datasets`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/RiskSignal`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/reports`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const jobs     = normalizeSwarmJobs(jobsRaw);
      const datasets = normalizeDatasets(datasetsRaw);
      const contacts = normalizeContacts(contactsRaw);
      const signals  = normalizeRiskSignals(signalsRaw);
      const reports  = normalizeReports(reportsRaw);

      const built = jobs.map((job, idx) => {
        const jobText = [
          job.name, job.title, job.type, job.job_type, job.jobType,
          job.description, job.status, job.tags?.join?.(' '),
          job.target, job.source, job.output,
        ].filter(Boolean).join(' ');
        const jToks = tokens(jobText);

        const matchedDatasets = datasets.filter(ds => {
          const s = [ds.name, ds.title, ds.description, ds.type, ds.category, ds.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(jToks, s);
        });

        const matchedContacts = contacts.filter(c => {
          const s = [c.name, c.role, c.title, c.org, c.organisation, c.organization, c.description]
            .filter(Boolean).join(' ');
          return overlaps(jToks, s);
        });

        const matchedSignals = signals.filter(sig => {
          const s = [sig.name, sig.title, sig.description, sig.category, sig.type, sig.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(jToks, s);
        });

        const matchedReports = reports.filter(rep => {
          const s = [rep.title, rep.name, rep.category, rep.description, rep.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(jToks, s);
        });

        const hasDs      = matchedDatasets.length > 0;
        const hasContact = matchedContacts.length > 0;
        const hasSig     = matchedSignals.length > 0;
        const hasReport  = matchedReports.length > 0;

        const matchCount = [hasDs, hasContact, hasSig, hasReport].filter(Boolean).length;

        let cls;
        if (hasDs && hasContact && hasSig && hasReport) {
          cls = 'COVERED';
        } else if (hasContact && matchCount >= 3) {
          cls = 'OWNED';
        } else if (matchCount >= 1) {
          cls = 'PARTIAL';
        } else {
          cls = 'ISOLATED';
        }

        return {
          id:              `job-${idx}`,
          label:           job.name || job.title || `Job ${idx + 1}`,
          type:            job.type || job.job_type || job.jobType || '',
          status:          job.status || '',
          cls,
          matchedDatasets,
          matchedContacts,
          matchedSignals,
          matchedReports,
        };
      });

      const covered  = built.filter(r => r.cls === 'COVERED').length;
      const owned    = built.filter(r => r.cls === 'OWNED').length;
      const partial  = built.filter(r => r.cls === 'PARTIAL').length;
      const isolated = built.filter(r => r.cls === 'ISOLATED').length;

      setRows(built);
      setCounts({
        jobs: built.length,
        datasets: datasets.length,
        contacts: contacts.length,
        signals: signals.length,
        reports: reports.length,
        covered, owned, partial, isolated,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sdcrr-toggle', handler);
    return () => window.removeEventListener('jarvis:sdcrr-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildSdcrrScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.isolated > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.type.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 165400, zIndex: 306,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ SDCRR{counts.isolated > 0 ? <span style={pulse}> {counts.isolated}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 740, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.07)',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ SDCRR — Automation Production Coverage Chain
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          {[
            ['Jobs',      counts.jobs,      '#94A3B8'],
            ['Datasets',  counts.datasets,  '#94A3B8'],
            ['Contacts',  counts.contacts,  '#94A3B8'],
            ['Signals',   counts.signals,   '#94A3B8'],
            ['Reports',   counts.reports,   '#94A3B8'],
            ['Covered',   counts.covered,   CLS_COLOR.COVERED],
            ['Owned',     counts.owned,     CLS_COLOR.OWNED],
            ['Partial',   counts.partial,   CLS_COLOR.PARTIAL],
            ['Isolated',  counts.isolated,  CLS_COLOR.ISOLATED],
          ].map(([lbl, val, clr]) => (
            <div key={lbl} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${clr}44`,
              borderRadius: 6, padding: '5px 10px', minWidth: 72, textAlign: 'center',
            }}>
              <div style={{ color: clr, fontSize: 18, fontWeight: 700,
                ...(lbl === 'Isolated' && val > 0 ? pulse : {}) }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 10 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: tab === t ? CLS_COLOR[t] || '#EF4444' : 'rgba(255,255,255,0.05)',
              color: tab === t ? '#000' : '#94A3B8', border: 'none', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              marginLeft: 'auto', padding: '3px 8px', fontSize: 11, borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
              color: '#E2E8F0', fontFamily: 'monospace', width: 160,
            }} />
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          <button onClick={assess} disabled={assessing} style={{
            padding: '4px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
            background: assessing ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)',
            border: '1px solid #EF4444', color: '#EF4444', borderRadius: 4,
            fontFamily: 'monospace',
          }}>{assessing ? '⟳ Assessing…' : '▶ ASSESS'}</button>
          {assessment && (
            <div style={{ marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
              background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>

        {/* Error / loading */}
        {error   && <div style={{ padding: '8px 14px', color: '#EF4444', fontSize: 11 }}>Error: {error}</div>}
        {loading && <div style={{ padding: '8px 14px', color: '#64748B', fontSize: 11 }}>Loading…</div>}

        {/* Rows */}
        <div style={{ padding: '8px 14px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#475569', fontSize: 12, padding: '12px 0' }}>No swarm jobs match this filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => toggleExpand(row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${CLS_COLOR[row.cls]}33`,
                }}
              >
                <span style={{
                  padding: '1px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`, color: CLS_COLOR[row.cls],
                  whiteSpace: 'nowrap',
                }}>{row.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 12, flex: 1 }}>{row.label}</span>
                {row.type && <span style={{ color: '#64748B', fontSize: 10 }}>{row.type}</span>}
                {row.status && (
                  <span style={{ color: '#94A3B8', fontSize: 10 }}>{row.status}</span>
                )}
                <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }}>
                  {expanded[row.id] ? '▲' : '▼'}
                </span>
              </div>

              {expanded[row.id] && (
                <div style={{
                  marginTop: 2, marginLeft: 12, padding: '8px 12px',
                  background: 'rgba(0,0,0,0.3)', borderRadius: 4,
                  border: '1px solid rgba(239,68,68,0.1)',
                }}>
                  {/* Datasets */}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>DATASETS</div>
                      {row.matchedDatasets.map((ds, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(ds.row_count || ds.rowCount || ds.count) !== undefined && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(56,189,248,0.12)', color: '#38BDF8',
                            }}>{ds.row_count ?? ds.rowCount ?? ds.count} rows</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {ds.name || ds.title || 'Dataset'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>CONTACTS</div>
                      {row.matchedContacts.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>{c.name || c.email || 'Contact'}</span>
                          {(c.role || c.title) && (
                            <span style={{ color: '#64748B', fontSize: 10 }}>{c.role || c.title}</span>
                          )}
                          {(c.org || c.organisation || c.organization) && (
                            <span style={{ color: '#475569', fontSize: 10 }}>
                              @ {c.org || c.organisation || c.organization}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Risk Signals */}
                  {row.matchedSignals.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>RISK SIGNALS</div>
                      {row.matchedSignals.map((sig, i) => {
                        const sev = (sig.severity || sig.level || sig.priority || 'medium').toLowerCase();
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: `${SEV_COLOR[sev] || '#94A3B8'}22`,
                              color: SEV_COLOR[sev] || '#94A3B8',
                            }}>{sev.toUpperCase()}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                              {sig.name || sig.title || sig.description || 'Signal'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Reports */}
                  {row.matchedReports.length > 0 && (
                    <div>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>REPORTS</div>
                      {row.matchedReports.map((rep, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(rep.date || rep.created_at || rep.createdAt || rep.published_at) && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(100,116,139,0.2)', color: '#94A3B8',
                            }}>{(rep.date || rep.created_at || rep.createdAt || rep.published_at || '').slice(0, 10)}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {rep.title || rep.name || 'Report'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedDatasets.length === 0 && row.matchedContacts.length === 0 &&
                   row.matchedSignals.length === 0 && row.matchedReports.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 11 }}>No matching datasets, contacts, risk signals, or reports found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
