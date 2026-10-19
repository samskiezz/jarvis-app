/**
 * SwarmKnowledgeSkillAudit — F56
 *
 * Fetches /entities/SwarmJob + /knowledge/ + /v1/aip/skill
 * Cross-references each swarm job against the knowledge base AND skill catalogue:
 *   AUTONOMOUS — matched both a knowledge article AND a skill (fully supported automation)
 *   SKILLED    — matched a skill only (capability exists but undocumented)
 *   DOCUMENTED — matched a knowledge article only (documented but no skill mapped)
 *   BLIND      — no match in either (automated but neither documented nor skill-backed)
 *
 * Toggle: ◈ SWKSAUD button (fixed, bottom strip) left:79720, zIndex:153
 * Stat tiles: jobs / knowledge / skills / autonomous / skilled / documented / blind
 * Amber pulse on BLIND count (unsupported automation jobs).
 * Expandable rows: matched knowledge articles with category badge + matched skills with score badge.
 * Filter tabs: ALL / AUTONOMOUS / SKILLED / DOCUMENTED / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swarm audit"/"automation audit"/"swksaud"/"blind swarm"/"swarm knowledge"/
 *        "swarm skill"/"automation knowledge"/"unsupported swarm"/"swarm coverage"/
 *        "automation skill"/"automation intelligence"/"swarm intelligence audit"
 * Event: jarvis:swksaud-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'AUTONOMOUS', 'SKILLED', 'DOCUMENTED', 'BLIND'];

const CLS_COLOR = {
  AUTONOMOUS: '#00E5A0',
  SKILLED:    '#A78BFA',
  DOCUMENTED: '#29E7FF',
  BLIND:      '#FFB800',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function classify(jobToks, knowledgeItems, skills) {
  const matchedKnowledge = knowledgeItems.filter(k =>
    overlaps(jobToks, [
      k.title, k.name, k.description, k.summary, k.content,
      k.category, k.tags, k.type, k.topic, k.domain, k.keywords,
    ].join(' '))
  );
  const matchedSkills = skills.filter(s =>
    overlaps(jobToks, [
      s.name, s.title, s.description, s.summary, s.category,
      s.tags, s.type, s.domain, s.capability, s.skill_name, s.label,
    ].join(' '))
  );
  const hasKnow = matchedKnowledge.length > 0;
  const hasSkill = matchedSkills.length > 0;
  const cls = hasKnow && hasSkill ? 'AUTONOMOUS'
            : hasSkill            ? 'SKILLED'
            : hasKnow             ? 'DOCUMENTED'
            : 'BLIND';
  return {
    cls,
    matchedKnowledge: matchedKnowledge.slice(0, 4),
    matchedSkills: matchedSkills.slice(0, 4),
  };
}

export function isSwksaudQuery(q) {
  return /\b(swksaud|swarm.audit|automation.audit|blind.swarm|swarm.knowledge|swarm.skill|automation.knowledge|unsupported.swarm|swarm.coverage|automation.skill|automation.intelligence|swarm.intelligence.audit)\b/i.test(q);
}
export function buildSwksaudScript() {
  return 'Opening SwarmJob × Knowledge × Skill Automation Intelligence Audit. Cross-referencing swarm jobs against the knowledge base and skill catalogue to surface autonomous vs blind automation.';
}

export default function SwarmKnowledgeSkillAudit() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [knowCount, setKnowCount]   = useState(0);
  const [skillCount, setSkillCount] = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [swRes, knRes, skRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`, { headers: h }),
        fetch(`${API}/knowledge/`,        { headers: h }),
        fetch(`${API}/v1/aip/skill`,      { headers: h }),
      ]);
      const [swRaw, knRaw, skRaw] = await Promise.all([
        swRes.ok ? swRes.json() : [],
        knRes.ok ? knRes.json() : [],
        skRes.ok ? skRes.json() : [],
      ]);

      const jobs = normalizeArray(swRaw, ['items', 'data', 'results', 'jobs', 'swarm_jobs', 'list']);
      const know = normalizeArray(knRaw, ['items', 'data', 'results', 'articles', 'knowledge', 'docs', 'list']);
      const skls = normalizeArray(skRaw, ['items', 'data', 'results', 'skills', 'capabilities', 'list']);

      setKnowCount(know.length);
      setSkillCount(skls.length);

      const built = jobs.map((job, idx) => {
        const jobToks = tokens([
          job.name, job.title, job.description, job.summary,
          job.type, job.category, job.tags, job.task_type,
          job.domain, job.label, job.objective, job.status,
          job.agent, job.target, job.script, job.pipeline,
        ].join(' '));
        const { cls, matchedKnowledge, matchedSkills } = classify(jobToks, know, skls);
        return {
          id: job.id || job._id || `job-${idx}`,
          name: job.name || job.title || job.label || `SwarmJob ${idx + 1}`,
          status: job.status || job.state || '',
          progress: job.progress ?? job.completion ?? job.percent ?? null,
          _cls: cls,
          _knowledge: matchedKnowledge,
          _skills: matchedSkills,
        };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:swksaud-toggle', handler);
    return () => window.removeEventListener('jarvis:swksaud-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { AUTONOMOUS: 0, SKILLED: 0, DOCUMENTED: 0, BLIND: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const blindNames = rows.filter(r => r._cls === 'BLIND').slice(0, 5).map(r => r.name).join(', ');
    const prompt = `SwarmJob × Knowledge × Skill Automation Intelligence Audit: ${rows.length} swarm jobs cross-referenced against ${knowCount} knowledge articles and ${skillCount} skills. ${counts.AUTONOMOUS} jobs are AUTONOMOUS (matched both knowledge documentation AND a supporting skill — fully backed automation). ${counts.SKILLED} jobs are SKILLED (matched a skill but have no knowledge documentation — capability exists but undocumented). ${counts.DOCUMENTED} jobs are DOCUMENTED (matched a knowledge article but no skill — documented but no JARVIS skill mapped to it). ${counts.BLIND} jobs are BLIND — no knowledge article and no skill, representing automation running without documentation or skill support.${blindNames ? ` Blind automation jobs include: ${blindNames}.` : ''} Assess the overall automation intelligence health, identify which blind swarm jobs represent the highest operational risk from running undocumented and unsupported, and recommend whether to create knowledge articles, map skills, or pause any blind jobs.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing, knowCount, skillCount]);

  const counts = { AUTONOMOUS: 0, SKILLED: 0, DOCUMENTED: 0, BLIND: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.status, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  const STATUS_COLOR = {
    running: '#00E5A0', active: '#00E5A0',
    pending: '#FFB800', queued: '#FFB800', waiting: '#FFB800',
    failed:  '#FF4444', error: '#FF4444',
    done: '#888', complete: '#888', completed: '#888', finished: '#888',
  };

  const PANEL = {
    position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
    width: 760, maxHeight: '78vh', zIndex: 153,
    background: 'rgba(8,12,20,0.97)', border: '1px solid #FFB800',
    borderRadius: 8, display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#ccc', overflow: 'hidden',
    boxShadow: '0 0 32px rgba(255,184,0,0.12)',
  };

  if (!open) {
    return (
      <>
        <style>{`@keyframes swksaud-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 79720, zIndex: 153,
            background: 'rgba(255,184,0,0.10)', border: '1px solid #FFB800',
            color: '#FFB800', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ SWKSAUD{counts.BLIND > 0 && (
            <span style={{
              marginLeft: 4, background: '#FFB800', color: '#000',
              borderRadius: 8, padding: '0 4px', fontSize: 8,
              animation: 'swksaud-pulse 1.4s infinite',
            }}>{counts.BLIND}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes swksaud-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <div style={PANEL}>
        {/* Header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#FFB800', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ AUTOMATION INTELLIGENCE AUDIT</span>
          <span style={{ fontSize: 10, color: '#888' }}>SwarmJob × Knowledge × Skill</span>
          <span style={{ flex: 1 }} />
          {loading && <span style={{ color: '#888', fontSize: 10 }}>loading…</span>}
          {error && <span style={{ color: '#FF4444', fontSize: 10 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          {[
            { label: 'JOBS',       val: rows.length,        color: '#ccc' },
            { label: 'KNOWLEDGE',  val: knowCount,          color: '#29E7FF' },
            { label: 'SKILLS',     val: skillCount,         color: '#A78BFA' },
            { label: 'AUTONOMOUS', val: counts.AUTONOMOUS,  color: '#00E5A0' },
            { label: 'SKILLED',    val: counts.SKILLED,     color: '#A78BFA' },
            { label: 'DOCUMENTED', val: counts.DOCUMENTED,  color: '#29E7FF' },
            { label: 'BLIND',      val: counts.BLIND,       color: '#FFB800', pulse: counts.BLIND > 0 },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4,
              padding: '5px 4px', textAlign: 'center',
              border: `1px solid ${color}22`,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse ? 'swksaud-pulse 1.4s infinite' : 'none',
              }}>{val}</div>
              <div style={{ fontSize: 8, color: '#666', letterSpacing: 0.5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter + search */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #222', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#FFB800'}22` : 'none',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#FFB800') : '#333'}`,
              color: tab === t ? (CLS_COLOR[t] || '#FFB800') : '#666',
              fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search jobs…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', fontSize: 10,
              padding: '3px 8px', borderRadius: 3, outline: 'none', width: 160,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#444', padding: 20, fontSize: 11 }}>No jobs match current filter.</div>
          )}
          {visible.map(row => {
            const stColor = STATUS_COLOR[(row.status || '').toLowerCase()] || '#888';
            return (
              <div key={row.id}>
                <div
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 14px', cursor: 'pointer',
                    borderBottom: '1px solid #181c24',
                    background: expanded === row.id ? 'rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 3,
                    background: `${CLS_COLOR[row._cls]}22`,
                    border: `1px solid ${CLS_COLOR[row._cls]}`,
                    color: CLS_COLOR[row._cls], letterSpacing: 0.5, minWidth: 82, textAlign: 'center',
                  }}>{row._cls}</span>
                  <span style={{ flex: 1, fontSize: 11, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                  {row.status && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: `${stColor}22`, border: `1px solid ${stColor}44`, color: stColor,
                    }}>{row.status}</span>
                  )}
                  {row.progress != null && (
                    <span style={{ fontSize: 8, color: '#888' }}>{row.progress}%</span>
                  )}
                  <span style={{ fontSize: 9, color: '#555' }}>
                    {row._knowledge.length}📖 {row._skills.length}⚡
                  </span>
                  <span style={{ color: '#555', fontSize: 10 }}>{expanded === row.id ? '▲' : '▼'}</span>
                </div>
                {expanded === row.id && (
                  <div style={{ padding: '8px 20px 10px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #181c24' }}>
                    {row._knowledge.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>KNOWLEDGE ARTICLES ({row._knowledge.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._knowledge.map((k, i) => {
                            const cat = k.category || k.type || k.domain || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(41,231,255,0.10)', border: '1px solid #29E7FF33',
                                color: '#29E7FF',
                              }}>
                                {k.title || k.name || 'Article'}
                                {cat && <span style={{ marginLeft: 4, color: '#29E7FF99' }}>{cat}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._skills.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>SKILLS ({row._skills.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._skills.map((s, i) => {
                            const score = s.score ?? s.level ?? s.rating ?? s.confidence ?? null;
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33',
                                color: '#A78BFA',
                              }}>
                                {s.name || s.title || s.skill_name || 'Skill'}
                                {score != null && (
                                  <span style={{ marginLeft: 4, color: '#A78BFA99' }}>{score}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._knowledge.length === 0 && row._skills.length === 0 && (
                      <div style={{ color: '#FFB800', fontSize: 10 }}>⚠ No knowledge articles or skills found — blind automation job running without documentation or skill support.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.05)' : 'rgba(255,184,0,0.12)',
              border: '1px solid #FFB800', color: '#FFB800',
              fontSize: 10, padding: '4px 14px', borderRadius: 3, cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS AUTOMATION INTELLIGENCE'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,184,0,0.05)',
              border: '1px solid #FFB80022', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
