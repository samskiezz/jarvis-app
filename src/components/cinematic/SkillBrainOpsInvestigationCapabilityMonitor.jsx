/**
 * SkillBrainOpsInvestigationCapabilityMonitor — F214
 *
 * Fetches /v1/aip/skill + /v1/cinematic/brain + /v1/ops/alerts +
 *         /v1/investigations
 *
 * Keyword-matches each skill (name/description/category/score) against
 * brain node labels/types, ops alert names/types/descriptions, and
 * investigation titles/descriptions/statuses to classify:
 *
 *   DEPLOYED  — skill matches brain + ops alert + investigation (all 3 sources)
 *               (fully active capability: modelled, alerting, and under investigation)
 *   ALERTED   — skill matches brain + ops alert (active but no investigation grounding)
 *               (deployed capability responding to live ops pressure)
 *   TRACKED   — skill matches at least 1 source but not DEPLOYED/ALERTED
 *               (some operational grounding)
 *   IDLE      — no match to any source
 *               (isolated capability — no brain model, no alert trigger, no case)
 *
 * Toggle: ◈ SKBIAM button (fixed, bottom strip) left:167640, zIndex:310
 * Stat tiles: skills / brain-nodes / alerts / investigations / deployed / alerted / tracked / idle
 * Red pulse on IDLE count (isolated capabilities).
 * Expandable rows: matched brain nodes with type badge +
 *                  matched ops alerts with severity badge +
 *                  matched investigations with status badge.
 * Filter tabs: ALL / DEPLOYED / ALERTED / TRACKED / IDLE + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "skbiam"/"skill capability"/"idle skills"/"skill alert"/"skill brain"
 *        "capability monitor"/"skill investigation"/"skill ops"/"isolated skills"
 *        "capability gap brain"/"skill idle"/"ops skill"
 * Event: jarvis:skbiam-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'DEPLOYED', 'ALERTED', 'TRACKED', 'IDLE'];

const CLS_COLOR = {
  DEPLOYED: '#22C55E',
  ALERTED:  '#F97316',
  TRACKED:  '#38BDF8',
  IDLE:     '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.skills))   return raw.skills;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeBrain(raw) {
  if (!raw) return [];
  if (Array.isArray(raw?.nodes))    return raw.nodes;
  if (Array.isArray(raw?.entities)) return raw.entities;
  if (Array.isArray(raw))           return raw;
  if (raw?.nodes && typeof raw.nodes === 'object') {
    return Object.entries(raw.nodes).map(([k, v]) => ({ label: k, ...(typeof v === 'object' ? v : { score: v }) }));
  }
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                   return raw;
  if (Array.isArray(raw?.items))            return raw.items;
  if (Array.isArray(raw?.investigations))   return raw.investigations;
  if (Array.isArray(raw?.results))          return raw.results;
  if (Array.isArray(raw?.data))             return raw.data;
  return [];
}

export function isSkbiamQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'skbiam', 'skill capability', 'idle skills', 'skill alert',
    'skill brain', 'capability monitor', 'skill investigation',
    'skill ops', 'isolated skills', 'capability gap brain',
    'skill idle', 'ops skill',
  ].some(k => s.includes(k));
}

export function buildSkbiamScript() {
  return (
    'Fetch /v1/aip/skill, /v1/cinematic/brain, /v1/ops/alerts, and /v1/investigations. ' +
    'Keyword-match each skill (name/description/category/score) against ' +
    'brain node labels/types, ops alert names/types/descriptions, and ' +
    'investigation titles/descriptions/statuses. ' +
    'Classify each skill as DEPLOYED (matches brain + ops alert + investigation), ' +
    'ALERTED (matches brain + ops alert), ' +
    'TRACKED (matches at least one source), ' +
    'or IDLE (no match to any source — isolated capability with zero operational grounding). ' +
    'Report total IDLE count, identify which idle skills represent the highest capability risk ' +
    '(by score or domain), and recommend which brain nodes should model them, ' +
    'which ops alert types should trigger them, and which investigations should be linked ' +
    'to activate these dormant capabilities.'
  );
}

export default function SkillBrainOpsInvestigationCapabilityMonitor() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    skills: 0, brainNodes: 0, alerts: 0, investigations: 0,
    deployed: 0, alerted: 0, tracked: 0, idle: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [skillsRaw, brainRaw, alertsRaw, invsRaw] = await Promise.all([
        fetch(`${API}/v1/aip/skill`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/cinematic/brain`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/investigations`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const skills         = normalizeSkills(skillsRaw);
      const brainNodes     = normalizeBrain(brainRaw);
      const alerts         = normalizeAlerts(alertsRaw);
      const investigations = normalizeInvestigations(invsRaw);

      const built = skills.map((skill, idx) => {
        const skillText = [
          skill.name, skill.title, skill.description, skill.category,
          skill.type, skill.domain, skill.tags?.join?.(' '),
          String(skill.score || skill.level || ''),
        ].filter(Boolean).join(' ');
        const sToks = tokens(skillText);

        const matchedBrain = brainNodes.filter(n => {
          const s = [n.label, n.name, n.type, n.category, n.description]
            .filter(Boolean).join(' ');
          return overlaps(sToks, s);
        });

        const matchedAlerts = alerts.filter(a => {
          const s = [
            a.name, a.title, a.type, a.alert_type, a.alertType,
            a.description, a.message, a.category, a.source,
          ].filter(Boolean).join(' ');
          return overlaps(sToks, s);
        });

        const matchedInvestigations = investigations.filter(inv => {
          const s = [
            inv.name, inv.title, inv.description, inv.status,
            inv.type, inv.category, inv.tags?.join?.(' '),
          ].filter(Boolean).join(' ');
          return overlaps(sToks, s);
        });

        const hasBrain = matchedBrain.length > 0;
        const hasAlert = matchedAlerts.length > 0;
        const hasInv   = matchedInvestigations.length > 0;

        let cls;
        if (hasBrain && hasAlert && hasInv) {
          cls = 'DEPLOYED';
        } else if (hasBrain && hasAlert) {
          cls = 'ALERTED';
        } else if (hasBrain || hasAlert || hasInv) {
          cls = 'TRACKED';
        } else {
          cls = 'IDLE';
        }

        const score = skill.score ?? skill.level ?? skill.rating ?? null;

        return {
          id:                   `skill-${idx}`,
          label:                skill.name || skill.title || `Skill ${idx + 1}`,
          category:             skill.category || skill.domain || skill.type || '',
          score,
          cls,
          matchedBrain,
          matchedAlerts,
          matchedInvestigations,
        };
      });

      const deployed = built.filter(r => r.cls === 'DEPLOYED').length;
      const alerted  = built.filter(r => r.cls === 'ALERTED').length;
      const tracked  = built.filter(r => r.cls === 'TRACKED').length;
      const idle     = built.filter(r => r.cls === 'IDLE').length;

      setRows(built);
      setCounts({
        skills:         built.length,
        brainNodes:     brainNodes.length,
        alerts:         alerts.length,
        investigations: investigations.length,
        deployed, alerted, tracked, idle,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:skbiam-toggle', handler);
    return () => window.removeEventListener('jarvis:skbiam-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildSkbiamScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.idle > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.category.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 167640, zIndex: 310,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ SKBIAM{counts.idle > 0 ? <span style={pulse}> {counts.idle}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 740, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.07)',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ SKBIAM — Skill Intelligence Capability Monitor
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          {[
            { label: 'SKILLS',         val: counts.skills,         c: '#94A3B8' },
            { label: 'BRAIN NODES',    val: counts.brainNodes,     c: '#94A3B8' },
            { label: 'ALERTS',         val: counts.alerts,         c: '#94A3B8' },
            { label: 'INVESTIGATIONS', val: counts.investigations,  c: '#94A3B8' },
            { label: 'DEPLOYED',       val: counts.deployed,       c: CLS_COLOR.DEPLOYED },
            { label: 'ALERTED',        val: counts.alerted,        c: CLS_COLOR.ALERTED  },
            { label: 'TRACKED',        val: counts.tracked,        c: CLS_COLOR.TRACKED  },
            { label: 'IDLE',           val: counts.idle,           c: CLS_COLOR.IDLE     },
          ].map(({ label, val, c }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${c}44`,
              borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ color: c, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CLS_COLOR[t] || '#334155' : 'rgba(255,255,255,0.05)',
              border: 'none', color: tab === t ? '#000' : '#94A3B8',
              borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
              color: '#E2E8F0', fontSize: 11, padding: '3px 8px', outline: 'none',
            }}
          />
        </div>

        {/* Body */}
        <div style={{ padding: '8px 14px' }}>
          {loading && <div style={{ color: '#64748B', fontSize: 12, padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#EF4444', fontSize: 12, padding: 12 }}>Error: {error}</div>}

          {!loading && !error && visible.map(row => (
            <div key={row.id} style={{
              borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4,
            }}>
              <div
                onClick={() => toggleExpand(row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px',
                  cursor: 'pointer', borderRadius: 4,
                  background: expanded[row.id] ? 'rgba(255,255,255,0.04)' : 'transparent',
                }}
              >
                <span style={{ color: CLS_COLOR[row.cls], fontSize: 10, minWidth: 68, fontWeight: 700 }}>{row.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 12, flex: 1 }}>{row.label}</span>
                {row.category && (
                  <span style={{
                    background: 'rgba(56,189,248,0.15)', color: '#38BDF8',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10,
                  }}>{row.category}</span>
                )}
                {row.score !== null && row.score !== undefined && (
                  <span style={{
                    background: 'rgba(100,116,139,0.2)', color: '#94A3B8',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10,
                  }}>{Number(row.score).toFixed ? Number(row.score).toFixed(1) : row.score}</span>
                )}
                <span style={{ color: '#475569', fontSize: 11 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({row.matchedBrain.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedBrain.slice(0, 8).map((n, i) => (
                          <span key={i} style={{
                            background: 'rgba(56,189,248,0.1)', color: '#38BDF8',
                            borderRadius: 3, padding: '1px 7px', fontSize: 10,
                          }}>
                            {n.label || n.name || `node-${i}`}
                            {(n.score !== undefined || n.centrality !== undefined) && (
                              <span style={{ color: '#64748B', marginLeft: 4 }}>
                                {Number(n.score ?? n.centrality ?? 0).toFixed(2)}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ops alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({row.matchedAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedAlerts.slice(0, 6).map((a, i) => {
                          const sev = (a.severity || a.level || 'medium').toLowerCase();
                          return (
                            <span key={i} style={{
                              background: `${SEV_COLOR[sev] || '#F59E0B'}22`,
                              color: SEV_COLOR[sev] || '#F59E0B',
                              borderRadius: 3, padding: '1px 7px', fontSize: 10,
                            }}>
                              {a.name || a.title || a.message || `alert-${i}`}
                              <span style={{ color: '#64748B', marginLeft: 4, fontSize: 9 }}>{sev}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Investigations */}
                  {row.matchedInvestigations.length > 0 && (
                    <div>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>INVESTIGATIONS ({row.matchedInvestigations.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedInvestigations.slice(0, 6).map((inv, i) => {
                          const st = (inv.status || inv.state || 'open').toLowerCase();
                          return (
                            <span key={i} style={{
                              background: 'rgba(167,139,250,0.1)', color: '#A78BFA',
                              borderRadius: 3, padding: '1px 7px', fontSize: 10,
                            }}>
                              {inv.name || inv.title || `inv-${i}`}
                              <span style={{ color: '#64748B', marginLeft: 4, fontSize: 9 }}>{st}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {row.matchedBrain.length === 0 && row.matchedAlerts.length === 0 && row.matchedInvestigations.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 11 }}>No matches — capability is fully isolated.</div>
                  )}
                </div>
              )}
            </div>
          ))}

          {!loading && !error && visible.length === 0 && (
            <div style={{ color: '#475569', fontSize: 12, padding: 16, textAlign: 'center' }}>
              No skills match this filter.
            </div>
          )}
        </div>

        {/* ASSESS footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
              border: '1px solid #EF4444', color: '#EF4444',
              padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
              borderRadius: 4, fontFamily: 'monospace',
            }}
          >
            {assessing ? 'Assessing…' : '▶ ASSESS IDLE CAPABILITIES'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
              background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
