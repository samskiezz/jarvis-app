/**
 * F274 — AIP Skill × Contact × Task Mesh (SCTM)
 *
 * Answers: "For each JARVIS AIP skill, is there a contact who could own it AND
 * an active task that requires it?"
 *
 * STAFFED_AND_TASKED  — at least one contact AND one task match this skill.
 * STAFFED_ONLY        — a contact is associated but no task currently needs it.
 * TASKED_ONLY         — a task requires this skill but no contact is linked.
 * ORPHANED            — neither contact nor task — unused skill / gap.
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/aip/skill       → JARVIS skill catalog
 *   GET /entities/Contact   → contact roster
 *   GET /entities/Task      → active task list
 *
 * Stat tiles:  skills / contacts / tasks / staffed-and-tasked / staffed-only /
 *              tasked-only / orphaned
 * Amber badge: orphaned count on button.
 * Expand row:  matched contacts with role badge + relevance bar
 *              + matched tasks with priority/status badge + relevance bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCTM  at left:6120 bottom:18, zIndex:68.
 * Event:   jarvis:sctm-toggle
 * Voice:   "skill contact task / sctm / orphaned skills / staffed skills /
 *           which skills have owners / skill task mesh / aip skill mesh /
 *           skill coverage / skill staff / task skill match"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const SCTM_RE =
  /\b(skill[._-]?contact[._-]?task|sctm|orphaned[._-]?skills?|staffed[._-]?skills?|skill[._-]?task[._-]?mesh|aip[._-]?skill[._-]?mesh|skill[._-]?coverage|skill[._-]?staff|task[._-]?skill[._-]?match|which[._-]?skills[._-]?have[._-]?owners?)\b/i;

export function isSctmQuery(t) {
  return SCTM_RE.test(t || '');
}

// ─── normalisers ─────────────────────────────────────────────────────────────

function normSkills(raw) {
  if (!raw) return [];
  for (const k of ['skills', 'aip_skills', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normContacts(raw) {
  if (!raw) return [];
  for (const k of ['contacts', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normTasks(raw) {
  if (!raw) return [];
  for (const k of ['tasks', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function skillTokens(sk) {
  return tokens(
    [sk.name, sk.description, sk.category, sk.type, sk.domain,
     sk.capability, sk.skill_id, sk.id,
     ...(Array.isArray(sk.tags) ? sk.tags : [])].join(' ')
  );
}

function contactTokens(c) {
  return tokens(
    [c.name, c.email, c.organization, c.org, c.role, c.title,
     c.description, c.sector, c.region,
     ...(Array.isArray(c.tags) ? c.tags : [])].join(' ')
  );
}

function taskTokens(t) {
  return tokens(
    [t.name, t.title, t.description, t.objective, t.type,
     t.category, t.priority, t.status, t.assignee,
     ...(Array.isArray(t.tags) ? t.tags : [])].join(' ')
  );
}

function score(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const a = new Set(aToks);
  const b = new Set(bToks);
  let hits = 0;
  for (const tt of a) if (b.has(tt)) hits++;
  return hits / Math.max(a.size, b.size);
}

// ─── enrichment ───────────────────────────────────────────────────────────────

const THRESHOLD = 0.05;

function enrich(skills, contacts, tasks) {
  return skills.map(sk => {
    const st = skillTokens(sk);
    const cMatches = contacts
      .map(c => ({ c, score: score(st, contactTokens(c)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const tMatches = tasks
      .map(t => ({ t, score: score(st, taskTokens(t)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasC = cMatches.length > 0;
    const hasT = tMatches.length > 0;
    const _class = hasC && hasT
      ? 'STAFFED_AND_TASKED'
      : hasC
      ? 'STAFFED_ONLY'
      : hasT
      ? 'TASKED_ONLY'
      : 'ORPHANED';
    return { ...sk, _class, _cMatches: cMatches, _tMatches: tMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildSctmScript() {
  const [skR, cR, tR] = await Promise.allSettled([
    fetch(`${API}/v1/aip/skill`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const skills   = normSkills(skR.status === 'fulfilled' ? skR.value : []);
  const contacts = normContacts(cR.status === 'fulfilled' ? cR.value : []);
  const tasks    = normTasks(tR.status === 'fulfilled' ? tR.value : []);
  const enriched = enrich(skills, contacts, tasks);
  const orphaned = enriched.filter(e => e._class === 'ORPHANED').length;
  const full     = enriched.filter(e => e._class === 'STAFFED_AND_TASKED').length;
  const orphanedNames = enriched
    .filter(e => e._class === 'ORPHANED').slice(0, 3)
    .map(e => e.name || e.skill_id || e.id).join(', ');
  return (
    `AIP Skill × Contact × Task Mesh: ${skills.length} skills cross-referenced against ` +
    `${contacts.length} contacts and ${tasks.length} tasks. ` +
    `${full} skills are STAFFED_AND_TASKED (owner + live task); ${orphaned} are ORPHANED — ` +
    `no contact or task references them (gaps: ${orphanedNames || 'none'}).`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const PRP = '#B485FF';
const RED = '#FF4D6D';

const CLASS_COL = {
  STAFFED_AND_TASKED: GRN,
  STAFFED_ONLY:       CY,
  TASKED_ONLY:        PRP,
  ORPHANED:           AMB,
};

const FILTER_TABS = ['ALL', 'STAFFED_AND_TASKED', 'STAFFED_ONLY', 'TASKED_ONLY', 'ORPHANED'];

const PRIORITY_COL = { critical: RED, high: AMB, medium: CY, low: GRN };
const STATUS_COL   = { done: GRN, complete: GRN, completed: GRN, active: CY, pending: AMB, blocked: RED };

const BASE = {
  position: 'fixed',
  fontFamily: "'JetBrains Mono', monospace",
  color: '#DCEBF5',
  zIndex: 68,
};

const PANEL = {
  ...BASE,
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(4,8,14,0.92)',
  backdropFilter: 'blur(14px)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

function Tile({ label, value, col }) {
  return (
    <div style={{ flex: '1 1 90px', minWidth: 90, padding: '8px 10px', background: 'rgba(41,231,255,0.04)',
      border: `1px solid ${col || CY}33`, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col || CY }}>{value ?? '—'}</div>
      <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Bar({ pct, col }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, borderRadius: 2,
        background: col || CY, transition: 'width 0.4s' }} />
    </div>
  );
}

function Badge({ label, col }) {
  return (
    <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
      border: `1px solid ${col || CY}55`, color: col || CY, letterSpacing: 1 }}>
      {label}
    </span>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function AipSkillContactTaskMesh() {
  const [open, setOpen]       = useState(false);
  const [skills, setSkills]   = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks]     = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const headers = { Authorization: `Bearer ${API_KEY}` };

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [skR, cR, tR] = await Promise.allSettled([
        fetch(`${API}/v1/aip/skill`, { headers }).then(r => r.json()),
        fetch(`${API}/entities/Contact`, { headers }).then(r => r.json()),
        fetch(`${API}/entities/Task`, { headers }).then(r => r.json()),
      ]);
      const sk = normSkills(skR.status === 'fulfilled' ? skR.value : []);
      const c  = normContacts(cR.status === 'fulfilled' ? cR.value : []);
      const t  = normTasks(tR.status === 'fulfilled' ? tR.value : []);
      setSkills(sk); setContacts(c); setTasks(t);
      setEnriched(enrich(sk, c, t));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sctm-toggle', handler);
    return () => window.removeEventListener('jarvis:sctm-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90_000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  const orphaned = enriched.filter(e => e._class === 'ORPHANED').length;
  const full     = enriched.filter(e => e._class === 'STAFFED_AND_TASKED').length;
  const staffed  = enriched.filter(e => e._class === 'STAFFED_ONLY').length;
  const tasked   = enriched.filter(e => e._class === 'TASKED_ONLY').length;

  const visible = enriched.filter(e => {
    if (filter !== 'ALL' && e._class !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [e.name, e.description, e.category, e.id, e.skill_id]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const handleAssess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const prompt =
        `AIP Skill × Contact × Task Mesh summary: ${skills.length} skills, ${contacts.length} contacts, ` +
        `${tasks.length} tasks. ${full} STAFFED_AND_TASKED, ${staffed} STAFFED_ONLY, ` +
        `${tasked} TASKED_ONLY, ${orphaned} ORPHANED. ` +
        `Top orphaned skills: ${enriched.filter(e => e._class === 'ORPHANED')
          .slice(0, 3).map(e => e.name || e.id).join(', ') || 'none'}. ` +
        `Provide a 2-sentence operational intelligence brief on skill coverage gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const text = res.response || res.content || res.message || res.text || '';
      setAssessText(text);
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessText('Assessment unavailable: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="AIP Skill × Contact × Task Mesh (SCTM)"
        style={{
          ...BASE,
          left: 6120, bottom: 18, padding: '4px 10px',
          background: 'rgba(4,8,14,0.75)',
          border: `1px solid ${orphaned > 0 ? AMB : CY}55`,
          borderRadius: 6, cursor: 'pointer', fontSize: 11,
          color: orphaned > 0 ? AMB : CY,
          boxShadow: orphaned > 0 ? `0 0 12px ${AMB}33` : 'none',
        }}
      >
        ◈ SCTM{orphaned > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: '#04060A',
            borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
            {orphaned}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      {/* header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${CY}22`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          ◈ AIP SKILL × CONTACT × TASK MESH
        </span>
        {orphaned > 0 && (
          <span style={{ background: AMB, color: '#04060A', borderRadius: 8,
            padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
            {orphaned} ORPHANED
          </span>
        )}
        {loading && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6E8AA0' }}>loading…</span>}
        {error && <span style={{ marginLeft: 'auto', fontSize: 10, color: RED }}>{error}</span>}
        <button onClick={() => setOpen(false)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none',
            color: '#6E8AA0', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 18px',
        flexShrink: 0, borderBottom: `1px solid ${CY}11` }}>
        <Tile label="SKILLS"   value={skills.length}   col={CY} />
        <Tile label="CONTACTS" value={contacts.length}  col={CY} />
        <Tile label="TASKS"    value={tasks.length}     col={CY} />
        <Tile label="FULL"     value={full}             col={GRN} />
        <Tile label="STAFFED"  value={staffed}          col={CY} />
        <Tile label="TASKED"   value={tasked}           col={PRP} />
        <Tile label="ORPHANED" value={orphaned}         col={AMB} />
      </div>

      {/* filter + search */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 18px', flexShrink: 0,
        flexWrap: 'wrap', borderBottom: `1px solid ${CY}11` }}>
        {FILTER_TABS.map(tab => (
          <button key={tab} onClick={() => setFilter(tab)}
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              background: filter === tab ? CY : 'rgba(41,231,255,0.05)',
              color: filter === tab ? '#04060A' : CY,
              border: `1px solid ${CY}44`, fontFamily: 'inherit', letterSpacing: 1 }}>
            {tab}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(41,231,255,0.05)',
            border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
            fontFamily: 'inherit', fontSize: 11, outline: 'none', minWidth: 160 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', padding: 40, fontSize: 12 }}>
            No skills match current filter.
          </div>
        )}
        {visible.map((sk, i) => {
          const col = CLASS_COL[sk._class] || CY;
          const isExp = expanded === (sk.id || sk.skill_id || i);
          return (
            <div key={sk.id || sk.skill_id || i}
              style={{ marginBottom: 6, border: `1px solid ${col}22`, borderRadius: 8,
                background: 'rgba(4,8,14,0.5)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : (sk.id || sk.skill_id || i))}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 130 }}>
                  {sk._class}
                </span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sk.name || sk.skill_id || sk.id || '—'}
                </span>
                {sk.category && <Badge label={sk.category} col={CY} />}
                <span style={{ color: '#6E8AA0', fontSize: 10, marginLeft: 4 }}>
                  {sk._cMatches.length}C · {sk._tMatches.length}T
                </span>
                <span style={{ color: '#6E8AA0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: `1px solid ${col}22` }}>
                  {sk.description && (
                    <div style={{ fontSize: 11, color: '#8AAABB', padding: '6px 0' }}>
                      {sk.description}
                    </div>
                  )}

                  {/* matched contacts */}
                  {sk._cMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED CONTACTS ({sk._cMatches.length})
                      </div>
                      {sk._cMatches.map((m, ci) => (
                        <div key={ci} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 11 }}>
                            <Badge label={m.c.role || m.c.title || 'CONTACT'} col={GRN} />
                            <span>{m.c.name || m.c.email || m.c.id}</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: GRN }}>
                              {Math.round(m.score * 100)}%
                            </span>
                          </div>
                          <Bar pct={m.score} col={GRN} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* matched tasks */}
                  {sk._tMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: PRP, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED TASKS ({sk._tMatches.length})
                      </div>
                      {sk._tMatches.map((m, ti) => {
                        const pri = (m.t.priority || '').toLowerCase();
                        const sta = (m.t.status || '').toLowerCase();
                        return (
                          <div key={ti} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 11 }}>
                              {pri && <Badge label={pri.toUpperCase()} col={PRIORITY_COL[pri] || AMB} />}
                              {sta && <Badge label={sta.toUpperCase()} col={STATUS_COL[sta] || CY} />}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.t.name || m.t.title || m.t.id}
                              </span>
                              <span style={{ fontSize: 10, color: PRP }}>
                                {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <Bar pct={m.score} col={PRP} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {sk._cMatches.length === 0 && sk._tMatches.length === 0 && (
                    <div style={{ fontSize: 11, color: AMB, padding: '6px 0' }}>
                      No contacts or tasks reference this skill.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess footer */}
      <div style={{ padding: '10px 18px', borderTop: `1px solid ${CY}22`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleAssess} disabled={assessing}
          style={{ padding: '5px 14px', background: 'none', border: `1px solid ${CY}66`,
            borderRadius: 5, color: CY, cursor: assessing ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 11 }}>
          {assessing ? '⋯ assessing…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 11, color: '#AABBC8', flex: 1 }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
