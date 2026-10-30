/**
 * InvestmentBrainContactInvestigationOpsMonitor — F216
 *
 * Fetches /entities/Investment + /v1/cinematic/brain + /entities/Contact +
 *         /v1/investigations + /v1/ops/alerts
 *
 * Keyword-matches each investment (name/type/description/tags) against
 * brain node labels/types, contact names/roles/orgs, investigation
 * titles/categories, and ops-alert messages/categories to classify:
 *
 *   COMMANDED — investment matches brain + contact + investigation + ops alert (all 4)
 *               (fully commanded asset: modelled, owned, investigated, alerted)
 *   COVERED   — investment matches brain + contact + ops alert (3 sources, no investigation)
 *               (covered asset with a brain model, contact owner and alert but no case open)
 *   PARTIAL   — investment matches at least 1 source but not COMMANDED/COVERED
 *               (some wealth intelligence grounding — partial coverage)
 *   EXPOSED   — no match to any source
 *               (full wealth blind spot — no brain model, no contact owner, no investigation,
 *                no ops alert)
 *
 * Toggle: ◈ WLCMON button (fixed, bottom strip) left:168760, zIndex:312
 * Stat tiles: investments / brain-nodes / contacts / investigations / ops-alerts /
 *             commanded / covered / partial / exposed
 * Red pulse on EXPOSED count (wealth blind spots).
 * Expandable rows: matched brain nodes with type badge +
 *                  matched contacts with role/org +
 *                  matched investigations with status badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / COMMANDED / COVERED / PARTIAL / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "wlcmon"/"wealth command"/"investment command"/"wealth monitor"/
 *        "investment brain"/"investment investigation"/"wealth coverage"/
 *        "investment alert"/"investment contact"/"exposed investment"/
 *        "wealth blind spot"/"wealth exposed"/"investment ops"
 * Event: jarvis:wlcmon-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDED', 'COVERED', 'PARTIAL', 'EXPOSED'];

const CLS_COLOR = {
  COMMANDED: '#22C55E',
  COVERED:   '#38BDF8',
  PARTIAL:   '#F59E0B',
  EXPOSED:   '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeInvestments(raw) {
  if (Array.isArray(raw))                 return raw;
  if (Array.isArray(raw?.items))          return raw.items;
  if (Array.isArray(raw?.investments))    return raw.investments;
  if (Array.isArray(raw?.results))        return raw.results;
  if (Array.isArray(raw?.data))           return raw.data;
  return [];
}

function normalizeBrain(raw) {
  if (!raw) return [];
  if (Array.isArray(raw?.nodes))    return raw.nodes;
  if (Array.isArray(raw?.entities)) return raw.entities;
  if (Array.isArray(raw))           return raw;
  if (raw?.nodes && typeof raw.nodes === 'object') {
    return Object.entries(raw.nodes).map(([k, v]) => ({
      label: k, ...(typeof v === 'object' ? v : { score: v }),
    }));
  }
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
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

function normalizeOpsAlerts(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.alerts))  return raw.alerts;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data))    return raw.data;
  return [];
}

export function isWlcmonQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'wlcmon', 'wealth command', 'investment command', 'wealth monitor',
    'investment brain', 'investment investigation', 'wealth coverage',
    'investment alert', 'investment contact', 'exposed investment',
    'wealth blind spot', 'wealth exposed', 'investment ops',
  ].some(k => s.includes(k));
}

export function buildWlcmonScript() {
  return (
    'Fetch /entities/Investment, /v1/cinematic/brain, /entities/Contact, ' +
    '/v1/investigations, and /v1/ops/alerts. ' +
    'Keyword-match each investment (name/type/description/tags) against ' +
    'brain node labels/types, contact names/roles/orgs, ' +
    'investigation titles/categories, and ops-alert messages/categories. ' +
    'Classify each investment as COMMANDED (matches all 4 sources — brain model, contact owner, ' +
    'open investigation, and ops alert coverage), ' +
    'COVERED (matches brain + contact + ops alert — 3 sources, no investigation), ' +
    'PARTIAL (matches at least one source), ' +
    'or EXPOSED (no match to any source — full wealth blind spot: no brain model, ' +
    'no contact owner, no investigation, no ops alert). ' +
    'Report total EXPOSED count, identify which exposed investments represent the highest ' +
    'financial risk (highest value assets with zero intelligence coverage), and recommend ' +
    'which brain nodes should model them, which contacts should own them, which investigations ' +
    'should cover them, and which ops alerts should monitor them to eliminate these wealth blind spots.'
  );
}

export default function InvestmentBrainContactInvestigationOpsMonitor() {
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
    investments: 0, brainNodes: 0, contacts: 0, investigations: 0, opsAlerts: 0,
    commanded: 0, covered: 0, partial: 0, exposed: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [invRaw, brainRaw, contactsRaw, invstRaw, opsRaw] = await Promise.all([
        fetch(`${API}/entities/Investment`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/cinematic/brain`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/investigations`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const investments    = normalizeInvestments(invRaw);
      const brainNodes     = normalizeBrain(brainRaw);
      const contacts       = normalizeContacts(contactsRaw);
      const investigations = normalizeInvestigations(invstRaw);
      const opsAlerts      = normalizeOpsAlerts(opsRaw);

      const built = investments.map((inv, idx) => {
        const invText = [
          inv.name, inv.title, inv.type, inv.category, inv.description,
          inv.ticker, inv.symbol, inv.sector, inv.asset_class, inv.assetClass,
          inv.tags?.join?.(' '),
        ].filter(Boolean).join(' ');
        const iToks = tokens(invText);

        const matchedBrain = brainNodes.filter(n => {
          const s = [n.label, n.name, n.type, n.category, n.description]
            .filter(Boolean).join(' ');
          return overlaps(iToks, s);
        });

        const matchedContacts = contacts.filter(c => {
          const s = [
            c.name, c.title, c.role, c.org, c.organisation, c.organization,
            c.department, c.domain, c.tags?.join?.(' '), c.description,
          ].filter(Boolean).join(' ');
          return overlaps(iToks, s);
        });

        const matchedInvestigations = investigations.filter(iv => {
          const s = [
            iv.title, iv.name, iv.type, iv.category, iv.description,
            iv.status, iv.subject, iv.tags?.join?.(' '),
          ].filter(Boolean).join(' ');
          return overlaps(iToks, s);
        });

        const matchedOpsAlerts = opsAlerts.filter(a => {
          const s = [
            a.name, a.title, a.message, a.category, a.type,
            a.description, a.source, a.tags?.join?.(' '),
          ].filter(Boolean).join(' ');
          return overlaps(iToks, s);
        });

        const hasBrain  = matchedBrain.length > 0;
        const hasCtc    = matchedContacts.length > 0;
        const hasInvst  = matchedInvestigations.length > 0;
        const hasOps    = matchedOpsAlerts.length > 0;
        const matchCnt  = [hasBrain, hasCtc, hasInvst, hasOps].filter(Boolean).length;

        let cls;
        if (hasBrain && hasCtc && hasInvst && hasOps) cls = 'COMMANDED';
        else if (hasBrain && hasCtc && hasOps)         cls = 'COVERED';
        else if (matchCnt >= 1)                        cls = 'PARTIAL';
        else                                           cls = 'EXPOSED';

        return {
          id: inv.id || inv._id || `inv-${idx}`,
          name: inv.name || inv.title || `investment-${idx}`,
          type: inv.type || inv.asset_class || inv.assetClass || '',
          value: inv.value || inv.amount || inv.current_value || inv.currentValue || null,
          cls,
          matchedBrain,
          matchedContacts,
          matchedInvestigations,
          matchedOpsAlerts,
        };
      });

      const commanded = built.filter(r => r.cls === 'COMMANDED').length;
      const covered   = built.filter(r => r.cls === 'COVERED').length;
      const partial   = built.filter(r => r.cls === 'PARTIAL').length;
      const exposed   = built.filter(r => r.cls === 'EXPOSED').length;

      setCounts({
        investments: investments.length,
        brainNodes: brainNodes.length,
        contacts: contacts.length,
        investigations: investigations.length,
        opsAlerts: opsAlerts.length,
        commanded, covered, partial, exposed,
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:wlcmon-toggle', handler);
    return () => window.removeEventListener('jarvis:wlcmon-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const script = buildWlcmonScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || d.text || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
    }
    return true;
  });

  const pulse = counts.exposed > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Wealth Command Monitor"
        style={{
          position: 'fixed',
          bottom: 8,
          left: 168760,
          zIndex: 312,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${pulse ? '#EF4444' : 'rgba(239,68,68,0.4)'}`,
          color: pulse ? '#EF4444' : '#94A3B8',
          padding: '3px 9px',
          fontSize: 10,
          cursor: 'pointer',
          borderRadius: 4,
          fontFamily: 'monospace',
          boxShadow: pulse ? '0 0 6px rgba(239,68,68,0.5)' : 'none',
          animation: pulse ? 'wlcmon-pulse 1.6s ease-in-out infinite' : 'none',
        }}
      >
        ◈ WLCMON{counts.exposed > 0 ? ` (${counts.exposed})` : ''}
      </button>

      <style>{`
        @keyframes wlcmon-pulse {
          0%, 100% { box-shadow: 0 0 4px rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 12px rgba(239,68,68,0.8); }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 680,
          maxHeight: '72vh',
          background: 'rgba(10,15,28,0.97)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 8,
          zIndex: 9900,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'monospace',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
                ◈ WEALTH COMMAND MONITOR
              </span>
              <span style={{ color: '#475569', fontSize: 10, marginLeft: 10 }}>
                Investment × Brain × Contact × Investigation × Ops Alert
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {[
              { label: 'INVESTMENTS', val: counts.investments, color: '#94A3B8' },
              { label: 'BRAIN',       val: counts.brainNodes,  color: '#94A3B8' },
              { label: 'CONTACTS',    val: counts.contacts,    color: '#94A3B8' },
              { label: 'CASES',       val: counts.investigations, color: '#94A3B8' },
              { label: 'ALERTS',      val: counts.opsAlerts,   color: '#94A3B8' },
              { label: 'COMMANDED',   val: counts.commanded,   color: CLS_COLOR.COMMANDED },
              { label: 'COVERED',     val: counts.covered,     color: CLS_COLOR.COVERED },
              { label: 'PARTIAL',     val: counts.partial,     color: CLS_COLOR.PARTIAL },
              { label: 'EXPOSED',     val: counts.exposed,     color: CLS_COLOR.EXPOSED },
            ].map(t => (
              <div key={t.label} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 4,
                padding: '4px 8px',
                textAlign: 'center',
                flex: 1,
              }}>
                <div style={{ color: t.color, fontSize: 13, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: '#475569', fontSize: 8 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 14px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CLS_COLOR[t] || 'rgba(148,163,184,0.2)'}22` : 'transparent',
                border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#94A3B8') : 'rgba(255,255,255,0.08)'}`,
                color: tab === t ? (CLS_COLOR[t] || '#94A3B8') : '#64748B',
                padding: '2px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3, fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search investments…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1',
                padding: '2px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 160,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {loading && (
              <div style={{ color: '#475569', fontSize: 11, padding: 16, textAlign: 'center' }}>
                Loading wealth intelligence data…
              </div>
            )}
            {error && (
              <div style={{ color: '#EF4444', fontSize: 11, padding: 16, textAlign: 'center' }}>
                {error}
              </div>
            )}

            {visible.map((row) => (
              <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {/* Row header */}
                <div
                  onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', cursor: 'pointer',
                    background: expanded[row.id] ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}
                >
                  <span style={{
                    color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 700,
                    minWidth: 86, letterSpacing: 1,
                  }}>{row.cls}</span>
                  <span style={{ color: '#CBD5E1', fontSize: 11, flex: 1 }}>{row.name}</span>
                  {row.type && (
                    <span style={{
                      color: '#64748B', fontSize: 9,
                      background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 6px',
                    }}>{row.type}</span>
                  )}
                  {row.value !== null && row.value !== undefined && (
                    <span style={{
                      color: '#94A3B8', fontSize: 10,
                      background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 6px',
                    }}>
                      {typeof row.value === 'number'
                        ? row.value >= 1e6
                          ? `$${(row.value / 1e6).toFixed(1)}M`
                          : `$${row.value.toLocaleString()}`
                        : row.value}
                    </span>
                  )}
                  <span style={{ color: '#334155', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
                </div>

                {/* Expanded detail */}
                {expanded[row.id] && (
                  <div style={{
                    padding: '8px 14px 10px 28px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Brain nodes */}
                    {row.matchedBrain.length > 0 && (
                      <div>
                        <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({row.matchedBrain.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedBrain.slice(0, 6).map((n, i) => {
                            const tp = n.type || n.category || '';
                            return (
                              <span key={i} style={{
                                background: 'rgba(56,189,248,0.1)', color: '#38BDF8',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {n.label || n.name || `node-${i}`}
                                {tp && <span style={{ color: '#64748B', marginLeft: 4 }}>{tp}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Contacts */}
                    {row.matchedContacts.length > 0 && (
                      <div>
                        <div style={{ color: '#22C55E', fontSize: 10, marginBottom: 3 }}>CONTACTS ({row.matchedContacts.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedContacts.slice(0, 6).map((c, i) => {
                            const role = c.role || c.title || '';
                            const org  = c.org || c.organisation || c.organization || '';
                            return (
                              <span key={i} style={{
                                background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {c.name || `contact-${i}`}
                                {(role || org) && (
                                  <span style={{ color: '#64748B', marginLeft: 4 }}>
                                    {[role, org].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Investigations */}
                    {row.matchedInvestigations.length > 0 && (
                      <div>
                        <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>INVESTIGATIONS ({row.matchedInvestigations.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedInvestigations.slice(0, 6).map((iv, i) => {
                            const st = iv.status || '';
                            return (
                              <span key={i} style={{
                                background: 'rgba(245,158,11,0.1)', color: '#F59E0B',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {iv.title || iv.name || `case-${i}`}
                                {st && <span style={{ color: '#64748B', marginLeft: 4 }}>{st}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Ops Alerts */}
                    {row.matchedOpsAlerts.length > 0 && (
                      <div>
                        <div style={{ color: '#EF4444', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({row.matchedOpsAlerts.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.matchedOpsAlerts.slice(0, 6).map((a, i) => {
                            const sev = a.severity || a.level || a.priority || '';
                            return (
                              <span key={i} style={{
                                background: 'rgba(239,68,68,0.1)', color: '#EF4444',
                                borderRadius: 3, padding: '1px 7px', fontSize: 10,
                              }}>
                                {a.name || a.title || a.message?.slice(0, 40) || `alert-${i}`}
                                {sev && <span style={{ color: '#64748B', marginLeft: 4 }}>{sev}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {row.matchedBrain.length === 0 && row.matchedContacts.length === 0 &&
                     row.matchedInvestigations.length === 0 && row.matchedOpsAlerts.length === 0 && (
                      <div style={{ color: '#475569', fontSize: 11 }}>No matches — investment is fully exposed.</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 12, padding: 16, textAlign: 'center' }}>
                No investments match this filter.
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
              {assessing ? 'Assessing…' : '▶ ASSESS EXPOSED INVESTMENTS'}
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
      )}
    </>
  );
}
