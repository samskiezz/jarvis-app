import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'EXPERT', 'POTENTIAL', 'UNMATCHED'];
const CLS_COLOR = {
  EXPERT:    '#22c55e',
  POTENTIAL: '#ffd700',
  UNMATCHED: '#888',
};
const PULSE_CSS = `@keyframes csem-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function matchCount(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.filter(t => setB.has(t)).length;
}

export function isContactSkillQuery(q) {
  return /\b(skill expertise|personnel skill|contact expertise|skill matrix|who knows|expertise matrix|skill coverage contact|contact skill matrix|csexmat)\b/i.test(q);
}
export function buildContactSkillScript() {
  return 'Opening Contact Skill Expertise Matrix. Cross-referencing personnel profiles against AIP skill catalogue to identify subject-matter experts and coverage gaps.';
}

export default function ContactSkillExpertiseMatrix() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [skillCount, setSkillCount] = useState(0);
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
      const [contRes, skillRes] = await Promise.all([
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/v1/aip/skill`),
      ]);
      const contJson  = contRes.ok  ? await contRes.json()  : {};
      const skillJson = skillRes.ok ? await skillRes.json() : {};

      const contacts = Array.isArray(contJson)  ? contJson  : contJson.contacts  || contJson.results || [];
      const skills   = Array.isArray(skillJson) ? skillJson : skillJson.skills   || skillJson.results || [];

      setSkillCount(skills.length);

      const built = contacts.map(c => {
        const cText = [c.name, c.role, c.org, c.email, c.bio, c.description, c.tags, c.department, c.expertise].join(' ');
        const cToks = tokens(cText);

        const matchedSkills = skills.map(s => {
          const sText = [s.name, s.description, s.category, s.tags, s.domain].join(' ');
          const hits = matchCount(cToks, sText);
          return hits > 0 ? { skill: s, hits } : null;
        }).filter(Boolean).sort((a, b) => b.hits - a.hits);

        const cls = matchedSkills.length >= 3 ? 'EXPERT'
                  : matchedSkills.length >= 1 ? 'POTENTIAL'
                  :                              'UNMATCHED';

        return { contact: c, cls, matchedSkills };
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
    document.addEventListener('jarvis:csexmat-toggle', handler);
    return () => document.removeEventListener('jarvis:csexmat-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const counts = { EXPERT: 0, POTENTIAL: 0, UNMATCHED: 0 };
  rows.forEach(r => counts[r.cls]++);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = [r.contact.name, r.contact.role, r.contact.org].join(' ').toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  const assessAll = async () => {
    const context = `Contacts: ${rows.length}, Experts (3+ skills): ${counts.EXPERT}, Potential (1-2 skills): ${counts.POTENTIAL}, Unmatched: ${counts.UNMATCHED}. Skill catalogue size: ${skillCount}. Top experts: ${rows.filter(r => r.cls === 'EXPERT').slice(0, 3).map(r => r.contact.name || r.contact.email).join(', ')}.`;
    setAssessing('global');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Provide a 2-sentence personnel skill coverage brief. ${context}` }),
      });
      const d = await res.json();
      const script = (d.answer || '').trim();
      setAssessment(a => ({ ...a, global: script }));
      if (script) document.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch {
      setAssessment(a => ({ ...a, global: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  };

  const assessContact = async (id, context) => {
    setAssessing(id);
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess skill expertise for this contact. Context: ${context}` }),
      });
      const d = await res.json();
      setAssessment(a => ({ ...a, [id]: (d.answer || '').trim() }));
    } catch {
      setAssessment(a => ({ ...a, [id]: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  };

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          title="Contact × Skill Expertise Matrix (CSEM)"
          style={{
            position: 'fixed', left: 65160, bottom: 8, zIndex: 125,
            background: 'rgba(5,8,13,0.82)', border: '1px solid #00bfff55',
            color: '#00bfff', borderRadius: 6, padding: '3px 9px',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            cursor: 'pointer', letterSpacing: 1, backdropFilter: 'blur(6px)',
          }}
        >
          {counts.UNMATCHED > 0 && (
            <span style={{
              display: 'inline-block', marginRight: 5, background: '#888',
              color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 10,
              animation: 'csem-pulse 2s ease-in-out infinite',
            }}>{counts.UNMATCHED}</span>
          )}
          ◈ CSEM
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={() => setOpen(false)}
      >
        <div
          style={{
            background: 'rgba(6,10,16,0.97)', border: '1px solid #00bfff44',
            borderRadius: 12, width: 820, maxHeight: '88vh', display: 'flex',
            flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 0 40px #00bfff22', fontFamily: "'JetBrains Mono',monospace",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #00bfff22', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#00bfff', fontSize: 13, letterSpacing: 2 }}>
                ◈ CONTACT × SKILL EXPERTISE MATRIX
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#00bfff88', cursor: 'pointer', fontSize: 16 }}
              >✕</button>
            </div>
            <div style={{ color: '#00bfff55', fontSize: 10, marginTop: 3, letterSpacing: 1 }}>
              /entities/Contact × /v1/aip/skill — personnel expertise cross-reference
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 18px', flexShrink: 0, flexWrap: 'wrap' }}>
            {[
              { label: 'CONTACTS', val: rows.length,         color: '#00bfff' },
              { label: 'EXPERT',   val: counts.EXPERT,       color: '#22c55e' },
              { label: 'POTENTIAL',val: counts.POTENTIAL,    color: '#ffd700' },
              { label: 'UNMATCHED',val: counts.UNMATCHED,    color: '#888'    },
              { label: 'SKILLS',   val: skillCount,          color: '#a78bfa' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: 'rgba(0,191,255,0.05)', border: `1px solid ${color}44`,
                borderRadius: 8, padding: '6px 14px', minWidth: 80, textAlign: 'center',
              }}>
                <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#00bfff55', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
            <button
              onClick={assessAll}
              disabled={!!assessing}
              style={{
                marginLeft: 'auto', background: 'rgba(0,191,255,0.1)',
                border: '1px solid #00bfff44', color: '#00bfff', borderRadius: 6,
                padding: '6px 14px', fontSize: 11, cursor: assessing ? 'wait' : 'pointer',
                letterSpacing: 1,
              }}
            >
              {assessing === 'global' ? '◌ ASSESSING…' : '▶ ASSESS'}
            </button>
          </div>

          {/* Global assessment result */}
          {assessment.global && (
            <div style={{ padding: '0 18px 10px', color: '#22c55e', fontSize: 11, flexShrink: 0, lineHeight: 1.5 }}>
              {assessment.global}
            </div>
          )}

          {/* Tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '0 18px 10px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(0,191,255,0.2)' : 'rgba(0,191,255,0.05)',
                border: `1px solid ${tab === t ? '#00bfff' : '#00bfff33'}`,
                color: tab === t ? '#00bfff' : '#00bfff88',
                borderRadius: 5, padding: '3px 10px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: 'auto', background: 'rgba(0,191,255,0.06)', border: '1px solid #00bfff33',
                color: '#00bfff', borderRadius: 5, padding: '3px 10px', fontSize: 11,
                outline: 'none', width: 180, fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 18px 14px' }}>
            {loading && <div style={{ color: '#00bfff55', fontSize: 11, padding: 8 }}>◌ loading…</div>}
            {error   && <div style={{ color: '#ff4444',   fontSize: 11, padding: 8 }}>⚠ {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#00bfff44', fontSize: 11, padding: 8 }}>No contacts match current filter.</div>
            )}
            {visible.map((r, i) => {
              const id = r.contact.id || r.contact.email || i;
              const isExp = expanded === id;
              return (
                <div key={id} style={{
                  borderBottom: '1px solid #00bfff11',
                  padding: '8px 0',
                }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    onClick={() => setExpanded(isExp ? null : id)}
                  >
                    <span style={{
                      background: CLS_COLOR[r.cls] + '22', color: CLS_COLOR[r.cls],
                      border: `1px solid ${CLS_COLOR[r.cls]}44`, borderRadius: 4,
                      padding: '1px 7px', fontSize: 9, letterSpacing: 1, minWidth: 72, textAlign: 'center',
                    }}>{r.cls}</span>
                    <span style={{ color: '#e0e8ff', fontSize: 12, flex: 1 }}>
                      {r.contact.name || r.contact.email || `Contact ${i + 1}`}
                    </span>
                    {r.contact.role && (
                      <span style={{ color: '#00bfff88', fontSize: 10 }}>{r.contact.role}</span>
                    )}
                    <span style={{ color: '#00bfff55', fontSize: 10 }}>
                      {r.matchedSkills.length} skill{r.matchedSkills.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ color: '#00bfff44', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 12, paddingTop: 8 }}>
                      {r.contact.org && (
                        <div style={{ color: '#00bfff66', fontSize: 10, marginBottom: 6 }}>
                          org: {r.contact.org}
                        </div>
                      )}
                      {r.matchedSkills.length > 0 ? (
                        <>
                          <div style={{ color: '#00bfff66', fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>
                            MATCHED SKILLS ({r.matchedSkills.length})
                          </div>
                          {r.matchedSkills.map((ms, si) => (
                            <div key={si} style={{
                              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                            }}>
                              <span style={{
                                background: '#a78bfa22', color: '#a78bfa',
                                border: '1px solid #a78bfa44', borderRadius: 4,
                                padding: '1px 6px', fontSize: 9, whiteSpace: 'nowrap',
                              }}>
                                {ms.skill.name || ms.skill.id || `skill-${si}`}
                              </span>
                              {/* relevance bar */}
                              <div style={{ flex: 1, background: '#00bfff11', borderRadius: 2, height: 5 }}>
                                <div style={{
                                  width: `${Math.min(100, ms.hits * 20)}%`,
                                  background: '#a78bfa', borderRadius: 2, height: '100%',
                                }} />
                              </div>
                              <span style={{ color: '#a78bfa88', fontSize: 9 }}>{ms.hits} hit{ms.hits !== 1 ? 's' : ''}</span>
                              {ms.skill.score != null && (
                                <span style={{ color: '#ffd70088', fontSize: 9 }}>score {ms.skill.score}</span>
                              )}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: '#888', fontSize: 10 }}>No skill matches found in AIP catalogue.</div>
                      )}

                      <button
                        onClick={() => {
                          const ctx = `Contact: ${r.contact.name || r.contact.email}, Role: ${r.contact.role}, Org: ${r.contact.org}. Matched skills: ${r.matchedSkills.map(ms => ms.skill.name).join(', ')}. Classification: ${r.cls}.`;
                          assessContact(id, ctx);
                        }}
                        disabled={!!assessing}
                        style={{
                          marginTop: 8, background: 'rgba(0,191,255,0.08)',
                          border: '1px solid #00bfff33', color: '#00bfff99', borderRadius: 5,
                          padding: '3px 10px', fontSize: 10, cursor: assessing ? 'wait' : 'pointer',
                          letterSpacing: 1,
                        }}
                      >
                        {assessing === id ? '◌ assessing…' : '▶ assess contact'}
                      </button>
                      {assessment[id] && (
                        <div style={{ marginTop: 6, color: '#22c55e', fontSize: 11, lineHeight: 1.5 }}>
                          {assessment[id]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
