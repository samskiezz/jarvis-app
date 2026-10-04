import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_ARMED', 'DUAL_LINKED', 'SINGLE_LINKED', 'UNSUPPORTED'];
const CLASS_COLOR = {
  FULLY_ARMED:  '#22c55e',
  DUAL_LINKED:  '#00bfff',
  SINGLE_LINKED:'#ffd700',
  UNSUPPORTED:  '#ff4444',
};
const PULSE_STYLE = `@keyframes tiscover-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

export function isTiscoverQuery(q) {
  return /\b(tiscover|task investment skill contact|strategic execution coverage|unsupported tasks|task execution coverage|task strategic coverage|task skill contact coverage|strategic execution)\b/i.test(q);
}
export function buildTiscoverScript() {
  return 'Opening Strategic Execution Coverage panel. Cross-referencing tasks against investments, AIP skills, and contacts to surface unsupported execution gaps.';
}

export default function TaskInvestmentSkillContactCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [invCount, setInvCount]   = useState(0);
  const [skillCount, setSkillCount] = useState(0);
  const [contactCount, setContactCount] = useState(0);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessment, setAssessment] = useState({});
  const intervalRef               = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskRes, invRes, skillRes, contactRes] = await Promise.all([
        fetch(`${API}/entities/Task`),
        fetch(`${API}/entities/Investment`),
        fetch(`${API}/v1/aip/skill`),
        fetch(`${API}/entities/Contact`),
      ]);
      const taskJson    = taskRes.ok    ? await taskRes.json()    : {};
      const invJson     = invRes.ok     ? await invRes.json()     : {};
      const skillJson   = skillRes.ok   ? await skillRes.json()   : {};
      const contactJson = contactRes.ok ? await contactRes.json() : {};

      const tasks    = Array.isArray(taskJson)    ? taskJson    : taskJson.tasks    || taskJson.results    || [];
      const invs     = Array.isArray(invJson)     ? invJson     : invJson.investments || invJson.results  || [];
      const skills   = Array.isArray(skillJson)   ? skillJson   : skillJson.skills  || skillJson.results  || [];
      const contacts = Array.isArray(contactJson) ? contactJson : contactJson.contacts || contactJson.results || [];

      setInvCount(invs.length);
      setSkillCount(skills.length);
      setContactCount(contacts.length);

      const built = tasks.map(t => {
        const taskText = [t.name, t.title, t.description, t.priority, t.status, t.tags].join(' ');
        const tToks = tokens(taskText);

        const matchedInv = invs.filter(v => {
          const vText = [v.name, v.title, v.type, v.sector, v.description, v.tags].join(' ');
          return overlaps(tToks, vText);
        });
        const matchedSkill = skills.filter(s => {
          const sText = [s.name, s.title, s.description, s.category, s.type, s.tags].join(' ');
          return overlaps(tToks, sText);
        });
        const matchedContact = contacts.filter(c => {
          const cText = [c.name, c.role, c.org, c.organisation, c.tags, c.email].join(' ');
          return overlaps(tToks, cText);
        });

        const links = (matchedInv.length     > 0 ? 1 : 0)
                    + (matchedSkill.length   > 0 ? 1 : 0)
                    + (matchedContact.length > 0 ? 1 : 0);

        const cls = links === 3 ? 'FULLY_ARMED'
                  : links === 2 ? 'DUAL_LINKED'
                  : links === 1 ? 'SINGLE_LINKED'
                  : 'UNSUPPORTED';

        return { ...t, _cls: cls, _invs: matchedInv, _skills: matchedSkill, _contacts: matchedContact };
      });

      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    document.addEventListener('jarvis:tiscover-toggle', handler);
    return () => document.removeEventListener('jarvis:tiscover-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async (row) => {
    const rid = row._id || row.id;
    setAssessing(rid);
    try {
      const prompt = `Strategic execution coverage brief for task "${row.name || row.title || 'unnamed'}": classification ${row._cls}, ${row._invs.length} investments, ${row._skills.length} AIP skills, ${row._contacts.length} contacts linked. Two sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.result || 'No assessment available.';
      setAssessment(prev => ({ ...prev, [rid]: text }));
      const ttsRes = await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        const audioUrl = ttsData.url || ttsData.audio_url;
        if (audioUrl) new Audio(audioUrl).play().catch(() => {});
      }
    } catch (e) {
      setAssessment(prev => ({ ...prev, [row._id || row.id]: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  }, []);

  if (!open) return null;

  const clsCounts = { FULLY_ARMED: 0, DUAL_LINKED: 0, SINGLE_LINKED: 0, UNSUPPORTED: 0 };
  rows.forEach(r => { if (clsCounts[r._cls] !== undefined) clsCounts[r._cls]++; });
  const armed  = clsCounts.FULLY_ARMED + clsCounts.DUAL_LINKED + clsCounts.SINGLE_LINKED;
  const covPct = pct(armed, rows.length);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (!search) return true;
    const hay = [r.name, r.title, r.description, r.priority, r.status].join(' ').toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const id = r => r._id || r.id || r.task_id || JSON.stringify(r).slice(0, 16);

  return (
    <div style={{
      position: 'fixed', left: 1119680, bottom: 8, zIndex: 715,
      width: 860, maxHeight: '88vh',
      background: 'rgba(8,12,24,0.97)', border: '1px solid #00bfff44',
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#c8d8f0', boxShadow: '0 0 32px #00bfff22',
      overflow: 'hidden',
    }}>
      <style>{PULSE_STYLE}</style>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #00bfff22', background: 'rgba(0,191,255,0.06)' }}>
        <span style={{ color: '#00bfff', fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>◈ TISCOVER</span>
        <span style={{ fontSize: 11, color: '#7a9bc0', flex: 1 }}>Strategic Execution Coverage — Task × Investment × Skill × Contact</span>
        {loading && <span style={{ fontSize: 11, color: '#ffd700' }}>REFRESHING…</span>}
        <button onClick={fetchData} style={{ background: 'none', border: '1px solid #00bfff44', color: '#00bfff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>

      {error && (
        <div style={{ padding: '6px 14px', background: 'rgba(255,68,68,0.12)', color: '#ff4444', fontSize: 11 }}>
          ERROR: {error}
        </div>
      )}

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'TASKS',       val: rows.length,              color: '#00bfff' },
          { label: 'INVESTMENTS', val: invCount,                  color: '#22c55e' },
          { label: 'SKILLS',      val: skillCount,                color: '#00e5ff' },
          { label: 'CONTACTS',    val: contactCount,              color: '#f97316' },
          { label: 'COV%',        val: covPct + '%',              color: covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444' },
          { label: 'FULLY ARMED', val: clsCounts.FULLY_ARMED,    color: CLASS_COLOR.FULLY_ARMED },
          { label: 'DUAL',        val: clsCounts.DUAL_LINKED,    color: CLASS_COLOR.DUAL_LINKED },
          { label: 'SINGLE',      val: clsCounts.SINGLE_LINKED,  color: CLASS_COLOR.SINGLE_LINKED },
          { label: 'UNSUPPORTED', val: clsCounts.UNSUPPORTED,    color: CLASS_COLOR.UNSUPPORTED, badge: clsCounts.UNSUPPORTED > 0 },
        ].map(t => (
          <div key={t.label} style={{
            background: 'rgba(0,0,0,0.4)', border: `1px solid ${t.color}44`,
            borderRadius: 6, padding: '4px 10px', minWidth: 64, textAlign: 'center',
            position: 'relative',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{t.val}</div>
            <div style={{ fontSize: 9, color: '#7a9bc0', letterSpacing: 1 }}>{t.label}</div>
            {t.badge && (
              <span style={{
                position: 'absolute', top: -4, right: -4, background: '#ffd700',
                borderRadius: '50%', width: 10, height: 10, display: 'block',
              }} />
            )}
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding: '0 14px 8px' }}>
        <div style={{ height: 4, background: 'rgba(0,0,0,0.4)', borderRadius: 2 }}>
          <div style={{
            width: covPct + '%', height: '100%', borderRadius: 2,
            background: covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444',
            transition: 'width 0.4s',
          }} />
        </div>
      </div>

      {/* tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (CLASS_COLOR[t] || '#00bfff') + '33' : 'rgba(0,0,0,0.3)',
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || '#00bfff') : '#00bfff22'}`,
            color: tab === t ? (CLASS_COLOR[t] || '#00bfff') : '#7a9bc0',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid #00bfff33', color: '#c8d8f0',
            borderRadius: 4, padding: '3px 8px', fontSize: 11, fontFamily: 'monospace',
            outline: 'none', marginLeft: 'auto', width: 160,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#7a9bc0', fontSize: 12, textAlign: 'center', padding: 24 }}>
            {rows.length === 0 ? 'No tasks loaded.' : 'No matching tasks.'}
          </div>
        )}
        {visible.map(row => {
          const rid = id(row);
          const isExp = expanded === rid;
          const pulse = row._cls === 'UNSUPPORTED';
          const clsColor = CLASS_COLOR[row._cls] || '#888';
          return (
            <div key={rid} style={{
              background: 'rgba(0,0,0,0.35)', border: `1px solid ${clsColor}33`,
              borderRadius: 7, marginBottom: 7, padding: '8px 10px',
              animation: pulse ? 'tiscover-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(isExp ? null : rid)}>
                <span style={{
                  background: clsColor + '22', border: `1px solid ${clsColor}66`,
                  color: clsColor, borderRadius: 4, fontSize: 9, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>{row._cls}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#dde8f8', flex: 1 }}>
                  {row.name || row.title || row.task_id || 'Unnamed Task'}
                </span>
                {row.priority && (
                  <span style={{ fontSize: 9, color: '#ffd700', border: '1px solid #ffd70033', borderRadius: 3, padding: '0 4px' }}>
                    {row.priority}
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#7a9bc0' }}>
                  I:{row._invs.length} S:{row._skills.length} C:{row._contacts.length}
                </span>
                <span style={{ fontSize: 11, color: '#00bfff44' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, borderTop: '1px solid #00bfff11', paddingTop: 8 }}>
                  {/* investments */}
                  {row._invs.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#22c55e', marginBottom: 4, letterSpacing: 1 }}>INVESTMENTS ({row._invs.length})</div>
                      {row._invs.slice(0, 4).map((v, i) => {
                        const shared = tokens([row.name, row.title, row.description].join(' '))
                          .filter(t => tokens([v.name, v.title, v.type, v.sector].join(' ')).includes(t));
                        const rel = Math.min(100, 25 + shared.length * 20);
                        return (
                          <div key={i} style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid #22c55e22', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#86efac' }}>{v.name || v.title || 'Investment'}</span>
                              {v.type && <span style={{ fontSize: 9, color: '#22c55e', border: '1px solid #22c55e33', borderRadius: 3, padding: '0 4px' }}>{v.type}</span>}
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: 'rgba(34,197,94,0.15)', borderRadius: 2 }}>
                              <div style={{ width: rel + '%', height: '100%', background: '#22c55e', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* AIP skills */}
                  {row._skills.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#00e5ff', marginBottom: 4, letterSpacing: 1 }}>AIP SKILLS ({row._skills.length})</div>
                      {row._skills.slice(0, 4).map((s, i) => {
                        const shared = tokens([row.name, row.title, row.description].join(' '))
                          .filter(t => tokens([s.name, s.title, s.description, s.category].join(' ')).includes(t));
                        const rel = Math.min(100, 25 + shared.length * 20);
                        return (
                          <div key={i} style={{ background: 'rgba(0,229,255,0.07)', border: '1px solid #00e5ff22', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#67e8f9' }}>{s.name || s.title || 'Skill'}</span>
                              {s.category && <span style={{ fontSize: 9, color: '#00e5ff', border: '1px solid #00e5ff33', borderRadius: 3, padding: '0 4px' }}>{s.category}</span>}
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: 'rgba(0,229,255,0.15)', borderRadius: 2 }}>
                              <div style={{ width: rel + '%', height: '100%', background: '#00e5ff', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* contacts */}
                  {row._contacts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#f97316', marginBottom: 4, letterSpacing: 1 }}>CONTACTS ({row._contacts.length})</div>
                      {row._contacts.slice(0, 4).map((c, i) => {
                        const shared = tokens([row.name, row.title, row.description].join(' '))
                          .filter(t => tokens([c.name, c.role, c.org, c.organisation].join(' ')).includes(t));
                        const rel = Math.min(100, 25 + shared.length * 20);
                        return (
                          <div key={i} style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid #f9731622', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#fdba74' }}>{c.name || 'Contact'}</span>
                              {c.role && <span style={{ fontSize: 9, color: '#f97316', border: '1px solid #f9731633', borderRadius: 3, padding: '0 4px' }}>{c.role}</span>}
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: 'rgba(249,115,22,0.15)', borderRadius: 2 }}>
                              <div style={{ width: rel + '%', height: '100%', background: '#f97316', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {row._cls === 'UNSUPPORTED' && row._invs.length === 0 && row._skills.length === 0 && row._contacts.length === 0 && (
                    <div style={{ fontSize: 11, color: '#ff4444', padding: '4px 0', marginBottom: 6 }}>
                      ⚠ Strategic execution gap — no investments, skills, or contacts linked to this task.
                    </div>
                  )}

                  {/* assess button */}
                  <button
                    disabled={assessing === (row._id || row.id)}
                    onClick={() => assess(row)}
                    style={{
                      background: 'rgba(0,191,255,0.12)', border: '1px solid #00bfff44',
                      color: '#00bfff', borderRadius: 5, padding: '4px 12px',
                      cursor: assessing === (row._id || row.id) ? 'not-allowed' : 'pointer',
                      fontSize: 11, fontFamily: 'monospace',
                      opacity: assessing === (row._id || row.id) ? 0.5 : 1,
                    }}>
                    {assessing === (row._id || row.id) ? '…ASSESSING' : '▶ ASSESS STRATEGIC EXECUTION'}
                  </button>

                  {assessment[row._id || row.id] && (
                    <div style={{ marginTop: 8, background: 'rgba(0,191,255,0.07)', border: '1px solid #00bfff22', borderRadius: 5, padding: '6px 10px', fontSize: 11, color: '#a0c8f0', lineHeight: 1.5 }}>
                      {assessment[row._id || row.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
