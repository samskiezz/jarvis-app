/**
 * SystemStatusTaskSwarmReadiness — F47
 *
 * Fetches /v1/jarvis/system/status + /entities/Task + /entities/SwarmJob
 * Cross-references each service/component from system status against active
 * tasks AND swarm jobs to classify:
 *   OPERATIONAL — matched both a task AND a swarm job (full activity coverage)
 *   TASKED      — matched a task only (workload assigned, no swarm processing)
 *   PROCESSING  — matched a swarm job only (swarm active, no explicit task)
 *   STALLED     — no match in either (service up but no active workload)
 *
 * Toggle: ◈ SYSOPS button (fixed, bottom strip) left:75240, zIndex:145
 * Stat tiles: services / tasks / swarms / operational / tasked / processing / stalled
 * Red pulse on STALLED count.
 * Expandable rows: matched tasks with status badge + matched swarm jobs with progress badge.
 * Filter tabs: ALL / OPERATIONAL / TASKED / PROCESSING / STALLED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "system ops"/"operational readiness"/"service status"/"sysops"/
 *        "system tasks"/"service tasks"/"swarm readiness"/"stalled services"/"ops readiness"
 * Event: jarvis:sysops-toggle
 * Auto-refresh: 60 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'OPERATIONAL', 'TASKED', 'PROCESSING', 'STALLED'];

const CLS_COLOR = {
  OPERATIONAL: '#00E5A0',
  TASKED:      '#29E7FF',
  PROCESSING:  '#A78BFA',
  STALLED:     '#EF4444',
};

const PULSE_CSS = `@keyframes sysops-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifyService(svcToks, tasks, swarms) {
  const matchedTasks = tasks.filter(t =>
    overlaps(svcToks, [t.name, t.title, t.description, t.type, t.category, t.tags, t.service, t.component].join(' '))
  );
  const matchedSwarms = swarms.filter(s =>
    overlaps(svcToks, [s.name, s.title, s.description, s.type, s.job_type, s.tags, s.target, s.component].join(' '))
  );
  const hasTask  = matchedTasks.length > 0;
  const hasSwarm = matchedSwarms.length > 0;
  const cls = hasTask && hasSwarm ? 'OPERATIONAL' : hasTask ? 'TASKED' : hasSwarm ? 'PROCESSING' : 'STALLED';
  return { cls, matchedTasks, matchedSwarms };
}

function extractServices(statusData) {
  if (!statusData) return [];
  // Handle various system status shapes
  const direct = statusData.services || statusData.components || statusData.systems
    || statusData.modules || statusData.checks || statusData.subsystems;
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === 'object') {
    return Object.entries(direct).map(([k, v]) => ({
      name: k,
      status: typeof v === 'string' ? v : (v?.status || v?.state || 'unknown'),
      version: v?.version,
      uptime: v?.uptime,
      latency: v?.latency,
      ...( typeof v === 'object' ? v : {}),
    }));
  }
  // Flatten top-level keys that look like service entries
  const keys = Object.keys(statusData).filter(k =>
    !['ok', 'status', 'uptime', 'version', 'timestamp', 'message', 'error'].includes(k)
  );
  if (keys.length > 0) {
    return keys.map(k => ({
      name: k,
      status: typeof statusData[k] === 'string' ? statusData[k]
        : (statusData[k]?.status || statusData[k]?.state || 'unknown'),
      ...(typeof statusData[k] === 'object' ? statusData[k] : {}),
    }));
  }
  // Fallback: return a single entry for the overall status
  return [{ name: 'system', status: statusData.status || 'unknown' }];
}

export function isSysopsQuery(q) {
  return /\b(system.ops|operational.readiness|service.status|sysops|system.tasks|service.tasks|swarm.readiness|stalled.services|ops.readiness|service.readiness|system.readiness|stalled.service|service.workload|service.swarm)\b/i.test(q);
}
export function buildSysopsScript() {
  return 'Opening System Status × Task × SwarmJob Operational Readiness. Cross-referencing live services against active tasks and swarm jobs to identify stalled services with no active workload.';
}

export default function SystemStatusTaskSwarmReadiness() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [taskCount, setTaskCount]   = useState(0);
  const [swarmCount, setSwarmCount] = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [sysRes, taskRes, swarmRes] = await Promise.all([
        fetch(`${API}/v1/jarvis/system/status`, { headers: h }),
        fetch(`${API}/entities/Task`,           { headers: h }),
        fetch(`${API}/entities/SwarmJob`,       { headers: h }),
      ]);
      const [sysRaw, taskRaw, swarmRaw] = await Promise.all([
        sysRes.ok   ? sysRes.json()   : {},
        taskRes.ok  ? taskRes.json()  : [],
        swarmRes.ok ? swarmRes.json() : [],
      ]);

      const services = extractServices(sysRaw);
      const tasks = Array.isArray(taskRaw)
        ? taskRaw
        : (taskRaw?.items || taskRaw?.data || taskRaw?.results || taskRaw?.tasks || []);
      const swarms = Array.isArray(swarmRaw)
        ? swarmRaw
        : (swarmRaw?.items || swarmRaw?.data || swarmRaw?.results || swarmRaw?.jobs || []);

      setTaskCount(tasks.length);
      setSwarmCount(swarms.length);

      const built = services.map((svc, i) => {
        const id     = svc.id || svc.name || `svc-${i}`;
        const name   = svc.name || svc.service || svc.component || id;
        const status = svc.status || svc.state || 'unknown';
        const toks   = tokens([name, status, svc.type, svc.category, svc.description].join(' '));
        const { cls, matchedTasks, matchedSwarms } = classifyService(toks, tasks, swarms);
        return { id, name, status, uptime: svc.uptime, version: svc.version, latency: svc.latency, _cls: cls, _tasks: matchedTasks, _swarms: matchedSwarms };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:sysops-toggle', handler);
    return () => window.removeEventListener('jarvis:sysops-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 60000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { OPERATIONAL: 0, TASKED: 0, PROCESSING: 0, STALLED: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const stalledNames = rows.filter(r => r._cls === 'STALLED').slice(0, 5).map(r => r.name).join(', ');
    const prompt = `System Status × Task × SwarmJob Operational Readiness assessment: ${rows.length} services cross-referenced against ${taskCount} tasks and ${swarmCount} swarm jobs. ${counts.OPERATIONAL} services have full coverage (task + swarm). ${counts.TASKED} have task assignment only. ${counts.PROCESSING} have swarm activity only. ${counts.STALLED} services are stalled — no matched task or swarm job. ${stalledNames ? `Stalled services: ${stalledNames}.` : ''} Assess the operational readiness, identify the most critical stalled services, and recommend task or swarm job assignment priorities.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
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
  }, [rows, assessing, taskCount, swarmCount]);

  const counts = { OPERATIONAL: 0, TASKED: 0, PROCESSING: 0, STALLED: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.status, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 75240, zIndex: 145,
          background: 'rgba(239,68,68,0.12)', border: '1px solid #EF4444',
          color: '#EF4444', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ SYSOPS
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #2a1a1a',
        borderRadius: 6, zIndex: 9146, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #2a1a1a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(239,68,68,0.05)',
        }}>
          <span style={{ fontSize: 11, color: '#EF4444', letterSpacing: 2 }}>
            ◈ SYSTEM STATUS × TASK × SWARM — SYSOPS
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'SERVICES',    val: rows.length,            color: '#29E7FF' },
            { label: 'TASKS',       val: taskCount,              color: '#29E7FF' },
            { label: 'SWARMS',      val: swarmCount,             color: '#29E7FF' },
            { label: 'OPERATIONAL', val: counts.OPERATIONAL,     color: CLS_COLOR.OPERATIONAL },
            { label: 'TASKED',      val: counts.TASKED,          color: CLS_COLOR.TASKED },
            { label: 'PROCESSING',  val: counts.PROCESSING,      color: CLS_COLOR.PROCESSING },
            { label: 'STALLED',     val: counts.STALLED,         color: CLS_COLOR.STALLED, pulse: counts.STALLED > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'sysops-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #2a1a1a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#29E7FF'}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#2a4a5a'}`,
              color: tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#6A8BA0',
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, letterSpacing: 1,
            }}>{t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ''}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search services…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #2a4a5a',
              color: '#e2eaf0', padding: '2px 8px', borderRadius: 3, fontSize: 9, width: 140,
            }}
          />
        </div>

        {/* Status */}
        {loading && <div style={{ padding: '4px 14px', fontSize: 9, color: '#6A8BA0' }}>⟳ loading…</div>}
        {error   && <div style={{ padding: '4px 14px', fontSize: 9, color: '#ef4444' }}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.map((svc, i) => {
            const isExp = expanded === (svc.id || i);
            const statusColor = /up|ok|healthy|running|online|active/i.test(svc.status || '')
              ? '#00E5A0' : /warn|degraded|slow/i.test(svc.status || '') ? '#FFB800' : '#EF4444';
            return (
              <div key={svc.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (svc.id || i))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[svc._cls]}22`, color: CLS_COLOR[svc._cls],
                    border: `1px solid ${CLS_COLOR[svc._cls]}55`, letterSpacing: 1,
                    minWidth: 88, textAlign: 'center',
                  }}>{svc._cls}</span>
                  {svc.status && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: `${statusColor}11`, color: statusColor,
                      border: `1px solid ${statusColor}44`,
                    }}>{svc.status.toUpperCase().slice(0, 10)}</span>
                  )}
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>{svc.name}</span>
                  {svc.version && (
                    <span style={{ fontSize: 8, color: '#4a7a9a' }}>v{svc.version}</span>
                  )}
                  {svc.latency != null && (
                    <span style={{ fontSize: 8, color: '#4a7a9a', fontVariantNumeric: 'tabular-nums' }}>
                      {svc.latency}ms
                    </span>
                  )}
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {svc._tasks.length}T {svc._swarms.length}S
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {svc.uptime && (
                      <div style={{ fontSize: 8, color: '#4a7a9a', marginBottom: 4 }}>
                        uptime: {svc.uptime}
                      </div>
                    )}
                    {svc._tasks.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED TASKS</div>
                        {svc._tasks.slice(0, 5).map((t, ti) => (
                          <div key={ti} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {t.name || t.title || `Task ${ti + 1}`}
                            {(t.status || t.priority) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[t.status, t.priority].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {svc._swarms.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED SWARM JOBS</div>
                        {svc._swarms.slice(0, 5).map((s, si) => (
                          <div key={si} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {s.name || s.title || s.job_type || `SwarmJob ${si + 1}`}
                            {(s.status || s.progress != null) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[s.status, s.progress != null ? `${s.progress}%` : null].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {svc._tasks.length === 0 && svc._swarms.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No matched tasks or swarm jobs — service is stalled.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '12px 14px', color: '#6A8BA0', fontSize: 10 }}>No services match current filter.</div>
          )}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #2a1a1a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.15)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS READINESS'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.07)', borderLeft: '2px solid #EF4444', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
