/**
 * ScenarioRiskContactThreatMatrix — F59
 *
 * Fetches /v1/scenario/list + /entities/RiskSignal + /entities/Contact
 * Cross-references each scenario against risk signals AND contacts:
 *   ACTIVE_THREAT — scenario matched both risk signals AND contacts (fully active)
 *   AT_RISK       — scenario matched risk signals only (threat without human linkage)
 *   SCENED        — scenario matched contacts only (human network exists, no active threat)
 *   SHADOW        — no match in either (scenario with no threat or contact grounding)
 *
 * Toggle: ◈ STHRMAT button (fixed, bottom strip) left:81400, zIndex:156
 * Stat tiles: scenarios / risks / contacts / active_threat / at_risk / scened / shadow
 * Red pulse on ACTIVE_THREAT count.
 * Expandable rows: matched risk signals with severity badge + matched contacts with role/org.
 * Filter tabs: ALL / ACTIVE_THREAT / AT_RISK / SCENED / SHADOW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sthrmat"/"threat matrix"/"scenario threat"/"scenario risk contact"/
 *        "active threats"/"threat scenario"/"scenario threat matrix"/
 *        "scenario strategic threat"/"contact threat"/"risk contact scenario"
 * Event: jarvis:sthrmat-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVE_THREAT', 'AT_RISK', 'SCENED', 'SHADOW'];

const CLS_COLOR = {
  ACTIVE_THREAT: '#FF4444',
  AT_RISK:       '#FFB800',
  SCENED:        '#A78BFA',
  SHADOW:        '#555',
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

function classify(scenToks, risks, contacts) {
  const matchedRisks = risks.filter(r =>
    overlaps(scenToks, [
      r.id, r.name, r.title, r.signal, r.type, r.category,
      r.description, r.tags, r.source, r.domain,
    ].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(scenToks, [
      c.name, c.full_name, c.display_name, c.email, c.role,
      c.org, c.organisation, c.company, c.domain, c.tags,
      c.description, c.notes,
    ].join(' '))
  );
  const hasRisk    = matchedRisks.length > 0;
  const hasContact = matchedContacts.length > 0;
  const cls = hasRisk && hasContact ? 'ACTIVE_THREAT'
            : hasRisk               ? 'AT_RISK'
            : hasContact            ? 'SCENED'
            : 'SHADOW';
  return {
    cls,
    matchedRisks:    matchedRisks.slice(0, 4),
    matchedContacts: matchedContacts.slice(0, 4),
  };
}

export function isSthrmatQuery(q) {
  return /\b(sthrmat|threat.matrix|scenario.threat|scenario.risk.contact|active.threats|threat.scenario|scenario.threat.matrix|scenario.strategic.threat|contact.threat|risk.contact.scenario)\b/i.test(q);
}
export function buildSthrmatScript() {
  return 'Opening Scenario × RiskSignal × Contact Strategic Threat Matrix. Cross-referencing scenarios against active risk signals and contacts to surface active threats vs shadow scenarios.';
}

export default function ScenarioRiskContactThreatMatrix() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [riskCount, setRiskCount]     = useState(0);
  const [contactCount, setContactCount] = useState(0);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState('');
  const intervalRef                   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [sRes, rRes, cRes] = await Promise.all([
        fetch(`${API}/v1/scenario/list`,      { headers: h }),
        fetch(`${API}/entities/RiskSignal`,   { headers: h }),
        fetch(`${API}/entities/Contact`,      { headers: h }),
      ]);
      const [sRaw, rRaw, cRaw] = await Promise.all([
        sRes.ok ? sRes.json() : {},
        rRes.ok ? rRes.json() : {},
        cRes.ok ? cRes.json() : {},
      ]);
      const scenarios = normalizeArray(sRaw, ['scenarios', 'items', 'data', 'results']);
      const risks     = normalizeArray(rRaw, ['signals', 'risks', 'items', 'data', 'results']);
      const contacts  = normalizeArray(cRaw, ['contacts', 'items', 'data', 'results']);
      setRiskCount(risks.length);
      setContactCount(contacts.length);
      const built = scenarios.map(s => {
        const label = s.name || s.title || s.id || 'Scenario';
        const toks  = tokens([
          s.name, s.title, s.description, s.summary,
          s.tags, s.category, s.domain, s.type, s.objective,
        ].join(' '));
        const { cls, matchedRisks, matchedContacts } = classify(toks, risks, contacts);
        return {
          _id:       s.id || s._id || label,
          _label:    label,
          _cls:      cls,
          _status:   s.status || s.state || '',
          _risks:    matchedRisks,
          _contacts: matchedContacts,
        };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:sthrmat-toggle', toggle);
    return () => window.removeEventListener('jarvis:sthrmat-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment('');
    const atCount = rows.filter(r => r._cls === 'ACTIVE_THREAT').length;
    const prompt = `Scenario × RiskSignal × Contact Strategic Threat Matrix: ${rows.length} scenarios cross-referenced against ${riskCount} risk signals and ${contactCount} contacts. ACTIVE_THREAT:${atCount} AT_RISK:${rows.filter(r=>r._cls==='AT_RISK').length} SCENED:${rows.filter(r=>r._cls==='SCENED').length} SHADOW:${rows.filter(r=>r._cls==='SHADOW').length}. Provide a 2-sentence strategic threat assessment identifying the highest-priority active threat scenarios and recommended immediate actions.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(answer);
      if (answer) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: answer }),
          });
        } catch {}
      }
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    ACTIVE_THREAT: rows.filter(r => r._cls === 'ACTIVE_THREAT').length,
    AT_RISK:       rows.filter(r => r._cls === 'AT_RISK').length,
    SCENED:        rows.filter(r => r._cls === 'SCENED').length,
    SHADOW:        rows.filter(r => r._cls === 'SHADOW').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search && !JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × RiskSignal × Contact Strategic Threat Matrix"
        style={{
          position: 'fixed', bottom: 8, left: 81400, zIndex: 156,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #FF444455',
          color: '#FF4444', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ STHRMAT</button>
    );
  }

  return (
    <>
      {/* backdrop */}
      <div onClick={() => setOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 155, background: 'rgba(0,0,0,0.45)',
      }} />

      {/* panel */}
      <div style={{
        position: 'fixed', bottom: 38, left: '50%', transform: 'translateX(-50%)',
        width: 'min(820px,96vw)', maxHeight: '72vh',
        background: 'rgba(5,8,13,0.97)', border: '1px solid #FF444433',
        borderRadius: 8, zIndex: 156, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', overflow: 'hidden',
        boxShadow: '0 0 60px rgba(255,68,68,0.08)',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          <span style={{ color: '#FF4444', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ SCENARIO × RISK × CONTACT — STRATEGIC THREAT MATRIX
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
            { label: 'SCENARIOS',     val: rows.length,            color: '#FF4444' },
            { label: 'RISKS',         val: riskCount,              color: '#FF4444' },
            { label: 'CONTACTS',      val: contactCount,           color: '#FF4444' },
            { label: 'ACTIVE_THREAT', val: counts.ACTIVE_THREAT,   color: '#FF4444', pulse: counts.ACTIVE_THREAT > 0 },
            { label: 'AT_RISK',       val: counts.AT_RISK,         color: '#FFB800' },
            { label: 'SCENED',        val: counts.SCENED,          color: '#A78BFA' },
            { label: 'SHADOW',        val: counts.SHADOW,          color: '#555' },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              background: 'rgba(255,68,68,0.04)', border: `1px solid ${color}22`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color,
                animation: pulse ? 'sthrmat-pulse 1.4s ease-in-out infinite' : 'none' }}>{val}</div>
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
            <div style={{ color: '#444', fontSize: 11, padding: 20, textAlign: 'center' }}>no scenarios match</div>
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
                    color: CLS_COLOR[row._cls], minWidth: 72, textAlign: 'center', letterSpacing: 1,
                  }}>{row._cls}</span>
                  <span style={{ color: '#ccc', fontSize: 11 }}>{row._label}</span>
                  {row._status && (
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
                      color: '#888',
                    }}>{row._status}</span>
                  )}
                  <span style={{ marginLeft: 'auto', color: '#333', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 10px 38px', background: 'rgba(255,255,255,0.01)' }}>
                    {row._risks.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED RISK SIGNALS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._risks.map((r, i) => {
                            const sev = r.severity || r.level || r.priority || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(255,68,68,0.08)', border: '1px solid #FF444433',
                                color: '#FF4444',
                              }}>
                                {r.name || r.title || r.signal || r.id || 'Signal'}
                                {sev && <span style={{ marginLeft: 4, color: '#FF444488' }}>{sev}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._contacts.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: '#555', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED CONTACTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row._contacts.map((c, i) => {
                            const role = c.role || c.title || '';
                            const org  = c.org || c.organisation || c.company || '';
                            return (
                              <span key={i} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: 'rgba(167,139,250,0.08)', border: '1px solid #A78BFA33',
                                color: '#A78BFA',
                              }}>
                                {c.name || c.full_name || c.display_name || c.email || 'Contact'}
                                {role && <span style={{ marginLeft: 4, color: '#A78BFA88' }}>{role}</span>}
                                {org  && <span style={{ marginLeft: 4, color: '#A78BFA66' }}>@ {org}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {row._risks.length === 0 && row._contacts.length === 0 && (
                      <div style={{ color: '#555', fontSize: 10 }}>
                        ◌ No risk signal or contact linkage — scenario is operationally shadowed.
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
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS THREAT MATRIX'}</button>
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
        @keyframes sthrmat-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
