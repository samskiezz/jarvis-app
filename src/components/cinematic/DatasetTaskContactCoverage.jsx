import { useState, useEffect, useCallback } from 'react';

const API = '';

const DTCOV_RE = /\b(dtcov|dataset[._-]?task[._-]?contact|dataset[._-]?governance|data[._-]?owner[._-]?task|orphaned[._-]?dataset|data[._-]?governance[._-]?gap|deployed[._-]?dataset|dataset[._-]?task[._-]?owner|contact[._-]?owns[._-]?dataset|who[._-]?owns[._-]?the[._-]?data)\b/i;

export function isDtcovQuery(t) {
  return DTCOV_RE.test(t || '');
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = ['datasets', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((d, i) => ({
    id:    d.id || String(i),
    name:  d.name || d.title || d.label || `Dataset ${i + 1}`,
    kind:  d.type || d.kind || d.category || d.format || '',
    rows:  d.row_count || d.rows || d.count || '',
    desc:  String(d.description || d.summary || d.detail || '').slice(0, 200),
    tags:  Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
    owner: d.owner || d.created_by || d.author || '',
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'records', 'missions'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.title || t.name || t.label || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.details || t.notes || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records', 'people'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    title: c.title || c.role || c.position || '',
    org:   c.company || c.organisation || c.organization || c.org || '',
    desc:  String(c.description || c.bio || c.notes || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(dsToks, other) {
  const otherToks = [
    ...tokens(other.name),
    ...tokens(other.title || other.kind || other.category || ''),
    ...tokens(other.status || other.priority || ''),
    ...tokens(other.desc || other.summary || ''),
    ...tokens(other.tags || ''),
    ...tokens(other.org || other.owner || ''),
  ].filter(Boolean);
  if (!dsToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (dsToks.has(t)) hits++;
  return hits / Math.max(dsToks.size, otherToks.length);
}

function correlate(datasets, tasks, contacts) {
  return datasets.map(ds => {
    const toks = new Set([
      ...tokens(ds.name),
      ...tokens(ds.kind),
      ...tokens(ds.desc),
      ...tokens(ds.tags),
      ...tokens(ds.owner),
    ].filter(Boolean));

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(toks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasTask    = matchedTasks.length > 0;
    const hasContact = matchedContacts.length > 0;

    let coverage;
    if (hasTask && hasContact) coverage = 'FULLY DEPLOYED';
    else if (hasTask)          coverage = 'TASKED';
    else if (hasContact)       coverage = 'ASSIGNED';
    else                       coverage = 'ORPHANED';

    return { ...ds, _tasks: matchedTasks, _contacts: matchedContacts, _coverage: coverage };
  });
}

export async function buildDtcovScript() {
  const [dsR, tR, cR] = await Promise.allSettled([
    fetch(`${API}/v1/datasets`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
  ]);
  const datasets  = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const tasks     = normaliseTasks(tR.status     === 'fulfilled' ? tR.value : []);
  const contacts  = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
  const enriched  = correlate(datasets, tasks, contacts);
  const fd  = enriched.filter(e => e._coverage === 'FULLY DEPLOYED').length;
  const tk  = enriched.filter(e => e._coverage === 'TASKED').length;
  const as  = enriched.filter(e => e._coverage === 'ASSIGNED').length;
  const or  = enriched.filter(e => e._coverage === 'ORPHANED').length;
  return (
    `Dataset × Task × Contact Triple Coverage: ${datasets.length} datasets cross-referenced against ` +
    `${tasks.length} tasks and ${contacts.length} contacts. ` +
    `${fd} FULLY DEPLOYED (task-backed + contact-owned); ` +
    `${tk} TASKED (active task, no contact owner); ` +
    `${as} ASSIGNED (contact found, no task alignment); ` +
    `${or} ORPHANED (no task or contact backing — data governance gap). ` +
    `Top orphaned datasets: ${enriched.filter(e => e._coverage === 'ORPHANED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 700;
const PANEL_H = 620;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';

const COVERAGE_COLOR = {
  'FULLY DEPLOYED': GR,
  'TASKED':         CY,
  'ASSIGNED':       AM,
  'ORPHANED':       '#555',
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

const TABS = ['ALL', 'FULLY DEPLOYED', 'TASKED', 'ASSIGNED', 'ORPHANED'];

export default function DatasetTaskContactCoverage() {
  const [open, setOpen]         = useState(false);
  const [datasets, setDatasets] = useState([]);
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
      const [dsR, tR, cR] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
      ]);
      const raw_ds = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      const raw_t  = normaliseTasks(tR.status     === 'fulfilled' ? tR.value : []);
      const raw_c  = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
      setDatasets(correlate(raw_ds, raw_t, raw_c));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:dtcov-toggle', toggle);
    return () => window.removeEventListener('jarvis:dtcov-toggle', toggle);
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
      const brief = await buildDtcovScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Dataset × Task × Contact governance coverage: ${brief}. Give a 2-sentence assessment of data governance posture focusing on orphaned datasets and fully deployed data assets.` }),
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
    const orphaned = datasets.filter(d => d._coverage === 'ORPHANED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Dataset × Task × Contact Triple Coverage (DTCOV)"
        style={{
          position: 'fixed', left: 742880, bottom: 8, zIndex: 355,
          background: orphaned > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${orphaned > 0 ? AM : CY + '44'}`,
          color: orphaned > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ DTCOV{orphaned > 0 ? ` ⚠${orphaned}` : ''}
      </button>
    );
  }

  const fd  = datasets.filter(d => d._coverage === 'FULLY DEPLOYED').length;
  const tk  = datasets.filter(d => d._coverage === 'TASKED').length;
  const as_ = datasets.filter(d => d._coverage === 'ASSIGNED').length;
  const or  = datasets.filter(d => d._coverage === 'ORPHANED').length;

  const visible = datasets.filter(d =>
    (tab === 'ALL' || d._coverage === tab) &&
    (!search || d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.kind.toLowerCase().includes(search.toLowerCase()) ||
      d.owner.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ DATASET × TASK × CONTACT GOVERNANCE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>DTCOV</span>
        {or > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {or} ORPHANED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['DATASETS',        datasets.length, CY],
          ['FULLY DEPLOYED',  fd,              GR],
          ['TASKED',          tk,              CY],
          ['ASSIGNED',        as_,             AM],
          ['ORPHANED',        or,              '#888'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {datasets.length > 0 && [
            [fd, GR], [tk, CY], [as_, AM], [or, '#444']
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${datasets.filter(d => d._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search datasets…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No datasets match filter.</div>}
        {visible.map(ds => {
          const color  = COVERAGE_COLOR[ds._coverage] || CY;
          const isExp  = expanded === ds.id;
          return (
            <div key={ds.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : ds.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.name}</span>
                {ds.kind && chip(ds.kind, '#888')}
                {ds.rows && chip(`${ds.rows} rows`, AM + '88')}
                {chip(ds._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({ds._tasks.length})</div>
                    {ds._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task coverage</div>
                      : ds._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status && chip(t.status, '#888')}
                            {t.priority && chip(t.priority, t.priority === 'CRITICAL' ? RD : t.priority === 'HIGH' ? AM : GR)}
                          </div>
                          <ScoreBar score={t._score} color={GR} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({ds._contacts.length})</div>
                    {ds._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : ds._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.title && chip(c.title, '#888')}
                            {c.org && chip(c.org, CY + '88')}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
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

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
