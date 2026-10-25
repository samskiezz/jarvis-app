/**
 * IntelProfileGraphRiskOpsContactCommand — F187
 *
 * Fetches /entities/IntelProfile + /v1/graph/centrality + /entities/RiskSignal
 *         + /v1/ops/alerts + /entities/Contact
 *
 * Keyword-matches each intel profile (name/category/description) against graph
 * nodes, risk signals, ops alerts, and contacts to classify:
 *
 *   COMMANDING — profile matches all 4 secondary sources (full threat attribution)
 *   ACTIVE     — profile matches 2–3 of 4 secondary sources
 *   PARTIAL    — profile matches 1 secondary source
 *   SHADOW     — no match across any source (blind intel profiles — zero attribution)
 *
 * Toggle: ◈ IGRCAT button (fixed, bottom strip) left:153080, zIndex:284
 * Stat tiles: profiles / nodes / signals / alerts / contacts /
 *             commanding / active / partial / shadow
 * Red pulse on SHADOW count (blind-spot intel profiles — zero attribution footprint).
 * Expandable rows: matched graph nodes with centrality score badge +
 *                  matched risk signals with severity badge +
 *                  matched ops alerts with severity badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / COMMANDING / ACTIVE / PARTIAL / SHADOW + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "igrcat"/"intel threat attribution"/"threat attribution command"
 *        "intel graph risk"/"intel ops contact"/"shadow intel"/"blind intel profile"
 *        "intel attribution network"/"threat command attribution"
 * Event: jarvis:igrcat-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ACTIVE', 'PARTIAL', 'SHADOW'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  ACTIVE:     '#38BDF8',
  PARTIAL:    '#F97316',
  SHADOW:     '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export function isIgrcatQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'igrcat', 'intel threat attribution', 'threat attribution command',
    'intel graph risk', 'intel ops contact', 'shadow intel',
    'blind intel profile', 'intel attribution network',
    'threat command attribution', 'intel profile threat',
  ].some(kw => s.includes(kw));
}

export function buildIgrcatScript(stats) {
  return `IGRCAT: ${stats.profiles} intel profiles | ${stats.commanding} COMMANDING | ${stats.active} ACTIVE | ${stats.partial} PARTIAL | ${stats.shadow} SHADOW (blind profiles). Sources: ${stats.nodes} graph nodes, ${stats.signals} risk signals, ${stats.alerts} ops alerts, ${stats.contacts} contacts. Identify the most dangerous shadow profiles with zero graph trace, risk signal, alert, or contact attribution and recommend immediate attribution actions.`;
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(profile, nodes, signals, alerts, contacts) {
  const toks = tokens(`${profile.name || ''} ${profile.category || ''} ${profile.description || ''} ${profile.title || ''} ${profile.id || ''}`);
  const mNodes    = nodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.description || ''} ${n.name || ''} ${n.id || ''}`));
  const mSignals  = signals.filter(s => overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.category || ''} ${s.type || ''}`));
  const mAlerts   = alerts.filter(a => overlaps(toks, `${a.name || ''} ${a.title || ''} ${a.message || ''} ${a.description || ''} ${a.category || ''}`));
  const mContacts = contacts.filter(c => overlaps(toks, `${c.name || ''} ${c.role || ''} ${c.org || ''} ${c.organisation || ''}`));

  const matched = [
    mNodes.length > 0,
    mSignals.length > 0,
    mAlerts.length > 0,
    mContacts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (matched === 4)      cls = 'COMMANDING';
  else if (matched >= 2)  cls = 'ACTIVE';
  else if (matched === 1) cls = 'PARTIAL';
  else                    cls = 'SHADOW';

  return { profile, cls, mNodes, mSignals, mAlerts, mContacts };
}

export default function IntelProfileGraphRiskOpsContactCommand() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({ profiles:0, nodes:0, signals:0, alerts:0, contacts:0, commanding:0, active:0, partial:0, shadow:0 });
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ipRaw, grRaw, rsRaw, oaRaw, ctRaw] = await Promise.all([
        fetcher('/entities/IntelProfile'),
        fetcher('/v1/graph/centrality'),
        fetcher('/entities/RiskSignal'),
        fetcher('/v1/ops/alerts'),
        fetcher('/entities/Contact'),
      ]);
      const profiles  = normalizeArray(ipRaw, ['profiles','items','data','results','intel_profiles']);
      const nodes     = normalizeArray(grRaw, ['nodes','centrality','items','data','results']);
      const signals   = normalizeArray(rsRaw, ['signals','items','data','results','risk_signals']);
      const alerts    = normalizeArray(oaRaw, ['alerts','items','data','results','ops_alerts']);
      const contacts  = normalizeArray(ctRaw, ['contacts','items','data','results']);

      const classified = profiles.map(p => classify(p, nodes, signals, alerts, contacts));
      setRows(classified);
      setStats({
        profiles: profiles.length, nodes: nodes.length,
        signals: signals.length, alerts: alerts.length, contacts: contacts.length,
        commanding: classified.filter(r => r.cls === 'COMMANDING').length,
        active:     classified.filter(r => r.cls === 'ACTIVE').length,
        partial:    classified.filter(r => r.cls === 'PARTIAL').length,
        shadow:     classified.filter(r => r.cls === 'SHADOW').length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:igrcat-toggle', handler);
    return () => window.removeEventListener('jarvis:igrcat-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const summary = buildIgrcatScript(stats);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Intel profile threat attribution command assessment: ${summary}` }),
      });
      const d = await r.json();
      const text = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const p = r.profile;
      return (p.name || '').toLowerCase().includes(s)
          || (p.category || '').toLowerCase().includes(s)
          || (p.id || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 153080, zIndex: 284,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 10, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >◈ IGRCAT</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 20, zIndex: 9900,
      width: 860, maxHeight: '82vh',
      background: 'rgba(2,6,23,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(239,68,68,0.12)',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#ef4444', fontSize: 14 }}>◈</span>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>IGRCAT</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>IntelProfile × Graph × RiskSignal × Ops Alert × Contact — Threat Attribution Command</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={assess} disabled={assessing}
            style={{ background: '#1e40af', border: 'none', color: '#bfdbfe', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
          >{assessing ? '…' : '▶ ASSESS'}</button>
          <button onClick={() => load()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap', borderBottom: '1px solid #1e3a5f' }}>
        {[
          ['PROFILES',   stats.profiles,   '#94a3b8'],
          ['NODES',      stats.nodes,      '#64748b'],
          ['SIGNALS',    stats.signals,    '#64748b'],
          ['ALERTS',     stats.alerts,     '#64748b'],
          ['CONTACTS',   stats.contacts,   '#64748b'],
          ['COMMANDING', stats.commanding, CLS_COLOR.COMMANDING],
          ['ACTIVE',     stats.active,     CLS_COLOR.ACTIVE],
          ['PARTIAL',    stats.partial,    CLS_COLOR.PARTIAL],
          ['SHADOW',     stats.shadow,     CLS_COLOR.SHADOW],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: '#0f172a', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 56,
          }}>
            <div style={{ color, fontSize: 15, fontWeight: 700, ...(label === 'SHADOW' && val > 0 ? {
              animation: 'igrcat-pulse 1.4s ease-in-out infinite',
            } : {}) }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1e3a5f' : '#0f172a',
            border: `1px solid ${tab === t ? '#3b82f6' : '#1e293b'}`,
            color: tab === t ? '#bfdbfe' : '#64748b',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 140 }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>loading…</div>}
        {error   && <div style={{ color: '#ef4444', textAlign: 'center', padding: 8 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>no results</div>
        )}
        {visible.map((r, i) => {
          const p  = r.profile;
          const id = p.id || p._id || p.name || i;
          const ex = expanded[id];
          return (
            <div key={id} style={{ borderBottom: '1px solid #0f172a' }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
                  cursor: 'pointer', background: ex ? '#0f172a' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 10, minWidth: 88 }}>{r.cls}</span>
                <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name || p.title || p.id || '—'}
                </span>
                {p.category && (
                  <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {p.category}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{ex ? '▲' : '▼'}</span>
              </div>
              {ex && (
                <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, j) => (
                          <span key={j} style={{ background: '#0c1a2e', border: '1px solid #0e4f6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {typeof n.centrality === 'number' && <span style={{ color: '#94a3b8', fontSize: 9 }}> c:{n.centrality.toFixed(3)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSignals.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mSignals.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSignals.slice(0, 8).map((s, j) => (
                          <span key={j} style={{ background: '#1c0505', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {s.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#fb923c', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((a, j) => (
                          <span key={j} style={{ background: '#1c0e00', border: '1px solid #78350f', color: '#fdba74', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.name || a.title || a.message || a.id}
                            {a.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {a.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#4ade80', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, j) => (
                          <span key={j} style={{ background: '#0a1e0e', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.id}
                            {(c.role || c.org || c.organisation) && <span style={{ color: '#94a3b8', fontSize: 9 }}> {[c.role, c.org || c.organisation].filter(Boolean).join(' · ')}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length === 0 && r.mSignals.length === 0 && r.mAlerts.length === 0 && r.mContacts.length === 0 && (
                    <div style={{ color: '#ef4444', fontSize: 10 }}>No graph node, risk signal, ops alert, or contact match — shadow profile with zero attribution footprint.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes igrcat-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
