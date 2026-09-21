import { useState, useEffect, useCallback } from 'react';

const API = '';

const RTSWTRI_RE = /\b(report[._-]?task[._-]?swarm|rtswtri|report[._-]?swarm[._-]?task|actioned[._-]?report|shelved[._-]?report|report[._-]?triple|report[._-]?action[._-]?coverage|intel[._-]?actioned|report[._-]?operational[._-]?response|intel[._-]?response[._-]?gap)\b/i;

export function isRtswtriQuery(t) {
  return RTSWTRI_RE.test(t || '');
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.title || r.name || r.subject || `Report ${i + 1}`,
    type:     r.type || r.kind || r.report_type || r.category || '',
    date:     r.created_at || r.date || r.updated_at || '',
    summary:  String(r.summary || r.description || r.content || '').slice(0, 250),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.title || t.name || t.task || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.summary || t.notes || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = ['jobs', 'swarm_jobs', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.job || `Job ${i + 1}`,
    kind:   j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.summary || j.target || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(rptToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title),
    ...tokens(other.status || other.priority || other.kind || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!rptToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (rptToks.has(t)) hits++;
  return hits / Math.max(rptToks.size, otherToks.length);
}

function correlate(reports, tasks, jobs) {
  return reports.map(rpt => {
    const rToks = new Set([
      ...tokens(rpt.name),
      ...tokens(rpt.type),
      ...tokens(rpt.summary),
      ...tokens(rpt.tags),
    ].filter(Boolean));

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(rToks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedJobs = jobs
      .map(j => ({ ...j, _score: matchScore(rToks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasTask = matchedTasks.length > 0;
    const hasJob  = matchedJobs.length > 0;

    let coverage;
    if (hasTask && hasJob) coverage = 'FULLY ACTIONED';
    else if (hasTask)      coverage = 'TASK-ONLY';
    else if (hasJob)       coverage = 'AUTOMATED';
    else                   coverage = 'SHELVED';

    return { ...rpt, _tasks: matchedTasks, _jobs: matchedJobs, _coverage: coverage };
  });
}

export async function buildRtswtriScript() {
  const [rR, tR, jR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const reports = normaliseReports(rR.status === 'fulfilled' ? rR.value : []);
  const tasks   = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
  const jobs    = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
  const enriched = correlate(reports, tasks, jobs);
  const fa      = enriched.filter(r => r._coverage === 'FULLY ACTIONED').length;
  const to      = enriched.filter(r => r._coverage === 'TASK-ONLY').length;
  const au      = enriched.filter(r => r._coverage === 'AUTOMATED').length;
  const sh      = enriched.filter(r => r._coverage === 'SHELVED').length;
  return (
    `Report × Task × SwarmJob Triple Coverage: ${reports.length} intelligence reports cross-referenced against ${tasks.length} tasks and ${jobs.length} swarm jobs. ` +
    `${fa} FULLY ACTIONED (task-backed + swarm-automated); ${to} TASK-ONLY (task response exists, no swarm); ` +
    `${au} AUTOMATED (swarm job found, no task tracking); ${sh} SHELVED (no operational response — intelligence gap). ` +
    `Shelved reports: ${enriched.filter(r => r._coverage === 'SHELVED').slice(0, 3).map(r => r.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY ACTIONED': GR,
  'TASK-ONLY':      AM,
  'AUTOMATED':      LM,
  'SHELVED':        RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY ACTIONED', 'TASK-ONLY', 'AUTOMATED', 'SHELVED'];

export default function ReportTaskSwarmTriple() {
  const [open, setOpen]         = useState(false);
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [rR, tR, jR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
      ]);
      const raw_r = normaliseReports(rR.status === 'fulfilled' ? rR.value : []);
      const raw_t = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
      const raw_j = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
      setReports(correlate(raw_r, raw_t, raw_j));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rtswtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:rtswtri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildRtswtriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Report × task × swarm job triple coverage brief: ${brief}. Give a 2-sentence intelligence operational response assessment.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const shelvedCount = reports.filter(r => r._coverage === 'SHELVED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report × Task × SwarmJob Triple Coverage (RTSWTRI)"
        style={{
          position: 'fixed', left: 722160, bottom: 8, zIndex: 318,
          background: shelvedCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${shelvedCount > 0 ? RD : CY + '44'}`,
          color: shelvedCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ RTSWTRI{shelvedCount > 0 ? ` ⚠${shelvedCount}` : ''}
      </button>
    );
  }

  const fa = reports.filter(r => r._coverage === 'FULLY ACTIONED').length;
  const to = reports.filter(r => r._coverage === 'TASK-ONLY').length;
  const au = reports.filter(r => r._coverage === 'AUTOMATED').length;
  const sh = reports.filter(r => r._coverage === 'SHELVED').length;

  const visible = reports.filter(rpt =>
    (tab === 'ALL' || rpt._coverage === tab) &&
    (!search || rpt.name.toLowerCase().includes(search.toLowerCase()) || rpt.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ REPORT × TASK × SWARM JOB TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>RTSWTRI</span>
        {sh > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {sh} SHELVED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['REPORTS',        reports.length, CY],
          ['FULLY ACTIONED', fa,             GR],
          ['TASK-ONLY',      to,             AM],
          ['AUTOMATED',      au,             LM],
          ['SHELVED',        sh,             RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {reports.length > 0 && [
            [fa, GR], [to, AM], [au, LM], [sh, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${reports.filter(r => r._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No reports match filter.</div>}
        {visible.map(rpt => {
          const color = COVERAGE_COLOR[rpt._coverage] || CY;
          const isExp = expanded === rpt.id;
          return (
            <div key={rpt.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : rpt.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rpt.name}</span>
                {rpt.type && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{rpt.type}</span>}
                {rpt.date && <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{String(rpt.date).slice(0, 10)}</span>}
                {chip(rpt._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({rpt._tasks.length})</div>
                    {rpt._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task alignment</div>
                      : rpt._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status && chip(t.status, '#888')}
                            {t.priority && chip(t.priority, t.priority.toUpperCase() === 'HIGH' || t.priority.toUpperCase() === 'CRITICAL' ? RD : AM)}
                          </div>
                          <ScoreBar score={t._score} color={GR} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: SwarmJobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SWARM JOBS ({rpt._jobs.length})</div>
                    {rpt._jobs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No swarm job alignment</div>
                      : rpt._jobs.map(j => (
                        <div key={j.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                            {j.kind && chip(j.kind, LM)}
                            {j.status && chip(j.status, '#888')}
                          </div>
                          <ScoreBar score={j._score} color={LM} />
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

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#EF444422', border: `1px solid ${RD}55`, color: RD, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
