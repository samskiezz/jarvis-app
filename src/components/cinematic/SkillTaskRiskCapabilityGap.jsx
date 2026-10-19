/**
 * SkillTaskRiskCapabilityGap — F43
 *
 * Fetches /v1/aip/skill + /entities/Task + /entities/RiskSignal
 * Keyword-matches each skill against tasks AND risk signals to classify:
 *   COVERED  — matched both a task AND a risk signal (skill deployed and risk-aware)
 *   TASKED   — matched a task only (skill applied, no associated risk signal coverage)
 *   SIGNALED — matched a risk signal only (skill relevant to a risk, not yet assigned a task)
 *   IDLE     — no match in either (skill available but unused — capability gap)
 *
 * Toggle: ◈ SKTRGAP button (fixed, bottom strip) left:73000, zIndex:141
 * Stat tiles: skills / tasks / risk signals / covered / tasked / signaled / idle
 * Amber pulse on IDLE count.
 * Expandable rows: matched tasks + matched risk signals.
 * Filter tabs: ALL / COVERED / TASKED / SIGNALED / IDLE + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "skill gap"/"capability gap"/"sktrgap"/"skill task"/"skill risk"/"idle skills"/"unused skills"/"skill coverage"
 * Event: jarvis:sktrgap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'TASKED', 'SIGNALED', 'IDLE'];

const CLS_COLOR = {
  COVERED:  '#22c55e',
  TASKED:   '#29E7FF',
  SIGNALED: '#A78BFA',
  IDLE:     '#F59E0B',
};

const PULSE_CSS = `@keyframes sktrgap-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(skillToks, tasks, risks) {
  const matchedTasks = tasks.filter(tk =>
    overlaps(skillToks, [tk.title, tk.name, tk.description, tk.tags, tk.type, tk.status, tk.summary, tk.category].join(' '))
  );
  const matchedRisks = risks.filter(rs =>
    overlaps(skillToks, [rs.title, rs.name, rs.description, rs.tags, rs.type, rs.severity, rs.category, rs.summary].join(' '))
  );
  if (matchedTasks.length > 0 && matchedRisks.length > 0)
    return { cls: 'COVERED', matchedTasks, matchedRisks };
  if (matchedTasks.length > 0)
    return { cls: 'TASKED', matchedTasks, matchedRisks: [] };
  if (matchedRisks.length > 0)
    return { cls: 'SIGNALED', matchedTasks: [], matchedRisks };
  return { cls: 'IDLE', matchedTasks: [], matchedRisks: [] };
}

export function isSktrgapQuery(q) {
  return /\b(skill.gap|capability.gap|sktrgap|skill.task|skill.risk|idle.skill|unused.skill|skill.coverage|skill.capab)\b/i.test(q);
}
export function buildSktrgapScript() {
  return 'Opening Skill × Task × RiskSignal Capability Gap Analysis. Cross-referencing all available skills against active tasks and risk signals to identify idle capabilities and coverage gaps.';
}

export default function SkillTaskRiskCapabilityGap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [taskCount, setTaskCount] = useState(0);
  const [riskCount, setRiskCount] = useState(0);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef               = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [skRes, tkRes, rsRes] = await Promise.all([
        fetch(`${API}/v1/aip/skill`,        { headers: h }),
        fetch(`${API}/entities/Task`,        { headers: h }),
        fetch(`${API}/entities/RiskSignal`,  { headers: h }),
      ]);
      const [skData, tkData, rsData] = await Promise.all([
        skRes.ok ? skRes.json() : [],
        tkRes.ok ? tkRes.json() : [],
        rsRes.ok ? rsRes.json() : [],
      ]);
      const skills  = Array.isArray(skData) ? skData : (skData?.items || skData?.data || skData?.results || skData?.skills || []);
      const tasks   = Array.isArray(tkData) ? tkData : (tkData?.items || tkData?.data || tkData?.results || tkData?.tasks || []);
      const risks   = Array.isArray(rsData) ? rsData : (rsData?.items || rsData?.data || rsData?.results || rsData?.signals || []);

      setTaskCount(tasks.length);
      setRiskCount(risks.length);

      const built = skills.map(sk => {
        const toks = tokens([sk.name, sk.title, sk.description, sk.tags, sk.type, sk.category, sk.summary, sk.id].join(' '));
        const { cls, matchedTasks, matchedRisks } = classify(toks, tasks, risks);
        return { ...sk, _cls: cls, _tasks: matchedTasks, _risks: matchedRisks };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:sktrgap-toggle', handler);
    return () => window.removeEventListener('jarvis:sktrgap-toggle', handler);
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
    const counts = { COVERED: 0, TASKED: 0, SIGNALED: 0, IDLE: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const prompt = `Skill capability gap analysis: ${rows.length} skills total — ${counts.COVERED} fully deployed (matched tasks + risk signals), ${counts.TASKED} task-assigned only (no risk coverage), ${counts.SIGNALED} risk-relevant only (no assigned task), ${counts.IDLE} completely idle (no task or risk signal match). Assess the capability coverage quality, identify the highest-value idle skills that should be deployed, and highlight any critical risks that lack a skilled response.`;
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
  }, [rows, assessing]);

  const counts = { COVERED: 0, TASKED: 0, SIGNALED: 0, IDLE: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.title, r.type, r.category, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 73000, zIndex: 141,
          background: 'rgba(245,158,11,0.12)', border: '1px solid #F59E0B',
          color: '#F59E0B', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ SKTRGAP
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1e3a4a',
        borderRadius: 6, zIndex: 9142, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #1e3a4a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(245,158,11,0.06)',
        }}>
          <span style={{ fontSize: 11, color: '#F59E0B', letterSpacing: 2 }}>
            ◈ SKILL × TASK × RISK — SKTRGAP
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'SKILLS',    val: rows.length,      color: '#29E7FF' },
            { label: 'TASKS',     val: taskCount,        color: '#29E7FF' },
            { label: 'RISKS',     val: riskCount,        color: '#29E7FF' },
            { label: 'COVERED',   val: counts.COVERED,   color: CLS_COLOR.COVERED },
            { label: 'TASKED',    val: counts.TASKED,    color: CLS_COLOR.TASKED },
            { label: 'SIGNALED',  val: counts.SIGNALED,  color: CLS_COLOR.SIGNALED },
            {
              label: 'IDLE', val: counts.IDLE, color: CLS_COLOR.IDLE,
              pulse: counts.IDLE > 0,
            },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'sktrgap-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #1e3a4a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#29E7FF'}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#2a4a5a'}`,
              color: tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#6A8BA0',
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, letterSpacing: 1,
            }}>{t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ''}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search skills…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #2a4a5a',
              color: '#e2eaf0', padding: '2px 8px', borderRadius: 3, fontSize: 9, width: 140,
            }}
          />
        </div>

        {/* Status */}
        {loading && <div style={{ padding: '4px 14px', fontSize: 9, color: '#6A8BA0' }}>⟳ loading…</div>}
        {error   && <div style={{ padding: '4px 14px', fontSize: 9, color: '#ef4444' }}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.map((sk, i) => {
            const isExp = expanded === (sk.id || i);
            return (
              <div key={sk.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (sk.id || i))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[sk._cls]}22`, color: CLS_COLOR[sk._cls],
                    border: `1px solid ${CLS_COLOR[sk._cls]}55`, letterSpacing: 1, minWidth: 72, textAlign: 'center',
                  }}>{sk._cls}</span>
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>
                    {sk.name || sk.title || sk.category || `Skill ${i + 1}`}
                  </span>
                  {sk.type && <span style={{ fontSize: 8, color: '#4a7a9a' }}>{sk.type}</span>}
                  {sk.category && sk.category !== sk.name && <span style={{ fontSize: 8, color: '#3a6a8a' }}>{sk.category}</span>}
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {sk._tasks.length}T {sk._risks.length}R
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {sk._tasks.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED TASKS</div>
                        {sk._tasks.slice(0, 5).map((tk, ti) => (
                          <div key={ti} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {tk.title || tk.name || `Task ${ti + 1}`}
                            {tk.status && <span style={{ color: '#4a7a9a', marginLeft: 4 }}>{tk.status}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {sk._risks.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED RISK SIGNALS</div>
                        {sk._risks.slice(0, 5).map((rs, ri) => (
                          <div key={ri} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {rs.title || rs.name || `Risk ${ri + 1}`}
                            {rs.severity && (
                              <span style={{
                                color: rs.severity === 'critical' || rs.severity === 'high' ? '#ef4444' : '#F59E0B',
                                marginLeft: 4, fontSize: 8,
                              }}>{rs.severity}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {sk._tasks.length === 0 && sk._risks.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No matched tasks or risk signals — idle skill with zero coverage deployment.</div>
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
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS CAPABILITY GAPS'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderLeft: '2px solid #F59E0B', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
