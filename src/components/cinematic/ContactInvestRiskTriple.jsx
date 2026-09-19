import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CIRSKTRI_RE = /\b(cirsktri|contact\s+invest(?:ment)?\s+risk|contact\s+risk\s+invest|contact\s+risk\s+signal|fully\s+exposed\s+contact|contact\s+risk\s+exposure|invest\s+risk\s+contact|contact\s+financial\s+risk|contact\s+invest\s+risk\s+signal|contact\s+risk\s+invest\s+signal|contact\s+investment\s+risk\s+triple|contact\s+exposure\s+risk|financial\s+risk\s+contact)\b/i;

export function isCirsktriQuery(t) { return CIRSKTRI_RE.test(t || ''); }

export async function buildCirsktriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [cR, iR, rsR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
  ]);
  const cRaw = cR.value ?? {};
  const contacts = Array.isArray(cRaw) ? cRaw : (cRaw.contacts ?? cRaw.data ?? cRaw.results ?? []);
  const iRaw = iR.value ?? {};
  const investments = Array.isArray(iRaw) ? iRaw : (iRaw.investments ?? iRaw.data ?? iRaw.results ?? []);
  const rsRaw = rsR.value ?? {};
  const risks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);

  const invText = investments.map(i =>
    `${i.name ?? i.id ?? ''} ${i.description ?? ''} ${i.category ?? ''} ${i.ticker ?? ''}`.toLowerCase()
  ).join(' ');
  const riskText = risks.map(r =>
    `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()
  ).join(' ');

  let fullyExposed = 0, invested = 0, flagged = 0, clear = 0;
  for (const c of contacts) {
    const text = `${c.name ?? c.id ?? ''} ${c.email ?? ''} ${c.company ?? ''} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasInv = tokens.some(tok => invText.includes(tok));
    const hasRisk = tokens.some(tok => riskText.includes(tok));
    if (hasInv && hasRisk) fullyExposed++;
    else if (hasInv) invested++;
    else if (hasRisk) flagged++;
    else clear++;
  }
  return `CIRSKTRI Contact × Investment × Risk Signal: ${contacts.length} contacts assessed against ` +
    `${investments.length} investments and ${risks.length} risk signals. ` +
    `FULLY EXPOSED: ${fullyExposed} (investment match + risk signal — financial exposure with active risk). ` +
    `INVESTED: ${invested} (financially linked, no risk flag). ` +
    `FLAGGED: ${flagged} (risk-flagged, no investment exposure). ` +
    `CLEAR: ${clear} (no investment or risk coverage).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY EXPOSED': '#ef4444',
  INVESTED: '#f59e0b',
  FLAGGED: '#f97316',
  CLEAR: '#4ade80',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreInvestments(contact, investments) {
  const text = `${contact.name ?? contact.id ?? ''} ${contact.email ?? ''} ${contact.company ?? ''} ${contact.title ?? ''} ${contact.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const inv of investments) {
    const iText = `${inv.name ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => iText.includes(tok));
    if (hits.length > 0) matched.push({ item: inv, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreRiskSignals(contact, risks) {
  const text = `${contact.name ?? contact.id ?? ''} ${contact.email ?? ''} ${contact.company ?? ''} ${contact.title ?? ''} ${contact.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const r of risks) {
    const rText = `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => rText.includes(tok));
    if (hits.length > 0) matched.push({ item: r, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(contact, investments, risks) {
  const text = `${contact.name ?? contact.id ?? ''} ${contact.email ?? ''} ${contact.company ?? ''} ${contact.title ?? ''} ${contact.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const invText = investments.map(i => `${i.name ?? i.id ?? ''} ${i.description ?? ''} ${i.category ?? ''} ${i.ticker ?? ''}`.toLowerCase()).join(' ');
  const riskText = risks.map(r => `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()).join(' ');
  const hasInv = tokens.some(tok => invText.includes(tok));
  const hasRisk = tokens.some(tok => riskText.includes(tok));
  if (hasInv && hasRisk) return 'FULLY EXPOSED';
  if (hasInv) return 'INVESTED';
  if (hasRisk) return 'FLAGGED';
  return 'CLEAR';
}

export default function ContactInvestRiskTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [risks, setRisks] = useState([]);
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
      const [cR, iR, rsR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
      ]);
      const cRaw = cR.value ?? {};
      const cts = Array.isArray(cRaw) ? cRaw : (cRaw.contacts ?? cRaw.data ?? cRaw.results ?? []);
      const iRaw = iR.value ?? {};
      const invs = Array.isArray(iRaw) ? iRaw : (iRaw.investments ?? iRaw.data ?? iRaw.results ?? []);
      const rsRaw = rsR.value ?? {};
      const rks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);
      setContacts(cts);
      setInvestments(invs);
      setRisks(rks);
      setRows(cts.map(c => ({
        c,
        state: correlate(c, invs, rks),
        leftMatched: scoreInvestments(c, invs),
        rightMatched: scoreRiskSignals(c, rks),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:cirsktri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:cirsktri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyExposedCount = rows.filter(r => r.state === 'FULLY EXPOSED').length;
  const investedCount = rows.filter(r => r.state === 'INVESTED').length;
  const flaggedCount = rows.filter(r => r.state === 'FLAGGED').length;
  const clearCount = rows.filter(r => r.state === 'CLEAR').length;

  const visible = rows.filter(row => {
    if (filter !== 'ALL' && row.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${row.c.name ?? row.c.id ?? ''} ${row.c.email ?? ''} ${row.c.company ?? ''} ${row.c.title ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.c.name ?? row.c.email ?? row.c.id ?? 'contact';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const invNames = row.leftMatched.slice(0, 2).map(m => m.item.name ?? m.item.id ?? '?').join(', ');
      const riskNames = row.rightMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY EXPOSED'
        ? `has investment exposure (${invNames || 'found'}) AND active risk signals (${riskNames || 'found'}) — fully exposed`
        : row.state === 'INVESTED'
          ? `has investment exposure (${invNames || 'found'}) but no active risk signals`
          : row.state === 'FLAGGED'
            ? `has active risk signals (${riskNames || 'found'}) but no investment exposure`
            : 'has no investment exposure or active risk signals — clear';
      const prompt = `Contact "${id}" ${stateDesc}. In exactly 2 sentences, assess the financial risk exposure status of this contact.`;
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
      position: 'fixed', left: 791040, bottom: 8, zIndex: 441,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(239,68,68,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#ef4444', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ CIRSKTRI — CONTACT × INVESTMENT × RISK SIGNAL</span>
        {fullyExposedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{fullyExposedCount} EXPOSED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Contacts', val: contacts.length },
          { label: 'Fully Exposed', val: fullyExposedCount, color: '#ef4444' },
          { label: 'Invested', val: investedCount, color: '#f59e0b' },
          { label: 'Flagged', val: flaggedCount, color: '#f97316' },
          { label: 'Clear', val: clearCount, color: '#4ade80' },
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
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyExposedCount / rows.length) * 100)}%`, background: '#ef4444', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((investedCount / rows.length) * 100)}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((flaggedCount / rows.length) * 100)}%`, background: '#f97316', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((clearCount / rows.length) * 100) : 0}% clear · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY EXPOSED', 'INVESTED', 'FLAGGED', 'CLEAR'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'FULLY EXPOSED' ? '#fff' : '#000') : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no contacts match</div>
        )}
        {visible.map((row, i) => {
          const id = row.c.name ?? row.c.email ?? row.c.id ?? `contact-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.c.company && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.c.company}</span>
                )}
                {row.c.title && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.c.title}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: '#ef4444', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: Investments */}
                    <div>
                      <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>INVESTMENTS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no investment matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.id ?? `inv-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fcd34d' }}>{n}</span>
                              {m.item.category && (
                                <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#f59e0b', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Risk Signals */}
                    <div>
                      <div style={{ fontSize: 10, color: '#f87171', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>RISK SIGNALS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no risk signal matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `risk-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fca5a5' }}>{n}</span>
                              {m.item.severity && (
                                <span style={{ fontSize: 9, color: '#ef4444', background: 'rgba(239,68,68,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.severity}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#ef4444', borderRadius: 2 }} />
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
