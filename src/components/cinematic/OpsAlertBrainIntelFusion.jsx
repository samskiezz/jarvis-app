/**
 * OpsAlertBrainIntelFusion — F94
 *
 * Fetches /v1/ops/alerts + /v1/cinematic/brain + /entities/IntelProfile.
 *
 * Keyword-matches each ops alert's message/type/severity against brain
 * node labels AND intel profile names/categories to classify:
 *   FUSED    — alert matched both a brain node AND an intel profile (fully attributed)
 *   MODELED  — alert matched a brain node only (modeled, no profile attribution)
 *   PROFILED — alert matched an intel profile only (profiled, no brain model)
 *   DARK     — no match (alert with no brain grounding and no intel profile — blind spot)
 *
 * Toggle: ◈ OBIFUS button (fixed, bottom strip) left:101000, zIndex:191
 * Stat tiles: alerts / brain nodes / profiles / fused / modeled / profiled / dark
 * Red pulse on DARK count (unattributed blind-spot alerts).
 * Expandable rows: matched brain nodes with score badge +
 *                  matched intel profiles with category badge.
 * Filter tabs: ALL / FUSED / MODELED / PROFILED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "obifus"/"ops alert brain"/"ops intel fusion"/"alert brain"/"alert profile"
 *        "dark alerts"/"unattributed alerts"/"ops brain fusion"/"intel alert"
 *        "ops fusion"/"alert attribution"/"blind alerts"
 * Event: jarvis:obifus-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'FUSED', 'MODELED', 'PROFILED', 'DARK'];

const CLS_COLOR = {
  FUSED:    '#22C55E',
  MODELED:  '#38BDF8',
  PROFILED: '#F59E0B',
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

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isObifusQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'obifus', 'ops alert brain', 'ops intel fusion', 'alert brain', 'alert profile',
    'dark alerts', 'unattributed alerts', 'ops brain fusion', 'intel alert',
    'ops fusion', 'alert attribution', 'blind alerts',
  ].some(k => s.includes(k));
}

export function buildObifusScript() {
  return (
    'Fetch /v1/ops/alerts, /v1/cinematic/brain, and /entities/IntelProfile. ' +
    'Keyword-match each ops alert (message, type, severity) against brain node labels AND intel profile names/categories. ' +
    'Classify each alert as FUSED/MODELED/PROFILED/DARK. ' +
    'Report total DARK count (alerts with no brain model grounding and no intel profile — blind-spot alerts), ' +
    'identify which dark alerts represent the greatest unattributed risk, ' +
    'and recommend brain node creation or intel profile linkage to improve intelligence fusion coverage.'
  );
}

export default function OpsAlertBrainIntelFusion() {
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
    alerts: 0, nodes: 0, profiles: 0,
    fused: 0, modeled: 0, profiled: 0, dark: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [opsRaw, brainRaw, profRaw] = await Promise.all([
        fetch(`${API}/v1/ops/alerts`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/cinematic/brain`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/IntelProfile`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const alerts   = normalizeArray(opsRaw,   ['items', 'alerts', 'results', 'data', 'entities']);
      const nodes    = normalizeArray(brainRaw,  ['nodes', 'items', 'results', 'data', 'entities']);
      const profiles = normalizeArray(profRaw,   ['items', 'profiles', 'results', 'data', 'entities']);

      const built = alerts.map((alert, idx) => {
        const alertText = [
          alert.message, alert.title, alert.type, alert.severity,
          alert.description, alert.source, alert.category,
        ].filter(Boolean).join(' ');
        const aToks = tokens(alertText);

        const matchedNodes = nodes.filter(nd => {
          const s = [nd.label, nd.name, nd.title, nd.type, nd.description, nd.id]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const matchedProfiles = profiles.filter(prof => {
          const s = [prof.name, prof.title, prof.category, prof.type, prof.description, prof.subject]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const hasNode    = matchedNodes.length > 0;
        const hasProfile = matchedProfiles.length > 0;
        let cls;
        if (hasNode && hasProfile) cls = 'FUSED';
        else if (hasNode)           cls = 'MODELED';
        else if (hasProfile)        cls = 'PROFILED';
        else                        cls = 'DARK';

        return {
          id:             `alert-${idx}`,
          name:           alert.message || alert.title || `Alert #${idx + 1}`,
          severity:       alert.severity || alert.level || '',
          type:           alert.type || alert.category || '',
          cls,
          matchedNodes,
          matchedProfiles,
        };
      });

      const fused    = built.filter(r => r.cls === 'FUSED').length;
      const modeled  = built.filter(r => r.cls === 'MODELED').length;
      const profiled = built.filter(r => r.cls === 'PROFILED').length;
      const dark     = built.filter(r => r.cls === 'DARK').length;

      setRows(built);
      setCounts({ alerts: built.length, nodes: nodes.length, profiles: profiles.length, fused, modeled, profiled, dark });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:obifus-toggle', handler);
    return () => window.removeEventListener('jarvis:obifus-toggle', handler);
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
        body:    JSON.stringify({ message: buildObifusScript() }),
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

  const pulse = counts.dark > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s)
        || r.type.toLowerCase().includes(s)
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
          position: 'fixed', bottom: 8, left: 101000, zIndex: 191,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ OBIFUS{counts.dark > 0 ? <span style={pulse}> {counts.dark}</span> : null}
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
            ◈ OPS ALERT × BRAIN × INTEL PROFILE — INTELLIGENCE FUSION
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'ALERTS',   val: counts.alerts,   col: '#94A3B8' },
            { label: 'NODES',    val: counts.nodes,    col: '#94A3B8' },
            { label: 'PROFILES', val: counts.profiles, col: '#94A3B8' },
            { label: 'FUSED',    val: counts.fused,    col: CLS_COLOR.FUSED    },
            { label: 'MODELED',  val: counts.modeled,  col: CLS_COLOR.MODELED  },
            { label: 'PROFILED', val: counts.profiled, col: CLS_COLOR.PROFILED },
            { label: 'DARK',     val: counts.dark,     col: CLS_COLOR.DARK     },
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
            <div style={{ color: '#475569', fontSize: 12, padding: 8 }}>No alerts match.</div>
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
                {row.severity && (
                  <span style={{
                    fontSize: 9, color: SEV_COLOR[row.severity?.toLowerCase()] || '#94A3B8',
                    border: `1px solid ${SEV_COLOR[row.severity?.toLowerCase()] || '#334155'}`,
                    borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                  }}>{row.severity.toUpperCase()}</span>
                )}
                <span style={{ color: '#CBD5E1', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ color: '#475569', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                  {row.matchedNodes.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#38BDF8', fontSize: 10, marginRight: 6 }}>Brain nodes:</span>
                      {row.matchedNodes.slice(0, 5).map((nd, i) => (
                        <span key={i} style={{
                          display: 'inline-block', marginRight: 4, marginBottom: 2,
                          background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                          color: '#38BDF8', fontSize: 9, borderRadius: 3, padding: '1px 5px',
                        }}>
                          {nd.label || nd.name || nd.id}
                          {nd.score != null && <span style={{ opacity: 0.7 }}> {(+nd.score).toFixed(2)}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedProfiles.length > 0 && (
                    <div>
                      <span style={{ color: '#F59E0B', fontSize: 10, marginRight: 6 }}>Intel profiles:</span>
                      {row.matchedProfiles.slice(0, 5).map((prof, i) => (
                        <span key={i} style={{
                          display: 'inline-block', marginRight: 4, marginBottom: 2,
                          background: 'rgba(245,158,11,0.1)', border: '1px solid #F59E0B',
                          color: '#F59E0B', fontSize: 9, borderRadius: 3, padding: '1px 5px',
                        }}>
                          {prof.name || prof.title || prof.subject || 'Profile'}
                          {prof.category && <span style={{ opacity: 0.7 }}> [{prof.category}]</span>}
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
