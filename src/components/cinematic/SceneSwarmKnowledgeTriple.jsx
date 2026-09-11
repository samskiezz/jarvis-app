import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';

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

const SCSWTRI_RE = /\b(scswtri|scene[._\s-]?swarm[._\s-]?knowledge|scene[._\s-]?swarm[._\s-]?kb|scene[._\s-]?knowledge[._\s-]?swarm|scene[._\s-]?automation[._\s-]?knowledge|cinematic[._\s-]?swarm[._\s-]?knowledge|scene[._\s-]?swarm[._\s-]?intel[._\s-]?base)\b/i;
const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(aToks, fieldText) {
  if (!aToks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = aToks.filter(t => fSet.has(t)).length;
  return hits / aToks.length;
}

function normaliseScenes(rawArr) {
  return rawArr.map((raw, i) => {
    const id = raw?.id || raw?.scene_id || SCENE_IDS[i] || `scene-${i}`;
    const title = raw?.title || raw?.name || id.replace(/_/g, ' ').replace(/^\d+\s*/, '').toUpperCase();
    const anchors = [];
    if (raw?.anchors && typeof raw.anchors === 'object') {
      Object.values(raw.anchors).forEach(v => {
        if (typeof v === 'string') anchors.push(v);
        else if (v && typeof v === 'object') anchors.push(Object.values(v).filter(x => typeof x === 'string').join(' '));
      });
    }
    const description = raw?.description || raw?.summary || raw?.briefing || '';
    const tags = Array.isArray(raw?.tags) ? raw.tags.join(' ') : (raw?.tags || '');
    return {
      id, title,
      description: String(description).slice(0, 300),
      tags,
      _searchText: [title, description, tags, anchors.join(' ')].filter(Boolean).join(' '),
    };
  });
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.jobs || raw.swarm_jobs || raw.items || raw.data || []);
  return arr.map((j, i) => ({
    id: j.id || j.job_id || `swj-${i}`,
    name: j.name || j.title || j.label || `Job ${i + 1}`,
    kind: j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    description: j.description || j.objective || j.summary || '',
    domain: j.domain || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
    _searchText: [j.name, j.title, j.kind, j.type, j.description, j.objective, j.domain, j.tags].filter(Boolean).join(' '),
  }));
}

function normaliseKnowledge(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.articles || raw.items || raw.data || raw.knowledge || []);
  return arr.map((a, i) => ({
    id: a.id || a.article_id || `kb-${i}`,
    title: a.title || a.name || a.label || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
    content: a.content || a.body || a.summary || a.description || '',
    _searchText: [a.title, a.name, a.category, a.type, a.tags, a.content, a.summary, a.description].filter(Boolean).join(' '),
  }));
}

function correlate(scenes, swarmJobs, kbArticles) {
  return scenes.map(sc => {
    const aToks = tok(sc._searchText);
    const matchedSwarm = swarmJobs
      .map(j => ({ ...j, score: matchScore(aToks, j._searchText) }))
      .filter(j => j.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedKb = kbArticles
      .map(a => ({ ...a, score: matchScore(aToks, a._searchText) }))
      .filter(a => a.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasSwarm = matchedSwarm.length > 0;
    const hasKb = matchedKb.length > 0;
    let coverage;
    if (hasSwarm && hasKb) coverage = 'FULLY_GROUNDED';
    else if (hasSwarm) coverage = 'SWARM_BACKED';
    else if (hasKb) coverage = 'KB_BACKED';
    else coverage = 'DARK';
    return { ...sc, matchedSwarm, matchedKb, coverage };
  });
}

export function isScswtriQuery(t) {
  return SCSWTRI_RE.test(t || '');
}

export async function buildScswtriScript() {
  try {
    const [scenesR, swarmR, kbR] = await Promise.allSettled([
      Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
    ]);
    const rawScenes = scenesR.status === 'fulfilled'
      ? scenesR.value.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
      : [];
    const scenes = normaliseScenes(rawScenes);
    const swarmJobs = normaliseSwarmJobs(swarmR.status === 'fulfilled' ? swarmR.value : null);
    const kbArticles = normaliseKnowledge(kbR.status === 'fulfilled' ? kbR.value : null);
    const enriched = correlate(scenes, swarmJobs, kbArticles);
    const grounded = enriched.filter(s => s.coverage === 'FULLY_GROUNDED').length;
    const dark = enriched.filter(s => s.coverage === 'DARK').length;
    const pct = scenes.length ? Math.round((grounded / scenes.length) * 100) : 0;
    return (
      `SCSWTRI: ${scenes.length} cinematic scenes correlated against ${swarmJobs.length} swarm jobs and ${kbArticles.length} KB articles. ` +
      `${grounded} (${pct}%) are FULLY GROUNDED with both automation and knowledge backing. ` +
      `${dark > 0 ? `${dark} scene${dark > 1 ? 's are' : ' is'} DARK — no swarm coverage or knowledge base entry; immediate attention required.` : 'All scenes have at least swarm or knowledge coverage.'}`
    );
  } catch {
    return 'SCSWTRI: scene swarm knowledge coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY GROUNDED', 'SWARM BACKED', 'KB BACKED', 'DARK'];
const TAB_KEY = { 'ALL': null, 'FULLY GROUNDED': 'FULLY_GROUNDED', 'SWARM BACKED': 'SWARM_BACKED', 'KB BACKED': 'KB_BACKED', 'DARK': 'DARK' };

const COVER_COLOR = {
  FULLY_GROUNDED: '#22c55e',
  SWARM_BACKED: '#a3e635',
  KB_BACKED: '#818cf8',
  DARK: '#64748b',
};

const LABEL_MAP = {
  FULLY_GROUNDED: 'FULLY GROUNDED',
  SWARM_BACKED: 'SWARM BACKED',
  KB_BACKED: 'KB BACKED',
  DARK: 'DARK',
};

export default function SceneSwarmKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, swarm: 0, kb: 0, grounded: 0, swarmBacked: 0, kbBacked: 0, dark: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [scenesR, swarmR, kbR] = await Promise.allSettled([
        Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : Promise.reject(`swarm ${r.status}`)),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(`knowledge ${r.status}`)),
      ]);
      const rawScenes = scenesR.status === 'fulfilled'
        ? scenesR.value.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
        : [];
      const scenes = normaliseScenes(rawScenes);
      const swarmJobs = normaliseSwarmJobs(swarmR.status === 'fulfilled' ? swarmR.value : null);
      const kbArticles = normaliseKnowledge(kbR.status === 'fulfilled' ? kbR.value : null);
      const correlated = correlate(scenes, swarmJobs, kbArticles);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        swarm: swarmJobs.length,
        kb: kbArticles.length,
        grounded: correlated.filter(r => r.coverage === 'FULLY_GROUNDED').length,
        swarmBacked: correlated.filter(r => r.coverage === 'SWARM_BACKED').length,
        kbBacked: correlated.filter(r => r.coverage === 'KB_BACKED').length,
        dark: correlated.filter(r => r.coverage === 'DARK').length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) setOpen(e.detail.open);
      else setOpen(v => !v);
    };
    window.addEventListener('jarvis:scswtri-toggle', handler);
    return () => window.removeEventListener('jarvis:scswtri-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 120000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.title.toLowerCase().includes(s) || r.description.toLowerCase().includes(s);
    }
    return true;
  });

  const total = counts.total || 1;
  const barGrounded = (counts.grounded / total * 100).toFixed(1);
  const barSwarm = (counts.swarmBacked / total * 100).toFixed(1);
  const barKb = (counts.kbBacked / total * 100).toFixed(1);
  const barDark = (counts.dark / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Assess cinematic scene "${row.title}" for swarm automation and knowledge base coverage. Coverage: ${LABEL_MAP[row.coverage]}. Matched swarm jobs: ${row.matchedSwarm.map(j => j.name).join(', ') || 'none'}. Matched KB articles: ${row.matchedKb.map(a => a.title).join(', ') || 'none'}. ${row.coverage === 'DARK' ? 'This scene has no swarm or knowledge coverage — identify critical gaps and recommend immediate action.' : 'Assess coverage quality and any remaining operational or knowledge gaps.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      /* silent */
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 821840, bottom: 8, zIndex: 496,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Scene × SwarmJob × Knowledge Triple Coverage (SCSWTRI)"
      >
        ◈ SCSWTRI
        {counts.dark > 0 && (
          <span style={{
            background: '#64748b', color: '#fff', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.dark}</span>
        )}
        {counts.grounded > 0 && (
          <span style={{
            background: '#22c55e', color: '#fff', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.grounded}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 496,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ SCSWTRI</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Scene × SwarmJob × Knowledge Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES', val: counts.total, color: '#94a3b8' },
          { label: 'SWARM JOBS', val: counts.swarm, color: '#a3e635' },
          { label: 'KB ARTICLES', val: counts.kb, color: '#818cf8' },
          { label: 'FULLY GROUNDED', val: counts.grounded, color: '#22c55e' },
          { label: 'SWARM BACKED', val: counts.swarmBacked, color: '#a3e635' },
          { label: 'KB BACKED', val: counts.kbBacked, color: '#818cf8' },
          { label: 'DARK', val: counts.dark, color: '#64748b' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.6)', borderRadius: 6, padding: '4px 10px',
            border: `1px solid ${s.color}33`,
          }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, background: '#1e293b', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${barGrounded}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${barSwarm}%`, background: '#a3e635', transition: 'width 0.4s' }} />
        <div style={{ width: `${barKb}%`, background: '#818cf8', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDark}%`, background: '#64748b', transition: 'width 0.4s' }} />
      </div>

      {error && (
        <div style={{ margin: '0 14px 6px', color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,197,94,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22c55e' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22c55e' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No scenes match current filter.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: 'rgba(30,41,59,0.5)', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${COVER_COLOR[row.coverage]}33`,
              }}
            >
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 112 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.title}</span>
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedSwarm.length}swj {row.matchedKb.length}kb
              </span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing === row.id}
                style={{
                  background: assessing === row.id ? '#1e293b' : 'rgba(34,197,94,0.12)',
                  border: '1px solid #22c55e44', borderRadius: 4, color: '#22c55e',
                  fontSize: 9, padding: '1px 6px', cursor: 'pointer',
                }}
              >
                {assessing === row.id ? '…' : 'ASSESS'}
              </button>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.description && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8, fontStyle: 'italic' }}>{row.description.slice(0, 200)}{row.description.length > 200 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* SwarmJobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a3e635', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SWARM JOBS ({row.matchedSwarm.length})</div>
                    {row.matchedSwarm.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No swarm job coverage — automation gap.</div>
                      : row.matchedSwarm.slice(0, 5).map(j => (
                        <div key={j.id} style={{ marginBottom: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                            <span style={{ color: '#e2e8f0', fontSize: 10, flex: 1 }}>{j.name}</span>
                            {j.kind && <span style={{ background: 'rgba(163,230,53,0.15)', color: '#a3e635', borderRadius: 3, fontSize: 8, padding: '0 4px' }}>{j.kind}</span>}
                            {j.status && <span style={{ color: '#64748b', fontSize: 8 }}>{j.status}</span>}
                          </div>
                          <div style={{ height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(j.score * 100)}%`, background: '#a3e635', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* KB Articles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>KB ARTICLES ({row.matchedKb.length})</div>
                    {row.matchedKb.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No knowledge base coverage — intelligence gap.</div>
                      : row.matchedKb.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                            <span style={{ color: '#e2e8f0', fontSize: 10, flex: 1 }}>{a.title}</span>
                            {a.category && <span style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8', borderRadius: 3, fontSize: 8, padding: '0 4px' }}>{a.category}</span>}
                          </div>
                          <div style={{ height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(a.score * 100)}%`, background: '#818cf8', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                {row.coverage === 'DARK' && (
                  <div style={{ marginTop: 8, color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
                    ⚠ No swarm automation or knowledge base coverage for this scene — operational and intelligence blind spot.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
