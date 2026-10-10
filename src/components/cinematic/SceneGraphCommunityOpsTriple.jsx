import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY = 'dev-key';

const SCENE_IDS = [
  '01_command_atrium',
  '02_intelligence_nexus',
  '03_threat_theatre',
  '04_mission_forge',
  '05_signals_bridge',
  '06_synthetic_oracle',
  '07_sovereign_archive',
  '08_field_operations',
  '09_crisis_calculus',
  '10_sentinel_watch',
];

const SCGOETRI_RE = /\b(scgoetri|scene[._-]?community[._-]?ops|community[._-]?ops[._-]?scene|scene[._-]?ops[._-]?community|scene[._-]?graph[._-]?comm[._-]?ops|comm[._-]?ops[._-]?scene|scene[._-]?community[._-]?event|cinematic[._-]?community[._-]?ops)\b/i;

export function isScgoetriQuery(t) {
  return SCGOETRI_RE.test(t || '');
}

export async function buildScgoetriScript() {
  const [scenesR, commR, opsR] = await Promise.allSettled([
    Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const rawScenes = scenesR.status === 'fulfilled'
    ? scenesR.value.filter(r => r.status === 'fulfilled').map(r => r.value)
    : [];
  const scenes = normaliseScenes(rawScenes);
  const communities = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
  const events = normaliseEvents(opsR.status === 'fulfilled' ? opsR.value : []);
  const enriched = correlate(scenes, communities, events);
  const fullyOp = enriched.filter(s => s._hasComm && s._hasOps).length;
  const commBacked = enriched.filter(s => s._hasComm && !s._hasOps).length;
  const opsDriven = enriched.filter(s => !s._hasComm && s._hasOps).length;
  const quiet = enriched.filter(s => !s._hasComm && !s._hasOps).length;
  const pct = scenes.length ? Math.round((fullyOp / scenes.length) * 100) : 0;
  return (
    `SCGOETRI: ${scenes.length} cinematic scenes correlated against ${communities.length} graph communities and ${events.length} ops events. ` +
    `${fullyOp} (${pct}%) are FULLY OPERATIONAL — community-backed and ops-monitored. ` +
    `${quiet} are QUIET with no community or ops coverage. ` +
    `Top quiet scenes: ${enriched.filter(s => !s._hasComm && !s._hasOps).slice(0, 3).map(s => s.title).join(', ') || 'none'}.`
  );
}

function normaliseScenes(rawArr) {
  return rawArr.map((raw, i) => {
    const id = raw?.id || raw?.scene_id || SCENE_IDS[i] || `scene-${i}`;
    return {
      id,
      title:       raw?.title || raw?.name || id.replace(/_/g, ' ').replace(/^\d+\s*/, '').toUpperCase(),
      description: String(raw?.description || raw?.summary || raw?.briefing || '').slice(0, 300),
      category:    raw?.category || raw?.theme || raw?.type || '',
      tags:        Array.isArray(raw?.tags) ? raw.tags.join(' ') : (raw?.tags || ''),
    };
  });
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'groups', 'clusters', 'results', 'data', 'items'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:          c.id || String(i),
    label:       c.label || c.name || c.community_id || `Community ${i + 1}`,
    type:        c.type || c.kind || '',
    size:        c.size || c.member_count || 0,
    description: String(c.description || c.summary || '').slice(0, 200),
    tags:        Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseEvents(raw) {
  if (!raw) return [];
  const arr = ['events', 'ops_events', 'results', 'data', 'items'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:          e.id || String(i),
    name:        e.name || e.title || e.event_type || e.type || `Event ${i + 1}`,
    type:        e.type || e.event_type || e.kind || '',
    severity:    e.severity || e.level || '',
    service:     e.service || e.source || '',
    description: String(e.description || e.message || e.summary || '').slice(0, 200),
    tags:        Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(primaryToks, item, itemKeys) {
  const its = tokens(itemKeys.map(k => {
    const v = item[k];
    return Array.isArray(v) ? v.join(' ') : String(v || '');
  }).join(' '));
  if (!primaryToks.length || !its.length) return 0;
  const inter = primaryToks.filter(t => its.includes(t)).length;
  const union = new Set([...primaryToks, ...its]).size;
  return union ? inter / union : 0;
}

function correlate(scenes, communities, events) {
  return scenes.map(s => {
    const st = tokens(`${s.title} ${s.description} ${s.tags}`);
    const commMatches = communities
      .map(c => ({ ...c, _score: matchScore(st, c, ['label', 'type', 'description', 'tags']) }))
      .filter(c => c._score >= 0.08)
      .sort((x, y) => y._score - x._score)
      .slice(0, 5);
    const opsMatches = events
      .map(e => ({ ...e, _score: matchScore(st, e, ['name', 'type', 'service', 'description', 'tags']) }))
      .filter(e => e._score >= 0.08)
      .sort((x, y) => y._score - x._score)
      .slice(0, 5);
    const _hasComm = commMatches.length > 0;
    const _hasOps  = opsMatches.length > 0;
    const _state   = _hasComm && _hasOps ? 'FULLY OPERATIONAL'
                   : _hasComm            ? 'COMMUNITY-BACKED'
                   : _hasOps             ? 'OPS-DRIVEN'
                   :                      'QUIET';
    return { ...s, _commMatches: commMatches, _opsMatches: opsMatches, _hasComm, _hasOps, _state };
  });
}

const CY  = '#06B6D4';
const VIO = '#7C3AED';
const GR  = '#10B981';
const SL  = '#64748B';
const PANEL_W = 800;
const PANEL_H = '80vh';
const TABS = ['ALL', 'FULLY OPERATIONAL', 'COMMUNITY-BACKED', 'OPS-DRIVEN', 'QUIET'];

function ScoreBar({ score }) {
  return (
    <div style={{ display: 'inline-block', width: 56, height: 4, background: '#1e2a35', borderRadius: 2, verticalAlign: 'middle', marginLeft: 4, flexShrink: 0 }}>
      <div style={{ width: `${Math.min(100, Math.round(score * 100))}%`, height: '100%', background: CY, borderRadius: 2 }} />
    </div>
  );
}

function stateColor(s) {
  if (s === 'FULLY OPERATIONAL') return CY;
  if (s === 'COMMUNITY-BACKED')  return VIO;
  if (s === 'OPS-DRIVEN')        return GR;
  return SL;
}

export default function SceneGraphCommunityOpsTriple() {
  const [open, setOpen]           = useState(false);
  const [scenes, setScenes]       = useState([]);
  const [commCount, setCommCount] = useState(0);
  const [opsCount, setOpsCount]   = useState(0);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState('');
  const [assessedId, setAssessedId] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scenesR, commR, opsR] = await Promise.allSettled([
        Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      const rawScenes = scenesR.status === 'fulfilled'
        ? scenesR.value.filter(r => r.status === 'fulfilled').map(r => r.value)
        : [];
      const sc   = normaliseScenes(rawScenes);
      const comm = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
      const evts = normaliseEvents(opsR.status === 'fulfilled' ? opsR.value : []);
      setCommCount(comm.length);
      setOpsCount(evts.length);
      setScenes(correlate(sc, comm, evts));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:scgoetri-toggle', toggle);
    return () => window.removeEventListener('jarvis:scgoetri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(row) {
    setAssessing(true);
    setAssessedId(row.id);
    setBrief('');
    const summary = `Cinematic scene: "${row.title}". State: ${row._state}. ` +
      `Community matches: ${row._commMatches.map(c => c.label).join(', ') || 'none'}. ` +
      `Ops event matches: ${row._opsMatches.map(e => e.name).join(', ') || 'none'}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `SCGOETRI brief — 2 sentences on operational relevance: ${summary}` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.reply || d?.message || d?.content || '';
      setBrief(txt);
      if (txt) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (_) { setBrief('Assessment unavailable.'); }
    setAssessing(false);
  }

  const fullyOp    = scenes.filter(s => s._state === 'FULLY OPERATIONAL').length;
  const commBacked = scenes.filter(s => s._state === 'COMMUNITY-BACKED').length;
  const opsDriven  = scenes.filter(s => s._state === 'OPS-DRIVEN').length;
  const quiet      = scenes.filter(s => s._state === 'QUIET').length;

  const visible = scenes.filter(s => {
    if (tab !== 'ALL' && s._state !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Scene × Graph Community × Ops Event Triple Coverage (SCGOETRI)"
        style={{
          position: 'fixed', left: 755200, bottom: 8, zIndex: 377,
          width: 72, height: 22, borderRadius: 3,
          border: `1px solid ${CY}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: CY,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${CY}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ SCGOETRI
        {fullyOp > 0 && (
          <span style={{
            background: CY, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{fullyOp}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9378,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ SCENE × GRAPH COMMUNITY × OPS EVENT
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={load}
                style={{ padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`, background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1 }}
              >↻</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'SCENES',            val: scenes.length, col: '#DCEBF5' },
              { label: 'COMMUNITIES',        val: commCount,     col: VIO },
              { label: 'OPS EVENTS',         val: opsCount,      col: GR },
              { label: 'FULLY OPERATIONAL',  val: fullyOp,       col: CY },
              { label: 'COMMUNITY-BACKED',   val: commBacked,    col: VIO },
              { label: 'OPS-DRIVEN',         val: opsDriven,     col: GR },
              { label: 'QUIET',              val: quiet,         col: SL },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '5px 6px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage breakdown bar */}
          {scenes.length > 0 && (
            <div style={{ display: 'flex', gap: 2, padding: '0 14px 6px', flexShrink: 0 }}>
              {[
                { label: 'FULLY OPERATIONAL', val: fullyOp,    col: CY },
                { label: 'COMMUNITY-BACKED',  val: commBacked, col: VIO },
                { label: 'OPS-DRIVEN',        val: opsDriven,  col: GR },
                { label: 'QUIET',             val: quiet,      col: '#1e2a35' },
              ].filter(s => s.val > 0).map(({ label, val, col }) => (
                <div key={label} title={`${label}: ${val}`}
                  style={{ flex: val, height: 5, background: col, borderRadius: 2 }} />
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{
            display: 'flex', gap: 5, padding: '5px 14px', flexShrink: 0,
            borderBottom: `1px solid ${CY}22`, alignItems: 'center', flexWrap: 'wrap',
          }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '2px 8px', borderRadius: 3,
                border: `1px solid ${tab === t ? CY : '#334155'}`,
                background: tab === t ? `${CY}22` : 'transparent',
                color: tab === t ? CY : '#64748b',
                fontSize: 8, cursor: 'pointer', letterSpacing: 0.8,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{
                marginLeft: 'auto', background: '#0f172a', border: `1px solid ${CY}33`,
                color: '#c8d4e3', borderRadius: 3, padding: '2px 7px', fontSize: 9, width: 150, outline: 'none',
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {!loading && visible.length === 0 && (
              <div style={{ color: '#334155', fontSize: 10, padding: '24px', textAlign: 'center', letterSpacing: 1 }}>
                No scenes match.
              </div>
            )}
            {visible.map(row => {
              const id = row.id;
              const isEx = expanded === id;
              return (
                <div key={id} style={{ borderBottom: '1px solid #1a2230' }}>
                  {/* Row header */}
                  <div
                    onClick={() => setExpanded(isEx ? null : id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{
                      fontSize: 8, color: stateColor(row._state),
                      border: `1px solid ${stateColor(row._state)}44`,
                      borderRadius: 2, padding: '1px 5px', minWidth: 120, textAlign: 'center', letterSpacing: 0.6, flexShrink: 0,
                    }}>{row._state}</span>
                    <span style={{ flex: 1, fontSize: 10, color: '#c8d4e3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
                    {row.category && (
                      <span style={{ fontSize: 8, color: '#64748b', border: '1px solid #334155', borderRadius: 2, padding: '0 4px', flexShrink: 0 }}>{row.category}</span>
                    )}
                    <span style={{ fontSize: 8, color: VIO, marginLeft: 4 }}>{row._commMatches.length > 0 ? `⬡${row._commMatches.length}` : ''}</span>
                    <span style={{ fontSize: 8, color: GR }}>{row._opsMatches.length > 0 ? `⚡${row._opsMatches.length}` : ''}</span>
                    <span style={{ color: '#334155', fontSize: 10, marginLeft: 4 }}>{isEx ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded pane */}
                  {isEx && (
                    <div style={{ padding: '6px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.description && (
                        <div style={{ color: '#64748b', fontSize: 8, fontStyle: 'italic' }}>{row.description.slice(0, 180)}</div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {/* Community matches */}
                        <div>
                          <div style={{ color: VIO, fontSize: 8, letterSpacing: 1.5, marginBottom: 5 }}>⬡ GRAPH COMMUNITIES ({row._commMatches.length})</div>
                          {row._commMatches.length === 0 && <div style={{ color: '#334155', fontSize: 9 }}>No community matches.</div>}
                          {row._commMatches.map((c, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                              <span style={{ fontSize: 7, color: VIO, border: '1px solid #7C3AED44', borderRadius: 2, padding: '0 4px', flexShrink: 0 }}>{c.type || 'comm'}</span>
                              <span style={{ fontSize: 9, color: '#c8d4e3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                              <ScoreBar score={c._score} />
                            </div>
                          ))}
                        </div>
                        {/* Ops event matches */}
                        <div>
                          <div style={{ color: GR, fontSize: 8, letterSpacing: 1.5, marginBottom: 5 }}>⚡ OPS EVENTS ({row._opsMatches.length})</div>
                          {row._opsMatches.length === 0 && <div style={{ color: '#334155', fontSize: 9 }}>No ops event matches.</div>}
                          {row._opsMatches.map((e, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                              <span style={{ fontSize: 7, color: GR, border: '1px solid #10B98144', borderRadius: 2, padding: '0 4px', flexShrink: 0 }}>{e.severity || e.type || 'event'}</span>
                              <span style={{ fontSize: 9, color: '#c8d4e3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                              <ScoreBar score={e._score} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => assess(row)}
                          disabled={assessing}
                          style={{
                            padding: '2px 10px', borderRadius: 3, border: `1px solid ${CY}55`,
                            background: `${CY}11`, color: CY, cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 9, letterSpacing: 1,
                          }}
                        >{assessing ? '◌ ASSESSING…' : '▶ ASSESS'}</button>
                        {brief && assessedId === id && !assessing && (
                          <div style={{ color: '#94a3b8', fontSize: 9, fontStyle: 'italic', lineHeight: 1.5, flex: 1 }}>{brief}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
