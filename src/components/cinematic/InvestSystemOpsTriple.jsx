import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ISOETRI_RE = /\b(isoetri|invest\w*\s+sys\w*\s+ops|invest\w*\s+ops\s+event|invest\w*\s+service\s+ops|unmonitored\s+invest\w*|invest\w*\s+ops\s+coverage|service\s+ops\s+invest\w*|monitored\s+invest\w*|invest\w*\s+ops\s+service|invest\w*\s+system\s+ops)\b/i;

export function isIsoetriQuery(t) { return ISOETRI_RE.test(t || ''); }

export async function buildIsoetriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [invR, svcR, opsR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);
  const invRaw = invR.value ?? {};
  const investments = Array.isArray(invRaw) ? invRaw : (invRaw.investments ?? invRaw.data ?? invRaw.results ?? []);
  const svcRaw = svcR.value ?? {};
  const services = Array.isArray(svcRaw) ? svcRaw : (svcRaw.services ?? svcRaw.data ?? svcRaw.results ?? []);
  const opsRaw = opsR.value ?? {};
  const events = Array.isArray(opsRaw) ? opsRaw : (opsRaw.events ?? opsRaw.data ?? opsRaw.results ?? []);

  const svcText = services.map(s => `${s.name ?? s.id ?? ''} ${s.status ?? ''}`.toLowerCase()).join(' ');
  const opsText = events.map(e => `${e.name ?? e.title ?? e.id ?? ''} ${e.description ?? ''} ${e.severity ?? ''}`.toLowerCase()).join(' ');

  let fully = 0, svcLinked = 0, opsFlagged = 0, unmonitored = 0;
  for (const inv of investments) {
    const text = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''} ${inv.tags ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasSvc = tokens.some(tok => svcText.includes(tok));
    const hasOps = tokens.some(tok => opsText.includes(tok));
    if (hasSvc && hasOps) fully++;
    else if (hasSvc) svcLinked++;
    else if (hasOps) opsFlagged++;
    else unmonitored++;
  }
  return `ISOETRI Investment × System Status × Ops Event: ${investments.length} investments assessed against ` +
    `${services.length} system services and ${events.length} ops events. ` +
    `FULLY MONITORED: ${fully} (service + ops event coverage). SVC-LINKED: ${svcLinked} (service found, no ops event). ` +
    `OPS-FLAGGED: ${opsFlagged} (ops event found, no service alignment). UNMONITORED: ${unmonitored} (no system or ops coverage — monitoring gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY MONITORED': '#fbbf24',
  'SVC-LINKED': '#22d3ee',
  'OPS-FLAGGED': '#f97316',
  UNMONITORED: '#6b7280',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreLeft(inv, services) {
  const text = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const svc of services) {
    const svcText = `${svc.name ?? svc.id ?? ''} ${svc.status ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => svcText.includes(tok));
    if (hits.length > 0) matched.push({ item: svc, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreRight(inv, events) {
  const text = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const ev of events) {
    const evText = `${ev.name ?? ev.title ?? ev.id ?? ''} ${ev.description ?? ''} ${ev.severity ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => evText.includes(tok));
    if (hits.length > 0) matched.push({ item: ev, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(inv, services, events) {
  const text = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const svcText = services.map(s => `${s.name ?? s.id ?? ''}`.toLowerCase()).join(' ');
  const opsText = events.map(e => `${e.name ?? e.title ?? e.id ?? ''} ${e.description ?? ''}`.toLowerCase()).join(' ');
  const hasSvc = tokens.some(tok => svcText.includes(tok));
  const hasOps = tokens.some(tok => opsText.includes(tok));
  if (hasSvc && hasOps) return 'FULLY MONITORED';
  if (hasSvc) return 'SVC-LINKED';
  if (hasOps) return 'OPS-FLAGGED';
  return 'UNMONITORED';
}

export default function InvestSystemOpsTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [services, setServices] = useState([]);
  const [events, setEvents] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [invR, svcR, opsR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const invRaw = invR.value ?? {};
      const invs = Array.isArray(invRaw) ? invRaw : (invRaw.investments ?? invRaw.data ?? invRaw.results ?? []);
      const svcRaw = svcR.value ?? {};
      const svcs = Array.isArray(svcRaw) ? svcRaw : (svcRaw.services ?? svcRaw.data ?? svcRaw.results ?? []);
      const opsRaw = opsR.value ?? {};
      const evts = Array.isArray(opsRaw) ? opsRaw : (opsRaw.events ?? opsRaw.data ?? opsRaw.results ?? []);
      setInvestments(invs);
      setServices(svcs);
      setEvents(evts);
      setRows(invs.map(inv => ({
        inv,
        state: correlate(inv, svcs, evts),
        leftMatched: scoreLeft(inv, svcs),
        rightMatched: scoreRight(inv, evts),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:isoetri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:isoetri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCount = rows.filter(r => r.state === 'FULLY MONITORED').length;
  const svcCount = rows.filter(r => r.state === 'SVC-LINKED').length;
  const opsCount = rows.filter(r => r.state === 'OPS-FLAGGED').length;
  const unmonitoredCount = rows.filter(r => r.state === 'UNMONITORED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.inv.name ?? r.inv.title ?? r.inv.id ?? ''} ${r.inv.ticker ?? ''} ${r.inv.category ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.inv.name ?? row.inv.title ?? row.inv.id ?? 'investment';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const svcNames = row.leftMatched.slice(0, 2).map(m => m.item.name ?? m.item.id ?? '?').join(', ');
      const opsNames = row.rightMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY MONITORED'
        ? `has both system service coverage (${svcNames || 'found'}) and ops event triggers (${opsNames || 'found'})`
        : row.state === 'SVC-LINKED'
          ? `has system service alignment (${svcNames || 'found'}) but no ops event coverage`
          : row.state === 'OPS-FLAGGED'
            ? `has ops event triggers (${opsNames || 'found'}) but no system service alignment`
            : 'has NO system service or ops event coverage — monitoring gap';
      const prompt = `Investment "${id}" ${stateDesc}. In exactly 2 sentences, assess the operational monitoring coverage for this investment.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 783760, bottom: 8, zIndex: 428,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(251,191,36,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#fbbf24', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ ISOETRI — INVESTMENT × SYSTEM STATUS × OPS EVENT</span>
        {unmonitoredCount > 0 && (
          <span style={{ background: '#6b7280', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unmonitoredCount} UNMONITORED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Investments', val: investments.length },
          { label: 'Fully Monitored', val: fullyCount, color: '#fbbf24' },
          { label: 'Svc-Linked', val: svcCount, color: '#22d3ee' },
          { label: 'Ops-Flagged', val: opsCount, color: '#f97316' },
          { label: 'Unmonitored', val: unmonitoredCount, color: '#6b7280' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyCount / rows.length) * 100)}%`, background: '#fbbf24', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCount / rows.length) * 100) : 0}% fully monitored · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY MONITORED', 'SVC-LINKED', 'OPS-FLAGGED', 'UNMONITORED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#fbbf24') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? '#000' : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no investments match</div>
        )}
        {visible.map((row, i) => {
          const id = row.inv.name ?? row.inv.title ?? row.inv.id ?? `inv-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.inv.ticker && (
                  <span style={{ fontSize: 10, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.inv.ticker}</span>
                )}
                {row.inv.category && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.inv.category}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, color: '#fbbf24', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: System services */}
                    <div>
                      <div style={{ fontSize: 10, color: '#22d3ee', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>SYSTEM SERVICES ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no service matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.id ?? `svc-${mi}`;
                        const status = m.item.status ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#67e8f9' }}>{n}</span>
                              {status && (
                                <span style={{ fontSize: 9, color: status === 'ok' || status === 'healthy' ? '#4ade80' : '#f87171', background: 'rgba(255,255,255,0.07)', borderRadius: 3, padding: '1px 4px' }}>{status}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#22d3ee', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#22d3ee', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Ops events */}
                    <div>
                      <div style={{ fontSize: 10, color: '#f97316', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>OPS EVENTS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no ops event matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `ev-${mi}`;
                        const sev = m.item.severity ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fdba74' }}>{n}</span>
                              {sev && (
                                <span style={{ fontSize: 9, color: '#f97316', background: 'rgba(249,115,22,0.12)', borderRadius: 3, padding: '1px 4px' }}>{sev}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#f97316', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#f97316', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
