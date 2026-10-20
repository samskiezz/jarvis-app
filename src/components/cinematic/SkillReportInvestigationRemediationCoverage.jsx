/**
 * SkillReportInvestigationRemediationCoverage — F67
 *
 * Fetches /v1/aip/skill + /v1/reports + /v1/investigations
 * Keyword-matches each skill against reports AND investigations to classify:
 *   REMEDIATED — skill matched both a Report AND an Investigation (documented + investigated)
 *   SCRIPTED   — skill matched a Report only (knowledge exists, not yet investigated)
 *   FILED      — skill matched an Investigation only (case open, no report produced)
 *   IDLE       — no match (skill sits with no report trail and no investigation — blind spot)
 *
 * Toggle: ◈ SRIRM button (fixed, bottom strip) left:85880, zIndex:164
 * Stat tiles: skills / reports / investigations / remediated / scripted / filed / idle
 * Amber pulse on IDLE count.
 * Expandable rows: matched reports with date badge + matched investigations with status badge.
 * Filter tabs: ALL / REMEDIATED / SCRIPTED / FILED / IDLE + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "srirm"/"skill remediation"/"skill report investigation"/"idle skills"/
 *        "remediation coverage"/"skill investigation"/"skill coverage"/"remediated skills"/
 *        "skill report coverage"/"skill filing"
 * Event: jarvis:srirm-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'REMEDIATED', 'SCRIPTED', 'FILED', 'IDLE'];

const CLS_COLOR = {
  REMEDIATED: '#00FF88',
  SCRIPTED:   '#38BDF8',
  FILED:      '#A78BFA',
  IDLE:       '#FBBF24',
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

function classify(skillToks, reports, investigations) {
  const matchedReports = reports.filter(r =>
    overlaps(skillToks, [
      r.id, r.name, r.title, r.type, r.category,
      r.description, r.tags, r.topic, r.subject, r.summary,
    ].join(' '))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(skillToks, [
      inv.id, inv.name, inv.title, inv.type, inv.category,
      inv.description, inv.tags, inv.topic, inv.subject, inv.summary,
    ].join(' '))
  );
  const hasReport = matchedReports.length > 0;
  const hasInv    = matchedInvestigations.length > 0;
  const cls = hasReport && hasInv ? 'REMEDIATED'
            : hasReport           ? 'SCRIPTED'
            : hasInv              ? 'FILED'
            : 'IDLE';
  return {
    cls,
    matchedReports:        matchedReports.slice(0, 4),
    matchedInvestigations: matchedInvestigations.slice(0, 4),
  };
}

export function isSrirmQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('srirm') ||
    s.includes('skill remediation') ||
    s.includes('skill report investigation') ||
    s.includes('idle skills') ||
    s.includes('remediation coverage') ||
    s.includes('skill investigation') ||
    s.includes('skill coverage') ||
    s.includes('remediated skills') ||
    s.includes('skill report coverage') ||
    s.includes('skill filing')
  );
}

export default function SkillReportInvestigationRemediationCoverage() {
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
      const [skRes, rpRes, invRes] = await Promise.all([
        fetch(`${API}/v1/aip/skill`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/reports`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [skRaw, rpRaw, invRaw] = await Promise.all([
        skRes.ok  ? skRes.json()  : {},
        rpRes.ok  ? rpRes.json()  : {},
        invRes.ok ? invRes.json() : {},
      ]);

      const skills         = normalizeArray(skRaw,  ['skills', 'items', 'data', 'results', 'entities']);
      const reports        = normalizeArray(rpRaw,  ['reports', 'items', 'data', 'results', 'entities']);
      const investigations = normalizeArray(invRaw, ['investigations', 'items', 'data', 'results', 'entities']);

      const classified = skills.map(sk => {
        const label = [
          sk.id, sk.name, sk.title, sk.type, sk.category,
          sk.description, sk.tags, sk.domain, sk.subject, sk.capability,
        ].join(' ');
        const toks = tokens(label);
        const { cls, matchedReports, matchedInvestigations } = classify(toks, reports, investigations);
        return { ...sk, cls, matchedReports, matchedInvestigations, _label: label };
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
    window.addEventListener('jarvis:srirm-toggle', handler);
    return () => window.removeEventListener('jarvis:srirm-toggle', handler);
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
    const idleCount       = rows.filter(r => r.cls === 'IDLE').length;
    const remediatedCount = rows.filter(r => r.cls === 'REMEDIATED').length;
    const prompt = `Jarvis, I have ${rows.length} skills. ${idleCount} are IDLE (no associated report and no investigation — blind spots in the remediation picture). ${remediatedCount} are REMEDIATED (both a report and an investigation are linked). Provide a 2-sentence operational advisory on addressing idle skills and ensuring all active remediation efforts are properly filed.`;
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
    remediated: rows.filter(r => r.cls === 'REMEDIATED').length,
    scripted:   rows.filter(r => r.cls === 'SCRIPTED').length,
    filed:      rows.filter(r => r.cls === 'FILED').length,
    idle:       rows.filter(r => r.cls === 'IDLE').length,
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
          position: 'fixed', bottom: 8, left: 85880, zIndex: 164,
          background: 'rgba(251,191,36,0.08)', border: '1px solid #FBBF2444',
          color: '#FBBF24', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="Skill × Report × Investigation Remediation Coverage"
      >◈ SRIRM</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 164,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FBBF2433',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(251,191,36,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FBBF2422',
          background: 'rgba(251,191,36,0.04)',
        }}>
          <span style={{ color: '#FBBF24', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ SRIRM — SKILL REMEDIATION COVERAGE
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FBBF2477', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FBBF2466', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',      counts.total,      '#888',    false],
            ['REMEDIATED', counts.remediated, '#00FF88', false],
            ['SCRIPTED',   counts.scripted,   '#38BDF8', false],
            ['FILED',      counts.filed,      '#A78BFA', false],
            ['IDLE',       counts.idle,       '#FBBF24', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${
                color === '#00FF88' ? '0,255,136'
                : color === '#38BDF8' ? '56,189,248'
                : color === '#A78BFA' ? '167,139,250'
                : color === '#FBBF24' ? '251,191,36'
                : '136,136,136'
              },0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'srirm-pulse 1.8s ease-in-out infinite' : 'none',
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
                background: tab === t ? 'rgba(251,191,36,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FBBF24' : '#FBBF2433'}`,
                color: tab === t ? '#FBBF24' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(251,191,36,0.04)',
              border: '1px solid #FBBF2433', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No skills loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((sk, idx) => {
            const id = sk.id || sk.name || sk.title || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[sk.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4,
                background: `rgba(${
                  color === '#00FF88' ? '0,255,136'
                  : color === '#38BDF8' ? '56,189,248'
                  : color === '#A78BFA' ? '167,139,250'
                  : '251,191,36'
                },0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 82 }}>{sk.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {sk.name || sk.title || sk.id || id}
                  </span>
                  {sk.score !== undefined && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{typeof sk.score === 'number' ? sk.score.toFixed(1) : sk.score}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {sk.category && (
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 6 }}>
                        category: <span style={{ color: '#aaa' }}>{sk.category}</span>
                      </div>
                    )}
                    {/* Matched Reports */}
                    {sk.matchedReports.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED REPORTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {sk.matchedReports.map((r, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {r.name || r.title || r.id}
                              {(r.date || r.created_at || r.updated_at) && (
                                <span style={{ color: '#38BDF877', marginLeft: 4 }}>
                                  {(r.date || r.created_at || r.updated_at || '').toString().slice(0, 10)}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Investigations */}
                    {sk.matchedInvestigations.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED INVESTIGATIONS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {sk.matchedInvestigations.map((inv, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {inv.name || inv.title || inv.id}
                              {inv.status && (
                                <span style={{ color: '#A78BFA77', marginLeft: 4 }}>{inv.status}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {sk.matchedReports.length === 0 && sk.matchedInvestigations.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FBBF2466' }}>No matching reports or investigations found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FBBF2411' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(251,191,36,0.05)' : 'rgba(251,191,36,0.10)',
              border: '1px solid #FBBF2455', color: '#FBBF24',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS REMEDIATION COVERAGE'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(251,191,36,0.03)',
              border: '1px solid #FBBF2422', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 85880, zIndex: 164,
          background: 'rgba(251,191,36,0.15)', border: '1px solid #FBBF24',
          color: '#FBBF24', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ SRIRM ✕</button>

      <style>{`
        @keyframes srirm-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
