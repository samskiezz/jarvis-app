import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TSKIV_RE = /\b(tskiv|task[\s_-]*skill[\s_-]*invest(?:igation)?|task[\s_-]*aip[\s_-]*skill|skill[\s_-]*task[\s_-]*invest(?:igation)?|task[\s_-]*invest(?:igation)?[\s_-]*skill|skill[\s_-]*task[\s_-]*case|assigned[\s_-]*task[\s_-]*skill|unassigned[\s_-]*task[\s_-]*skill|task[\s_-]*case[\s_-]*skill|mission[\s_-]*skill[\s_-]*invest(?:igation)?|task[\s_-]*skill[\s_-]*case|task[\s_-]*fully[\s_-]*equipped|task[\s_-]*skill[\s_-]*gap[\s_-]*invest(?:igation)?)\b/i;

const THRESHOLD = 0.07;

export function isTskivQuery(t) { return TSKIV_RE.test(t || ''); }

export async function buildTskivScript() {
  try {
    const [taskRes, skillRes, invRes] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
    ]);
    const tasks = Array.isArray(taskRes) ? taskRes : (taskRes?.items || taskRes?.data || []);
    const skills = Array.isArray(skillRes) ? skillRes : (skillRes?.skills || skillRes?.items || skillRes?.data || []);
    const invs = Array.isArray(invRes) ? invRes : (invRes?.investigations || invRes?.items || invRes?.data || []);
    let fullyEquipped = 0, skillArmed = 0, caseActive = 0, unassigned = 0;
    for (const task of tasks) {
      const raw = [task.title, task.name, task.description, task.status, task.priority, ...(task.tags || [])].join(' ');
      const toks = tok(raw);
      const hasSkill = skills.some(s => matchScore(toks, [s.name, s.title, s.category, s.description, ...(s.tags || [])].join(' ')) >= THRESHOLD);
      const hasInv = invs.some(i => matchScore(toks, [i.title, i.name, i.case_id, i.description, i.status, ...(i.tags || [])].join(' ')) >= THRESHOLD);
      if (hasSkill && hasInv) fullyEquipped++;
      else if (hasSkill) skillArmed++;
      else if (hasInv) caseActive++;
      else unassigned++;
    }
    const total = tasks.length || 1;
    const pct = Math.round(((fullyEquipped + skillArmed + caseActive) / total) * 100);
    return `TSKIV coverage: ${tasks.length} tasks × ${skills.length} AIP skills × ${invs.length} investigations. Fully equipped (skill+investigation): ${fullyEquipped} (${Math.round(fullyEquipped/total*100)}%). Skill-armed only: ${skillArmed}. Case-active only: ${caseActive}. Unassigned: ${unassigned} (${Math.round(unassigned/total*100)}% — mission gap). Overall assignment coverage: ${pct}%.`;
  } catch {
    return 'TSKIV: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

function normaliseTask(raw) {
  return {
    id: raw.id || raw._id || raw.task_id || String(Math.random()),
    title: raw.title || raw.name || raw.task_id || 'Untitled Task',
    status: raw.status || '',
    priority: raw.priority || '',
    description: raw.description || '',
    tags: raw.tags || [],
    _raw: [raw.title, raw.name, raw.description, raw.status, raw.priority, ...(raw.tags || [])].join(' '),
  };
}

function normaliseSkill(raw) {
  return {
    id: raw.id || raw._id || raw.skill_id || String(Math.random()),
    name: raw.name || raw.title || raw.skill_id || 'Unnamed Skill',
    category: raw.category || '',
    score: raw.score ?? raw.proficiency ?? null,
    _raw: [raw.name, raw.title, raw.category, raw.description, ...(raw.tags || [])].join(' '),
  };
}

function normaliseInv(raw) {
  return {
    id: raw.id || raw._id || raw.case_id || String(Math.random()),
    title: raw.title || raw.name || raw.case_id || 'Untitled Case',
    status: raw.status || '',
    _raw: [raw.title, raw.name, raw.case_id, raw.description, raw.status, ...(raw.tags || [])].join(' '),
  };
}

function classifyTask(task, skills, invs) {
  const toks = tok(task._raw);
  const matchedSkills = skills.filter(s => matchScore(toks, s._raw) >= THRESHOLD)
    .map(s => ({ ...s, score: matchScore(toks, s._raw) }))
    .sort((a, b) => b.score - a.score);
  const matchedInvs = invs.filter(i => matchScore(toks, i._raw) >= THRESHOLD)
    .map(i => ({ ...i, score: matchScore(toks, i._raw) }))
    .sort((a, b) => b.score - a.score);
  const hasSkill = matchedSkills.length > 0;
  const hasInv = matchedInvs.length > 0;
  let state;
  if (hasSkill && hasInv) state = 'FULLY_EQUIPPED';
  else if (hasSkill) state = 'SKILL_ARMED';
  else if (hasInv) state = 'CASE_ACTIVE';
  else state = 'UNASSIGNED';
  return { ...task, state, matchedSkills, matchedInvs };
}

const STATE_COLOR = {
  FULLY_EQUIPPED: '#06b6d4',
  SKILL_ARMED: '#8b5cf6',
  CASE_ACTIVE: '#f59e0b',
  UNASSIGNED: '#4a5568',
};

const STATE_LABEL = {
  FULLY_EQUIPPED: 'FULLY EQUIPPED',
  SKILL_ARMED: 'SKILL ARMED',
  CASE_ACTIVE: 'CASE ACTIVE',
  UNASSIGNED: 'UNASSIGNED',
};

export default function TaskSkillInvestigationTriple() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [brief, setBrief] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRes, skillRes, invRes] = await Promise.all([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      ]);
      const tasks = (Array.isArray(taskRes) ? taskRes : (taskRes?.items || taskRes?.data || [])).map(normaliseTask);
      const skills = (Array.isArray(skillRes) ? skillRes : (skillRes?.skills || skillRes?.items || skillRes?.data || [])).map(normaliseSkill);
      const invs = (Array.isArray(invRes) ? invRes : (invRes?.investigations || invRes?.items || invRes?.data || [])).map(normaliseInv);
      setItems(tasks.map(t => classifyTask(t, skills, invs)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:tskiv-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tskiv-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async (task) => {
    setAssessing(task.id);
    try {
      const prompt = `Task "${task.title}" (status: ${task.status || 'unknown'}, priority: ${task.priority || 'unknown'}) — coverage state: ${STATE_LABEL[task.state]}. Matched skills: ${task.matchedSkills.map(s => s.name).join(', ') || 'none'}. Matched investigations: ${task.matchedInvs.map(i => i.title).join(', ') || 'none'}. Give a 2-sentence operational brief on this task's skill and investigation coverage, and recommend the highest-priority next action.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const d = r.ok ? await r.json() : {};
      const text = d.response || d.text || d.message || 'No assessment available.';
      setBrief(b => ({ ...b, [task.id]: text }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief(b => ({ ...b, [task.id]: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  }, []);

  if (!open) return null;

  const fullyEquipped = items.filter(i => i.state === 'FULLY_EQUIPPED').length;
  const skillArmed = items.filter(i => i.state === 'SKILL_ARMED').length;
  const caseActive = items.filter(i => i.state === 'CASE_ACTIVE').length;
  const unassigned = items.filter(i => i.state === 'UNASSIGNED').length;
  const total = items.length || 1;
  const equippedPct = Math.round(fullyEquipped / total * 100);

  const visible = items.filter(it => {
    if (filter !== 'ALL' && it.state !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!it.title.toLowerCase().includes(s) && !it.status.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const barSegs = [
    { state: 'FULLY_EQUIPPED', count: fullyEquipped },
    { state: 'SKILL_ARMED', count: skillArmed },
    { state: 'CASE_ACTIVE', count: caseActive },
    { state: 'UNASSIGNED', count: unassigned },
  ];

  const TILE = { minWidth: 80, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', textAlign: 'center' };
  const CY = '#06b6d4';

  return (
    <div style={{
      position: 'fixed', left: 871120, bottom: 8, zIndex: 564,
      width: 520, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,11,18,0.97)', border: `1px solid ${CY}44`,
      borderRadius: 12, boxShadow: `0 0 40px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${CY}22`, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 15, textShadow: `0 0 10px ${CY}` }}>◈</span>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>TSKIV</span>
        <span style={{ fontSize: 10, color: '#6E8AA0', marginLeft: 4 }}>TASK × SKILL × INVESTIGATION</span>
        {loading && <span style={{ marginLeft: 'auto', fontSize: 10, color: CY, opacity: 0.7 }}>loading…</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: '#DCEBF5' }}>{items.length}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>TASKS</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.FULLY_EQUIPPED }}>{fullyEquipped}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>FULLY EQUIPPED</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.SKILL_ARMED }}>{skillArmed}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>SKILL ARMED</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.CASE_ACTIVE }}>{caseActive}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>CASE ACTIVE</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.UNASSIGNED }}>{unassigned}</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>UNASSIGNED</div></div>
        <div style={TILE}><div style={{ fontSize: 16, fontWeight: 700, color: STATE_COLOR.FULLY_EQUIPPED }}>{equippedPct}%</div><div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 2 }}>EQUIPPED %</div></div>
      </div>

      {/* Coverage bar */}
      <div style={{ height: 6, display: 'flex', margin: '0 14px 10px', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
        {barSegs.map(seg => (
          <div key={seg.state} style={{ flex: seg.count || 0.01, background: STATE_COLOR[seg.state], transition: 'flex 0.4s' }} title={`${STATE_LABEL[seg.state]}: ${seg.count}`} />
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_EQUIPPED', 'SKILL_ARMED', 'CASE_ACTIVE', 'UNASSIGNED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '3px 9px', borderRadius: 4, fontSize: 9, cursor: 'pointer', letterSpacing: 1,
            border: `1px solid ${filter === f ? CY : '#2a3a4a'}`,
            background: filter === f ? `${CY}22` : 'transparent',
            color: filter === f ? CY : '#6E8AA0',
          }}>{f.replace(/_/g, ' ')}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '5px 10px', borderRadius: 6, fontSize: 11,
            background: 'rgba(255,255,255,0.04)', border: `1px solid #2a3a4a`, color: '#DCEBF5', outline: 'none' }}
        />
      </div>

      {/* Item list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#4a5568', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>No tasks match.</div>
        )}
        {visible.map(task => {
          const isExp = expanded === task.id;
          const col = STATE_COLOR[task.state];
          return (
            <div key={task.id} style={{ marginBottom: 6, borderRadius: 7, border: `1px solid ${isExp ? col + '66' : '#1e2d3d'}`, background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'border 0.2s' }}>
              <div onClick={() => setExpanded(isExp ? null : task.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0, boxShadow: `0 0 6px ${col}` }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                {task.status && <span style={{ fontSize: 9, color: '#6E8AA0', marginLeft: 4 }}>{task.status.toUpperCase()}</span>}
                {task.priority && <span style={{ fontSize: 9, background: '#1e2d3d', color: col, borderRadius: 3, padding: '1px 5px' }}>{task.priority}</span>}
                <span style={{ fontSize: 9, color: col, letterSpacing: 1, marginLeft: 4 }}>{STATE_LABEL[task.state]}</span>
                <span style={{ color: '#4a5568', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  {/* Split pane */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {/* Skills */}
                    <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(139,92,246,0.2)' }}>
                      <div style={{ fontSize: 9, color: '#8b5cf6', letterSpacing: 1, marginBottom: 6 }}>AIP SKILLS ({task.matchedSkills.length})</div>
                      {task.matchedSkills.length === 0 ? (
                        <div style={{ fontSize: 10, color: '#4a5568' }}>No skill match</div>
                      ) : task.matchedSkills.slice(0, 4).map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.name}</span>
                            {s.category && <span style={{ fontSize: 8, background: 'rgba(139,92,246,0.3)', color: '#8b5cf6', borderRadius: 3, padding: '1px 4px' }}>{s.category}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: '#1e2d3d' }}>
                            <div style={{ height: '100%', width: `${Math.round(s.score * 100)}%`, background: '#8b5cf6', borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Investigations */}
                    <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <div style={{ fontSize: 9, color: '#f59e0b', letterSpacing: 1, marginBottom: 6 }}>INVESTIGATIONS ({task.matchedInvs.length})</div>
                      {task.matchedInvs.length === 0 ? (
                        <div style={{ fontSize: 10, color: '#4a5568' }}>No case match</div>
                      ) : task.matchedInvs.slice(0, 4).map(i => (
                        <div key={i.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{i.title}</span>
                            {i.status && <span style={{ fontSize: 8, background: 'rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: 3, padding: '1px 4px' }}>{i.status}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: '#1e2d3d' }}>
                            <div style={{ height: '100%', width: `${Math.round(i.score * 100)}%`, background: '#f59e0b', borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Brief */}
                  {brief[task.id] && (
                    <div style={{ fontSize: 10, color: '#DCEBF5', background: 'rgba(255,255,255,0.03)', borderRadius: 5, padding: '6px 8px', marginBottom: 6, lineHeight: 1.5 }}>
                      {brief[task.id]}
                    </div>
                  )}

                  <button onClick={() => assess(task)} disabled={assessing === task.id} style={{
                    padding: '4px 12px', borderRadius: 5, fontSize: 10, cursor: assessing === task.id ? 'wait' : 'pointer',
                    border: `1px solid ${CY}66`, background: `${CY}18`, color: CY, letterSpacing: 1,
                  }}>{assessing === task.id ? 'ASSESSING…' : '▶ ASSESS'}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px', borderTop: `1px solid ${CY}18`, fontSize: 9, color: '#4a5568', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <span>/entities/Task × /v1/aip/skill × /v1/investigations</span>
        <span>90s refresh</span>
      </div>
    </div>
  );
}
