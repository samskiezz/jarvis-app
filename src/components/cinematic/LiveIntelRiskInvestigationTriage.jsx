/**
 * LiveIntelRiskInvestigationTriage — F55
 *
 * Fetches /functions/getLiveIntel + /entities/RiskSignal + /v1/investigations
 * Cross-references each live intel event (quakes, crypto moves, FX shifts)
 * against risk signals AND open investigations:
 *   TRIAGED    — matched both a risk signal AND an investigation (fully tracked crisis)
 *   SIGNALED   — matched a risk signal only (flagged but not yet investigated)
 *   TRACKED    — matched an investigation only (being investigated but no signal filed)
 *   UNTRACKED  — no match in either (raw live event with no risk coverage or investigation)
 *
 * Toggle: ◈ LRTRI button (fixed, bottom strip) left:79160, zIndex:152
 * Stat tiles: events / signals / investigations / triaged / signaled / tracked / untracked
 * Red pulse on UNTRACKED count (unmonitored live events).
 * Expandable rows: matched risk signals with severity badge + matched investigations with status badge.
 * Filter tabs: ALL / TRIAGED / SIGNALED / TRACKED / UNTRACKED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "crisis triage"/"live intel risk"/"lrtri"/"untracked events"/"intel triage"/
 *        "live risk investigation"/"event coverage"/"intel coverage"/"risk triage"
 * Event: jarvis:lrtri-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'TRIAGED', 'SIGNALED', 'TRACKED', 'UNTRACKED'];

const CLS_COLOR = {
  TRIAGED:   '#00E5A0',
  SIGNALED:  '#FFB800',
  TRACKED:   '#29E7FF',
  UNTRACKED: '#FF4444',
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

function extractEvents(raw) {
  if (!raw) return [];
  const out = [];
  // quakes
  const quakes = raw.quakes || raw.earthquakes || raw.seismic || raw.geophysical || [];
  (Array.isArray(quakes) ? quakes : []).forEach(q => {
    const mag = q.magnitude || q.mag || '';
    const loc = q.place || q.location || q.region || q.area || '';
    out.push({
      id: q.id || `quake-${out.length}`,
      name: `Earthquake ${mag ? `M${mag}` : ''} — ${loc}`.trim(),
      type: 'quake',
      detail: q,
    });
  });
  // crypto
  const crypto = raw.crypto || raw.cryptocurrency || raw.digital_assets || [];
  (Array.isArray(crypto) ? crypto : []).forEach(c => {
    const sym = c.symbol || c.ticker || c.name || '';
    const pct = c.change_pct != null ? `${c.change_pct > 0 ? '+' : ''}${Number(c.change_pct).toFixed(2)}%` : '';
    out.push({
      id: c.id || `crypto-${out.length}`,
      name: `${sym} ${pct}`.trim(),
      type: 'crypto',
      detail: c,
    });
  });
  // fx
  const fx = raw.fx || raw.forex || raw.currencies || raw.rates || [];
  (Array.isArray(fx) ? fx : []).forEach(f => {
    const pair = f.pair || f.symbol || f.ticker || f.name || '';
    const rate = f.rate || f.price || f.value || '';
    out.push({
      id: f.id || `fx-${out.length}`,
      name: `FX ${pair}${rate ? ` @ ${rate}` : ''}`.trim(),
      type: 'fx',
      detail: f,
    });
  });
  // fallback: any top-level array
  if (out.length === 0) {
    const keys = ['events', 'items', 'data', 'results', 'alerts', 'news', 'signals'];
    for (const k of keys) {
      const arr = raw[k];
      if (Array.isArray(arr) && arr.length > 0) {
        arr.forEach((e, i) => {
          out.push({
            id: e.id || `evt-${i}`,
            name: e.title || e.name || e.label || e.description || `Event ${i + 1}`,
            type: e.type || e.category || 'intel',
            detail: e,
          });
        });
        break;
      }
    }
  }
  return out;
}

function classifyEvent(evtToks, signals, investigations) {
  const matchedSignals = signals.filter(s =>
    overlaps(evtToks, [
      s.name, s.title, s.description, s.summary, s.category,
      s.tags, s.type, s.topic, s.domain, s.source, s.indicator,
      s.region, s.asset, s.sector, s.threat, s.keyword,
    ].join(' '))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(evtToks, [
      inv.name, inv.title, inv.description, inv.summary, inv.status,
      inv.category, inv.tags, inv.type, inv.topic, inv.domain,
      inv.target, inv.subject, inv.region, inv.threat, inv.case_id,
    ].join(' '))
  );
  const hasSig = matchedSignals.length > 0;
  const hasInv = matchedInvestigations.length > 0;
  const cls = hasSig && hasInv ? 'TRIAGED'
            : hasSig           ? 'SIGNALED'
            : hasInv           ? 'TRACKED'
            : 'UNTRACKED';
  return {
    cls,
    matchedSignals: matchedSignals.slice(0, 4),
    matchedInvestigations: matchedInvestigations.slice(0, 4),
  };
}

export function isLrtriQuery(q) {
  return /\b(lrtri|crisis.triage|live.intel.risk|intel.triage|live.risk.invest|event.coverage|intel.coverage|risk.triage|untracked.event|live.event.risk)\b/i.test(q);
}
export function buildLrtriScript() {
  return 'Opening Live Intel × Risk Signal × Investigation Crisis Triage. Cross-referencing live intelligence events against filed risk signals and open investigations to surface fully triaged vs untracked crisis events.';
}

export default function LiveIntelRiskInvestigationTriage() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [sigCount, setSigCount]     = useState(0);
  const [invCount, setInvCount]     = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [liRes, sigRes, invRes] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers: h }),
        fetch(`${API}/entities/RiskSignal`,    { headers: h }),
        fetch(`${API}/v1/investigations`,      { headers: h }),
      ]);
      const [liRaw, sigRaw, invRaw] = await Promise.all([
        liRes.ok  ? liRes.json()  : {},
        sigRes.ok ? sigRes.json() : [],
        invRes.ok ? invRes.json() : [],
      ]);

      const events  = extractEvents(liRaw);
      const signals = normalizeArray(sigRaw, ['items','data','results','signals','list','risks','riskSignals']);
      const invs    = normalizeArray(invRaw, ['items','data','results','investigations','cases','list']);

      setSigCount(signals.length);
      setInvCount(invs.length);

      const built = events.map(evt => {
        const toks = tokens([
          evt.name, evt.type,
          evt.detail?.place, evt.detail?.location, evt.detail?.region,
          evt.detail?.symbol, evt.detail?.ticker, evt.detail?.category,
          evt.detail?.description, evt.detail?.title, evt.detail?.tags,
        ].join(' '));
        const { cls, matchedSignals, matchedInvestigations } = classifyEvent(toks, signals, invs);
        return { ...evt, _cls: cls, _signals: matchedSignals, _investigations: matchedInvestigations };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:lrtri-toggle', handler);
    return () => window.removeEventListener('jarvis:lrtri-toggle', handler);
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
    const counts = { TRIAGED: 0, SIGNALED: 0, TRACKED: 0, UNTRACKED: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const untrackedNames = rows.filter(r => r._cls === 'UNTRACKED').slice(0, 5).map(r => r.name).join(', ');
    const prompt = `Live Intel × Risk Signal × Investigation Crisis Triage: ${rows.length} live intelligence events cross-referenced against ${sigCount} filed risk signals and ${invCount} open investigations. ${counts.TRIAGED} events are TRIAGED (matched both a risk signal AND an investigation — fully monitored). ${counts.SIGNALED} events are SIGNALED (matched a risk signal but have no open investigation — flagged but not yet being investigated). ${counts.TRACKED} events are TRACKED (under active investigation but no risk signal has been filed — operationally tracked but not formally flagged). ${counts.UNTRACKED} events are UNTRACKED — no risk signal and no investigation, representing the highest crisis coverage gaps in live intelligence.${untrackedNames ? ` Untracked events include: ${untrackedNames}.` : ''} Assess overall crisis triage coverage, identify which untracked events represent the highest operational risk, and recommend whether new risk signals or investigations should be opened immediately.`;
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
  }, [rows, assessing, sigCount, invCount]);

  const counts = { TRIAGED: 0, SIGNALED: 0, TRACKED: 0, UNTRACKED: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.type, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  const TYPE_COLOR = { quake: '#FF6B35', crypto: '#A78BFA', fx: '#29E7FF', intel: '#00E5A0' };

  const PANEL = {
    position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
    width: 760, maxHeight: '78vh', zIndex: 152,
    background: 'rgba(8,12,20,0.97)', border: '1px solid #FF4444',
    borderRadius: 8, display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#ccc', overflow: 'hidden',
    boxShadow: '0 0 32px rgba(255,68,68,0.15)',
  };

  if (!open) {
    return (
      <>
        <style>{`@keyframes lrtri-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 79160, zIndex: 152,
            background: 'rgba(255,68,68,0.10)', border: '1px solid #FF4444',
            color: '#FF4444', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ LRTRI{counts.UNTRACKED > 0 && (
            <span style={{
              marginLeft: 4, background: '#FF4444', color: '#fff',
              borderRadius: 8, padding: '0 4px', fontSize: 8,
              animation: 'lrtri-pulse 1.4s infinite',
            }}>{counts.UNTRACKED}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes lrtri-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <div style={PANEL}>
        {/* Header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#FF4444', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ CRISIS TRIAGE</span>
          <span style={{ fontSize: 10, color: '#888' }}>Live Intel × Risk Signal × Investigation</span>
          <span style={{ flex: 1 }} />
          {loading && <span style={{ color: '#888', fontSize: 10 }}>loading…</span>}
          {error && <span style={{ color: '#FF4444', fontSize: 10 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          {[
            { label: 'EVENTS',    val: rows.length,          color: '#ccc' },
            { label: 'SIGNALS',   val: sigCount,             color: '#FFB800' },
            { label: 'INVEST.',   val: invCount,             color: '#29E7FF' },
            { label: 'TRIAGED',   val: counts.TRIAGED,       color: '#00E5A0' },
            { label: 'SIGNALED',  val: counts.SIGNALED,      color: '#FFB800' },
            { label: 'TRACKED',   val: counts.TRACKED,       color: '#29E7FF' },
            { label: 'UNTRACKED', val: counts.UNTRACKED,     color: '#FF4444', pulse: counts.UNTRACKED > 0 },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4,
              padding: '5px 4px', textAlign: 'center',
              border: `1px solid ${color}22`,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse ? 'lrtri-pulse 1.4s infinite' : 'none',
              }}>{val}</div>
              <div style={{ fontSize: 8, color: '#666', letterSpacing: 0.5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter + search */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #222', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#FF4444'}22` : 'none',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#FF4444') : '#333'}`,
              color: tab === t ? (CLS_COLOR[t] || '#FF4444') : '#666',
              fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search events…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', fontSize: 10,
              padding: '3px 8px', borderRadius: 3, outline: 'none', width: 160,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#444', padding: 20, fontSize: 11 }}>No events match current filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id}>
              <div
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 14px', cursor: 'pointer',
                  borderBottom: '1px solid #181c24',
                  background: expanded === row.id ? 'rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: `${CLS_COLOR[row._cls]}22`,
                  border: `1px solid ${CLS_COLOR[row._cls]}`,
                  color: CLS_COLOR[row._cls], letterSpacing: 0.5, minWidth: 76, textAlign: 'center',
                }}>{row._cls}</span>
                <span style={{ flex: 1, fontSize: 11, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                <span style={{
                  fontSize: 8, padding: '1px 5px', borderRadius: 2,
                  background: `${TYPE_COLOR[row.type] || '#555'}22`,
                  border: `1px solid ${TYPE_COLOR[row.type] || '#555'}44`,
                  color: TYPE_COLOR[row.type] || '#888',
                }}>{row.type}</span>
                <span style={{ fontSize: 9, color: '#555' }}>
                  {row._signals.length}⚠ {row._investigations.length}🔍
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>{expanded === row.id ? '▲' : '▼'}</span>
              </div>
              {expanded === row.id && (
                <div style={{ padding: '8px 20px 10px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #181c24' }}>
                  {row._signals.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>RISK SIGNALS ({row._signals.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._signals.map((s, i) => {
                          const sev = s.severity || s.level || s.risk_level || s.priority || '';
                          const sevColor = sev === 'critical' || sev === 'high' ? '#FF4444'
                                         : sev === 'medium' || sev === 'moderate' ? '#FFB800'
                                         : '#00E5A0';
                          return (
                            <span key={i} style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 10,
                              background: 'rgba(255,184,0,0.10)', border: '1px solid #FFB80033',
                              color: '#FFB800',
                            }}>
                              {s.name || s.title || 'Signal'}
                              {sev && (
                                <span style={{ marginLeft: 4, color: sevColor, fontWeight: 700 }}>{sev}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {row._investigations.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>INVESTIGATIONS ({row._investigations.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._investigations.map((inv, i) => {
                          const st = inv.status || inv.state || '';
                          const stColor = st === 'open' || st === 'active' ? '#00E5A0'
                                        : st === 'pending' || st === 'review' ? '#FFB800'
                                        : '#888';
                          return (
                            <span key={i} style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 10,
                              background: 'rgba(41,231,255,0.10)', border: '1px solid #29E7FF33',
                              color: '#29E7FF',
                            }}>
                              {inv.name || inv.title || 'Investigation'}
                              {st && (
                                <span style={{ marginLeft: 4, color: stColor }}>{st}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {row._signals.length === 0 && row._investigations.length === 0 && (
                    <div style={{ color: '#FF4444', fontSize: 10 }}>⚠ No risk signals or investigations found for this event — untracked crisis event.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,68,68,0.05)' : 'rgba(255,68,68,0.12)',
              border: '1px solid #FF4444', color: '#FF4444',
              fontSize: 10, padding: '4px 14px', borderRadius: 3, cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS CRISIS TRIAGE COVERAGE'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,68,68,0.05)',
              border: '1px solid #FF444422', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
