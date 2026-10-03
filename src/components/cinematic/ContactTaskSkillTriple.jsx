import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const CTSKILL_RE = /\b(ctskill|contact\s+task\s+skill|contact\s+skill\s+task|equipped\s+contact|fully\s+equipped\s+contact|tasked\s+skilled\s+contact|contact\s+mission\s+skill|contact\s+capability\s+task)\b/i;

export function isCtskillQuery(t) { return CTSKILL_RE.test(t || ''); }

function kwContact(c) {
  return [c?.name, c?.email, c?.company, c?.title, c?.description,
          c?.role, c?.department, c?.tags, c?.org]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwTask(t) {
  return [t?.name, t?.title, t?.description, t?.mission,
          t?.priority, t?.tags, t?.type, t?.category]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwSkill(s) {
  return [s?.name, s?.title, s?.description, s?.category,
          s?.domain, s?.tags, s?.type]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildCtskillScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [cR, tR, sR] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/Task`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
  ]);

  const contacts = (cR.status === 'fulfilled'
    ? (cR.value?.data ?? cR.value?.contacts ?? cR.value ?? []) : []).slice(0, 200);
  const tasks = (tR.status === 'fulfilled'
    ? (tR.value?.data ?? tR.value?.tasks ?? tR.value ?? []) : []).slice(0, 200);
  const skills = (sR.status === 'fulfilled'
    ? (sR.value?.data ?? sR.value?.skills ?? sR.value ?? []) : []).slice(0, 200);

  let equipped = 0, taskedOnly = 0, skilledOnly = 0, dark = 0;
  for (const c of contacts) {
    const words = kwContact(c).split(/\s+/).filter(w => w.length > 3);
    const hasTask  = tasks.some(t => relevance(words, kwTask(t)) > 0.12);
    const hasSkill = skills.some(s => relevance(words, kwSkill(s)) > 0.12);
    if (hasTask && hasSkill) equipped++;
    else if (hasTask) taskedOnly++;
    else if (hasSkill) skilledOnly++;
    else dark++;
  }

  return `CTSKILL: ${contacts.length} contacts × ${tasks.length} tasks × ${skills.length} skills. ` +
    `${equipped} FULLY EQUIPPED (task+skill), ${taskedOnly} TASKED, ${skilledOnly} SKILLED, ${dark} DARK. ` +
    (dark > 0
      ? `${dark} contacts have no task or skill coverage — personnel capability gaps.`
      : 'All contacts have task or skill coverage.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const GR  = '#22C55E';
const LM  = '#84CC16';
const AM  = '#F59E0B';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY EQUIPPED': GR, TASKED: LM, SKILLED: AM, DARK: GY };

export default function ContactTaskSkillTriple() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [skills, setSkills]     = useState([]);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:ctskill-toggle', h);
    return () => window.removeEventListener('jarvis:ctskill-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [cR, tR, sR] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/Task`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
      ]);
      const cts = (cR.status === 'fulfilled'
        ? (cR.value?.data ?? cR.value?.contacts ?? cR.value ?? []) : []).slice(0, 200);
      const tks = (tR.status === 'fulfilled'
        ? (tR.value?.data ?? tR.value?.tasks ?? tR.value ?? []) : []).slice(0, 200);
      const sks = (sR.status === 'fulfilled'
        ? (sR.value?.data ?? sR.value?.skills ?? sR.value ?? []) : []).slice(0, 200);
      setContacts(cts);
      setTasks(tks);
      setSkills(sks);

      const built = cts.map(c => {
        const words = kwContact(c).split(/\s+/).filter(w => w.length > 3);
        const matchedTasks = tks
          .map(t => ({ ...t, _r: relevance(words, kwTask(t)) }))
          .filter(t => t._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedSkills = sks
          .map(s => ({ ...s, _r: relevance(words, kwSkill(s)) }))
          .filter(s => s._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasTask  = matchedTasks.length > 0;
        const hasSkill = matchedSkills.length > 0;
        const state = hasTask && hasSkill ? 'FULLY EQUIPPED'
          : hasTask  ? 'TASKED'
          : hasSkill ? 'SKILLED'
          : 'DARK';
        return { ...c, matchedTasks, matchedSkills, state };
      });
      setRows(built);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const equipped    = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
  const taskedOnly  = rows.filter(r => r.state === 'TASKED').length;
  const skilledOnly = rows.filter(r => r.state === 'SKILLED').length;
  const dark        = rows.filter(r => r.state === 'DARK').length;
  const total       = rows.length || 1;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwContact(r).includes(s); }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message:
          `Summarise contact task and skill coverage in 2 sentences: ${equipped} FULLY EQUIPPED (task+skill), ${taskedOnly} TASKED, ${skilledOnly} SKILLED, ${dark} DARK out of ${rows.length} contacts. Tasks: ${tasks.length}, Skills: ${skills.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 806160, bottom: 8, zIndex: 468, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ CTSKILL</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>CONTACT × TASK × SKILL</span>
        {equipped > 0 && (
          <span style={{ marginLeft: 'auto', background: LM, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{equipped} EQUIPPED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: equipped > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['CONTACTS',  contacts.length, CY],
          ['TASKS',     tasks.length,    LM],
          ['SKILLS',    skills.length,   AM],
          ['EQUIPPED',  equipped,        GR],
          ['TASKED',    taskedOnly,      LM],
          ['SKILLED',   skilledOnly,     AM],
          ['DARK',      dark,            GY],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: 'rgba(0,212,255,0.05)', borderRadius: 6,
            padding: '4px 2px', textAlign: 'center' }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 12 }}>{loading ? '…' : val}</div>
            <div style={{ color: '#4A6080', fontSize: 7, letterSpacing: 0.5 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ display: 'flex', height: 4, margin: '0 12px 8px', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${(equipped    / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(taskedOnly  / total) * 100}%`, background: LM }} />
        <div style={{ width: `${(skilledOnly / total) * 100}%`, background: AM }} />
        <div style={{ width: `${(dark        / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY EQUIPPED', 'TASKED', 'SKILLED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${CY2}`,
            background: 'transparent', color: CY2, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ width: '100%', background: 'rgba(0,212,255,0.05)', border: `1px solid ${BD}`,
            borderRadius: 4, padding: '4px 8px', color: '#DCEBF5', fontSize: 10,
            outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#4A6080', padding: '12px 0', textAlign: 'center' }}>loading…</div>}
        {!loading && filtered.map((r, i) => {
          const id    = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          const label = r.name ?? r.email ?? r.company ?? '—';
          const stateCol = STATE_COL[r.state] ?? GY;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateCol, fontSize: 8, minWidth: 110,
                  fontWeight: 700, letterSpacing: 0.5 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {(r.title ?? r.role) && (
                  <span style={{ color: '#4A6080', fontSize: 9 }}>{r.title ?? r.role}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '4px 0 8px' }}>
                  {r.matchedTasks.length === 0 && r.matchedSkills.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no task or skill matched this contact
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'rgba(132,204,22,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: LM, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          TASKS ({r.matchedTasks.length})
                        </div>
                        {r.matchedTasks.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedTasks.map((t, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 130 }}>{t.name ?? t.title ?? `Task ${k + 1}`}</span>
                                {(t.priority ?? t.status) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>
                                    {t.priority ?? t.status}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(132,204,22,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(t._r * 100)}%`, background: LM }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1, background: 'rgba(245,158,11,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: AM, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          SKILLS ({r.matchedSkills.length})
                        </div>
                        {r.matchedSkills.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedSkills.map((s, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 130 }}>{s.name ?? s.title ?? `Skill ${k + 1}`}</span>
                                {(s.category ?? s.domain) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>
                                    {s.category ?? s.domain}
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(245,158,11,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(s._r * 100)}%`, background: AM }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#4A6080', textAlign: 'center', padding: '12px 0' }}>no results</div>
        )}
      </div>
    </div>
  );
}
