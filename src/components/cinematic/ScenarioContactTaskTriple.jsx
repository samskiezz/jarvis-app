import { useState, useEffect, useCallback } from 'react';

const API = '';

const SCCTRI_RE = /\b(scenario[._-]?staff|staffed[._-]?scenario|scctri|scenario[._-]?contact[._-]?task|scenario[._-]?people[._-]?task|scenario[._-]?crew|staffing[._-]?scenario)\b/i;

export function isScctriQuery(t) {
  return SCCTRI_RE.test(t || '');
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:          s.id || String(i),
    name:        s.name || s.title || s.scenario || `Scenario ${i + 1}`,
    description: String(s.description || s.summary || s.objective || '').slice(0, 300),
    status:      s.status || s.state || '',
    category:    s.category || s.type || s.kind || '',
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || c.displayName || `Contact ${i + 1}`,
    org:   c.org || c.company || c.organisation || c.organization || '',
    role:  c.role || c.title || c.position || '',
    desc:  String(c.description || c.bio || c.notes || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
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
    name:     t.name || t.title || t.task || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.summary || t.mission || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(scenToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.org || other.sector || ''),
    ...tokens(other.role || other.type || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!scenToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (scenToks.has(t)) hits++;
  return hits / Math.max(scenToks.size, otherToks.length);
}

function correlate(scenarios, contacts, tasks) {
  return scenarios.map(sc => {
    const sToks = new Set([
      ...tokens(sc.name),
      ...tokens(sc.description),
      ...tokens(sc.category),
      ...tokens(sc.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(sToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(sToks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasCon  = matchedContacts.length > 0;
    const hasTask = matchedTasks.length > 0;

    let coverage;
    if (hasCon && hasTask) coverage = 'FULLY STAFFED';
    else if (hasCon)       coverage = 'CONTACT-ONLY';
    else if (hasTask)      coverage = 'TASK-ONLY';
    else                   coverage = 'UNMANAGED';

    return { ...sc, _contacts: matchedContacts, _tasks: matchedTasks, _coverage: coverage };
  });
}

export async function buildScctriScript() {
  const [sR, cR, tR] = await Promise.allSettled([
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const scenarios = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const contacts  = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const tasks     = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
  const enriched  = correlate(scenarios, contacts, tasks);
  const fs  = enriched.filter(s => s._coverage === 'FULLY STAFFED').length;
  const co  = enriched.filter(s => s._coverage === 'CONTACT-ONLY').length;
  const to  = enriched.filter(s => s._coverage === 'TASK-ONLY').length;
  const um  = enriched.filter(s => s._coverage === 'UNMANAGED').length;
  return (
    `Scenario × Contact × Task Triple Coverage: ${scenarios.length} scenarios cross-referenced against ${contacts.length} contacts and ${tasks.length} tasks. ` +
    `${fs} scenarios are FULLY STAFFED (contact-assigned + task-backed); ${co} are CONTACT-ONLY (personnel identified, no task); ` +
    `${to} are TASK-ONLY (task exists, no contact owner); ${um} are UNMANAGED (no people or task coverage — planning gap). ` +
    `Unmanaged: ${enriched.filter(s => s._coverage === 'UNMANAGED').slice(0, 3).map(s => s.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 660;
const PANEL_H = 600;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const TE = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY STAFFED': GR,
  'CONTACT-ONLY':  CY,
  'TASK-ONLY':     AM,
  'UNMANAGED':     RD,
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

const TABS = ['ALL', 'FULLY STAFFED', 'CONTACT-ONLY', 'TASK-ONLY', 'UNMANAGED'];

export default function ScenarioContactTaskTriple() {
  const [open, setOpen]         = useState(false);
  const [scenarios, setScen]    = useState([]);
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
      const [sR, cR, tR] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_t = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
      setScen(correlate(raw_s, raw_c, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:scctri-toggle', toggle);
    return () => window.removeEventListener('jarvis:scctri-toggle', toggle);
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
      const brief = await buildScctriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Scenario × Contact × Task triple coverage brief: ${brief}. Give a 2-sentence scenario staffing assessment.` }),
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
    const umCount = scenarios.filter(s => s._coverage === 'UNMANAGED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Contact × Task Triple Coverage (SCCTRI)"
        style={{
          position: 'fixed', left: 716000, bottom: 8, zIndex: 307,
          background: umCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${umCount > 0 ? RD : CY + '44'}`,
          color: umCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SCCTRI{umCount > 0 ? ` ⚠${umCount}` : ''}
      </button>
    );
  }

  const fs = scenarios.filter(s => s._coverage === 'FULLY STAFFED').length;
  const co = scenarios.filter(s => s._coverage === 'CONTACT-ONLY').length;
  const to = scenarios.filter(s => s._coverage === 'TASK-ONLY').length;
  const um = scenarios.filter(s => s._coverage === 'UNMANAGED').length;

  const visible = scenarios.filter(sc =>
    (tab === 'ALL' || sc._coverage === tab) &&
    (!search || sc.name.toLowerCase().includes(search.toLowerCase()) || sc.category.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ SCENARIO × CONTACT × TASK TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SCCTRI</span>
        {um > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {um} UNMANAGED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SCENARIOS', scenarios.length, CY],
          ['FULLY STAFFED', fs, GR],
          ['CONTACT-ONLY', co, CY],
          ['TASK-ONLY', to, AM],
          ['UNMANAGED', um, RD],
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
          {scenarios.length > 0 && [
            [fs, GR], [co, CY], [to, AM], [um, RD]
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
          }}>{t}{t !== 'ALL' ? ` (${scenarios.filter(s => s._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search scenarios…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No scenarios match filter.</div>}
        {visible.map(sc => {
          const color = COVERAGE_COLOR[sc._coverage] || CY;
          const isExp = expanded === sc.id;
          return (
            <div key={sc.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : sc.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</span>
                {sc.category && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{sc.category}</span>}
                {sc.status && chip(sc.status, TE)}
                {chip(sc._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 700 }}>CONTACTS ({sc._contacts.length})</div>
                    {sc._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No contact coverage</div>
                      : sc._contacts.map((c, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{c.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {c.org && chip(c.org, CY)}
                            {c.role && chip(c.role, '#888')}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>TASKS ({sc._tasks.length})</div>
                    {sc._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No task coverage</div>
                      : sc._tasks.map((t, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{t.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {t.priority && chip(t.priority, t.priority === 'HIGH' || t.priority === 'CRITICAL' ? RD : AM)}
                            {t.status && chip(t.status, GR)}
                          </div>
                          <ScoreBar score={t._score} color={AM} />
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
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          padding: '4px 12px', fontSize: 10, background: assessing ? '#1a1a2a' : '#0a0a1a',
          border: `1px solid ${CY}44`, borderRadius: 4, color: CY, cursor: 'pointer',
        }}>
          {assessing ? 'ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={load} disabled={loading} style={{ padding: '4px 8px', fontSize: 10, background: '#0a0a1a', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer' }}>↺</button>
        {assessText && <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>}
        <span style={{ fontSize: 9, color: '#444', flexShrink: 0 }}>{scenarios.length} scenarios · 90s</span>
      </div>
    </div>
  );
}
