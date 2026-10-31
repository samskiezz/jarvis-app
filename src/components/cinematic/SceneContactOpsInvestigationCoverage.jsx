/**
 * SceneContactOpsInvestigationCoverage — F231
 *
 * Fetches all 10 /v1/cinematic/scene/{1..10} + /entities/Contact +
 *         /v1/ops/alerts + /v1/investigations
 *
 * Keyword-matches each scene (title/description/anchor labels) against
 * contact names/orgs/roles, ops alert titles/descriptions, and investigation
 * titles/summaries to classify:
 *
 *   COVERED    — matches all 3 sources (contact + ops alert + investigation)
 *               (fully monitored scene: has a responsible contact, active alert coverage, and open investigation)
 *   MONITORED  — matches 2 of 3 sources
 *               (partially covered scene with some situational coverage)
 *   STAFFED    — matches 1 source only
 *               (minimal coverage: only one situational dimension)
 *   DARK       — no match to any source
 *               (operational blind spot: no contact owner, no alert, no investigation)
 *
 * Toggle: ◈ SCOVOP button (fixed, bottom strip) left:177160, zIndex:327
 * Stat tiles: scenes / contacts / ops alerts / investigations /
 *             covered / monitored / staffed / dark
 * Red pulse on DARK count (fully unmonitored operational environments).
 * Expandable rows: matched contacts with role/org +
 *                  matched ops alerts with severity badge +
 *                  matched investigations with status badge.
 * Filter tabs: ALL / COVERED / MONITORED / STAFFED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scovop"/"scene coverage"/"scene contact"/"operational coverage"/
 *        "dark scene"/"unmonitored scene"/"scene ops"/"situational coverage"/
 *        "scene investigation"/"operational situational"
 * Event: jarvis:scovop-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TABS = ['ALL', 'COVERED', 'MONITORED', 'STAFFED', 'DARK'];

const CLS_COLOR = {
  COVERED:   '#22C55E',
  MONITORED: '#38BDF8',
  STAFFED:   '#A78BFA',
  DARK:      '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.items))             return raw.items;
  if (Array.isArray(raw?.investigations))    return raw.investigations;
  if (Array.isArray(raw?.results))           return raw.results;
  if (Array.isArray(raw?.data))              return raw.data;
  return [];
}

function sceneLabel(s) {
  return s?.title || s?.name || s?.id ? `Scene ${s.id}` : 'Untitled Scene';
}

function sceneText(s) {
  const anchors = (s?.anchors || []).map(a => [a?.label, a?.value, a?.description].join(' ')).join(' ');
  return [s?.title, s?.name, s?.description, s?.subtitle, s?.theme, anchors].join(' ');
}

function classify(scene, contacts, alerts, investigations) {
  const stoks = tokens(sceneText(scene));

  const matchedContacts = contacts.filter(c =>
    overlaps(stoks, [c?.name, c?.full_name, c?.org, c?.organisation, c?.role, c?.tags?.join?.(' ')].join(' '))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(stoks, [a?.title, a?.name, a?.description, a?.category, a?.service, a?.tags?.join?.(' ')].join(' '))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(stoks, [inv?.title, inv?.name, inv?.summary, inv?.description, inv?.tags?.join?.(' ')].join(' '))
  );

  const srcCount = [
    matchedContacts.length > 0,
    matchedAlerts.length > 0,
    matchedInvestigations.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (srcCount === 3)      cls = 'COVERED';
  else if (srcCount === 2) cls = 'MONITORED';
  else if (srcCount === 1) cls = 'STAFFED';
  else                     cls = 'DARK';

  return { cls, matchedContacts, matchedAlerts, matchedInvestigations };
}

/* ─── exported query helpers ─── */
export function isScovopQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'scovop', 'scene coverage', 'scene contact', 'operational coverage',
    'dark scene', 'unmonitored scene', 'scene ops', 'situational coverage',
    'scene investigation', 'operational situational',
  ].some(k => s.includes(k));
}

export function buildScovopScript() {
  return (
    'Fetch all 10 cinematic scenes (/v1/cinematic/scene/1 through /v1/cinematic/scene/10), ' +
    '/entities/Contact, /v1/ops/alerts, and /v1/investigations. ' +
    'Keyword-match each scene (title/description/anchor labels) against ' +
    'contact names/orgs/roles, ops alert titles/descriptions, and investigation titles/summaries. ' +
    'Classify each scene as COVERED (matches contact + ops alert + investigation — ' +
    'fully monitored with a responsible contact, active alert coverage, and open investigation), ' +
    'MONITORED (matches 2 of 3 sources — partially covered with some situational coverage), ' +
    'STAFFED (matches 1 source only — minimal coverage with only one situational dimension), ' +
    'or DARK (no match to any source — operational blind spot with no contact owner, no alert, no investigation). ' +
    'Report the total DARK count, identify which dark scenes represent the highest ' +
    'operational risk (e.g. critical infrastructure scenes, high-activity environments, or scenes with recent anchors), ' +
    'and recommend which contacts should be assigned to them, ' +
    'which ops alerts should be configured to cover them, ' +
    'and which investigations should be opened to address the coverage gap.'
  );
}

/* ─── component ─── */
export default function SceneContactOpsInvestigationCoverage() {
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
      const scenePromises = SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: h }).then(r => r.ok ? r.json() : null)
      );
      const [scenesRaw, rContacts, rAlerts, rInvestigations] = await Promise.all([
        Promise.all(scenePromises),
        fetch(`${API}/entities/Contact`,      { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/ops/alerts`,         { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/investigations`,     { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const scenes        = scenesRaw.filter(Boolean).map((s, i) => ({ ...s, id: s?.id || SCENE_IDS[i] }));
      const contacts      = normalizeContacts(rContacts);
      const alerts        = normalizeAlerts(rAlerts);
      const investigations = normalizeInvestigations(rInvestigations);

      const classified = scenes.map(scene => ({
        scene,
        ...classify(scene, contacts, alerts, investigations),
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
    window.addEventListener('jarvis:scovop-toggle', handler);
    return () => window.removeEventListener('jarvis:scovop-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { COVERED: 0, MONITORED: 0, STAFFED: 0, DARK: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return sceneLabel(r.scene).toLowerCase().includes(s) ||
             (r.scene?.title || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildScovopScript();
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

  const darkPulse = counts.DARK > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 177160,
    zIndex: 327,
    background: darkPulse ? 'rgba(239,68,68,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${darkPulse ? '#EF4444' : 'rgba(100,116,139,0.5)'}`,
    color: darkPulse ? '#EF4444' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: darkPulse ? 'jarvis-pulse-red 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 700,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8,
    zIndex: 3270,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(239,68,68,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Scene × Contact × Ops Alert × Investigation Operational Situational Coverage">
        ◈ SCOVOP{counts.DARK > 0 ? ` [${counts.DARK}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
              ◈ SCENE × CONTACT × OPS ALERT × INVESTIGATION
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {[
              { label: 'SCENES',    val: rows.length,         color: '#94A3B8' },
              { label: 'COVERED',   val: counts.COVERED,      color: CLS_COLOR.COVERED },
              { label: 'MONITORED', val: counts.MONITORED,    color: CLS_COLOR.MONITORED },
              { label: 'STAFFED',   val: counts.STAFFED,      color: CLS_COLOR.STAFFED },
              { label: 'DARK',      val: counts.DARK,         color: CLS_COLOR.DARK },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 88, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(239,68,68,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(239,68,68,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #EF4444' : '2px solid transparent',
                color: tab === t ? '#EF4444' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 180 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No scenes match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { scene, cls, matchedContacts, matchedAlerts, matchedInvestigations } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 72, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sceneLabel(scene)}{scene?.title ? ` — ${scene.title}` : ''}
                    </span>
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* contacts */}
                      {matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>CONTACTS ({matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedContacts.slice(0, 6).map((c, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || c?.full_name || c?.id || '—'} · {c?.role || c?.org || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* ops alerts */}
                      {matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>OPS ALERTS ({matchedAlerts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedAlerts.slice(0, 6).map((a, i) => (
                              <span key={i} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {a?.title || a?.name || a?.id || '—'} · {a?.severity || a?.level || '?'}
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
                      {matchedContacts.length === 0 && matchedAlerts.length === 0 && matchedInvestigations.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — operational blind spot.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
                border: '1px solid #EF4444', color: '#EF4444',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS DARK SCENES'}
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
