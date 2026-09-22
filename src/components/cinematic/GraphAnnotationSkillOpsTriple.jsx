import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GASOE_RE = /\b(gasoe|graph\s+annotation\s+skill\s+ops|annotation\s+skill\s+ops|annotation\s+aip\s+ops|graph\s+annotation\s+aip\s+ops|annotation\s+ops\s+skill|annotation\s+operational|fully\s+operational\s+annotation|dark\s+annotation\s+ops|skill\s+backed\s+annotation|ops\s+triggered\s+annotation|annotation\s+ops\s+event\s+skill|annotation\s+skill\s+event|annotation\s+gap\s+ops)\b/i;

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

function normaliseAnnotations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.annotations) ? data.annotations
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(a => ({
    id: a.id || a._id || String(Math.random()),
    text: a.text || a.content || a.body || '',
    target_type: a.target_type || a.targetType || a.type || '',
    actor: a.actor || a.author || a.created_by || '',
    name: a.name || a.title || a.label || '',
    description: a.description || a.summary || '',
    category: a.category || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    raw: a,
  }));
}

function normaliseSkills(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.skills) ? data.skills
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Skill',
    category: s.category || s.type || s.kind || '',
    description: s.description || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || String(Math.random()),
    name: e.name || e.title || e.event_type || e.type || 'Unnamed Event',
    severity: e.severity || e.level || e.priority || '',
    description: e.description || e.summary || e.message || '',
    category: e.category || e.kind || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function correlate(annotations, skills, opsEvents) {
  return annotations.map(annotation => {
    const toks = tok([
      annotation.text, annotation.target_type, annotation.actor,
      annotation.name, annotation.description, annotation.category, annotation.tags,
    ].join(' '));

    const matchedSkills = skills
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.category),
          matchScore(toks, s.description),
          matchScore(toks, s.tags),
        );
        return { ...s, score };
      })
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedOps = opsEvents
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.description),
          matchScore(toks, e.category),
          matchScore(toks, e.tags),
        );
        return { ...e, score };
      })
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasSkill = matchedSkills.length > 0;
    const hasOps = matchedOps.length > 0;

    let state;
    if (hasSkill && hasOps) state = 'FULLY OPERATIONAL';
    else if (hasSkill) state = 'SKILL-BACKED';
    else if (hasOps) state = 'OPS-TRIGGERED';
    else state = 'DARK';

    return { annotation, matchedSkills, matchedOps, state };
  });
}

export function isGasoeQuery(t) {
  return GASOE_RE.test(t || '');
}

export async function buildGasoeScript() {
  try {
    const [aRes, sRes, oRes] = await Promise.allSettled([
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : null),
    ]);
    const annotations = normaliseAnnotations(aRes.status === 'fulfilled' ? aRes.value : null);
    const skills = normaliseSkills(sRes.status === 'fulfilled' ? sRes.value : null);
    const opsEvents = normaliseOpsEvents(oRes.status === 'fulfilled' ? oRes.value : null);
    const rows = correlate(annotations, skills, opsEvents);
    const fullyOp = rows.filter(r => r.state === 'FULLY OPERATIONAL').length;
    const skillBacked = rows.filter(r => r.state === 'SKILL-BACKED').length;
    const opsTriggered = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    return `GASOE GraphAnnotation×AIPSkill×OpsEvent: ${rows.length} annotations analysed. ` +
      `${fullyOp} FULLY OPERATIONAL (skill+ops), ` +
      `${skillBacked} SKILL-BACKED (skill only), ${opsTriggered} OPS-TRIGGERED (ops only), ${dark} DARK (neither — operational blind spot). ` +
      (dark > 0 ? `${dark} annotations have no skill or ops coverage — operational gap requiring attention.` :
        fullyOp > 0 ? `Top fully operational: ${rows.find(r => r.state === 'FULLY OPERATIONAL')?.annotation.name || rows.find(r => r.state === 'FULLY OPERATIONAL')?.annotation.text?.slice(0, 40) || 'see panel'}.` :
        'No fully operational annotations at this time.');
  } catch {
    return 'GASOE: data fetch failed.';
  }
}

export default function GraphAnnotationSkillOpsTriple() {
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
    window.addEventListener('jarvis:gasoe-toggle', handler);
    return () => window.removeEventListener('jarvis:gasoe-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [aRes, sRes, oRes] = await Promise.allSettled([
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const annotations = normaliseAnnotations(aRes.status === 'fulfilled' ? aRes.value : null);
      const skills = normaliseSkills(sRes.status === 'fulfilled' ? sRes.value : null);
      const opsEvents = normaliseOpsEvents(oRes.status === 'fulfilled' ? oRes.value : null);
      if (!annotations.length && !skills.length && !opsEvents.length) {
        setErr('No data returned from Graph Annotations, AIP Skill, or Ops Events endpoints.');
      }
      setRows(correlate(annotations, skills, opsEvents));
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

  const fullyOp = rows.filter(r => r.state === 'FULLY OPERATIONAL').length;
  const skillBacked = rows.filter(r => r.state === 'SKILL-BACKED').length;
  const opsTriggered = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY OPERATIONAL', 'SKILL-BACKED', 'OPS-TRIGGERED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const a = r.annotation;
      return (a.text || '').toLowerCase().includes(q) ||
        (a.name || '').toLowerCase().includes(q) ||
        (a.target_type || '').toLowerCase().includes(q) ||
        (a.actor || '').toLowerCase().includes(q) ||
        r.matchedSkills.some(s => s.name.toLowerCase().includes(q)) ||
        r.matchedOps.some(e => e.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const barWidths = total > 0 ? {
    fullyOp: (fullyOp / total) * 100,
    skillBacked: (skillBacked / total) * 100,
    opsTriggered: (opsTriggered / total) * 100,
    dark: (dark / total) * 100,
  } : { fullyOp: 0, skillBacked: 0, opsTriggered: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const a = row.annotation;
    const label = a.name || a.text?.slice(0, 60) || 'Unnamed annotation';
    const prompt = `Graph annotation "${label}" [${row.state}]: ` +
      `Target type: ${a.target_type || 'unknown'}. Actor: ${a.actor || 'unknown'}. ` +
      `Matched AIP skills: ${row.matchedSkills.map(s => s.name).join(', ') || 'none'}. ` +
      `Matched ops events: ${row.matchedOps.map(e => e.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence annotation skill and ops event coverage brief.`;
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
    'FULLY OPERATIONAL': '#00ff88',
    'SKILL-BACKED': '#a78bfa',
    'OPS-TRIGGERED': '#fb923c',
    'DARK': '#ef4444',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 812320,
          bottom: 8,
          zIndex: 479,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #ef444444',
          color: '#fb923c',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ GASOE
        {dark > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ef4444',
            color: '#fff',
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
      width: 700,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #fb923c55',
      borderRadius: 8,
      zIndex: 479,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #fb923c22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #fb923c22',
        background: 'rgba(251,146,60,0.05)',
      }}>
        <span style={{ color: '#fb923c', fontWeight: 700, letterSpacing: 1 }}>
          ◈ GRAPH ANNOTATION × AIP SKILL × OPS EVENT
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
              border: '1px solid #fb923c44',
              color: '#fb923c',
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
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #fb923c11' }}>
        {[
          { label: 'FULLY OPERATIONAL', val: fullyOp, col: '#00ff88' },
          { label: 'SKILL-BACKED', val: skillBacked, col: '#a78bfa' },
          { label: 'OPS-TRIGGERED', val: opsTriggered, col: '#fb923c' },
          { label: 'DARK', val: dark, col: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(251,146,60,0.04)',
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
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #fb923c11' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#0a0014' }}>
            <div style={{ width: `${barWidths.fullyOp}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${barWidths.skillBacked}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
            <div style={{ width: `${barWidths.opsTriggered}%`, background: '#fb923c', transition: 'width 0.4s' }} />
            <div style={{ width: `${barWidths.dark}%`, background: '#ef4444', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ FULLY OP</span>
            <span style={{ color: '#a78bfa' }}>■ SKILL-BACKED</span>
            <span style={{ color: '#fb923c' }}>■ OPS-TRIGGERED</span>
            <span style={{ color: '#ef4444' }}>■ DARK</span>
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
              background: filter === t ? '#fb923c22' : 'none',
              border: `1px solid ${filter === t ? '#fb923c' : '#fb923c33'}`,
              color: filter === t ? '#fb923c' : '#556',
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
            background: 'rgba(251,146,60,0.05)',
            border: '1px solid #fb923c33',
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
            No matching annotations.
          </div>
        )}
        {visible.map((row) => {
          const a = row.annotation;
          const isExp = expanded === a.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          const label = a.name || a.text?.slice(0, 60) || 'Unnamed annotation';
          return (
            <div
              key={a.id}
              style={{
                borderBottom: '1px solid #fb923c0d',
                background: isExp ? 'rgba(251,146,60,0.03)' : 'transparent',
              }}
            >
              <div
                onClick={() => setExpanded(isExp ? null : a.id)}
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
                  {label}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {a.target_type && (
                  <span style={{ color: '#fb923c', fontSize: 9, marginLeft: 4 }}>
                    {a.target_type}
                  </span>
                )}
                {a.actor && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    {a.actor}
                  </span>
                )}
                <span style={{ color: '#fb923c44', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {a.text && a.text !== label && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8, fontStyle: 'italic' }}>
                      {a.text.slice(0, 200)}{a.text.length > 200 ? '…' : ''}
                    </div>
                  )}
                  {a.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {a.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched AIP skills */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#a78bfa', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        AIP SKILLS ({row.matchedSkills.length})
                      </div>
                      {row.matchedSkills.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No skills matched.</div>
                      )}
                      {row.matchedSkills.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#d8c8ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{s.name}</span>
                            <span style={{ color: '#a78bfa', fontSize: 10 }}>{(s.score * 100).toFixed(0)}%</span>
                          </div>
                          {s.category && (
                            <div style={{ color: '#556', fontSize: 10 }}>{s.category}</div>
                          )}
                          <div style={{ height: 3, background: '#06060e', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(s.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #a78bfa, #6d28d9)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched ops events */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#fb923c', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        OPS EVENTS ({row.matchedOps.length})
                      </div>
                      {row.matchedOps.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No ops events matched.</div>
                      )}
                      {row.matchedOps.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffd8b0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{e.name}</span>
                            <span style={{ color: '#fb923c', fontSize: 10 }}>{(e.score * 100).toFixed(0)}%</span>
                          </div>
                          {e.severity && (
                            <div style={{ color: '#ef4444', fontSize: 10 }}>{e.severity}</div>
                          )}
                          <div style={{ height: 3, background: '#0a0008', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(e.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #fb923c, #ea580c)',
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
                      background: 'rgba(251,146,60,0.08)',
                      border: '1px solid #fb923c55',
                      color: '#fb923c',
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
