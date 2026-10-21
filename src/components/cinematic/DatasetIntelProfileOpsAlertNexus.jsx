/**
 * DatasetIntelProfileOpsAlertNexus — F95
 *
 * Fetches /v1/datasets + /entities/IntelProfile + /v1/ops/alerts.
 *
 * Keyword-matches each dataset's name/description/tags against intel
 * profile names/categories AND ops alert messages/types/severity to classify:
 *   ACTIVATED — dataset matched both an intel profile AND an ops alert (fully active)
 *   PROFILED  — dataset matched an intel profile only (profiled, no alert coverage)
 *   ALERTED   — dataset matched an ops alert only (alerted, no intel profile linkage)
 *   ORPHAN    — no match (dataset with no intel profile and no ops alert — blind spot)
 *
 * Toggle: ◈ DIANEX button (fixed, bottom strip) left:101560, zIndex:192
 * Stat tiles: datasets / profiles / alerts / activated / profiled / alerted / orphan
 * Red pulse on ORPHAN count (blind-spot datasets).
 * Expandable rows: matched intel profiles with category badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / ACTIVATED / PROFILED / ALERTED / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dianex"/"dataset intel profile"/"dataset ops alert"/"dataset nexus"
 *        "orphan datasets"/"dataset blind spot"/"dataset alert coverage"
 *        "dataset intelligence nexus"/"intel data nexus"/"dataset profile ops"
 *        "data nexus"/"unmonitored datasets"/"dataset alert"
 * Event: jarvis:dianex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVATED', 'PROFILED', 'ALERTED', 'ORPHAN'];

const CLS_COLOR = {
  ACTIVATED: '#22C55E',
  PROFILED:  '#38BDF8',
  ALERTED:   '#F59E0B',
  ORPHAN:    '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isDianexQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'dianex', 'dataset intel profile', 'dataset ops alert', 'dataset nexus',
    'orphan datasets', 'dataset blind spot', 'dataset alert coverage',
    'dataset intelligence nexus', 'intel data nexus', 'dataset profile ops',
    'data nexus', 'unmonitored datasets', 'dataset alert',
  ].some(k => s.includes(k));
}

export function buildDianexScript() {
  return (
    'Fetch /v1/datasets, /entities/IntelProfile, and /v1/ops/alerts. ' +
    'Keyword-match each dataset (name, description, tags) against intel profile names/categories AND ops alert messages/types. ' +
    'Classify each dataset as ACTIVATED/PROFILED/ALERTED/ORPHAN. ' +
    'Report total ORPHAN count (datasets with no intel profile linkage and no ops alert coverage — blind-spot data), ' +
    'identify which orphan datasets represent the highest risk of unmonitored data exposure, ' +
    'and recommend intel profile creation or alert rule configuration to improve data intelligence coverage.'
  );
}

export default function DatasetIntelProfileOpsAlertNexus() {
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
    datasets: 0, profiles: 0, alerts: 0,
    activated: 0, profiled: 0, alerted: 0, orphan: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [dsRaw, profRaw, opsRaw] = await Promise.all([
        fetch(`${API}/v1/datasets`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/IntelProfile`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const datasets  = normalizeArray(dsRaw,   ['items', 'datasets', 'results', 'data', 'entities']);
      const profiles  = normalizeArray(profRaw,  ['items', 'profiles', 'results', 'data', 'entities']);
      const alerts    = normalizeArray(opsRaw,   ['items', 'alerts',   'results', 'data', 'entities']);

      const built = datasets.map((ds, idx) => {
        const dsText = [
          ds.name, ds.title, ds.description, ds.tags,
          ds.category, ds.type, ds.source,
        ].filter(Boolean).join(' ');
        const dsToks = tokens(dsText);

        const matchedProfiles = profiles.filter(prof => {
          const s = [prof.name, prof.title, prof.category, prof.type, prof.description, prof.subject]
            .filter(Boolean).join(' ');
          return overlaps(dsToks, s);
        });

        const matchedAlerts = alerts.filter(alert => {
          const s = [alert.message, alert.title, alert.type, alert.severity, alert.description, alert.source, alert.category]
            .filter(Boolean).join(' ');
          return overlaps(dsToks, s);
        });

        const hasProfile = matchedProfiles.length > 0;
        const hasAlert   = matchedAlerts.length > 0;
        let cls;
        if (hasProfile && hasAlert) cls = 'ACTIVATED';
        else if (hasProfile)        cls = 'PROFILED';
        else if (hasAlert)          cls = 'ALERTED';
        else                        cls = 'ORPHAN';

        return {
          id:              `ds-${idx}`,
          name:            ds.name || ds.title || `Dataset #${idx + 1}`,
          rowCount:        ds.row_count ?? ds.rows ?? ds.count ?? null,
          category:        ds.category || ds.type || '',
          cls,
          matchedProfiles,
          matchedAlerts,
        };
      });

      const activated = built.filter(r => r.cls === 'ACTIVATED').length;
      const profiled  = built.filter(r => r.cls === 'PROFILED').length;
      const alerted   = built.filter(r => r.cls === 'ALERTED').length;
      const orphan    = built.filter(r => r.cls === 'ORPHAN').length;

      setRows(built);
      setCounts({ datasets: built.length, profiles: profiles.length, alerts: alerts.length, activated, profiled, alerted, orphan });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:dianex-toggle', handler);
    return () => window.removeEventListener('jarvis:dianex-toggle', handler);
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
        body:    JSON.stringify({ message: buildDianexScript() }),
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

  const pulse = counts.orphan > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s)
        || r.category.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const SEV_COLOR = { critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#22C55E' };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 101560, zIndex: 192,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ DIANEX{counts.orphan > 0 ? <span style={pulse}> {counts.orphan}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 700, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ DATASET × INTEL PROFILE × OPS ALERT — INTELLIGENCE DATA NEXUS
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'DATASETS',  val: counts.datasets,  col: '#94A3B8' },
            { label: 'PROFILES',  val: counts.profiles,  col: '#94A3B8' },
            { label: 'ALERTS',    val: counts.alerts,    col: '#94A3B8' },
            { label: 'ACTIVATED', val: counts.activated, col: CLS_COLOR.ACTIVATED },
            { label: 'PROFILED',  val: counts.profiled,  col: CLS_COLOR.PROFILED  },
            { label: 'ALERTED',   val: counts.alerted,   col: CLS_COLOR.ALERTED   },
            { label: 'ORPHAN',    val: counts.orphan,    col: CLS_COLOR.ORPHAN    },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}44`,
              borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 70,
            }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? CLS_COLOR[t] || '#334155' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${CLS_COLOR[t] || '#334155'}`,
                color: tab === t ? '#000' : CLS_COLOR[t] || '#94A3B8',
                padding: '2px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
              color: '#E2E8F0', padding: '2px 8px', fontSize: 11, borderRadius: 3,
              outline: 'none', flex: 1, minWidth: 120,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '0 14px 8px' }}>
          {loading && <div style={{ color: '#64748B', fontSize: 12, padding: 8 }}>Loading…</div>}
          {error   && <div style={{ color: '#EF4444', fontSize: 12, padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, padding: 8 }}>No datasets match.</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{
              borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6, marginBottom: 6,
            }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => toggleExpand(row.id)}
              >
                <span style={{
                  fontSize: 9, fontWeight: 700, color: CLS_COLOR[row.cls],
                  border: `1px solid ${CLS_COLOR[row.cls]}`, borderRadius: 3,
                  padding: '1px 5px', whiteSpace: 'nowrap',
                }}>{row.cls}</span>
                {row.rowCount != null && (
                  <span style={{
                    fontSize: 9, color: '#94A3B8', border: '1px solid #334155',
                    borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                  }}>{row.rowCount.toLocaleString()} rows</span>
                )}
                <span style={{ color: '#CBD5E1', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ color: '#475569', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                  {row.matchedProfiles.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#38BDF8', fontSize: 10, marginRight: 6 }}>Intel profiles:</span>
                      {row.matchedProfiles.slice(0, 5).map((prof, i) => (
                        <span key={i} style={{
                          display: 'inline-block', marginRight: 4, marginBottom: 2,
                          background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                          color: '#38BDF8', fontSize: 9, borderRadius: 3, padding: '1px 5px',
                        }}>
                          {prof.name || prof.title || prof.subject || 'Profile'}
                          {prof.category && <span style={{ opacity: 0.7 }}> [{prof.category}]</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedAlerts.length > 0 && (
                    <div>
                      <span style={{ color: '#F59E0B', fontSize: 10, marginRight: 6 }}>Ops alerts:</span>
                      {row.matchedAlerts.slice(0, 5).map((alert, i) => (
                        <span key={i} style={{
                          display: 'inline-block', marginRight: 4, marginBottom: 2,
                          background: 'rgba(245,158,11,0.1)', border: '1px solid #F59E0B',
                          color: '#F59E0B', fontSize: 9, borderRadius: 3, padding: '1px 5px',
                        }}>
                          {alert.message || alert.title || 'Alert'}
                          {alert.severity && (
                            <span style={{ color: SEV_COLOR[alert.severity?.toLowerCase()] || '#94A3B8', marginLeft: 4 }}>
                              [{alert.severity.toUpperCase()}]
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ASSESS */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '4px 16px', fontSize: 11, borderRadius: 4,
              cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace',
            }}>
            {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, padding: 8, background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4,
              color: '#CBD5E1', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
