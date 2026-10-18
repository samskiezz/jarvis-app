import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVE', 'MONITORED', 'DEPLOYED', 'DORMANT'];
const CLASS_COLOR = {
  ACTIVE:    '#22c55e',
  MONITORED: '#00bfff',
  DEPLOYED:  '#ffd700',
  DORMANT:   '#ff4444',
};
const PULSE_STYLE = `@keyframes iopmap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

export function isIopMapQuery(q) {
  return /\b(iopmap|intel ops|intel dossier|intel profile ops|profile swarm|intel contact map|intel operative|operative map)\b/i.test(q);
}
export function buildIopMapScript() {
  return 'Opening Intel Profile Operations Map. Cross-referencing intelligence profiles against active contacts and swarm jobs to surface dormant operatives.';
}

export default function IntelProfileOpsMap() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [contCount, setContCount]   = useState(0);
  const [swarmCount, setSwarmCount] = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(null);
  const [assessment, setAssessment] = useState({});
  const intervalRef                 = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [intelRes, contRes, swarmRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`),
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/entities/SwarmJob`),
      ]);
      const intelJson = intelRes.ok ? await intelRes.json() : {};
      const contJson  = contRes.ok  ? await contRes.json()  : {};
      const swarmJson = swarmRes.ok ? await swarmRes.json() : {};

      const profiles  = Array.isArray(intelJson) ? intelJson : intelJson.profiles  || intelJson.results || [];
      const contacts  = Array.isArray(contJson)  ? contJson  : contJson.contacts   || contJson.results  || [];
      const jobs      = Array.isArray(swarmJson) ? swarmJson : swarmJson.jobs      || swarmJson.results || [];

      setContCount(contacts.length);
      setSwarmCount(jobs.length);

      const built = profiles.map(p => {
        const pText = [p.name, p.alias, p.description, p.tags, p.category, p.role, p.org].join(' ');
        const pToks = tokens(pText);

        const matchedContacts = contacts.filter(c => {
          const cText = [c.name, c.role, c.org, c.email, c.tags, c.description].join(' ');
          return overlaps(pToks, cText);
        });
        const matchedJobs = jobs.filter(j => {
          const jText = [j.name, j.title, j.description, j.type, j.tags, j.status].join(' ');
          return overlaps(pToks, jText);
        });

        const hasContact = matchedContacts.length > 0;
        const hasJob     = matchedJobs.length > 0;
        const cls = hasContact && hasJob ? 'ACTIVE'
                  : hasContact           ? 'MONITORED'
                  : hasJob               ? 'DEPLOYED'
                  :                        'DORMANT';

        return { profile: p, cls, matchedContacts, matchedJobs };
      });

      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    document.addEventListener('jarvis:iopmap-toggle', handler);
    return () => document.removeEventListener('jarvis:iopmap-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = [r.profile.name, r.profile.alias, r.profile.description, r.profile.role, r.profile.org].join(' ').toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  const counts = { ACTIVE: 0, MONITORED: 0, DEPLOYED: 0, DORMANT: 0 };
  rows.forEach(r => counts[r.cls]++);
  const covPct = pct(counts.ACTIVE + counts.MONITORED + counts.DEPLOYED, rows.length);
  const barColor = covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444';

  const assess = async (profileId, context) => {
    setAssessing(profileId);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess operational coverage for intelligence profile. Context: ${context}` }),
      });
      const d = await r.json();
      setAssessment(a => ({ ...a, [profileId]: (d.answer || '').trim() }));
    } catch {
      setAssessment(a => ({ ...a, [profileId]: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  };

  const assessAll = async () => {
    const dormant = rows.filter(r => r.cls === 'DORMANT');
    const context = `Total profiles: ${rows.length}, Active (contact+job): ${counts.ACTIVE}, Monitored (contact only): ${counts.MONITORED}, Deployed (job only): ${counts.DEPLOYED}, Dormant: ${dormant.length}. Coverage: ${covPct}%. Contacts pool: ${contCount}, Swarm jobs pool: ${swarmCount}. Top dormant: ${dormant.slice(0, 3).map(r => r.profile.name || r.profile.alias).join(', ')}`;
    setAssessing('global');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Provide a 2-sentence intel profile operational coverage brief. ${context}` }),
      });
      const d = await r.json();
      const script = (d.answer || '').trim();
      setAssessment(a => ({ ...a, global: script }));
      if (script) document.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch {
      setAssessment(a => ({ ...a, global: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  };

  if (!open) {
    return (
      <>
        <style>{PULSE_STYLE}</style>
        <button
          onClick={() => setOpen(true)}
          title="Intel Profile Operations Map (IOPMAP)"
          style={{
            position: 'fixed', left: 64600, bottom: 8, zIndex: 124,
            background: 'rgba(5,8,13,0.82)', border: '1px solid #00bfff55',
            color: '#00bfff', borderRadius: 6, padding: '3px 9px',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            cursor: 'pointer', letterSpacing: 1, backdropFilter: 'blur(6px)',
          }}
        >
          {counts.DORMANT > 0 && (
            <span style={{
              display: 'inline-block', marginRight: 5, background: '#ff4444',
              color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 10,
              animation: 'iopmap-pulse 1.4s ease-in-out infinite',
            }}>{counts.DORMANT}</span>
          )}
          ◈ IOPMAP
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }} onClick={() => setOpen(false)}>
        <div style={{
          background: 'rgba(6,10,16,0.97)', border: '1px solid #00bfff55',
          borderRadius: 14, padding: '18px 20px', width: 'min(860px,95vw)',
          maxHeight: '88vh', overflowY: 'auto', position: 'relative',
          fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
        }} onClick={e => e.stopPropagation()}>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 10 }}>
            <span style={{ color: '#00bfff', fontSize: 13, letterSpacing: 2 }}>◈ IOPMAP</span>
            <span style={{ color: '#6e8aa0', fontSize: 11, flex: 1 }}>IntelProfile × Contact × SwarmJob Operational Dossier</span>
            <button onClick={assessAll} disabled={assessing === 'global'}
              style={{ background: 'rgba(0,191,255,0.12)', border: '1px solid #00bfff55', color: '#00bfff',
                borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>
              {assessing === 'global' ? '…' : '▶ ASSESS ALL'}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#6e8aa0', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {assessment.global && (
            <div style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid #00bfff33', borderRadius: 6,
              padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#a8c8e0', lineHeight: 1.5 }}>
              {assessment.global}
            </div>
          )}

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              ['PROFILES',  rows.length,        '#00bfff'],
              ['CONTACTS',  contCount,           '#22c55e'],
              ['SWARM JOBS',swarmCount,          '#ffd700'],
              ['ACTIVE',    counts.ACTIVE,       CLASS_COLOR.ACTIVE],
              ['MONITORED', counts.MONITORED,    CLASS_COLOR.MONITORED],
              ['DEPLOYED',  counts.DEPLOYED,     CLASS_COLOR.DEPLOYED],
              ['DORMANT',   counts.DORMANT,      CLASS_COLOR.DORMANT],
              [`COV ${covPct}%`, null,           barColor],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: 'rgba(5,8,13,0.7)', border: `1px solid ${col}44`,
                borderRadius: 6, padding: '5px 10px', minWidth: 70, textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val !== null ? val : ''}</div>
                <div style={{ color: '#6e8aa0', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ background: 'rgba(5,8,13,0.6)', borderRadius: 4, height: 6, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ width: `${covPct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.5s' }} />
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(0,191,255,0.18)' : 'rgba(5,8,13,0.7)',
                  border: `1px solid ${tab === t ? '#00bfff' : '#00bfff33'}`,
                  color: tab === t ? '#00bfff' : '#6e8aa0', borderRadius: 5,
                  padding: '3px 10px', cursor: 'pointer', fontSize: 11,
                }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                background: 'rgba(5,8,13,0.7)', border: '1px solid #00bfff33',
                color: '#DCEBF5', borderRadius: 5, padding: '3px 10px',
                fontSize: 11, outline: 'none', marginLeft: 'auto', width: 160,
              }}
            />
          </div>

          {loading && <div style={{ color: '#6e8aa0', fontSize: 12, textAlign: 'center', padding: 20 }}>loading…</div>}
          {error && <div style={{ color: '#ff4444', fontSize: 12, padding: 8 }}>{error}</div>}

          {/* Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visible.map((r, i) => {
              const pid = r.profile.id || r.profile._id || i;
              const label = r.profile.name || r.profile.alias || `Profile ${pid}`;
              const isExp = expanded === pid;
              const col = CLASS_COLOR[r.cls];
              const isDormant = r.cls === 'DORMANT';
              return (
                <div key={pid} style={{
                  background: 'rgba(5,8,13,0.7)', border: `1px solid ${col}33`,
                  borderRadius: 7, padding: '8px 12px',
                  animation: isDormant ? 'iopmap-pulse 2s ease-in-out infinite' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    onClick={() => setExpanded(isExp ? null : pid)}>
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 90,
                      letterSpacing: 1 }}>{r.cls}</span>
                    <span style={{ flex: 1, fontSize: 12, color: '#DCEBF5', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {r.profile.role && (
                      <span style={{ color: '#ff9500', fontSize: 9, padding: '1px 4px',
                        border: '1px solid #ff950044', borderRadius: 3, whiteSpace: 'nowrap' }}>
                        {r.profile.role}
                      </span>
                    )}
                    <span style={{ color: '#6e8aa0', fontSize: 10 }}>
                      CT:{r.matchedContacts.length} SJ:{r.matchedJobs.length}
                    </span>
                    <span style={{ color: '#6e8aa0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {r.profile.description && (
                        <div style={{ color: '#6e8aa0', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>
                          {r.profile.description}
                        </div>
                      )}

                      {/* Contact matches */}
                      {r.matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#22c55e', fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>MATCHED CONTACTS</div>
                          {r.matchedContacts.slice(0, 3).map((c, ci) => {
                            const overlap = tokens([c.name, c.role, c.org].join(' '))
                              .filter(t => tokens([r.profile.name, r.profile.description, r.profile.alias].join(' ')).includes(t)).length;
                            const rel = Math.min(100, overlap * 25 + 25);
                            return (
                              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ color: '#a8c8e0', fontSize: 11, flex: 1, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.name}
                                </span>
                                {c.role && <span style={{ color: '#22c55e', fontSize: 9, padding: '1px 4px',
                                  border: '1px solid #22c55e44', borderRadius: 3 }}>{c.role}</span>}
                                <div style={{ width: 60, height: 4, background: 'rgba(34,197,94,0.15)', borderRadius: 2 }}>
                                  <div style={{ width: `${rel}%`, height: '100%', background: '#22c55e', borderRadius: 2 }} />
                                </div>
                                <span style={{ color: '#22c55e', fontSize: 10, minWidth: 28 }}>{rel}%</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* SwarmJob matches */}
                      {r.matchedJobs.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#ffd700', fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>MATCHED SWARM JOBS</div>
                          {r.matchedJobs.slice(0, 3).map((j, ji) => {
                            const overlap = tokens([j.name, j.description, j.type].join(' '))
                              .filter(t => tokens([r.profile.name, r.profile.description, r.profile.alias].join(' ')).includes(t)).length;
                            const rel = Math.min(100, overlap * 25 + 25);
                            return (
                              <div key={ji} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ color: '#a8c8e0', fontSize: 11, flex: 1, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {j.name || j.title}
                                </span>
                                {j.status && <span style={{ color: '#ffd700', fontSize: 9, padding: '1px 4px',
                                  border: '1px solid #ffd70044', borderRadius: 3 }}>{j.status}</span>}
                                <div style={{ width: 60, height: 4, background: 'rgba(255,215,0,0.15)', borderRadius: 2 }}>
                                  <div style={{ width: `${rel}%`, height: '100%', background: '#ffd700', borderRadius: 2 }} />
                                </div>
                                <span style={{ color: '#ffd700', fontSize: 10, minWidth: 28 }}>{rel}%</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <button onClick={() => {
                        const ctx = `Profile: ${label}. Role: ${r.profile.role || 'unknown'}. Class: ${r.cls}. Matched contacts: ${r.matchedContacts.length}, Matched swarm jobs: ${r.matchedJobs.length}.`;
                        assess(pid, ctx);
                      }} disabled={assessing === pid}
                        style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid #00bfff44',
                          color: '#00bfff', borderRadius: 4, padding: '3px 10px',
                          cursor: 'pointer', fontSize: 11, marginTop: 4 }}>
                        {assessing === pid ? '…' : '▶ ASSESS'}
                      </button>

                      {assessment[pid] && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#a8c8e0', lineHeight: 1.5,
                          background: 'rgba(0,191,255,0.06)', borderRadius: 4, padding: '6px 8px' }}>
                          {assessment[pid]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {visible.length === 0 && !loading && (
            <div style={{ color: '#6e8aa0', fontSize: 12, textAlign: 'center', padding: 20 }}>
              No intel profiles match this filter.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
