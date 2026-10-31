/**
 * SceneTaskContactRiskMonitoring — F233
 *
 * Fetches all 10 /v1/cinematic/scene/{1..10} +
 *         /entities/Task + /entities/Contact + /entities/RiskSignal
 *
 * Keyword-matches each scene (title/description/anchors) against
 * active tasks, assigned contacts, and risk signals to classify:
 *
 *   SECURED  — matched all 3 sources (task + contact + risk signal)
 *              (fully monitored scene: active tasks, staffed, and threat-aware)
 *   ACTIVE   — matched 2 of 3 sources
 *              (partially covered scene with operational presence)
 *   PARTIAL  — matched 1 source only
 *              (minimal scene grounding — operational blind risk)
 *   DARK     — no match to any source
 *              (unmonitored scene: no tasks, no staff, no threat signal)
 *
 * Toggle: ◈ SCTRMON button (fixed, bottom strip) left:178280, zIndex:329
 * Stat tiles: scenes / tasks / contacts / signals / secured / active / partial / dark
 * Amber pulse on DARK count (unmonitored scenes).
 * Expandable rows: matched tasks with status badge +
 *                  matched contacts with role/org +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / SECURED / ACTIVE / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sctrmon"/"scene monitor"/"scene coverage"/"scene task risk"/
 *        "scene operational"/"dark scenes"/"unmonitored scenes"
 * Event: jarvis:sctrmon-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SECURED', 'ACTIVE', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  SECURED: '#00E5A0',
  ACTIVE:  '#38BDF8',
  PARTIAL: '#A78BFA',
  DARK:    '#F59E0B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeList(raw, altKey) {
  if (Array.isArray(raw))              return raw;
  if (altKey && Array.isArray(raw?.[altKey])) return raw[altKey];
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function sceneLabel(scene) {
  return scene?.title || scene?.name || scene?.id || `Scene ${scene?.scene_id || '?'}`;
}

function sceneText(scene) {
  const anchors = (scene?.anchors || []).map(a => [a?.label, a?.value, a?.description].join(' ')).join(' ');
  return [scene?.title, scene?.name, scene?.description, scene?.theme, scene?.tags?.join?.(' '), anchors].join(' ');
}

function classify(scene, tasks, contacts, signals) {
  const stoks = tokens(sceneText(scene));

  const matchedTasks = tasks.filter(t =>
    overlaps(stoks, [t?.title, t?.name, t?.description, t?.type, t?.tags?.join?.(' ')].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(stoks, [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.tags?.join?.(' ')].join(' '))
  );
  const matchedSignals = signals.filter(s =>
    overlaps(stoks, [s?.title, s?.name, s?.description, s?.source, s?.type, s?.tags?.join?.(' ')].join(' '))
  );

  const srcCount = [
    matchedTasks.length > 0,
    matchedContacts.length > 0,
    matchedSignals.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (srcCount === 3)      cls = 'SECURED';
  else if (srcCount === 2) cls = 'ACTIVE';
  else if (srcCount === 1) cls = 'PARTIAL';
  else                     cls = 'DARK';

  return { cls, matchedTasks, matchedContacts, matchedSignals };
}

/* ─── exported query helpers ─── */
export function isSctrmonQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sctrmon', 'scene monitor', 'scene coverage', 'scene task risk',
    'scene operational', 'dark scenes', 'unmonitored scenes',
  ].some(k => s.includes(k));
}

export function buildSctrmonScript() {
  return (
    'Fetch all 10 cinematic scenes (/v1/cinematic/scene/1 through /v1/cinematic/scene/10), ' +
    '/entities/Task, /entities/Contact, and /entities/RiskSignal. ' +
    'Keyword-match each scene (title/description/anchors) against ' +
    'task titles/descriptions, contact names/roles/organisations, ' +
    'and risk signal titles/descriptions/sources. ' +
    'Classify each scene as SECURED (matched task + contact + risk signal — ' +
    'fully monitored: active tasks, staffed, and threat-aware), ' +
    'ACTIVE (matched 2 of 3 sources — partially covered with operational presence), ' +
    'PARTIAL (matched 1 source only — minimal grounding), ' +
    'or DARK (no match to any source — unmonitored scene with no task, no staff, no threat signal). ' +
    'Report the total DARK count, identify which unmonitored scenes represent the highest ' +
    'operational risk, and recommend which tasks should be assigned, ' +
    'which contacts should be staffed, and which risk signals should be linked.'
  );
}

/* ─── component ─── */
export default function SceneTaskContactRiskMonitoring() {
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

      const sceneIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const [scenesRaw, rTasks, rContacts, rSignals] = await Promise.all([
        Promise.all(
          sceneIds.map(id =>
            fetch(`${API}/v1/cinematic/scene/${id}`, { headers: h })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          )
        ),
        fetch(`${API}/entities/Task`,       { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,    { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const scenes   = scenesRaw.filter(Boolean);
      const tasks    = normalizeList(rTasks,    'tasks');
      const contacts = normalizeList(rContacts, 'contacts');
      const signals  = normalizeList(rSignals,  'signals');

      const classified = scenes.map(scene => ({
        scene,
        ...classify(scene, tasks, contacts, signals),
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
    window.addEventListener('jarvis:sctrmon-toggle', handler);
    return () => window.removeEventListener('jarvis:sctrmon-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { SECURED: 0, ACTIVE: 0, PARTIAL: 0, DARK: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return sceneLabel(r.scene).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildSctrmonScript();
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
    left: 178280,
    zIndex: 329,
    background: darkPulse ? 'rgba(245,158,11,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${darkPulse ? '#F59E0B' : 'rgba(100,116,139,0.5)'}`,
    color: darkPulse ? '#F59E0B' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: darkPulse ? 'jarvis-pulse-amber 1.6s infinite' : 'none',
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
    zIndex: 3290,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(245,158,11,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Scene × Task × Contact × RiskSignal Operational Monitoring Coverage">
        ◈ SCTRMON{counts.DARK > 0 ? ` [${counts.DARK}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: 12 }}>
              ◈ SCENE × TASK × CONTACT × RISK SIGNAL
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
              { label: 'SCENES',   val: rows.length,       color: '#94A3B8' },
              { label: 'SECURED',  val: counts.SECURED,    color: CLS_COLOR.SECURED },
              { label: 'ACTIVE',   val: counts.ACTIVE,     color: CLS_COLOR.ACTIVE },
              { label: 'PARTIAL',  val: counts.PARTIAL,    color: CLS_COLOR.PARTIAL },
              { label: 'DARK',     val: counts.DARK,       color: CLS_COLOR.DARK },
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
              const { scene, cls, matchedTasks, matchedContacts, matchedSignals } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 70, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sceneLabel(scene)}</span>
                    {scene?.scene_id != null && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>
                        #{scene.scene_id}
                      </span>
                    )}
                    {scene?.theme && (
                      <span style={{ color: '#475569', fontSize: 9, background: 'rgba(255,255,255,0.03)', padding: '1px 5px', borderRadius: 2 }}>{scene.theme}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* tasks */}
                      {matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>TASKS ({matchedTasks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedTasks.slice(0, 6).map((t, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {t?.title || t?.name || t?.id || '—'} · {t?.status || '?'}
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
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || c?.full_name || c?.id || '—'} · {c?.role || '?'}{c?.organisation || c?.org ? ` · ${c.organisation || c.org}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* risk signals */}
                      {matchedSignals.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>RISK SIGNALS ({matchedSignals.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedSignals.slice(0, 6).map((s, i) => (
                              <span key={i} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {s?.title || s?.name || s?.id || '—'} · {s?.severity || s?.level || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedTasks.length === 0 && matchedContacts.length === 0 && matchedSignals.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — unmonitored operational scene.</div>
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
