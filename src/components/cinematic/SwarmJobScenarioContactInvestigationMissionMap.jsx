/**
 * SwarmJobScenarioContactInvestigationMissionMap — F229
 *
 * Fetches /entities/SwarmJob + /v1/scenario/list +
 *         /entities/Contact + /v1/investigations
 *
 * Keyword-matches each swarm job (name/description/type/status) against
 * scenario names/descriptions, contact names/orgs/roles, and
 * investigation titles/descriptions to classify:
 *
 *   AUTONOMOUS  — matches all 3 sources (scenario + contact + investigation)
 *                 (fully grounded automation: has a playbook, an owner, and an open case)
 *   COORDINATED — matches 2 of 3 sources
 *                 (automation with partial mission grounding)
 *   STAFFED     — matches 1 source only
 *                 (some grounding but operationally isolated)
 *   ORPHAN      — no match to any source
 *                 (automation blind spot: no scenario, no owner, no investigation)
 *
 * Toggle: ◈ SWSCIM button (fixed, bottom strip) left:176040, zIndex:325
 * Stat tiles: swarm jobs / scenarios / contacts / investigations /
 *             autonomous / coordinated / staffed / orphan
 * Amber pulse on ORPHAN count (automation blind spots).
 * Expandable rows: matched scenarios with status badge +
 *                  matched contacts with role/org +
 *                  matched investigations with status badge.
 * Filter tabs: ALL / AUTONOMOUS / COORDINATED / STAFFED / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swscim"/"swarm mission"/"swarm coverage"/"swarm investigation"/
 *        "autonomous mission"/"mission automation"/"swarm orphan"/
 *        "swarm coordination"/"automation coverage"/"swarm blind spot"
 * Event: jarvis:swscim-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'AUTONOMOUS', 'COORDINATED', 'STAFFED', 'ORPHAN'];

const CLS_COLOR = {
  AUTONOMOUS:  '#22C55E',
  COORDINATED: '#38BDF8',
  STAFFED:     '#A78BFA',
  ORPHAN:      '#F59E0B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSwarm(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.jobs))        return raw.jobs;
  if (Array.isArray(raw?.swarm_jobs))  return raw.swarm_jobs;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.contacts))    return raw.contacts;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                   return raw;
  if (Array.isArray(raw?.items))            return raw.items;
  if (Array.isArray(raw?.investigations))   return raw.investigations;
  if (Array.isArray(raw?.results))          return raw.results;
  if (Array.isArray(raw?.data))             return raw.data;
  return [];
}

function jobLabel(job) {
  return job?.name || job?.title || job?.job_type || job?.id || 'Untitled';
}

function jobText(job) {
  return [job?.name, job?.title, job?.description, job?.job_type, job?.type, job?.status, job?.tags?.join?.(' ')].join(' ');
}

function classify(job, scenarios, contacts, investigations) {
  const jtoks = tokens(jobText(job));

  const matchedScenarios = scenarios.filter(sc =>
    overlaps(jtoks, [sc?.name, sc?.title, sc?.description, sc?.objective, sc?.tags?.join?.(' ')].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(jtoks, [c?.name, c?.full_name, c?.org, c?.organisation, c?.role, c?.title, c?.tags?.join?.(' ')].join(' '))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(jtoks, [inv?.title, inv?.name, inv?.description, inv?.summary, inv?.tags?.join?.(' '), inv?.type].join(' '))
  );

  const srcCount = [matchedScenarios.length > 0, matchedContacts.length > 0, matchedInvestigations.length > 0].filter(Boolean).length;

  let cls;
  if (srcCount === 3)      cls = 'AUTONOMOUS';
  else if (srcCount === 2) cls = 'COORDINATED';
  else if (srcCount === 1) cls = 'STAFFED';
  else                     cls = 'ORPHAN';

  return { cls, matchedScenarios, matchedContacts, matchedInvestigations };
}

/* ─── exported query helpers ─── */
export function isSwscimQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'swscim', 'swarm mission', 'swarm coverage', 'swarm investigation',
    'autonomous mission', 'mission automation', 'swarm orphan',
    'swarm coordination', 'automation coverage', 'swarm blind spot',
  ].some(k => s.includes(k));
}

export function buildSwscimScript() {
  return (
    'Fetch /entities/SwarmJob, /v1/scenario/list, /entities/Contact, and /v1/investigations. ' +
    'Keyword-match each swarm job (name/description/type/status) against ' +
    'scenario names/descriptions, contact names/orgs/roles, and ' +
    'investigation titles/descriptions. ' +
    'Classify each swarm job as AUTONOMOUS (matches scenario + contact + investigation — ' +
    'fully grounded automation with a playbook, an owner, and an open case), ' +
    'COORDINATED (matches 2 of 3 sources — automation with partial mission coverage), ' +
    'STAFFED (matches 1 source only — some grounding but operationally isolated), ' +
    'or ORPHAN (no match to any source — automation blind spot with no scenario, no owner, ' +
    'no investigation). ' +
    'Report the total ORPHAN count, identify which orphaned swarm jobs represent the highest ' +
    'mission risk (e.g. long-running, critical job types, or high-resource jobs), ' +
    'and recommend which scenarios should incorporate them, ' +
    'which contacts should be assigned as owners, ' +
    'and which investigations should reference them.'
  );
}

/* ─── component ─── */
export default function SwarmJobScenarioContactInvestigationMissionMap() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing]   = useState(false);
  const timerRef                    = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const [rSw, rSc, rCo, rInv] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`,    { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/scenario/list`,     { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Contact`,     { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/investigations`,    { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const jobs           = normalizeSwarm(rSw);
      const scenarios      = normalizeScenarios(rSc);
      const contacts       = normalizeContacts(rCo);
      const investigations = normalizeInvestigations(rInv);

      const classified = jobs.map(job => ({
        job,
        ...classify(job, scenarios, contacts, investigations),
      }));

      setRows(classified);
    } catch (_) {
      // network error — leave existing rows
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:swscim-toggle', handler);
    return () => window.removeEventListener('jarvis:swscim-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { AUTONOMOUS: 0, COORDINATED: 0, STAFFED: 0, ORPHAN: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return jobLabel(r.job).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildSwscimScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      if (txt) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ text: txt.slice(0, 400) }),
          });
        } catch (_) {}
      }
    } catch (_) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const orphanPulse = counts.ORPHAN > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 176040,
    zIndex: 325,
    background: orphanPulse ? 'rgba(245,158,11,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${orphanPulse ? '#F59E0B' : 'rgba(100,116,139,0.5)'}`,
    color: orphanPulse ? '#F59E0B' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: orphanPulse ? 'jarvis-pulse-amber 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 700,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(245,158,11,0.35)',
    borderRadius: 8,
    zIndex: 3250,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(245,158,11,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="SwarmJob × Scenario × Contact × Investigation Autonomous Mission Coverage Map">
        ◈ SWSCIM{counts.ORPHAN > 0 ? ` [${counts.ORPHAN}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: 12 }}>
              ◈ SWARM × SCENARIO × CONTACT × INVESTIGATION
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
            {[
              { label: 'SWARM JOBS',   val: rows.length,          color: '#94A3B8' },
              { label: 'AUTONOMOUS',   val: counts.AUTONOMOUS,    color: CLS_COLOR.AUTONOMOUS },
              { label: 'COORDINATED',  val: counts.COORDINATED,   color: CLS_COLOR.COORDINATED },
              { label: 'STAFFED',      val: counts.STAFFED,       color: CLS_COLOR.STAFFED },
              { label: 'ORPHAN',       val: counts.ORPHAN,        color: CLS_COLOR.ORPHAN },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 88, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(245,158,11,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(245,158,11,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #F59E0B' : '2px solid transparent',
                color: tab === t ? '#F59E0B' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search swarm jobs…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 180 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No swarm jobs match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { job, cls, matchedScenarios, matchedContacts, matchedInvestigations } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 90, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jobLabel(job)}</span>
                    {job?.status && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{job.status}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* scenarios */}
                      {matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SCENARIOS ({matchedScenarios.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedScenarios.slice(0, 6).map((sc, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {sc?.name || sc?.title || sc?.id || '—'} · {sc?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* contacts */}
                      {matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>CONTACTS ({matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedContacts.slice(0, 6).map((c, i) => (
                              <span key={i} style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || c?.full_name || c?.id || '—'} · {c?.role || c?.title || '?'} {c?.org || c?.organisation ? `@ ${c.org || c.organisation}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* investigations */}
                      {matchedInvestigations.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>INVESTIGATIONS ({matchedInvestigations.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedInvestigations.slice(0, 6).map((inv, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {inv?.title || inv?.name || inv?.id || '—'} · {inv?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedScenarios.length === 0 && matchedContacts.length === 0 && matchedInvestigations.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — automation blind spot.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.2)',
                border: '1px solid #F59E0B', color: '#F59E0B',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS ORPHAN SWARM JOBS'}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
                background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
