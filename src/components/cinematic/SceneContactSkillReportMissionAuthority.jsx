/**
 * SceneContactSkillReportMissionAuthority — F104
 *
 * Fetches all 10 cinematic scenes (/v1/cinematic/scene/{1..10}) + /entities/Contact
 * + /v1/aip/skill + /v1/reports.
 *
 * Keyword-matches each scene (title/description/anchor text) against
 * contact names/roles/orgs, skill names/categories, and report titles/categories
 * to classify:
 *
 *   AUTHORIZED — scene matches contact AND skill AND report
 *                (fully grounded: staffed, capable, and documented)
 *   STAFFED    — scene matches contact + at least one other source
 *                (personnel-supported but partially grounded)
 *   CAPABLE    — scene matches skill or report but NO contact
 *                (capable but unstaffed)
 *   DARK       — no match to any source (operational mission blind spot)
 *
 * Toggle: ◈ SCMAAUTH button (fixed, bottom strip) left:106600, zIndex:201
 * Stat tiles: scenes / contacts / skills / reports / authorized / staffed / capable / dark
 * Amber pulse on DARK count (ungrounded scenes — mission blind spots).
 * Expandable rows: matched contacts with role/org +
 *                  matched skills with score badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / AUTHORIZED / STAFFED / CAPABLE / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scmaauth"/"scene mission authority"/"scene authority"/"mission authority"
 *        "scene staffing"/"scene coverage"/"scene operational authority"
 *        "operational mission authority"/"scene contact skill"/"scene report"
 *        "dark scenes"/"unstaffed scenes"/"mission blind spots"/"scene grounding"
 * Event: jarvis:scmaauth-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'AUTHORIZED', 'STAFFED', 'CAPABLE', 'DARK'];

const CLS_COLOR = {
  AUTHORIZED: '#22C55E',
  STAFFED:    '#38BDF8',
  CAPABLE:    '#F97316',
  DARK:       '#F59E0B',
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

export function isScmaauthQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'scmaauth', 'scene mission authority', 'scene authority',
    'mission authority', 'scene staffing', 'scene coverage',
    'scene operational authority', 'operational mission authority',
    'scene contact skill', 'scene report', 'dark scenes',
    'unstaffed scenes', 'mission blind spots', 'scene grounding',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function fetchAllScenes() {
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => fetcher(`/v1/cinematic/scene/${i + 1}`))
  );
  return results
    .map((r, i) => {
      if (r.status === 'fulfilled') {
        const d = r.value;
        return {
          id: d.id || String(i + 1),
          scene_number: i + 1,
          title: d.title || d.name || `Scene ${i + 1}`,
          description: d.description || d.summary || '',
          anchors: d.anchors || d.anchor || [],
        };
      }
      return null;
    })
    .filter(Boolean);
}

export default function SceneContactSkillReportMissionAuthority() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [contacts, setContacts] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [reports, setReports]   = useState([]);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [scenes, contactsRaw, skillsRaw, reportsRaw] = await Promise.all([
        fetchAllScenes().catch(() => []),
        fetcher('/entities/Contact').catch(() => []),
        fetcher('/v1/aip/skill').catch(() => []),
        fetcher('/v1/reports').catch(() => []),
      ]);

      const ctcts = normalizeArray(contactsRaw, ['contacts', 'items', 'data', 'results']);
      const skls  = normalizeArray(skillsRaw,   ['skills',   'items', 'data', 'results']);
      const rpts  = normalizeArray(reportsRaw,  ['reports',  'items', 'data', 'results']);

      setContacts(ctcts);
      setSkills(skls);
      setReports(rpts);

      const built = scenes.map(scene => {
        const anchorText = Array.isArray(scene.anchors)
          ? scene.anchors.map(a => (typeof a === 'string' ? a : (a.label || a.name || a.text || ''))).join(' ')
          : '';
        const aToks = tokens(`${scene.title} ${scene.description} ${anchorText}`);

        const matchedContacts = ctcts.filter(c => {
          const cStr = [c.name, c.full_name, c.role, c.organization, c.org, c.title, c.description].filter(Boolean).join(' ');
          return overlaps(aToks, cStr);
        });
        const matchedSkills = skls.filter(s => {
          const sStr = [s.name, s.title, s.category, s.description, s.domain, s.type].filter(Boolean).join(' ');
          return overlaps(aToks, sStr);
        });
        const matchedReports = rpts.filter(r => {
          const rStr = [r.title, r.name, r.category, r.description, r.summary, r.tags].filter(Boolean).join(' ');
          return overlaps(aToks, rStr);
        });

        const hasContact = matchedContacts.length > 0;
        const hasSkill   = matchedSkills.length > 0;
        const hasReport  = matchedReports.length > 0;

        let cls;
        if (hasContact && hasSkill && hasReport)       cls = 'AUTHORIZED';
        else if (hasContact && (hasSkill || hasReport)) cls = 'STAFFED';
        else if (hasSkill || hasReport)                 cls = 'CAPABLE';
        else                                            cls = 'DARK';

        return {
          id: scene.id,
          scene_number: scene.scene_number,
          title: scene.title,
          description: scene.description,
          cls, matchedContacts, matchedSkills, matchedReports,
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
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:scmaauth-toggle', handler);
    return () => window.removeEventListener('jarvis:scmaauth-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    const dark  = rows.filter(r => r.cls === 'DARK').length;
    const total = rows.length;
    const prompt = `Scene Mission Authority audit: ${total} cinematic scenes analyzed. ${dark} DARK (no contact owner, no matching skill, no filed report — operational mission blind spots). Provide a 2-sentence advisory on which scenes to prioritize for staffing and capability grounding.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.content || data.text || '';
      setAssessment(text);
      if (text) {
        fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        }).then(r => r.blob()).then(blob => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch (e) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const counts = {
    authorized: rows.filter(r => r.cls === 'AUTHORIZED').length,
    staffed:    rows.filter(r => r.cls === 'STAFFED').length,
    capable:    rows.filter(r => r.cls === 'CAPABLE').length,
    dark:       rows.filter(r => r.cls === 'DARK').length,
  };

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.title.toLowerCase().includes(s) || r.description.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 106600,
          zIndex: 201, background: 'rgba(0,0,0,0.85)',
          border: '1px solid #334155', color: '#94A3B8',
          padding: '3px 8px', borderRadius: 4, fontSize: 11,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        ◈ SCMAAUTH
        {counts.dark > 0 && (
          <span style={{
            marginLeft: 5, background: '#F59E0B', color: '#000',
            borderRadius: 8, padding: '0 5px', fontSize: 10,
            animation: 'pulse 1.5s infinite',
          }}>{counts.dark}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, width: 560, maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(0,0,0,0.95)', border: '1px solid #1E3A5F',
      borderRadius: 8, zIndex: 9201, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #1E3A5F',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(14,30,54,0.9)',
      }}>
        <div>
          <div style={{ color: '#38BDF8', fontSize: 13, fontWeight: 700 }}>
            ◈ SCMAAUTH — Scene Mission Authority
          </div>
          <div style={{ color: '#64748B', fontSize: 10, marginTop: 2 }}>
            10 scenes × /entities/Contact × /v1/aip/skill × /v1/reports
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#64748B',
          cursor: 'pointer', fontSize: 16, padding: '0 4px',
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6, padding: '10px 14px', borderBottom: '1px solid #1E3A5F',
      }}>
        {[
          { label: 'SCENES',     val: rows.length,        color: '#94A3B8' },
          { label: 'AUTHORIZED', val: counts.authorized,   color: CLS_COLOR.AUTHORIZED },
          { label: 'STAFFED',    val: counts.staffed,      color: CLS_COLOR.STAFFED },
          { label: 'CAPABLE',    val: counts.capable,      color: CLS_COLOR.CAPABLE },
          { label: 'DARK',       val: counts.dark,         color: CLS_COLOR.DARK },
          { label: 'CONTACTS',   val: contacts.length,     color: '#34D399' },
          { label: 'SKILLS',     val: skills.length,       color: '#818CF8' },
          { label: 'REPORTS',    val: reports.length,      color: '#A78BFA' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(30,58,95,0.4)', border: '1px solid #1E3A5F',
            borderRadius: 4, padding: '5px 8px', textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{
        padding: '6px 14px', borderBottom: '1px solid #1E3A5F',
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CLS_COLOR[t] || '#38BDF8' : 'rgba(30,58,95,0.4)',
            border: '1px solid ' + (tab === t ? CLS_COLOR[t] || '#38BDF8' : '#1E3A5F'),
            color: tab === t ? '#000' : '#94A3B8',
            padding: '2px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,58,95,0.4)',
            border: '1px solid #1E3A5F', color: '#94A3B8',
            padding: '2px 8px', borderRadius: 3, fontSize: 10,
            outline: 'none', width: 130,
          }}
        />
      </div>

      {/* ASSESS */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1E3A5F' }}>
        <button onClick={assess} disabled={assessing} style={{
          background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
          color: '#38BDF8', padding: '3px 10px', borderRadius: 3,
          fontSize: 10, cursor: 'pointer',
        }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        {assessment && (
          <div style={{
            marginTop: 6, color: '#CBD5E1', fontSize: 11,
            lineHeight: 1.5, background: 'rgba(30,58,95,0.3)',
            padding: '6px 8px', borderRadius: 4, borderLeft: '2px solid #38BDF8',
          }}>{assessment}</div>
        )}
      </div>

      {/* Status bar */}
      {(loading || err) && (
        <div style={{
          padding: '4px 14px', fontSize: 10,
          color: err ? '#EF4444' : '#64748B',
        }}>
          {loading ? '⟳ loading…' : `⚠ ${err}`}
        </div>
      )}

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {filtered.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, padding: '10px 14px' }}>
            No scenes match current filter.
          </div>
        )}
        {filtered.map(row => {
          const cc = CLS_COLOR[row.cls];
          return (
            <div
              key={row.id}
              onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{
                padding: '7px 14px',
                borderBottom: '1px solid rgba(30,58,95,0.5)',
                cursor: 'pointer',
                background: expanded[row.id] ? 'rgba(30,58,95,0.3)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: 'rgba(56,189,248,0.15)', border: '1px solid #38BDF8',
                  color: '#38BDF8', padding: '1px 5px', borderRadius: 3, fontSize: 9,
                  minWidth: 22, textAlign: 'center',
                }}>S{row.scene_number}</span>
                <span style={{
                  background: cc + '22', border: `1px solid ${cc}`,
                  color: cc, padding: '1px 6px', borderRadius: 3,
                  fontSize: 9, fontWeight: 700, minWidth: 76, textAlign: 'center',
                }}>{row.cls}</span>
                <span style={{ color: '#CBD5E1', fontSize: 11, flex: 1 }}>{row.title}</span>
                <span style={{ color: '#475569', fontSize: 10 }}>
                  {row.matchedContacts.length}C · {row.matchedSkills.length}Sk · {row.matchedReports.length}R
                </span>
                <span style={{ color: '#6B7280' }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 6, paddingBottom: 4 }}>
                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: '#34D399', fontSize: 10, marginBottom: 3 }}>CONTACTS</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.matchedContacts.slice(0, 8).map((c, i) => {
                          const role = c.role || c.title || '';
                          const org  = c.organization || c.org || c.company || '';
                          return (
                            <span key={i} style={{
                              background: 'rgba(52,211,153,0.1)', border: '1px solid #34D399',
                              color: '#A7F3D0', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            }}>
                              {c.name || c.full_name || `Contact ${i + 1}`}
                              {(role || org) && (
                                <span style={{
                                  background: 'rgba(52,211,153,0.2)', border: '1px solid #34D399',
                                  color: '#34D399', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                                }}>{role || org}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {row.matchedSkills.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: '#818CF8', fontSize: 10, marginBottom: 3 }}>SKILLS</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.matchedSkills.slice(0, 8).map((s, i) => {
                          const score = s.score ?? s.level ?? s.proficiency ?? s.rating ?? null;
                          return (
                            <span key={i} style={{
                              background: 'rgba(129,140,248,0.1)', border: '1px solid #818CF8',
                              color: '#C7D2FE', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            }}>
                              {s.name || s.title || `Skill ${i + 1}`}
                              {score !== null && (
                                <span style={{
                                  background: 'rgba(129,140,248,0.2)', border: '1px solid #818CF8',
                                  color: '#818CF8', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                                }}>{typeof score === 'number' ? score.toFixed(2) : score}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Reports */}
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>REPORTS</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.matchedReports.slice(0, 8).map((r, i) => {
                          const date = r.date || r.created_at || r.published_at || r.updated_at || '';
                          const dateShort = date ? new Date(date).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: '2-digit',
                          }) : '';
                          return (
                            <span key={i} style={{
                              background: 'rgba(167,139,250,0.1)', border: '1px solid #A78BFA',
                              color: '#DDD6FE', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            }}>
                              {r.title || r.name || `Report ${i + 1}`}
                              {dateShort && (
                                <span style={{
                                  background: 'rgba(167,139,250,0.2)', border: '1px solid #A78BFA',
                                  color: '#A78BFA', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                                }}>{dateShort}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {row.matchedContacts.length === 0 && row.matchedSkills.length === 0 && row.matchedReports.length === 0 && (
                    <div style={{ color: '#6B7280', fontSize: 11, padding: '2px 0' }}>
                      No matching contacts, skills, or reports — dark operational mission gap.
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
