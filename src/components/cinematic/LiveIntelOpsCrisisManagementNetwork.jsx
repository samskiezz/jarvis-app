/**
 * LiveIntelOpsCrisisManagementNetwork — F212
 *
 * Fetches /functions/getLiveIntel + /v1/ops/alerts +
 *         /v1/investigations + /entities/Contact.
 *
 * Groups live events by category (quake region, crypto symbol, FX pair).
 * Keyword-matches each category against ops-alert names/descriptions,
 * open investigation titles/summaries, and contact names/roles/orgs to classify:
 *
 *   MANAGED    — category matches ops alert + investigation + contact
 *                (fully handled: alerted, investigated, and owned)
 *   ALERTED    — category matches ops alert + (investigation or contact)
 *                (partially covered — alert raised but missing depth)
 *   TRACKED    — category matches investigation or contact only
 *                (tracked but without full incident response chain)
 *   UNMANAGED  — no match to any ops alert, investigation, or contact
 *                (live crisis events with zero incident management coverage)
 *
 * Toggle: ◈ LICMN button (fixed, bottom strip) left:166520, zIndex:308
 * Stat tiles: categories / alerts / investigations / contacts / managed /
 *             alerted / tracked / unmanaged
 * Red pulse on UNMANAGED count (full crisis blind spots).
 * Expandable rows: matched ops alerts with severity badge +
 *                  matched investigations with status badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / MANAGED / ALERTED / TRACKED / UNMANAGED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "licmn"/"crisis management"/"live crisis"/"incident management network"
 *        "live alert investigation"/"crisis network"/"live contact"
 *        "incident crisis"/"crisis response network"/"live ops"
 *        "live incidents"/"crisis intel"/"unmanaged crisis"
 * Event: jarvis:licmn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'MANAGED', 'ALERTED', 'TRACKED', 'UNMANAGED'];

const CLS_COLOR = {
  MANAGED:   '#22C55E',
  ALERTED:   '#F97316',
  TRACKED:   '#38BDF8',
  UNMANAGED: '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
};

const INV_STATUS_COLOR = {
  open:        '#EF4444',
  active:      '#F97316',
  in_progress: '#F59E0B',
  closed:      '#22C55E',
  resolved:    '#22C55E',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.alerts))  return raw.alerts;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data))    return raw.data;
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

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.entities))   return raw.entities;
  return [];
}

function categoriseIntel(intel) {
  const cats = {};
  const quakes = intel?.earthquakes || intel?.quakes || [];
  const crypto  = intel?.crypto  || intel?.cryptoPrices || [];
  const fx      = intel?.fx      || intel?.fxRates      || [];

  quakes.forEach(q => {
    const region = q.region || q.place || q.location || 'Unknown Region';
    const key    = `quake:${region}`;
    if (!cats[key]) cats[key] = { label: region, type: 'quake', items: [] };
    cats[key].items.push(q);
  });

  crypto.forEach(c => {
    const sym = c.symbol || c.id || 'CRYPTO';
    const key = `crypto:${sym}`;
    if (!cats[key]) cats[key] = { label: sym, type: 'crypto', items: [] };
    cats[key].items.push(c);
  });

  fx.forEach(f => {
    const pair = f.pair || f.symbol || f.id || 'FX';
    const key  = `fx:${pair}`;
    if (!cats[key]) cats[key] = { label: pair, type: 'fx', items: [] };
    cats[key].items.push(f);
  });

  return Object.values(cats);
}

export function isLicmnQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'licmn', 'crisis management', 'live crisis', 'incident management network',
    'live alert investigation', 'crisis network', 'live contact',
    'incident crisis', 'crisis response network', 'live ops',
    'live incidents', 'crisis intel', 'unmanaged crisis',
  ].some(kw => s.includes(kw));
}

export function buildLicmnScript(categories) {
  const unmanaged = categories.filter(c => c.cls === 'UNMANAGED');
  if (!unmanaged.length) return 'All live intel categories have incident management coverage. No unmanaged crises detected.';
  const labels = unmanaged.slice(0, 5).map(c => c.label).join(', ');
  return `JARVIS, ${unmanaged.length} live event ${unmanaged.length === 1 ? 'category is' : 'categories are'} UNMANAGED with no ops alert, no investigation, and no contact owner. Top unmanaged: ${labels}. Assess the incident management gap and recommend immediate coverage actions.`;
}

export default function LiveIntelOpsCrisisManagementNetwork() {
  const [open, setOpen]           = useState(false);
  const [categories, setCategories] = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}` };

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [liRes, alRes, invRes, conRes] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/ops/alerts`,           { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/investigations`,        { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`,         { headers }).then(r => r.ok ? r.json() : []),
      ]);

      const rawAlerts   = normalizeAlerts(alRes);
      const rawInvs     = normalizeInvestigations(invRes);
      const rawContacts = normalizeContacts(conRes);
      const cats        = categoriseIntel(liRes);

      const classified = cats.map(cat => {
        const catToks = tokens(cat.label);

        const matchedAlerts = rawAlerts.filter(a =>
          overlaps(catToks, a.name) || overlaps(catToks, a.description) ||
          overlaps(catToks, a.title) || overlaps(catToks, a.type) ||
          overlaps(catToks, a.category)
        );
        const matchedInvs = rawInvs.filter(inv =>
          overlaps(catToks, inv.title) || overlaps(catToks, inv.summary) ||
          overlaps(catToks, inv.name)  || overlaps(catToks, inv.description) ||
          overlaps(catToks, inv.category)
        );
        const matchedContacts = rawContacts.filter(c =>
          overlaps(catToks, c.name)  || overlaps(catToks, c.role) ||
          overlaps(catToks, c.org)   || overlaps(catToks, c.organization) ||
          overlaps(catToks, c.tags?.join(' '))
        );

        const hasAlert   = matchedAlerts.length   > 0;
        const hasInv     = matchedInvs.length     > 0;
        const hasContact = matchedContacts.length  > 0;

        let cls;
        if (hasAlert && hasInv && hasContact)       cls = 'MANAGED';
        else if (hasAlert && (hasInv || hasContact)) cls = 'ALERTED';
        else if (hasInv || hasContact)               cls = 'TRACKED';
        else                                         cls = 'UNMANAGED';

        return { ...cat, cls, matchedAlerts, matchedInvs, matchedContacts };
      });

      setAlerts(rawAlerts);
      setInvestigations(rawInvs);
      setContacts(rawContacts);
      setCategories(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:licmn-toggle', handler);
    return () => window.removeEventListener('jarvis:licmn-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  const assess = async () => {
    setAssessing(true); setAssessment('');
    const script = buildLicmnScript(categories);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: script }),
      });
      const j = await r.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak', { detail: { text } }));
    } catch (e) {
      setAssessment(e.message);
    } finally {
      setAssessing(false);
    }
  };

  const managed   = categories.filter(c => c.cls === 'MANAGED').length;
  const alerted   = categories.filter(c => c.cls === 'ALERTED').length;
  const tracked   = categories.filter(c => c.cls === 'TRACKED').length;
  const unmanaged = categories.filter(c => c.cls === 'UNMANAGED').length;

  const visible = categories.filter(c => {
    if (tab !== 'ALL' && c.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.label || '').toLowerCase().includes(s) || (c.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 166520, zIndex: 308,
          background: 'rgba(15,23,42,0.85)', border: '1px solid #1E3A5F',
          borderRadius: 4, color: '#38BDF8', fontSize: 9, fontWeight: 700,
          padding: '3px 7px', cursor: 'pointer', fontFamily: 'monospace',
          whiteSpace: 'nowrap',
        }}
        title="Live Intel × Ops Alert × Investigation × Contact Incident Crisis Management Network"
      >
        {unmanaged > 0
          ? <span style={{ color: '#EF4444', animation: 'pulse 1.5s infinite' }}>{unmanaged}</span>
          : null}
        {' '}◈ LICMN
      </button>
    );
  }

  return (
    <>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{
        position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
        width: 780, maxHeight: '78vh', overflowY: 'auto',
        background: 'rgba(10,18,32,0.97)', border: '1px solid #1E3A5F',
        borderRadius: 8, zIndex: 9000, padding: 18, fontFamily: 'monospace',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <span style={{ color: '#38BDF8', fontWeight: 700, fontSize: 13 }}>◈ LICMN</span>
            <span style={{ color: '#64748B', fontSize: 10, marginLeft: 10 }}>
              Live Intel × Ops Alert × Investigation × Contact — Incident Crisis Management Network
            </span>
          </div>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'CATEGORIES',    val: categories.length, color: '#38BDF8' },
            { label: 'ALERTS',        val: alerts.length,       color: '#64748B' },
            { label: 'INVESTIGATIONS',val: investigations.length,color: '#64748B' },
            { label: 'CONTACTS',      val: contacts.length,     color: '#64748B' },
            { label: 'MANAGED',       val: managed,             color: '#22C55E' },
            { label: 'ALERTED',       val: alerted,             color: '#F97316' },
            { label: 'TRACKED',       val: tracked,             color: '#38BDF8' },
            { label: 'UNMANAGED',     val: unmanaged,           color: '#EF4444',
              pulse: unmanaged > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(15,23,42,0.8)', border: `1px solid ${t.color}33`,
              borderRadius: 5, padding: '5px 10px', textAlign: 'center', minWidth: 70,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color: t.color,
                animation: t.pulse ? 'pulse 1.5s infinite' : 'none',
              }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#64748B' }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CLS_COLOR[t] || '#38BDF8' : 'rgba(15,23,42,0.8)',
              border: '1px solid #1E3A5F', borderRadius: 3,
              color: tab === t ? '#0F172A' : '#94A3B8',
              fontSize: 9, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search categories…"
            style={{
              background: 'rgba(15,23,42,0.8)', border: '1px solid #1E3A5F',
              borderRadius: 3, color: '#CBD5E1', fontSize: 10, padding: '3px 8px',
              outline: 'none', marginLeft: 'auto', width: 160,
            }}
          />
        </div>

        {/* Assess */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={assess} disabled={assessing || categories.length === 0}
            style={{
              background: assessing ? 'rgba(56,189,248,0.1)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${assessing ? '#38BDF8' : '#EF4444'}`,
              borderRadius: 4, color: assessing ? '#38BDF8' : '#EF4444',
              fontSize: 10, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
            }}>
            {assessing ? '▶ ASSESSING…' : `▶ ASSESS UNMANAGED CRISES (${unmanaged})`}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, padding: '8px 12px', background: 'rgba(56,189,248,0.05)',
              border: '1px solid #1E3A5F', borderRadius: 4, color: '#CBD5E1', fontSize: 11,
            }}>{assessment}</div>
          )}
        </div>

        {loading && <div style={{ color: '#64748B', fontSize: 11, marginBottom: 8 }}>Loading…</div>}
        {err && <div style={{ color: '#EF4444', fontSize: 11, marginBottom: 8 }}>{err}</div>}

        {/* Rows */}
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11 }}>No categories match this filter.</div>
        )}
        {visible.map((row, i) => {
          const isOpen = !!expanded[i];
          return (
            <div key={i} style={{
              marginBottom: 6, border: `1px solid ${CLS_COLOR[row.cls]}33`,
              borderRadius: 5, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(ex => ({ ...ex, [i]: !isOpen }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', cursor: 'pointer',
                  background: 'rgba(15,23,42,0.6)',
                }}
              >
                <span style={{
                  padding: '1px 7px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`, color: CLS_COLOR[row.cls],
                  minWidth: 80, textAlign: 'center',
                }}>{row.cls}</span>
                <span style={{
                  padding: '1px 7px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                  background: row.type === 'quake' ? 'rgba(239,68,68,0.1)' :
                              row.type === 'crypto' ? 'rgba(168,85,247,0.1)' :
                              'rgba(56,189,248,0.1)',
                  color: row.type === 'quake' ? '#EF4444' :
                         row.type === 'crypto' ? '#A855F7' : '#38BDF8',
                }}>{(row.type || '').toUpperCase()}</span>
                <span style={{ color: '#CBD5E1', fontSize: 12, fontWeight: 600, flex: 1 }}>
                  {row.label}
                </span>
                <span style={{ color: '#64748B', fontSize: 9 }}>
                  {row.items.length} event{row.items.length !== 1 ? 's' : ''}
                </span>
                <span style={{ color: '#38BDF8', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={{ padding: '10px 14px', background: 'rgba(10,18,32,0.8)' }}>
                  {/* Ops Alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>OPS ALERTS</div>
                      {row.matchedAlerts.map((a, j) => {
                        const sev = (a.severity || a.level || 'info').toLowerCase();
                        return (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: `${SEV_COLOR[sev] || '#64748B'}22`,
                              color: SEV_COLOR[sev] || '#64748B',
                            }}>{sev.toUpperCase()}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                              {a.name || a.title || a.description || 'Alert'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Investigations */}
                  {row.matchedInvs.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>INVESTIGATIONS</div>
                      {row.matchedInvs.map((inv, j) => {
                        const st = (inv.status || inv.state || 'open').toLowerCase();
                        return (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: `${INV_STATUS_COLOR[st] || '#64748B'}22`,
                              color: INV_STATUS_COLOR[st] || '#64748B',
                            }}>{st.toUpperCase()}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                              {inv.title || inv.name || 'Investigation'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>CONTACTS</div>
                      {row.matchedContacts.map((c, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(c.role || c.title) && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(56,189,248,0.12)', color: '#38BDF8',
                            }}>{(c.role || c.title).toUpperCase()}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {c.name || 'Contact'}
                          </span>
                          {(c.org || c.organization) && (
                            <span style={{ color: '#64748B', fontSize: 10 }}>
                              {c.org || c.organization}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedAlerts.length === 0 && row.matchedInvs.length === 0 &&
                   row.matchedContacts.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 11 }}>
                      No matching alerts, investigations, or contacts found.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
