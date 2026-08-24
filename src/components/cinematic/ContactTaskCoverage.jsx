import { useState, useEffect, useCallback } from 'react';

const API = '';

const CTSK_RE = /\b(contact[._-]?task|task[._-]?contact|ctsk|tasked[._-]?contacts?|contact[._-]?ops[._-]?task|contact[._-]?task[._-]?coverage|contacts[._-]?with[._-]?tasks?|contact[._-]?mission|contact[._-]?assignment|who[._-]?has[._-]?tasks?)\b/i;

export function isCtskQuery(t) {
  return CTSK_RE.test(t || '');
}

export async function buildCtskScript() {
  const [contR, taskR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const contacts = normaliseContacts(contR.status === 'fulfilled' ? contR.value : []);
  const tasks    = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const enriched = correlate(contacts, tasks);
  const tasked   = enriched.filter(c => c._tasked).length;
  const untasked = enriched.length - tasked;
  return (
    `Contact × Task Coverage: ${contacts.length} contacts, ${tasks.length} tasks indexed. ` +
    `${tasked} contacts are TASKED (at least one task covers their domain); ${untasked} are UNTASKED (no task alignment). ` +
    `Top tasked: ${enriched.filter(c => c._tasked).slice(0, 4).map(c => c.name || c.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseContacts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'contacts', 'entities', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:          t.id || String(i),
    name:        t.name || t.title || t.mission || `Task ${i + 1}`,
    description: String(t.description || t.summary || t.notes || '').slice(0, 300),
    status:      t.status || t.state || '',
    priority:    t.priority || t.urgency || '',
    tags:        Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contact, task) {
  const ctToks = new Set([
    ...tokens(contact.name),
    ...tokens(contact.title),
    ...tokens(contact.email),
    ...tokens(contact.company),
    ...tokens(contact.description),
    ...tokens(contact.role),
    ...tokens(contact.tags),
  ].filter(Boolean));
  const tskToks = [
    ...tokens(task.name),
    ...tokens(task.description),
    ...tokens(task.tags),
    ...tokens(task.priority),
  ].filter(Boolean);
  if (!ctToks.size || !tskToks.length) return 0;
  let hits = 0;
  for (const t of tskToks) if (ctToks.has(t)) hits++;
  return hits / Math.max(ctToks.size, tskToks.length);
}

function correlate(contacts, tasks) {
  return contacts.map(contact => {
    const scored = tasks
      .map(t => ({ ...t, _score: matchScore(contact, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...contact, _tasked: scored.length > 0, _matches: scored };
  });
}

function priorityColor(pri) {
  const p = String(pri || '').toLowerCase();
  if (p.includes('critical') || p.includes('urgent') || p.includes('high')) return '#EF4444';
  if (p.includes('medium') || p.includes('normal'))                          return '#F59E0B';
  if (p.includes('low') || p.includes('minor'))                              return '#22C55E';
  return '#6E8AA0';
}

function statusColor(st) {
  const s = String(st || '').toLowerCase();
  if (s.includes('done') || s.includes('complete')) return '#22C55E';
  if (s.includes('progress') || s.includes('active') || s.includes('running')) return '#00CFFF';
  if (s.includes('block') || s.includes('fail'))    return '#EF4444';
  return '#6E8AA0';
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const TL = '#14B8A6';
const GR = '#22C55E';
const AM = '#F59E0B';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = TL) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function ContactTaskCoverage() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contR, taskR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      setContacts(normaliseContacts(contR.status === 'fulfilled' ? contR.value : []));
      setTasks(normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ctsk-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ctsk-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(contacts, tasks);
  const tasked   = enriched.filter(c => c._tasked);
  const untasked = enriched.filter(c => !c._tasked);
  const badgeCount = tasked.length;
  const badgeColor = badgeCount > 0 ? TL : '#6E8AA0';

  const filtered = enriched
    .filter(c => tab === 'ALL' || (tab === 'TASKED' ? c._tasked : !c._tasked))
    .filter(c => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(c.name || '').toLowerCase().includes(s) ||
        String(c.title || '').toLowerCase().includes(s) ||
        String(c.company || c.org || '').toLowerCase().includes(s) ||
        String(c.email || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message:
            `You have ${contacts.length} contacts and ${tasks.length} active tasks. ` +
            `${tasked.length} contacts are TASKED (a task covers their operational domain); ` +
            `${untasked.length} are UNTASKED (no task alignment — contact not operationally engaged). ` +
            `Give a 2-sentence contact-task coverage brief highlighting the most significant gap or opportunity.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = c => c.name || c.title || c.id || '?';

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Contact × Task Coverage (CTSK)"
        style={{
          position: 'fixed', left: 709840, bottom: 8, zIndex: 296,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ CTSK
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9201,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${TL}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${TL}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${TL}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: TL, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${TL}` }}>
              ◈ CONTACT × TASK COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${TL}55`,
                  background: 'transparent', color: TL, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'CONTACTS', val: contacts.length, col: CY },
              { label: 'TASKS',    val: tasks.length,    col: '#A78BFA' },
              { label: 'TASKED',   val: tasked.length,   col: TL },
              { label: 'UNTASKED', val: untasked.length, col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'TASKED', 'UNTASKED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? TL : '#2a3a4a'}`,
                  background: tab === t ? `${TL}22` : 'transparent',
                  color: tab === t ? TL : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          {/* Contact list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No contacts found.'}
              </div>
            ) : filtered.map((contact, i) => {
              const isExp     = expanded === i;
              const statusClr = contact._tasked ? TL : AM;
              return (
                <div
                  key={contact.id || i}
                  style={{ borderBottom: `1px solid ${TL}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusClr,
                      boxShadow: `0 0 6px ${statusClr}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(contact)}</span>
                    {(contact.company || contact.org) && chip(contact.company || contact.org, '#A78BFA')}
                    {contact.title  && chip(contact.title, '#6E8AA0')}
                    {chip(contact._tasked ? 'TASKED' : 'UNTASKED', statusClr)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {contact._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED TASKS
                          </div>
                          {contact._matches.map((task, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {task.name || task.id || '?'}
                              </span>
                              {task.priority && chip(task.priority, priorityColor(task.priority))}
                              {task.status   && chip(task.status,   statusColor(task.status))}
                              {scorebar(task._score, TL)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No tasks matched this contact.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${TL}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(20,184,166,0.03)',
            }}>
              <span style={{ color: TL, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
