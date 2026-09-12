import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CIVKTRI_RE = /\b(civktri|contact\s+invest\w*\s+know\w*|contact\s+invest\w*\s+kb|contact\s+financial\s+kb|know\w*\s+backed\s+contact|uncovered\s+contact\s+triple|invest\s+contact\s+kb|contact\s+invest\w*\s+triple|contact\s+financial\s+know\w*|contact\s+kb\s+invest\w*|contact\s+knowledge\s+invest\w*)\b/i;

export function isCivktriQuery(t) { return CIVKTRI_RE.test(t || ''); }

export async function buildCivktriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [ctR, invR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);
  const ctRaw = ctR.value ?? {};
  const contacts = Array.isArray(ctRaw) ? ctRaw
    : (ctRaw.contacts ?? ctRaw.data ?? ctRaw.results ?? []);
  const invRaw = invR.value ?? {};
  const investments = Array.isArray(invRaw) ? invRaw
    : (invRaw.investments ?? invRaw.data ?? invRaw.results ?? []);
  const kbRaw = kbR.value ?? {};
  const articles = Array.isArray(kbRaw) ? kbRaw
    : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);

  const invText = investments.map(i =>
    `${i.name ?? i.title ?? i.id ?? ''} ${i.description ?? ''} ${i.category ?? ''} ${i.tags ?? ''}`.toLowerCase()
  ).join(' ');
  const kbText = articles.map(a =>
    `${a.name ?? a.title ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
  ).join(' ');

  let fully = 0, invested = 0, kbBacked = 0, uncovered = 0;
  for (const ct of contacts) {
    const name = `${ct.name ?? ct.email ?? ct.id ?? ''} ${ct.company ?? ''} ${ct.title ?? ''}`.toLowerCase();
    const tokens = name.split(/\W+/).filter(t => t.length > 2);
    const hasInv = tokens.some(tok => invText.includes(tok));
    const hasKb = tokens.some(tok => kbText.includes(tok));
    if (hasInv && hasKb) fully++;
    else if (hasInv) invested++;
    else if (hasKb) kbBacked++;
    else uncovered++;
  }
  return `CIVKTRI Contact × Investment × Knowledge: ${contacts.length} contacts assessed against ` +
    `${investments.length} investments and ${articles.length} KB articles. ` +
    `FULLY CONNECTED: ${fully} (investment + KB backing). INVESTED: ${invested} (investment found, no KB). ` +
    `KB-BACKED: ${kbBacked} (KB found, no investment). UNCOVERED: ${uncovered} (no linkage — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY CONNECTED': '#4ade80',
  INVESTED: '#818cf8',
  'KB-BACKED': '#34d399',
  UNCOVERED: '#6b7280',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreLeft(contact, investments) {
  const name = `${contact.name ?? contact.email ?? contact.id ?? ''} ${contact.company ?? ''} ${contact.title ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const matched = [];
  for (const inv of investments) {
    const invText = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.tags ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => invText.includes(tok));
    if (hits.length > 0) matched.push({ item: inv, score: Math.min(100, hits.length * 25), side: 'inv' });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreRight(contact, articles) {
  const name = `${contact.name ?? contact.email ?? contact.id ?? ''} ${contact.company ?? ''} ${contact.title ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const matched = [];
  for (const art of articles) {
    const kbText = `${art.name ?? art.title ?? art.id ?? ''} ${art.description ?? ''} ${art.category ?? ''} ${art.tags ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => kbText.includes(tok));
    if (hits.length > 0) matched.push({ item: art, score: Math.min(100, hits.length * 25), side: 'kb' });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(contact, investments, articles) {
  const name = `${contact.name ?? contact.email ?? contact.id ?? ''} ${contact.company ?? ''} ${contact.title ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const invText = investments.map(i => `${i.name ?? i.title ?? i.id ?? ''} ${i.description ?? ''} ${i.category ?? ''}`.toLowerCase()).join(' ');
  const kbText = articles.map(a => `${a.name ?? a.title ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''}`.toLowerCase()).join(' ');
  const hasInv = tokens.some(tok => invText.includes(tok));
  const hasKb = tokens.some(tok => kbText.includes(tok));
  if (hasInv && hasKb) return 'FULLY CONNECTED';
  if (hasInv) return 'INVESTED';
  if (hasKb) return 'KB-BACKED';
  return 'UNCOVERED';
}

export default function ContactInvestKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [investments, setInvestments] = useState([]);
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
      const [ctR, invR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const ctRaw = ctR.value ?? {};
      const cts = Array.isArray(ctRaw) ? ctRaw : (ctRaw.contacts ?? ctRaw.data ?? ctRaw.results ?? []);
      const invRaw = invR.value ?? {};
      const invs = Array.isArray(invRaw) ? invRaw : (invRaw.investments ?? invRaw.data ?? invRaw.results ?? []);
      const kbRaw = kbR.value ?? {};
      const kbs = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);
      setContacts(cts);
      setInvestments(invs);
      setArticles(kbs);
      setRows(cts.map(ct => ({
        ct,
        state: correlate(ct, invs, kbs),
        leftMatched: scoreLeft(ct, invs),
        rightMatched: scoreRight(ct, kbs),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:civktri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:civktri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCount = rows.filter(r => r.state === 'FULLY CONNECTED').length;
  const investedCount = rows.filter(r => r.state === 'INVESTED').length;
  const kbCount = rows.filter(r => r.state === 'KB-BACKED').length;
  const uncoveredCount = rows.filter(r => r.state === 'UNCOVERED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.ct.name ?? r.ct.email ?? r.ct.id ?? ''} ${r.ct.company ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.ct.name ?? row.ct.email ?? row.ct.id ?? 'contact';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const invNames = row.leftMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const kbNames = row.rightMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY CONNECTED'
        ? `has both investment ties (${invNames || 'found'}) and KB backing (${kbNames || 'found'})`
        : row.state === 'INVESTED'
          ? `has investment ties (${invNames || 'found'}) but no KB documentation`
          : row.state === 'KB-BACKED'
            ? `has KB documentation (${kbNames || 'found'}) but no investment linkage`
            : 'has NO investment or knowledge linkage — intelligence gap';
      const prompt = `Contact "${id}" ${stateDesc}. In exactly 2 sentences, assess the intelligence coverage completeness for this contact.`;
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
      position: 'fixed', left: 783200, bottom: 8, zIndex: 427,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#4ade80', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ CIVKTRI — CONTACT × INVESTMENT × KNOWLEDGE</span>
        {uncoveredCount > 0 && (
          <span style={{ background: '#6b7280', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{uncoveredCount} UNCOVERED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Contacts', val: contacts.length },
          { label: 'Fully Connected', val: fullyCount, color: '#4ade80' },
          { label: 'Invested', val: investedCount, color: '#818cf8' },
          { label: 'KB-Backed', val: kbCount, color: '#34d399' },
          { label: 'Uncovered', val: uncoveredCount, color: '#6b7280' },
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
            <div style={{ height: '100%', width: `${Math.round((fullyCount / rows.length) * 100)}%`, background: '#4ade80', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCount / rows.length) * 100) : 0}% fully connected · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY CONNECTED', 'INVESTED', 'KB-BACKED', 'UNCOVERED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? '#000' : '#aaa', cursor: 'pointer', letterSpacing: 1,
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
          const id = row.ct.name ?? row.ct.email ?? row.ct.id ?? `contact-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.ct.company && (
                  <span style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ct.company}</span>
                )}
                {row.ct.title && (
                  <span style={{ fontSize: 10, color: '#818cf8', background: 'rgba(129,140,248,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ct.title}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4, color: '#4ade80', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: Investments */}
                    <div>
                      <div style={{ fontSize: 10, color: '#818cf8', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>INVESTMENTS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no investment matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `inv-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#c4b5fd' }}>{n}</span>
                              {m.item.category && (
                                <span style={{ fontSize: 9, color: '#818cf8', background: 'rgba(129,140,248,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#818cf8', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: KB articles */}
                    <div>
                      <div style={{ fontSize: 10, color: '#34d399', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>KB ARTICLES ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no KB matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `kb-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#6ee7b7' }}>{n}</span>
                              {m.item.category && (
                                <span style={{ fontSize: 9, color: '#34d399', background: 'rgba(52,211,153,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#34d399', borderRadius: 2 }} />
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
