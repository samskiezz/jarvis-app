import { useState, useEffect, useCallback } from 'react';

const API = '';

const TGCOV_RE = /\b(tgcov|task[._-]?graph[._-]?communit|communit[._-]?task|task[._-]?network[._-]?context|orphaned[._-]?task|community[._-]?backed[._-]?task|task[._-]?communit|network[._-]?task|graph[._-]?task[._-]?coverage|task[._-]?communit[._-]?coverage|task[._-]?network|task[._-]?cluster|communit[._-]?backed|task[._-]?graph)\b/i;

export function isTgcovQuery(t) {
  return TGCOV_RE.test(t || '');
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.title || t.name || t.label || `Task ${i + 1}`,
    status:   (t.status || t.state || '').toLowerCase(),
    priority: (t.priority || t.severity || '').toLowerCase(),
    desc:     String(t.description || t.summary || t.notes || '').slice(0, 300),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
    assignee: t.assignee || t.owner || t.assigned_to || '',
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'items', 'results', 'data', 'records', 'clusters'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    label:   c.label || c.name || c.title || `Community ${i + 1}`,
    type:    c.type || c.kind || c.category || '',
    size:    c.size || c.member_count || (Array.isArray(c.members) ? c.members.length : 0) || 0,
    desc:    String(c.description || c.summary || c.notes || '').slice(0, 300),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, bFields) {
  const bToks = bFields.flatMap(f => tokens(f)).filter(Boolean);
  if (!aToks.size || !bToks.length) return 0;
  let hits = 0;
  for (const t of bToks) if (aToks.has(t)) hits++;
  return hits / Math.max(aToks.size, bToks.length);
}

function correlate(tasks, communities) {
  return tasks.map(task => {
    const toks = new Set([...tokens(task.name), ...tokens(task.desc), ...tokens(task.tags)].filter(Boolean));

    const matched = communities
      .map(c => ({ ...c, _score: matchScore(toks, [c.label, c.type, c.desc, c.tags]) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const topScore = matched.length ? matched[0]._score : 0;
    let coverage;
    if (matched.length >= 2 && topScore >= 0.15)  coverage = 'FULLY NETWORKED';
    else if (matched.length >= 1 && topScore >= 0.08) coverage = 'COMMUNITY-BACKED';
    else if (matched.length >= 1)                 coverage = 'WEAKLY LINKED';
    else                                           coverage = 'ORPHANED';

    return { ...task, _communities: matched, _coverage: coverage, _topScore: topScore };
  });
}

export async function buildTgcovScript() {
  const [taskR, commR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
  ]);
  const tasks       = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const communities = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
  const enriched    = correlate(tasks, communities);

  const fn = enriched.filter(e => e._coverage === 'FULLY NETWORKED').length;
  const cb = enriched.filter(e => e._coverage === 'COMMUNITY-BACKED').length;
  const wl = enriched.filter(e => e._coverage === 'WEAKLY LINKED').length;
  const or = enriched.filter(e => e._coverage === 'ORPHANED').length;

  return (
    `Task × Graph Community Coverage: ${tasks.length} tasks cross-referenced against ${communities.length} network communities. ` +
    `${fn} FULLY NETWORKED (aligned with 2+ communities); ${cb} COMMUNITY-BACKED (1 community match); ` +
    `${wl} WEAKLY LINKED (low-confidence alignment); ${or} ORPHANED (no community context found). ` +
    `Priority orphans: ${enriched.filter(e => e._coverage === 'ORPHANED').map(e => e.name).slice(0, 3).join(', ') || 'none orphaned'}.`
  );
}

const PANEL_W = 760;
const PANEL_H = 660;
const RD  = '#EF4444';
const AM  = '#F59E0B';
const CY  = '#00CFFF';
const GR  = '#22C55E';
const VT  = '#8B5CF6';

const COVERAGE_COLOR = {
  'FULLY NETWORKED':   GR,
  'COMMUNITY-BACKED':  CY,
  'WEAKLY LINKED':     AM,
  'ORPHANED':          VT,
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

const TABS = ['ALL', 'FULLY NETWORKED', 'COMMUNITY-BACKED', 'WEAKLY LINKED', 'ORPHANED'];

export default function TaskGraphCommunityCoverage() {
  const [open, setOpen]             = useState(false);
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [taskR, commR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
      ]);
      const rawTasks = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
      const rawComms = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
      setTasks(correlate(rawTasks, rawComms));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tgcov-toggle', toggle);
    return () => window.removeEventListener('jarvis:tgcov-toggle', toggle);
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
      const brief = await buildTgcovScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Task-to-graph-community network coverage assessment: ${brief}. Give a 2-sentence brief on which orphaned tasks are highest priority and what network context they are missing.` }),
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
    const orphanedCount = tasks.filter(t => t._coverage === 'ORPHANED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Graph Community Coverage (TGCOV)"
        style={{
          position: 'fixed', left: 740640, bottom: 8, zIndex: 351,
          background: orphanedCount > 0 ? '#8B5CF622' : '#0a0a1a',
          border: `1px solid ${orphanedCount > 0 ? VT : CY + '44'}`,
          color: orphanedCount > 0 ? VT : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ TGCOV{orphanedCount > 0 ? ` ⚠${orphanedCount}` : ''}
      </button>
    );
  }

  const fn = tasks.filter(t => t._coverage === 'FULLY NETWORKED').length;
  const cb = tasks.filter(t => t._coverage === 'COMMUNITY-BACKED').length;
  const wl = tasks.filter(t => t._coverage === 'WEAKLY LINKED').length;
  const or = tasks.filter(t => t._coverage === 'ORPHANED').length;

  const visible = tasks.filter(t =>
    (tab === 'ALL' || t._coverage === tab) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #8B5CF633', borderRadius: 8,
      zIndex: 6002, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #8B5CF618',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #8B5CF622', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: VT, fontWeight: 700, fontSize: 11 }}>◈ TASK × GRAPH COMMUNITY COVERAGE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>TGCOV</span>
        {or > 0 && <span style={{ fontSize: 10, color: VT, background: '#8B5CF622', border: '1px solid #8B5CF655', borderRadius: 3, padding: '1px 5px' }}>⚠ {or} ORPHANED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['TASKS',            tasks.length, CY],
          ['FULLY NETWORKED',  fn,           GR],
          ['COMMUNITY-BACKED', cb,           CY],
          ['WEAKLY LINKED',    wl,           AM],
          ['ORPHANED',         or,           VT],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: '#0c0c1e', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ marginLeft: 'auto', background: assessing ? '#111' : '#0a0a1a', border: `1px solid ${VT}55`, color: VT, borderRadius: 4, padding: '4px 12px', fontSize: 10, cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace' }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
      </div>

      {assessText && (
        <div style={{ margin: '0 12px 8px', padding: '6px 10px', background: '#0a0a0a', border: `1px solid ${VT}33`, borderRadius: 4, fontSize: 10, color: '#aaa', lineHeight: 1.5, flexShrink: 0 }}>
          {assessText}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '22' : 'transparent',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#666',
            borderRadius: 3, padding: '2px 8px', fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: 'auto', background: '#0c0c1e', border: '1px solid #333', color: '#aaa', borderRadius: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', width: 160 }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>error: {err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>no tasks match</div>}
        {visible.map(task => {
          const col  = COVERAGE_COLOR[task._coverage] || CY;
          const isExp = expanded === task.id;
          return (
            <div key={task.id} style={{ marginBottom: 4, background: '#0c0c1e', border: `1px solid ${col}33`, borderRadius: 5 }}>
              <div
                onClick={() => setExpanded(isExp ? null : task.id)}
                style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 10, color: col, fontWeight: 700, minWidth: 130 }}>{task._coverage}</span>
                <span style={{ fontSize: 11, color: '#ccc', flex: 1 }}>{task.name}</span>
                {task.priority && chip(task.priority, task.priority === 'high' || task.priority === 'critical' ? RD : AM)}
                {task.status   && chip(task.status, task.status === 'done' || task.status === 'complete' ? GR : CY)}
                {task._communities.length > 0 && chip(`${task._communities.length} communit${task._communities.length > 1 ? 'ies' : 'y'}`, VT)}
                <span style={{ fontSize: 10, color: '#444' }}>{isExp ? '▾' : '▸'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}22` }}>
                  {task.desc && (
                    <div style={{ fontSize: 9, color: '#777', marginBottom: 8, marginTop: 6 }}>{task.desc}</div>
                  )}
                  {task.assignee && (
                    <div style={{ fontSize: 9, color: '#555', marginBottom: 8 }}>Assignee: <span style={{ color: CY }}>{task.assignee}</span></div>
                  )}
                  <div style={{ fontSize: 9, color: VT, letterSpacing: 1, marginBottom: 4 }}>GRAPH COMMUNITIES</div>
                  {task._communities.length === 0
                    ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no community context — task is network-orphaned</div>
                    : task._communities.map(c => (
                      <div key={c.id} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, color: VT }}>{c.label}</span>
                          {c.type && chip(c.type, '#A78BFA')}
                          {c.size > 0 && chip(`${c.size} nodes`, '#818CF8')}
                        </div>
                        {c.desc && <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{c.desc.slice(0, 120)}</div>}
                        <ScoreBar score={c._score} color={VT} />
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #1a1a2a', fontSize: 9, color: '#555', flexShrink: 0 }}>
        /entities/Task × /v1/graph/communities · 90s auto-refresh
      </div>
    </div>
  );
}
