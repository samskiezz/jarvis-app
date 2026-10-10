import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_AUTOMATED', 'SKILL_BACKED', 'ALERT_DRIVEN', 'UNAUTOMATED'];

const CLASS_COLOR = {
  FULLY_AUTOMATED: '#22c55e',
  SKILL_BACKED:    '#00bfff',
  ALERT_DRIVEN:    '#fb923c',
  UNAUTOMATED:     '#ff4444',
};

const PULSE_STYLE = `
@keyframes soarnex-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

export default function SwarmJobAipSkillAlertNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [sjRes, asRes, alRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob?limit=200`),
        fetch(`${API}/v1/aip/skill`),
        fetch(`${API}/v1/ops/alerts`),
      ]);
      const sjData = sjRes.ok ? await sjRes.json() : {};
      const asData = asRes.ok ? await asRes.json() : {};
      const alData = alRes.ok ? await alRes.json() : {};

      const jobs   = sjData.jobs    || sjData.items || sjData.data || [];
      const skills = asData.skills  || asData.items || asData.data || [];
      const alerts = alData.alerts  || alData.items || alData.data || [];

      const skillBlobs = skills.map(s => ({
        id:   s.id || s.skill_id,
        name: s.name || s.title || '',
        type: s.type || s.category || '',
        text: [s.name, s.title, s.description, s.type, s.category,
               ...(s.tags || [])].filter(Boolean).join(' '),
      }));

      const alertBlobs = alerts.map(a => ({
        id:       a.id || a.alert_id,
        name:     a.name || a.title || a.summary || '',
        severity: a.severity || a.level || '',
        type:     a.type || a.alert_type || '',
        text:     [a.name, a.title, a.summary, a.description, a.type, a.severity,
                   a.source, a.category, ...(a.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = jobs.map(job => {
        const jToks = [
          job.name, job.title, job.description, job.type, job.status,
          job.objective, job.category, job.swarm_type,
          ...(job.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedSkills = skillBlobs.filter(s => overlaps(jToks, s.text)).slice(0, 4);
        const matchedAlerts = alertBlobs.filter(a => overlaps(jToks, a.text)).slice(0, 4);

        const hasSkill  = matchedSkills.length > 0;
        const hasAlert  = matchedAlerts.length > 0;

        let cls;
        if (hasSkill && hasAlert)  cls = 'FULLY_AUTOMATED';
        else if (hasSkill)         cls = 'SKILL_BACKED';
        else if (hasAlert)         cls = 'ALERT_DRIVEN';
        else                       cls = 'UNAUTOMATED';

        return {
          id:            job.id || job.job_id || Math.random(),
          name:          job.name || job.title || '(unnamed job)',
          status:        job.status || '',
          type:          job.type || job.swarm_type || '',
          cls,
          matchedSkills,
          matchedAlerts,
        };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:soarnex-toggle', onToggle);
    return () => window.removeEventListener('jarvis:soarnex-toggle', onToggle);
  }, []);

  const filtered = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.cls === tab;
    const matchSrc = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.status.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrc;
  });

  const stats = {
    total:      rows.length,
    fullyAuto:  rows.filter(r => r.cls === 'FULLY_AUTOMATED').length,
    skillOnly:  rows.filter(r => r.cls === 'SKILL_BACKED').length,
    alertOnly:  rows.filter(r => r.cls === 'ALERT_DRIVEN').length,
    unautomated:rows.filter(r => r.cls === 'UNAUTOMATED').length,
  };
  const autoPct = stats.total ? Math.round(((stats.fullyAuto + stats.skillOnly + stats.alertOnly) / stats.total) * 100) : 0;
  const barColor = autoPct >= 70 ? '#22c55e' : autoPct >= 40 ? '#ffd700' : '#ff4444';

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief('');
    try {
      const ctx = `SwarmJobs:${stats.total} AIPSkills:referenced AlertsLinked:referenced FullyAutomated:${stats.fullyAuto} SkillBacked:${stats.skillOnly} AlertDriven:${stats.alertOnly} Unautomated:${stats.unautomated} AUTO%:${autoPct}`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `SOARNEX assessment: ${ctx}. In 2 sentences, assess swarm job automation coverage and identify the highest-priority unautomated gap.` }),
      });
      const d = res.ok ? await res.json() : {};
      const txt = d.response || d.message || d.reply || 'Assessment unavailable.';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [stats, autoPct]);

  if (!open) {
    return (
      <>
        <style>{PULSE_STYLE}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', left: 1115760, bottom: 8, zIndex: 708,
            background: 'rgba(0,0,0,0.7)', border: '1px solid #00bfff44',
            color: '#00bfff', padding: '4px 10px', fontSize: 11,
            borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ◈ SOARNEX
          {stats.unautomated > 0 && (
            <span style={{
              marginLeft: 6, background: '#ff4444', color: '#fff',
              borderRadius: '50%', padding: '1px 5px', fontSize: 10,
              animation: 'soarnex-pulse 1.5s infinite',
            }}>{stats.unautomated}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <div style={{
        position: 'fixed', right: 20, top: 60, width: 540, maxHeight: '80vh',
        background: 'rgba(0,0,0,0.92)', border: '1px solid #00bfff44',
        borderRadius: 8, zIndex: 9999, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', fontFamily: 'monospace',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid #00bfff22',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#00bfff', fontSize: 13, fontWeight: 700 }}>
            ◈ SOARNEX — Swarm Job × AIP Skill × Ops Alert Response Automation Nexus
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#ff4444',
            cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{
          display: 'flex', gap: 8, padding: '10px 16px',
          borderBottom: '1px solid #00bfff11', flexWrap: 'wrap',
        }}>
          {[
            ['TOTAL', stats.total, '#00bfff'],
            ['FULLY AUTO', stats.fullyAuto, '#22c55e'],
            ['SKILL BACKED', stats.skillOnly, '#00bfff'],
            ['ALERT DRIVEN', stats.alertOnly, '#fb923c'],
            ['UNAUTOMATED', stats.unautomated, '#ff4444'],
            [`AUTO ${autoPct}%`, null, barColor],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: `${color}18`, border: `1px solid ${color}44`,
              borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center',
            }}>
              <div style={{ color, fontSize: 10 }}>{label}</div>
              {val !== null && <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>}
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        <div style={{ padding: '4px 16px 8px', borderBottom: '1px solid #00bfff11' }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>AUTOMATION COVERAGE</div>
          <div style={{ height: 6, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${autoPct}%`, background: barColor, transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Assess button + brief */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid #00bfff11' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: '#00bfff22', border: '1px solid #00bfff66', color: '#00bfff',
            padding: '4px 14px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
          }}>
            {assessing ? '◌ Assessing…' : '▶ ASSESS AUTOMATION'}
          </button>
          {brief && (
            <div style={{
              marginTop: 6, fontSize: 11, color: '#a0f0ff',
              background: '#00bfff11', border: '1px solid #00bfff22',
              borderRadius: 4, padding: '6px 10px',
            }}>{brief}</div>
          )}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #00bfff11', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? '#00bfff33' : 'transparent',
              border: `1px solid ${tab === t ? '#00bfff' : '#00bfff33'}`,
              color: tab === t ? '#00bfff' : '#666',
              padding: '2px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
            }}>{t}</button>
          ))}
          <input
            placeholder="search jobs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              marginLeft: 'auto', background: '#111', border: '1px solid #00bfff33',
              color: '#ccc', padding: '2px 8px', fontSize: 10, borderRadius: 3, width: 120,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px' }}>
          {loading && <div style={{ color: '#666', fontSize: 11 }}>Loading…</div>}
          {err && <div style={{ color: '#ff4444', fontSize: 11 }}>Error: {err}</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: '#666', fontSize: 11 }}>No results.</div>
          )}
          {filtered.map(row => (
            <div
              key={row.id}
              style={{
                borderBottom: '1px solid #00bfff11', padding: '8px 0', cursor: 'pointer',
                animation: row.cls === 'UNAUTOMATED' ? 'soarnex-pulse 2s infinite' : undefined,
              }}
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e0e0e0', fontSize: 12 }}>{row.name}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {row.status && (
                    <span style={{
                      background: '#ffffff11', border: '1px solid #ffffff22',
                      color: '#888', borderRadius: 3, padding: '0 6px', fontSize: 10,
                    }}>{row.status}</span>
                  )}
                  <span style={{
                    background: `${CLASS_COLOR[row.cls]}22`,
                    border: `1px solid ${CLASS_COLOR[row.cls]}`,
                    color: CLASS_COLOR[row.cls], borderRadius: 4,
                    padding: '2px 8px', fontSize: 10, marginLeft: 8,
                  }}>{row.cls}</span>
                </div>
              </div>

              {expanded === row.id && (
                <div style={{ marginTop: 10 }}>
                  {/* AIP Skill matches */}
                  {row.matchedSkills.length > 0 && (
                    <>
                      <div style={{ color: '#00bfff', fontSize: 11, marginBottom: 4 }}>◈ AIP SKILLS</div>
                      {row.matchedSkills.map((s, i) => (
                        <div key={i} style={{
                          background: 'rgba(0,191,255,0.08)', border: '1px solid #00bfff44',
                          borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                          display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span style={{ color: '#7dd3fc' }}>{s.name}</span>
                          {s.type && (
                            <span style={{
                              background: '#00bfff22', border: '1px solid #00bfff44',
                              color: '#00bfff', borderRadius: 3, padding: '0 6px', fontSize: 10,
                            }}>{s.type}</span>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {/* Alert matches */}
                  {row.matchedAlerts.length > 0 && (
                    <>
                      <div style={{ color: '#fb923c', fontSize: 11, marginBottom: 4, marginTop: 6 }}>◈ OPS ALERTS</div>
                      {row.matchedAlerts.map((a, i) => (
                        <div key={i} style={{
                          background: 'rgba(251,146,60,0.08)', border: '1px solid #fb923c44',
                          borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                          display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span style={{ color: '#fdba74' }}>{a.name}</span>
                          {a.severity && (
                            <span style={{
                              background: '#fb923c22', border: '1px solid #fb923c44',
                              color: '#fb923c', borderRadius: 3, padding: '0 6px', fontSize: 10,
                            }}>{a.severity}</span>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {row.matchedSkills.length === 0 && row.matchedAlerts.length === 0 && (
                    <div style={{ color: '#ff4444', fontSize: 11 }}>⚠ No automation coverage — swarm job has no matching AIP skill or ops alert.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function isSoarnexQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('soarnex') ||
    s.includes('swarm automation') ||
    s.includes('skill automation') ||
    s.includes('alert automation') ||
    s.includes('automated swarm') ||
    s.includes('unautomated swarm') ||
    s.includes('swarm response automation') ||
    s.includes('swarm aip alert') ||
    s.includes('response automation nexus') ||
    s.includes('swarm alert skill')
  );
}

export function buildSoarnexScript() {
  return 'SOARNEX online. Opening Swarm Job Response Automation Nexus — correlating swarm jobs against AIP skills and ops alerts to classify automation coverage.';
}
