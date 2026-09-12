import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const POLL_MS = 90_000;

const TIKVTRI_RE = /\b(tikvtri|task\s+investigation\s+knowledge|task\s+invest\s+knowledge|task\s+invest\s+kb|task\s+knowledge\s+investigation|ungrounded\s+task|grounded\s+task|task\s+triple\s+coverage|task\s+intel\s+investigation|task\s+case\s+knowledge|task\s+kb\s+invest)\b/i;

export function isTikvtriQuery(t) { return TIKVTRI_RE.test(t || ''); }

export async function buildTikvtriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [taskR, invR, kbR] = await Promise.allSettled([
      fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
    ]);

    const taskRaw = taskR.value ?? {};
    const tasks = Array.isArray(taskRaw) ? taskRaw : (taskRaw.tasks ?? taskRaw.data ?? taskRaw.results ?? []);
    const invRaw = invR.value ?? {};
    const investigations = Array.isArray(invRaw) ? invRaw : (invRaw.investigations ?? invRaw.data ?? invRaw.results ?? []);
    const kbRaw = kbR.value ?? {};
    const articles = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.data ?? kbRaw.results ?? kbRaw.items ?? []);

    const invText = investigations.map(i =>
      `${i.title ?? i.name ?? i.id ?? ''} ${i.description ?? ''} ${i.subject ?? ''} ${i.type ?? ''}`.toLowerCase()
    ).join(' ');
    const kbText = articles.map(a =>
      `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
    ).join(' ');

    let fullyGrounded = 0, investigated = 0, kbBacked = 0, ungrounded = 0;
    for (const t of tasks) {
      const text = `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.mission ?? ''} ${t.priority ?? ''} ${t.tags ?? ''}`.toLowerCase();
      const tokens = text.split(/\W+/).filter(tok => tok.length > 2);
      const hasInv = tokens.some(tok => invText.includes(tok));
      const hasKb  = tokens.some(tok => kbText.includes(tok));
      if (hasInv && hasKb) fullyGrounded++;
      else if (hasInv) investigated++;
      else if (hasKb) kbBacked++;
      else ungrounded++;
    }
    return `TIKVTRI Task × Investigation × Knowledge: ${tasks.length} tasks assessed against ` +
      `${investigations.length} open investigations and ${articles.length} knowledge articles. ` +
      `FULLY GROUNDED: ${fullyGrounded} (investigation open + KB article — task has both active case tracking and documented intelligence). ` +
      `INVESTIGATED: ${investigated} (active investigation found, no KB backing — tracked but undocumented). ` +
      `KB-BACKED: ${kbBacked} (KB article found, no investigation — documented but no active case). ` +
      `UNGROUNDED: ${ungrounded} (neither — task with no investigation or knowledge coverage — operational gap).`;
  } catch {
    return 'Task × Investigation × Knowledge assessment unavailable at this time, sir.';
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY GROUNDED': '#22c55e',
  'INVESTIGATED':   '#38bdf8',
  'KB-BACKED':      '#a78bfa',
  'UNGROUNDED':     '#f59e0b',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreMatch(tokens, corpus) {
  if (!corpus) return { score: 0, hits: [] };
  const hits = [];
  let score = 0;
  for (const tok of tokens) {
    if (corpus.includes(tok)) { score++; hits.push(tok); }
  }
  return { score, hits: [...new Set(hits)] };
}

function stateOf(task, invText, kbText) {
  const text = `${task.name ?? task.title ?? task.id ?? ''} ${task.description ?? ''} ${task.mission ?? ''} ${task.priority ?? ''} ${task.tags ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const hasInv = tokens.some(tok => invText.includes(tok));
  const hasKb  = tokens.some(tok => kbText.includes(tok));
  if (hasInv && hasKb) return 'FULLY GROUNDED';
  if (hasInv) return 'INVESTIGATED';
  if (hasKb) return 'KB-BACKED';
  return 'UNGROUNDED';
}

const TABS = ['ALL', 'FULLY GROUNDED', 'INVESTIGATED', 'KB-BACKED', 'UNGROUNDED'];

export default function TaskInvestigationKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [taskR, invR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      const tr = taskR.value ?? {};   setTasks(Array.isArray(tr) ? tr : (tr.tasks ?? tr.data ?? tr.results ?? []));
      const ir = invR.value ?? {};    setInvestigations(Array.isArray(ir) ? ir : (ir.investigations ?? ir.data ?? ir.results ?? []));
      const kr = kbR.value ?? {};     setArticles(Array.isArray(kr) ? kr : (kr.articles ?? kr.data ?? kr.results ?? kr.items ?? []));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tikvtri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tikvtri-toggle', onToggle);
  }, []);

  const invText = investigations.map(i =>
    `${i.title ?? i.name ?? i.id ?? ''} ${i.description ?? ''} ${i.subject ?? ''} ${i.type ?? ''}`.toLowerCase()
  ).join(' ');
  const kbText = articles.map(a =>
    `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
  ).join(' ');

  const rows = tasks.map(t => ({ ...t, _state: stateOf(t, invText, kbText) }));

  const counts = { 'FULLY GROUNDED': 0, 'INVESTIGATED': 0, 'KB-BACKED': 0, 'UNGROUNDED': 0 };
  rows.forEach(r => { counts[r._state] = (counts[r._state] || 0) + 1; });

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._state !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${r.name ?? r.title ?? ''} ${r.description ?? ''} ${r.mission ?? ''} ${r.priority ?? ''}`.toLowerCase();
      return text.includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief('');
    const script = await buildTikvtriScript();
    setBrief(script); setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      title="Task × Investigation × Knowledge (TIKVTRI)"
      style={{
        position: 'fixed', bottom: 8, left: 794960, zIndex: 448,
        background: 'rgba(5,8,13,0.82)', border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
        color: '#f59e0b', fontSize: 10, letterSpacing: 1, fontFamily: 'monospace',
        whiteSpace: 'nowrap',
      }}
    >
      ◈ TIKVTRI
    </button>
  );

  const total = rows.length;
  const fgPct = total ? (counts['FULLY GROUNDED'] / total) * 100 : 0;
  const ivPct = total ? (counts['INVESTIGATED']   / total) * 100 : 0;
  const kbPct = total ? (counts['KB-BACKED']      / total) * 100 : 0;

  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      width: 'min(820px,96vw)', zIndex: 448,
      background: 'rgba(5,10,18,0.97)', border: '1px solid rgba(245,158,11,0.3)',
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 0 60px rgba(245,158,11,0.10), 0 24px 48px rgba(0,0,0,0.8)',
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#f59e0b', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ TIKVTRI</span>
        <span style={{ color: '#6b7280', fontSize: 11, flex: 1 }}>Task × Investigation × Knowledge</span>
        {counts['UNGROUNDED'] > 0 && (
          <span style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: '#f59e0b' }}>
            {counts['UNGROUNDED']} UNGROUNDED
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 4, padding: '3px 8px', color: '#f59e0b', fontSize: 10, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
      </div>

      {/* Stats */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['Tasks', total], ['Investigations', investigations.length], ['KB Articles', articles.length],
          ['Fully Grounded', counts['FULLY GROUNDED']], ['Investigated', counts['INVESTIGATED']],
          ['KB-Backed', counts['KB-BACKED']], ['Ungrounded', counts['UNGROUNDED']]].map(([lbl, val]) => (
          <div key={lbl} style={TILE}>
            <div style={LABEL}>{lbl}</div>
            <div style={{ ...VAL, fontSize: 18 }}>{loading ? '…' : val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 16px 8px', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex' }}>
        <div style={{ width: `${fgPct}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${ivPct}%`, background: '#38bdf8', transition: 'width 0.4s' }} />
        <div style={{ width: `${kbPct}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ margin: '0 16px 8px', padding: '8px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, fontSize: 11, color: '#fde68a', lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Tabs + search */}
      <div style={{ padding: '6px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(245,158,11,0.15)' : 'transparent',
            border: tab === t ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '2px 8px', color: tab === t ? '#f59e0b' : '#6b7280',
            fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          }}>
            {t}{tab !== t && counts[t] !== undefined ? ` (${counts[t]})` : ''}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search tasks…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none', width: 160 }} />
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>no tasks found</div>
        )}
        {filtered.map((task, i) => {
          const label = task.name ?? task.title ?? task.id ?? `task-${i}`;
          const sc = STATE_COLOR[task._state] ?? '#6b7280';
          const isExp = expanded === i;
          const tokens = tokenize(`${label} ${task.description ?? ''} ${task.mission ?? ''} ${task.priority ?? ''}`);

          const matchedInv = isExp ? investigations.filter(inv => {
            const it = `${inv.title ?? inv.name ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.subject ?? ''}`.toLowerCase();
            return tokens.some(tok => it.includes(tok));
          }) : [];
          const matchedKb = isExp ? articles.filter(a => {
            const at = `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''}`.toLowerCase();
            return tokens.some(tok => at.includes(tok));
          }) : [];

          return (
            <div key={i}>
              <div onClick={() => setExpanded(isExp ? null : i)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: isExp ? 'rgba(245,158,11,0.05)' : 'transparent',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12 }}>{label}</span>
                {task.priority && (
                  <span style={{ fontSize: 9, color: '#6b7280', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '0 4px', letterSpacing: 1 }}>{task.priority}</span>
                )}
                {task.status && (
                  <span style={{ fontSize: 9, color: '#38bdf8', letterSpacing: 1 }}>{task.status}</span>
                )}
                <span style={{ fontSize: 10, color: sc, letterSpacing: 1, flexShrink: 0 }}>{task._state}</span>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* Investigations pane */}
                  <div style={{ padding: '8px 12px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: '#38bdf8', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Matched Investigations ({matchedInv.length})</div>
                    {matchedInv.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#4b5563' }}>no match</div>
                    ) : matchedInv.slice(0, 6).map((inv, j) => {
                      const it = `${inv.title ?? inv.name ?? inv.id ?? ''}`;
                      const { score } = scoreMatch(tokens, `${it} ${inv.description ?? ''}`.toLowerCase());
                      const pct = Math.min(100, score * 18);
                      return (
                        <div key={j} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: '#e2e8f0' }}>{it.slice(0, 36)}</span>
                            {inv.status && <span style={{ fontSize: 9, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 3, padding: '0 4px' }}>{inv.status}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Knowledge pane */}
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: '#a78bfa', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Matched KB Articles ({matchedKb.length})</div>
                    {matchedKb.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#4b5563' }}>no match</div>
                    ) : matchedKb.slice(0, 6).map((a, j) => {
                      const at = `${a.title ?? a.name ?? a.id ?? ''}`;
                      const { score } = scoreMatch(tokens, `${at} ${a.description ?? ''}`.toLowerCase());
                      const pct = Math.min(100, score * 18);
                      return (
                        <div key={j} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: '#e2e8f0' }}>{at.slice(0, 36)}</span>
                            {a.category && <span style={{ fontSize: 9, color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 3, padding: '0 4px' }}>{a.category}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
