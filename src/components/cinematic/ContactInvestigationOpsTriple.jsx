import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const TABS = ['ALL', 'FULL_CONTEXT', 'INV_ONLY', 'OPS_ONLY', 'ISOLATED'];

function tokenise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function score(contactTokens, itemText) {
  const itemTokens = new Set(tokenise(itemText));
  return contactTokens.filter(t => itemTokens.has(t)).length;
}

function matchContact(contact, investigations, opsEvents) {
  const contactText = [
    contact.name, contact.email, contact.organization, contact.role,
    ...(contact.tags || []), contact.notes,
  ].filter(Boolean).join(' ');
  const cTokens = tokenise(contactText);

  const matchedInvs = investigations
    .map(inv => {
      const s = score(cTokens, [inv.title, inv.description, inv.type, ...(inv.seeds || [])].filter(Boolean).join(' '));
      return s > 0 ? { ...inv, _score: s } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const matchedOps = opsEvents
    .map(ev => {
      const s = score(cTokens, [ev.title, ev.message, ev.source, ev.type].filter(Boolean).join(' '));
      return s > 0 ? { ...ev, _score: s } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasInv = matchedInvs.length > 0;
  const hasOps = matchedOps.length > 0;
  let cls;
  if (hasInv && hasOps) cls = 'FULL_CONTEXT';
  else if (hasInv) cls = 'INV_ONLY';
  else if (hasOps) cls = 'OPS_ONLY';
  else cls = 'ISOLATED';

  return { matchedInvs, matchedOps, _class: cls };
}

export function isCioetQuery(q) {
  return /contact.{0,20}invest|contact.{0,20}ops|cioet|isolated contact|contact.{0,20}case.{0,20}ops|contact.{0,20}operational|contact.{0,20}context/i.test(q);
}

export function buildCioetScript() {
  return 'Opening Contact × Investigation × Ops Event intelligence triple. Correlating contacts against open investigations and live operational events.';
}

export default function ContactInvestigationOpsTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [cRes, iRes, oRes] = await Promise.all([
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/v1/investigations`),
        fetch(`${API}/v1/ops/events`),
      ]);
      const cd = cRes.ok ? await cRes.json() : {};
      const id = iRes.ok ? await iRes.json() : {};
      const od = oRes.ok ? await oRes.json() : {};

      const contacts = cd.items || cd.data || cd.contacts || [];
      const investigations = id.items || id.data || id.investigations || [];
      const opsEvents = od.items || od.data || od.events || [];

      const classified = contacts.map(c => ({
        ...c,
        ...matchContact(c, investigations, opsEvents),
      }));

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:cioet-toggle', handler);
    return () => window.removeEventListener('jarvis:cioet-toggle', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 60000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const counts = {
    ALL: rows.length,
    FULL_CONTEXT: rows.filter(r => r._class === 'FULL_CONTEXT').length,
    INV_ONLY: rows.filter(r => r._class === 'INV_ONLY').length,
    OPS_ONLY: rows.filter(r => r._class === 'OPS_ONLY').length,
    ISOLATED: rows.filter(r => r._class === 'ISOLATED').length,
  };

  const filtered = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || [r.name, r.email, r.organization, r.role]
      .filter(Boolean).some(v => v.toString().toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.FULL_CONTEXT} fully contextualized, ${counts.INV_ONLY} investigation-only, ${counts.OPS_ONLY} ops-only, ${counts.ISOLATED} isolated contacts with no operational context.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Contact operational context: ${summary} Provide a 2-sentence intelligence brief on isolated contacts and recommended action.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const classColor = {
    FULL_CONTEXT: '#00ff88',
    INV_ONLY: '#00bfff',
    OPS_ONLY: '#ffd700',
    ISOLATED: '#ff6600',
  };

  const sevColor = sev => ({ critical: '#ff4444', high: '#ff8800', medium: '#ffd700', low: '#888', info: '#00bfff' }[sev?.toLowerCase()] || '#888');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8220, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #ff6600',
          color: '#ff6600', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ CIOET
        {counts.ISOLATED > 0 && (
          <span style={{ background: '#ff6600', color: '#000', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
            {counts.ISOLATED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.93)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #1a2a3a',
        background: 'rgba(0,10,20,0.95)',
      }}>
        <div>
          <span style={{ color: '#ff6600', fontWeight: 700, fontSize: 16 }}>◈ CIOET</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Contact × Investigation × Ops Event Intelligence Triple
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing || loading}
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', color: '#00ff88', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
          </button>
          <button onClick={fetchData} disabled={loading}
            style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            ⟳
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: '1px solid #111', flexWrap: 'wrap' }}>
        {[
          { label: 'CONTACTS', val: counts.ALL, color: '#00bfff' },
          { label: 'FULL CONTEXT', val: counts.FULL_CONTEXT, color: '#00ff88' },
          { label: 'INV ONLY', val: counts.INV_ONLY, color: '#00bfff' },
          { label: 'OPS ONLY', val: counts.OPS_ONLY, color: '#ffd700' },
          { label: 'ISOLATED', val: counts.ISOLATED, color: '#ff6600' },
        ].map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}44`, borderRadius: 6, padding: '8px 16px', minWidth: 100 }}>
            <div style={{ color: t.color, fontSize: 20, fontWeight: 700 }}>{loading ? '…' : t.val}</div>
            <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid #111', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? 'rgba(255,102,0,0.2)' : 'transparent',
              border: `1px solid ${tab === t ? '#ff6600' : '#333'}`,
              color: tab === t ? '#ff6600' : '#888',
              padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}>
            {t} {t !== 'ALL' && `(${counts[t] ?? 0})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
            color: '#e0e0e0', padding: '4px 10px', borderRadius: 4, fontSize: 11,
            marginLeft: 'auto', width: 200, outline: 'none',
          }}
        />
      </div>

      {/* brief */}
      {brief && (
        <div style={{ padding: '8px 20px', background: 'rgba(0,255,136,0.05)', borderBottom: '1px solid #0a3a0a', color: '#00ff88', fontSize: 12 }}>
          {brief}
        </div>
      )}

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
        {loading && <div style={{ color: '#666', padding: 20 }}>Loading…</div>}
        {err && <div style={{ color: '#ff4444', padding: 20 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', padding: 20 }}>No contacts match filter.</div>
        )}
        {filtered.map((c, i) => {
          const isExp = expanded === i;
          const cls = c._class || 'ISOLATED';
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                borderBottom: '1px solid #1a1a1a', padding: '10px 0',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: (classColor[cls] || '#888') + '22',
                  color: classColor[cls] || '#888',
                  border: `1px solid ${classColor[cls] || '#888'}`,
                  padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                  {cls}
                </span>
                <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600 }}>{c.name || c.id || 'Unknown'}</span>
                {c.organization && <span style={{ color: '#666', fontSize: 11 }}>· {c.organization}</span>}
                {c.role && <span style={{ color: '#555', fontSize: 11 }}>· {c.role}</span>}
                <span style={{ marginLeft: 'auto', color: '#444', fontSize: 10 }}>
                  {c.matchedInvs?.length || 0} inv / {c.matchedOps?.length || 0} ops
                </span>
              </div>

              {isExp && (
                <div style={{ marginTop: 10, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* investigations */}
                  {c.matchedInvs?.length > 0 ? (
                    <div>
                      <div style={{ color: '#00bfff', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>MATCHED INVESTIGATIONS</div>
                      {c.matchedInvs.map((inv, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ background: '#00bfff22', color: '#00bfff', border: '1px solid #00bfff', padding: '1px 6px', borderRadius: 8, fontSize: 10, whiteSpace: 'nowrap' }}>
                            {inv.status || 'open'}
                          </span>
                          <span style={{ color: '#ccc', fontSize: 12, flex: 1 }}>{inv.title || inv.id}</span>
                          <div style={{ width: 80, height: 4, background: '#1a1a2a', borderRadius: 2 }}>
                            <div style={{ width: `${Math.min(100, inv._score * 25)}%`, height: '100%', background: '#00bfff', borderRadius: 2 }} />
                          </div>
                          <span style={{ color: '#555', fontSize: 10, width: 24, textAlign: 'right' }}>{inv._score}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#444', fontSize: 11 }}>No matching investigations.</div>
                  )}

                  {/* ops events */}
                  {c.matchedOps?.length > 0 ? (
                    <div>
                      <div style={{ color: '#ffd700', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>MATCHED OPS EVENTS</div>
                      {c.matchedOps.map((ev, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ background: sevColor(ev.severity) + '22', color: sevColor(ev.severity), border: `1px solid ${sevColor(ev.severity)}`, padding: '1px 6px', borderRadius: 8, fontSize: 10, whiteSpace: 'nowrap' }}>
                            {ev.severity || 'info'}
                          </span>
                          <span style={{ color: '#ccc', fontSize: 12, flex: 1 }}>{ev.title || ev.message || ev.id}</span>
                          <div style={{ width: 80, height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                            <div style={{ width: `${Math.min(100, ev._score * 25)}%`, height: '100%', background: '#ffd700', borderRadius: 2 }} />
                          </div>
                          <span style={{ color: '#555', fontSize: 10, width: 24, textAlign: 'right' }}>{ev._score}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#444', fontSize: 11 }}>No matching ops events.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
