/**
 * OpsAlertSwarmContactScenarioCoverage — F121
 *
 * Fetches /v1/ops/alerts + /entities/SwarmJob + /entities/Contact + /v1/scenario/list.
 *
 * Keyword-matches each ops alert (title/message/type/severity/source) against
 * swarm job names/types, contact names/roles/orgs, and scenario names/descriptions
 * to classify:
 *
 *   COVERED    — alert matches swarm AND contact AND scenario
 *                (fully defended: automation running, owner assigned, scenario scripted)
 *   PROCESSING — alert matches swarm but missing contact or scenario
 *                (partially automated — no human owner or playbook)
 *   STAFFED    — alert matches contact or scenario but no swarm job
 *                (human-led but no automation)
 *   BLIND      — no match to any source
 *                (full blind spot — undefended alert with no automation, no owner, no playbook)
 *
 * Toggle: ◈ ERESCOV button (fixed, bottom strip) left:116120, zIndex:218
 * Stat tiles: alerts / swarm jobs / contacts / scenarios / covered / processing / staffed / blind
 * Red pulse on BLIND count (fully undefended alerts).
 * Expandable rows: matched swarm jobs with status badge +
 *                  matched contacts with role/org +
 *                  matched scenarios with status badge.
 * Filter tabs: ALL / COVERED / PROCESSING / STAFFED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "erescov"/"emergency response"/"ops alert coverage"/"alert blind spot"
 *        "alert response coverage"/"undefended alert"/"blind alert"
 *        "alert swarm contact"/"alert scenario"/"ops coverage"/"response coverage"
 *        "alert automation"/"alert staffing"/"alert playbook"/"incident coverage"
 * Event: jarvis:erescov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'PROCESSING', 'STAFFED', 'BLIND'];

const CLS_COLOR = {
  COVERED:    '#22C55E',
  PROCESSING: '#3B82F6',
  STAFFED:    '#F97316',
  BLIND:      '#EF4444',
};

export function isErescovQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'erescov', 'emergency response', 'ops alert coverage', 'alert blind spot',
    'alert response coverage', 'undefended alert', 'blind alert',
    'alert swarm contact', 'alert scenario', 'ops coverage', 'response coverage',
    'alert automation', 'alert staffing', 'alert playbook', 'incident coverage',
    'ops blind spot', 'alert defense coverage', 'undefended ops',
  ].some(kw => s.includes(kw));
}

export function buildErescovScript(q) {
  return `JARVIS ops alert emergency response coverage audit triggered by: "${q}". Fetch /v1/ops/alerts + /entities/SwarmJob + /entities/Contact + /v1/scenario/list. Classify each alert as COVERED/PROCESSING/STAFFED/BLIND. Report the blind count and top 3 fully undefended operational blind spots.`;
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function alertLabel(a) {
  return a.title || a.name || a.message || a.type || a.id || 'Unknown';
}

function alertTokens(a) {
  return tokens(
    `${a.title || ''} ${a.name || ''} ${a.message || ''} ${a.description || ''} ${a.type || ''} ${a.severity || ''} ${a.source || ''} ${a.category || ''} ${a.tags ? (Array.isArray(a.tags) ? a.tags.join(' ') : a.tags) : ''}`
  );
}

function classifyAlert(alert, swarmJobs, contacts, scenarios) {
  const toks = alertTokens(alert);

  const mSwarm = swarmJobs.filter(j =>
    overlaps(toks, `${j.name || ''} ${j.type || ''} ${j.status || ''} ${j.description || ''} ${j.category || ''}`)
  );
  const mContacts = contacts.filter(c =>
    overlaps(toks, `${c.name || ''} ${c.role || ''} ${c.org || ''} ${c.department || ''} ${c.title || ''} ${c.tags ? (Array.isArray(c.tags) ? c.tags.join(' ') : c.tags) : ''}`)
  );
  const mScenarios = scenarios.filter(sc =>
    overlaps(toks, `${sc.name || ''} ${sc.title || ''} ${sc.description || ''} ${sc.category || ''} ${sc.type || ''} ${sc.objective || ''}`)
  );

  const hasSwarm    = mSwarm.length > 0;
  const hasContact  = mContacts.length > 0;
  const hasScenario = mScenarios.length > 0;

  let cls;
  if (hasSwarm && hasContact && hasScenario)          cls = 'COVERED';
  else if (hasSwarm)                                   cls = 'PROCESSING';
  else if (hasContact || hasScenario)                  cls = 'STAFFED';
  else                                                 cls = 'BLIND';

  return { alert, cls, mSwarm, mContacts, mScenarios };
}

export default function OpsAlertSwarmContactScenarioCoverage() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [alertsRaw, swarmRaw, contactsRaw, scenariosRaw] = await Promise.all([
        fetcher('/v1/ops/alerts'),
        fetcher('/entities/SwarmJob'),
        fetcher('/entities/Contact'),
        fetcher('/v1/scenario/list'),
      ]);

      const alerts    = normalizeArray(alertsRaw,    ['alerts', 'data', 'items', 'results']);
      const swarmJobs = normalizeArray(swarmRaw,     ['jobs', 'swarm_jobs', 'data', 'items', 'results']);
      const contacts  = normalizeArray(contactsRaw,  ['contacts', 'data', 'items', 'results']);
      const scenarios = normalizeArray(scenariosRaw, ['scenarios', 'data', 'items', 'results']);

      setRows(alerts.map(a => classifyAlert(a, swarmJobs, contacts, scenarios)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:erescov-toggle', handler);
    return () => window.removeEventListener('jarvis:erescov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    COVERED:    rows.filter(r => r.cls === 'COVERED').length,
    PROCESSING: rows.filter(r => r.cls === 'PROCESSING').length,
    STAFFED:    rows.filter(r => r.cls === 'STAFFED').length,
    BLIND:      rows.filter(r => r.cls === 'BLIND').length,
  };

  const swarmCount    = rows.reduce((n, r) => n + r.mSwarm.length,    0);
  const contactCount  = rows.reduce((n, r) => n + r.mContacts.length,  0);
  const scenarioCount = rows.reduce((n, r) => n + r.mScenarios.length, 0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return alertLabel(r.alert).toLowerCase().includes(s) ||
             (r.alert.type || r.alert.severity || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Alerts: ${rows.length}. Covered: ${counts.COVERED}. Processing: ${counts.PROCESSING}. Staffed: ${counts.STAFFED}. Blind: ${counts.BLIND}.`;
    const prompt = `JARVIS ops alert emergency response coverage audit: ${summary}. Identify the most critical blind alerts — those with no swarm automation, no contact owner, and no runnable scenario — fully undefended operational events. Provide a 2-sentence advisory on the highest-risk undefended alerts and priority actions to close emergency response gaps.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 116120, zIndex: 218,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ ERESCOV</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 218, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ ERESCOV</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Ops Alert × SwarmJob × Contact × Scenario — Emergency Response Coverage</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'ALERTS',     val: rows.length,         color: '#94a3b8' },
          { label: 'SWARM JOBS', val: swarmCount,          color: '#3B82F6' },
          { label: 'CONTACTS',   val: contactCount,        color: '#F59E0B' },
          { label: 'SCENARIOS',  val: scenarioCount,       color: '#818cf8' },
          { label: 'COVERED',    val: counts.COVERED,    color: CLS_COLOR.COVERED },
          { label: 'PROCESSING', val: counts.PROCESSING, color: CLS_COLOR.PROCESSING },
          { label: 'STAFFED',    val: counts.STAFFED,    color: CLS_COLOR.STAFFED },
          { label: 'BLIND',      val: counts.BLIND,      color: CLS_COLOR.BLIND, pulse: counts.BLIND > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'erescov-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {alertLabel(r.alert)}
                </span>
                {(r.alert.severity || r.alert.type) && (
                  <span style={{ background: '#200a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.alert.severity ? `sev:${r.alert.severity}` : ''}{r.alert.severity && r.alert.type ? ' · ' : ''}{r.alert.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mSwarm.length > 0 && (
                    <div>
                      <div style={{ color: '#3B82F6', fontSize: 10, marginBottom: 3 }}>SWARM JOBS ({r.mSwarm.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSwarm.slice(0, 8).map((j, k) => (
                          <span key={k} style={{ background: '#060f20', border: '1px solid #1e3a5f', color: '#3B82F6', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {j.name || j.type || j.id}
                            {j.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{j.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#150f00', border: '1px solid #78350f', color: '#F59E0B', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.id}
                            {(c.role || c.org) && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{c.role}{c.role && c.org ? ' · ' : ''}{c.org}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#818cf8', fontSize: 10, marginBottom: 3 }}>SCENARIOS ({r.mScenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mScenarios.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#0c0e20', border: '1px solid #312e81', color: '#818cf8', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{s.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSwarm.length === 0 && r.mContacts.length === 0 && r.mScenarios.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No swarm job, contact, or scenario match — fully undefended alert with no automation, owner, or playbook.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes erescov-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
