import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const COEKNOW_RE = /\b(coeknow|contact[._\-\s]?ops[._\-\s]?knowledge|contact[._\-\s]?ops[._\-\s]?(?:event[._\-\s]?)?kb|contact[._\-\s]?knowledge[._\-\s]?ops(?:\s+event)?|ops[._\-\s]?knowledge[._\-\s]?contact|dark[._\-\s]?contact[._\-\s]?triple|fully[._\-\s]?informed[._\-\s]?contact|contact[._\-\s]?ops[._\-\s]?kb)\b/i;

export function isCoeknowQuery(t) { return COEKNOW_RE.test(t || ''); }

export async function buildCoeknowScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [conR, oeR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`).then(r => r.json()),
  ]);
  const conRaw = conR.value ?? {};
  const contacts = Array.isArray(conRaw) ? conRaw : (conRaw.contacts ?? conRaw.results ?? conRaw.data ?? conRaw.items ?? []);
  const oeRaw = oeR.value ?? {};
  const events = Array.isArray(oeRaw) ? oeRaw : (oeRaw.events ?? oeRaw.data ?? oeRaw.results ?? []);
  const kbRaw = kbR.value ?? {};
  const articles = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.documents ?? kbRaw.items ?? kbRaw.results ?? kbRaw.data ?? []);

  const oeBlob = events.map(e => `${e.name ?? e.title ?? e.id ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''}`.toLowerCase()).join(' ');
  const kbBlob = articles.map(a => `${a.name ?? a.title ?? a.id ?? ''} ${a.description ?? a.summary ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase()).join(' ');

  let fullyInformed = 0, opsAssigned = 0, kbBacked = 0, dark = 0;
  for (const c of contacts) {
    const text = `${c.name ?? c.id ?? ''} ${c.email ?? ''} ${c.company ?? ''} ${c.title ?? ''} ${c.description ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasOe = tokens.some(tok => oeBlob.includes(tok));
    const hasKb = tokens.some(tok => kbBlob.includes(tok));
    if (hasOe && hasKb) fullyInformed++;
    else if (hasOe) opsAssigned++;
    else if (hasKb) kbBacked++;
    else dark++;
  }
  return `COEKNOW Contact × Ops Event × Knowledge Triple: ${contacts.length} contacts assessed against ${events.length} ops events and ${articles.length} KB articles. ` +
    `FULLY INFORMED: ${fullyInformed} (ops event + KB coverage). ` +
    `OPS-ASSIGNED: ${opsAssigned} (ops event match, no KB). ` +
    `KB-BACKED: ${kbBacked} (KB match, no ops event). ` +
    `DARK: ${dark} (no ops event or KB coverage — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY INFORMED': '#34d399',
  'OPS-ASSIGNED': '#fb923c',
  'KB-BACKED': '#818cf8',
  'DARK': '#94a3b8',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreAgainst(contact, items, nameFields) {
  const text = `${contact.name ?? contact.id ?? ''} ${contact.email ?? ''} ${contact.company ?? ''} ${contact.title ?? ''} ${contact.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const item of items) {
    const itext = nameFields.map(f => `${item[f] ?? ''}`).join(' ').toLowerCase();
    const hits = tokens.filter(tok => itext.includes(tok));
    if (hits.length > 0) matched.push({ item, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function classifyContact(contact, events, articles) {
  const text = `${contact.name ?? contact.id ?? ''} ${contact.email ?? ''} ${contact.company ?? ''} ${contact.title ?? ''} ${contact.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const oeBlob = events.map(e => `${e.name ?? e.title ?? e.id ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''}`.toLowerCase()).join(' ');
  const kbBlob = articles.map(a => `${a.name ?? a.title ?? a.id ?? ''} ${a.description ?? a.summary ?? ''} ${a.category ?? ''} ${(a.tags ?? []).join(' ')}`.toLowerCase()).join(' ');
  const hasOe = tokens.some(tok => oeBlob.includes(tok));
  const hasKb = tokens.some(tok => kbBlob.includes(tok));
  if (hasOe && hasKb) return 'FULLY INFORMED';
  if (hasOe) return 'OPS-ASSIGNED';
  if (hasKb) return 'KB-BACKED';
  return 'DARK';
}

export default function ContactOpsKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [events, setEvents] = useState([]);
  const [articles, setArticles] = useState([]);
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
      const [conR, oeR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`).then(r => r.json()),
      ]);
      const conRaw = conR.value ?? {};
      const cons = Array.isArray(conRaw) ? conRaw : (conRaw.contacts ?? conRaw.results ?? conRaw.data ?? conRaw.items ?? []);
      const oeRaw = oeR.value ?? {};
      const evts = Array.isArray(oeRaw) ? oeRaw : (oeRaw.events ?? oeRaw.data ?? oeRaw.results ?? []);
      const kbRaw = kbR.value ?? {};
      const arts = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.documents ?? kbRaw.items ?? kbRaw.results ?? kbRaw.data ?? []);
      setContacts(cons);
      setEvents(evts);
      setArticles(arts);
      setRows(cons.map(c => ({
        c,
        state: classifyContact(c, evts, arts),
        matchedEvents: scoreAgainst(c, evts, ['name', 'title', 'id', 'description', 'type', 'category']),
        matchedArticles: scoreAgainst(c, arts, ['name', 'title', 'id', 'description', 'summary', 'category']),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:coeknow-toggle', onToggle);
    return () => window.removeEventListener('jarvis:coeknow-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyInformedCount = rows.filter(r => r.state === 'FULLY INFORMED').length;
  const opsAssignedCount = rows.filter(r => r.state === 'OPS-ASSIGNED').length;
  const kbBackedCount = rows.filter(r => r.state === 'KB-BACKED').length;
  const darkCount = rows.filter(r => r.state === 'DARK').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.c.name ?? r.c.id ?? ''} ${r.c.company ?? ''} ${r.c.title ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.c.name ?? row.c.id ?? 'contact';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const oeNames = row.matchedEvents.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const kbNames = row.matchedArticles.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY INFORMED'
        ? `is fully informed — matched ops events (${oeNames || 'found'}) and KB articles (${kbNames || 'found'})`
        : row.state === 'OPS-ASSIGNED'
        ? `is ops-assigned — matched ops events (${oeNames || 'found'}) but has no KB article backing`
        : row.state === 'KB-BACKED'
        ? `is KB-backed — matched KB articles (${kbNames || 'found'}) but has no ops event alignment`
        : 'is DARK — no ops event or knowledge base coverage exists';
      const prompt = `Contact "${id}" ${stateDesc}. In exactly 2 sentences, assess the intelligence coverage gap and the highest-priority remediation action.`;
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
      position: 'fixed', left: 786560, bottom: 8, zIndex: 433,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(251,146,60,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#fb923c', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ COEKNOW — CONTACT × OPS EVENT × KNOWLEDGE</span>
        {darkCount > 0 && (
          <span style={{ background: '#94a3b8', color: '#0f172a', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{darkCount} DARK</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Contacts', val: contacts.length },
          { label: 'Fully Informed', val: fullyInformedCount, color: '#34d399' },
          { label: 'Ops-Assigned', val: opsAssignedCount, color: '#fb923c' },
          { label: 'KB-Backed', val: kbBackedCount, color: '#818cf8' },
          { label: 'Dark', val: darkCount, color: '#94a3b8' },
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
            <div style={{ height: '100%', width: `${Math.round((fullyInformedCount / rows.length) * 100)}%`, background: '#34d399', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((opsAssignedCount / rows.length) * 100)}%`, background: '#fb923c', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((kbBackedCount / rows.length) * 100)}%`, background: '#818cf8', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyInformedCount / rows.length) * 100) : 0}% fully informed · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY INFORMED', 'OPS-ASSIGNED', 'KB-BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#34d399') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'DARK' ? '#0f172a' : '#000') : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
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
          const id = row.c.name ?? row.c.id ?? `contact-${i}`;
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
                    style={{ background: assessing === id ? '#444' : 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 4, color: '#fb923c', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: matched ops events */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#fb923c', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        OPS EVENTS ({row.matchedEvents.length})
                      </div>
                      {row.matchedEvents.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no ops event match — accountability gap</div>
                      ) : row.matchedEvents.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `ev-${mi}`;
                        const sev = m.item.severity ?? m.item.level ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#fdba74', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{n}</span>
                              {sev && <span style={{ fontSize: 9, color: '#9a3412', background: 'rgba(154,52,18,0.2)', borderRadius: 2, padding: '0 3px', marginRight: 4 }}>{sev}</span>}
                              <span style={{ fontSize: 10, color: '#fb923c', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#fb923c', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right: matched KB articles */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#818cf8', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        KB ARTICLES ({row.matchedArticles.length})
                      </div>
                      {row.matchedArticles.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no KB article match — knowledge gap</div>
                      ) : row.matchedArticles.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `kb-${mi}`;
                        const cat = m.item.category ?? m.item.type ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#a5b4fc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{n}</span>
                              {cat && <span style={{ fontSize: 9, color: '#3730a3', background: 'rgba(55,48,163,0.2)', borderRadius: 2, padding: '0 3px', marginRight: 4 }}>{cat}</span>}
                              <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#818cf8', borderRadius: 2 }} />
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
