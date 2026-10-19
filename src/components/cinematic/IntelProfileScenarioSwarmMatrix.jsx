/**
 * IntelProfileScenarioSwarmMatrix — F40
 *
 * Fetches /entities/IntelProfile + /v1/scenario/list + /entities/SwarmJob
 * Keyword-matches each intel profile against scenarios AND swarm jobs to classify:
 *   ORCHESTRATED — matched both a scenario AND a swarm job (fully operationalised)
 *   SCENED       — matched a scenario only (planned, no active swarm)
 *   SWARMED      — matched a swarm job only (active but no formal scenario)
 *   SHADOW       — no match in either (unlinked profile, blind spot)
 *
 * Toggle: ◈ IORMAT button (fixed, bottom strip) left:71320, zIndex:138
 * Stat tiles: profiles / scenarios / swarm jobs / orchestrated / scened / swarmed / shadow
 * Amber pulse on SHADOW count.
 * Expandable rows: matched scenarios + matched swarm jobs with status badge.
 * Filter tabs: ALL / ORCHESTRATED / SCENED / SWARMED / SHADOW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "intel orchestration"/"scenario swarm"/"iormat"/"intel scenario"/"profile swarm"/"swarm matrix"
 * Event: jarvis:iormat-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ORCHESTRATED', 'SCENED', 'SWARMED', 'SHADOW'];

const CLS_COLOR = {
  ORCHESTRATED: '#22c55e',
  SCENED:       '#29E7FF',
  SWARMED:      '#A78BFA',
  SHADOW:       '#F59E0B',
};

const PULSE_CSS = `@keyframes iormat-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(profileToks, scenarios, swarmJobs) {
  const matchedScenarios = scenarios.filter(s =>
    overlaps(profileToks, [s.title, s.name, s.description, s.tags, s.type, s.category, s.target, s.objective].join(' '))
  );
  const matchedSwarms = swarmJobs.filter(j =>
    overlaps(profileToks, [j.title, j.name, j.description, j.tags, j.type, j.target, j.mission, j.goal].join(' '))
  );
  if (matchedScenarios.length > 0 && matchedSwarms.length > 0)
    return { cls: 'ORCHESTRATED', matchedScenarios, matchedSwarms };
  if (matchedScenarios.length > 0)
    return { cls: 'SCENED', matchedScenarios, matchedSwarms: [] };
  if (matchedSwarms.length > 0)
    return { cls: 'SWARMED', matchedScenarios: [], matchedSwarms };
  return { cls: 'SHADOW', matchedScenarios: [], matchedSwarms: [] };
}

export function isIormatQuery(q) {
  return /\b(intel.orch|scenario.swarm|iormat|intel.scenario|profile.swarm|swarm.matrix|intel.matrix|orch.matrix)\b/i.test(q);
}
export function buildIormatScript() {
  return 'Opening Intel Profile × Scenario × Swarm Orchestration Matrix. Cross-referencing all intelligence profiles against active scenarios and swarm jobs to identify shadow profiles and orchestration gaps.';
}

export default function IntelProfileScenarioSwarmMatrix() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [scenCount, setScenCount]   = useState(0);
  const [swarmCount, setSwarmCount] = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [profRes, scenRes, swarmRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`, { headers }),
        fetch(`${API}/v1/scenario/list`, { headers }),
        fetch(`${API}/entities/SwarmJob`, { headers }),
      ]);
      const profData  = profRes.ok  ? await profRes.json()  : [];
      const scenData  = scenRes.ok  ? await scenRes.json()  : [];
      const swarmData = swarmRes.ok ? await swarmRes.json() : [];

      const profiles  = Array.isArray(profData)  ? profData  : (profData.items  || profData.data  || profData.profiles  || profData.intel  || []);
      const scenarios = Array.isArray(scenData)  ? scenData  : (scenData.items  || scenData.data  || scenData.scenarios || scenData.list   || []);
      const swarmJobs = Array.isArray(swarmData) ? swarmData : (swarmData.items || swarmData.data || swarmData.jobs     || swarmData.swarm  || []);

      setScenCount(scenarios.length);
      setSwarmCount(swarmJobs.length);

      const classified = profiles.map(profile => {
        const name       = profile.name || profile.title || profile.alias || profile.id || '';
        const profileToks = tokens([name, profile.description, profile.tags, profile.type, profile.category, profile.threat, profile.entity, profile.subject].join(' '));
        const { cls, matchedScenarios, matchedSwarms } = classify(profileToks, scenarios, swarmJobs);
        return { ...profile, _name: name || profile.id || 'Unknown', _cls: cls, _scenarios: matchedScenarios, _swarms: matchedSwarms };
      });
      setRows(classified);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(v => !v); };
    window.addEventListener('jarvis:iormat-toggle', handler);
    return () => window.removeEventListener('jarvis:iormat-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const counts = { ORCHESTRATED: 0, SCENED: 0, SWARMED: 0, SHADOW: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r._name + (r.description || '') + (r.type || '') + (r.threat || '')).toLowerCase().includes(q);
    }
    return true;
  });

  const speak = useCallback(text => {
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const shadowNames = rows.filter(r => r._cls === 'SHADOW').map(r => r._name).slice(0, 5).join(', ');
    const prompt = `Intel Profile × Scenario × Swarm Orchestration Matrix: ${rows.length} intel profiles total. ` +
      `ORCHESTRATED (scenario+swarm): ${counts.ORCHESTRATED}, SCENED (scenario only): ${counts.SCENED}, ` +
      `SWARMED (swarm only): ${counts.SWARMED}, SHADOW (unlinked): ${counts.SHADOW}. ` +
      `${counts.SHADOW > 0 ? `Shadow profiles include: ${shadowNames || 'multiple'}. ` : ''}` +
      `Active scenarios: ${scenCount}. Active swarm jobs: ${swarmCount}. ` +
      `In two sentences, identify the most critical orchestration gap and recommend the immediate action to operationalise shadow intel profiles.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const txt = d.response || d.message || d.reply || d.content || 'No response.';
      setAssessment(txt);
      speak(txt);
    } catch (e) {
      setAssessment(e.message);
    } finally {
      setAssessing(false);
    }
  }, [rows, counts, scenCount, swarmCount, speak]);

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 71320, zIndex: 138,
            background: 'rgba(0,0,0,0.75)', border: '1px solid #F59E0B',
            color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ IORMAT
          {counts.SHADOW > 0 && (
            <span style={{ marginLeft: 4, color: '#F59E0B', animation: 'iormat-pulse 1.5s infinite' }}>
              {counts.SHADOW}▲
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
        width: 820, maxHeight: '80vh', overflowY: 'auto',
        background: 'rgba(8,12,18,0.97)', border: '1px solid #F59E0B',
        borderRadius: 8, zIndex: 9138, fontFamily: 'monospace', fontSize: 11, color: '#c8d8e0',
        boxShadow: '0 0 30px rgba(245,158,11,0.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #1e3a4a' }}>
          <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2 }}>◈ INTEL PROFILE × SCENARIO × SWARM — ORCHESTRATION MATRIX</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #F59E0B', color: '#F59E0B', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #1e3a4a', flexWrap: 'wrap' }}>
          {[
            ['PROFILES',     rows.length,          '#c8d8e0'],
            ['SCENARIOS',    scenCount,             '#c8d8e0'],
            ['SWARM JOBS',   swarmCount,            '#c8d8e0'],
            ['ORCHESTRATED', counts.ORCHESTRATED,   CLS_COLOR.ORCHESTRATED],
            ['SCENED',       counts.SCENED,         CLS_COLOR.SCENED],
            ['SWARMED',      counts.SWARMED,        CLS_COLOR.SWARMED],
            ['SHADOW',       counts.SHADOW,         CLS_COLOR.SHADOW],
          ].map(([label, val, col]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center' }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#6A8BA0', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', alignItems: 'center', borderBottom: '1px solid #1e3a4a' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CLS_COLOR[t] || '#F59E0B' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${CLS_COLOR[t] || '#F59E0B'}`,
              color: tab === t ? '#000' : (CLS_COLOR[t] || '#F59E0B'),
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search profiles…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #1e3a4a', color: '#c8d8e0', padding: '3px 8px', borderRadius: 3, fontSize: 10 }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '4px 14px' }}>
          {loading && <div style={{ color: '#6A8BA0', padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#FF4D6D', padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && <div style={{ color: '#6A8BA0', padding: 12 }}>No profiles match filter.</div>}
          {visible.map((profile, i) => {
            const isExp = expanded === i;
            return (
              <div key={profile.id || i} style={{ borderBottom: '1px solid #1a2a36', padding: '6px 0' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : i)}
                >
                  <span style={{ color: CLS_COLOR[profile._cls], fontSize: 9, minWidth: 90, fontWeight: 700 }}>{profile._cls}</span>
                  <span style={{ flex: 1, color: '#e2eaf0' }}>{profile._name}</span>
                  {profile.type && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(41,231,255,0.1)', color: '#29E7FF' }}>{profile.type}</span>
                  )}
                  {profile.threat && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,77,109,0.15)', color: '#FF4D6D' }}>{profile.threat}</span>
                  )}
                  <span style={{ color: '#4a6a7a', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ marginTop: 6, paddingLeft: 16, paddingBottom: 6 }}>
                    {profile._scenarios.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#29E7FF', fontSize: 9, marginBottom: 3 }}>LINKED SCENARIOS ({profile._scenarios.length})</div>
                        {profile._scenarios.slice(0, 4).map((s, si) => (
                          <div key={si} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#29E7FF', fontSize: 9 }}>◈</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{s.title || s.name || `Scenario ${si + 1}`}</span>
                            {s.status && (
                              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#29E7FF22', color: '#29E7FF' }}>{s.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {profile._swarms.length > 0 && (
                      <div>
                        <div style={{ color: '#A78BFA', fontSize: 9, marginBottom: 3 }}>LINKED SWARM JOBS ({profile._swarms.length})</div>
                        {profile._swarms.slice(0, 4).map((j, ji) => (
                          <div key={ji} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#A78BFA', fontSize: 9 }}>⬡</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{j.name || j.title || `SwarmJob ${ji + 1}`}</span>
                            {j.status && (
                              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#A78BFA22', color: '#A78BFA' }}>{j.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {profile._scenarios.length === 0 && profile._swarms.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No scenario or swarm job linked — shadow profile, potential orchestration blind spot.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1e3a4a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.15)',
              border: '1px solid #F59E0B', color: '#F59E0B',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS ORCHESTRATION GAPS'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid #F59E0B', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>

      {/* Collapsed toggle */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 71320, zIndex: 9139,
          background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ IORMAT ✕
      </button>
    </>
  );
}
