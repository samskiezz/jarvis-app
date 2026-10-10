import { useState, useEffect, useCallback } from 'react';

const API = '';

const TKRPTRI_RE = /\b(tkrptri|task[._\s-]?knowl\w*[._\s-]?report|task[._\s-]?intel[._\s-]?complet\w*|fully[._\s-]?backed[._\s-]?task|unbacked[._\s-]?task|task[._\s-]?report[._\s-]?knowl\w*|task[._\s-]?kb[._\s-]?report)\b/i;

export function isTkrptriQuery(t) { return TKRPTRI_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map(t => ({
    id: t.id || t._id || String(Math.random()),
    title: t.title || t.name || t.label || 'Untitled Task',
    description: t.description || t.summary || t.body || '',
    status: t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    tags: Array.isArray(t.tags) ? t.tags : [],
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map(a => ({
    id: a.id || a._id || String(Math.random()),
    title: a.title || a.name || a.heading || 'Untitled Article',
    content: a.content || a.body || a.text || a.summary || '',
    category: a.category || a.type || '',
    tags: Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : raw?.reports || raw?.items || raw?.results || raw?.data || [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    title: r.title || r.name || r.label || '',
    type: r.type || r.kind || '',
    tags: Array.isArray(r.tags) ? r.tags : [],
    description: r.description || r.summary || '',
  }));
}

function matchScore(taskToks, fields) {
  if (!taskToks.length) return 0;
  const pool = tok(fields.join(' '));
  if (!pool.length) return 0;
  const hits = taskToks.filter(t => pool.includes(t)).length;
  return hits / Math.max(taskToks.length, pool.length);
}

const SCORE_THRESHOLD = 0.12;

function correlate(tasks, articles, reports) {
  return tasks.map(task => {
    const taskToks = tok([task.title, task.description, ...task.tags].join(' '));

    const bestKb = articles.reduce((best, a) => {
      const s = matchScore(taskToks, [a.title, a.content.slice(0, 400), a.category, ...a.tags]);
      return s > best.score ? { score: s, item: a } : best;
    }, { score: 0, item: null });

    const bestRp = reports.reduce((best, r) => {
      const s = matchScore(taskToks, [r.title, r.description, ...r.tags]);
      return s > best.score ? { score: s, item: r } : best;
    }, { score: 0, item: null });

    const hasKb = bestKb.score >= SCORE_THRESHOLD;
    const hasRp = bestRp.score >= SCORE_THRESHOLD;

    let coverage, color;
    if (hasKb && hasRp) {
      coverage = 'FULLY BACKED';
      color = '#22c55e';
    } else if (hasRp) {
      coverage = 'REPORT-BACKED';
      color = '#00d4ff';
    } else if (hasKb) {
      coverage = 'KB-BACKED';
      color = '#f59e0b';
    } else {
      coverage = 'UNBACKED';
      color = '#ef4444';
    }

    return { task, coverage, color, kb: hasKb ? bestKb.item : null, report: hasRp ? bestRp.item : null, kbScore: bestKb.score, rpScore: bestRp.score };
  });
}

export async function buildTkrptriScript() {
  try {
    const [tkR, kbR, rpR] = await Promise.allSettled([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
    ]);
    const tasks = normaliseTasks(tkR.status === 'fulfilled' && tkR.value ? tkR.value : []);
    const articles = normaliseArticles(kbR.status === 'fulfilled' && kbR.value ? kbR.value : []);
    const reports = normaliseReports(rpR.status === 'fulfilled' && rpR.value ? rpR.value : null);
    const rows = correlate(tasks, articles, reports);
    const counts = { 'FULLY BACKED': 0, 'REPORT-BACKED': 0, 'KB-BACKED': 0, 'UNBACKED': 0 };
    rows.forEach(r => { counts[r.coverage] = (counts[r.coverage] || 0) + 1; });
    const lines = [
      `Task × Knowledge × Report Triple Coverage (TKRPTRI)`,
      `${tasks.length} tasks | ${articles.length} KB articles | ${reports.length} reports`,
      `FULLY BACKED: ${counts['FULLY BACKED']} | REPORT-BACKED: ${counts['REPORT-BACKED']} | KB-BACKED: ${counts['KB-BACKED']} | UNBACKED: ${counts['UNBACKED']}`,
    ];
    const unbacked = rows.filter(r => r.coverage === 'UNBACKED').slice(0, 5);
    if (unbacked.length) {
      lines.push(`Top unbacked: ${unbacked.map(r => r.task.title || r.task.id).join(', ')}`);
    }
    return lines.join('\n');
  } catch {
    return 'TKRPTRI: data unavailable';
  }
}

const CY = '#00d4ff';
const AM = '#f59e0b';
const GR = '#22c55e';
const RD = '#ef4444';
const DIM = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(0,212,255,0.18)';

export default function TaskKnowledgeReportTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ 'FULLY BACKED': 0, 'REPORT-BACKED': 0, 'KB-BACKED': 0, 'UNBACKED': 0 });
  const [totals, setTotals] = useState({ tasks: 0, kb: 0, rp: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [assessed, setAssessed] = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [tkR, kbR, rpR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      ]);
      const tasks = normaliseTasks(tkR.status === 'fulfilled' && tkR.value ? tkR.value : []);
      const articles = normaliseArticles(kbR.status === 'fulfilled' && kbR.value ? kbR.value : []);
      const reports = normaliseReports(rpR.status === 'fulfilled' && rpR.value ? rpR.value : null);
      const correlated = correlate(tasks, articles, reports);
      setRows(correlated);
      setTotals({ tasks: tasks.length, kb: articles.length, rp: reports.length });
      const c = { 'FULLY BACKED': 0, 'REPORT-BACKED': 0, 'KB-BACKED': 0, 'UNBACKED': 0 };
      correlated.forEach(r => { c[r.coverage] = (c[r.coverage] || 0) + 1; });
      setCounts(c);
    } catch (e) {
      setErr(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:tkrptri-toggle', handler);
    return () => window.removeEventListener('jarvis:tkrptri-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessed('');
    try {
      const script = await buildTkrptriScript();
      const resp = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Analyse this task intelligence coverage report and identify the highest-priority unbacked tasks missing knowledge base and report coverage:\n\n${script}` }),
      });
      const data = await resp.json();
      const text = data.response || data.message || data.content || JSON.stringify(data);
      setAssessed(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessed(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = filter === 'ALL' ? rows : rows.filter(r => r.coverage === filter);
  const pct = totals.tasks > 0 ? Math.round((counts['FULLY BACKED'] / totals.tasks) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 752400,
          bottom: 8,
          zIndex: 372,
          background: 'rgba(0,0,0,0.85)',
          border: `1px solid ${RD}`,
          color: RD,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          padding: '3px 7px',
          cursor: 'pointer',
          letterSpacing: 1,
          borderRadius: 2,
        }}
      >
        ◈ TKRPTRI {counts['UNBACKED'] > 0 ? `[${counts['UNBACKED']}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      right: 16,
      top: 16,
      width: 760,
      maxHeight: 680,
      background: DIM,
      border: `1px solid ${BORDER}`,
      borderRadius: 6,
      zIndex: 9900,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10,
      color: CY,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <span style={{ color: RD, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ TKRPTRI</span>
        <span style={{ color: 'rgba(0,212,255,0.5)', flex: 1 }}>Task × Knowledge × Report Triple Coverage</span>
        <span style={{ color: 'rgba(0,212,255,0.5)', fontSize: 9 }}>
          {totals.tasks}tsk / {totals.kb}kb / {totals.rp}rp
        </span>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: 'none', border: `1px solid ${AM}`, color: AM, fontFamily: 'inherit', fontSize: 9, padding: '2px 6px', cursor: 'pointer', borderRadius: 2 }}
        >
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: CY, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', padding: '0 4px' }}
        >
          ×
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { key: 'ALL', label: `ALL (${totals.tasks})`, color: CY },
          { key: 'FULLY BACKED', label: `FULLY BACKED (${counts['FULLY BACKED']})`, color: GR },
          { key: 'REPORT-BACKED', label: `REPORT-BACKED (${counts['REPORT-BACKED']})`, color: CY },
          { key: 'KB-BACKED', label: `KB-BACKED (${counts['KB-BACKED']})`, color: AM },
          { key: 'UNBACKED', label: `UNBACKED (${counts['UNBACKED']})`, color: RD },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? `${f.color}22` : 'none',
              border: `1px solid ${filter === f.key ? f.color : 'rgba(0,212,255,0.2)'}`,
              color: f.color,
              fontFamily: 'inherit',
              fontSize: 9,
              padding: '2px 6px',
              cursor: 'pointer',
              borderRadius: 2,
              letterSpacing: 1,
            }}
          >
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: GR, fontSize: 9, alignSelf: 'center' }}>
          {pct}% fully backed
        </span>
      </div>

      {loading && (
        <div style={{ padding: '10px 12px', color: 'rgba(0,212,255,0.5)', flexShrink: 0 }}>◌ loading…</div>
      )}
      {err && (
        <div style={{ padding: '6px 12px', color: RD, flexShrink: 0 }}>✕ {err}</div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {visible.length === 0 && !loading && (
          <div style={{ padding: '16px 12px', color: 'rgba(0,212,255,0.3)' }}>
            {totals.tasks === 0 ? 'No tasks found.' : 'No items match filter.'}
          </div>
        )}
        {visible.map((row, i) => (
          <div
            key={row.task.id + i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px',
              gap: 6,
              padding: '5px 12px',
              borderBottom: 'rgba(0,212,255,0.06) solid 1px',
            }}
          >
            <div>
              <div style={{ color: row.color, fontWeight: 600, fontSize: 10, marginBottom: 2 }}>
                {row.task.title}
                {row.task.status ? <span style={{ color: 'rgba(0,212,255,0.4)', marginLeft: 6, fontSize: 9 }}>[{row.task.status}]</span> : null}
                {row.task.priority ? <span style={{ color: AM, marginLeft: 4, fontSize: 8 }}>P:{row.task.priority}</span> : null}
              </div>
              <div style={{ color: 'rgba(0,212,255,0.45)', fontSize: 9, lineHeight: 1.4 }}>
                {row.kb && <span style={{ color: AM, marginRight: 8 }}>KB: {row.kb.title}</span>}
                {row.report && <span style={{ color: CY }}>RP: {row.report.title}</span>}
                {!row.kb && !row.report && <span style={{ color: 'rgba(255,255,255,0.2)' }}>no knowledge or report linkage</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right', paddingTop: 2 }}>
              <span style={{
                display: 'inline-block',
                background: `${row.color}1a`,
                border: `1px solid ${row.color}44`,
                color: row.color,
                borderRadius: 2,
                padding: '1px 5px',
                fontSize: 8,
                letterSpacing: 1,
              }}>
                {row.coverage}
              </span>
              <div style={{ color: 'rgba(0,212,255,0.3)', fontSize: 8, marginTop: 2 }}>
                kb:{(row.kbScore * 100).toFixed(0)}% rp:{(row.rpScore * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {assessed && (
        <div style={{
          borderTop: `1px solid ${BORDER}`,
          padding: '8px 12px',
          color: 'rgba(0,212,255,0.7)',
          fontSize: 9,
          maxHeight: 120,
          overflowY: 'auto',
          flexShrink: 0,
          whiteSpace: 'pre-wrap',
        }}>
          {assessed}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${BORDER}`, padding: '4px 12px', display: 'flex', gap: 12, flexShrink: 0 }}>
        <span style={{ color: 'rgba(0,212,255,0.3)', fontSize: 8 }}>/entities/Task × /knowledge/ × /v1/reports</span>
        <span style={{ color: 'rgba(0,212,255,0.3)', fontSize: 8, marginLeft: 'auto' }}>auto-refresh 90s</span>
      </div>
    </div>
  );
}
