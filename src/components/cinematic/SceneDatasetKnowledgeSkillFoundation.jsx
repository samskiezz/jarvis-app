/**
 * SceneDatasetKnowledgeSkillFoundation — F116
 *
 * Fetches all 10 /v1/cinematic/scene/{1..10} + /v1/datasets + /knowledge/ + /v1/aip/skill.
 *
 * Keyword-matches each scene (title/description/theme/type/anchor labels) against
 * dataset names/descriptions, knowledge article titles/categories, and skill names/descriptions
 * to classify:
 *
 *   OPERATIONAL — scene matches dataset AND knowledge AND skill
 *                 (fully grounded: data-backed, documented, and skill-supported)
 *   EQUIPPED    — scene matches 2 of the 3 sources
 *                 (partially supported — missing one operational pillar)
 *   AWARE       — scene matches only 1 of the 3 sources
 *                 (thin foundation — scene exists but isn't operationally anchored)
 *   DARK        — no match to any source
 *                 (ungrounded scene — operational blind spot)
 *
 * Toggle: ◈ SDKOPM button (fixed, bottom strip) left:113320, zIndex:213
 * Stat tiles: scenes / datasets / knowledge / skills / operational / equipped / aware / dark
 * Amber pulse on DARK count (ungrounded scenes).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched knowledge articles with category badge +
 *                  matched skills with score badge.
 * Filter tabs: ALL / OPERATIONAL / EQUIPPED / AWARE / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sdkopm"/"scene foundation"/"scene operational"/"scene intelligence foundation"
 *        "scene skills"/"scene dataset knowledge"/"scene knowledge skill"/"operational scene"
 *        "dark scene"/"scene grounding"/"scene coverage"/"scene equipped"/"ungrounded scene"
 *        "scene data skill"/"scene operational foundation"/"scene intelligence base"
 * Event: jarvis:sdkopm-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TABS = ['ALL', 'OPERATIONAL', 'EQUIPPED', 'AWARE', 'DARK'];

const CLS_COLOR = {
  OPERATIONAL: '#22C55E',
  EQUIPPED:    '#3B82F6',
  AWARE:       '#F97316',
  DARK:        '#F59E0B',
};

export function isSdkopmQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sdkopm', 'scene foundation', 'scene operational', 'scene intelligence foundation',
    'scene skills', 'scene dataset knowledge', 'scene knowledge skill', 'operational scene',
    'dark scene', 'scene grounding', 'scene coverage', 'scene equipped', 'ungrounded scene',
    'scene data skill', 'scene operational foundation', 'scene intelligence base',
  ].some(kw => s.includes(kw));
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

function sceneLabel(scene) {
  return scene.title || scene.name || scene.label || scene.theme || `Scene ${scene.id}`;
}

function sceneTokens(scene) {
  const anchorText = (scene.anchors || [])
    .map(a => `${a.label || ''} ${a.type || ''} ${a.description || ''}`)
    .join(' ');
  return tokens(
    `${scene.title || ''} ${scene.name || ''} ${scene.label || ''} ${scene.theme || ''} ${scene.type || ''} ${scene.description || ''} ${anchorText}`
  );
}

function classifyScene(scene, datasets, knowledgeItems, skills) {
  const toks = sceneTokens(scene);
  const mDatasets  = datasets.filter(d => overlaps(toks, `${d.name || ''} ${d.description || ''} ${d.category || ''} ${d.type || ''}`));
  const mKnowledge = knowledgeItems.filter(k => overlaps(toks, `${k.title || ''} ${k.name || ''} ${k.category || ''} ${k.summary || ''} ${k.type || ''}`));
  const mSkills    = skills.filter(sk => overlaps(toks, `${sk.name || ''} ${sk.description || ''} ${sk.category || ''} ${sk.domain || ''}`));

  const matchCount = (mDatasets.length > 0 ? 1 : 0) + (mKnowledge.length > 0 ? 1 : 0) + (mSkills.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'OPERATIONAL';
  else if (matchCount === 2) cls = 'EQUIPPED';
  else if (matchCount === 1) cls = 'AWARE';
  else cls = 'DARK';

  return { scene, cls, mDatasets, mKnowledge, mSkills };
}

export default function SceneDatasetKnowledgeSkillFoundation() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [scenesRaw, datasetsRaw, knowledgeRaw, skillsRaw] = await Promise.all([
        Promise.all(SCENE_IDS.map(id => fetcher(`/v1/cinematic/scene/${id}`).catch(() => null))),
        fetcher('/v1/datasets'),
        fetcher('/knowledge/'),
        fetcher('/v1/aip/skill'),
      ]);

      const scenes      = scenesRaw.filter(Boolean).map((s, i) => ({ ...s, id: s.id ?? SCENE_IDS[i] }));
      const datasets    = normalizeArray(datasetsRaw,  ['datasets', 'data', 'items', 'results']);
      const knowledge   = normalizeArray(knowledgeRaw, ['articles', 'knowledge', 'items', 'data', 'results']);
      const skills      = normalizeArray(skillsRaw,    ['skills', 'data', 'items', 'results']);

      setRows(scenes.map(sc => classifyScene(sc, datasets, knowledge, skills)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sdkopm-toggle', handler);
    return () => window.removeEventListener('jarvis:sdkopm-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    OPERATIONAL: rows.filter(r => r.cls === 'OPERATIONAL').length,
    EQUIPPED:    rows.filter(r => r.cls === 'EQUIPPED').length,
    AWARE:       rows.filter(r => r.cls === 'AWARE').length,
    DARK:        rows.filter(r => r.cls === 'DARK').length,
  };

  const dsCount  = rows.reduce((n, r) => n + r.mDatasets.length,  0);
  const kwCount  = rows.reduce((n, r) => n + r.mKnowledge.length, 0);
  const skCount  = rows.reduce((n, r) => n + r.mSkills.length,    0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return sceneLabel(r.scene).toLowerCase().includes(s) ||
             (r.scene.description || r.scene.theme || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Scenes: ${rows.length}. Operational: ${counts.OPERATIONAL}. Equipped: ${counts.EQUIPPED}. Aware: ${counts.AWARE}. Dark: ${counts.DARK}.`;
    const prompt = `JARVIS scene operational foundation audit: ${summary}. Identify the most critical dark scenes — those with zero dataset backing, no knowledge grounding, and no skill support. Provide a 2-sentence advisory on the deepest operational blind spots and priority actions to ground the unanchored scenes.`;
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
          position: 'fixed', bottom: 8, left: 113320, zIndex: 213,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ SDKOPM</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 213, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ SDKOPM</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Scene × Dataset × Knowledge × Skill — Operational Intelligence Foundation</span>
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
          { label: 'SCENES',      val: rows.length,          color: '#94a3b8' },
          { label: 'DATASETS',    val: dsCount,              color: '#7dd3fc' },
          { label: 'KNOWLEDGE',   val: kwCount,              color: '#86efac' },
          { label: 'SKILLS',      val: skCount,              color: '#c4b5fd' },
          { label: 'OPERATIONAL', val: counts.OPERATIONAL,   color: CLS_COLOR.OPERATIONAL },
          { label: 'EQUIPPED',    val: counts.EQUIPPED,      color: CLS_COLOR.EQUIPPED },
          { label: 'AWARE',       val: counts.AWARE,         color: CLS_COLOR.AWARE },
          { label: 'DARK',        val: counts.DARK,          color: CLS_COLOR.DARK, pulse: counts.DARK > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'sdkopm-pulse 2s ease-in-out infinite' : 'none',
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
                  {sceneLabel(r.scene)}
                </span>
                {(r.scene.theme || r.scene.type) && (
                  <span style={{ background: '#071428', border: '1px solid #075985', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.scene.theme || r.scene.type}
                  </span>
                )}
                <span style={{ background: '#071420', border: '1px solid #0e4d6b', color: '#67e8f9', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                  scene {r.scene.id}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(r.scene.description || r.scene.summary) && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.scene.description || r.scene.summary}</div>
                  )}
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#7dd3fc', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#071420', border: '1px solid #0e4d6b', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.id}
                            {d.row_count != null && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{d.row_count.toLocaleString()} rows]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mKnowledge.length > 0 && (
                    <div>
                      <div style={{ color: '#86efac', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE ({r.mKnowledge.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mKnowledge.slice(0, 8).map((k, idx) => (
                          <span key={idx} style={{ background: '#071a10', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {k.title || k.name || k.id}
                            {k.category && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{k.category}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSkills.length > 0 && (
                    <div>
                      <div style={{ color: '#c4b5fd', fontSize: 10, marginBottom: 3 }}>SKILLS ({r.mSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSkills.slice(0, 8).map((sk, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sk.name || sk.id}
                            {sk.score != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{typeof sk.score === 'number' ? sk.score.toFixed(2) : sk.score}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length === 0 && r.mKnowledge.length === 0 && r.mSkills.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No dataset, knowledge, or skill match — ungrounded operational scene.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes sdkopm-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
