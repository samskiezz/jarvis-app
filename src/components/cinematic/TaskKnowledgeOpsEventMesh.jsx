import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_EXPOSED', 'KB_ONLY', 'OPS_ONLY', 'CLEAR'];

const CLASS_COLOR = {
  FULLY_EXPOSED: '#ff4444',
  KB_ONLY:       '#ffd700',
  OPS_ONLY:      '#00bfff',
  CLEAR:         '#00ff88',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aStr, bStr) {
  const setA = new Set(tokens(aStr));
  return tokens(bStr).some(t => setA.has(t));
}

function scoreMatch(taskFields, candidates) {
  let best = null;
  let topScore = 0;
  for (const c of candidates) {
    const cTokens = new Set(tokens(c.text || ''));
    const score = taskFields.reduce((acc, f) => {
      tokens(f).forEach(t => { if (cTokens.has(t)) acc++; });
      return acc;
    }, 0);
    if (score > topScore) { topScore = score; best = c; }
  }
  return { match: best, score: topScore };
}

export default function TaskKnowledgeOpsEventMesh() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tasksRes, kbRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/Task`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/v1/ops/events?limit=200`),
      ]);
      const tasksData = tasksRes.ok ? await tasksRes.json() : {};
      const kbData    = kbRes.ok    ? await kbRes.json()    : {};
      const opsData   = opsRes.ok   ? await opsRes.json()   : {};

      const tasks    = tasksData.items  || tasksData.data  || tasksData.tasks   || [];
      const articles = kbData.articles  || kbData.items    || kbData.data       || [];
      const events   = opsData.events   || opsData.items   || opsData.data      || [];

      // Build text blobs for KB and Ops
      const kbBlobs = articles.map(a => ({
        id: a.id || a.article_id,
        title: a.title || '',
        text: [a.title, a.content, a.topic, ...(a.tags || [])].filter(Boolean).join(' '),
      }));
      const opsBlobs = events.map(e => ({
        id: e.id || e.event_id,
        title: e.type || e.name || e.resource || '',
        severity: e.severity || 'INFO',
        text: [e.type, e.name, e.resource, e.description, e.service, ...(e.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = tasks.map(task => {
        const taskFields = [
          task.name, task.title, task.description,
          task.status, task.priority,
          ...(task.tags || []),
        ].filter(Boolean);

        // KB match
        const matchedKb = kbBlobs.filter(kb =>
          taskFields.some(f => overlaps(f, kb.text))
        ).slice(0, 5);

        // Ops match
        const matchedOps = opsBlobs.filter(op =>
          taskFields.some(f => overlaps(f, op.text))
        ).slice(0, 5);

        const hasKb  = matchedKb.length > 0;
        const hasOps = matchedOps.length > 0;

        let cls;
        if (hasKb && hasOps) cls = 'FULLY_EXPOSED';
        else if (hasKb)      cls = 'KB_ONLY';
        else if (hasOps)     cls = 'OPS_ONLY';
        else                 cls = 'CLEAR';

        return { ...task, _class: cls, _kb: matchedKb, _ops: matchedOps };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // toggle event listener
  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:tkoem-toggle', handler);
    return () => window.removeEventListener('jarvis:tkoem-toggle', handler);
  }, []);

  // auto-refresh
  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const counts = {
    ALL:           rows.length,
    FULLY_EXPOSED: rows.filter(r => r._class === 'FULLY_EXPOSED').length,
    KB_ONLY:       rows.filter(r => r._class === 'KB_ONLY').length,
    OPS_ONLY:      rows.filter(r => r._class === 'OPS_ONLY').length,
    CLEAR:         rows.filter(r => r._class === 'CLEAR').length,
  };

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.title, r.description, r.status, r.priority]
      .filter(Boolean).some(v => v.toLowerCase().includes(q));
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.FULLY_EXPOSED} tasks fully exposed (KB + ops match), ${counts.KB_ONLY} KB-only, ${counts.OPS_ONLY} ops-only, ${counts.CLEAR} clear of both.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Task × Knowledge × Ops Event Mesh (TKOEM): ${summary} Provide a 2-sentence operational intelligence brief on which tasks warrant immediate attention and why.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8400, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #ff6b35',
          color: '#ff6b35', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ TKOEM
        {counts.FULLY_EXPOSED > 0 && (
          <span style={{
            background: '#ff4444', color: '#fff', borderRadius: 10,
            padding: '1px 6px', fontSize: 10, fontWeight: 700,
          }}>
            {counts.FULLY_EXPOSED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.93)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #1a0a00',
        background: 'rgba(10,5,0,0.9)',
      }}>
        <div>
          <span style={{ color: '#ff6b35', fontWeight: 700, fontSize: 16 }}>◈ TKOEM</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Task × Knowledge × Ops Event Intelligence Mesh
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(255,107,53,0.1)', border: '1px solid #ff6b35',
              color: '#ff6b35', padding: '4px 12px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            ⟳
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
        {Object.entries(counts).filter(([k]) => k !== 'ALL').map(([k, v]) => (
          <div
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${CLASS_COLOR[k]}44`,
              borderLeft: `3px solid ${CLASS_COLOR[k]}`,
              borderRadius: 6, padding: '8px 16px', minWidth: 140, cursor: 'pointer',
            }}
          >
            <div style={{ color: CLASS_COLOR[k], fontSize: 22, fontWeight: 700 }}>{v}</div>
            <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
          borderRadius: 6, padding: '8px 16px', minWidth: 110,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{counts.ALL}</div>
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL TASKS</div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(255,107,53,0.05)',
          border: '1px solid #ff6b3544', borderRadius: 6, padding: '8px 12px',
          color: '#ff6b35', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(255,107,53,0.2)' : 'transparent',
            border: `1px solid ${tab === t ? '#ff6b35' : '#333'}`,
            color: tab === t ? '#ff6b35' : '#666',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            {t} ({counts[t] ?? 0})
          </button>
        ))}
        <input
          placeholder="Search tasks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333', borderRadius: 4, color: '#e0e0e0',
            padding: '4px 10px', fontSize: 11, width: 220,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {loading && <div style={{ color: '#555', fontSize: 12, padding: 16 }}>⟳ Loading…</div>}
        {err && <div style={{ color: '#ff4444', fontSize: 12, padding: 16 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, padding: 16 }}>No tasks match.</div>
        )}
        {!loading && filtered.map((task, i) => {
          const tid = task.id || task.task_id || i;
          const isExp = expanded === tid;
          const col = CLASS_COLOR[task._class] || '#888';
          const sevBadge = (sev) => {
            const s = { CRITICAL: '#ff4444', HIGH: '#ff8800', MEDIUM: '#ffd700', WARNING: '#ff8800', ERROR: '#ff4444', INFO: '#00bfff' };
            return s[sev?.toUpperCase()] || '#888';
          };
          return (
            <div
              key={tid}
              onClick={() => setExpanded(isExp ? null : tid)}
              style={{ borderBottom: '1px solid #1a1a1a', padding: '8px 0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, minWidth: 120, fontWeight: 600 }}>
                  {task._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {task.name || task.title || task.description || `Task ${tid}`}
                </span>
                {task.priority && (
                  <span style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid #333',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#888',
                  }}>
                    {task.priority}
                  </span>
                )}
                {task.status && (
                  <span style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid #333',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#888',
                  }}>
                    {task.status}
                  </span>
                )}
                <span style={{ color: '#333', fontSize: 10 }}>▾</span>
              </div>

              {isExp && (
                <div style={{
                  marginTop: 6, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4, fontSize: 11,
                }}>
                  {task.description && (
                    <div style={{ color: '#888', marginBottom: 8 }}>{task.description}</div>
                  )}
                  {/* KB matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#ffd700', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      KB ARTICLES ({task._kb.length})
                    </div>
                    {task._kb.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No KB articles matched.</div>
                      : task._kb.map((kb, ki) => (
                        <div key={ki} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          <span style={{ color: '#ffd700', fontSize: 10, flex: 1 }}>{kb.title || kb.id}</span>
                        </div>
                      ))
                    }
                  </div>
                  {/* Ops matches */}
                  <div>
                    <div style={{ color: '#00bfff', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      OPS EVENTS ({task._ops.length})
                    </div>
                    {task._ops.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No ops events matched.</div>
                      : task._ops.map((op, oi) => (
                        <div key={oi} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          <span style={{
                            background: `${sevBadge(op.severity)}22`,
                            border: `1px solid ${sevBadge(op.severity)}`,
                            color: sevBadge(op.severity),
                            borderRadius: 3, padding: '1px 5px', fontSize: 9,
                          }}>
                            {op.severity || 'INFO'}
                          </span>
                          <span style={{ color: '#00bfff', fontSize: 10, flex: 1 }}>{op.title || op.type || op.id}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: '6px 20px', borderTop: '1px solid #1a1a1a',
        color: '#444', fontSize: 10, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>TKOEM — auto-refresh 90s · /entities/Task · /knowledge/ · /v1/ops/events</span>
        <span>{filtered.length} of {rows.length} shown</span>
      </div>
    </div>
  );
}

export function isTkoemQuery(q) {
  const lower = q.toLowerCase();
  return [
    'tkoem', 'task knowledge ops', 'task ops knowledge', 'task knowledge event',
    'task ops event', 'task kb ops', 'ops task knowledge', 'task event knowledge',
    'task mesh', 'task intelligence mesh', 'which tasks have ops', 'task coverage mesh',
    'knowledge ops task', 'task operational knowledge',
  ].some(kw => lower.includes(kw));
}

export function buildTkoemScript() {
  return 'Opening Task × Knowledge × Ops Event Intelligence Mesh…';
}
