/**
 * IntelProfileContactRiskAttribution — F38
 *
 * Fetches /entities/IntelProfile + /entities/Contact + /entities/RiskSignal
 * Keyword-matches each intel profile against contacts AND risk signals to classify:
 *   ATTRIBUTED — matched both a contact AND a risk signal (confirmed threat actor)
 *   FLAGGED    — matched a risk signal only (signaled, no contact link)
 *   PROFILED   — matched a contact only (known contact, no active signals)
 *   SHADOW     — no match in either (ghost intel profile, unverified)
 *
 * Toggle: ◈ IATRIB button (fixed, bottom strip) left:70200, zIndex:136
 * Stat tiles: profiles / contacts / risks / attributed / flagged / profiled / shadow
 * Red pulse on ATTRIBUTED count.
 * Expandable rows: matched contacts + matched risk signals with severity badge.
 * Filter tabs: ALL / ATTRIBUTED / FLAGGED / PROFILED / SHADOW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "threat attribution"/"intel contact"/"risk attribution"/"iatrib"/"threat actor"/"attributed intel"
 * Event: jarvis:iatrib-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ATTRIBUTED', 'FLAGGED', 'PROFILED', 'SHADOW'];

const CLS_COLOR = {
  ATTRIBUTED: '#FF4D6D',
  FLAGGED:    '#F59E0B',
  PROFILED:   '#29E7FF',
  SHADOW:     '#6A8BA0',
};

const SEV_COLOR = { critical: '#FF4D6D', high: '#F59E0B', medium: '#A78BFA', low: '#22c55e' };

const PULSE_CSS = `@keyframes iatrib-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classify(ipToks, contacts, risks) {
  const matchedContacts = contacts.filter(c =>
    overlaps(ipToks, [c.name, c.alias, c.description, c.tags, c.type, c.organization, c.role].join(' '))
  );
  const matchedRisks = risks.filter(r =>
    overlaps(ipToks, [r.title, r.name, r.description, r.tags, r.category, r.source].join(' '))
  );
  if (matchedContacts.length > 0 && matchedRisks.length > 0)
    return { cls: 'ATTRIBUTED', matchedContacts, matchedRisks };
  if (matchedRisks.length > 0)
    return { cls: 'FLAGGED', matchedContacts: [], matchedRisks };
  if (matchedContacts.length > 0)
    return { cls: 'PROFILED', matchedContacts, matchedRisks: [] };
  return { cls: 'SHADOW', matchedContacts: [], matchedRisks: [] };
}

export function isIatribQuery(q) {
  return /\b(threat.attribu|intel.contact|risk.attribu|iatrib|threat.actor|attributed.intel|threat.profile|intel.risk|contact.risk.intel)\b/i.test(q);
}
export function buildIatribScript() {
  return 'Opening IntelProfile-Contact-Risk Attribution. Cross-referencing all intel profiles against known contacts and active risk signals to identify confirmed threat actors and ghost profiles.';
}

export default function IntelProfileContactRiskAttribution() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [contactCount, setContactCount] = useState(0);
  const [riskCount, setRiskCount]       = useState(0);
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
      const [ipRes, ctRes, rsRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`, { headers }),
        fetch(`${API}/entities/Contact`, { headers }),
        fetch(`${API}/entities/RiskSignal`, { headers }),
      ]);
      const ipData = ipRes.ok ? await ipRes.json() : [];
      const ctData = ctRes.ok ? await ctRes.json() : [];
      const rsData = rsRes.ok ? await rsRes.json() : [];

      const profiles  = Array.isArray(ipData) ? ipData : (ipData.items || ipData.data || ipData.profiles  || []);
      const contacts  = Array.isArray(ctData) ? ctData : (ctData.items || ctData.data || ctData.contacts  || []);
      const risks     = Array.isArray(rsData) ? rsData : (rsData.items || rsData.data || rsData.signals   || []);

      setContactCount(contacts.length);
      setRiskCount(risks.length);

      const classified = profiles.map(ip => {
        const name   = ip.name || ip.title || ip.alias || ip.id || '';
        const ipToks = tokens([name, ip.description, ip.tags, ip.type, ip.category, ip.subject, ip.alias].join(' '));
        const { cls, matchedContacts, matchedRisks } = classify(ipToks, contacts, risks);
        return { ...ip, _name: name || ip.id || 'Unknown', _cls: cls, _contacts: matchedContacts, _risks: matchedRisks };
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
    window.addEventListener('jarvis:iatrib-toggle', handler);
    return () => window.removeEventListener('jarvis:iatrib-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const counts = { ATTRIBUTED: 0, FLAGGED: 0, PROFILED: 0, SHADOW: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r._name + (r.description || '') + (r.type || '')).toLowerCase().includes(q);
    }
    return true;
  });

  const speak = useCallback(text => {
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment('');
    const attrNames = rows.filter(r => r._cls === 'ATTRIBUTED').map(r => r._name).slice(0, 5).join(', ');
    const prompt = `IntelProfile-Contact-Risk Attribution analysis: ${rows.length} intel profiles total. ` +
      `ATTRIBUTED (contact+risk): ${counts.ATTRIBUTED}, FLAGGED (risk only): ${counts.FLAGGED}, ` +
      `PROFILED (contact only): ${counts.PROFILED}, SHADOW (no attribution): ${counts.SHADOW}. ` +
      `${counts.ATTRIBUTED > 0 ? `Confirmed threat actors: ${attrNames || 'multiple'}. ` : ''}` +
      `Known contacts: ${contactCount}. Active risk signals: ${riskCount}. ` +
      `In two sentences, identify the most critical threat attribution finding and recommend the immediate intelligence action.`;
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
  }, [rows, counts, contactCount, riskCount, speak]);

  if (!open) {
    return (
      <>
        <style>{PULSE_CSS}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 70200, zIndex: 136,
            background: 'rgba(0,0,0,0.75)', border: '1px solid #FF4D6D',
            color: '#FF4D6D', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ IATRIB
          {counts.ATTRIBUTED > 0 && (
            <span style={{ marginLeft: 4, color: '#FF4D6D', animation: 'iatrib-pulse 1.5s infinite' }}>
              {counts.ATTRIBUTED}▲
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
        background: 'rgba(8,12,18,0.97)', border: '1px solid #FF4D6D',
        borderRadius: 8, zIndex: 9136, fontFamily: 'monospace', fontSize: 11, color: '#c8d8e0',
        boxShadow: '0 0 30px rgba(255,77,109,0.2)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #1e3a4a' }}>
          <span style={{ color: '#FF4D6D', fontWeight: 700, letterSpacing: 2 }}>◈ INTELPROFILE × CONTACT × RISK — THREAT ATTRIBUTION</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #FF4D6D', color: '#FF4D6D', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #1e3a4a', flexWrap: 'wrap' }}>
          {[
            ['PROFILES',    rows.length,        '#c8d8e0'],
            ['CONTACTS',    contactCount,        '#c8d8e0'],
            ['RISK SIGS',   riskCount,           '#c8d8e0'],
            ['ATTRIBUTED',  counts.ATTRIBUTED,   CLS_COLOR.ATTRIBUTED],
            ['FLAGGED',     counts.FLAGGED,      CLS_COLOR.FLAGGED],
            ['PROFILED',    counts.PROFILED,     CLS_COLOR.PROFILED],
            ['SHADOW',      counts.SHADOW,       CLS_COLOR.SHADOW],
          ].map(([label, val, col]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center' }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: '#6A8BA0', fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', alignItems: 'center', borderBottom: '1px solid #1e3a4a' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CLS_COLOR[t] || '#FF4D6D' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${CLS_COLOR[t] || '#FF4D6D'}`,
              color: tab === t ? '#000' : (CLS_COLOR[t] || '#FF4D6D'),
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search intel profiles…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid #1e3a4a', color: '#c8d8e0', padding: '3px 8px', borderRadius: 3, fontSize: 10 }}
          />
        </div>

        {/* Rows */}
        <div style={{ padding: '4px 14px' }}>
          {loading && <div style={{ color: '#6A8BA0', padding: 12 }}>Loading…</div>}
          {error   && <div style={{ color: '#FF4D6D', padding: 8 }}>Error: {error}</div>}
          {!loading && visible.length === 0 && <div style={{ color: '#6A8BA0', padding: 12 }}>No intel profiles match filter.</div>}
          {visible.map((ip, i) => {
            const isExp = expanded === i;
            return (
              <div key={ip.id || i} style={{ borderBottom: '1px solid #1a2a36', padding: '6px 0' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : i)}
                >
                  <span style={{ color: CLS_COLOR[ip._cls], fontSize: 9, minWidth: 74, fontWeight: 700 }}>{ip._cls}</span>
                  <span style={{ flex: 1, color: '#e2eaf0' }}>{ip._name}</span>
                  {ip.type && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(41,231,255,0.1)', color: '#29E7FF' }}>{ip.type}</span>
                  )}
                  {ip.threat_level && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,77,109,0.15)', color: '#FF4D6D' }}>TL:{ip.threat_level}</span>
                  )}
                  <span style={{ color: '#4a6a7a', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ marginTop: 6, paddingLeft: 16, paddingBottom: 6 }}>
                    {ip._contacts.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: '#29E7FF', fontSize: 9, marginBottom: 3 }}>LINKED CONTACTS ({ip._contacts.length})</div>
                        {ip._contacts.slice(0, 4).map((c, ci) => (
                          <div key={ci} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ color: '#29E7FF', fontSize: 9 }}>◉</span>
                            <span style={{ color: '#c8d8e0', fontSize: 9 }}>{c.name || c.alias || `Contact ${ci + 1}`}</span>
                            {c.role && (
                              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: '#29E7FF22', color: '#29E7FF' }}>{c.role}</span>
                            )}
                            {c.organization && (
                              <span style={{ fontSize: 8, color: '#6A8BA0' }}>{c.organization}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {ip._risks.length > 0 && (
                      <div>
                        <div style={{ color: '#FF4D6D', fontSize: 9, marginBottom: 3 }}>MATCHED RISK SIGNALS ({ip._risks.length})</div>
                        {ip._risks.slice(0, 4).map((r, ri) => {
                          const sev = (r.severity || r.level || '').toLowerCase();
                          const sc  = SEV_COLOR[sev] || '#A78BFA';
                          return (
                            <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 2, alignItems: 'center' }}>
                              <span style={{ color: sc, fontSize: 9 }}>▲</span>
                              <span style={{ color: '#c8d8e0', fontSize: 9 }}>{r.title || r.name || `Signal ${ri + 1}`}</span>
                              {sev && (
                                <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: `${sc}22`, color: sc }}>{sev.toUpperCase()}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {ip._contacts.length === 0 && ip._risks.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No contacts or risk signals linked — shadow profile, unverified.</div>
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
              background: assessing ? 'rgba(255,77,109,0.1)' : 'rgba(255,77,109,0.15)',
              border: '1px solid #FF4D6D', color: '#FF4D6D',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS THREAT ATTRIBUTION'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,77,109,0.07)', borderLeft: '2px solid #FF4D6D', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>

      {/* Collapsed toggle */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 70200, zIndex: 9137,
          background: 'rgba(255,77,109,0.15)', border: '1px solid #FF4D6D',
          color: '#FF4D6D', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ IATRIB ✕
      </button>
    </>
  );
}
