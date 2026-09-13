import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJOEKB_RE = /\b(sjoekb|swarm\s+job\s+ops\s+knowledge|swarm\s+ops\s+knowledge|swarm\s+job\s+knowledge\s+ops|swarm\s+knowledge\s+ops|swarm\s+ops\s+kb|swarm\s+job\s+ops\s+kb|swarm\s+knowledge\s+event|swarm\s+ops\s+event\s+knowledge|dormant\s+swarm|swarm\s+dormant|swarm\s+operational\s+knowledge|swarm\s+ops\s+event\s+kb|swarm\s+job\s+ops\s+event\s+knowledge|swarm\s+kb\s+ops)\b/i;

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

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.jobs) ? data.jobs
    : Array.isArray(data.swarm_jobs) ? data.swarm_jobs
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(j => ({
    id: j.id || j._id || j.jobId || String(Math.random()),
    name: j.name || j.title || j.label || 'Unnamed Job',
    type: j.type || j.kind || j.job_type || '',
    objective: j.objective || j.goal || j.purpose || '',
    description: j.description || j.desc || j.summary || '',
    status: j.status || j.state || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || ''),
    raw: j,
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.ops_events) ? data.ops_events
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || String(Math.random()),
    name: e.name || e.title || e.label || e.event_type || 'Unnamed Event',
    severity: e.severity || e.level || e.priority || '',
    category: e.category || e.type || e.kind || '',
    description: e.description || e.summary || e.detail || '',
    source: e.source || e.origin || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function normaliseKnowledge(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.articles) ? data.articles
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : [];
  return arr.map(k => ({
    id: k.id || k._id || String(Math.random()),
    title: k.title || k.name || k.label || 'Untitled Article',
    category: k.category || k.type || k.kind || '',
    summary: k.summary || k.description || k.abstract || k.content || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : String(k.tags || ''),
    raw: k,
  }));
}

function correlate(jobs, opsEvents, kbArticles) {
  return jobs.map(job => {
    const toks = tok([job.name, job.type, job.objective, job.description, job.tags].join(' '));

    const matchedOps = opsEvents
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.category),
          matchScore(toks, e.description),
          matchScore(toks, e.source),
          matchScore(toks, e.tags),
        );
        return { ...e, score };
      })
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedKb = kbArticles
      .map(k => {
        const score = Math.max(
          matchScore(toks, k.title),
          matchScore(toks, k.category),
          matchScore(toks, k.summary),
          matchScore(toks, k.tags),
        );
        return { ...k, score };
      })
      .filter(k => k.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasOps = matchedOps.length > 0;
    const hasKb = matchedKb.length > 0;

    let state;
    if (hasOps && hasKb) state = 'FULLY ACTIVATED';
    else if (hasOps) state = 'OPS-TRIGGERED';
    else if (hasKb) state = 'KB-BACKED';
    else state = 'DORMANT';

    return { job, matchedOps, matchedKb, state };
  });
}

export function isSjoekbQuery(t) {
  return SJOEKB_RE.test(t || '');
}

export async function buildSjoekbScript() {
  try {
    const [sjRes, oeRes, kbRes] = await Promise.allSettled([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
    ]);
    const jobs = normaliseSwarmJobs(sjRes.status === 'fulfilled' ? sjRes.value : null);
    const opsEvents = normaliseOpsEvents(oeRes.status === 'fulfilled' ? oeRes.value : null);
    const kbArticles = normaliseKnowledge(kbRes.status === 'fulfilled' ? kbRes.value : null);
    const rows = correlate(jobs, opsEvents, kbArticles);
    const fully = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
    const opsTriggered = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
    const kbBacked = rows.filter(r => r.state === 'KB-BACKED').length;
    const dormant = rows.filter(r => r.state === 'DORMANT').length;
    return `SJOEKB SwarmJob×OpsEvent×Knowledge: ${rows.length} swarm jobs analysed. ` +
      `${fully} FULLY ACTIVATED (ops event + KB article), ` +
      `${opsTriggered} OPS-TRIGGERED (live event, no KB), ${kbBacked} KB-BACKED (knowledge, no trigger), ${dormant} DORMANT. ` +
      (dormant > 0 ? `${dormant} swarm jobs have no ops event or knowledge coverage — operational vacuum.` :
        fully > 0 ? `Top activated: ${rows.find(r => r.state === 'FULLY ACTIVATED')?.job.name || 'see panel'}.` :
        'No fully activated swarm jobs at this time.');
  } catch {
    return 'SJOEKB: data fetch failed.';
  }
}

export default function SwarmJobOpsKnowledgeTriple() {
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
    window.addEventListener('jarvis:sjoekb-toggle', handler);
    return () => window.removeEventListener('jarvis:sjoekb-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sjRes, oeRes, kbRes] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const jobs = normaliseSwarmJobs(sjRes.status === 'fulfilled' ? sjRes.value : null);
      const opsEvents = normaliseOpsEvents(oeRes.status === 'fulfilled' ? oeRes.value : null);
      const kbArticles = normaliseKnowledge(kbRes.status === 'fulfilled' ? kbRes.value : null);
      if (!jobs.length && !opsEvents.length && !kbArticles.length) {
        setErr('No data returned from SwarmJob, Ops Events, or Knowledge endpoints.');
      }
      setRows(correlate(jobs, opsEvents, kbArticles));
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

  const fully = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
  const opsTriggered = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
  const kbBacked = rows.filter(r => r.state === 'KB-BACKED').length;
  const dormant = rows.filter(r => r.state === 'DORMANT').length;

  const TABS = ['ALL', 'FULLY ACTIVATED', 'OPS-TRIGGERED', 'KB-BACKED', 'DORMANT'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.job.name.toLowerCase().includes(q) ||
        r.job.description.toLowerCase().includes(q) ||
        r.matchedOps.some(e => e.name.toLowerCase().includes(q)) ||
        r.matchedKb.some(k => k.title.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const coverageBar = total > 0 ? {
    fully: (fully / total) * 100,
    opsTriggered: (opsTriggered / total) * 100,
    kbBacked: (kbBacked / total) * 100,
    dormant: (dormant / total) * 100,
  } : { fully: 0, opsTriggered: 0, kbBacked: 0, dormant: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `SwarmJob "${row.job.name}" [${row.state}]: ` +
      `ops events: ${row.matchedOps.map(e => e.name).join(', ') || 'none'}. ` +
      `knowledge articles: ${row.matchedKb.map(k => k.title).join(', ') || 'none'}. ` +
      `Type: ${row.job.type || 'unknown'}. Status: ${row.job.status || 'unknown'}. ` +
      `Give a 2-sentence swarm job operational event and knowledge coverage brief.`;
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
    'FULLY ACTIVATED': '#00ff88',
    'OPS-TRIGGERED': '#ff6b35',
    'KB-BACKED': '#a78bfa',
    'DORMANT': '#555',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 813440,
          bottom: 8,
          zIndex: 481,
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
        ◈ SJOEKB
        {dormant > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#dc2626',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {dormant}
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
      zIndex: 481,
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
          ◈ SWARM JOB × OPS EVENT × KNOWLEDGE
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
          { label: 'FULLY ACTIVATED', val: fully, col: '#00ff88' },
          { label: 'OPS-TRIGGERED', val: opsTriggered, col: '#ff6b35' },
          { label: 'KB-BACKED', val: kbBacked, col: '#a78bfa' },
          { label: 'DORMANT', val: dormant, col: '#555' },
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
            <div style={{ width: `${coverageBar.fully}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBar.opsTriggered}%`, background: '#ff6b35', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBar.kbBacked}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
            <div style={{ width: `${coverageBar.dormant}%`, background: '#333', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ ACTIVATED</span>
            <span style={{ color: '#ff6b35' }}>■ OPS-TRIGGERED</span>
            <span style={{ color: '#a78bfa' }}>■ KB-BACKED</span>
            <span style={{ color: '#444' }}>■ DORMANT</span>
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
            No matching swarm jobs.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.job.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.job.id}
              style={{
                borderBottom: '1px solid #00ff880d',
                background: isExp ? 'rgba(0,255,136,0.03)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.job.id)}
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
                  {row.job.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.job.type && (
                  <span style={{ color: '#a78bfa', fontSize: 9, marginLeft: 4 }}>
                    {row.job.type}
                  </span>
                )}
                {row.job.status && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    [{row.job.status}]
                  </span>
                )}
                <span style={{ color: '#00ff8844', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.job.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.job.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched ops events */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ff6b35', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        OPS EVENTS ({row.matchedOps.length})
                      </div>
                      {row.matchedOps.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No ops events matched.</div>
                      )}
                      {row.matchedOps.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffc8a0', fontWeight: 600 }}>{e.name}</span>
                            <span style={{ color: '#ff6b35', fontSize: 10 }}>{(e.score * 100).toFixed(0)}%</span>
                          </div>
                          {e.severity && (
                            <span style={{
                              display: 'inline-block',
                              background: e.severity.toLowerCase() === 'critical' ? '#ff000033' : '#ff6b3522',
                              color: e.severity.toLowerCase() === 'critical' ? '#ff4444' : '#ff6b35',
                              borderRadius: 3,
                              padding: '1px 5px',
                              fontSize: 9,
                              marginTop: 2,
                            }}>
                              {e.severity}
                            </span>
                          )}
                          <div style={{ height: 3, background: '#2a0a00', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(e.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #ff6b35, #cc4400)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched KB articles */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#a78bfa', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        KNOWLEDGE ARTICLES ({row.matchedKb.length})
                      </div>
                      {row.matchedKb.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No KB articles matched.</div>
                      )}
                      {row.matchedKb.slice(0, 5).map(k => (
                        <div key={k.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ddd6fe', fontWeight: 600 }}>{k.title}</span>
                            <span style={{ color: '#a78bfa', fontSize: 10 }}>{(k.score * 100).toFixed(0)}%</span>
                          </div>
                          {k.category && (
                            <span style={{
                              display: 'inline-block',
                              background: '#a78bfa22',
                              color: '#a78bfa',
                              borderRadius: 3,
                              padding: '1px 5px',
                              fontSize: 9,
                              marginTop: 2,
                            }}>
                              {k.category}
                            </span>
                          )}
                          <div style={{ height: 3, background: '#1a0a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(k.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #a78bfa, #7c3aed)',
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
