/**
 * F267 — Task × Knowledge × Report Bridge (TKRB)
 *
 * Answers: "Which JARVIS tasks are backed by both a knowledge-base article
 * AND a report (FULL_COVERAGE), which have only one, and which are completely
 * undocumented (DARK — highest-priority documentation gap)?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Task   → live mission tasks
 *   GET /knowledge/      → knowledge-base articles
 *   GET /v1/reports      → report catalog
 *
 * Classification:
 *   FULL_COVERAGE  — task has BOTH a KB article AND a report
 *   KB_ONLY        — KB article matched but no report
 *   REPORT_ONLY    — report matched but no KB article
 *   DARK           — neither (documentation gap)
 *
 * Stat tiles:  tasks / KB articles / reports / dark
 * Amber badge: dark count on button.
 * Expand row:  matched KB articles + matched reports with relevance bars.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TKRB  at left:5760 bottom:18, zIndex:68.
 * Event:   jarvis:tkrb-toggle
 * Voice:   "task knowledge report / task kb / task documentation / tkrb /
 *           undocumented tasks / task report coverage / task coverage triple /
 *           task knowledge gap / task report gap"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const TKRB_RE =
  /\b(task[._-]?knowledge[._-]?report|task[._-]?kb|task[._-]?documentation|tkrb|undocumented[._-]?task(?:s)?|task[._-]?report[._-]?coverage|task[._-]?coverage[._-]?triple|task[._-]?knowledge[._-]?gap|task[._-]?report[._-]?gap)\b/i;

export function isTkrbQuery(t) {
  return TKRB_RE.test(t || '');
}

export async function buildTkrbScript() {
  const [taskR, kbR, repR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const tasks = normTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const articles = normArticles(kbR.status === 'fulfilled' ? kbR.value : []);
  const reports = normReports(repR.status === 'fulfilled' ? repR.value : []);
  const enriched = enrich(tasks, articles, reports);
  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  return (
    `Task × Knowledge × Report: ${tasks.length} tasks, ${articles.length} KB articles, ${reports.length} reports. ` +
    `${full} tasks are fully documented (KB-backed + reported); ${dark} are DARK (no KB article, no report — highest documentation gap). ` +
    `Top undocumented tasks: ${enriched.filter(r => r._class === 'DARK').slice(0, 3).map(r => r.title || r.name || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────

function normTasks(raw) {
  if (!raw) return [];
  for (const k of ['tasks', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normArticles(raw) {
  if (!raw) return [];
  for (const k of ['articles', 'items', 'results', 'data', 'entries']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normReports(raw) {
  if (!raw) return [];
  for (const k of ['reports', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── token helpers ────────────────────────────────────────────────────────────

function toks(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function taskToks(task) {
  return new Set([
    ...toks(task.title),
    ...toks(task.name),
    ...toks(task.description),
    ...toks(task.objective),
    ...toks(task.type),
    ...(Array.isArray(task.tags) ? task.tags.flatMap(toks) : toks(task.tags)),
  ]);
}

function kbScore(task, art) {
  const tt = taskToks(task);
  const at = new Set([
    ...toks(art.title),
    ...toks(art.content),
    ...toks(art.topic),
    ...toks(art.summary),
    ...(Array.isArray(art.tags) ? art.tags.flatMap(toks) : toks(art.tags)),
  ]);
  if (!tt.size || !at.size) return 0;
  let hits = 0;
  for (const t of tt) if (at.has(t)) hits++;
  return hits / Math.max(tt.size, at.size);
}

function reportScore(task, rep) {
  const tt = taskToks(task);
  const rt = new Set([
    ...toks(rep.title),
    ...toks(rep.name),
    ...toks(rep.description),
    ...toks(rep.summary),
    ...toks(rep.type),
    ...toks(rep.topic),
    ...(Array.isArray(rep.tags) ? rep.tags.flatMap(toks) : toks(rep.tags)),
  ]);
  if (!tt.size || !rt.size) return 0;
  let hits = 0;
  for (const t of tt) if (rt.has(t)) hits++;
  return hits / Math.max(tt.size, rt.size);
}

// ─── enrichment ──────────────────────────────────────────────────────────────

function enrich(tasks, articles, reports) {
  return tasks.map(task => {
    const kbMatches = articles
      .map(a => ({ art: a, score: kbScore(task, a) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const repMatches = reports
      .map(r => ({ rep: r, score: reportScore(task, r) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasKb = kbMatches.length > 0;
    const hasReport = repMatches.length > 0;
    const _class =
      hasKb && hasReport
        ? 'FULL_COVERAGE'
        : hasKb
        ? 'KB_ONLY'
        : hasReport
        ? 'REPORT_ONLY'
        : 'DARK';
    return { ...task, _class, _kbMatches: kbMatches, _repMatches: repMatches };
  });
}

// ─── constants ────────────────────────────────────────────────────────────────

const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const OR = '#F97316';
const MU = '#6E8AA0';
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const CLASS_COLOR = {
  FULL_COVERAGE: GR,
  KB_ONLY: CY,
  REPORT_ONLY: OR,
  DARK: AM,
};

const FILTERS = ['ALL', 'FULL_COVERAGE', 'KB_ONLY', 'REPORT_ONLY', 'DARK'];

// ─── component ───────────────────────────────────────────────────────────────

export default function TaskKnowledgeReportBridge() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [articleCount, setArticleCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [enriched, setEnriched] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [taskR, kbR, repR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/reports`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const tk = normTasks(taskR.status === 'fulfilled' ? taskR.value : []);
      const arts = normArticles(kbR.status === 'fulfilled' ? kbR.value : []);
      const reps = normReports(repR.status === 'fulfilled' ? repR.value : []);
      setTasks(tk);
      setArticleCount(arts.length);
      setReportCount(reps.length);
      setEnriched(enrich(tk, arts, reps));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:tkrb-toggle', toggle);
    return () => window.removeEventListener('jarvis:tkrb-toggle', toggle);
  }, []);

  useEffect(() => {
    if (open) { load(); }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setAssessText('');
    const ctx = buildSummaryCtx(enriched, tasks.length, articleCount, reportCount);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Provide a concise 2-sentence intelligence assessment of this JARVIS task × knowledge × report coverage data:\n${ctx}` }),
      });
      const j = await r.json();
      const txt = j?.response || j?.message || j?.text || 'No assessment available.';
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessText('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const visible = enriched.filter(task => {
    if (filter !== 'ALL' && task._class !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${task.title || ''} ${task.name || ''} ${task.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  const kbOnly = enriched.filter(r => r._class === 'KB_ONLY').length;
  const repOnly = enriched.filter(r => r._class === 'REPORT_ONLY').length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Knowledge × Report Bridge (TKRB)"
        style={{
          position: 'fixed', left: 5760, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.72)', border: `1px solid ${AM}`,
          color: AM, fontFamily: MONO, fontSize: 10, padding: '3px 7px',
          borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        ◈ TKRB
        {dark > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: '50%',
            width: 16, height: 16, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 9, fontWeight: 700,
          }}>
            {dark > 99 ? '99+' : dark}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 60, right: 18, width: 580, maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(5,8,14,0.97)', border: `1px solid ${AM}`,
      borderRadius: 8, zIndex: 200, display: 'flex', flexDirection: 'column',
      fontFamily: MONO, color: '#E2E8F0', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: `1px solid rgba(245,158,11,0.25)`,
        background: 'rgba(245,158,11,0.06)',
      }}>
        <span style={{ fontSize: 11, color: AM, letterSpacing: 2 }}>
          ◈ TASK × KNOWLEDGE × REPORT (TKRB)
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ background: 'none', border: `1px solid ${MU}`, color: MU, borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>
            {loading ? '...' : '↺'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: MU, fontSize: 14, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px', borderBottom: `1px solid rgba(245,158,11,0.15)` }}>
        {[
          { label: 'TASKS', val: tasks.length, c: CY },
          { label: 'KB ARTICLES', val: articleCount, c: '#94A3B8' },
          { label: 'REPORTS', val: reportCount, c: OR },
          { label: 'DARK', val: dark, c: AM },
        ].map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.c }}>{t.val}</div>
            <div style={{ fontSize: 8, color: MU, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* coverage summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '8px 14px', borderBottom: `1px solid rgba(245,158,11,0.12)` }}>
        {[
          { label: 'FULL', val: full, c: GR },
          { label: 'KB ONLY', val: kbOnly, c: CY },
          { label: 'RPT ONLY', val: repOnly, c: OR },
          { label: 'DARK', val: dark, c: AM },
        ].map(t => (
          <div key={t.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: 12, color: t.c, fontWeight: 700 }}>{t.val}</div>
            <div style={{ fontSize: 7, color: MU, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* filters + search */}
      <div style={{ padding: '8px 14px', borderBottom: `1px solid rgba(245,158,11,0.12)`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? AM : 'rgba(255,255,255,0.05)',
                color: filter === f ? '#000' : '#94A3B8',
                border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 9,
                cursor: 'pointer', letterSpacing: 0.5,
              }}>
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{
            background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(245,158,11,0.2)`,
            color: '#E2E8F0', borderRadius: 3, padding: '4px 8px', fontSize: 10, width: '100%',
            boxSizing: 'border-box', outline: 'none', fontFamily: MONO,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {err && <div style={{ color: '#EF4444', fontSize: 10, marginBottom: 8 }}>{err}</div>}
        {visible.length === 0 && !loading && (
          <div style={{ color: MU, fontSize: 10, textAlign: 'center', paddingTop: 20 }}>No tasks match.</div>
        )}
        {visible.map((task, i) => {
          const id = task.id || task._id || i;
          const isExp = expanded[id];
          const cc = CLASS_COLOR[task._class] || MU;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '7px 10px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  borderLeft: `3px solid ${cc}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {task.title || task.name || `Task ${id}`}
                  </div>
                  {(task.status || task.priority) && (
                    <div style={{ fontSize: 8.5, color: MU, marginTop: 1 }}>
                      {task.status && <span style={{ marginRight: 6 }}>{task.status}</span>}
                      {task.priority && <span style={{ color: OR }}>{task.priority}</span>}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 8, color: cc, background: `${cc}22`, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                  {task._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: MU, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 5px 5px', padding: '8px 10px', borderLeft: `3px solid ${cc}` }}>
                  {/* KB matches */}
                  <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4 }}>KB ARTICLES ({task._kbMatches.length})</div>
                  {task._kbMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU, marginBottom: 6 }}>No KB articles matched.</div>
                    : task._kbMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.art.title || m.art.topic || '(untitled)'}
                          </span>
                          <span style={{ color: CY }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                  {/* Report matches */}
                  <div style={{ fontSize: 8, color: OR, letterSpacing: 1, marginBottom: 4, marginTop: 8 }}>REPORTS ({task._repMatches.length})</div>
                  {task._repMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU }}>No reports matched.</div>
                    : task._repMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.rep.title || m.rep.name || '(untitled)'}
                            {m.rep.type && <span style={{ color: OR, marginLeft: 4, fontSize: 7.5 }}>[{m.rep.type}]</span>}
                          </span>
                          <span style={{ color: OR }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: OR, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess */}
      <div style={{ padding: '8px 14px', borderTop: `1px solid rgba(245,158,11,0.2)` }}>
        <button onClick={assess} disabled={assessing}
          style={{
            background: assessing ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.18)',
            border: `1px solid ${AM}`, color: AM, borderRadius: 4, padding: '4px 12px',
            fontSize: 10, cursor: 'pointer', letterSpacing: 1, width: '100%',
          }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <div style={{ fontSize: 9.5, color: '#CBD5E1', marginTop: 8, lineHeight: 1.5, background: 'rgba(245,158,11,0.05)', borderRadius: 4, padding: '6px 8px' }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildSummaryCtx(enriched, taskCount, artCount, repCount) {
  const dark = enriched.filter(r => r._class === 'DARK');
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE');
  return [
    `Total tasks: ${taskCount}, KB articles: ${artCount}, reports: ${repCount}.`,
    `Full coverage: ${full.length}, KB-only: ${enriched.filter(r => r._class === 'KB_ONLY').length}, report-only: ${enriched.filter(r => r._class === 'REPORT_ONLY').length}, dark: ${dark.length}.`,
    `Top dark tasks: ${dark.slice(0, 5).map(r => r.title || r.name || '?').join('; ')}.`,
    `Top fully-covered tasks: ${full.slice(0, 3).map(r => r.title || r.name || '?').join('; ')}.`,
  ].join(' ');
}
