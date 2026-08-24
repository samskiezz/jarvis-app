import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TGCLI_RE = /\b(tgcli|task\s+graph\s+community\s+live|task\s+community\s+live|task\s+live\s+community|fully\s+activated\s+task|task\s+live\s+intel\s+community|task\s+world\s+community|community\s+live\s+task|live\s+task\s+community|task\s+network\s+live|task\s+graph\s+live|task\s+community\s+intel|network\s+live\s+task)\b/i;
const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.tasks || raw.items || raw.data || []);
  return arr.map((t, i) => ({
    id: t.id || t.task_id || `tsk-${i}`,
    title: t.title || t.name || t.label || `Task ${i + 1}`,
    status: t.status || t.state || '',
    priority: t.priority || '',
    description: t.description || t.summary || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
    _searchText: [t.title, t.name, t.description, t.summary, t.priority, t.tags, t.category, t.mission].filter(Boolean).join(' '),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.communities || raw.clusters || raw.items || raw.data || []);
  return arr.map((c, i) => ({
    id: c.id || c.community_id || `comm-${i}`,
    label: c.label || c.name || c.title || `Community ${i + 1}`,
    type: c.type || c.kind || '',
    summary: c.summary || c.description || '',
    members: Array.isArray(c.members) ? c.members.join(' ') : (c.members || ''),
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
    _searchText: [c.label, c.name, c.title, c.type, c.summary, c.description, c.members, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const events = [];
  if (raw.earthquakes) {
    raw.earthquakes.forEach((q, i) => events.push({
      id: `quake-${i}`,
      type: 'SEISMIC',
      label: q.place || q.location || `M${q.magnitude} quake`,
      _searchText: [q.place, q.location, q.type, 'seismic', 'earthquake', 'quake'].filter(Boolean).join(' '),
    }));
  }
  if (raw.crypto) {
    raw.crypto.forEach((c, i) => events.push({
      id: `crypto-${i}`,
      type: 'CRYPTO',
      label: c.symbol || c.name || `Crypto ${i + 1}`,
      _searchText: [c.symbol, c.name, 'crypto', 'bitcoin', 'finance', 'market', 'digital', 'currency'].filter(Boolean).join(' '),
    }));
  }
  if (raw.fx) {
    raw.fx.forEach((f, i) => events.push({
      id: `fx-${i}`,
      type: 'FX',
      label: f.pair || f.symbol || `FX ${i + 1}`,
      _searchText: [f.pair, f.symbol, f.base, f.quote, 'forex', 'fx', 'currency', 'exchange', 'finance'].filter(Boolean).join(' '),
    }));
  }
  return events;
}

function correlate(tasks, communities, liveEvents) {
  return tasks.map(task => {
    const tToks = tok(task._searchText);
    const matchedComms = communities
      .map(c => ({ ...c, score: matchScore(tToks, c._searchText) }))
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedLive = liveEvents
      .map(e => ({ ...e, score: matchScore(tToks, e._searchText) }))
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasComm = matchedComms.length > 0;
    const hasLive = matchedLive.length > 0;
    let coverage;
    if (hasComm && hasLive) coverage = 'FULLY_ACTIVATED';
    else if (hasComm) coverage = 'COMMUNITY_MAPPED';
    else if (hasLive) coverage = 'LIVE_TRIGGERED';
    else coverage = 'DORMANT';
    return { ...task, matchedComms, matchedLive, coverage };
  });
}

export function isTgcliQuery(t) {
  return TGCLI_RE.test(t || '');
}

export async function buildTgcliScript() {
  try {
    const [taskR, commR, liveR] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseTasks(taskR), normaliseCommunities(commR), normaliseLiveIntel(liveR));
    const activated = rows.filter(r => r.coverage === 'FULLY_ACTIVATED').length;
    const dormant = rows.filter(r => r.coverage === 'DORMANT').length;
    return `TGCLI coverage: ${rows.length} tasks assessed — ${activated} fully activated (graph community and live world intel aligned), ${dormant} dormant (no network or world event coverage). ${activated > 0 ? `${activated} task${activated > 1 ? 's are' : ' is'} operationally heightened — cross-network and live-world signals converge.` : 'No tasks currently have both community and live intel alignment.'}`;
  } catch {
    return 'TGCLI: task graph community live intel coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY ACTIVATED', 'COMMUNITY MAPPED', 'LIVE TRIGGERED', 'DORMANT'];
const TAB_KEY = {
  'ALL': null,
  'FULLY ACTIVATED': 'FULLY_ACTIVATED',
  'COMMUNITY MAPPED': 'COMMUNITY_MAPPED',
  'LIVE TRIGGERED': 'LIVE_TRIGGERED',
  'DORMANT': 'DORMANT',
};

const COVER_COLOR = {
  FULLY_ACTIVATED: '#22d3ee',
  COMMUNITY_MAPPED: '#34d399',
  LIVE_TRIGGERED: '#fb923c',
  DORMANT: '#64748b',
};

const LABEL_MAP = {
  FULLY_ACTIVATED: 'FULLY ACTIVATED',
  COMMUNITY_MAPPED: 'COMMUNITY MAPPED',
  LIVE_TRIGGERED: 'LIVE TRIGGERED',
  DORMANT: 'DORMANT',
};

const TYPE_COLOR = { SEISMIC: '#ef4444', CRYPTO: '#f59e0b', FX: '#06b6d4' };

export default function TaskGraphCommunityLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, communities: 0, liveEvents: 0, activated: 0, commMapped: 0, liveTriggered: 0, dormant: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskR, commR, liveR] = await Promise.all([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : Promise.reject(`tasks ${r.status}`)),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : Promise.reject(`communities ${r.status}`)),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : Promise.reject(`liveIntel ${r.status}`)),
      ]);
      const tasks = normaliseTasks(taskR);
      const communities = normaliseCommunities(commR);
      const liveEvents = normaliseLiveIntel(liveR);
      const correlated = correlate(tasks, communities, liveEvents);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        communities: communities.length,
        liveEvents: liveEvents.length,
        activated: correlated.filter(r => r.coverage === 'FULLY_ACTIVATED').length,
        commMapped: correlated.filter(r => r.coverage === 'COMMUNITY_MAPPED').length,
        liveTriggered: correlated.filter(r => r.coverage === 'LIVE_TRIGGERED').length,
        dormant: correlated.filter(r => r.coverage === 'DORMANT').length,
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
    window.addEventListener('jarvis:tgcli-toggle', handler);
    return () => window.removeEventListener('jarvis:tgcli-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.title.toLowerCase().includes(s) || r.description.toLowerCase().includes(s) || r.status.toLowerCase().includes(s);
    }
    return true;
  });

  const total = counts.total || 1;
  const barActivated = (counts.activated / total * 100).toFixed(1);
  const barComm = (counts.commMapped / total * 100).toFixed(1);
  const barLive = (counts.liveTriggered / total * 100).toFixed(1);
  const barDorm = (counts.dormant / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse task "${row.title}" (status: ${row.status || 'unknown'}, priority: ${row.priority || 'unknown'}) for graph community and live world intel alignment. Coverage state: ${LABEL_MAP[row.coverage]}. Matched communities: ${row.matchedComms.map(c => c.label).join(', ') || 'none'}. Matched live intel events: ${row.matchedLive.map(e => `[${e.type}] ${e.label}`).join(', ') || 'none'}. ${row.coverage === 'DORMANT' ? 'This task has no network community or live world intel alignment — identify the operational gap and recommend immediate action.' : 'Assess the quality of the alignment and any remaining coverage gaps.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.__JARVIS_KEY__ || 'dev-key'}` },
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
        title="Task × Graph Community × Live Intel Triple Coverage (TGCLI)"
      >
        ◈ TGCLI
        {counts.activated > 0 && (
          <span style={{
            background: '#22d3ee', color: '#04060a', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.activated}</span>
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
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>◈ TGCLI</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Task × Graph Community × Live Intel Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'TASKS', val: counts.total, color: '#94a3b8' },
          { label: 'COMMUNITIES', val: counts.communities, color: '#34d399' },
          { label: 'LIVE EVENTS', val: counts.liveEvents, color: '#fb923c' },
          { label: 'FULLY ACTIVATED', val: counts.activated, color: '#22d3ee' },
          { label: 'COMMUNITY MAPPED', val: counts.commMapped, color: '#34d399' },
          { label: 'LIVE TRIGGERED', val: counts.liveTriggered, color: '#fb923c' },
          { label: 'DORMANT', val: counts.dormant, color: '#64748b' },
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
        <div style={{ width: `${barActivated}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
        <div style={{ width: `${barComm}%`, background: '#34d399', transition: 'width 0.4s' }} />
        <div style={{ width: `${barLive}%`, background: '#fb923c', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDorm}%`, background: '#64748b', transition: 'width 0.4s' }} />
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
            background: tab === t ? 'rgba(34,211,238,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22d3ee' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22d3ee' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No tasks match current filter.</div>
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
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 120 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.title}</span>
              {row.priority && (
                <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.priority}</span>
              )}
              {row.status && (
                <span style={{ color: '#475569', fontSize: 9, background: 'rgba(71,85,105,0.2)', borderRadius: 3, padding: '1px 5px' }}>{row.status}</span>
              )}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedComms.length}comm {row.matchedLive.length}live
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.description && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8, fontStyle: 'italic' }}>{row.description.slice(0, 200)}{row.description.length > 200 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Communities */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#34d399', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>COMMUNITIES ({row.matchedComms.length})</div>
                    {row.matchedComms.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched communities.</div>
                      : row.matchedComms.slice(0, 5).map(c => (
                        <div key={c.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(c.score * 400, 100)}%`, height: '100%', background: '#34d399' }} />
                            </div>
                            {c.type && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(52,211,153,0.1)', borderRadius: 3, padding: '1px 4px' }}>{c.type.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{c.label}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Live Intel */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fb923c', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>LIVE INTEL ({row.matchedLive.length})</div>
                    {row.matchedLive.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched live events.</div>
                      : row.matchedLive.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(e.score * 400, 100)}%`, height: '100%', background: '#fb923c' }} />
                            </div>
                            <span style={{ color: TYPE_COLOR[e.type] || '#64748b', fontSize: 9, background: 'rgba(251,146,60,0.1)', borderRadius: 3, padding: '1px 4px' }}>{e.type}</span>
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{e.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(34,211,238,0.1)', border: '1px solid #22d3ee44',
                    borderRadius: 4, color: '#22d3ee', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                    opacity: assessing === row.id ? 0.5 : 1,
                  }}
                >
                  {assessing === row.id ? 'ASSESSING…' : '⬡ ASSESS'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
