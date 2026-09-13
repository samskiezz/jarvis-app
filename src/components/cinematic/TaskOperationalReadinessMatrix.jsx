import { useState, useEffect, useCallback } from 'react';

const API = '';

const TCDSOM_RE = /\b(tcdsom|task[._\-]?readiness(?:[._\-]?matrix)?|operational[._\-]?readiness|task[._\-]?equipped|fully[._\-]?equipped(?:[._\-]?task)?|isolated[._\-]?task|task[._\-]?resource(?:[._\-]?matrix)?|task[._\-]?contact[._\-]?dataset|task[._\-]?coverage[._\-]?matrix|mission[._\-]?readiness(?:[._\-]?matrix)?|task[._\-]?4[._\-]?way|4[._\-]?way[._\-]?task)\b/i;

export function isTcdsomQuery(t) {
  return TCDSOM_RE.test(t || '');
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.title || t.name || t.subject || `Task ${i + 1}`,
    priority: t.priority || t.urgency || '',
    status:   t.status || t.state || '',
    desc:     String(t.description || t.summary || t.notes || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:   c.id || String(i),
    name: c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    org:  c.org || c.company || c.organization || '',
    role: c.role || c.title || c.position || '',
    desc: String(c.description || c.bio || c.notes || '').slice(0, 150),
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = ['datasets', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((d, i) => ({
    id:   d.id || String(i),
    name: d.name || d.title || d.label || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || '',
    rows: d.row_count || d.rows || d.count || '',
    desc: String(d.description || d.summary || '').slice(0, 150),
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
  }));
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:     s.id || String(i),
    name:   s.name || s.title || `Skill ${i + 1}`,
    domain: s.domain || s.category || s.type || '',
    desc:   String(s.description || s.summary || '').slice(0, 150),
    tags:   Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function score(taskToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title),
    ...tokens(other.org || other.company || ''),
    ...tokens(other.role || other.kind || other.domain || other.type || ''),
    ...tokens(other.desc || other.description || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!taskToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (taskToks.has(t)) hits++;
  return hits / Math.max(taskToks.size, otherToks.length);
}

function coverageLabel(hasContact, hasDataset, hasSkill) {
  const count = [hasContact, hasDataset, hasSkill].filter(Boolean).length;
  if (count === 3) return 'FULLY EQUIPPED';
  if (count === 2) return 'RESOURCED';
  if (count === 1) return 'SPARSE';
  return 'ISOLATED';
}

function correlate(tasks, contacts, datasets, skills) {
  return tasks.map(task => {
    const taskToks = new Set([
      ...tokens(task.name),
      ...tokens(task.priority),
      ...tokens(task.status),
      ...tokens(task.desc),
      ...tokens(task.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: score(taskToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    const matchedDatasets = datasets
      .map(d => ({ ...d, _score: score(taskToks, d) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    const matchedSkills = skills
      .map(s => ({ ...s, _score: score(taskToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    const hasContact = matchedContacts.length > 0;
    const hasDataset = matchedDatasets.length > 0;
    const hasSkill   = matchedSkills.length > 0;
    const coverage   = coverageLabel(hasContact, hasDataset, hasSkill);

    return { ...task, _contacts: matchedContacts, _datasets: matchedDatasets, _skills: matchedSkills, _coverage: coverage };
  });
}

export async function buildTcdsomScript() {
  const [tR, cR, dR, sR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const tasks    = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
  const contacts = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const datasets = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
  const skills   = normaliseSkills(sR.status === 'fulfilled' ? sR.value : []);
  const enriched = correlate(tasks, contacts, datasets, skills);
  const fe   = enriched.filter(t => t._coverage === 'FULLY EQUIPPED').length;
  const res  = enriched.filter(t => t._coverage === 'RESOURCED').length;
  const sp   = enriched.filter(t => t._coverage === 'SPARSE').length;
  const iso  = enriched.filter(t => t._coverage === 'ISOLATED').length;
  const isoPrev = enriched.filter(t => t._coverage === 'ISOLATED').slice(0, 3).map(t => t.name).join(', ') || 'none';
  return (
    `Task Operational Readiness Matrix (4-way): ${tasks.length} active tasks cross-referenced against ` +
    `${contacts.length} contacts, ${datasets.length} datasets, and ${skills.length} JARVIS skills. ` +
    `${fe} FULLY EQUIPPED (contact + dataset + skill aligned); ${res} RESOURCED (2 of 3 sources); ` +
    `${sp} SPARSE (1 of 3); ${iso} ISOLATED (no contact, data, or skill coverage). ` +
    `Isolated tasks: ${isoPrev}.`
  );
}

const PANEL_W = 720;
const PANEL_H = 640;
const CY  = '#00CFFF';
const LM  = '#84CC16';
const AM  = '#F59E0B';
const RD  = '#EF4444';
const TE  = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY EQUIPPED': LM,
  'RESOURCED':      CY,
  'SPARSE':         AM,
  'ISOLATED':       RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ sc, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(sc * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY EQUIPPED', 'RESOURCED', 'SPARSE', 'ISOLATED'];

export default function TaskOperationalReadinessMatrix() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
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
      const [tR, cR, dR, sR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      const raw_t = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_d = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
      const raw_s = normaliseSkills(sR.status === 'fulfilled' ? sR.value : []);
      setTasks(correlate(raw_t, raw_c, raw_d, raw_s));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tcdsom-toggle', toggle);
    return () => window.removeEventListener('jarvis:tcdsom-toggle', toggle);
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
      const brief = await buildTcdsomScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Task operational readiness assessment: ${brief}. Give a 2-sentence mission-readiness evaluation.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || d.answer || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const isoCount = tasks.filter(t => t._coverage === 'ISOLATED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Contact × Dataset × Skill Operational Readiness Matrix (TCDSOM)"
        style={{
          position: 'fixed', left: 726640, bottom: 8, zIndex: 326,
          background: isoCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${isoCount > 0 ? RD : CY + '44'}`,
          color: isoCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ TCDSOM{isoCount > 0 ? ` ⚠${isoCount}` : ''}
      </button>
    );
  }

  const fe  = tasks.filter(t => t._coverage === 'FULLY EQUIPPED').length;
  const res = tasks.filter(t => t._coverage === 'RESOURCED').length;
  const sp  = tasks.filter(t => t._coverage === 'SPARSE').length;
  const iso = tasks.filter(t => t._coverage === 'ISOLATED').length;

  const visible = tasks.filter(task =>
    (tab === 'ALL' || task._coverage === tab) &&
    (!search || task.name.toLowerCase().includes(search.toLowerCase()) || task.desc.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ TASK OPERATIONAL READINESS MATRIX</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>TCDSOM</span>
        {iso > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {iso} ISOLATED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Dimension legend */}
      <div style={{ padding: '4px 12px', borderBottom: '1px solid #00CFFF11', display: 'flex', gap: 12, flexShrink: 0 }}>
        {[['◉ CONTACT', TE], ['◉ DATASET', AM], ['◉ SKILL', LM]].map(([label, color]) => (
          <span key={label} style={{ fontSize: 9, color, letterSpacing: 1 }}>{label}</span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#555' }}>Task × Contact × Dataset × Skill</span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['TASKS',           tasks.length, CY],
          ['FULLY EQUIPPED',  fe,           LM],
          ['RESOURCED',       res,          CY],
          ['SPARSE',          sp,           AM],
          ['ISOLATED',        iso,          RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 68, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {tasks.length > 0 && [[fe, LM], [res, CY], [sp, AM], [iso, RD]].map(([v, c], i) => (
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
          }}>{t}{t !== 'ALL' ? ` (${tasks.filter(tk => tk._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No tasks match filter.</div>}
        {visible.map(task => {
          const color = COVERAGE_COLOR[task._coverage] || CY;
          const isExp = expanded === task.id;
          return (
            <div key={task.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : task.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                {task.priority && chip(task.priority, AM)}
                {task.status && chip(task.status, '#777')}
                {chip(task._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  {/* Contacts */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: TE, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({task._contacts.length})</div>
                    {task._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : task._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.role && chip(c.role, TE)}
                          </div>
                          <ScoreBar sc={c._score} color={TE} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Datasets */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>DATASETS ({task._datasets.length})</div>
                    {task._datasets.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No dataset alignment</div>
                      : task._datasets.map(d => (
                        <div key={d.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                            {d.kind && chip(d.kind, AM)}
                            {d.rows && <span style={{ fontSize: 8, color: '#666' }}>{d.rows}r</span>}
                          </div>
                          <ScoreBar sc={d._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Skills */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SKILLS ({task._skills.length})</div>
                    {task._skills.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No skill alignment</div>
                      : task._skills.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.domain && chip(s.domain, LM)}
                          </div>
                          <ScoreBar sc={s._score} color={LM} />
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
