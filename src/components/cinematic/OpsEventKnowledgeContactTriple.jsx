import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const OEKCTRI_RE = /\b(oekctri|ops\s+knowledge\s+contact|ops\s+context\s+triple|ops\s+event\s+contact\s+triple|ops\s+event\s+knowledge\s+contact|knowledge\s+contact\s+ops|contact\s+ops\s+knowledge|ops\s+kb\s+contact|blind\s+ops\s+event|ops\s+event\s+coverage\s+triple)\b/i;

export function isOekctriQuery(t) { return OEKCTRI_RE.test(t || ''); }

export async function buildOekctriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [oeR, kbR, ctR] = await Promise.allSettled([
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
  ]);
  const ops = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);
  const kb = Array.isArray(kbR.value) ? kbR.value : (kbR.value?.articles ?? kbR.value?.items ?? kbR.value?.data ?? []);
  const contacts = Array.isArray(ctR.value) ? ctR.value : (ctR.value?.contacts ?? ctR.value?.data ?? []);

  const kbText = kb.map(a => `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? ''}`.toLowerCase()).join(' ');
  const ctText = contacts.map(c => `${c.name ?? c.id ?? ''} ${c.org ?? c.role ?? ''} ${c.description ?? ''}`.toLowerCase()).join(' ');

  let fullyCtx = 0, kbOnly = 0, contactLinked = 0, blind = 0;
  for (const ev of ops) {
    const label = `${ev.title ?? ev.name ?? ev.type ?? ev.id ?? ''}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(Boolean);
    const score = t => tokens.reduce((s, tok) => s + (t.includes(tok) ? 1 : 0), 0);
    const kbHit = score(kbText) > 0;
    const ctHit = score(ctText) > 0;
    if (kbHit && ctHit) fullyCtx++;
    else if (kbHit) kbOnly++;
    else if (ctHit) contactLinked++;
    else blind++;
  }
  return `OEKCTRI Ops Event × Knowledge × Contact: ${ops.length} ops events assessed. ` +
    `FULLY CONTEXTUALIZED: ${fullyCtx} (KB-backed + contact-assigned). ` +
    `KB-ONLY: ${kbOnly} (KB article matched, no contact). ` +
    `CONTACT-LINKED: ${contactLinked} (contact matched, no KB). ` +
    `BLIND: ${blind} (neither KB nor contact coverage). ` +
    `${kb.length} KB articles. ${contacts.length} tracked contacts.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY CONTEXTUALIZED': '#22d3ee', 'KB-ONLY': '#a78bfa', 'CONTACT-LINKED': '#34d399', 'BLIND': '#f59e0b' };
const STATE_ORDER = ['FULLY CONTEXTUALIZED', 'KB-ONLY', 'CONTACT-LINKED', 'BLIND'];

function correlate(event, kb, contacts) {
  const label = `${event.title ?? event.name ?? event.type ?? event.id ?? ''}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(Boolean);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const kbText = kb.map(a => `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? ''}`).join(' ');
  const ctText = contacts.map(c => `${c.name ?? c.id ?? ''} ${c.org ?? c.role ?? ''} ${c.description ?? ''}`).join(' ');
  const kbHit = score(kbText) > 0;
  const ctHit = score(ctText) > 0;
  if (kbHit && ctHit) return 'FULLY CONTEXTUALIZED';
  if (kbHit) return 'KB-ONLY';
  if (ctHit) return 'CONTACT-LINKED';
  return 'BLIND';
}

export default function OpsEventKnowledgeContactTriple() {
  const [open, setOpen] = useState(false);
  const [ops, setOps] = useState([]);
  const [kb, setKb] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [oeR, kbR, ctR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
      ]);
      const oes = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);
      const kbs = Array.isArray(kbR.value) ? kbR.value : (kbR.value?.articles ?? kbR.value?.items ?? kbR.value?.data ?? []);
      const cts = Array.isArray(ctR.value) ? ctR.value : (ctR.value?.contacts ?? ctR.value?.data ?? []);
      setOps(oes);
      setKb(kbs);
      setContacts(cts);
      setRows(oes.map(ev => ({ ...ev, state: correlate(ev, kbs, cts) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:oekctri-toggle', toggle);
    return () => window.removeEventListener('jarvis:oekctri-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const blind = rows.filter(r => r.state === 'BLIND').length;
    const summary = `OEKCTRI: ${rows.length} ops events. FULLY CONTEXTUALIZED: ${rows.filter(r => r.state === 'FULLY CONTEXTUALIZED').length}. KB-ONLY: ${rows.filter(r => r.state === 'KB-ONLY').length}. CONTACT-LINKED: ${rows.filter(r => r.state === 'CONTACT-LINKED').length}. BLIND: ${blind}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this OEKCTRI ops event coverage state and recommend next steps: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || (r.title ?? r.name ?? r.type ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const blindCount = stateCounts['BLIND'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9982, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="OEKCTRI Ops Event × Knowledge × Contact Coverage" style={{
        position: 'fixed', left: 758000, bottom: 8, zIndex: 382,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ OEKCTRI
        {blindCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {blindCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const covered = stateCounts['FULLY CONTEXTUALIZED'] ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ OEKCTRI</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Ops Event × Knowledge × Contact Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>TOTAL</div>
          <div style={VAL}>{total}</div>
        </div>
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULL CONTEXT COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#22d3ee' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search ops events…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no ops events match</div>
        ) : visible.map((ev, i) => (
          <div key={ev.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[ev.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[ev.state], minWidth: 110, letterSpacing: 0.5 }}>{ev.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.title ?? ev.name ?? ev.type ?? ev.id ?? '—'}
            </span>
            {ev.severity && <span style={{ fontSize: 8, color: '#64748b' }}>{ev.severity}</span>}
            {ev.created_at && <span style={{ fontSize: 8, color: '#475569' }}>{String(ev.created_at).slice(0, 10)}</span>}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.12)',
          border: '1px solid rgba(34,211,238,0.3)', borderRadius: 4,
          color: '#22d3ee', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
