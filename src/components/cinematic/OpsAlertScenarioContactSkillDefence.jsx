/**
 * OpsAlertScenarioContactSkillDefence — F225
 *
 * Fetches /v1/ops/alerts + /v1/scenario/list +
 *         /entities/Contact + /v1/aip/skill
 *
 * Keyword-matches each ops alert (title/description/severity/type) against
 * scenario names/descriptions, contact names/roles/orgs, and skill names/descriptions
 * to classify:
 *
 *   COVERED  — matches all 3 sources (scenario + contact + skill)
 *              (alert has a runnable playbook, an assigned contact, and a matching skill)
 *   MANAGED  — matches 2 of 3 sources
 *              (alert partially covered)
 *   PARTIAL  — matches exactly 1 source
 *              (alert minimally covered)
 *   BLIND    — no match to any source
 *              (fully undefended alert — no playbook, no contact, no skill)
 *
 * Toggle: ◈ ISCDEF button (fixed, bottom strip) left:173800, zIndex:321
 * Stat tiles: alerts / scenarios / contacts / skills /
 *             covered / managed / partial / blind
 * Red pulse on BLIND count (fully undefended incidents).
 * Expandable rows: matched scenarios with status badge +
 *                  matched contacts with role/org badge +
 *                  matched skills with score badge.
 * Filter tabs: ALL / COVERED / MANAGED / PARTIAL / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "iscdef"/"incident defence"/"alert defence"/"blind alert"/"undefended alert"/
 *        "alert scenario"/"alert skill"/"alert contact defence"/"covered alerts"/
 *        "ops defence"/"incident coverage"/"alert coverage"
 * Event: jarvis:iscdef-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'MANAGED', 'PARTIAL', 'BLIND'];

const CLS_COLOR = {
  COVERED: '#22C55E',
  MANAGED: '#38BDF8',
  PARTIAL: '#F59E0B',
  BLIND:   '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.scenarios))  return raw.scenarios;
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

function normalizeSkills(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.skills))   return raw.skills;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function alertLabel(a) {
  return a?.title || a?.name || a?.alert_type || a?.id || 'Unknown';
}

function alertText(a) {
  return [a?.title, a?.name, a?.description, a?.type, a?.alert_type, a?.severity, a?.category].join(' ');
}

function classify(alert, scenarios, contacts, skills) {
  const atoks = tokens(alertText(alert));

  const matchedScenarios = scenarios.filter(s =>
    overlaps(atoks, [s?.name, s?.title, s?.description, s?.type, s?.status, s?.category, s?.tags].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(atoks, [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.email, (c?.tags || []).join(' ')].join(' '))
  );
  const matchedSkills = skills.filter(sk =>
    overlaps(atoks, [sk?.name, sk?.title, sk?.description, sk?.category, sk?.type, sk?.domain].join(' '))
  );

  const hasS = matchedScenarios.length > 0;
  const hasC = matchedContacts.length > 0;
  const hasSk = matchedSkills.length > 0;
  const srcCnt = [hasS, hasC, hasSk].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'COVERED';
  else if (srcCnt === 2) cls = 'MANAGED';
  else if (srcCnt === 1) cls = 'PARTIAL';
  else                   cls = 'BLIND';

  return { cls, matchedScenarios, matchedContacts, matchedSkills };
}

export function isIscdefQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('iscdef') ||
    s.includes('incident defence') ||
    s.includes('incident defense') ||
    s.includes('alert defence') ||
    s.includes('alert defense') ||
    s.includes('blind alert') ||
    s.includes('undefended alert') ||
    s.includes('alert scenario') ||
    s.includes('alert skill') ||
    s.includes('alert contact defence') ||
    s.includes('alert contact defense') ||
    s.includes('covered alerts') ||
    s.includes('ops defence') ||
    s.includes('ops defense') ||
    s.includes('incident coverage') ||
    s.includes('alert coverage')
  );
}

export function buildIscdefScript(counts) {
  return `Analyse the JARVIS Incident Defence Coverage.
Total ops alerts: ${counts.total}. Covered: ${counts.covered}. Managed: ${counts.managed}. Partial: ${counts.partial}. Blind: ${counts.blind}.
Focus on the ${counts.blind} fully undefended alerts — alerts with no matching scenario playbook, no assigned contact, and no matching skill.
Identify the highest-severity blind alerts and propose concrete remediation: assign a runnable scenario, assign a contact owner, or develop a matching capability.`;
}

export default function OpsAlertScenarioContactSkillDefence() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [skills, setSkills]       = useState([]);
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
      const [aRes, sRes, cRes, skRes] = await Promise.all([
        fetch(`${API}/v1/ops/alerts`,      { headers: hdrs }),
        fetch(`${API}/v1/scenario/list`,   { headers: hdrs }),
        fetch(`${API}/entities/Contact`,   { headers: hdrs }),
        fetch(`${API}/v1/aip/skill`,       { headers: hdrs }),
      ]);
      const [aRaw, sRaw, cRaw, skRaw] = await Promise.all([
        aRes.ok  ? aRes.json()  : [],
        sRes.ok  ? sRes.json()  : [],
        cRes.ok  ? cRes.json()  : [],
        skRes.ok ? skRes.json() : [],
      ]);
      const alerts   = normalizeAlerts(aRaw);
      const scens    = normalizeScenarios(sRaw);
      const ctcts    = normalizeContacts(cRaw);
      const sks      = normalizeSkills(skRaw);
      setScenarios(scens); setContacts(ctcts); setSkills(sks);
      setRows(alerts.map(a => ({ alert: a, ...classify(a, scens, ctcts, sks) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:iscdef-toggle', toggle);
    return () => window.removeEventListener('jarvis:iscdef-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const blind = rows.filter(r => r.cls === 'BLIND').length;
    const script = buildIscdefScript({
      total: rows.length,
      covered: rows.filter(r => r.cls === 'COVERED').length,
      managed: rows.filter(r => r.cls === 'MANAGED').length,
      partial: rows.filter(r => r.cls === 'PARTIAL').length,
      blind,
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
    total:   rows.length,
    covered: rows.filter(r => r.cls === 'COVERED').length,
    managed: rows.filter(r => r.cls === 'MANAGED').length,
    partial: rows.filter(r => r.cls === 'PARTIAL').length,
    blind:   rows.filter(r => r.cls === 'BLIND').length,
  };
  const blindPulse = counts.blind > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || alertLabel(r.alert).toLowerCase().includes(search.toLowerCase()))
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
          position: 'fixed', bottom: 8, left: 173800, zIndex: 321,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${open ? '#EF4444' : 'rgba(239,68,68,0.3)'}`,
          color: '#EF4444', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ ISCDEF
        {blindPulse && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff', borderRadius: 9,
            padding: '1px 5px', fontSize: 9, fontWeight: 700,
            animation: 'pulse 1.5s infinite',
          }}>
            {counts.blind}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 36, left: 0, right: 0, margin: '0 auto',
          width: 740, maxHeight: '70vh', zIndex: 10321,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 700 }}>◈ INCIDENT DEFENCE COVERAGE</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F225 · /v1/ops/alerts + /v1/scenario/list + /entities/Contact + /v1/aip/skill</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {TILE('ALERTS',    counts.total,      '#94A3B8')}
            {TILE('SCENARIOS', scenarios.length,  '#818CF8')}
            {TILE('CONTACTS',  contacts.length,   '#38BDF8')}
            {TILE('SKILLS',    skills.length,     '#34D399')}
            {TILE('COVERED',   counts.covered,    '#22C55E')}
            {TILE('MANAGED',   counts.managed,    '#38BDF8')}
            {TILE('PARTIAL',   counts.partial,    '#F59E0B')}
            {TILE('BLIND',     counts.blind,      '#EF4444')}
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
              placeholder="search alerts…"
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
              <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>No alerts match this filter.</div>
            )}
            {visible.map((row, i) => {
              const id     = row.alert?.id || row.alert?.title || i;
              const isOpen = !!expanded[id];
              const color  = CLS_COLOR[row.cls];
              const sev    = row.alert?.severity || row.alert?.level || '';
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
                    <span style={{ color, fontSize: 9, minWidth: 62, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alertLabel(row.alert)}
                    </span>
                    {sev && (
                      <span style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {sev}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SCENARIOS ({row.matchedScenarios.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedScenarios.slice(0, 6).map((s, si) => (
                              <span key={si} style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: '#818CF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {s?.name || s?.title || s?.id || '—'}
                                {s?.status ? ` · ${s.status}` : ''}
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
                      {row.matchedSkills.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SKILLS ({row.matchedSkills.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedSkills.slice(0, 6).map((sk, ski) => (
                              <span key={ski} style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {sk?.name || sk?.title || sk?.id || '—'}
                                {sk?.score != null ? ` · ${sk.score}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedScenarios.length === 0 && row.matchedContacts.length === 0 && row.matchedSkills.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No matched sources — fully undefended alert.</div>
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
              {assessing ? '▶ ASSESSING…' : '▶ ASSESS BLIND ALERTS'}
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
