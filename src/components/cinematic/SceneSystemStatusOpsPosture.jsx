/**
 * SceneSystemStatusOpsPosture — F96
 *
 * Fetches all 10 /v1/cinematic/scene/{1..10} + /v1/jarvis/system/status + /v1/ops/alerts.
 *
 * Keyword-matches each scene (title/description/anchor names) against
 * system service names/health AND ops alert messages/types to classify:
 *   OPERATIONAL — scene has a matched healthy service AND no matching ops alert
 *   DEGRADED    — scene matches a degraded/warning/unhealthy service
 *   ALERTED     — scene matches an active ops alert (regardless of service state)
 *   OFFLINE     — no match to any system service AND no ops alert (unmonitored)
 *
 * Toggle: ◈ SCNPOS button (fixed, bottom strip) left:102120, zIndex:193
 * Stat tiles: scenes / services / alerts / operational / degraded / alerted / offline
 * Red pulse on OFFLINE count (unmonitored scenes — operational blind spots).
 * Expandable rows: matched system services with health status badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / OPERATIONAL / DEGRADED / ALERTED / OFFLINE + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scene posture"/"scnpos"/"scene status"/"scene operational"/"operational posture"
 *        "offline scenes"/"scene health"/"scene alert"/"scene system"/"posture monitor"
 *        "operational posture monitor"/"scene coverage posture"/"scene ops"
 * Event: jarvis:scnpos-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'OPERATIONAL', 'DEGRADED', 'ALERTED', 'OFFLINE'];

const CLS_COLOR = {
  OPERATIONAL: '#22C55E',
  DEGRADED:    '#F59E0B',
  ALERTED:     '#F97316',
  OFFLINE:     '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeServices(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // /v1/jarvis/system/status returns { services: [...] } or { components: [...] } or flat object
  if (Array.isArray(raw.services))    return raw.services;
  if (Array.isArray(raw.components))  return raw.components;
  if (Array.isArray(raw.checks))      return raw.checks;
  // Some backends return an object { svcName: { status, ... } }
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([name, v]) => ({
      name,
      status: typeof v === 'object' ? (v.status || v.health || 'unknown') : String(v),
    }));
  }
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.alerts))    return raw.alerts;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  if (Array.isArray(raw?.entities))  return raw.entities;
  return [];
}

const DEGRADED_STATES = new Set(['degraded', 'unhealthy', 'warning', 'warn', 'error', 'down', 'failing', 'failed', 'critical']);

export function isScnposQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'scene posture', 'scnpos', 'scene status', 'scene operational',
    'operational posture', 'offline scenes', 'scene health', 'scene alert',
    'scene system', 'posture monitor', 'operational posture monitor',
    'scene coverage posture', 'scene ops',
  ].some(k => s.includes(k));
}

export function buildScnposScript() {
  return (
    'Fetch all 10 cinematic scenes (/v1/cinematic/scene/1 through /v1/cinematic/scene/10), ' +
    '/v1/jarvis/system/status, and /v1/ops/alerts. ' +
    'Keyword-match each scene title and description against system service names/health AND ops alert messages/types. ' +
    'Classify each scene as OPERATIONAL/DEGRADED/ALERTED/OFFLINE. ' +
    'Report total OFFLINE count (scenes with no system service match and no ops alert — unmonitored operational blind spots), ' +
    'identify which OFFLINE or DEGRADED scenes represent the highest operational risk, ' +
    'and recommend system monitoring rules or ops alert configurations to improve coverage.'
  );
}

export default function SceneSystemStatusOpsPosture() {
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
    scenes: 0, services: 0, alerts: 0,
    operational: 0, degraded: 0, alerted: 0, offline: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [statusRaw, opsRaw, ...sceneRaws] = await Promise.all([
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,            { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        ...Array.from({ length: 10 }, (_, i) =>
          fetch(`${API}/v1/cinematic/scene/${i + 1}`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null)
        ),
      ]);

      const services = normalizeServices(statusRaw);
      const alerts   = normalizeAlerts(opsRaw);

      const built = sceneRaws.map((sceneRaw, idx) => {
        const sceneNum = idx + 1;
        if (!sceneRaw) {
          return {
            id: `scene-${sceneNum}`, num: sceneNum,
            name: `Scene ${sceneNum}`, description: '',
            cls: 'OFFLINE', matchedServices: [], matchedAlerts: [],
          };
        }

        const sceneText = [
          sceneRaw.title, sceneRaw.name, sceneRaw.description,
          sceneRaw.subtitle, sceneRaw.theme,
          ...(Array.isArray(sceneRaw.anchors) ? sceneRaw.anchors.map(a => a?.label || a?.name || '') : []),
        ].filter(Boolean).join(' ');
        const sToks = tokens(sceneText);

        const matchedServices = services.filter(svc => {
          const s = [svc.name, svc.label, svc.description, svc.component].filter(Boolean).join(' ');
          return overlaps(sToks, s);
        });

        const matchedAlerts = alerts.filter(alert => {
          const s = [alert.message, alert.title, alert.type, alert.severity, alert.description, alert.source, alert.category]
            .filter(Boolean).join(' ');
          return overlaps(sToks, s);
        });

        const hasDegraded = matchedServices.some(svc => {
          const st = (svc.status || svc.health || '').toLowerCase();
          return DEGRADED_STATES.has(st);
        });
        const hasAlert   = matchedAlerts.length > 0;
        const hasHealthy = matchedServices.some(svc => {
          const st = (svc.status || svc.health || '').toLowerCase();
          return !DEGRADED_STATES.has(st) && st !== '';
        });

        let cls;
        if (hasDegraded)             cls = 'DEGRADED';
        else if (hasAlert)           cls = 'ALERTED';
        else if (hasHealthy)         cls = 'OPERATIONAL';
        else                         cls = 'OFFLINE';

        return {
          id:              `scene-${sceneNum}`,
          num:             sceneNum,
          name:            sceneRaw.title || sceneRaw.name || `Scene ${sceneNum}`,
          description:     sceneRaw.description || sceneRaw.subtitle || '',
          cls,
          matchedServices,
          matchedAlerts,
        };
      });

      const operational = built.filter(r => r.cls === 'OPERATIONAL').length;
      const degraded    = built.filter(r => r.cls === 'DEGRADED').length;
      const alerted     = built.filter(r => r.cls === 'ALERTED').length;
      const offline     = built.filter(r => r.cls === 'OFFLINE').length;

      setRows(built);
      setCounts({ scenes: built.length, services: services.length, alerts: alerts.length, operational, degraded, alerted, offline });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:scnpos-toggle', handler);
    return () => window.removeEventListener('jarvis:scnpos-toggle', handler);
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
        body:    JSON.stringify({ message: buildScnposScript() }),
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

  const pulse = counts.offline > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s)
        || r.description.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const HEALTH_COLOR = {
    healthy: '#22C55E', ok: '#22C55E', up: '#22C55E', online: '#22C55E', running: '#22C55E',
    degraded: '#F59E0B', warning: '#F59E0B', warn: '#F59E0B',
    unhealthy: '#EF4444', error: '#EF4444', down: '#EF4444', failed: '#EF4444',
    critical: '#EF4444', failing: '#EF4444',
  };

  const SEV_COLOR = { critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#22C55E' };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 102120, zIndex: 193,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ SCNPOS{counts.offline > 0 ? <span style={pulse}> {counts.offline}</span> : null}
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
            ◈ SCENE × SYSTEM STATUS × OPS ALERT — OPERATIONAL POSTURE MONITOR
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'SCENES',      val: counts.scenes,      col: '#94A3B8' },
            { label: 'SERVICES',    val: counts.services,    col: '#94A3B8' },
            { label: 'ALERTS',      val: counts.alerts,      col: '#94A3B8' },
            { label: 'OPERATIONAL', val: counts.operational, col: CLS_COLOR.OPERATIONAL },
            { label: 'DEGRADED',    val: counts.degraded,    col: CLS_COLOR.DEGRADED    },
            { label: 'ALERTED',     val: counts.alerted,     col: CLS_COLOR.ALERTED     },
            { label: 'OFFLINE',     val: counts.offline,     col: CLS_COLOR.OFFLINE     },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}44`,
              borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 80,
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
            <div style={{ color: '#475569', fontSize: 12, padding: 8 }}>No scenes match.</div>
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
                <span style={{
                  fontSize: 9, color: '#94A3B8', border: '1px solid #334155',
                  borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>SCENE {row.num}</span>
                <span style={{ color: '#CBD5E1', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ color: '#475569', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 4 }}>
                  {row.description && (
                    <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>{row.description}</div>
                  )}
                  {row.matchedServices.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: '#38BDF8', fontSize: 10, marginRight: 6 }}>System services:</span>
                      {row.matchedServices.slice(0, 6).map((svc, i) => {
                        const st  = (svc.status || svc.health || 'unknown').toLowerCase();
                        const col = HEALTH_COLOR[st] || '#94A3B8';
                        return (
                          <span key={i} style={{
                            display: 'inline-block', marginRight: 4, marginBottom: 2,
                            background: `${col}18`, border: `1px solid ${col}`,
                            color: col, fontSize: 9, borderRadius: 3, padding: '1px 5px',
                          }}>
                            {svc.name || svc.label || svc.component || 'Service'}
                            <span style={{ opacity: 0.8, marginLeft: 4 }}>[{st.toUpperCase()}]</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedAlerts.length > 0 && (
                    <div>
                      <span style={{ color: '#F97316', fontSize: 10, marginRight: 6 }}>Ops alerts:</span>
                      {row.matchedAlerts.slice(0, 5).map((alert, i) => (
                        <span key={i} style={{
                          display: 'inline-block', marginRight: 4, marginBottom: 2,
                          background: 'rgba(249,115,22,0.1)', border: '1px solid #F97316',
                          color: '#F97316', fontSize: 9, borderRadius: 3, padding: '1px 5px',
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
                  {row.matchedServices.length === 0 && row.matchedAlerts.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 10 }}>No system service or ops alert match — unmonitored scene.</div>
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
