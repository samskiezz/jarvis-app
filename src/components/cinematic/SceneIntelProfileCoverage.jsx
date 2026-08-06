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

const SCINTEL_RE = /\b(scene[._-]?intel[._-]?profile|intel[._-]?profile[._-]?scene|scintel|scene[._-]?threat[._-]?actor|scene[._-]?adversar|infiltrated[._-]?scenes?|scene[._-]?threat|scene[._-]?adversar|scene[._-]?intel[._-]?profile[._-]?coverage|which[._-]?scenes?[._-]?have[._-]?threat[._-]?actors?|scene[._-]?actor[._-]?coverage|scene[._-]?intel[._-]?coverage)\b/i;

export function isScIntelQuery(t) {
  return SCINTEL_RE.test(t || '');
}

export async function buildScIntelScript() {
  const sceneResults = await Promise.allSettled(
    SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
  );
  const scenes = sceneResults.map((r, i) => ({
    id: SCENE_IDS[i],
    ...(r.status === 'fulfilled' ? r.value : {}),
  }));
  const iR = await fetch(`${API}/entities/IntelProfile`).then(r => r.json()).catch(() => []);
  const profiles = normaliseArray(iR, 'profiles');
  const enriched = correlate(scenes, profiles);
  const infiltrated = enriched.filter(s => s._matches.length > 0).length;
  const clean = enriched.length - infiltrated;
  const topInfiltrated = enriched
    .filter(s => s._matches.length > 0)
    .slice(0, 3)
    .map(s => s.title || s.name || sceneLabel(s.id) || '?')
    .join(', ') || 'none';
  return (
    `Scene × Intel Profile Coverage: ${scenes.length} cinematic scenes, ${profiles.length} tracked intel profiles. ` +
    `${infiltrated} scene${infiltrated !== 1 ? 's' : ''} show threat actor domain alignment (INFILTRATED); ` +
    `${clean} scene${clean !== 1 ? 's' : ''} have no intel profile overlap (CLEAN). ` +
    `Infiltrated scenes: ${topInfiltrated}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = ['profiles', 'intel_profiles', 'items', 'results', 'data', 'records', 'entities'];
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
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
    ...tokens(scene.id),
    ...tokens(anchorText),
  ].filter(Boolean));
}

function profileTokens(profile) {
  return [
    ...tokens(profile.name),
    ...tokens(profile.title),
    ...tokens(profile.subject),
    ...tokens(profile.description),
    ...tokens(profile.category),
    ...tokens(profile.nationality),
    ...(profile.aliases || []).flatMap(a => tokens(a)),
    ...(Array.isArray(profile.tags) ? profile.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean);
}

function matchScore(scene, profile) {
  const sceneToks = anchorTokens(scene);
  const profToks = profileTokens(profile);
  if (!sceneToks.size || !profToks.length) return 0;
  let hits = 0;
  for (const t of profToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, profToks.length);
}

function correlate(scenes, profiles) {
  return scenes.map(scene => {
    const scored = profiles
      .map(profile => ({ profile, score: matchScore(scene, profile) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...scene, _matches: scored, _infiltrated: scored.length > 0 };
  });
}

function sceneLabel(id) {
  return String(id || '').replace(/^\d+_/, '').replace(/_/g, ' ').toUpperCase();
}

function categoryColor(cat) {
  const c = String(cat || '').toLowerCase();
  if (c.includes('state') || c.includes('nation')) return '#ef4444';
  if (c.includes('crimin') || c.includes('gang')) return '#f97316';
  if (c.includes('terror') || c.includes('extremi')) return '#dc2626';
  if (c.includes('hacktiv') || c.includes('cyber')) return '#8b5cf6';
  if (c.includes('fraud') || c.includes('financi')) return '#f59e0b';
  return '#64748b';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function SceneIntelProfileCoverage() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [profiles, setProfiles] = useState([]);
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
      const [sceneResults, iR] = await Promise.allSettled([
        Promise.allSettled(
          SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
        ),
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
      ]);
      const rawScenes = sceneResults.status === 'fulfilled'
        ? sceneResults.value.map((r, i) => ({
            id: SCENE_IDS[i],
            ...(r.status === 'fulfilled' ? r.value : {}),
          }))
        : SCENE_IDS.map(id => ({ id }));
      const rawProfiles = normaliseArray(
        iR.status === 'fulfilled' ? iR.value : []
      );
      setScenes(rawScenes);
      setProfiles(rawProfiles);
      setEnriched(correlate(rawScenes, rawProfiles));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:scintel-toggle', h);
    return () => window.removeEventListener('jarvis:scintel-toggle', h);
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
    const infiltrated = enriched.filter(s => s._infiltrated).length;
    const clean = enriched.filter(s => !s._infiltrated).length;
    const topInf = enriched
      .filter(s => s._infiltrated)
      .map(s => s.title || sceneLabel(s.id))
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Scene × Intel Profile Coverage: ${scenes.length} cinematic operational scenes, ${profiles.length} tracked threat actor intel profiles. ` +
      `${infiltrated} scenes have domain alignment with at least one intel profile (INFILTRATED); ` +
      `${clean} scenes have no threat actor profile overlap (CLEAN). ` +
      `Infiltrated scenes: ${topInf}. ` +
      `Give a 2-sentence scene threat-actor coverage brief.`;
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

  const infiltratedCount = enriched.filter(s => s._infiltrated).length;
  const badge = infiltratedCount > 0 ? '#ef4444' : '#22c55e';

  const visible = enriched.filter(scene => {
    const label = (scene.title || sceneLabel(scene.id)).toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'INFILTRATED') return scene._infiltrated;
    if (tab === 'CLEAN') return !scene._infiltrated;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Intel Profile Coverage"
        style={{
          position: 'fixed',
          left: 697520,
          bottom: 8,
          zIndex: 274,
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
          boxShadow: infiltratedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        SCINTEL
        {infiltratedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {infiltratedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9650,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#ef4444' }}>◈ SCENE × INTEL PROFILE COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, color: '#ef4444', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES', val: scenes.length, color: '#60a5fa' },
              { label: 'PROFILES', val: profiles.length, color: '#f97316' },
              { label: 'INFILTRATED', val: infiltratedCount, color: infiltratedCount > 0 ? '#ef4444' : '#64748b' },
              { label: 'CLEAN', val: enriched.filter(s => !s._infiltrated).length, color: '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'INFILTRATED', 'CLEAN'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#ef4444' : '#94a3b8',
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
                      background: scene._infiltrated ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                      color: scene._infiltrated ? '#ef4444' : '#22c55e',
                      border: `1px solid ${scene._infiltrated ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                    }}>
                      {scene._infiltrated ? 'INFILTRATED' : 'CLEAN'}
                    </span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {scene._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{scene._matches.length} profile{scene._matches.length !== 1 ? 's' : ''}</span>
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
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched intel profiles:</div>
                          {scene._matches.map(({ profile, score }, j) => {
                            const profileLabel = profile.name || profile.title || profile.subject || `profile-${j}`;
                            const cat = profile.category || profile.type || '';
                            const nat = profile.nationality || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#fca5a5', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profileLabel}</span>
                                  {cat && (
                                    <span style={{ ...PILL, background: `${categoryColor(cat)}22`, color: categoryColor(cat), border: `1px solid ${categoryColor(cat)}44` }}>
                                      {cat}
                                    </span>
                                  )}
                                  {nat && (
                                    <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                                      {nat}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#ef4444', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#22c55e', fontSize: 11 }}>✓ No threat actor intel profile aligns with this scene's domain.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} scenes · {profiles.length} intel profiles indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
