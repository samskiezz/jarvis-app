import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CIRSK_RE = /\b(cirsk|contact\s+investigation\s+risk|contact\s+case\s+risk|contact\s+risk\s+investigation|fully\s+flagged\s+contact|contact\s+threat\s+case|flagged\s+contact|contact\s+case\s+signal|contact\s+risk\s+case|case\s+risk\s+contact|contact\s+risk\s+signal\s+investigation|investigation\s+risk\s+contact)\b/i;

export function isCirskQuery(t) { return CIRSK_RE.test(t || ''); }

function normContacts(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.contacts ?? raw.data ?? raw.results ?? raw.items ?? []).slice(0, 80);
}

function normInvs(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.investigations ?? raw.cases ?? raw.data ?? raw.results ?? raw.items ?? []).slice(0, 80);
}

function normRisks(raw) {
  if (Array.isArray(raw)) return raw.slice(0, 80);
  return (raw.risk_signals ?? raw.risks ?? raw.signals ?? raw.data ?? raw.results ?? raw.items ?? []).slice(0, 80);
}

function contactKw(c) {
  return [c.name, c.email, c.company, c.organisation, c.org, c.title, c.role, c.description, c.tags]
    .flat().filter(Boolean).join(' ').toLowerCase();
}

function invKw(i) {
  return [i.title, i.name, i.description, i.subject, i.kind, i.type, i.tags, i.status]
    .flat().filter(Boolean).join(' ').toLowerCase();
}

function riskKw(r) {
  return [r.title, r.name, r.description, r.category, r.type, r.source, r.severity, r.tags]
    .flat().filter(Boolean).join(' ').toLowerCase();
}

function score(ckw, other) {
  const words = ckw.split(/\s+/).filter(w => w.length > 3);
  if (!words.length) return 0;
  let hits = 0;
  words.forEach(w => { if (other.includes(w)) hits++; });
  return hits / words.length;
}

function classify(contact, invs, risks) {
  const ckw = contactKw(contact);
  const matchedInvs = invs.filter(i => score(ckw, invKw(i)) > 0.08 || score(invKw(i), ckw) > 0.08);
  const matchedRisks = risks.filter(r => score(ckw, riskKw(r)) > 0.08 || score(riskKw(r), ckw) > 0.08);
  const hasInv = matchedInvs.length > 0;
  const hasRisk = matchedRisks.length > 0;
  const state = hasInv && hasRisk ? 'FULLY FLAGGED'
    : hasInv ? 'INVESTIGATED'
    : hasRisk ? 'RISK-FLAGGED'
    : 'CLEAR';
  return { ...contact, state, matchedInvs, matchedRisks,
    invScore: matchedInvs.length ? Math.max(...matchedInvs.map(i => score(ckw, invKw(i)))) : 0,
    riskScore: matchedRisks.length ? Math.max(...matchedRisks.map(r => score(ckw, riskKw(r)))) : 0,
  };
}

export async function buildCirskScript() {
  try {
    const [cr, ir, rr] = await Promise.allSettled([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normContacts(cr.status === 'fulfilled' ? cr.value : []);
    const invs = normInvs(ir.status === 'fulfilled' ? ir.value : []);
    const risks = normRisks(rr.status === 'fulfilled' ? rr.value : []);
    const rows = contacts.map(c => classify(c, invs, risks));
    const flagged = rows.filter(r => r.state === 'FULLY FLAGGED').length;
    const investigated = rows.filter(r => r.state === 'INVESTIGATED').length;
    const riskFlagged = rows.filter(r => r.state === 'RISK-FLAGGED').length;
    const clear = rows.filter(r => r.state === 'CLEAR').length;
    const top = rows.filter(r => r.state === 'FULLY FLAGGED').slice(0, 2).map(r => r.name || r.email || 'unknown');
    return `CIRSK Coverage: ${contacts.length} contacts × ${invs.length} investigations × ${risks.length} risk signals. ` +
      `FULLY FLAGGED: ${flagged} — both an open investigation and an active risk signal. ` +
      `INVESTIGATED: ${investigated}. RISK-FLAGGED: ${riskFlagged}. CLEAR: ${clear}. ` +
      (top.length ? `Priority contacts: ${top.join(', ')}.` : 'No fully flagged contacts detected.');
  } catch {
    return 'CIRSK: Unable to fetch contact-investigation-risk coverage data.';
  }
}

const STATE_COLOR = {
  'FULLY FLAGGED': '#ef4444',
  'INVESTIGATED': '#a78bfa',
  'RISK-FLAGGED': '#f97316',
  'CLEAR': '#6b7280',
};

const TABS = ['ALL', 'FULLY FLAGGED', 'INVESTIGATED', 'RISK-FLAGGED', 'CLEAR'];

export default function ContactInvestigationRiskTriple() {
  const [visible, setVisible] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [invs, setInvs] = useState([]);
  const [risks, setRisks] = useState([]);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, ir, rr] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      ]);
      const c = normContacts(cr.status === 'fulfilled' ? cr.value : []);
      const i = normInvs(ir.status === 'fulfilled' ? ir.value : []);
      const r = normRisks(rr.status === 'fulfilled' ? rr.value : []);
      setContacts(c); setInvs(i); setRisks(r);
      setRows(c.map(x => classify(x, i, r)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setVisible(v => { if (!v) load(); return !v; });
    window.addEventListener('jarvis:cirsk-toggle', toggle);
    return () => window.removeEventListener('jarvis:cirsk-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!visible) return;
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [visible, load]);

  const filtered = rows.filter(r =>
    (tab === 'ALL' || r.state === tab) &&
    (!search || contactKw(r).includes(search.toLowerCase()))
  );

  const flagged = rows.filter(r => r.state === 'FULLY FLAGGED').length;
  const investigated = rows.filter(r => r.state === 'INVESTIGATED').length;
  const riskFlagged = rows.filter(r => r.state === 'RISK-FLAGGED').length;
  const clear = rows.filter(r => r.state === 'CLEAR').length;

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `CIRSK contact-investigation-risk triple coverage: ${rows.length} contacts, ${flagged} fully flagged (open case + active risk signal), ${investigated} investigated-only, ${riskFlagged} risk-flagged-only, ${clear} clear. Identify the two highest-priority flagged contacts and recommended action. Two sentences.` }),
      });
      const d = await res.json();
      const text = d.response ?? d.content ?? d.message ?? d.text ?? JSON.stringify(d);
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { setBrief('Assessment unavailable.'); }
    setAssessing(false);
  }, [rows, flagged, investigated, riskFlagged, clear]);

  if (!visible) return null;

  const panelStyle = {
    position: 'fixed', left: 798320, bottom: 8, zIndex: 454, width: 560,
    background: 'rgba(0,0,0,0.92)', border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
    color: '#e2e8f0', backdropFilter: 'blur(12px)', userSelect: 'none',
  };

  const badgeStyle = { background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 9, marginLeft: 6 };

  return (
    <div style={panelStyle}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#ef4444', letterSpacing: 2, fontSize: 9 }}>◈ CIRSK</span>
        <span style={{ color: '#94a3b8', fontSize: 9 }}>CONTACT × INVESTIGATION × RISK SIGNAL</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {flagged > 0 && <span style={badgeStyle}>{flagged} FULLY FLAGGED</span>}
          <span style={{ cursor: 'pointer', color: '#64748b', fontSize: 11 }} onClick={() => setVisible(false)}>✕</span>
        </div>
      </div>

      <div style={{ padding: '5px 10px', borderBottom: '1px solid rgba(239,68,68,0.15)', display: 'flex', gap: 10 }}>
        {[
          { label: 'CONTACTS', val: contacts.length, col: '#94a3b8' },
          { label: 'INVESTS', val: invs.length, col: '#a78bfa' },
          { label: 'RISKS', val: risks.length, col: '#f97316' },
          { label: 'FLAGGED', val: flagged, col: '#ef4444' },
          { label: 'INVESTD', val: investigated, col: '#a78bfa' },
          { label: 'RISK-FLG', val: riskFlagged, col: '#f97316' },
          { label: 'CLEAR', val: clear, col: '#6b7280' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 11 }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 7.5, letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ padding: '4px 10px', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
            {flagged > 0 && <div style={{ width: `${(flagged / rows.length) * 100}%`, background: '#ef4444' }} />}
            {investigated > 0 && <div style={{ width: `${(investigated / rows.length) * 100}%`, background: '#a78bfa' }} />}
            {riskFlagged > 0 && <div style={{ width: `${(riskFlagged / rows.length) * 100}%`, background: '#f97316' }} />}
          </div>
        </div>
      )}

      <div style={{ padding: '4px 10px', borderBottom: '1px solid rgba(239,68,68,0.1)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(239,68,68,0.2)' : 'transparent',
            border: `1px solid ${tab === t ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: tab === t ? '#ef4444' : '#64748b', borderRadius: 3, padding: '2px 6px', fontSize: 8, cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', borderRadius: 3, padding: '2px 6px', fontSize: 8, width: 110 }}
        />
      </div>

      <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 6px' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 12, fontSize: 9 }}>◌ LOADING…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: '#475569', textAlign: 'center', padding: 12, fontSize: 9 }}>NO CONTACTS MATCH</div>}
        {filtered.map((row, i) => {
          const isExp = expanded === i;
          const col = STATE_COLOR[row.state] ?? '#64748b';
          return (
            <div key={i} style={{ marginBottom: 2 }}>
              <div onClick={() => setExpanded(isExp ? null : i)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 3, cursor: 'pointer', background: isExp ? 'rgba(239,68,68,0.08)' : 'transparent' }}>
                <span style={{ color: col, fontSize: 8, fontWeight: 700, minWidth: 80 }}>{row.state}</span>
                <span style={{ color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || row.email || 'unknown'}</span>
                <span style={{ color: '#475569', fontSize: 8 }}>{row.company || row.org || ''}</span>
                <span style={{ color: '#334155', fontSize: 9 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ display: 'flex', gap: 6, padding: '4px 6px 6px 6px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a78bfa', fontSize: 7.5, marginBottom: 3, letterSpacing: 1 }}>INVESTIGATIONS ({row.matchedInvs.length})</div>
                    {row.matchedInvs.length === 0
                      ? <div style={{ color: '#334155', fontSize: 8 }}>no case linkage</div>
                      : row.matchedInvs.slice(0, 4).map((inv, j) => {
                          const sc = Math.min(1, score(contactKw(row), invKw(inv)) * 5);
                          return (
                            <div key={j} style={{ marginBottom: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                                <span style={{ color: '#c4b5fd', fontSize: 8, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.title || inv.name || inv.subject || 'investigation'}</span>
                                <span style={{ color: '#6d28d9', fontSize: 7 }}>{inv.status || inv.kind || ''}</span>
                              </div>
                              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                                <div style={{ width: `${sc * 100}%`, height: '100%', background: '#7c3aed' }} />
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f97316', fontSize: 7.5, marginBottom: 3, letterSpacing: 1 }}>RISK SIGNALS ({row.matchedRisks.length})</div>
                    {row.matchedRisks.length === 0
                      ? <div style={{ color: '#334155', fontSize: 8 }}>no risk signal</div>
                      : row.matchedRisks.slice(0, 4).map((rsk, j) => {
                          const sc = Math.min(1, score(contactKw(row), riskKw(rsk)) * 5);
                          return (
                            <div key={j} style={{ marginBottom: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                                <span style={{ color: '#fdba74', fontSize: 8, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rsk.title || rsk.name || 'risk signal'}</span>
                                <span style={{ color: '#c2410c', fontSize: 7 }}>{rsk.severity || rsk.category || ''}</span>
                              </div>
                              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                                <div style={{ width: `${sc * 100}%`, height: '100%', background: '#ea580c' }} />
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '5px 10px', borderTop: '1px solid rgba(239,68,68,0.15)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
          border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444',
          borderRadius: 3, padding: '3px 8px', fontSize: 8, cursor: assessing ? 'wait' : 'pointer', letterSpacing: 1,
        }}>{assessing ? '◌ ASSESSING…' : '⚑ ASSESS'}</button>
        {brief && <div style={{ flex: 1, color: '#94a3b8', fontSize: 8, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
