import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCGCKN_RE = /\b(scgckn|scene[\s_-]*graph[\s_-]*community[\s_-]*knowledge|scene[\s_-]*community[\s_-]*knowledge|cinematic[\s_-]*community[\s_-]*knowledge|scene[\s_-]*knowledge[\s_-]*community|community[\s_-]*knowledge[\s_-]*scene|knowledge[\s_-]*community[\s_-]*scene|grounded[\s_-]*scene|dark[\s_-]*scene[\s_-]*community|scene[\s_-]*kb[\s_-]*community|cinematic[\s_-]*knowledge[\s_-]*community|scene[\s_-]*network[\s_-]*knowledge)\b/i;

const THRESHOLD = 0.07;

export function isScgcknQuery(t) { return SCGCKN_RE.test(t || ''); }

export async function buildScgcknScript() {
  try {
    const sceneIds = ['01_command_atrium','02_neural_nexus','03_threat_matrix','04_data_vault','05_operations_hub','06_intelligence_grid','07_scenario_engine','08_asset_tracker','09_contact_web','10_mission_control'];
    const [sceneResults, commRes, kbRes] = await Promise.all([
      Promise.all(sceneIds.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/knowledge/`).then(r => r.ok ? r.json() : []),
    ]);
    const scenes = sceneResults.filter(Boolean);
    const communities = Array.isArray(commRes) ? commRes : (commRes.items || commRes.data || []);
    const kb = Array.isArray(kbRes) ? kbRes : (kbRes.items || kbRes.data || []);
    let grounded = 0, commOnly = 0, kbOnly = 0, dark = 0;
    for (const sc of scenes) {
      const toks = tok(`${sc.title || ''} ${sc.description || ''} ${(sc.anchors || []).join(' ')} ${(sc.tags || []).join(' ')}`);
      const hasComm = communities.some(c => matchScore(toks, `${c.name || ''} ${c.description || ''} ${c.category || ''} ${(c.tags || []).join(' ')}`) >= THRESHOLD);
      const hasKb = kb.some(k => matchScore(toks, `${k.title || ''} ${k.category || ''} ${(k.tags || []).join(' ')} ${k.summary || ''}`) >= THRESHOLD);
      if (hasComm && hasKb) grounded++;
      else if (hasComm) commOnly++;
      else if (hasKb) kbOnly++;
      else dark++;
    }
    const total = scenes.length;
    const pct = total ? Math.round((grounded / total) * 100) : 0;
    return `SCGCKN Scene × Graph Community × Knowledge coverage: ${total} scenes, ${grounded} fully-grounded (${pct}%), ${commOnly} community-backed, ${kbOnly} KB-backed, ${dark} dark. ${dark > 0 ? `${dark} scene(s) have no graph community or knowledge base backing — intelligence blind spot.` : 'All scenes have community or knowledge backing.'} Graph communities: ${communities.length}. KB articles: ${kb.length}.`;
  } catch {
    return 'SCGCKN: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

const SCENE_IDS = ['01_command_atrium','02_neural_nexus','03_threat_matrix','04_data_vault','05_operations_hub','06_intelligence_grid','07_scenario_engine','08_asset_tracker','09_contact_web','10_mission_control'];

function normaliseScene(raw, id) {
  if (!raw) return null;
  return {
    id: id,
    name: raw.title || raw.name || id,
    description: raw.description || '',
    anchors: raw.anchors || [],
    tags: raw.tags || [],
    _raw: `${raw.title || ''} ${raw.name || ''} ${raw.description || ''} ${(raw.anchors || []).join(' ')} ${(raw.tags || []).join(' ')}`,
  };
}

function normaliseCommunity(raw) {
  return (Array.isArray(raw) ? raw : (raw.items || raw.data || [])).map(c => ({
    id: c.id || c._id || Math.random().toString(36).slice(2),
    name: c.name || '(community)',
    type: c.type || c.category || '',
    description: c.description || '',
    tags: c.tags || [],
    _raw: `${c.name || ''} ${c.description || ''} ${c.category || ''} ${c.type || ''} ${(c.tags || []).join(' ')}`,
  }));
}

function normaliseKb(raw) {
  return (Array.isArray(raw) ? raw : (raw.items || raw.data || [])).map(k => ({
    id: k.id || k._id || Math.random().toString(36).slice(2),
    name: k.title || k.name || '(article)',
    category: k.category || '',
    summary: k.summary || k.content || '',
    tags: k.tags || [],
    _raw: `${k.title || ''} ${k.name || ''} ${k.category || ''} ${k.summary || ''} ${(k.tags || []).join(' ')}`,
  }));
}

function classifyScene(scene, communities, kb) {
  const toks = tok(scene._raw);
  const matchedComms = communities.filter(c => matchScore(toks, c._raw) >= THRESHOLD)
    .map(c => ({ ...c, score: matchScore(toks, c._raw) }))
    .sort((a, b) => b.score - a.score);
  const matchedKb = kb.filter(k => matchScore(toks, k._raw) >= THRESHOLD)
    .map(k => ({ ...k, score: matchScore(toks, k._raw) }))
    .sort((a, b) => b.score - a.score);
  const hasComm = matchedComms.length > 0;
  const hasKb = matchedKb.length > 0;
  let state;
  if (hasComm && hasKb) state = 'FULLY_GROUNDED';
  else if (hasComm) state = 'COMMUNITY_BACKED';
  else if (hasKb) state = 'KB_BACKED';
  else state = 'DARK';
  return { ...scene, state, matchedComms, matchedKb };
}

const STATE_COLOR = {
  FULLY_GROUNDED: '#00e676',
  COMMUNITY_BACKED: '#10b981',
  KB_BACKED: '#6366f1',
  DARK: '#4a5568',
};
const STATE_LABEL = {
  FULLY_GROUNDED: 'FULLY GROUNDED',
  COMMUNITY_BACKED: 'COMMUNITY BACKED',
  KB_BACKED: 'KB BACKED',
  DARK: 'DARK',
};

const FILTERS = ['ALL', 'FULLY_GROUNDED', 'COMMUNITY_BACKED', 'KB_BACKED', 'DARK'];

export default function SceneGraphCommunityKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [brief, setBrief] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sceneResults, commRes, kbRes] = await Promise.all([
        Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/knowledge/`).then(r => r.ok ? r.json() : []),
      ]);
      const scenes = sceneResults.map((raw, i) => normaliseScene(raw, SCENE_IDS[i])).filter(Boolean);
      const communities = normaliseCommunity(commRes);
      const kb = normaliseKb(kbRes);
      setItems(scenes.map(sc => classifyScene(sc, communities, kb)));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:scgckn-toggle', toggle);
    return () => window.removeEventListener('jarvis:scgckn-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = useCallback(async (item) => {
    if (assessing === item.id) return;
    setAssessing(item.id);
    setBrief(b => ({ ...b, [item.id]: '' }));
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Cinematic scene "${item.name}" has coverage state: ${item.state}. Graph communities matched: ${item.matchedComms.map(c => c.name).join(', ') || 'none'}. KB articles matched: ${item.matchedKb.map(k => k.name).join(', ') || 'none'}. Provide a 2-sentence intelligence coverage brief for this scene's graph community and knowledge base backing.`,
        }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.answer || data.content || JSON.stringify(data);
      setBrief(b => ({ ...b, [item.id]: text }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief(b => ({ ...b, [item.id]: 'Assessment unavailable.' }));
    }
    setAssessing(null);
  }, [assessing]);

  if (!open) return null;

  const sq = tok(search);
  const visible = items.filter(it =>
    (filter === 'ALL' || it.state === filter) &&
    (!sq.length || matchScore(sq, it._raw) >= THRESHOLD)
  );

  const counts = { FULLY_GROUNDED: 0, COMMUNITY_BACKED: 0, KB_BACKED: 0, DARK: 0 };
  for (const it of items) counts[it.state] = (counts[it.state] || 0) + 1;
  const total = items.length;
  const groundedPct = total ? Math.round((counts.FULLY_GROUNDED / total) * 100) : 0;

  const barSegments = [
    { state: 'FULLY_GROUNDED', color: STATE_COLOR.FULLY_GROUNDED },
    { state: 'COMMUNITY_BACKED', color: STATE_COLOR.COMMUNITY_BACKED },
    { state: 'KB_BACKED', color: STATE_COLOR.KB_BACKED },
    { state: 'DARK', color: STATE_COLOR.DARK },
  ];

  return (
    <div style={{
      position: 'fixed', left: 870560, bottom: 8, zIndex: 563,
      background: 'rgba(0,10,20,0.97)', border: '1px solid rgba(0,230,118,0.25)',
      borderRadius: 10, width: 620, maxHeight: '88vh',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#c8d8e8', fontSize: 11, boxShadow: '0 0 32px rgba(0,230,118,0.10)',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(0,230,118,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#00e676', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ SCGCKN</span>
        <span style={{ flex: 1, color: '#7a9ab8', fontSize: 10 }}>Scene × Graph Community × Knowledge</span>
        {loading && <span style={{ color: '#f59e0b', fontSize: 9, letterSpacing: 1 }}>LOADING…</span>}
        <span
          onClick={() => setOpen(false)}
          style={{ cursor: 'pointer', color: '#4a6a8a', fontSize: 14, lineHeight: 1 }}
        >✕</span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px 6px', flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES', val: total, color: '#7a9ab8' },
          { label: 'FULLY GROUNDED', val: counts.FULLY_GROUNDED, color: STATE_COLOR.FULLY_GROUNDED },
          { label: 'COMMUNITY BACKED', val: counts.COMMUNITY_BACKED, color: STATE_COLOR.COMMUNITY_BACKED },
          { label: 'KB BACKED', val: counts.KB_BACKED, color: STATE_COLOR.KB_BACKED },
          { label: 'DARK', val: counts.DARK, color: STATE_COLOR.DARK },
          { label: 'GROUNDED %', val: `${groundedPct}%`, color: groundedPct >= 60 ? '#00e676' : groundedPct >= 30 ? '#f59e0b' : '#ef4444' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 8px', minWidth: 70 }}>
            <div style={{ color: '#4a6a8a', fontSize: 8, letterSpacing: 1 }}>{label}</div>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 6px', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', display: 'flex', overflow: 'hidden' }}>
        {total > 0 && barSegments.map(({ state, color }) => (
          <div key={state} style={{ width: `${(counts[state] / total) * 100}%`, background: color, transition: 'width 0.4s' }} />
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? STATE_COLOR[f] || 'rgba(0,230,118,0.25)' : 'rgba(255,255,255,0.05)',
              border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
              color: filter === f ? (f === 'DARK' ? '#c8d8e8' : '#000') : '#7a9ab8', fontSize: 9, fontFamily: 'inherit', letterSpacing: 1,
            }}
          >{f === 'ALL' ? 'ALL' : STATE_LABEL[f]}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,230,118,0.15)',
            borderRadius: 4, padding: '2px 8px', color: '#c8d8e8', fontSize: 10, fontFamily: 'inherit', outline: 'none',
          }}
        />
      </div>

      {/* Item list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#4a6a8a', fontSize: 10, padding: '12px 0', textAlign: 'center' }}>
            {loading ? 'Fetching coverage data…' : 'No scenes match.'}
          </div>
        )}
        {visible.map(it => (
          <div key={it.id} style={{ marginBottom: 5 }}>
            <div
              onClick={() => setExpanded(expanded === it.id ? null : it.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '5px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${STATE_COLOR[it.state]}22`,
              }}
            >
              <span style={{ color: STATE_COLOR[it.state], fontWeight: 700, fontSize: 9, letterSpacing: 1, minWidth: 110 }}>
                {STATE_LABEL[it.state]}
              </span>
              <span style={{ flex: 1, color: '#c8d8e8', fontSize: 11 }}>{it.name}</span>
              <span style={{ color: '#4a6a8a', fontSize: 9 }}>
                {it.matchedComms.length}C · {it.matchedKb.length}K
              </span>
              <span style={{ color: '#4a6a8a', fontSize: 10 }}>{expanded === it.id ? '▲' : '▼'}</span>
            </div>

            {expanded === it.id && (
              <div style={{ padding: '8px 8px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 6px 6px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  {/* Communities */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#10b981', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>COMMUNITIES ({it.matchedComms.length})</div>
                    {it.matchedComms.length === 0
                      ? <div style={{ color: '#4a6a8a', fontSize: 9 }}>No communities matched.</div>
                      : it.matchedComms.slice(0, 5).map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(c.score * 100)}%`, height: '100%', background: '#10b981' }} />
                          </div>
                          <span style={{ color: '#c8d8e8', fontSize: 9, minWidth: 130, textAlign: 'right' }}>{c.name}</span>
                          {c.type && (
                            <span style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontSize: 7, padding: '1px 4px', borderRadius: 2 }}>
                              {c.type}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  {/* KB Articles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#6366f1', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>KB ARTICLES ({it.matchedKb.length})</div>
                    {it.matchedKb.length === 0
                      ? <div style={{ color: '#4a6a8a', fontSize: 9 }}>No KB articles matched.</div>
                      : it.matchedKb.slice(0, 5).map(k => (
                        <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(k.score * 100)}%`, height: '100%', background: '#6366f1' }} />
                          </div>
                          <span style={{ color: '#c8d8e8', fontSize: 9, minWidth: 130, textAlign: 'right' }}>{k.name}</span>
                          {k.category && (
                            <span style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: 7, padding: '1px 4px', borderRadius: 2 }}>
                              {k.category}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* ASSESS */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => assess(it)}
                    disabled={assessing === it.id}
                    style={{
                      background: assessing === it.id ? 'rgba(0,230,118,0.1)' : 'rgba(0,230,118,0.18)',
                      border: '1px solid rgba(0,230,118,0.35)', borderRadius: 4, padding: '3px 10px',
                      color: '#00e676', fontSize: 9, fontFamily: 'inherit', cursor: assessing === it.id ? 'wait' : 'pointer', letterSpacing: 1,
                    }}
                  >{assessing === it.id ? '⟳ ASSESSING…' : '▶ ASSESS'}</button>
                  {brief[it.id] && (
                    <span style={{ color: '#a0b8c8', fontSize: 9, flex: 1 }}>{brief[it.id]}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 14px', borderTop: '1px solid rgba(0,230,118,0.10)', color: '#2a4a6a', fontSize: 8, letterSpacing: 1 }}>
        /v1/cinematic/scene/{'{id}'} × /v1/graph/communities × /knowledge/ · 120s auto-refresh
      </div>
    </div>
  );
}
