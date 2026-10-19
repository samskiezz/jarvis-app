/**
 * LiveIntelContactInvestmentNexus — F45
 *
 * Fetches /functions/getLiveIntel + /entities/Contact + /entities/Investment
 * Keyword-matches each live event against contacts AND investments to classify:
 *   IMPACTED  — matched both a contact AND an investment (personnel + portfolio exposure)
 *   MONITORED — matched a contact only (personnel coverage, no tracked asset exposure)
 *   RELEVANT  — matched an investment only (portfolio exposed, no personnel tracking)
 *   NEUTRAL   — no match in either (background noise)
 *
 * Toggle: ◈ LICIMP button (fixed, bottom strip) left:74120, zIndex:143
 * Stat tiles: events / contacts / investments / impacted / monitored / relevant / neutral
 * Red pulse on IMPACTED count.
 * Expandable rows: matched contacts with role+org badge + matched investments with type/value badge.
 * Filter tabs: ALL / IMPACTED / MONITORED / RELEVANT / NEUTRAL + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "live impact"/"impact nexus"/"contact impact"/"investment impact"/"licimp"/"live intel nexus"
 * Event: jarvis:licimp-toggle
 * Auto-refresh: 60 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'IMPACTED', 'MONITORED', 'RELEVANT', 'NEUTRAL'];

const CLS_COLOR = {
  IMPACTED:  '#FF4444',
  MONITORED: '#29E7FF',
  RELEVANT:  '#A78BFA',
  NEUTRAL:   '#4a7a9a',
};

const PULSE_CSS = `@keyframes licimp-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function buildEvents(intel) {
  const quakes = Array.isArray(intel?.earthquakes) ? intel.earthquakes : [];
  const markets = Array.isArray(intel?.markets) ? intel.markets : [];
  return [
    ...quakes.map((e, i) => ({
      id: e.id || `q${i}`,
      label: e.location || e.place || `Seismic event ${i + 1}`,
      type: 'SEISMIC',
      severity: (e.magnitude || e.mag || 0) >= 6 ? 'CRITICAL' : (e.magnitude || e.mag || 0) >= 4 ? 'HIGH' : 'MEDIUM',
      detail: `M${(e.magnitude || e.mag || 0).toFixed(1)}`,
    })),
    ...markets.map((m, i) => ({
      id: m.symbol || m.id || `m${i}`,
      label: m.symbol || m.name || `Market ${i + 1}`,
      type: 'MARKET',
      severity: Math.abs(m.change ?? m.change_pct ?? 0) >= 5 ? 'HIGH' : 'MEDIUM',
      detail: m.change != null ? `${m.change > 0 ? '+' : ''}${(+m.change).toFixed(2)}%` : '',
    })),
  ];
}

function classify(evToks, contacts, investments) {
  const matchedContacts = contacts.filter(c =>
    overlaps(evToks, [c.name, c.role, c.organization, c.org, c.bio, c.location, c.region, c.tags, c.sector].join(' '))
  );
  const matchedInvestments = investments.filter(inv =>
    overlaps(evToks, [inv.name, inv.title, inv.symbol, inv.sector, inv.type, inv.category, inv.description, inv.region, inv.tags].join(' '))
  );
  const hasCon = matchedContacts.length > 0;
  const hasInv = matchedInvestments.length > 0;
  const cls = hasCon && hasInv ? 'IMPACTED' : hasCon ? 'MONITORED' : hasInv ? 'RELEVANT' : 'NEUTRAL';
  return { cls, matchedContacts, matchedInvestments };
}

export function isLicimpQuery(q) {
  return /\b(live.impact|impact.nexus|contact.impact|investment.impact|licimp|live.intel.nexus|intel.nexus|impact.assess|live.nexus)\b/i.test(q);
}
export function buildLicimpScript() {
  return 'Opening Live Intel × Contact × Investment Impact Nexus. Cross-referencing all live events against contacts and portfolio investments to identify exposure and impact.';
}

export default function LiveIntelContactInvestmentNexus() {
  const [open, setOpen]                   = useState(false);
  const [rows, setRows]                   = useState([]);
  const [contactCount, setContactCount]   = useState(0);
  const [investCount, setInvestCount]     = useState(0);
  const [tab, setTab]                     = useState('ALL');
  const [search, setSearch]               = useState('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [expanded, setExpanded]           = useState(null);
  const [assessing, setAssessing]         = useState(false);
  const [assessment, setAssessment]       = useState('');
  const intervalRef                       = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [intelRes, conRes, invRes] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers: h }),
        fetch(`${API}/entities/Contact`,       { headers: h }),
        fetch(`${API}/entities/Investment`,    { headers: h }),
      ]);
      const [intelRaw, conRaw, invRaw] = await Promise.all([
        intelRes.ok ? intelRes.json() : {},
        conRes.ok  ? conRes.json()  : [],
        invRes.ok  ? invRes.json()  : [],
      ]);

      const intelData  = intelRaw?.data ?? intelRaw;
      const contacts   = Array.isArray(conRaw)  ? conRaw  : (conRaw?.items  || conRaw?.data  || conRaw?.results  || conRaw?.contacts   || []);
      const investments = Array.isArray(invRaw) ? invRaw  : (invRaw?.items  || invRaw?.data  || invRaw?.results  || invRaw?.investments || []);

      setContactCount(contacts.length);
      setInvestCount(investments.length);

      const events = buildEvents(intelData);
      const built = events.map(ev => {
        const toks = tokens(ev.label + ' ' + ev.type + ' ' + ev.detail);
        const { cls, matchedContacts, matchedInvestments } = classify(toks, contacts, investments);
        return { ...ev, _cls: cls, _contacts: matchedContacts, _investments: matchedInvestments };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:licimp-toggle', handler);
    return () => window.removeEventListener('jarvis:licimp-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 60000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { IMPACTED: 0, MONITORED: 0, RELEVANT: 0, NEUTRAL: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const prompt = `Live Intel × Contact × Investment impact nexus assessment: ${rows.length} live events assessed across ${contactCount} contacts and ${investCount} investments. ${counts.IMPACTED} events are fully IMPACTED — matching both known contacts and portfolio investments. ${counts.MONITORED} events have personnel coverage only (no tracked investment exposure). ${counts.RELEVANT} events affect portfolio holdings but have no personnel match. ${counts.NEUTRAL} events are unconnected background noise. Assess the highest-priority impact events, identify any critical asset or personnel exposure, and recommend immediate response priorities.`;
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
  }, [rows, assessing, contactCount, investCount]);

  const counts = { IMPACTED: 0, MONITORED: 0, RELEVANT: 0, NEUTRAL: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.label, r.type, r.id, r.detail].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 74120, zIndex: 143,
          background: 'rgba(255,68,68,0.12)', border: '1px solid #FF4444',
          color: '#FF4444', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ LICIMP
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #3a1a1a',
        borderRadius: 6, zIndex: 9144, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #3a1a1a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,68,68,0.06)',
        }}>
          <span style={{ fontSize: 11, color: '#FF4444', letterSpacing: 2 }}>
            ◈ LIVE INTEL × CONTACT × INVESTMENT — LICIMP
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'EVENTS',    val: rows.length,        color: '#29E7FF' },
            { label: 'CONTACTS',  val: contactCount,       color: '#29E7FF' },
            { label: 'INVEST',    val: investCount,        color: '#29E7FF' },
            { label: 'IMPACTED',  val: counts.IMPACTED,    color: CLS_COLOR.IMPACTED,  pulse: counts.IMPACTED > 0 },
            { label: 'MONITORED', val: counts.MONITORED,   color: CLS_COLOR.MONITORED },
            { label: 'RELEVANT',  val: counts.RELEVANT,    color: CLS_COLOR.RELEVANT },
            { label: 'NEUTRAL',   val: counts.NEUTRAL,     color: CLS_COLOR.NEUTRAL },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'licimp-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #3a1a1a', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
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
            placeholder="search events…"
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
          {visible.map((ev, i) => {
            const isExp = expanded === (ev.id || i);
            const sColor = ev.severity === 'CRITICAL' ? '#FF4444' : ev.severity === 'HIGH' ? '#FFB800' : '#4a7a9a';
            return (
              <div key={ev.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (ev.id || i))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[ev._cls]}22`, color: CLS_COLOR[ev._cls],
                    border: `1px solid ${CLS_COLOR[ev._cls]}55`, letterSpacing: 1, minWidth: 76, textAlign: 'center',
                  }}>{ev._cls}</span>
                  <span style={{
                    fontSize: 8, padding: '1px 5px', borderRadius: 3,
                    background: ev.type === 'SEISMIC' ? 'rgba(255,68,68,0.1)' : 'rgba(41,231,255,0.1)',
                    color: ev.type === 'SEISMIC' ? '#FF8844' : '#29E7FF',
                    border: `1px solid ${ev.type === 'SEISMIC' ? '#FF884433' : '#29E7FF33'}`,
                  }}>{ev.type}</span>
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>{ev.label}</span>
                  {ev.detail && (
                    <span style={{ fontSize: 9, color: sColor, fontWeight: 700 }}>{ev.detail}</span>
                  )}
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {ev._contacts.length}C {ev._investments.length}I
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {ev._contacts.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED CONTACTS</div>
                        {ev._contacts.slice(0, 5).map((c, ci) => (
                          <div key={ci} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {c.name || `Contact ${ci + 1}`}
                            {(c.role || c.organization || c.org) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[c.role, c.organization || c.org].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {ev._investments.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED INVESTMENTS</div>
                        {ev._investments.slice(0, 5).map((inv, ii) => (
                          <div key={ii} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {inv.name || inv.title || inv.symbol || `Investment ${ii + 1}`}
                            {(inv.type || inv.sector || inv.value != null) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[inv.type || inv.sector, inv.value != null ? `$${(+inv.value).toLocaleString()}` : null].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {ev._contacts.length === 0 && ev._investments.length === 0 && (
                      <div style={{ color: '#6A8BA0', fontSize: 9 }}>⬡ No matched contacts or investments — event is background noise.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '12px 14px', color: '#6A8BA0', fontSize: 10 }}>No events match current filter.</div>
          )}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #3a1a1a' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,68,68,0.1)' : 'rgba(255,68,68,0.15)',
              border: '1px solid #FF4444', color: '#FF4444',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS IMPACT'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,68,68,0.07)', borderLeft: '2px solid #FF4444', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
