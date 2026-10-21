/**
 * SwarmReportContactSkillTraceability — F106
 *
 * Fetches /entities/SwarmJob + /v1/reports + /entities/Contact + /v1/aip/skill.
 *
 * Keyword-matches each swarm job (name/type/status) against
 * report titles/categories, contact names/roles/orgs, and skill names/categories
 * to classify:
 *
 *   TRACED   — swarm job matches report AND contact AND skill
 *              (fully accountable: documented, staffed, and capability-backed)
 *   SKILLED  — swarm job matches skill + at least one other source
 *              (capability exists but partially ungrounded)
 *   CONNECTED— swarm job matches contact or report but NO skill match
 *              (has people/docs but no defined capability backing)
 *   ORPHAN   — no match to any source (execution accountability blind spot)
 *
 * Toggle: ◈ SWTRACE button (fixed, bottom strip) left:107720, zIndex:203
 * Stat tiles: jobs / reports / contacts / skills / traced / skilled / connected / orphan
 * Red pulse on ORPHAN count (swarm jobs with zero accountability grounding).
 * Expandable rows: matched reports with date badge +
 *                  matched contacts with role/org +
 *                  matched skills with score badge.
 * Filter tabs: ALL / TRACED / SKILLED / CONNECTED / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swtrace"/"swarm traceability"/"swarm report"/"swarm accountability"
 *        "orphan swarm"/"swarm skill"/"execution traceability"/"swarm contact"
 *        "swarm coverage"/"automation traceability"/"swarm blind spots"
 *        "execution accountability"/"swarm grounding"
 * Event: jarvis:swtrace-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'TRACED', 'SKILLED', 'CONNECTED', 'ORPHAN'];

const CLS_COLOR = {
  TRACED:    '#22C55E',
  SKILLED:   '#38BDF8',
  CONNECTED: '#F97316',
  ORPHAN:    '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export function isSwtraceQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'swtrace', 'swarm traceability', 'swarm report', 'swarm accountability',
    'orphan swarm', 'swarm skill', 'execution traceability', 'swarm contact',
    'swarm coverage', 'automation traceability', 'swarm blind spots',
    'execution accountability', 'swarm grounding',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export default function SwarmReportContactSkillTraceability() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [reports, setReports]     = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [skills, setSkills]       = useState([]);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [swRaw, repRaw, cntRaw, skRaw] = await Promise.all([
        fetcher('/entities/SwarmJob'),
        fetcher('/v1/reports'),
        fetcher('/entities/Contact'),
        fetcher('/v1/aip/skill'),
      ]);

      const swarmJobs   = normalizeArray(swRaw,  ['swarm_jobs', 'swarmJobs', 'jobs', 'data', 'results', 'items']);
      const reportList  = normalizeArray(repRaw, ['reports', 'data', 'results', 'items']);
      const contactList = normalizeArray(cntRaw, ['contacts', 'data', 'results', 'items']);
      const skillList   = normalizeArray(skRaw,  ['skills', 'data', 'results', 'items']);

      setReports(reportList);
      setContacts(contactList);
      setSkills(skillList);

      const built = swarmJobs.map(job => {
        const name = job.name || job.title || job.id || '';
        const desc = job.description || job.objective || '';
        const jToks = tokens(name + ' ' + desc + ' ' + (job.type || '') + ' ' + (job.status || '') + ' ' + (job.tags || []).join(' '));

        const matchedReports = reportList.filter(rep => {
          const rText = (rep.title || '') + ' ' + (rep.category || '') + ' ' + (rep.description || '') + ' ' + (rep.name || '');
          return overlaps(jToks, rText);
        });

        const matchedContacts = contactList.filter(c => {
          const cText = (c.name || '') + ' ' + (c.role || '') + ' ' + (c.org || '') + ' ' + (c.organization || '') + ' ' + (c.title || '');
          return overlaps(jToks, cText);
        });

        const matchedSkills = skillList.filter(sk => {
          const skText = (sk.name || '') + ' ' + (sk.category || '') + ' ' + (sk.description || '') + ' ' + (sk.tags || []).join(' ');
          return overlaps(jToks, skText);
        });

        const hasRep  = matchedReports.length > 0;
        const hasCnt  = matchedContacts.length > 0;
        const hasSk   = matchedSkills.length > 0;

        let cls;
        if (hasRep && hasCnt && hasSk)        cls = 'TRACED';
        else if (hasSk && (hasRep || hasCnt)) cls = 'SKILLED';
        else if (hasRep || hasCnt)            cls = 'CONNECTED';
        else                                  cls = 'ORPHAN';

        return {
          id: job.id || name,
          name,
          status: job.status || '',
          progress: job.progress != null ? job.progress : null,
          cls,
          matchedReports,
          matchedContacts,
          matchedSkills,
        };
      });

      setRows(built);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:swtrace-toggle', handler);
    return () => window.removeEventListener('jarvis:swtrace-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    const orphan = rows.filter(r => r.cls === 'ORPHAN').length;
    const traced = rows.filter(r => r.cls === 'TRACED').length;
    const prompt = `JARVIS execution traceability audit: ${rows.length} swarm jobs — ${traced} TRACED (fully accountable), ${orphan} ORPHAN (zero accountability grounding). Top orphan jobs: ${rows.filter(r => r.cls === 'ORPHAN').slice(0, 3).map(r => r.name).join(', ') || 'none'}. Provide a 2-sentence operational advisory on execution accountability gaps.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(answer);
      try {
        const tr = await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: answer }),
        });
        if (tr.ok) {
          const blob = await tr.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play();
        }
      } catch (_) {}
    } catch (e) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  if (!open) {
    const orphanCount = rows.filter(r => r.cls === 'ORPHAN').length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 8,
          left: 107720,
          zIndex: 203,
          background: 'rgba(10,20,35,0.85)',
          border: `1px solid ${orphanCount > 0 ? '#EF4444' : '#1E3A5F'}`,
          color: orphanCount > 0 ? '#EF4444' : '#38BDF8',
          padding: '3px 8px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          boxShadow: orphanCount > 0 ? '0 0 8px #EF444466' : 'none',
          animation: orphanCount > 0 ? 'swtraceOrphanPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        <style>{`@keyframes swtraceOrphanPulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
        ◈ SWTRACE{orphanCount > 0 ? ` ${orphanCount}✗` : ''}
      </button>
    );
  }

  const counts = {
    TRACED:    rows.filter(r => r.cls === 'TRACED').length,
    SKILLED:   rows.filter(r => r.cls === 'SKILLED').length,
    CONNECTED: rows.filter(r => r.cls === 'CONNECTED').length,
    ORPHAN:    rows.filter(r => r.cls === 'ORPHAN').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s) || r.status.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed',
      bottom: 36,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 780,
      maxHeight: '74vh',
      overflowY: 'auto',
      background: 'rgba(6,14,26,0.97)',
      border: '1px solid #1E3A5F',
      borderRadius: 8,
      zIndex: 9000,
      padding: '14px 16px',
      fontFamily: 'monospace',
      color: '#CBD5E1',
    }}>
      <style>{`@keyframes swtraceOrphanPulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#38BDF8', fontWeight: 700, fontSize: 13 }}>
          ◈ SWTRACE — Swarm Execution Traceability
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {[
          ['Jobs',      rows.length,        '#38BDF8'],
          ['Reports',   reports.length,     '#94A3B8'],
          ['Contacts',  contacts.length,    '#94A3B8'],
          ['Skills',    skills.length,      '#94A3B8'],
          ['Traced',    counts.TRACED,      '#22C55E'],
          ['Skilled',   counts.SKILLED,     '#38BDF8'],
          ['Connected', counts.CONNECTED,   '#F97316'],
          ['Orphan',    counts.ORPHAN,      '#EF4444'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(14,28,48,0.9)', border: `1px solid ${color}33`, borderRadius: 5, padding: '4px 10px', textAlign: 'center', minWidth: 70 }}>
            <div style={{ color, fontWeight: 700, fontSize: 15 }}>{val}</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1E3A5F' : 'rgba(14,28,48,0.7)',
            border: `1px solid ${tab === t ? '#38BDF8' : '#1E3A5F'}`,
            color: tab === t ? '#38BDF8' : '#64748B',
            borderRadius: 4, padding: '2px 10px', fontSize: 11, cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search jobs…"
          style={{ marginLeft: 'auto', background: 'rgba(14,28,48,0.7)', border: '1px solid #1E3A5F', color: '#CBD5E1', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 140 }}
        />
      </div>

      {loading && <div style={{ color: '#38BDF8', fontSize: 12, marginBottom: 6 }}>Loading…</div>}
      {err    && <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 6 }}>Error: {err}</div>}

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.map(row => {
          const isExp = !!expanded[row.id];
          return (
            <div key={row.id} style={{ background: 'rgba(14,28,48,0.7)', border: `1px solid ${CLS_COLOR[row.cls]}44`, borderRadius: 5, padding: '6px 10px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpanded(ex => ({ ...ex, [row.id]: !isExp }))}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0' }}>{row.name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {row.progress != null && (
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>{row.progress}%</span>
                  )}
                  {row.status && (
                    <span style={{ fontSize: 10, background: 'rgba(14,28,48,0.9)', border: '1px solid #1E3A5F', color: '#94A3B8', borderRadius: 3, padding: '1px 5px' }}>{row.status}</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, color: CLS_COLOR[row.cls], minWidth: 72, textAlign: 'right' }}>{row.cls}</span>
                  <span style={{ color: '#38BDF8', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Matched reports */}
                  {row.matchedReports.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>REPORTS ({row.matchedReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedReports.slice(0, 5).map((rep, i) => (
                          <span key={i} style={{ fontSize: 10, background: 'rgba(14,28,48,0.9)', border: '1px solid #22C55E44', color: '#94A3B8', borderRadius: 3, padding: '1px 6px' }}>
                            {rep.title || rep.name || rep.id}
                            {(rep.date || rep.created_at) && (
                              <span style={{ color: '#22C55E', marginLeft: 4 }}>{(rep.date || rep.created_at || '').slice(0, 10)}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matched contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>CONTACTS ({row.matchedContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedContacts.slice(0, 5).map((c, i) => (
                          <span key={i} style={{ fontSize: 10, background: 'rgba(14,28,48,0.9)', border: '1px solid #38BDF844', color: '#94A3B8', borderRadius: 3, padding: '1px 6px' }}>
                            {c.name || c.id}
                            {(c.role || c.org || c.organization) && (
                              <span style={{ color: '#38BDF8', marginLeft: 4 }}>{[c.role, c.org || c.organization].filter(Boolean).join(' / ')}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matched skills */}
                  {row.matchedSkills.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>SKILLS ({row.matchedSkills.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedSkills.slice(0, 5).map((sk, i) => (
                          <span key={i} style={{ fontSize: 10, background: 'rgba(14,28,48,0.9)', border: '1px solid #F9731644', color: '#94A3B8', borderRadius: 3, padding: '1px 6px' }}>
                            {sk.name || sk.id}
                            {sk.score != null && (
                              <span style={{ color: '#F97316', marginLeft: 4 }}>{sk.score}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {row.matchedReports.length === 0 && row.matchedContacts.length === 0 && row.matchedSkills.length === 0 && (
                    <div style={{ fontSize: 11, color: '#EF4444', fontStyle: 'italic' }}>No report, contact, or skill grounding found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: '#64748B', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>No jobs match current filter.</div>
        )}
      </div>

      {/* ASSESS */}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: '#0F2744', border: '1px solid #38BDF8', color: '#38BDF8', borderRadius: 5, padding: '4px 14px', fontSize: 12, cursor: assessing ? 'not-allowed' : 'pointer' }}
        >
          {assessing ? 'Assessing…' : '▶ ASSESS'}
        </button>
        {assessment && (
          <div style={{ flex: 1, fontSize: 11, color: '#94A3B8', lineHeight: 1.5, background: 'rgba(14,28,48,0.7)', borderRadius: 4, padding: '5px 8px', border: '1px solid #1E3A5F' }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
