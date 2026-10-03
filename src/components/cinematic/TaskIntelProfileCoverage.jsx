import { useState, useEffect, useCallback } from 'react';

const API = '';
const TINTEL_RE = /\b(task[._-]?intel(?:ligence)?|intel(?:ligence)?[._-]?task|tintel|task[._-]?threat|threat[._-]?backed[._-]?task|task[._-]?adversary|adversary[._-]?task|threat[._-]?task|mission[._-]?threat)\b/i;

export function isTintelQuery(t) {
  return TINTEL_RE.test(t || '');
}

export async function buildTintelScript() {
  const [taskR, ipR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
  ]);
  const tasks = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const profiles = normaliseProfiles(ipR.status === 'fulfilled' ? ipR.value : []);
  const enriched = correlate(tasks, profiles);
  const backed = enriched.filter(t => t._linked).length;
  const clean = enriched.length - backed;
  return (
    `Task × Intel Profile Coverage: ${tasks.length} active tasks, ${profiles.length} threat actor profiles tracked. ` +
    `${backed} tasks are THREAT-BACKED (adversarial alignment detected); ${clean} are CLEAN. ` +
    `Top threat-backed tasks: ${enriched.filter(t => t._linked).slice(0, 3).map(t => t.name || t.title || t.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseTasks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['tasks', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['profiles', 'intel_profiles', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(task, profile) {
  const taskToks = new Set([
    ...tokens(task.name),
    ...tokens(task.title),
    ...tokens(task.description),
    ...tokens(task.mission),
    ...tokens(task.priority),
    ...tokens(task.tags),
    ...tokens(task.category),
    ...tokens(task.type),
  ].filter(Boolean));
  const profToks = [
    ...tokens(profile.name),
    ...tokens(profile.title),
    ...tokens(profile.subject),
    ...tokens(profile.description),
    ...tokens(profile.category),
    ...tokens(profile.nationality),
    ...tokens(profile.aliases),
    ...tokens(profile.tags),
  ].filter(Boolean);
  if (!taskToks.size || !profToks.length) return 0;
  let hits = 0;
  for (const t of profToks) if (taskToks.has(t)) hits++;
  return hits / Math.max(taskToks.size, profToks.length);
}

function correlate(tasks, profiles) {
  return tasks.map(task => {
    const scored = profiles
      .map(prof => ({ prof, score: matchScore(task, prof) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...task, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const RD = '#EF4444';
const GR = '#22C55E';
const AM = '#F59E0B';
const VI = '#A78BFA';

const CAT_COLORS = {
  apt: RD,
  nation_state: '#FB923C',
  cybercriminal: AM,
  hacktivist: VI,
  insider: '#F472B6',
};

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function TaskIntelProfileCoverage() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskR, ipR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
      ]);
      setTasks(normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []));
      setProfiles(normaliseProfiles(ipR.status === 'fulfilled' ? ipR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tintel-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tintel-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(tasks, profiles);
  const backed = enriched.filter(t => t._linked);
  const clean = enriched.filter(t => !t._linked);
  const badgeCount = backed.length;
  const badgeColor = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(t => tab === 'ALL' || (tab === 'THREAT-BACKED' ? t._linked : !t._linked))
    .filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(t.name || '').toLowerCase().includes(q) ||
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.description || '').toLowerCase().includes(q) ||
        String(t.type || '').toLowerCase().includes(q)
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
          message: `You have ${tasks.length} active tasks and ${profiles.length} tracked threat actor intel profiles. ${backed.length} tasks are THREAT-BACKED (adversarial alignment detected); ${clean.length} are CLEAN with no intel profile alignment. Top threat-backed tasks: ${backed.slice(0, 3).map(t => t.name || t.title || '?').join(', ') || 'none'}. Give a 2-sentence mission threat exposure brief highlighting which tasks face adversarial alignment and what immediate defensive action is warranted.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = t => t.name || t.title || t.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Task × Intel Profile Coverage (TINTEL)"
        style={{
          position: 'fixed', left: 681840, bottom: 8, zIndex: 246,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ TINTEL
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
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${RD}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${RD}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${RD}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: RD, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${RD}` }}>
              ◈ TASK × INTEL PROFILE COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${RD}55`,
                  background: 'transparent', color: RD, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'TASKS', val: tasks.length, col: CY },
              { label: 'PROFILES', val: profiles.length, col: VI },
              { label: 'THREAT-BACKED', val: backed.length, col: RD },
              { label: 'CLEAN', val: clean.length, col: GR },
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

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'THREAT-BACKED', 'CLEAN'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? RD : '#2a3a4a'}`,
                  background: tab === t ? `${RD}22` : 'transparent',
                  color: tab === t ? RD : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No tasks found.'}
              </div>
            ) : filtered.map((task, i) => {
              const isBacked = task._linked;
              const statusColor = isBacked ? RD : GR;
              const isExp = expanded === i;
              return (
                <div
                  key={task.id || i}
                  style={{ borderBottom: `1px solid ${RD}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(task)}</span>
                    {task.status && chip(String(task.status).toUpperCase(), AM)}
                    {task.priority && chip(String(task.priority).toUpperCase(), isBacked ? RD : '#6E8AA0')}
                    {chip(isBacked ? 'THREAT-BACKED' : 'CLEAN', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {task._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING INTEL PROFILES
                          </div>
                          {task._matches.map(({ prof, score }, j) => {
                            const catColor = CAT_COLORS[String(prof.category || '').toLowerCase()] || VI;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {prof.category && chip(String(prof.category).toUpperCase(), catColor)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {prof.name || prof.title || prof.id || '?'}
                                </span>
                                {prof.nationality && (
                                  <span style={{ color: '#6E8AA0', fontSize: 9, marginRight: 4 }}>
                                    {prof.nationality}
                                  </span>
                                )}
                                {scorebar(score, RD)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No threat actor alignment detected for this task.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${RD}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(239,68,68,0.03)',
            }}>
              <span style={{ color: RD, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
