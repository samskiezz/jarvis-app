import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_READY', 'DUAL_READY', 'SINGLE_LINKED', 'UNREADY'];

const CLASS_COLOR = {
  FULLY_READY:   '#22c55e',
  DUAL_READY:    '#00bfff',
  SINGLE_LINKED: '#ffd700',
  UNREADY:       '#ff4444',
};

const PULSE_STYLE = `
@keyframes tskmon-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

export default function TaskScenarioKnowledgeOpsNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tkRes, scRes, kbRes, alRes] = await Promise.all([
        fetch(`${API}/entities/Task?limit=200`),
        fetch(`${API}/v1/scenario/list`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/v1/ops/alerts?status=open&limit=200`),
      ]);
      const tkData = tkRes.ok ? await tkRes.json() : {};
      const scData = scRes.ok ? await scRes.json() : {};
      const kbData = kbRes.ok ? await kbRes.json() : {};
      const alData = alRes.ok ? await alRes.json() : {};

      const tasks    = tkData.tasks    || tkData.items || tkData.data || [];
      const scenarios = scData.scenarios || scData.items || scData.data || [];
      const articles  = kbData.articles  || kbData.items || kbData.data || [];
      const alerts    = alData.alerts    || alData.items || alData.data || [];

      const scBlobs = scenarios.map(s => ({
        id:   s.id || s.scenario_id,
        name: s.name || s.title || '',
        type: s.type || s.category || '',
        text: [s.name, s.title, s.description, s.type, s.category,
               ...(s.tags || [])].filter(Boolean).join(' '),
      }));

      const kbBlobs = articles.map(a => ({
        id:    a.id || a.article_id,
        title: a.title || a.name || '',
        topic: a.topic || a.category || '',
        text:  [a.title, a.name, a.topic, a.summary, a.category, a.content,
                ...(a.tags || [])].filter(Boolean).join(' '),
      }));

      const alBlobs = alerts.map(a => ({
        id:       a.id || a.alert_id,
        title:    a.title || a.message || '',
        severity: a.severity || '',
        type:     a.type || a.category || '',
        text:     [a.title, a.message, a.type, a.category, a.severity, a.source,
                   ...(a.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = tasks.map(task => {
        const tToks = [
          task.name, task.title, task.description, task.priority,
          task.status, task.type, task.category,
          ...(task.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedSc = scBlobs.filter(s => overlaps(tToks, s.text)).slice(0, 4);
        const matchedKb = kbBlobs.filter(a => overlaps(tToks, a.text)).slice(0, 4);
        const matchedAl = alBlobs.filter(a => overlaps(tToks, a.text)).slice(0, 4);

        const hasSc = matchedSc.length > 0;
        const hasKb = matchedKb.length > 0;
        const hasAl = matchedAl.length > 0;
        const matchCount = [hasSc, hasKb, hasAl].filter(Boolean).length;

        let cls;
        if (matchCount === 3)     cls = 'FULLY_READY';
        else if (matchCount === 2) cls = 'DUAL_READY';
        else if (matchCount === 1) cls = 'SINGLE_LINKED';
        else                       cls = 'UNREADY';

        return { ...task, _class: cls, _sc: matchedSc, _kb: matchedKb, _al: matchedAl };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:tskmon-toggle', handler);
    return () => window.removeEventListener('jarvis:tskmon-toggle', handler);
  }, []);

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
    FULLY_READY:   rows.filter(r => r._class === 'FULLY_READY').length,
    DUAL_READY:    rows.filter(r => r._class === 'DUAL_READY').length,
    SINGLE_LINKED: rows.filter(r => r._class === 'SINGLE_LINKED').length,
    UNREADY:       rows.filter(r => r._class === 'UNREADY').length,
  };

  const covPct = counts.ALL > 0
    ? Math.round(((counts.FULLY_READY + counts.DUAL_READY) / counts.ALL) * 100)
    : 0;

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.title, r.description, r.priority, r.status, r.type]
      .filter(Boolean).some(v => v.toLowerCase().includes(q));
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.ALL} tasks total — ${counts.FULLY_READY} fully ready (scenario+KB+alert), ${counts.DUAL_READY} dual-ready, ${counts.SINGLE_LINKED} single-linked, ${counts.UNREADY} unready (no mission context). Coverage: ${covPct}%.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Task Mission Readiness Nexus (TSKMON): ${summary} Provide a 2-sentence operational brief on which unready tasks pose the highest mission risk and what scenario, knowledge, or alert coverage should be prioritised.`,
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

  const PRI_COLOR = { CRITICAL: '#ff4444', HIGH: '#ff8c00', MEDIUM: '#ffd700', LOW: '#22c55e' };
  const barColor = covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444';

  if (!open) {
    return (
      <>
        <style>{PULSE_STYLE}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', left: 1114080, bottom: 8, zIndex: 705,
            background: 'rgba(0,0,0,0.85)', border: '1px solid #22c55e',
            color: '#22c55e', padding: '6px 14px', borderRadius: 6,
            fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ◈ TSKMON
          {counts.UNREADY > 0 && (
            <span style={{
              background: '#ff4444', color: '#fff', borderRadius: 10,
              padding: '1px 6px', fontSize: 10, fontWeight: 700,
              animation: 'tskmon-pulse 2s infinite',
            }}>
              {counts.UNREADY}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.93)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      <style>{PULSE_STYLE}</style>

      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #001a00',
        background: 'rgba(0,5,0,0.9)',
      }}>
        <div>
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 16 }}>◈ TSKMON</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Task × Scenario × Knowledge × Ops Alert Mission Readiness Nexus
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e',
              color: '#22c55e', padding: '4px 12px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '⟳ Assessing…' : '▶ ASSESS READINESS'}
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
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          ['FULLY_READY',   counts.FULLY_READY],
          ['DUAL_READY',    counts.DUAL_READY],
          ['SINGLE_LINKED', counts.SINGLE_LINKED],
          ['UNREADY',       counts.UNREADY],
        ].map(([k, v]) => (
          <div
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${CLASS_COLOR[k]}44`,
              borderLeft: `3px solid ${CLASS_COLOR[k]}`,
              borderRadius: 6, padding: '8px 16px', minWidth: 160, cursor: 'pointer',
            }}
          >
            <div style={{ color: CLASS_COLOR[k], fontSize: 22, fontWeight: 700 }}>{v}</div>
            <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
          borderRadius: 6, padding: '8px 16px', minWidth: 120,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{counts.ALL}</div>
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL TASKS</div>
        </div>
        {/* coverage bar */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ color: '#777', fontSize: 10, marginBottom: 4 }}>READY COVERAGE {covPct}%</div>
          <div style={{ background: '#111', borderRadius: 3, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${covPct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(34,197,94,0.05)',
          border: '1px solid #22c55e44', borderRadius: 6, padding: '8px 12px',
          color: '#86efac', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,197,94,0.15)' : 'transparent',
            border: `1px solid ${tab === t ? '#22c55e' : '#333'}`,
            color: tab === t ? '#22c55e' : '#666',
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
          const pri = (task.priority || '').toUpperCase();
          const priCol = PRI_COLOR[pri] || '#888';
          const isUnready = task._class === 'UNREADY';
          return (
            <div
              key={tid}
              onClick={() => setExpanded(isExp ? null : tid)}
              style={{
                borderBottom: '1px solid #1a1a1a', padding: '8px 0', cursor: 'pointer',
                animation: isUnready ? 'tskmon-pulse 2.5s infinite' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, minWidth: 130, fontWeight: 600 }}>
                  {task._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {task.name || task.title || `Task ${tid}`}
                </span>
                {pri && (
                  <span style={{
                    background: `${priCol}22`, border: `1px solid ${priCol}`,
                    color: priCol, borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700,
                  }}>
                    {pri}
                  </span>
                )}
                {task.status && (
                  <span style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
                    borderRadius: 3, padding: '1px 6px', fontSize: 9, color: '#777',
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
                    <div style={{ color: '#666', marginBottom: 8 }}>{task.description}</div>
                  )}

                  {/* Scenario matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#ffd700', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      SCENARIOS ({task._sc.length})
                    </div>
                    {task._sc.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No scenarios matched.</div>
                      : task._sc.map((s, si) => (
                        <div key={si} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {s.type && (
                            <span style={{
                              background: '#ffd70022', border: '1px solid #ffd700',
                              color: '#ffd700', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {s.type}
                            </span>
                          )}
                          <span style={{ color: '#ffd700', fontSize: 10, flex: 1 }}>{s.name || s.id}</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* KB matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#a855f7', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      KNOWLEDGE ARTICLES ({task._kb.length})
                    </div>
                    {task._kb.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No KB articles matched.</div>
                      : task._kb.map((a, ai) => (
                        <div key={ai} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {a.topic && (
                            <span style={{
                              background: '#a855f722', border: '1px solid #a855f7',
                              color: '#a855f7', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {a.topic}
                            </span>
                          )}
                          <span style={{ color: '#a855f7', fontSize: 10, flex: 1 }}>{a.title || a.id}</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* Alert matches */}
                  <div>
                    <div style={{ color: '#ff8c00', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      OPS ALERTS ({task._al.length})
                    </div>
                    {task._al.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No ops alerts matched.</div>
                      : task._al.map((a, ai) => (
                        <div key={ai} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {a.severity && (
                            <span style={{
                              background: '#ff8c0022', border: '1px solid #ff8c00',
                              color: '#ff8c00', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {a.severity}
                            </span>
                          )}
                          <span style={{ color: '#ff8c00', fontSize: 10, flex: 1 }}>{a.title || a.id}</span>
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
        <span>TSKMON — auto-refresh 90s · /entities/Task · /v1/scenario/list · /knowledge/ · /v1/ops/alerts</span>
        <span>{filtered.length} of {rows.length} shown</span>
      </div>
    </div>
  );
}

export function isTskmonQuery(q) {
  const lower = q.toLowerCase();
  return [
    'tskmon', 'task mission', 'mission readiness', 'task readiness',
    'task scenario knowledge', 'unready task', 'task ops alert',
    'task mission nexus', 'task mission context', 'mission ready task',
    'tasks without scenario', 'tasks without knowledge', 'task coverage gap',
    'task readiness nexus', 'task mission coverage', 'tskmon nexus',
  ].some(kw => lower.includes(kw));
}

export function buildTskmonScript() {
  return 'Opening Task Mission Readiness Nexus — correlating tasks against scenarios, knowledge, and ops alerts.';
}
