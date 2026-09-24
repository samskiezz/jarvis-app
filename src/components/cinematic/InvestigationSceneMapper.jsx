import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API = '';

const SCENE_IDS = [
  '01_command_atrium',
  '02_ai_core_chamber',
  '03_world_control_room',
  '04_intelligence_graph_space',
  '05_operations_war_room',
  '06_data_fusion_reactor',
  '07_document_intelligence_vault',
  '08_simulation_theatre',
  '09_analytics_observatory',
  '10_system_security_core',
];

const SCENE_LABELS = {
  '01_command_atrium': 'Command Atrium',
  '02_ai_core_chamber': 'AI Core Chamber',
  '03_world_control_room': 'World Control Room',
  '04_intelligence_graph_space': 'Intelligence Graph',
  '05_operations_war_room': 'Operations War Room',
  '06_data_fusion_reactor': 'Data Fusion Reactor',
  '07_document_intelligence_vault': 'Document Vault',
  '08_simulation_theatre': 'Simulation Theatre',
  '09_analytics_observatory': 'Analytics Observatory',
  '10_system_security_core': 'System Security Core',
};

const INVSCNMAP_RE = /\b(investigation[._-]?scene|scene[._-]?investigation|invscnmap|which[._-]?scene[._-]?for[._-]?investigation|investigation[._-]?map|scene[._-]?case[._-]?map|case[._-]?scene|map[._-]?investigations?[._-]?to[._-]?scene)\b/i;

export function isInvscnmapQuery(t) {
  return INVSCNMAP_RE.test(t || '');
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [hint, 'investigations', 'cases', 'items', 'results', 'data', 'records'].filter(Boolean);
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function sceneTextTokens(sceneData) {
  const parts = [
    sceneData?.id || '',
    sceneData?.title || '',
    sceneData?.description || '',
    sceneData?.theme || '',
    sceneData?.domain || '',
  ];
  if (Array.isArray(sceneData?.anchors)) {
    sceneData.anchors.forEach(a => {
      parts.push(a.label || '', a.value || '', a.unit || '', a.description || '');
    });
  }
  return new Set(parts.flatMap(tokens).filter(Boolean));
}

function invTokens(inv) {
  return [
    ...tokens(inv.title),
    ...tokens(inv.name),
    ...tokens(inv.description),
    ...tokens(inv.summary),
    ...tokens(inv.type),
    ...tokens(inv.category),
    ...tokens(inv.status),
    ...(Array.isArray(inv.tags) ? inv.tags.flatMap(t => tokens(t)) : []),
    ...(Array.isArray(inv.entities) ? inv.entities.flatMap(e => tokens(typeof e === 'string' ? e : e?.name || '')) : []),
  ].filter(Boolean);
}

function matchScore(inv, sceneToks) {
  const invToks = invTokens(inv);
  if (!invToks.length || !sceneToks.size) return 0;
  let hits = 0;
  for (const t of invToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(invToks.length, sceneToks.size);
}

async function fetchAllScenes() {
  const results = await Promise.allSettled(
    SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
  );
  return results.map((r, i) => ({
    id: SCENE_IDS[i],
    data: r.status === 'fulfilled' ? r.value : null,
    tokens: r.status === 'fulfilled' ? sceneTextTokens(r.value) : new Set(),
  }));
}

function correlate(investigations, scenes) {
  return investigations.map(inv => {
    const scored = scenes
      .map(s => ({ scene: s, score: matchScore(inv, s.tokens) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return { ...inv, _matches: scored, _aligned: scored.length > 0 };
  });
}

export async function buildInvscnmapScript() {
  const [invR, scenes] = await Promise.all([
    fetch(`${API}/v1/investigations`).then(r => r.json()).catch(() => []),
    fetchAllScenes(),
  ]);
  const investigations = normaliseArray(invR, 'investigations');
  const enriched = correlate(investigations, scenes);
  const aligned = enriched.filter(i => i._aligned).length;
  const unlocated = enriched.length - aligned;
  const topUnlocated = enriched
    .filter(i => !i._aligned)
    .slice(0, 3)
    .map(i => i.title || i.name || '?')
    .join(', ') || 'none';
  return (
    `Investigation × Scene Mapper: ${investigations.length} open investigations mapped against all 10 JARVIS cinematic scenes. ` +
    `${aligned} investigation${aligned !== 1 ? 's' : ''} have a matching scene (SCENE-ALIGNED); ` +
    `${unlocated} investigation${unlocated !== 1 ? 's' : ''} have no scene alignment (UNLOCATED — no operational theatre found). ` +
    `Unlocated cases: ${topUnlocated}.`
  );
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'open' || s === 'active') return '#22c55e';
  if (s === 'investigating') return '#3b82f6';
  if (s === 'closed' || s === 'resolved') return '#64748b';
  return '#94a3b8';
}

export default function InvestigationSceneMapper() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [invR, sceneData] = await Promise.all([
        fetch(`${API}/v1/investigations`).then(r => r.json()).catch(() => []),
        fetchAllScenes(),
      ]);
      const rawInv = normaliseArray(invR, 'investigations');
      setInvestigations(rawInv);
      setScenes(sceneData);
      setEnriched(correlate(rawInv, sceneData));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:invscnmap-toggle', h);
    return () => window.removeEventListener('jarvis:invscnmap-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const aligned = enriched.filter(i => i._aligned).length;
    const unlocated = enriched.filter(i => !i._aligned).length;
    const topUnlocated = enriched
      .filter(i => !i._aligned)
      .map(i => i.title || i.name || '?')
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Investigation × Scene Mapper: ${investigations.length} open investigations, ${scenes.length} JARVIS cinematic scenes. ` +
      `${aligned} investigations are SCENE-ALIGNED (mapped to an operational theatre); ` +
      `${unlocated} are UNLOCATED (no scene alignment — operational context gap). ` +
      `Unlocated investigations: ${topUnlocated}. ` +
      `Give a 2-sentence investigation-scene coverage brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const unlocatedCount = enriched.filter(i => !i._aligned).length;
  const badge = unlocatedCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(inv => {
    const label = (inv.title || inv.name || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'SCENE-ALIGNED') return inv._aligned;
    if (tab === 'UNLOCATED') return !inv._aligned;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Investigation × Scene Mapper"
        style={{
          position: 'fixed',
          left: 705360,
          bottom: 8,
          zIndex: 288,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: unlocatedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        INVSCNMAP
        {unlocatedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unlocatedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 640,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9675,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ INVESTIGATION × SCENE MAPPER</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'INVESTIGATIONS', val: investigations.length, color: '#f59e0b' },
              { label: 'SCENES', val: scenes.length, color: '#38bdf8' },
              { label: 'SCENE-ALIGNED', val: enriched.filter(i => i._aligned).length, color: '#22c55e' },
              { label: 'UNLOCATED', val: unlocatedCount, color: unlocatedCount > 0 ? '#f59e0b' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'SCENE-ALIGNED', 'UNLOCATED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f59e0b' : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search investigations…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No investigations match the current filter.</div>
          )}

          <div>
            {visible.map((inv, idx) => {
              const id = inv.id || inv._id || idx;
              const label = inv.title || inv.name || `Case ${idx + 1}`;
              const status = inv.status || '';
              const type = inv.type || inv.category || '';
              const desc = inv.description || inv.summary || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: inv._aligned ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: inv._aligned ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${inv._aligned ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {inv._aligned ? 'SCENE-ALIGNED' : 'UNLOCATED'}
                    </span>
                    {status && (
                      <span style={{ ...PILL, background: `${statusColor(status)}22`, color: statusColor(status), border: `1px solid ${statusColor(status)}44` }}>
                        {String(status).toUpperCase()}
                      </span>
                    )}
                    {type && (
                      <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                        {String(type).toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {inv._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{inv._matches.length} scene{inv._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {desc && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(desc).slice(0, 220)}</div>
                      )}
                      {inv._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matching scenes (click to navigate):</div>
                          {inv._matches.map(({ scene, score }, j) => {
                            const sceneLabel = SCENE_LABELS[scene.id] || scene.id;
                            return (
                              <div key={j} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); navigate(`/cinematic/${scene.id}`); setOpen(false); }}
                                    style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 5, color: '#38bdf8', padding: '2px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}
                                  >
                                    ◈ {sceneLabel}
                                  </button>
                                  <span style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}>{scene.id}</span>
                                  <span style={{ color: '#888', fontSize: 10, marginLeft: 'auto' }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No JARVIS scene maps to this investigation — operational theatre unknown.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} investigations · {scenes.length} scenes indexed · click scene button to navigate · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
