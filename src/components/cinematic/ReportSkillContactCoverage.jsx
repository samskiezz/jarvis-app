/**
 * ReportSkillContactCoverage — F63
 *
 * Fetches /v1/reports + /v1/aip/skill + /entities/Contact
 * Keyword-matches each report against skills AND contacts to classify:
 *   ATTRIBUTED — report matched both a skill AND a contact (fully covered)
 *   SKILLED    — report matched a skill only (expertise exists, no author link)
 *   LINKED     — report matched a contact only (person linked, no skill match)
 *   UNKNOWN    — no skill or contact match (orphaned report)
 *
 * Toggle: ◈ RSCOV button (fixed, bottom strip) left:83640, zIndex:160
 * Stat tiles: reports / skills / contacts / attributed / skilled / linked / unknown
 * Amber pulse on UNKNOWN count.
 * Expandable rows: matched skills with score badge + matched contacts with role/org.
 * Filter tabs: ALL / ATTRIBUTED / SKILLED / LINKED / UNKNOWN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rscov"/"report skill"/"report contact"/"authorship coverage"/
 *        "report coverage"/"skill contact"/"report attribution"/
 *        "unknown reports"/"orphaned reports"/"report audit"
 * Event: jarvis:rscov-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ATTRIBUTED', 'SKILLED', 'LINKED', 'UNKNOWN'];

const CLS_COLOR = {
  ATTRIBUTED: '#00FF88',
  SKILLED:    '#38BDF8',
  LINKED:     '#A78BFA',
  UNKNOWN:    '#FFB800',
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

function classify(reportToks, skills, contacts) {
  const matchedSkills = skills.filter(s =>
    overlaps(reportToks, [
      s.id, s.name, s.title, s.category, s.type,
      s.description, s.tags, s.domain, s.topic, s.area,
    ].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(reportToks, [
      c.id, c.name, c.title, c.role, c.org, c.organisation,
      c.organization, c.department, c.tags, c.domain, c.type,
    ].join(' '))
  );
  const hasSkill   = matchedSkills.length > 0;
  const hasContact = matchedContacts.length > 0;
  const cls = hasSkill && hasContact ? 'ATTRIBUTED'
            : hasSkill               ? 'SKILLED'
            : hasContact             ? 'LINKED'
            : 'UNKNOWN';
  return {
    cls,
    matchedSkills:   matchedSkills.slice(0, 4),
    matchedContacts: matchedContacts.slice(0, 4),
  };
}

export function isRscovQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('rscov') ||
    s.includes('report skill') ||
    s.includes('report contact') ||
    s.includes('authorship coverage') ||
    s.includes('report coverage') ||
    s.includes('skill contact') ||
    s.includes('report attribution') ||
    s.includes('unknown reports') ||
    s.includes('orphaned reports') ||
    s.includes('report audit')
  );
}

export default function ReportSkillContactCoverage() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, sklRes, cntRes] = await Promise.all([
        fetch(`${API}/v1/reports`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/aip/skill`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/entities/Contact`,{ headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [repRaw, sklRaw, cntRaw] = await Promise.all([
        repRes.ok ? repRes.json() : {},
        sklRes.ok ? sklRes.json() : {},
        cntRes.ok ? cntRes.json() : {},
      ]);

      const reports  = normalizeArray(repRaw, ['reports', 'items', 'data', 'results']);
      const skills   = normalizeArray(sklRaw, ['skills', 'items', 'data', 'results', 'aip']);
      const contacts = normalizeArray(cntRaw, ['contacts', 'items', 'data', 'results', 'entities']);

      const classified = reports.map(report => {
        const label = [
          report.id, report.name, report.title, report.type,
          report.category, report.summary, report.tags, report.topic,
          report.subject, report.description, report.domain,
        ].join(' ');
        const toks = tokens(label);
        const { cls, matchedSkills, matchedContacts } = classify(toks, skills, contacts);
        return { ...report, cls, matchedSkills, matchedContacts, _label: label };
      });

      setRows(classified);
    } catch (_) {
      /* network error — leave existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:rscov-toggle', handler);
    return () => window.removeEventListener('jarvis:rscov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setAssessment('');
    const unknownCount    = rows.filter(r => r.cls === 'UNKNOWN').length;
    const attributedCount = rows.filter(r => r.cls === 'ATTRIBUTED').length;
    const prompt = `Jarvis, I have ${rows.length} reports. ${unknownCount} are UNKNOWN (no matching skill or contact). ${attributedCount} are fully ATTRIBUTED. Provide a 2-sentence operational advisory on improving report authorship coverage and reducing orphaned reports.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.message || data.answer || data.content || '';
      setAssessment(text);
      if (text) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice: 'ash' }),
          });
        } catch (_) { /* TTS is best-effort */ }
      }
    } catch (_) { /* assessment failed */ } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    total:      rows.length,
    attributed: rows.filter(r => r.cls === 'ATTRIBUTED').length,
    skilled:    rows.filter(r => r.cls === 'SKILLED').length,
    linked:     rows.filter(r => r.cls === 'LINKED').length,
    unknown:    rows.filter(r => r.cls === 'UNKNOWN').length,
  };

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || (r._label || '').toLowerCase().includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 83640, zIndex: 160,
          background: 'rgba(255,184,0,0.08)', border: '1px solid #FFB80044',
          color: '#FFB800', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="Report × Skill × Contact Authorship Coverage"
      >◈ RSCOV</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 160,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FFB80033',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(255,184,0,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FFB80022',
          background: 'rgba(255,184,0,0.04)',
        }}>
          <span style={{ color: '#FFB800', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ RSCOV — REPORT AUTHORSHIP COVERAGE
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FFB80077', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FFB80066', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',      counts.total,      '#888'],
            ['ATTRIBUTED', counts.attributed, '#00FF88'],
            ['SKILLED',    counts.skilled,    '#38BDF8'],
            ['LINKED',     counts.linked,     '#A78BFA'],
            ['UNKNOWN',    counts.unknown,    '#FFB800', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${
                color === '#00FF88' ? '0,255,136'
                : color === '#38BDF8' ? '56,189,248'
                : color === '#A78BFA' ? '167,139,250'
                : color === '#FFB800' ? '255,184,0'
                : '136,136,136'
              },0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'rscov-pulse 1.8s ease-in-out infinite' : 'none',
              }}>{val}</span>
              <span style={{ fontSize: 8, color: `${color}99`, letterSpacing: 1 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(255,184,0,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FFB800' : '#FFB80033'}`,
                color: tab === t ? '#FFB800' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,184,0,0.04)',
              border: '1px solid #FFB80033', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No reports loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((report, idx) => {
            const id = report.id || report.name || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[report.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4,
                background: `rgba(${
                  color === '#00FF88' ? '0,255,136'
                  : color === '#38BDF8' ? '56,189,248'
                  : color === '#A78BFA' ? '167,139,250'
                  : '255,184,0'
                },0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 80 }}>{report.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {report.title || report.name || report.subject || id}
                  </span>
                  {report.date && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{String(report.date).slice(0, 10)}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {report.summary && (
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 6, lineHeight: 1.5 }}>
                        {String(report.summary).slice(0, 200)}
                      </div>
                    )}
                    {/* Matched Skills */}
                    {report.matchedSkills.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED SKILLS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {report.matchedSkills.map((s, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {s.name || s.title || s.id}
                              {s.score !== undefined && (
                                <span style={{ color: '#38BDF877', marginLeft: 4 }}>{Number(s.score).toFixed(1)}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Contacts */}
                    {report.matchedContacts.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED CONTACTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {report.matchedContacts.map((c, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {c.name || c.title || c.id}
                              {(c.role || c.org || c.organisation) && (
                                <span style={{ color: '#A78BFA77', marginLeft: 4 }}>
                                  {[c.role, c.org || c.organisation].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {report.matchedSkills.length === 0 && report.matchedContacts.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FFB80066' }}>No matching skills or contacts found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FFB80011' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.05)' : 'rgba(255,184,0,0.10)',
              border: '1px solid #FFB80055', color: '#FFB800',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS AUTHORSHIP COVERAGE'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,184,0,0.03)',
              border: '1px solid #FFB80022', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 83640, zIndex: 160,
          background: 'rgba(255,184,0,0.15)', border: '1px solid #FFB800',
          color: '#FFB800', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ RSCOV ✕</button>

      <style>{`
        @keyframes rscov-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
