/**
 * OpsAlertSkillDatasetIncidentReadiness — F60
 *
 * Fetches /v1/ops/alerts + /v1/aip/skill + /v1/datasets
 * Cross-references each ops alert against skills (response capability) AND datasets
 * (supporting data sources) to classify:
 *   CAPABLE  — alert matched both skill AND dataset (fully supported response)
 *   SKILLED  — alert matched skill only (capability without data)
 *   DATAED   — alert matched dataset only (data exists, no skill to act)
 *   BLIND    — no match in either (alert with no response coverage)
 *
 * Toggle: ◈ IRCAP button (fixed, bottom strip) left:81960, zIndex:157
 * Stat tiles: alerts / skills / datasets / capable / skilled / dataed / blind
 * Red pulse on BLIND count.
 * Expandable rows: matched skills with score badge + matched datasets with row-count badge.
 * Filter tabs: ALL / CAPABLE / SKILLED / DATAED / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ircap"/"incident readiness"/"ops skill"/"alert response"/"response capability"/
 *        "ops dataset"/"blind alerts"/"incident capability"/"ops readiness"
 * Event: jarvis:ircap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CAPABLE', 'SKILLED', 'DATAED', 'BLIND'];

const CLS_COLOR = {
  CAPABLE: '#00FF88',
  SKILLED: '#A78BFA',
  DATAED:  '#FFB800',
  BLIND:   '#FF4444',
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

function classify(alertToks, skills, datasets) {
  const matchedSkills = skills.filter(s =>
    overlaps(alertToks, [
      s.id, s.name, s.title, s.skill, s.type, s.category,
      s.description, s.tags, s.domain, s.capability,
    ].join(' '))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(alertToks, [
      d.id, d.name, d.title, d.dataset, d.type, d.category,
      d.description, d.tags, d.domain, d.source,
    ].join(' '))
  );
  const hasSkill   = matchedSkills.length > 0;
  const hasDataset = matchedDatasets.length > 0;
  const cls = hasSkill && hasDataset ? 'CAPABLE'
            : hasSkill               ? 'SKILLED'
            : hasDataset             ? 'DATAED'
            : 'BLIND';
  return {
    cls,
    matchedSkills:   matchedSkills.slice(0, 4),
    matchedDatasets: matchedDatasets.slice(0, 4),
  };
}

export function isIrcapQuery(q) {
  return /\b(ircap|incident.readiness|ops.skill|alert.response|response.capability|ops.dataset|blind.alerts|incident.capability|ops.readiness|alert.skill|ops.incident)\b/i.test(q);
}
export function buildIrcapScript() {
  return 'Opening Ops Alert × Skill × Dataset Incident Response Capability. Cross-referencing live ops alerts against skills and datasets to surface blind spots in incident response coverage.';
}

export default function OpsAlertSkillDatasetIncidentReadiness() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [skillCount, setSkillCount]   = useState(0);
  const [datasetCount, setDatasetCount] = useState(0);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState('');
  const intervalRef                   = useRef(null);

  const hdr = { Authorization: `Bearer ${API_KEY}` };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const base = API;
      const [aR, sR, dR] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,  { headers: hdr }),
        fetch(`${base}/v1/datasets`,   { headers: hdr }),
      ]);
      const [aJ, sJ, dJ] = await Promise.all([aR.json(), sR.json(), dR.json()]);
      const rawAlerts   = normalizeArray(aJ, ['alerts','data','items','results','events','ops_alerts']);
      const rawSkills   = normalizeArray(sJ, ['skills','data','items','results','capabilities']);
      const rawDatasets = normalizeArray(dJ, ['datasets','data','items','results']);
      setSkillCount(rawSkills.length);
      setDatasetCount(rawDatasets.length);
      const built = rawAlerts.map(alert => {
        const label = alert.title || alert.name || alert.message || alert.alert || alert.event || alert.id || 'Alert';
        const alertToks = tokens([
          alert.id, alert.title, alert.name, alert.message, alert.alert,
          alert.type, alert.category, alert.severity, alert.source,
          alert.description, alert.tags, alert.service, alert.component,
        ].join(' '));
        const { cls, matchedSkills, matchedDatasets } = classify(alertToks, rawSkills, rawDatasets);
        return {
          _id:       alert.id || label,
          _label:    label,
          _severity: alert.severity || alert.level || alert.priority || '',
          _cls:      cls,
          _skills:   matchedSkills,
          _datasets: matchedDatasets,
        };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'load failed');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:ircap-toggle', toggle);
    return () => window.removeEventListener('jarvis:ircap-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(load, 90_000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const counts = rows.reduce((acc, r) => { acc[r._cls] = (acc[r._cls] || 0) + 1; return acc; }, {});
    const prompt = `Ops Alert × Skill × Dataset Incident Response Capability summary: ${rows.length} alerts, ${skillCount} skills, ${datasetCount} datasets. CAPABLE:${counts.CAPABLE||0} SKILLED:${counts.SKILLED||0} DATAED:${counts.DATAED||0} BLIND:${counts.BLIND||0}. Identify the most critical response gap and recommend an immediate action to reduce blind-spot alerts.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim() || 'No assessment available.';
      setAssessment(txt);
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt.slice(0, 300), voice: 'onyx' }),
      });
    } catch {
      setAssessment('Assessment unavailable — agent unreachable.');
    } finally {
      setAssessing(false);
    }
  }, [rows, skillCount, datasetCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = rows.reduce((acc, r) => { acc[r._cls] = (acc[r._cls] || 0) + 1; return acc; }, {
    CAPABLE: 0, SKILLED: 0, DATAED: 0, BLIND: 0,
  });

  const visible = rows.filter(r =>
    (tab === 'ALL' || r._cls === tab) &&
    (!search || r._label.toLowerCase().includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Ops Alert × Skill × Dataset Incident Response Capability"
        style={{
          position: 'fixed', bottom: 8, left: 81960, zIndex: 157,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #FF444455',
          color: '#FF4444', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ IRCAP</button>
    );
  }

  return (
    <>
      {/* backdrop */}
      <div onClick={() => setOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 156, background: 'rgba(0,0,0,0.45)',
      }} />

      {/* panel */}
      <div style={{
        position: 'fixed', bottom: 38, left: '50%', transform: 'translateX(-50%)',
        width: 'min(820px,96vw)', maxHeight: '72vh',
        background: 'rgba(5,8,13,0.97)', border: '1px solid #FF444433',
        borderRadius: 8, zIndex: 157, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', overflow: 'hidden',
        boxShadow: '0 0 60px rgba(255,68,68,0.08)',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          <span style={{ color: '#FF4444', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ OPS ALERT × SKILL × DATASET — INCIDENT RESPONSE CAPABILITY
          </span>
          {loading && <span style={{ color: '#666', fontSize: 9 }}>loading…</span>}
          {error   && <span style={{ color: '#FF4444', fontSize: 9 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{
            marginLeft: 'auto', background: 'none', border: 'none', color: '#666',
            fontSize: 14, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'ALERTS',   val: rows.length,       color: '#FF4444' },
            { label: 'SKILLS',   val: skillCount,         color: '#A78BFA' },
            { label: 'DATASETS', val: datasetCount,       color: '#FFB800' },
            { label: 'CAPABLE',  val: counts.CAPABLE,     color: '#00FF88' },
            { label: 'SKILLED',  val: counts.SKILLED,     color: '#A78BFA' },
            { label: 'DATAED',   val: counts.DATAED,      color: '#FFB800' },
            { label: 'BLIND',    val: counts.BLIND,       color: '#FF4444', pulse: counts.BLIND > 0 },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              background: 'rgba(255,68,68,0.04)', border: `1px solid ${color}22`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color,
                animation: pulse ? 'ircap-pulse 1.4s ease-in-out infinite' : 'none' }}>{val}</div>
              <div style={{ fontSize: 8, color: '#555', letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderBottom: '1px solid #1a1a1a' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'rgba(255,68,68,0.12)' : 'none',
              border: tab === t ? '1px solid #FF444455' : '1px solid transparent',
              color: tab === t ? '#FF4444' : '#555', fontSize: 9, padding: '2px 8px',
              borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="filter…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
              color: '#aaa', fontSize: 10, padding: '2px 8px', borderRadius: 3,
              outline: 'none', width: 140,
            }}
          />
        </div>

        {/* rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#444', fontSize: 11, padding: 20, textAlign: 'center' }}>no alerts match</div>
          )}
          {visible.map(row => {
            const isExp = expanded === row._id;
            return (
              <div key={row._id} style={{ borderBottom: '1px solid #111' }}>
                <div
                  onClick={() => setExpanded(isExp ? null : row._id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 10,
                    background: `${CLS_COLOR[row._cls]}11`, border: `1px solid ${CLS_COLOR[row._cls]}44`,
                    color: CLS_COLOR[row._cls], minWidth: 60, textAlign: 'center', letterSpacing: 1,
                  }}>{row._cls}</span>
                  <span style={{ color: '#ccc', fontSize: 11 }}>{row._label}</span>
                  {row._severity && (
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 8,
                      background: 'rgba(255,68,68,0.08)', border: '1px solid #FF444433',
                      color: '#FF4444',
                    }}>{row._severity}</span>
                  )}
                  <span style={{ marginLeft: 'auto', color: '#333', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 10px 38px', background: 'rgba(255,255,255,0.01)' }}>
                    {row._skills.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED SKILLS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._skills.map((s, i) => {
                            const score = s.score !== undefined ? s.score : s.level || s.rating || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(167,139,250,0.08)', border: '1px solid #A78BFA33',
                                color: '#A78BFA',
                              }}>
                                {s.name || s.title || s.skill || s.id || 'Skill'}
                                {score !== '' && <span style={{ marginLeft: 4, color: '#A78BFA88' }}>{score}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._datasets.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED DATASETS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._datasets.map((d, i) => {
                            const rows_c = d.row_count !== undefined ? d.row_count : d.rows || d.count || d.size || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(255,184,0,0.08)', border: '1px solid #FFB80033',
                                color: '#FFB800',
                              }}>
                                {d.name || d.title || d.dataset || d.id || 'Dataset'}
                                {rows_c !== '' && <span style={{ marginLeft: 4, color: '#FFB80088' }}>{rows_c} rows</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._skills.length === 0 && row._datasets.length === 0 && (
                      <div style={{ color: '#555', fontSize: 10 }}>
                        ◌ No skill or dataset coverage — alert response is operationally blind.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,68,68,0.05)' : 'rgba(255,68,68,0.10)',
              border: '1px solid #FF444455', color: '#FF4444',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS INCIDENT READINESS'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,68,68,0.03)',
              border: '1px solid #FF444422', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ircap-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
