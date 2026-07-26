import { useState, useEffect, useCallback } from 'react';

const API = '';
const TINV_RE = /\b(task[._-]?investigation|investigation[._-]?task|tinv|linked[._-]?tasks|tasks[._-]?with[._-]?cases|task[._-]?case[._-]?link|investigation[._-]?coverage[._-]?tasks|tasks[._-]?with[._-]?investigations|tasks[._-]?linked[._-]?to[._-]?cases|task[._-]?case[._-]?gap)\b/i;

export function isTinvQuery(t) {
  return TINV_RE.test(t || '');
}

export async function buildTinvScript() {
  const [tR, iR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);
  const tasks = normaliseArray(tR.status === 'fulfilled' ? tR.value : []);
  const invs = normaliseArray(iR.status === 'fulfilled' ? iR.value : []);
  const enriched = correlate(tasks, invs);
  const linked = enriched.filter(t => t._linked).length;
  const unlinked = enriched.filter(t => !t._linked).length;
  const topUnlinked = enriched.filter(t => !t._linked).slice(0, 4).map(t => t.title || t.name || t.id || '?').join(', ') || 'none';
  return (
    `Task × Investigation: ${tasks.length} tasks, ${invs.length} investigations indexed. ` +
    `${linked} tasks are LINKED (connected to investigations); ${unlinked} are UNLINKED (no investigative context). ` +
    `Top unlinked: ${topUnlinked}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'tasks', 'investigations', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(task, inv) {
  const taskToks = new Set([
    ...tokens(task.title),
    ...tokens(task.name),
    ...tokens(task.description),
    ...tokens(task.type),
    ...tokens(task.status),
    ...tokens(task.assignee),
  ].filter(Boolean));
  const invToks = [
    ...tokens(inv.title),
    ...tokens(inv.name),
    ...tokens(inv.description),
    ...tokens(inv.kind),
    ...tokens(inv.subject),
  ].filter(Boolean);
  if (!taskToks.size || !invToks.length) return 0;
  let hits = 0;
  for (const t of invToks) if (taskToks.has(t)) hits++;
  return hits / Math.max(taskToks.size, invToks.length);
}

function correlate(tasks, invs) {
  return tasks.map(task => {
    const scored = invs
      .map(inv => ({ inv, score: matchScore(task, inv) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...task, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const ACCENT = '#06B6D4';

export default function TaskInvestigationCorrelator() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [invs, setInvs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [tR, iR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);
      setTasks(normaliseArray(tR.status === 'fulfilled' ? tR.value : []));
      setInvs(normaliseArray(iR.status === 'fulfilled' ? iR.value : []));
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
    const id = open ? setInterval(load, 90000) : null;
    return () => { if (id) clearInterval(id); };
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:tinv-toggle', h);
    return () => window.removeEventListener('jarvis:tinv-toggle', h);
  }, []);

  const enriched = correlate(tasks, invs);
  const linked = enriched.filter(t => t._linked).length;
  const unlinked = enriched.filter(t => !t._linked).length;

  const filtered = enriched.filter(t => {
    if (tab === 'LINKED' && !t._linked) return false;
    if (tab === 'UNLINKED' && t._linked) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${t.title || ''} ${t.name || ''} ${t.description || ''} ${t.type || ''} ${t.status || ''}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const badgeCount = unlinked;
  const badgeCol = unlinked > 0 ? '#F59E0B' : '#22C55E';

  async function doAssess() {
    setAssessing(true); setAssessText('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `Task × Investigation Coverage: ${tasks.length} tasks, ${invs.length} investigations. ${linked} linked, ${unlinked} unlinked. Top unlinked: ${enriched.filter(t => !t._linked).slice(0, 4).map(t => t.title || t.name || t.id || '?').join(', ') || 'none'}. Give a 2-sentence task investigation coverage brief.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.result || JSON.stringify(d);
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessText(`Error: ${e.message}`);
    }
    setAssessing(false);
  }

  return (
    <>
      {/* dock button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Task × Investigation Correlator (TINV)"
        style={{
          position: 'fixed',
          left: 552480,
          bottom: 8,
          zIndex: 214,
          background: open ? ACCENT : '#1e293b',
          border: `1px solid ${ACCENT}`,
          borderRadius: 6,
          color: open ? '#04060A' : '#e2e8f0',
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        ◈ TINV
        {badgeCount > 0 && (
          <span style={{ background: badgeCol, color: '#000', borderRadius: 8, fontSize: 10, padding: '0 5px', fontWeight: 800 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 48,
          width: PANEL_W,
          height: PANEL_H,
          background: 'rgba(10,15,30,0.97)',
          border: `1px solid ${ACCENT}`,
          borderRadius: 12,
          zIndex: 9200,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 0 40px rgba(6,182,212,0.20)`,
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ACCENT, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>◈ TASK × INVESTIGATION</span>
            <span style={{ flex: 1 }} />
            {loading && <span style={{ color: '#64748b', fontSize: 11 }}>loading…</span>}
            <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #0f172a' }}>
            {[
              { label: 'TASKS', val: tasks.length, col: ACCENT },
              { label: 'INVESTIGATIONS', val: invs.length, col: '#8B5CF6' },
              { label: 'LINKED', val: linked, col: '#22C55E' },
              { label: 'UNLINKED', val: unlinked, col: '#F59E0B' },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 800 }}>{val}</div>
                <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter row */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 16px', borderBottom: '1px solid #0f172a', alignItems: 'center' }}>
            {['ALL', 'LINKED', 'UNLINKED'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? ACCENT : '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: tab === t ? '#04060A' : '#94a3b8',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', fontSize: 11, padding: '3px 8px',
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {err && <div style={{ color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
            {!err && filtered.length === 0 && !loading && (
              <div style={{ color: '#475569', fontSize: 12, marginTop: 24, textAlign: 'center' }}>No tasks match.</div>
            )}
            {filtered.map((task, i) => {
              const key = task.id || task._id || i;
              const isRow = expanded === key;
              const label = task.title || task.name || task.id || '?';
              const isLinked = task._linked;
              return (
                <div key={key} style={{ background: '#0f172a', borderRadius: 6, border: `1px solid ${isLinked ? '#164e63' : '#78350f'}`, overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpanded(isRow ? null : key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
                  >
                    <span style={{
                      background: isLinked ? '#0c4a6e' : '#451a03',
                      color: isLinked ? ACCENT : '#F59E0B',
                      borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '2px 6px', letterSpacing: 1,
                    }}>
                      {isLinked ? 'LINKED' : 'UNLINKED'}
                    </span>
                    {task.status && (
                      <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 4, fontSize: 9, padding: '1px 5px', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.status}
                      </span>
                    )}
                    {task.type && (
                      <span style={{ background: '#1e293b', color: '#64748b', borderRadius: 4, fontSize: 9, padding: '1px 5px', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.type}
                      </span>
                    )}
                    <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ color: '#334155', fontSize: 11 }}>{isRow ? '▲' : '▼'}</span>
                  </div>

                  {isRow && (
                    <div style={{ borderTop: '1px solid #1e293b', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {task.description && (
                        <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>
                          {String(task.description).slice(0, 200)}
                        </div>
                      )}
                      {task.assignee && (
                        <div style={{ color: '#64748b', fontSize: 10 }}>Assignee: {task.assignee}</div>
                      )}
                      {task._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#64748b', fontSize: 10, letterSpacing: 1 }}>MATCHED INVESTIGATIONS</div>
                          {task._matches.map(({ inv, score }, si) => {
                            const seedCount = (inv.seeds || []).length;
                            const annotCount = (inv.annotations || []).length;
                            return (
                              <div key={inv.id || inv._id || si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  background: '#1e1b4b',
                                  color: '#8B5CF6',
                                  borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                                }}>
                                  INV
                                </span>
                                {seedCount > 0 && (
                                  <span style={{ color: '#64748b', fontSize: 9 }}>{seedCount}s</span>
                                )}
                                {annotCount > 0 && (
                                  <span style={{ color: '#64748b', fontSize: 9 }}>{annotCount}a</span>
                                )}
                                <span style={{ color: '#cbd5e1', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {inv.title || inv.name || inv.id || '?'}
                                </span>
                                <div style={{ width: 60, background: '#1e293b', borderRadius: 2, height: 4 }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, background: ACCENT, height: 4, borderRadius: 2 }} />
                                </div>
                                <span style={{ color: '#475569', fontSize: 10, width: 28, textAlign: 'right' }}>
                                  {Math.round(score * 100)}%
                                </span>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: '#F59E0B', fontSize: 11 }}>No matching investigations found for this task.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
            {assessText && (
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessText}</div>
            )}
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: assessing ? '#1e293b' : ACCENT,
                border: 'none', borderRadius: 6, color: assessing ? '#94a3b8' : '#04060A',
                fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
