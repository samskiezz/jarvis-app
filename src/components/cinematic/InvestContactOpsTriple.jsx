import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IVCOE_RE = /\b(ivcoe|invest(?:ment)?\s+contact\s+ops|contact\s+invest(?:ment)?\s+ops|invest(?:ment)?\s+ops\s+contact|ops\s+invest(?:ment)?\s+contact|contact\s+ops\s+invest(?:ment)?|ops\s+contact\s+invest(?:ment)?|alarmed\s+invest(?:ment)?|invest(?:ment)?\s+ops\s+event|invest(?:ment)?\s+contact\s+ops\s+event|invest(?:ment)?\s+personnel\s+ops|invest(?:ment)?\s+ops\s+personnel|portfolio\s+contact\s+ops|portfolio\s+ops\s+event|invest(?:ment)?\s+flagged\s+ops|invest(?:ment)?\s+live\s+trigger)\b/i;

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseInvestments(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investments) ? data.investments
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: i.name || i.label || i.title || 'Unnamed Investment',
    description: i.description || i.summary || i.notes || '',
    category: i.category || i.sector || i.type || '',
    ticker: i.ticker || i.symbol || i.code || '',
    tags: Array.isArray(i.tags) ? i.tags.join(' ') : String(i.tags || ''),
    raw: i,
  }));
}

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.contacts) ? data.contacts
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: c.name || c.full_name || c.label || 'Unnamed Contact',
    email: c.email || '',
    company: c.company || c.organisation || c.organization || '',
    title: c.title || c.role || c.position || '',
    description: c.description || c.bio || c.summary || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.ops_events) ? data.ops_events
    : Array.isArray(data.alerts) ? data.alerts
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || String(Math.random()),
    name: e.name || e.title || e.label || e.event || 'Unnamed Event',
    type: e.type || e.kind || e.category || '',
    severity: e.severity || e.level || e.priority || '',
    description: e.description || e.summary || e.details || e.message || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function correlate(investments, contacts, opsEvents) {
  return investments.map(inv => {
    const toks = tok([
      inv.name, inv.description, inv.category, inv.ticker, inv.tags,
    ].join(' '));

    const matchedContacts = contacts
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.company),
          matchScore(toks, c.title),
          matchScore(toks, c.description),
          matchScore(toks, c.tags),
        );
        return { ...c, score };
      })
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedOps = opsEvents
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.type),
          matchScore(toks, e.description),
          matchScore(toks, e.tags),
        );
        return { ...e, score };
      })
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasContact = matchedContacts.length > 0;
    const hasOps = matchedOps.length > 0;

    let state;
    if (hasContact && hasOps) state = 'FULLY ALARMED';
    else if (hasContact) state = 'CONTACT-LINKED';
    else if (hasOps) state = 'OPS-FLAGGED';
    else state = 'CLEAR';

    return { inv, matchedContacts, matchedOps, state };
  });
}

export function isIvcoeQuery(t) {
  return IVCOE_RE.test(t || '');
}

export async function buildIvcoeScript() {
  try {
    const [invRes, conRes, opsRes] = await Promise.allSettled([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : null),
    ]);

    const investments = normaliseInvestments(invRes.status === 'fulfilled' ? invRes.value : null);
    const contacts = normaliseContacts(conRes.status === 'fulfilled' ? conRes.value : null);
    const opsEvents = normaliseOpsEvents(opsRes.status === 'fulfilled' ? opsRes.value : null);
    const rows = correlate(investments, contacts, opsEvents);

    const alarmed = rows.filter(r => r.state === 'FULLY ALARMED').length;
    const contactLinked = rows.filter(r => r.state === 'CONTACT-LINKED').length;
    const opsFlagged = rows.filter(r => r.state === 'OPS-FLAGGED').length;
    const clear = rows.filter(r => r.state === 'CLEAR').length;

    return `IVCOE Investment×Contact×OpsEvent: ${investments.length} investments correlated against ${contacts.length} contacts and ${opsEvents.length} ops events. ` +
      `${alarmed} FULLY ALARMED (contact+ops — both personnel link and live operational trigger), ` +
      `${contactLinked} CONTACT-LINKED (personnel only, no live trigger), ` +
      `${opsFlagged} OPS-FLAGGED (live trigger, no personnel link), ` +
      `${clear} CLEAR (no contact or ops event coverage). ` +
      (alarmed > 0
        ? `${alarmed} investments have both personnel and live operational event alignment — attention required.`
        : opsFlagged > 0
        ? `${opsFlagged} investments have live ops triggers but no personnel link — assign contacts.`
        : 'Investment operational coverage nominal.');
  } catch {
    return 'IVCOE: data fetch failed.';
  }
}

const STATE_COLOUR = {
  'FULLY ALARMED': '#ffb300',
  'CONTACT-LINKED': '#4fc3f7',
  'OPS-FLAGGED': '#ff7043',
  'CLEAR': '#37474f',
};

export default function InvestContactOpsTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:ivcoe-toggle', handler);
    return () => window.removeEventListener('jarvis:ivcoe-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [invRes, conRes, opsRes] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const investments = normaliseInvestments(invRes.status === 'fulfilled' ? invRes.value : null);
      const contacts = normaliseContacts(conRes.status === 'fulfilled' ? conRes.value : null);
      const opsEvents = normaliseOpsEvents(opsRes.status === 'fulfilled' ? opsRes.value : null);

      if (!investments.length && !contacts.length && !opsEvents.length) {
        setErr('No data from Investment, Contact, or ops/events endpoints.');
      }

      setRows(correlate(investments, contacts, opsEvents));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const alarmed = rows.filter(r => r.state === 'FULLY ALARMED').length;
  const contactLinked = rows.filter(r => r.state === 'CONTACT-LINKED').length;
  const opsFlagged = rows.filter(r => r.state === 'OPS-FLAGGED').length;
  const clear = rows.filter(r => r.state === 'CLEAR').length;

  const TABS = ['ALL', 'FULLY ALARMED', 'CONTACT-LINKED', 'OPS-FLAGGED', 'CLEAR'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.inv.name.toLowerCase().includes(q) ||
        r.matchedContacts.some(c => c.name.toLowerCase().includes(q)) ||
        r.matchedOps.some(e => e.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    alarmed: (alarmed / total) * 100,
    contact: (contactLinked / total) * 100,
    ops: (opsFlagged / total) * 100,
    clear: (clear / total) * 100,
  } : { alarmed: 0, contact: 0, ops: 0, clear: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Investment "${row.inv.name}" [${row.inv.category || ''}] coverage state: ${row.state}. ` +
      `Matched contacts: ${row.matchedContacts.map(c => c.name).join(', ') || 'none'}. ` +
      `Matched ops events: ${row.matchedOps.map(e => e.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence investment personnel and operational event coverage brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 818480,
          bottom: 8,
          zIndex: 490,
          background: 'rgba(0,8,20,0.85)',
          border: `1px solid ${alarmed > 0 ? '#ffb30080' : '#1a3050'}`,
          color: alarmed > 0 ? '#ffb300' : '#2a6090',
          padding: '3px 7px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >
        ◈ IVCOE{alarmed > 0 ? ` [${alarmed}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      left: 20,
      top: 60,
      width: 660,
      maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(0,8,20,0.97)',
      border: '1px solid #1a3050',
      borderRadius: 8,
      zIndex: 9900,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1a3050',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ color: '#ffb300', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ IVCOE</span>
        <span style={{ color: '#4a6fa0', fontSize: 10, flex: 1 }}>Investment × Contact × Ops Event Triple Coverage</span>
        {loading && <span style={{ color: '#00e5ff', fontSize: 9 }}>LOADING…</span>}
        {lastRefresh && !loading && (
          <span style={{ color: '#2a4060', fontSize: 9 }}>{lastRefresh.toLocaleTimeString()}</span>
        )}
        <button
          onClick={load}
          disabled={loading}
          style={{ background: 'none', border: '1px solid #1a3050', color: '#2a6090', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 9 }}
        >↺</button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#2a4060', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
        >✕</button>
      </div>

      {err && (
        <div style={{ padding: '6px 14px', background: '#f4433612', color: '#f44336', fontSize: 10 }}>{err}</div>
      )}

      {/* Stat tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        padding: '8px 14px',
        borderBottom: '1px solid #1a3050',
        flexShrink: 0,
      }}>
        {[
          { label: 'INVEST', val: rows.length, col: '#ffb300' },
          { label: 'CONTACTS', val: rows.reduce((a, r) => a + r.matchedContacts.length, 0), col: '#4fc3f7' },
          { label: 'OPS-EVT', val: rows.reduce((a, r) => a + r.matchedOps.length, 0), col: '#ff7043' },
          { label: 'ALARMED', val: alarmed, col: alarmed > 0 ? '#ffb300' : '#37474f' },
          { label: 'CONT-LNK', val: contactLinked, col: '#4fc3f7' },
          { label: 'OPS-FLG', val: opsFlagged, col: '#ff7043' },
          { label: 'CLEAR', val: clear, col: '#37474f' },
        ].map(t => (
          <div key={t.label} style={{ textAlign: 'center' }}>
            <div style={{ color: t.col, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#2a4060', fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ height: 4, display: 'flex', flexShrink: 0, margin: '0 14px 8px' }}>
        <div style={{ width: `${cbw.alarmed}%`, background: '#ffb300', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.contact}%`, background: '#4fc3f7', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.ops}%`, background: '#ff7043', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.clear}%`, background: '#37474f80', transition: 'width 0.4s' }} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: '0 14px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? `${STATE_COLOUR[tab] || '#00e5ff'}22` : 'none',
              border: `1px solid ${filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#1a3050'}`,
              color: filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#2a6090',
              padding: '2px 7px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 9,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,20,40,0.6)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 7px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            width: 110,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', fontSize: 11, padding: '20px 14px', textAlign: 'center' }}>
            No investments match current filter.
          </div>
        )}
        {visible.map(row => (
          <div
            key={row.inv.id}
            style={{
              borderBottom: '1px solid #0d1e30',
              background: expanded === row.inv.id ? 'rgba(0,20,40,0.4)' : 'transparent',
            }}
          >
            <div
              onClick={() => setExpanded(expanded === row.inv.id ? null : row.inv.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer' }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 110,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.inv.name}
              </span>
              {row.inv.category && (
                <span style={{ color: '#4a6fa0', fontSize: 9, background: '#ffb30022', borderRadius: 2, padding: '0 4px' }}>
                  {row.inv.category}
                </span>
              )}
              {row.inv.ticker && (
                <span style={{ color: '#ffb300', fontSize: 9 }}>{row.inv.ticker}</span>
              )}
              <span style={{ color: '#4fc3f7', fontSize: 9 }}>{row.matchedContacts.length}C</span>
              <span style={{ color: '#ff7043', fontSize: 9 }}>{row.matchedOps.length}O</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(255,179,0,0.12)',
                  border: '1px solid #ffb30055',
                  color: '#ffb300',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.inv.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.inv.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Contacts */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#4fc3f7', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    CONTACTS ({row.matchedContacts.length})
                  </div>
                  {row.matchedContacts.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No contact match — personnel gap</div>
                  ) : row.matchedContacts.slice(0, 5).map(c => (
                    <div key={c.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{c.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.title && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#4fc3f722', borderRadius: 2, padding: '0 3px' }}>
                            {c.title}
                          </span>
                        )}
                        {c.company && (
                          <span style={{ color: '#4a6fa0', fontSize: 9 }}>{c.company}</span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(c.score * 100)}%`, background: '#4fc3f7', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Ops Events */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#ff7043', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    OPS EVENTS ({row.matchedOps.length})
                  </div>
                  {row.matchedOps.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No ops event match — no live trigger</div>
                  ) : row.matchedOps.slice(0, 5).map(e => (
                    <div key={e.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{e.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {e.type && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#ff704322', borderRadius: 2, padding: '0 3px' }}>
                            {e.type}
                          </span>
                        )}
                        {e.severity && (
                          <span style={{ color: '#ff7043', fontSize: 9, background: '#ff704311', borderRadius: 2, padding: '0 3px' }}>
                            {e.severity}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(e.score * 100)}%`, background: '#ff7043', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Investment footer */}
                {(row.inv.description || row.inv.ticker) && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {row.inv.ticker && (
                      <span style={{ color: '#4a6fa0', fontSize: 9 }}>TICKER: <span style={{ color: '#ffb300' }}>{row.inv.ticker}</span></span>
                    )}
                    {row.inv.description && (
                      <span style={{ color: '#4a6fa0', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.inv.description.slice(0, 120)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
