import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TIPGC_RE = /\b(tipgc|task\s+intel\s+community|task\s+intel\s+profile\s+community|task\s+profile\s+community|task\s+community\s+profile|intel\s+community\s+task|community\s+intel\s+task|blind\s+task\s+community|mapped\s+task\s+intel|fully\s+mapped\s+task|task\s+intelligence\s+community|task\s+network\s+intel)\b/i;
const THRESHOLD = 0.07;

export function isTipgcQuery(t) {
  return TIPGC_RE.test(t || '');
}

export async function buildTipgcScript() {
  try {
    const [taskRes, profileRes, commRes] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []),
    ]);
    const tasks = normaliseTasks(taskRes);
    const profiles = normaliseProfiles(profileRes);
    const communities = normaliseCommunities(commRes);
    const classified = tasks.map(t => classifyTask(t, profiles, communities));
    const mapped = classified.filter(t => t.state === 'FULLY_MAPPED').length;
    const blind = classified.filter(t => t.state === 'BLIND').length;
    return `TIPGC analysis: ${tasks.length} tasks cross-referenced against ${profiles.length} intel profiles and ${communities.length} graph communities. ${mapped} tasks are FULLY MAPPED — both human intelligence backing and network community context confirmed. ${blind} tasks are BLIND — no intel profile or graph community coverage detected, representing operational intelligence gaps requiring immediate human intelligence assignment and network mapping.`;
  } catch {
    return 'TIPGC data unavailable — check /entities/Task, /entities/IntelProfile, and /v1/graph/communities endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.tasks) ? raw.tasks
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((t, i) => ({
    id: t.id || t._id || `task-${i}`,
    label: t.name || t.title || t.task || `Task ${i + 1}`,
    description: t.description || t.summary || '',
    category: t.category || t.type || '',
    priority: t.priority || '',
    _searchText: [t.name, t.title, t.description, t.summary, t.category, t.type, t.mission, t.objective, t.tags].filter(Boolean).join(' '),
  }));
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.profiles) ? raw.profiles
    : Array.isArray(raw.intel_profiles) ? raw.intel_profiles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((p, i) => ({
    id: p.id || p._id || `ip-${i}`,
    label: p.name || p.full_name || p.alias || `Profile ${i + 1}`,
    role: p.role || p.position || p.title || '',
    company: p.company || p.organization || p.employer || '',
    _searchText: [p.name, p.full_name, p.alias, p.company, p.organization, p.role, p.sector, p.nationality, p.aliases, p.description].filter(Boolean).join(' '),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.communities) ? raw.communities
    : Array.isArray(raw.clusters) ? raw.clusters
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `comm-${i}`,
    label: c.name || c.label || c.title || `Community ${i + 1}`,
    type: c.type || c.category || c.kind || '',
    _searchText: [c.name, c.label, c.title, c.description, c.type, c.category, c.tags, c.members].filter(Boolean).join(' '),
  }));
}

function classifyTask(task, profiles, communities) {
  const toks = tok(task._searchText);
  const profileMatches = profiles
    .map(p => ({ ...p, score: Math.max(matchScore(toks, p._searchText), matchScore(tok(p._searchText), task._searchText)) }))
    .filter(p => p.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const communityMatches = communities
    .map(c => ({ ...c, score: Math.max(matchScore(toks, c._searchText), matchScore(tok(c._searchText), task._searchText)) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasProfile = profileMatches.length > 0;
  const hasCommunity = communityMatches.length > 0;
  let state;
  if (hasProfile && hasCommunity) state = 'FULLY_MAPPED';
  else if (hasProfile) state = 'INTEL_BACKED';
  else if (hasCommunity) state = 'COMMUNITY_MAPPED';
  else state = 'BLIND';
  return { ...task, state, profileMatches, communityMatches };
}

const STATE_LABELS = {
  FULLY_MAPPED: 'FULLY MAPPED',
  INTEL_BACKED: 'INTEL-BACKED',
  COMMUNITY_MAPPED: 'COMMUNITY-MAPPED',
  BLIND: 'BLIND',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function TaskIntelProfileCommunityTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskRes, profileRes, commRes] = await Promise.all([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const t = normaliseTasks(taskRes);
      const p = normaliseProfiles(profileRes);
      const c = normaliseCommunities(commRes);
      setTasks(t);
      setProfiles(p);
      setCommunities(c);
      setClassified(t.map(task => classifyTask(task, p, c)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:tipgc-toggle', handler);
    return () => window.removeEventListener('jarvis:tipgc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (TIPGC_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_MAPPED: classified.filter(t => t.state === 'FULLY_MAPPED').length,
    INTEL_BACKED: classified.filter(t => t.state === 'INTEL_BACKED').length,
    COMMUNITY_MAPPED: classified.filter(t => t.state === 'COMMUNITY_MAPPED').length,
    BLIND: classified.filter(t => t.state === 'BLIND').length,
  };

  const visible = classified.filter(t => {
    if (filter !== 'ALL' && t.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t._searchText.toLowerCase().includes(q) || t.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `TIPGC Task × IntelProfile × Graph Community Triple Coverage: ${tasks.length} tasks cross-referenced against ${profiles.length} intel profiles and ${communities.length} graph communities. Coverage: FULLY MAPPED=${counts.FULLY_MAPPED}, INTEL-BACKED=${counts.INTEL_BACKED}, COMMUNITY-MAPPED=${counts.COMMUNITY_MAPPED}, BLIND=${counts.BLIND}. In 2 sentences, assess which tasks lack both human intelligence backing and network community context, and identify the most critical operational intelligence gaps requiring immediate human intelligence assignment and graph community mapping.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const mappedPct = classified.length ? Math.round((counts.FULLY_MAPPED / classified.length) * 100) : 0;
  const intelPct = classified.length ? Math.round((counts.INTEL_BACKED / classified.length) * 100) : 0;
  const commPct = classified.length ? Math.round((counts.COMMUNITY_MAPPED / classified.length) * 100) : 0;
  const blindPct = classified.length ? Math.round((counts.BLIND / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 847040, bottom: 8, zIndex: 541,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a2c1a',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,60,20,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#a3e635', fontWeight: 700, fontSize: 13 }}>◈ TIPGC</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Task × IntelProfile × Graph Community Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#a3e635', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'TASKS', val: tasks.length, color: '#e2e8f0' },
          { label: 'INTEL PROFILES', val: profiles.length, color: '#67e8f9' },
          { label: 'COMMUNITIES', val: communities.length, color: '#34d399' },
          { label: 'FULLY MAPPED', val: counts.FULLY_MAPPED, color: '#a3e635', badge: counts.FULLY_MAPPED > 0 },
          { label: 'INTEL-BACKED', val: counts.INTEL_BACKED, color: '#67e8f9' },
          { label: 'COMM-MAPPED', val: counts.COMMUNITY_MAPPED, color: '#34d399' },
          { label: 'BLIND', val: counts.BLIND, color: '#64748b', badge: counts.BLIND > 0 },
          { label: 'COVERAGE %', val: `${mappedPct}%`, color: '#a3e635' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Task Intel & Community Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#a3e635' }}>{mappedPct}% fully mapped</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {mappedPct > 0 && <div style={{ width: `${mappedPct}%`, background: '#a3e635' }} />}
          {intelPct > 0 && <div style={{ width: `${intelPct}%`, background: '#67e8f9' }} />}
          {commPct > 0 && <div style={{ width: `${commPct}%`, background: '#34d399' }} />}
          {blindPct > 0 && <div style={{ width: `${blindPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#a3e635' }}>● FULLY MAPPED</span>
          <span style={{ color: '#67e8f9' }}>● INTEL-BACKED</span>
          <span style={{ color: '#34d399' }}>● COMMUNITY-MAPPED</span>
          <span style={{ color: '#64748b' }}>● BLIND</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_MAPPED', 'INTEL_BACKED', 'COMMUNITY_MAPPED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#0d1f0d' : '#0f172a',
            border: `1px solid ${filter === f ? '#a3e635' : '#1e293b'}`,
            color: filter === f ? '#bef264' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No tasks match current filter.</div>
        )}
        {visible.map(t => {
          const stateColor = t.state === 'FULLY_MAPPED' ? '#a3e635' : t.state === 'INTEL_BACKED' ? '#67e8f9' : t.state === 'COMMUNITY_MAPPED' ? '#34d399' : '#475569';
          const isExp = expanded === t.id;
          return (
            <div key={t.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#1a2c1a' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 160 }}>{STATE_LABELS[t.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{t.label}</span>
                {t.priority && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{t.priority}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {t.description && (
                    <div style={{ color: '#64748b', fontSize: 10, margin: '6px 0', fontStyle: 'italic' }}>{t.description.slice(0, 120)}{t.description.length > 120 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Intel Profiles pane */}
                    <div>
                      <div style={{ color: '#67e8f9', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>INTEL PROFILES ({t.profileMatches.length})</div>
                      {t.profileMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No intel profile coverage</div>
                        : t.profileMatches.slice(0, 6).map(p => (
                          <div key={p.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#a5f3fc', fontSize: 11 }}>{p.label.slice(0, 36)}{p.label.length > 36 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {p.role && <span style={{ background: '#0c2833', color: '#67e8f9', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{p.role.slice(0, 12)}</span>}
                                {p.company && <span style={{ background: '#0f172a', color: '#475569', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{p.company.slice(0, 12)}</span>}
                              </div>
                            </div>
                            <ScoreBar score={p.score} color="#67e8f9" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Communities pane */}
                    <div>
                      <div style={{ color: '#34d399', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH COMMUNITIES ({t.communityMatches.length})</div>
                      {t.communityMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No graph community coverage</div>
                        : t.communityMatches.slice(0, 6).map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#6ee7b7', fontSize: 11 }}>{c.label.slice(0, 36)}{c.label.length > 36 ? '…' : ''}</span>
                              {c.type && <span style={{ background: '#022c22', color: '#34d399', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.type.slice(0, 14)}</span>}
                            </div>
                            <ScoreBar score={c.score} color="#34d399" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#0d1f0d', border: '1px solid #a3e635',
            color: assessing ? '#475569' : '#bef264', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
