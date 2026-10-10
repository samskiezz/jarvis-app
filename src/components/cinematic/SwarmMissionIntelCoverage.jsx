import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'FULLY_EQUIPPED', 'DUAL_SUPPORTED', 'SINGLE_LINKED', 'ORPHANED'];
const CLASS_COLOR = {
  FULLY_EQUIPPED: '#22c55e',
  DUAL_SUPPORTED: '#00bfff',
  SINGLE_LINKED:  '#ffd700',
  ORPHANED:       '#ff4444',
};
const PULSE_STYLE = `@keyframes smicov-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

export function isSmicovQuery(q) {
  return /\b(smicov|swarm mission intel|orphaned swarm|swarm knowledge coverage|swarm mission coverage|swarm full coverage|swarm intel coverage)\b/i.test(q);
}
export function buildSmicovScript() {
  return 'Opening Swarm Mission Intel Coverage panel. Cross-referencing swarm jobs against knowledge, scenarios, and contacts to surface orphaned operations.';
}

export default function SwarmMissionIntelCoverage() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [kbCount, setKbCount]       = useState(0);
  const [scenCount, setScenCount]   = useState(0);
  const [contCount, setContCount]   = useState(0);
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
      const [swarmRes, kbRes, scenRes, contRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/v1/scenario/list`),
        fetch(`${API}/entities/Contact`),
      ]);
      const swarmJson = swarmRes.ok ? await swarmRes.json() : {};
      const kbJson    = kbRes.ok   ? await kbRes.json()    : {};
      const scenJson  = scenRes.ok ? await scenRes.json()  : {};
      const contJson  = contRes.ok ? await contRes.json()  : {};

      const jobs      = Array.isArray(swarmJson) ? swarmJson : swarmJson.jobs      || swarmJson.results   || [];
      const articles  = Array.isArray(kbJson)    ? kbJson    : kbJson.articles     || kbJson.results      || [];
      const scenarios = Array.isArray(scenJson)  ? scenJson  : scenJson.scenarios  || scenJson.results    || [];
      const contacts  = Array.isArray(contJson)  ? contJson  : contJson.contacts   || contJson.results    || [];

      setKbCount(articles.length);
      setScenCount(scenarios.length);
      setContCount(contacts.length);

      const built = jobs.map(j => {
        const jText = [j.name, j.title, j.description, j.type, j.status, j.tags].join(' ');
        const jToks = tokens(jText);

        const matchedKb = articles.filter(a => {
          const aText = [a.title, a.content, a.tags, a.category].join(' ');
          return overlaps(jToks, aText);
        });
        const matchedScen = scenarios.filter(s => {
          const sText = [s.name, s.title, s.description, s.type, s.tags].join(' ');
          return overlaps(jToks, sText);
        });
        const matchedCont = contacts.filter(c => {
          const cText = [c.name, c.role, c.org, c.email, c.tags].join(' ');
          return overlaps(jToks, cText);
        });

        const score = (matchedKb.length > 0 ? 1 : 0)
                    + (matchedScen.length > 0 ? 1 : 0)
                    + (matchedCont.length > 0 ? 1 : 0);

        const cls = score === 3 ? 'FULLY_EQUIPPED'
                  : score === 2 ? 'DUAL_SUPPORTED'
                  : score === 1 ? 'SINGLE_LINKED'
                  :               'ORPHANED';

        return { job: j, cls, matchedKb, matchedScen, matchedCont };
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
    document.addEventListener('jarvis:smicov-toggle', handler);
    return () => document.removeEventListener('jarvis:smicov-toggle', handler);
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
      const label = [r.job.name, r.job.title, r.job.description, r.job.type, r.job.status].join(' ').toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  const counts = { FULLY_EQUIPPED: 0, DUAL_SUPPORTED: 0, SINGLE_LINKED: 0, ORPHANED: 0 };
  rows.forEach(r => counts[r.cls]++);
  const covPct = pct(counts.FULLY_EQUIPPED + counts.DUAL_SUPPORTED, rows.length);
  const barColor = covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444';

  const assess = async (jobId, context) => {
    setAssessing(jobId);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess mission intelligence coverage for swarm job. Context: ${context}` }),
      });
      const d = await r.json();
      setAssessment(a => ({ ...a, [jobId]: (d.answer || '').trim() }));
    } catch {
      setAssessment(a => ({ ...a, [jobId]: 'Assessment unavailable.' }));
    } finally {
      setAssessing(null);
    }
  };

  const assessAll = async () => {
    const orphaned = rows.filter(r => r.cls === 'ORPHANED');
    const context = `Total jobs: ${rows.length}, Orphaned (no KB/scenario/contact): ${orphaned.length}, Coverage: ${covPct}%. Top orphaned: ${orphaned.slice(0, 3).map(r => r.job.name || r.job.title).join(', ')}`;
    setAssessing('global');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Provide a 2-sentence swarm mission intelligence coverage brief. ${context}` }),
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
          title="Swarm Mission Intel Coverage (SMICOV)"
          style={{
            position: 'fixed', left: 1120240, bottom: 8, zIndex: 716,
            background: 'rgba(5,8,13,0.82)', border: '1px solid #00bfff55',
            color: '#00bfff', borderRadius: 6, padding: '3px 9px',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
            cursor: 'pointer', letterSpacing: 1, backdropFilter: 'blur(6px)',
          }}
        >
          {counts.ORPHANED > 0 && (
            <span style={{
              display: 'inline-block', marginRight: 5, background: '#ff4444',
              color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 10,
              animation: 'smicov-pulse 1.4s ease-in-out infinite',
            }}>{counts.ORPHANED}</span>
          )}
          ◈ SMICOV
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
            <span style={{ color: '#00bfff', fontSize: 13, letterSpacing: 2 }}>◈ SMICOV</span>
            <span style={{ color: '#6e8aa0', fontSize: 11, flex: 1 }}>SwarmJob × Knowledge × Scenario × Contact Mission Intel Coverage</span>
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
              ['SWARM JOBS', rows.length, '#00bfff'],
              ['KB ARTICLES', kbCount, '#22c55e'],
              ['SCENARIOS', scenCount, '#ffd700'],
              ['CONTACTS', contCount, '#ff9500'],
              ['FULLY EQUIP', counts.FULLY_EQUIPPED, CLASS_COLOR.FULLY_EQUIPPED],
              ['DUAL SUPP', counts.DUAL_SUPPORTED, CLASS_COLOR.DUAL_SUPPORTED],
              ['SINGLE', counts.SINGLE_LINKED, CLASS_COLOR.SINGLE_LINKED],
              ['ORPHANED', counts.ORPHANED, CLASS_COLOR.ORPHANED],
              [`COV ${covPct}%`, null, barColor],
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
                }}>{t.replace(/_/g, ' ')}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                background: 'rgba(5,8,13,0.7)', border: '1px solid #00bfff33',
                color: '#DCEBF5', borderRadius: 5, padding: '3px 10px',
                fontSize: 11, outline: 'none', marginLeft: 'auto', width: 140,
              }}
            />
          </div>

          {loading && <div style={{ color: '#6e8aa0', fontSize: 12, textAlign: 'center', padding: 20 }}>loading…</div>}
          {error && <div style={{ color: '#ff4444', fontSize: 12, padding: 8 }}>{error}</div>}

          {/* Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visible.map((r, i) => {
              const jobId = r.job.id || r.job._id || i;
              const label = r.job.name || r.job.title || `Job ${jobId}`;
              const isExp = expanded === jobId;
              const col = CLASS_COLOR[r.cls];
              const isOrphaned = r.cls === 'ORPHANED';
              return (
                <div key={jobId} style={{
                  background: 'rgba(5,8,13,0.7)', border: `1px solid ${col}33`,
                  borderRadius: 7, padding: '8px 12px',
                  animation: isOrphaned ? 'smicov-pulse 2s ease-in-out infinite' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    onClick={() => setExpanded(isExp ? null : jobId)}>
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 110,
                      letterSpacing: 1 }}>{r.cls.replace(/_/g, ' ')}</span>
                    <span style={{ flex: 1, fontSize: 12, color: '#DCEBF5', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#6e8aa0', fontSize: 10 }}>
                      KB:{r.matchedKb.length} SC:{r.matchedScen.length} CT:{r.matchedCont.length}
                    </span>
                    <span style={{ color: '#6e8aa0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {r.job.description && (
                        <div style={{ color: '#6e8aa0', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>
                          {r.job.description}
                        </div>
                      )}

                      {/* KB matches */}
                      {r.matchedKb.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#22c55e', fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>KB ARTICLES</div>
                          {r.matchedKb.slice(0, 3).map((a, ai) => {
                            const overlap = tokens([a.title, a.tags, a.category].join(' '))
                              .filter(t => tokens([r.job.name, r.job.description].join(' ')).includes(t)).length;
                            const rel = Math.min(100, overlap * 25 + 25);
                            return (
                              <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ color: '#a8c8e0', fontSize: 11, flex: 1, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {a.title || a.name}
                                </span>
                                <div style={{ width: 60, height: 4, background: 'rgba(34,197,94,0.15)', borderRadius: 2 }}>
                                  <div style={{ width: `${rel}%`, height: '100%', background: '#22c55e', borderRadius: 2 }} />
                                </div>
                                <span style={{ color: '#22c55e', fontSize: 10, minWidth: 28 }}>{rel}%</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Scenario matches */}
                      {r.matchedScen.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#00bfff', fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>SCENARIOS</div>
                          {r.matchedScen.slice(0, 3).map((s, si) => {
                            const overlap = tokens([s.name, s.description].join(' '))
                              .filter(t => tokens([r.job.name, r.job.description].join(' ')).includes(t)).length;
                            const rel = Math.min(100, overlap * 25 + 25);
                            return (
                              <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ color: '#a8c8e0', fontSize: 11, flex: 1, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {s.name || s.title}
                                </span>
                                {s.type && <span style={{ color: '#00bfff', fontSize: 9, padding: '1px 4px',
                                  border: '1px solid #00bfff44', borderRadius: 3 }}>{s.type}</span>}
                                <div style={{ width: 60, height: 4, background: 'rgba(0,191,255,0.15)', borderRadius: 2 }}>
                                  <div style={{ width: `${rel}%`, height: '100%', background: '#00bfff', borderRadius: 2 }} />
                                </div>
                                <span style={{ color: '#00bfff', fontSize: 10, minWidth: 28 }}>{rel}%</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Contact matches */}
                      {r.matchedCont.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: '#ff9500', fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>CONTACTS</div>
                          {r.matchedCont.slice(0, 3).map((c, ci) => {
                            const overlap = tokens([c.name, c.org, c.role].join(' '))
                              .filter(t => tokens([r.job.name, r.job.description].join(' ')).includes(t)).length;
                            const rel = Math.min(100, overlap * 25 + 25);
                            return (
                              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ color: '#a8c8e0', fontSize: 11, flex: 1, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.name}
                                </span>
                                {c.role && <span style={{ color: '#ff9500', fontSize: 9, padding: '1px 4px',
                                  border: '1px solid #ff950044', borderRadius: 3 }}>{c.role}</span>}
                                <div style={{ width: 60, height: 4, background: 'rgba(255,149,0,0.15)', borderRadius: 2 }}>
                                  <div style={{ width: `${rel}%`, height: '100%', background: '#ff9500', borderRadius: 2 }} />
                                </div>
                                <span style={{ color: '#ff9500', fontSize: 10, minWidth: 28 }}>{rel}%</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <button onClick={() => {
                        const ctx = `Job: ${label}. Status: ${r.job.status || 'unknown'}. KB matches: ${r.matchedKb.length}, Scenario matches: ${r.matchedScen.length}, Contact matches: ${r.matchedCont.length}. Class: ${r.cls}.`;
                        assess(jobId, ctx);
                      }} disabled={assessing === jobId}
                        style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid #00bfff44',
                          color: '#00bfff', borderRadius: 4, padding: '3px 10px',
                          cursor: 'pointer', fontSize: 11, marginTop: 4 }}>
                        {assessing === jobId ? '…' : '▶ ASSESS'}
                      </button>

                      {assessment[jobId] && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#a8c8e0', lineHeight: 1.5,
                          background: 'rgba(0,191,255,0.06)', borderRadius: 4, padding: '6px 8px' }}>
                          {assessment[jobId]}
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
              No swarm jobs match this filter.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
