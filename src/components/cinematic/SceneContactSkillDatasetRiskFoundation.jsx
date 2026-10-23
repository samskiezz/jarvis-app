/**
 * SceneContactSkillDatasetRiskFoundation — F132
 *
 * 5-source operational coverage foundation.
 * Fetches all 10 /v1/cinematic/scene/{1..10} + /entities/Contact
 *         + /v1/aip/skill + /v1/datasets + /entities/RiskSignal
 *
 * Keyword-matches each cinematic scene against contacts, skills,
 * datasets, and risk signals to classify operational coverage:
 *
 *   COVERED  — matches all 4 other sources
 *              (fully grounded scene: owner, capability, data, threat awareness)
 *   STAFFED  — matches 3 other sources
 *              (operationally staffed with partial coverage)
 *   CAPABLE  — matches 1–2 other sources
 *              (some backing but coverage gaps remain)
 *   DARK     — no match to any source
 *              (ungrounded scene — no contact owner, no skill, no dataset, no risk signal)
 *
 * Toggle: ◈ SCSDRS button (fixed, bottom strip) left:122280, zIndex:229
 * Stat tiles: scenes / contacts / skills / datasets / signals /
 *             covered / staffed / capable / dark
 * Amber pulse on DARK count (ungrounded operational scenes).
 * Expandable rows: matched contacts with role/org +
 *                  matched skills with score badge +
 *                  matched datasets with row-count badge +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / COVERED / STAFFED / CAPABLE / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scsdrs"/"scene coverage"/"scene foundation"/"scene operational coverage"
 *        "scene contact skill"/"scene dataset risk"/"dark scenes"/"ungrounded scenes"
 *        "scene grounding"/"scene capability"/"scene staffing"/"scene coverage audit"
 *        "operational scene coverage"/"scene readiness foundation"
 * Event: jarvis:scsdrs-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'STAFFED', 'CAPABLE', 'DARK'];

const CLS_COLOR = {
  COVERED:  '#22C55E',
  STAFFED:  '#3B82F6',
  CAPABLE:  '#F59E0B',
  DARK:     '#F59E0B',
};

export function isScsdrsQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'scsdrs', 'scene coverage', 'scene foundation', 'scene operational coverage',
    'scene contact skill', 'scene dataset risk', 'dark scenes', 'ungrounded scenes',
    'scene grounding', 'scene capability', 'scene staffing', 'scene coverage audit',
    'operational scene coverage', 'scene readiness foundation', 'scene operational readiness',
    'scene five source', 'scene 5 source', 'scene full coverage', 'scene coverage nexus',
    'scene contact dataset', 'scene skill dataset', 'scene risk coverage',
    'scene owner coverage', 'ungrounded scene', 'scene blind spot',
  ].some(kw => s.includes(kw));
}

export function buildScsdrsScript(q) {
  return `JARVIS scene operational coverage foundation audit triggered by: "${q}". Fetch all 10 cinematic scenes + /entities/Contact + /v1/aip/skill + /v1/datasets + /entities/RiskSignal. Classify each scene as COVERED/STAFFED/CAPABLE/DARK. Report the DARK count and top 3 ungrounded scenes with no contact owner, no skill backing, no dataset, and no risk signal.`;
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

function sceneLabel(sc) {
  return sc.title || sc.name || sc.label || sc.scene_name || `Scene ${sc.id || '?'}`;
}

function sceneTokens(sc) {
  return tokens(
    `${sc.title || ''} ${sc.name || ''} ${sc.label || ''} ${sc.description || ''} ${sc.content?.slice(0, 200) || ''} ${sc.category || ''} ${sc.type || ''} ${sc.tags ? (Array.isArray(sc.tags) ? sc.tags.join(' ') : sc.tags) : ''} ${sc.anchors ? JSON.stringify(sc.anchors).slice(0, 200) : ''}`
  );
}

function classifyScene(sc, contacts, skills, datasets, signals) {
  const toks = sceneTokens(sc);

  const mContacts = contacts.filter(c =>
    overlaps(toks, `${c.name || ''} ${c.title || ''} ${c.role || ''} ${c.org || ''} ${c.organization || ''} ${c.description || ''} ${c.email || ''} ${c.department || ''}`)
  );
  const mSkills = skills.filter(sk =>
    overlaps(toks, `${sk.name || ''} ${sk.title || ''} ${sk.description || ''} ${sk.category || ''} ${sk.type || ''} ${sk.tags ? (Array.isArray(sk.tags) ? sk.tags.join(' ') : sk.tags) : ''}`)
  );
  const mDatasets = datasets.filter(d =>
    overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''} ${d.category || ''} ${d.type || ''} ${d.tags ? (Array.isArray(d.tags) ? d.tags.join(' ') : d.tags) : ''}`)
  );
  const mSignals = signals.filter(sig =>
    overlaps(toks, `${sig.title || ''} ${sig.name || ''} ${sig.description || ''} ${sig.type || ''} ${sig.category || ''} ${sig.source || ''} ${sig.entity || ''}`)
  );

  const sourceCount = [mContacts.length > 0, mSkills.length > 0, mDatasets.length > 0, mSignals.length > 0].filter(Boolean).length;

  let cls;
  if (sourceCount >= 4)       cls = 'COVERED';
  else if (sourceCount >= 3)  cls = 'STAFFED';
  else if (sourceCount >= 1)  cls = 'CAPABLE';
  else                        cls = 'DARK';

  return { sc, cls, mContacts, mSkills, mDatasets, mSignals };
}

export default function SceneContactSkillDatasetRiskFoundation() {
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

  const contactCount = rows.reduce((n, r) => n + r.mContacts.length, 0);
  const skillCount   = rows.reduce((n, r) => n + r.mSkills.length,   0);
  const datasetCount = rows.reduce((n, r) => n + r.mDatasets.length, 0);
  const signalCount  = rows.reduce((n, r) => n + r.mSignals.length,  0);

  const counts = {
    COVERED:  rows.filter(r => r.cls === 'COVERED').length,
    STAFFED:  rows.filter(r => r.cls === 'STAFFED').length,
    CAPABLE:  rows.filter(r => r.cls === 'CAPABLE').length,
    DARK:     rows.filter(r => r.cls === 'DARK').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sceneIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const [scenesRaw, contactRaw, skillRaw, datasetRaw, signalRaw] = await Promise.all([
        Promise.all(sceneIds.map(id => fetcher(`/v1/cinematic/scene/${id}`).catch(() => null))),
        fetcher('/entities/Contact'),
        fetcher('/v1/aip/skill'),
        fetcher('/v1/datasets'),
        fetcher('/entities/RiskSignal'),
      ]);

      const scenes   = scenesRaw.filter(Boolean).map((s, idx) => Array.isArray(s) ? s[0] : (s.scene || s.data || s)).filter(Boolean).map((s, idx) => ({ id: sceneIds[idx], ...s }));
      const contacts = normalizeArray(contactRaw,  ['contacts', 'data', 'items', 'results']);
      const skills   = normalizeArray(skillRaw,    ['skills', 'data', 'items', 'results']);
      const datasets = normalizeArray(datasetRaw,  ['datasets', 'data', 'items', 'results']);
      const signals  = normalizeArray(signalRaw,   ['signals', 'risk_signals', 'data', 'items', 'results']);

      setRows(scenes.map(sc => classifyScene(sc, contacts, skills, datasets, signals)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:scsdrs-toggle', handler);
    return () => window.removeEventListener('jarvis:scsdrs-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return sceneLabel(r.sc).toLowerCase().includes(s) ||
             (r.sc.category || r.sc.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Scenes: ${rows.length}. Covered: ${counts.COVERED}. Staffed: ${counts.STAFFED}. Capable: ${counts.CAPABLE}. Dark: ${counts.DARK}.`;
    const prompt = `JARVIS scene operational coverage foundation audit: ${summary}. Identify the most critical DARK scenes — those with no contact owner, no matching skill, no dataset backing, and no risk-signal awareness — representing ungrounded operational blind spots. Provide a 2-sentence advisory on the top dark scenes and priority actions to bring them into full coverage across contacts, skills, datasets, and risk signals.`;
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
          position: 'fixed', bottom: 8, left: 122280, zIndex: 229,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ SCSDRS</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 229, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ SCSDRS</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Scene × Contact × Skill × Dataset × RiskSignal — Operational Coverage Foundation (5-source)</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #F59E0B55', color: '#F59E0B', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES',   val: rows.length,          color: '#94a3b8' },
          { label: 'CONTACTS', val: contactCount,         color: '#3B82F6' },
          { label: 'SKILLS',   val: skillCount,           color: '#22D3EE' },
          { label: 'DATASETS', val: datasetCount,         color: '#34D399' },
          { label: 'SIGNALS',  val: signalCount,          color: '#EF4444' },
          { label: 'COVERED',  val: counts.COVERED,       color: CLS_COLOR.COVERED },
          { label: 'STAFFED',  val: counts.STAFFED,       color: CLS_COLOR.STAFFED },
          { label: 'CAPABLE',  val: counts.CAPABLE,       color: CLS_COLOR.CAPABLE },
          { label: 'DARK',     val: counts.DARK,          color: '#F59E0B', pulse: counts.DARK > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'scsdrs-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B44', borderRadius: 5, fontSize: 11, color: '#fde68a', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#F59E0B22' : 'none',
            border: `1px solid ${tab === t ? '#F59E0B' : '#1e293b'}`,
            color: tab === t ? '#F59E0B' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          const dotColor = r.cls === 'DARK' ? '#F59E0B' : CLS_COLOR[r.cls];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${dotColor}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sceneLabel(r.sc)}
                </span>
                {r.sc.category && (
                  <span style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.sc.category}
                  </span>
                )}
                {r.sc.type && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.sc.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: dotColor, letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${dotColor}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#3B82F6', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#010a1a', border: '1px solid #1e3a5f', color: '#3B82F6', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.title || c.id}
                            {(c.role || c.org || c.organization) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{c.role || c.org || c.organization}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSkills.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>SKILLS ({r.mSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSkills.slice(0, 8).map((sk, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sk.name || sk.title || sk.id}
                            {(sk.score !== undefined || sk.level !== undefined || sk.rating !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(sk.score ?? sk.level ?? sk.rating ?? '').toString().slice(0, 5)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#34D399', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#001008', border: '1px solid #064e3b', color: '#34D399', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {(d.row_count !== undefined || d.rows !== undefined || d.count !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(d.row_count ?? d.rows ?? d.count ?? '').toString()}r]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSignals.length > 0 && (
                    <div>
                      <div style={{ color: '#EF4444', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mSignals.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSignals.slice(0, 8).map((sig, k) => (
                          <span key={k} style={{ background: '#1a0000', border: '1px solid #7f1d1d', color: '#EF4444', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sig.title || sig.name || sig.id}
                            {(sig.severity || sig.level || sig.priority) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{sig.severity || sig.level || sig.priority}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length === 0 && r.mSkills.length === 0 && r.mDatasets.length === 0 && r.mSignals.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No contact owner, no skill backing, no dataset, no risk signal — ungrounded scene with zero operational foundation.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes scsdrs-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
