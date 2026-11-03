/**
 * AlertCaseCreator — F300
 *
 * Ops Alert → Case Creator
 * Fetches /v1/alerts + /v1/cases (real ops endpoints)
 * Left panel: alert inbox sorted by payload.severity (highest first)
 *   "Create Case" button → POST /v1/cases with alert title + description
 *   Confirm modal before creating
 *   On success: linked case id badge next to alert
 *   Bulk "Create Cases for All CRITICAL" (severity >= 75) action
 * Right panel: /v1/cases list (live, auto-refresh)
 * Stat tiles: alerts / cases / critical / created (this session)
 * ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ ALRTCAS (left:215800, zIndex:396)
 * Event: jarvis:alrtcas-toggle
 * Auto-refresh: 60 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const PULSE_CSS = `@keyframes alrtcas-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

const SEV_COLOR = (sev) => {
  if (sev >= 75) return '#EF4444';
  if (sev >= 50) return '#F59E0B';
  return '#29E7FF';
};

const SEV_LABEL = (sev) => {
  if (sev >= 75) return 'CRITICAL';
  if (sev >= 50) return 'HIGH';
  return 'NORMAL';
};

export function isAlrtcasQuery(q) {
  return /\b(alert.case|case.creator|alrtcas|ops.alert|alert.inbox|critical.alert|create.case|case.from.alert|ops.case)\b/i.test(q);
}
export function buildAlrtcasScript() {
  return 'Opening Ops Alert → Case Creator. Loading alert inbox and cases panel to review unresolved critical alerts and create investigation cases.';
}

export default function AlertCaseCreator() {
  const [open, setOpen]           = useState(false);
  const [alerts, setAlerts]       = useState([]);
  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [linked, setLinked]       = useState({});       // alertId → caseId
  const [confirm, setConfirm]     = useState(null);     // alert being confirmed
  const [creating, setCreating]   = useState(false);
  const [createError, setCreateError] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [sessionCreated, setSessionCreated] = useState(0);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef               = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [alRes, caRes] = await Promise.all([
        fetch(`${apiBase()}/v1/alerts`, { headers: h }),
        fetch(`${apiBase()}/v1/cases`,  { headers: h }),
      ]);
      const [alData, caData] = await Promise.all([
        alRes.ok ? alRes.json() : { items: [] },
        caRes.ok ? caRes.json() : { items: [] },
      ]);
      const rawAlerts = Array.isArray(alData) ? alData : (alData?.items || alData?.data || []);
      const rawCases  = Array.isArray(caData) ? caData : (caData?.items || caData?.data || []);

      // Sort by severity descending (payload.severity, fallback 0)
      const sorted = [...rawAlerts].sort((a, b) => {
        const sa = (b?.payload?.severity ?? 0);
        const sb = (a?.payload?.severity ?? 0);
        return sa - sb;
      });
      setAlerts(sorted);
      setCases(rawCases);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:alrtcas-toggle', handler);
    return () => window.removeEventListener('jarvis:alrtcas-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 60000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const doCreateCase = useCallback(async (alert) => {
    setCreating(true); setCreateError('');
    const ruleName = alert?.payload?.rule_name || `Alert #${alert.id}`;
    const sev      = alert?.payload?.severity ?? 0;
    const target   = alert?.payload?.target   || '';
    const title    = `[Alert] ${ruleName}${target ? ` — ${target}` : ''}`;
    try {
      const res = await fetch(`${apiBase()}/v1/cases`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          status: sev >= 75 ? 'investigating' : 'open',
          entity_ids: [],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      const caseId = data?.id ?? data?.case?.id;
      setLinked(prev => ({ ...prev, [alert.id]: caseId }));
      setSessionCreated(n => n + 1);
      setConfirm(null);
      // Refresh cases list
      const caRes = await fetch(`${apiBase()}/v1/cases`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
      });
      if (caRes.ok) {
        const caData = await caRes.json();
        setCases(Array.isArray(caData) ? caData : (caData?.items || caData?.data || []));
      }
    } catch (e) {
      setCreateError(e.message || 'create error');
    }
    setCreating(false);
  }, []);

  const bulkCreateCritical = useCallback(async () => {
    if (bulkRunning) return;
    setBulkRunning(true);
    const criticals = alerts.filter(a => (a?.payload?.severity ?? 0) >= 75 && !linked[a.id]);
    for (const alert of criticals) {
      await doCreateCase(alert);
      await new Promise(r => setTimeout(r, 400));
    }
    setBulkRunning(false);
  }, [alerts, linked, bulkRunning, doCreateCase]);

  const assess = useCallback(async () => {
    if (assessing || alerts.length === 0) return;
    setAssessing(true); setAssessment('');
    const criticals = alerts.filter(a => (a?.payload?.severity ?? 0) >= 75);
    const unresolved = criticals.filter(a => a.status !== 'acked');
    const withCases  = criticals.filter(a => linked[a.id]);
    const prompt = `Ops alert case analysis: ${alerts.length} total alerts, ${criticals.length} critical (severity≥75), ${unresolved.length} unresolved/unacked criticals, ${withCases.length} already linked to cases. ${sessionCreated} cases created this session. Assess which unresolved critical alerts most urgently need investigation cases, and what the top operational risk is right now.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
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
  }, [alerts, linked, sessionCreated, assessing]);

  const criticalCount = alerts.filter(a => (a?.payload?.severity ?? 0) >= 75).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 215800, zIndex: 396,
          background: 'rgba(239,68,68,0.12)', border: '1px solid #EF4444',
          color: '#EF4444', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ ALRTCAS
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>

      {/* Confirm modal */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(5,15,25,0.98)', border: '1px solid #EF4444',
            borderRadius: 8, padding: 24, maxWidth: 420, width: '90%',
            fontFamily: 'monospace', color: '#e2eaf0',
          }}>
            <div style={{ fontSize: 13, color: '#EF4444', marginBottom: 12, letterSpacing: 1 }}>
              CONFIRM: CREATE CASE
            </div>
            <div style={{ fontSize: 11, marginBottom: 8, color: '#A0B4C0' }}>
              Alert: <span style={{ color: '#fff' }}>{confirm?.payload?.rule_name || `#${confirm.id}`}</span>
            </div>
            <div style={{ fontSize: 11, marginBottom: 8, color: '#A0B4C0' }}>
              Severity: <span style={{ color: SEV_COLOR(confirm?.payload?.severity ?? 0) }}>
                {confirm?.payload?.severity ?? 0} ({SEV_LABEL(confirm?.payload?.severity ?? 0)})
              </span>
            </div>
            {confirm?.payload?.target && (
              <div style={{ fontSize: 11, marginBottom: 12, color: '#A0B4C0' }}>
                Target: <span style={{ color: '#e2eaf0' }}>{confirm.payload.target}</span>
              </div>
            )}
            {createError && (
              <div style={{ fontSize: 10, color: '#EF4444', marginBottom: 8 }}>{createError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setConfirm(null); setCreateError(''); }}
                style={{
                  background: 'transparent', border: '1px solid #2a4a5a',
                  color: '#6A8BA0', padding: '4px 14px', cursor: 'pointer',
                  borderRadius: 4, fontSize: 10, fontFamily: 'monospace',
                }}
              >CANCEL</button>
              <button
                onClick={() => doCreateCase(confirm)}
                disabled={creating}
                style={{
                  background: creating ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.15)',
                  border: '1px solid #EF4444', color: '#EF4444',
                  padding: '4px 14px', cursor: creating ? 'not-allowed' : 'pointer',
                  borderRadius: 4, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1,
                }}
              >{creating ? 'CREATING…' : 'CREATE CASE'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: 'fixed', top: 60, right: 20, width: 720, maxHeight: '86vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1e3a4a',
        borderRadius: 6, zIndex: 9396, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #1e3a4a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(239,68,68,0.06)',
        }}>
          <span style={{ fontSize: 11, color: '#EF4444', letterSpacing: 2 }}>
            ◈ OPS ALERT → CASE CREATOR — ALRTCAS
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={load}
              style={{ background: 'none', border: '1px solid #2a4a5a', color: '#6A8BA0', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, fontFamily: 'monospace' }}
            >↺ REFRESH</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e3a4a', flexWrap: 'wrap' }}>
          {[
            { label: 'ALERTS',   val: alerts.length,   color: '#29E7FF' },
            { label: 'CASES',    val: cases.length,    color: '#29E7FF' },
            { label: 'CRITICAL', val: criticalCount,   color: '#EF4444', pulse: criticalCount > 0 },
            { label: 'CREATED',  val: sessionCreated,  color: '#22c55e' },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'alrtcas-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
          <button
            onClick={bulkCreateCritical}
            disabled={bulkRunning || criticalCount === 0}
            style={{
              marginLeft: 'auto',
              background: bulkRunning ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.12)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '4px 12px', cursor: bulkRunning ? 'not-allowed' : 'pointer',
              borderRadius: 4, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1,
              opacity: criticalCount === 0 ? 0.4 : 1,
            }}
          >{bulkRunning ? 'CREATING…' : `▶ CREATE ALL CRITICAL (${criticalCount})`}</button>
        </div>

        {/* Main: alerts left, cases right */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: Alert inbox */}
          <div style={{
            flex: '0 0 55%', borderRight: '1px solid #1e3a4a',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '6px 14px', fontSize: 9, color: '#6A8BA0', letterSpacing: 1, borderBottom: '1px solid #111e28' }}>
              ALERT INBOX — SORTED BY SEVERITY
            </div>
            {loading && alerts.length === 0 && (
              <div style={{ padding: 16, fontSize: 10, color: '#6A8BA0' }}>Loading alerts…</div>
            )}
            {error && (
              <div style={{ padding: '8px 14px', fontSize: 10, color: '#EF4444' }}>{error}</div>
            )}
            <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
              {alerts.length === 0 && !loading && (
                <div style={{ padding: '12px 14px', fontSize: 10, color: '#6A8BA0' }}>
                  No alerts. Use /v1/rules/evaluate to fire rules.
                </div>
              )}
              {alerts.map(alert => {
                const sev     = alert?.payload?.severity ?? 0;
                const name    = alert?.payload?.rule_name || `Alert #${alert.id}`;
                const target  = alert?.payload?.target   || '';
                const ts      = alert?.fired_ts ? new Date(alert.fired_ts).toLocaleString() : '';
                const status  = alert?.status  || 'open';
                const caseId  = linked[alert.id];
                return (
                  <div key={alert.id} style={{
                    padding: '7px 14px', borderBottom: '1px solid #111e28',
                    background: sev >= 75 ? 'rgba(239,68,68,0.04)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 8, padding: '1px 5px', borderRadius: 2,
                        background: `${SEV_COLOR(sev)}22`, color: SEV_COLOR(sev),
                        border: `1px solid ${SEV_COLOR(sev)}44`, letterSpacing: 1,
                      }}>{SEV_LABEL(sev)}</span>
                      <span style={{ fontSize: 10, color: '#e2eaf0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <span style={{
                        fontSize: 8, padding: '1px 5px', borderRadius: 2,
                        background: status === 'acked' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                        color: status === 'acked' ? '#22c55e' : '#F59E0B', border: '1px solid transparent',
                      }}>{status.toUpperCase()}</span>
                    </div>
                    {target && (
                      <div style={{ fontSize: 9, color: '#6A8BA0', marginBottom: 3 }}>Target: {target}</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {ts && <span style={{ fontSize: 8, color: '#3a5a6a' }}>{ts}</span>}
                      <span style={{ flex: 1 }} />
                      {caseId != null ? (
                        <span style={{
                          fontSize: 8, padding: '1px 7px', borderRadius: 2,
                          background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                          border: '1px solid #22c55e44',
                        }}>CASE #{caseId}</span>
                      ) : (
                        <button
                          onClick={() => { setCreateError(''); setConfirm(alert); }}
                          style={{
                            background: 'rgba(239,68,68,0.10)', border: '1px solid #EF444444',
                            color: '#EF4444', padding: '2px 8px', cursor: 'pointer',
                            borderRadius: 3, fontSize: 8, fontFamily: 'monospace', letterSpacing: 1,
                          }}
                        >+ CREATE CASE</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Cases list */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 14px', fontSize: 9, color: '#6A8BA0', letterSpacing: 1, borderBottom: '1px solid #111e28', display: 'flex', justifyContent: 'space-between' }}>
              <span>OPEN CASES</span>
              <span style={{ color: '#29E7FF' }}>{cases.length}</span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
              {cases.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 10, color: '#6A8BA0' }}>No cases yet.</div>
              )}
              {cases.map(c => {
                const ts = c?.created_ts ? new Date(c.created_ts).toLocaleString() : '';
                return (
                  <div key={c.id} style={{
                    padding: '7px 14px', borderBottom: '1px solid #111e28',
                  }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 9, color: '#29E7FF' }}>#{c.id}</span>
                      <span style={{
                        fontSize: 8, padding: '1px 5px', borderRadius: 2,
                        background: c.status === 'open' ? 'rgba(245,158,11,0.12)' : c.status === 'investigating' ? 'rgba(167,139,250,0.12)' : 'rgba(34,197,94,0.12)',
                        color: c.status === 'open' ? '#F59E0B' : c.status === 'investigating' ? '#A78BFA' : '#22c55e',
                      }}>{(c.status || 'open').toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#e2eaf0', marginBottom: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                    {ts && <div style={{ fontSize: 8, color: '#3a5a6a' }}>{ts}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ASSESS */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1e3a4a', background: 'rgba(5,15,25,0.6)' }}>
          <button
            onClick={assess}
            disabled={assessing || alerts.length === 0}
            style={{
              background: assessing ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.12)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '4px 14px', cursor: assessing ? 'not-allowed' : 'pointer',
              borderRadius: 4, fontSize: 9, fontFamily: 'monospace', letterSpacing: 1,
              opacity: alerts.length === 0 ? 0.4 : 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: 'rgba(239,68,68,0.06)', border: '1px solid #EF444433',
              borderRadius: 4, fontSize: 10, color: '#e2eaf0', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
            }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
