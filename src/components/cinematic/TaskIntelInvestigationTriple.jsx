import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TASKIPINV_RE = /\b(taskipinv|task\s+intel\s+invest|intel\s+task\s+invest|task\s+profile\s+invest|task\s+human\s+intel|task\s+intel\s+case|supported\s+task|task\s+case\s+intel|dark\s+task\s+intel|task\s+investigation\s+intel|task\s+invest\s+profile)\b/i;

const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseTasks(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.tasks) ? data.tasks
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(t => ({
    id: t.id || t._id || t.taskId || String(Math.random()),
    name: t.name || t.title || t.label || 'Unnamed Task',
    description: t.description || t.desc || t.summary || '',
    priority: t.priority || t.urgency || t.level || '',
    status: t.status || t.state || '',
    category: t.category || t.type || t.kind || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags || ''),
    raw: t,
  }));
}

function normaliseIntelProfiles(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.profiles) ? data.profiles
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(p => ({
    id: p.id || p._id || p.profileId || String(Math.random()),
    name: p.name || p.fullName || p.label || 'Unknown Profile',
    role: p.role || p.title || p.position || '',
    company: p.company || p.organisation || p.organization || p.affiliation || '',
    sector: p.sector || p.industry || '',
    nationality: p.nationality || p.country || '',
    aliases: Array.isArray(p.aliases) ? p.aliases.join(' ') : String(p.aliases || ''),
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    raw: p,
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investigations) ? data.investigations
    : Array.isArray(data.cases) ? data.cases
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(inv => ({
    id: inv.id || inv._id || inv.caseId || String(Math.random()),
    title: inv.title || inv.name || inv.label || 'Untitled Investigation',
    status: inv.status || inv.state || inv.phase || '',
    category: inv.category || inv.type || inv.kind || '',
    summary: inv.summary || inv.description || inv.detail || '',
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : String(inv.tags || ''),
    raw: inv,
  }));
}

function correlate(tasks, profiles, investigations) {
  return tasks.map(task => {
    const toks = tok([task.name, task.description, task.category, task.tags].join(' '));

    const matchedProfiles = profiles
      .map(p => {
        const score = Math.max(
          matchScore(toks, p.name),
          matchScore(toks, p.role),
          matchScore(toks, p.company),
          matchScore(toks, p.sector),
          matchScore(toks, p.nationality),
          matchScore(toks, p.aliases),
          matchScore(toks, p.tags),
        );
        return { ...p, score };
      })
      .filter(p => p.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedInvestigations = investigations
      .map(inv => {
        const score = Math.max(
          matchScore(toks, inv.title),
          matchScore(toks, inv.category),
          matchScore(toks, inv.summary),
          matchScore(toks, inv.tags),
        );
        return { ...inv, score };
      })
      .filter(inv => inv.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasProfile = matchedProfiles.length > 0;
    const hasCase = matchedInvestigations.length > 0;

    let state;
    if (hasProfile && hasCase) state = 'FULLY SUPPORTED';
    else if (hasProfile) state = 'INTEL-BACKED';
    else if (hasCase) state = 'CASE-LINKED';
    else state = 'DARK';

    return { task, matchedProfiles, matchedInvestigations, state };
  });
}

export function isTaskipinvQuery(t) {
  return TASKIPINV_RE.test(t || '');
}

export async function buildTaskipinvScript() {
  try {
    const [tRes, pRes, iRes] = await Promise.allSettled([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
    ]);
    const tasks = normaliseTasks(tRes.status === 'fulfilled' ? tRes.value : null);
    const profiles = normaliseIntelProfiles(pRes.status === 'fulfilled' ? pRes.value : null);
    const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
    const rows = correlate(tasks, profiles, investigations);
    const fully = rows.filter(r => r.state === 'FULLY SUPPORTED').length;
    const intelbacked = rows.filter(r => r.state === 'INTEL-BACKED').length;
    const caselinked = rows.filter(r => r.state === 'CASE-LINKED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    return `TASKIPINV Task×IntelProfile×Investigation: ${rows.length} tasks analysed. ` +
      `${fully} FULLY SUPPORTED (intel profile + investigation case), ` +
      `${intelbacked} INTEL-BACKED (profile only), ${caselinked} CASE-LINKED (investigation only), ${dark} DARK. ` +
      (dark > 0 ? `${dark} tasks have no human intelligence or case file backing — coverage gap.` :
        fully > 0 ? `Top supported: ${rows.find(r => r.state === 'FULLY SUPPORTED')?.task.name || 'see panel'}.` :
        'No fully supported tasks at this time.');
  } catch {
    return 'TASKIPINV: data fetch failed.';
  }
}

export default function TaskIntelInvestigationTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:taskipinv-toggle', handler);
    return () => window.removeEventListener('jarvis:taskipinv-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [tRes, pRes, iRes] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const tasks = normaliseTasks(tRes.status === 'fulfilled' ? tRes.value : null);
      const profiles = normaliseIntelProfiles(pRes.status === 'fulfilled' ? pRes.value : null);
      const investigations = normaliseInvestigations(iRes.status === 'fulfilled' ? iRes.value : null);
      if (!tasks.length && !profiles.length && !investigations.length) {
        setErr('No data returned from Task, IntelProfile, or Investigations endpoints.');
      }
      setRows(correlate(tasks, profiles, investigations));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully = rows.filter(r => r.state === 'FULLY SUPPORTED').length;
  const intelbacked = rows.filter(r => r.state === 'INTEL-BACKED').length;
  const caselinked = rows.filter(r => r.state === 'CASE-LINKED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY SUPPORTED', 'INTEL-BACKED', 'CASE-LINKED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.task.name.toLowerCase().includes(q) ||
        r.task.description.toLowerCase().includes(q) ||
        r.matchedProfiles.some(p => p.name.toLowerCase().includes(q)) ||
        r.matchedInvestigations.some(inv => inv.title.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const coverageBarWidth = total > 0 ? {
    fully: (fully / total) * 100,
    intelbacked: (intelbacked / total) * 100,
    caselinked: (caselinked / total) * 100,
    dark: (dark / total) * 100,
  } : { fully: 0, intelbacked: 0, caselinked: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Task "${row.task.name}" [${row.state}]: ` +
      `intel profiles: ${row.matchedProfiles.map(p => p.name).join(', ') || 'none'}. ` +
      `investigations: ${row.matchedInvestigations.map(inv => inv.title).join(', ') || 'none'}. ` +
      `Priority: ${row.task.priority || 'unknown'}. Status: ${row.task.status || 'unknown'}. ` +
      `Give a 2-sentence operational intelligence support brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  const STATE_COLOUR = {
    'FULLY SUPPORTED': '#00ff88',
    'INTEL-BACKED': '#00e5ff',
    'CASE-LINKED': '#ffbb00',
    'DARK': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 809520,
          bottom: 8,
          zIndex: 474,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00ff8844',
          color: '#00ff88',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ TASKIPINV
        {dark > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ffbb00',
            color: '#000',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {dark}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00ff8855',
      borderRadius: 8,
      zIndex: 474,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00ff8822',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00ff8822',
        background: 'rgba(0,255,136,0.05)',
      }}>
        <span style={{ color: '#00ff88', fontWeight: 700, letterSpacing: 1 }}>
          ◈ TASK × INTEL PROFILE × INVESTIGATION
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #00ff8844',
              color: '#00ff88',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00ff8811' }}>
        {[
          { label: 'FULLY SUPPORTED', val: fully, col: '#00ff88' },
          { label: 'INTEL-BACKED', val: intelbacked, col: '#00e5ff' },
          { label: 'CASE-LINKED', val: caselinked, col: '#ffbb00' },
          { label: 'DARK', val: dark, col: '#555' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,255,136,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00ff8811' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#001a0a' }}>
            <div style={{ width: `${coverageBarWidth.fully}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.intelbacked}%`, background: '#00e5ff', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.caselinked}%`, background: '#ffbb00', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBarWidth.dark}%`, background: '#333', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ SUPPORTED</span>
            <span style={{ color: '#00e5ff' }}>■ INTEL-BACKED</span>
            <span style={{ color: '#ffbb00' }}>■ CASE-LINKED</span>
            <span style={{ color: '#444' }}>■ DARK</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#00ff8822' : 'none',
              border: `1px solid ${filter === t ? '#00ff88' : '#00ff8833'}`,
              color: filter === t ? '#00ff88' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,255,136,0.05)',
            border: '1px solid #00ff8833',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching tasks.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.task.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.task.id}
              style={{
                borderBottom: '1px solid #00ff880d',
                background: isExp ? 'rgba(0,255,136,0.03)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.task.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.task.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.task.priority && (
                  <span style={{ color: '#ffbb00', fontSize: 9, marginLeft: 4 }}>
                    P:{row.task.priority}
                  </span>
                )}
                {row.task.status && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    [{row.task.status}]
                  </span>
                )}
                <span style={{ color: '#00ff8844', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.task.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.task.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched intel profiles */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#00e5ff', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        INTEL PROFILES ({row.matchedProfiles.length})
                      </div>
                      {row.matchedProfiles.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No intel profiles matched.</div>
                      )}
                      {row.matchedProfiles.slice(0, 5).map(p => (
                        <div key={p.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#c8e6ff', fontWeight: 600 }}>{p.name}</span>
                            <span style={{ color: '#00e5ff', fontSize: 10 }}>{(p.score * 100).toFixed(0)}%</span>
                          </div>
                          {(p.role || p.company) && (
                            <div style={{ color: '#556', fontSize: 10 }}>
                              {p.role}{p.company ? ` · ${p.company}` : ''}
                            </div>
                          )}
                          {p.sector && (
                            <div style={{ color: '#445', fontSize: 10 }}>{p.sector}</div>
                          )}
                          <div style={{ height: 3, background: '#001a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(p.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #00e5ff, #0088aa)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched investigations */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ffbb00', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        INVESTIGATIONS ({row.matchedInvestigations.length})
                      </div>
                      {row.matchedInvestigations.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No investigations matched.</div>
                      )}
                      {row.matchedInvestigations.slice(0, 5).map(inv => (
                        <div key={inv.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffe0a0', fontWeight: 600 }}>{inv.title}</span>
                            <span style={{ color: '#ffbb00', fontSize: 10 }}>{(inv.score * 100).toFixed(0)}%</span>
                          </div>
                          {(inv.category || inv.status) && (
                            <div style={{ color: '#556', fontSize: 10 }}>
                              {inv.category}{inv.status ? ` · ${inv.status}` : ''}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#1a1000', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(inv.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #ffbb00, #aa7700)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(0,255,136,0.08)',
                      border: '1px solid #00ff8855',
                      color: '#00ff88',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
