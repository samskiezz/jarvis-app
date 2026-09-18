import { useState, useEffect, useCallback } from 'react';

const API = '';

const CTOPT_RE = /\b(ctopt|contact[._-]?task[._-]?ops|task[._-]?ops[._-]?contact|operationally[._-]?engaged[._-]?contacts?|active[._-]?contact[._-]?ops|contact[._-]?ops[._-]?event[._-]?task|ops[._-]?engaged[._-]?contacts?|contact[._-]?operational[._-]?engagement)\b/i;

export function isCtoptQuery(t) {
  return CTOPT_RE.test(t || '');
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    email:   c.email || c.contact_email || '',
    company: c.company || c.organisation || c.employer || c.org || '',
    title:   c.title || c.role || c.position || '',
    desc:    String(c.description || c.notes || c.bio || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
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
    desc:     String(t.description || t.mission || t.summary || t.notes || '').slice(0, 200),
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
    name:     e.name || e.title || e.event || `Event ${i + 1}`,
    severity: e.severity || e.level || e.priority || '',
    type:     e.type || e.category || e.kind || '',
    desc:     String(e.description || e.summary || e.detail || '').slice(0, 200),
    tags:     Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contactToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title),
    ...tokens(other.status || other.severity || other.priority || ''),
    ...tokens(other.type || other.category || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!contactToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (contactToks.has(t)) hits++;
  return hits / Math.max(contactToks.size, otherToks.length);
}

function correlate(contacts, tasks, opsEvents) {
  return contacts.map(contact => {
    const toks = new Set([
      ...tokens(contact.name),
      ...tokens(contact.company),
      ...tokens(contact.title),
      ...tokens(contact.desc),
      ...tokens(contact.tags),
    ].filter(Boolean));

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(toks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedOps = opsEvents
      .map(e => ({ ...e, _score: matchScore(toks, e) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasTask = matchedTasks.length > 0;
    const hasOps  = matchedOps.length > 0;

    let coverage;
    if (hasTask && hasOps) coverage = 'FULLY ACTIVE';
    else if (hasTask)      coverage = 'TASKED';
    else if (hasOps)       coverage = 'OPS-TRIGGERED';
    else                   coverage = 'IDLE';

    return { ...contact, _tasks: matchedTasks, _ops: matchedOps, _coverage: coverage };
  });
}

export async function buildCtoptScript() {
  const [cR, tR, oR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const contacts   = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const tasks      = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
  const opsEvents  = normaliseOpsEvents(oR.status === 'fulfilled' ? oR.value : []);
  const enriched   = correlate(contacts, tasks, opsEvents);
  const fa   = enriched.filter(c => c._coverage === 'FULLY ACTIVE').length;
  const tsked = enriched.filter(c => c._coverage === 'TASKED').length;
  const ops  = enriched.filter(c => c._coverage === 'OPS-TRIGGERED').length;
  const idle = enriched.filter(c => c._coverage === 'IDLE').length;
  return (
    `Contact × Task × Ops Event Triple Coverage: ${contacts.length} contacts cross-referenced against ` +
    `${tasks.length} tasks and ${opsEvents.length} ops events. ` +
    `${fa} FULLY ACTIVE (task assigned + ops event triggered — operationally engaged); ` +
    `${tsked} TASKED (task found, no ops event alignment); ` +
    `${ops} OPS-TRIGGERED (ops event alignment, no task assigned); ` +
    `${idle} IDLE (no task or ops event — not operationally active). ` +
    `Operationally engaged: ${enriched.filter(c => c._coverage === 'FULLY ACTIVE').slice(0, 3).map(c => c.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY ACTIVE':   RD,
  'TASKED':         CY,
  'OPS-TRIGGERED':  AM,
  'IDLE':           '#555',
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

const TABS = ['ALL', 'FULLY ACTIVE', 'TASKED', 'OPS-TRIGGERED', 'IDLE'];

export default function ContactTaskOpsTriple() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
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
      const [cR, tR, oR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_t = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
      const raw_o = normaliseOpsEvents(oR.status === 'fulfilled' ? oR.value : []);
      setContacts(correlate(raw_c, raw_t, raw_o));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ctopt-toggle', toggle);
    return () => window.removeEventListener('jarvis:ctopt-toggle', toggle);
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
      const brief = await buildCtoptScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Contact operational engagement brief: ${brief}. Give a 2-sentence assessment of contact-task-ops engagement.` }),
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
    const faCount = contacts.filter(c => c._coverage === 'FULLY ACTIVE').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Task × Ops Event Triple Coverage (CTOPT)"
        style={{
          position: 'fixed', left: 723840, bottom: 8, zIndex: 321,
          background: faCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${faCount > 0 ? RD : CY + '44'}`,
          color: faCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ CTOPT{faCount > 0 ? ` ⚠${faCount}` : ''}
      </button>
    );
  }

  const fa    = contacts.filter(c => c._coverage === 'FULLY ACTIVE').length;
  const tsked = contacts.filter(c => c._coverage === 'TASKED').length;
  const ops   = contacts.filter(c => c._coverage === 'OPS-TRIGGERED').length;
  const idle  = contacts.filter(c => c._coverage === 'IDLE').length;

  const visible = contacts.filter(c =>
    (tab === 'ALL' || c._coverage === tab) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.company.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ CONTACT × TASK × OPS EVENT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>CTOPT</span>
        {fa > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {fa} ACTIVE</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['CONTACTS',      contacts.length, CY],
          ['FULLY ACTIVE',  fa,              RD],
          ['TASKED',        tsked,           CY],
          ['OPS-TRIGGERED', ops,             AM],
          ['IDLE',          idle,            '#555'],
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
          {contacts.length > 0 && [
            [fa, RD], [tsked, CY], [ops, AM], [idle, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${contacts.filter(c => c._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No contacts match filter.</div>}
        {visible.map(contact => {
          const color = COVERAGE_COLOR[contact._coverage] || CY;
          const isExp = expanded === contact.id;
          return (
            <div key={contact.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : contact.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                {contact.company && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{contact.company}</span>}
                {contact.title && chip(contact.title, '#888')}
                {chip(contact._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>TASKS ({contact._tasks.length})</div>
                    {contact._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task alignment</div>
                      : contact._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status && chip(t.status, CY)}
                            {t.priority && chip(t.priority, '#888')}
                          </div>
                          <ScoreBar score={t._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Ops Events */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>OPS EVENTS ({contact._ops.length})</div>
                    {contact._ops.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No ops event alignment</div>
                      : contact._ops.map(e => (
                        <div key={e.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                            {e.severity && chip(e.severity, e.severity?.toLowerCase?.().includes('crit') ? RD : AM)}
                            {e.type && chip(e.type, '#888')}
                          </div>
                          <ScoreBar score={e._score} color={AM} />
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
