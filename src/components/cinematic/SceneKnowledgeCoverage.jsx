import { useState, useEffect, useCallback } from 'react';

const API = '';
const SCENE_IDS = [
  '01_command_atrium',
  '02_neural_bridge',
  '03_threat_matrix',
  '04_quantum_core',
  '05_data_vault',
  '06_field_ops',
  '07_comms_hub',
  '08_analytics_grid',
  '09_strategic_ops',
  '10_deep_intel',
];

const SCKB_RE = /\b(scene[._-]?knowledge|knowledge[._-]?scene[s]?|sckb|backed[._-]?scene[s]?|dark[._-]?scene[s]?|scene[._-]?kb|scene[._-]?knowledge[._-]?coverage|scene[._-]?knowledge[._-]?gap|which[._-]?scenes?[._-]?have[._-]?knowledge|scene[._-]?intel[._-]?base|knowledge[._-]?backed[._-]?scene[s]?|uncharted[._-]?scene[s]?|scene[._-]?data[._-]?gap)\b/i;

export function isScKbQuery(t) {
  return SCKB_RE.test(t || '');
}

export async function buildScKbScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [sceneResults, kbR] = await Promise.allSettled([
    Promise.allSettled(
      SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr }).then(r => r.json())
      )
    ),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);
  const scenes = sceneResults.status === 'fulfilled'
    ? sceneResults.value.map((r, i) => ({
        id: SCENE_IDS[i],
        ...(r.status === 'fulfilled' ? r.value : {}),
      }))
    : SCENE_IDS.map(id => ({ id }));
  const articles = normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []);
  const enriched = correlate(scenes, articles);
  const backed = enriched.filter(s => s._backed).length;
  const dark = enriched.length - backed;
  const topDark = enriched
    .filter(s => !s._backed)
    .slice(0, 4)
    .map(s => s.title || sceneLabel(s.id) || '?')
    .join(', ') || 'none';
  return (
    `Scene × Knowledge Coverage: ${scenes.length} cinematic scenes cross-matched against ${articles.length} knowledge base articles. ` +
    `${backed} scenes are BACKED (KB article coverage found); ${dark} scenes are DARK (no knowledge base backing — intelligence gap). ` +
    `Top dark scenes: ${topDark}.`
  );
}

function normaliseArticles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['articles', 'knowledge', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function anchorTokens(scene) {
  const anchors = scene.anchors || scene.anchor_points || scene.data || [];
  const anchorText = Array.isArray(anchors)
    ? anchors.map(a => `${a.label || a.name || ''} ${a.description || a.value || ''}`).join(' ')
    : '';
  return new Set([
    ...tokens(scene.title),
    ...tokens(scene.name),
    ...tokens(scene.description),
    ...tokens(String(scene.id || '').replace(/_/g, ' ')),
    ...tokens(anchorText),
  ].filter(Boolean));
}

function matchScore(scene, article) {
  const sceneToks = anchorTokens(scene);
  const artToks = [
    ...tokens(article.title),
    ...tokens(article.name),
    ...tokens(article.summary),
    ...tokens(article.description),
    ...tokens(article.content),
    ...tokens(article.category),
    ...tokens(article.type),
    ...(Array.isArray(article.tags) ? article.tags.flatMap(tokens) : tokens(article.tags)),
  ].filter(Boolean);
  if (!sceneToks.size || !artToks.length) return 0;
  let hits = 0;
  for (const t of artToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, artToks.length);
}

function correlate(scenes, articles) {
  return scenes.map(scene => {
    const scored = articles
      .map(art => ({ art, score: matchScore(scene, art) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...scene, _matches: scored, _backed: scored.length > 0 };
  });
}

function sceneLabel(id) {
  return String(id || '').replace(/^\d+_/, '').replace(/_/g, ' ').toUpperCase();
}

const AM = '#f59e0b';
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function SceneKnowledgeCoverage() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [articles, setArticles] = useState([]);
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
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [sceneResults, kbR] = await Promise.allSettled([
        Promise.allSettled(
          SCENE_IDS.map(id =>
            fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr }).then(r => r.json())
          )
        ),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawScenes = sceneResults.status === 'fulfilled'
        ? sceneResults.value.map((r, i) => ({
            id: SCENE_IDS[i],
            ...(r.status === 'fulfilled' ? r.value : {}),
          }))
        : SCENE_IDS.map(id => ({ id }));
      const rawArticles = normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []);
      setScenes(rawScenes);
      setArticles(rawArticles);
      setEnriched(correlate(rawScenes, rawArticles));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:sckb-toggle', h);
    return () => window.removeEventListener('jarvis:sckb-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const backed = enriched.filter(s => s._backed).length;
    const dark = enriched.filter(s => !s._backed).length;
    const prompt =
      `Scene × Knowledge Coverage: ${scenes.length} cinematic operational scenes cross-matched against ${articles.length} knowledge base articles. ` +
      `${backed} scenes have knowledge base backing (BACKED); ${dark} scenes have no KB coverage (DARK — intelligence gap). ` +
      `Dark scenes: ${enriched.filter(s => !s._backed).map(s => s.title || sceneLabel(s.id)).slice(0, 5).join(', ') || 'none'}. ` +
      `Give a 2-sentence scene knowledge coverage brief: which operational domains are well-documented, and where are the critical knowledge gaps.`;
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

  const darkCount = enriched.filter(s => !s._backed).length;
  const badge = darkCount > 0 ? AM : '#22c55e';

  const visible = enriched.filter(scene => {
    const label = (scene.title || sceneLabel(scene.id)).toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'BACKED') return scene._backed;
    if (tab === 'DARK') return !scene._backed;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Knowledge Coverage"
        style={{
          position: 'fixed',
          left: 685760,
          bottom: 8,
          zIndex: 253,
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
          boxShadow: darkCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        SCKB
        {darkCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {darkCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9700,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: AM }}>◈ SCENE × KNOWLEDGE COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: AM, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES', val: scenes.length, color: '#60a5fa' },
              { label: 'KB ARTICLES', val: articles.length, color: '#a78bfa' },
              { label: 'BACKED', val: enriched.filter(s => s._backed).length, color: '#22c55e' },
              { label: 'DARK', val: darkCount, color: darkCount > 0 ? AM : '#64748b' },
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
            {['ALL', 'BACKED', 'DARK'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? AM : '#94a3b8',
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
              placeholder="Search scenes…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No scenes match the current filter.</div>
          )}

          <div>
            {visible.map((scene, i) => {
              const id = scene.id || i;
              const label = scene.title || sceneLabel(scene.id) || `Scene ${i + 1}`;
              const sub = scene.subtitle || scene.description || '';
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
                      background: scene._backed ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: scene._backed ? '#22c55e' : AM,
                      border: `1px solid ${scene._backed ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {scene._backed ? 'BACKED' : 'DARK'}
                    </span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {scene._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{scene._matches.length} article{scene._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {sub && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(sub).slice(0, 200)}</div>
                      )}
                      {scene._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched KB articles:</div>
                          {scene._matches.map(({ art, score }, j) => {
                            const artTitle = art.title || art.name || `article-${j}`;
                            const artCat = art.category || art.type || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#c4b5fd', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artTitle}</span>
                                  {artCat && (
                                    <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                                      {artCat}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: AM, fontSize: 11 }}>⚠ No knowledge base articles cover this scene's domain.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} scenes · {articles.length} KB articles indexed · auto-refresh 120s
          </div>
        </div>
      )}
    </>
  );
}
