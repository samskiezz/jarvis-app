import { useState, useEffect, useCallback } from 'react';

const API = '';

const IPTRI_RE = /\b(iptri|intel[._-]?profile[._-]?task[._-]?ops|threat[._-]?actor[._-]?task[._-]?ops|intel[._-]?task[._-]?ops|profile[._-]?task[._-]?ops|intel[._-]?ops[._-]?task|threat[._-]?task[._-]?ops|actor[._-]?task[._-]?ops|intel[._-]?triple|profile[._-]?triple[._-]?cover|intel[._-]?full[._-]?response|uncountered[._-]?intel|unresponded[._-]?threat)\b/i;

export function isIptriQuery(t) {
  return IPTRI_RE.test(t || '');
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = ['profiles', 'intel_profiles', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((p, i) => ({
    id:       p.id || String(i),
    name:     p.name || p.title || p.subject || `Profile ${i + 1}`,
    category: p.category || p.type || p.kind || '',
    nat:      p.nationality || p.country || p.origin || '',
    desc:     String(p.description || p.summary || p.bio || '').slice(0, 300),
    aliases:  Array.isArray(p.aliases) ? p.aliases.join(' ') : (p.aliases || ''),
    tags:     Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
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
  }));
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = ['events', 'ops_events', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:       e.id || String(i),
    name:     e.name || e.title || e.type || `Event ${i + 1}`,
    severity: (e.severity || e.level || e.priority || '').toLowerCase(),
    type:     e.type || e.kind || e.category || '',
    desc:     String(e.description || e.message || e.detail || e.summary || '').slice(0, 300),
    tags:     Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
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

function correlate(profiles, tasks, opsEvents) {
  return profiles.map(profile => {
    const toks = new Set([
      ...tokens(profile.name),
      ...tokens(profile.desc),
      ...tokens(profile.aliases),
      ...tokens(profile.tags),
      ...tokens(profile.category),
    ].filter(Boolean));

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(toks, [t.name, t.desc, t.tags]) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedOps = opsEvents
      .map(e => ({ ...e, _score: matchScore(toks, [e.name, e.desc, e.tags, e.type]) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasTask = matchedTasks.length > 0;
    const hasOps  = matchedOps.length > 0;

    let coverage;
    if (hasTask && hasOps)  coverage = 'FULLY COUNTERED';
    else if (hasTask)       coverage = 'TASK-ONLY';
    else if (hasOps)        coverage = 'OPS-MONITORED';
    else                    coverage = 'UNCOUNTERED';

    return { ...profile, _tasks: matchedTasks, _ops: matchedOps, _coverage: coverage };
  });
}

export async function buildIptriScript() {
  const [profR, taskR, opsR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const profiles  = normaliseProfiles(profR.status === 'fulfilled' ? profR.value : []);
  const tasks     = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const opsEvents = normaliseOpsEvents(opsR.status === 'fulfilled' ? opsR.value : []);
  const enriched  = correlate(profiles, tasks, opsEvents);

  const fc = enriched.filter(e => e._coverage === 'FULLY COUNTERED').length;
  const to = enriched.filter(e => e._coverage === 'TASK-ONLY').length;
  const om = enriched.filter(e => e._coverage === 'OPS-MONITORED').length;
  const uc = enriched.filter(e => e._coverage === 'UNCOUNTERED').length;

  return (
    `Intel Profile × Task × Ops Event Triple Coverage: ${profiles.length} threat actor profiles cross-referenced against ${tasks.length} tasks and ${opsEvents.length} ops events. ` +
    `${fc} FULLY COUNTERED (task + ops coverage); ${to} TASK-ONLY (response task exists, no live ops event); ` +
    `${om} OPS-MONITORED (ops event found, no task assigned); ${uc} UNCOUNTERED (no response or monitoring). ` +
    `Priority uncountered: ${enriched.filter(e => e._coverage === 'UNCOUNTERED').map(e => e.name).slice(0, 3).join(', ') || 'none uncountered'}.`
  );
}

const PANEL_W = 820;
const PANEL_H = 680;
const RD  = '#EF4444';
const AM  = '#F59E0B';
const CY  = '#00CFFF';
const GR  = '#22C55E';
const PU  = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY COUNTERED': GR,
  'TASK-ONLY':       CY,
  'OPS-MONITORED':   AM,
  'UNCOUNTERED':     RD,
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

const TABS = ['ALL', 'FULLY COUNTERED', 'TASK-ONLY', 'OPS-MONITORED', 'UNCOUNTERED'];

export default function IntelProfileTaskOpsTriple() {
  const [open, setOpen]             = useState(false);
  const [profiles, setProfiles]     = useState([]);
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
      const [profR, taskR, opsR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      const rawProfiles  = normaliseProfiles(profR.status === 'fulfilled' ? profR.value : []);
      const rawTasks     = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
      const rawOpsEvents = normaliseOpsEvents(opsR.status === 'fulfilled' ? opsR.value : []);
      setProfiles(correlate(rawProfiles, rawTasks, rawOpsEvents));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:iptri-toggle', toggle);
    return () => window.removeEventListener('jarvis:iptri-toggle', toggle);
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
      const brief = await buildIptriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Intel profile task-ops triple coverage assessment: ${brief}. Give a 2-sentence brief on which uncountered threat actors are highest priority and what response actions are missing.` }),
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
    const uncounteredCount = profiles.filter(p => p._coverage === 'UNCOUNTERED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Task × Ops Event Triple Coverage (IPTRI)"
        style={{
          position: 'fixed', left: 741200, bottom: 8, zIndex: 352,
          background: uncounteredCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${uncounteredCount > 0 ? RD : CY + '44'}`,
          color: uncounteredCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ IPTRI{uncounteredCount > 0 ? ` ⚠${uncounteredCount}` : ''}
      </button>
    );
  }

  const fc = profiles.filter(p => p._coverage === 'FULLY COUNTERED').length;
  const to = profiles.filter(p => p._coverage === 'TASK-ONLY').length;
  const om = profiles.filter(p => p._coverage === 'OPS-MONITORED').length;
  const uc = profiles.filter(p => p._coverage === 'UNCOUNTERED').length;

  const visible = profiles.filter(p =>
    (tab === 'ALL' || p._coverage === tab) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.desc.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #EF444433', borderRadius: 8,
      zIndex: 6002, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #EF444418',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #EF444422', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 11 }}>◈ INTEL PROFILE × TASK × OPS EVENT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>IPTRI</span>
        {uc > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {uc} UNCOUNTERED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['PROFILES',         profiles.length, PU],
          ['FULLY COUNTERED',  fc,              GR],
          ['TASK-ONLY',        to,              CY],
          ['OPS-MONITORED',    om,              AM],
          ['UNCOUNTERED',      uc,              RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: '#0c0c1e', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 90, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ marginLeft: 'auto', background: assessing ? '#111' : '#0a0a1a', border: `1px solid ${RD}55`, color: RD, borderRadius: 4, padding: '4px 12px', fontSize: 10, cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace' }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
      </div>

      {assessText && (
        <div style={{ margin: '0 12px 8px', padding: '6px 10px', background: '#0a0a0a', border: `1px solid ${RD}33`, borderRadius: 4, fontSize: 10, color: '#aaa', lineHeight: 1.5, flexShrink: 0 }}>
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
          placeholder="search profiles…"
          style={{ marginLeft: 'auto', background: '#0c0c1e', border: '1px solid #333', color: '#aaa', borderRadius: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', width: 160 }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>error: {err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>no profiles match</div>}
        {visible.map(profile => {
          const col   = COVERAGE_COLOR[profile._coverage] || CY;
          const isExp = expanded === profile.id;
          return (
            <div key={profile.id} style={{ marginBottom: 4, background: '#0c0c1e', border: `1px solid ${col}33`, borderRadius: 5 }}>
              <div
                onClick={() => setExpanded(isExp ? null : profile.id)}
                style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 10, color: col, fontWeight: 700, minWidth: 130 }}>{profile._coverage}</span>
                <span style={{ fontSize: 11, color: '#ccc', flex: 1 }}>{profile.name}</span>
                {profile.category && chip(profile.category, PU)}
                {profile.nat      && chip(profile.nat, '#818CF8')}
                {profile._tasks.length > 0 && chip(`${profile._tasks.length} task${profile._tasks.length > 1 ? 's' : ''}`, GR)}
                {profile._ops.length > 0   && chip(`${profile._ops.length} ops`, AM)}
                <span style={{ fontSize: 10, color: '#444' }}>{isExp ? '▾' : '▸'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}22` }}>
                  {profile.desc && (
                    <div style={{ fontSize: 9, color: '#777', marginBottom: 8, marginTop: 6 }}>{profile.desc}</div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: GR, letterSpacing: 1, marginBottom: 4 }}>RESPONSE TASKS</div>
                      {profile._tasks.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no task response assigned</div>
                        : profile._tasks.map(t => (
                          <div key={t.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: GR }}>{t.name}</span>
                              {t.priority && chip(t.priority, t.priority === 'high' || t.priority === 'critical' ? RD : AM)}
                              {t.status   && chip(t.status,   t.status === 'done' || t.status === 'complete' ? GR : CY)}
                            </div>
                            <ScoreBar score={t._score} color={GR} />
                          </div>
                        ))
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: AM, letterSpacing: 1, marginBottom: 4 }}>OPS MONITORING</div>
                      {profile._ops.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no ops event monitoring found</div>
                        : profile._ops.map(e => (
                          <div key={e.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: AM }}>{e.name}</span>
                              {e.severity && chip(e.severity, e.severity === 'critical' ? RD : e.severity === 'warning' ? AM : CY)}
                              {e.type     && chip(e.type, '#94A3B8')}
                            </div>
                            <ScoreBar score={e._score} color={AM} />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #1a1a2a', fontSize: 9, color: '#555', flexShrink: 0 }}>
        /entities/IntelProfile × /entities/Task × /v1/ops/events · 90s auto-refresh
      </div>
    </div>
  );
}
