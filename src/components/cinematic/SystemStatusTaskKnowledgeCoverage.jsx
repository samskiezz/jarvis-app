/**
 * F229: System Status × Task × Knowledge Triple Coverage (SSTKN)
 *
 * Parallel-fetches /v1/jarvis/system/status × /entities/Task × /knowledge/,
 * then keyword-correlates each live service against tasks and KB articles to
 * surface FULLY COVERED (task + KB) | TASKED (task, no KB) | DOCUMENTED (KB,
 * no task) | EXPOSED (neither — coverage gap).
 *
 * Real endpoints:
 *   GET /v1/jarvis/system/status   — live service health
 *   GET /entities/Task             — operational tasks
 *   GET /knowledge/                — KB articles
 *   POST /v1/jarvis/agent/chat     — ASSESS brief
 *
 * Voice triggers: "sstkn" / "system task knowledge" / "service task knowledge" /
 *   "service coverage" / "service kb task" / "unprotected service" /
 *   "system coverage triple" / "system knowledge task" / "service knowledge gap"
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const API     = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY ?? 'dev-key';
const hdr     = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

const PANEL_W = 760;
const PANEL_H = 660;

const CY  = '#00CFFF';
const GR  = '#22C55E';
const AM  = '#F59E0B';
const RD  = '#EF4444';
const LM  = '#84CC16';
const DIM = 'rgba(0,0,0,0.82)';
const BDR = 'rgba(0,207,255,0.18)';

const THRESHOLD = 0.1;

const SSTKN_RE = /\b(sstkn|system[._\s-]?task[._\s-]?knowl\w*|service[._\s-]?task[._\s-]?knowl\w*|service[._\s-]?coverage|service[._\s-]?kb[._\s-]?task|unprotected[._\s-]?service|system[._\s-]?coverage[._\s-]?triple|system[._\s-]?knowl\w*[._\s-]?task|service[._\s-]?knowl\w*[._\s-]?gap)\b/i;

export function isSstknQuery(t) { return SSTKN_RE.test(t || ''); }

// ── helpers ───────────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, bFields) {
  if (!aToks.length) return 0;
  const pool = tokens(bFields.join(' '));
  if (!pool.length) return 0;
  const hits = aToks.filter(t => pool.includes(t)).length;
  return hits / Math.max(aToks.length, pool.length);
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normaliseServices(raw) {
  if (!raw) return [];
  const services = raw.services ?? raw.components ?? raw.checks ?? raw.modules ?? raw.items ?? [];
  if (Array.isArray(services) && services.length > 0) {
    return services.map((s, i) => ({
      id:     String(s.id ?? s.name ?? i),
      name:   String(s.name ?? s.service ?? s.component ?? `Service ${i + 1}`),
      status: String(s.status ?? s.health ?? s.state ?? '').toLowerCase(),
      detail: String(s.message ?? s.detail ?? s.error ?? '').slice(0, 200),
    }));
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.keys(raw)
      .filter(k => {
        const v = raw[k];
        return typeof v === 'string' || (typeof v === 'object' && v !== null);
      })
      .map(k => {
        const v = raw[k];
        const status = typeof v === 'string' ? v : String(v?.status ?? v?.health ?? '');
        const detail = typeof v === 'object' ? String(v?.message ?? v?.detail ?? '').slice(0, 200) : '';
        return { id: k, name: k, status, detail };
      });
  }
  return [];
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items ?? raw?.data ?? raw?.results ?? (typeof raw === 'object' && raw ? Object.values(raw) : []);
  return arr.map(t => ({
    id:    String(t.id ?? t._id ?? Math.random()),
    title: String(t.title ?? t.name ?? t.label ?? 'Untitled Task'),
    desc:  String(t.description ?? t.summary ?? t.body ?? ''),
    tags:  Array.isArray(t.tags) ? t.tags : [],
  }));
}

function normaliseKb(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.articles ?? raw?.items ?? raw?.data ?? raw?.results ?? (typeof raw === 'object' && raw ? Object.values(raw) : []);
  return arr.map(a => ({
    id:       String(a.id ?? a._id ?? Math.random()),
    title:    String(a.title ?? a.name ?? a.heading ?? 'Untitled Article'),
    content:  String(a.content ?? a.body ?? a.text ?? a.summary ?? '').slice(0, 400),
    category: String(a.category ?? a.type ?? ''),
    tags:     Array.isArray(a.tags) ? a.tags : [],
  }));
}

// ── correlation ───────────────────────────────────────────────────────────────

function correlate(services, tasks, kb) {
  return services.map(svc => {
    const sToks = tokens([svc.name, svc.detail].join(' '));

    const bestTask = tasks.reduce((best, t) => {
      const s = matchScore(sToks, [t.title, t.desc, ...t.tags]);
      return s > best.score ? { score: s, item: t } : best;
    }, { score: 0, item: null });

    const bestKb = kb.reduce((best, a) => {
      const s = matchScore(sToks, [a.title, a.content, a.category, ...a.tags]);
      return s > best.score ? { score: s, item: a } : best;
    }, { score: 0, item: null });

    const hasTask = bestTask.score >= THRESHOLD;
    const hasKb   = bestKb.score >= THRESHOLD;

    let coverage, color;
    if (hasTask && hasKb) {
      coverage = 'FULLY COVERED'; color = GR;
    } else if (hasTask) {
      coverage = 'TASKED';        color = LM;
    } else if (hasKb) {
      coverage = 'DOCUMENTED';    color = AM;
    } else {
      coverage = 'EXPOSED';       color = RD;
    }

    return { svc, coverage, color, task: hasTask ? bestTask.item : null, article: hasKb ? bestKb.item : null, taskScore: bestTask.score, kbScore: bestKb.score };
  });
}

// ── script builder ─────────────────────────────────────────────────────────────

export async function buildSstknScript() {
  try {
    const [svcR, tkR, kbR] = await Promise.allSettled([
      fetch(`${API}/v1/jarvis/system/status`,  { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Task`,            { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`,               { headers: hdr }).then(r => r.ok ? r.json() : null),
    ]);
    const services = normaliseServices(svcR.status === 'fulfilled' ? svcR.value : null);
    const tasks    = normaliseTasks(tkR.status === 'fulfilled' ? tkR.value : null);
    const kb       = normaliseKb(kbR.status === 'fulfilled' ? kbR.value : null);
    const rows     = correlate(services, tasks, kb);
    const counts   = { 'FULLY COVERED': 0, 'TASKED': 0, 'DOCUMENTED': 0, 'EXPOSED': 0 };
    rows.forEach(r => { counts[r.coverage] = (counts[r.coverage] || 0) + 1; });
    const lines = [
      'System Status × Task × Knowledge Triple Coverage (SSTKN)',
      `${services.length} services | ${tasks.length} tasks | ${kb.length} KB articles`,
      `FULLY COVERED: ${counts['FULLY COVERED']} | TASKED: ${counts['TASKED']} | DOCUMENTED: ${counts['DOCUMENTED']} | EXPOSED: ${counts['EXPOSED']}`,
    ];
    const exposed = rows.filter(r => r.coverage === 'EXPOSED').slice(0, 5);
    if (exposed.length) {
      lines.push(`Exposed gaps: ${exposed.map(r => r.svc.name).join(', ')}`);
    }
    return lines.join('\n');
  } catch {
    return 'SSTKN: data unavailable';
  }
}

// ── component ──────────────────────────────────────────────────────────────────

const TABS = ['ALL', 'FULLY COVERED', 'TASKED', 'DOCUMENTED', 'EXPOSED'];

export default function SystemStatusTaskKnowledgeCoverage() {
  const [open,   setOpen]   = useState(false);
  const [rows,   setRows]   = useState([]);
  const [tab,    setTab]    = useState('ALL');
  const [search, setSearch] = useState('');
  const [busy,   setBusy]   = useState(false);
  const [assess, setAssess] = useState('');
  const [err,    setErr]    = useState('');
  const timerRef = useRef(null);

  const toggle = useCallback(() => setOpen(o => !o), []);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const [svcR, tkR, kbR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Task`,           { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/knowledge/`,              { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      const services = normaliseServices(svcR.status === 'fulfilled' ? svcR.value : null);
      const tasks    = normaliseTasks(tkR.status === 'fulfilled' ? tkR.value : null);
      const kb       = normaliseKb(kbR.status === 'fulfilled' ? kbR.value : null);
      setRows(correlate(services, tasks, kb));
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('jarvis:sstkn-toggle', toggle);
    return () => window.removeEventListener('jarvis:sstkn-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { 'FULLY COVERED': 0, 'TASKED': 0, 'DOCUMENTED': 0, 'EXPOSED': 0 };
  rows.forEach(r => { counts[r.coverage] = (counts[r.coverage] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.coverage !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.svc.name.toLowerCase().includes(q)
        || (r.task?.title ?? '').toLowerCase().includes(q)
        || (r.article?.title ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const runAssess = async () => {
    setAssess('◌ Assessing…');
    try {
      const script = await buildSstknScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ message: `System Status × Task × Knowledge triple coverage assessment:\n${script}` }),
      });
      const d = await r.json();
      const msg = d.response ?? d.answer ?? d.text ?? script;
      setAssess(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch {
      setAssess('ASSESS unavailable');
    }
  };

  if (!open) {
    return (
      <button
        onClick={toggle}
        title="System Status × Task × Knowledge Coverage"
        style={{
          position: 'fixed', left: 755760, bottom: 8, zIndex: 378,
          background: counts['EXPOSED'] > 0 ? RD : DIM,
          border: `1px solid ${counts['EXPOSED'] > 0 ? RD : CY}`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1, padding: '3px 7px', cursor: 'pointer', borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        ◈ SSTKN {counts['EXPOSED'] > 0 ? <span style={{ color: '#fff', fontWeight: 700 }}>{counts['EXPOSED']}✗</span> : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 378,
      width: PANEL_W, height: PANEL_H,
      background: DIM, border: `1px solid ${BDR}`,
      borderRadius: 6, display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: CY,
      backdropFilter: 'blur(12px)', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ SSTKN — SYSTEM STATUS × TASK × KNOWLEDGE</span>
        {busy && <span style={{ color: AM, fontSize: 9 }}>◌ LOADING</span>}
        <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: CY, cursor: 'pointer', fontSize: 10 }}>↺</button>
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: CY, cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${BDR}` }}>
        {[
          { label: 'FULLY COVERED', count: counts['FULLY COVERED'], color: GR },
          { label: 'TASKED',        count: counts['TASKED'],        color: LM },
          { label: 'DOCUMENTED',    count: counts['DOCUMENTED'],    color: AM },
          { label: 'EXPOSED',       count: counts['EXPOSED'],       color: RD },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            flex: 1, background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '5px 8px', textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{count}</div>
            <div style={{ color: '#9CA3AF', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${BDR}`, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CY : 'transparent',
            color: tab === t ? '#000' : CY,
            border: `1px solid ${CY}44`, borderRadius: 3,
            padding: '2px 7px', fontSize: 9, cursor: 'pointer', letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search services…"
          style={{
            marginLeft: 'auto', background: 'rgba(0,0,0,0.5)', border: `1px solid ${BDR}`,
            color: CY, padding: '2px 6px', fontSize: 9, borderRadius: 3,
            fontFamily: "'JetBrains Mono',monospace", outline: 'none', width: 140,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>⚠ {err}</div>}
        {!err && visible.length === 0 && (
          <div style={{ color: '#4B5563', fontSize: 10, padding: 8 }}>
            {busy ? '◌ Loading services…' : 'No services match.'}
          </div>
        )}
        {visible.map((row, i) => (
          <div key={row.svc.id + i} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto',
            gap: 6, padding: '5px 0', borderBottom: `1px solid ${BDR}`,
            alignItems: 'start',
          }}>
            {/* service */}
            <div>
              <div style={{ color: '#E5E7EB', fontSize: 10, fontWeight: 600 }}>{row.svc.name}</div>
              {row.svc.status && (
                <div style={{ fontSize: 8, color: row.svc.status === 'ok' || row.svc.status === 'healthy' || row.svc.status === 'up' ? GR : row.svc.status === 'degraded' ? AM : '#6B7280', letterSpacing: 1 }}>
                  {row.svc.status.toUpperCase()}
                </div>
              )}
              {row.svc.detail && <div style={{ fontSize: 8, color: '#6B7280' }}>{row.svc.detail.slice(0, 80)}</div>}
            </div>
            {/* task */}
            <div>
              {row.task ? (
                <>
                  <div style={{ color: LM, fontSize: 9, fontWeight: 600 }}>✓ TASK</div>
                  <div style={{ color: '#9CA3AF', fontSize: 8 }}>{row.task.title.slice(0, 60)}</div>
                </>
              ) : (
                <div style={{ color: '#4B5563', fontSize: 9 }}>— no task</div>
              )}
            </div>
            {/* kb */}
            <div>
              {row.article ? (
                <>
                  <div style={{ color: AM, fontSize: 9, fontWeight: 600 }}>✓ KB</div>
                  <div style={{ color: '#9CA3AF', fontSize: 8 }}>{row.article.title.slice(0, 60)}</div>
                </>
              ) : (
                <div style={{ color: '#4B5563', fontSize: 9 }}>— no KB</div>
              )}
            </div>
            {/* coverage badge */}
            <div style={{
              background: `${row.color}22`, border: `1px solid ${row.color}66`,
              borderRadius: 3, padding: '2px 5px', fontSize: 8, color: row.color,
              letterSpacing: 1, whiteSpace: 'nowrap', textAlign: 'center',
            }}>
              {row.coverage}
            </div>
          </div>
        ))}
      </div>

      {/* ASSESS + TTS output */}
      <div style={{ padding: '6px 12px', borderTop: `1px solid ${BDR}` }}>
        <button onClick={runAssess} style={{
          background: 'rgba(0,207,255,0.1)', border: `1px solid ${CY}`,
          color: CY, padding: '4px 14px', fontSize: 10, cursor: 'pointer',
          borderRadius: 3, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace",
        }}>
          ◈ ASSESS
        </button>
        {assess && (
          <div style={{
            marginTop: 6, fontSize: 9, color: '#9CA3AF', maxHeight: 80,
            overflowY: 'auto', lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            {assess}
          </div>
        )}
      </div>
    </div>
  );
}
