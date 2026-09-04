import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const POLL_MS = 90_000;

const CSKNTRI_RE = /\b(cskntri|contact\s+scenario\s+knowledge|contact\s+scenario\s+kb|scenario\s+contact\s+knowledge|contact\s+knowledge\s+scenario|unplanned\s+contact|contact\s+response\s+plan|contact\s+fully\s+planned|scenario\s+linked\s+contact|contact\s+planning\s+gap|contact\s+scenario\s+triple|contact\s+triple\s+coverage)\b/i;

export function isCskntriQuery(t) { return CSKNTRI_RE.test(t || ''); }

export async function buildCskntriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [conR, scenR, kbR] = await Promise.allSettled([
      fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
    ]);

    const conRaw = conR.value ?? {};
    const contacts = Array.isArray(conRaw) ? conRaw : (conRaw.contacts ?? conRaw.data ?? conRaw.results ?? []);
    const scenRaw = scenR.value ?? {};
    const scenarios = Array.isArray(scenRaw) ? scenRaw : (scenRaw.scenarios ?? scenRaw.data ?? scenRaw.results ?? []);
    const kbRaw = kbR.value ?? {};
    const articles = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.data ?? kbRaw.results ?? kbRaw.items ?? []);

    const scenText = scenarios.map(s =>
      `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.tags ?? ''}`.toLowerCase()
    ).join(' ');
    const kbText = articles.map(a =>
      `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
    ).join(' ');

    let fullyPlanned = 0, scenLinked = 0, kbBacked = 0, unplanned = 0;
    for (const c of contacts) {
      const text = `${c.name ?? c.full_name ?? c.id ?? ''} ${c.email ?? ''} ${c.company ?? c.organisation ?? ''} ${c.title ?? c.role ?? ''} ${c.description ?? ''}`.toLowerCase();
      const tokens = text.split(/\W+/).filter(t => t.length > 2);
      const hasScen = tokens.some(tok => scenText.includes(tok));
      const hasKb   = tokens.some(tok => kbText.includes(tok));
      if (hasScen && hasKb) fullyPlanned++;
      else if (hasScen) scenLinked++;
      else if (hasKb) kbBacked++;
      else unplanned++;
    }
    return `CSKNTRI Contact × Scenario × Knowledge: ${contacts.length} contacts assessed against ` +
      `${scenarios.length} scenario plans and ${articles.length} knowledge articles. ` +
      `FULLY PLANNED: ${fullyPlanned} (scenario coverage + KB article — contact has both a response plan and documented intelligence). ` +
      `SCENARIO-LINKED: ${scenLinked} (scenario match, no KB backing — planned but undocumented). ` +
      `KB-BACKED: ${kbBacked} (KB article found, no scenario — documented but no response plan). ` +
      `UNPLANNED: ${unplanned} (neither — contact with no scenario or knowledge coverage — personnel gap).`;
  } catch {
    return 'Contact × Scenario × Knowledge assessment unavailable at this time, sir.';
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY PLANNED':   '#22c55e',
  'SCENARIO-LINKED': '#a78bfa',
  'KB-BACKED':       '#38bdf8',
  UNPLANNED:         '#f59e0b',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreMatch(tokens, corpus) {
  if (!corpus) return { score: 0, hits: [] };
  const hits = [];
  let score = 0;
  for (const tok of tokens) {
    if (corpus.includes(tok)) { score++; hits.push(tok); }
  }
  return { score, hits: [...new Set(hits)] };
}

function stateOf(c, scenText, kbText) {
  const text = `${c.name ?? c.full_name ?? c.id ?? ''} ${c.email ?? ''} ${c.company ?? c.organisation ?? ''} ${c.title ?? c.role ?? ''} ${c.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const hasScen = tokens.some(tok => scenText.includes(tok));
  const hasKb   = tokens.some(tok => kbText.includes(tok));
  if (hasScen && hasKb) return 'FULLY PLANNED';
  if (hasScen) return 'SCENARIO-LINKED';
  if (hasKb) return 'KB-BACKED';
  return 'UNPLANNED';
}

const TABS = ['ALL', 'FULLY PLANNED', 'SCENARIO-LINKED', 'KB-BACKED', 'UNPLANNED'];

export default function ContactScenarioKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [conR, scenR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      const cr = conR.value ?? {};   setContacts(Array.isArray(cr) ? cr : (cr.contacts ?? cr.data ?? cr.results ?? []));
      const sr = scenR.value ?? {};  setScenarios(Array.isArray(sr) ? sr : (sr.scenarios ?? sr.data ?? sr.results ?? []));
      const kr = kbR.value ?? {};    setArticles(Array.isArray(kr) ? kr : (kr.articles ?? kr.data ?? kr.results ?? kr.items ?? []));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:cskntri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:cskntri-toggle', onToggle);
  }, []);

  const scenText = scenarios.map(s =>
    `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.tags ?? ''}`.toLowerCase()
  ).join(' ');
  const kbText = articles.map(a =>
    `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
  ).join(' ');

  const rows = contacts.map(c => ({ ...c, _state: stateOf(c, scenText, kbText) }));

  const counts = { 'FULLY PLANNED': 0, 'SCENARIO-LINKED': 0, 'KB-BACKED': 0, UNPLANNED: 0 };
  rows.forEach(r => { counts[r._state] = (counts[r._state] || 0) + 1; });

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._state !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${r.name ?? r.full_name ?? ''} ${r.email ?? ''} ${r.company ?? r.organisation ?? ''} ${r.title ?? r.role ?? ''}`.toLowerCase();
      return text.includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief('');
    const script = await buildCskntriScript();
    setBrief(script); setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      title="Contact × Scenario × Knowledge (CSKNTRI)"
      style={{
        position: 'fixed', bottom: 8, left: 794400, zIndex: 447,
        background: 'rgba(5,8,13,0.82)', border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
        color: '#f59e0b', fontSize: 10, letterSpacing: 1, fontFamily: 'monospace',
        whiteSpace: 'nowrap',
      }}
    >
      ◈ CSKNTRI
    </button>
  );

  const total = rows.length;
  const fpPct   = total ? (counts['FULLY PLANNED']   / total) * 100 : 0;
  const slPct   = total ? (counts['SCENARIO-LINKED'] / total) * 100 : 0;
  const kbPct   = total ? (counts['KB-BACKED']       / total) * 100 : 0;

  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      width: 'min(820px,96vw)', zIndex: 447,
      background: 'rgba(5,10,18,0.97)', border: '1px solid rgba(245,158,11,0.3)',
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 0 60px rgba(245,158,11,0.10), 0 24px 48px rgba(0,0,0,0.8)',
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#f59e0b', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ CSKNTRI</span>
        <span style={{ color: '#6b7280', fontSize: 11, flex: 1 }}>Contact × Scenario × Knowledge</span>
        {counts['UNPLANNED'] > 0 && (
          <span style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: '#f59e0b' }}>
            {counts['UNPLANNED']} UNPLANNED
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 4, padding: '3px 8px', color: '#f59e0b', fontSize: 10, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
      </div>

      {/* Stats */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['Contacts', total], ['Scenarios', scenarios.length], ['KB Articles', articles.length],
          ['Fully Planned', counts['FULLY PLANNED']], ['Scen-Linked', counts['SCENARIO-LINKED']],
          ['KB-Backed', counts['KB-BACKED']], ['Unplanned', counts['UNPLANNED']]].map(([label, val]) => (
          <div key={label} style={TILE}>
            <div style={LABEL}>{label}</div>
            <div style={{ ...VAL, fontSize: 18 }}>{loading ? '…' : val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 16px 8px', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex' }}>
        <div style={{ width: `${fpPct}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${slPct}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
        <div style={{ width: `${kbPct}%`, background: '#38bdf8', transition: 'width 0.4s' }} />
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ margin: '0 16px 8px', padding: '8px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, fontSize: 11, color: '#fde68a', lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Tabs + search */}
      <div style={{ padding: '6px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(245,158,11,0.15)' : 'transparent',
            border: tab === t ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '2px 8px', color: tab === t ? '#f59e0b' : '#6b7280',
            fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          }}>
            {t}{tab !== t && counts[t] !== undefined ? ` (${counts[t]})` : ''}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none', width: 160 }} />
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>no contacts found</div>
        )}
        {filtered.map((c, i) => {
          const label = c.name ?? c.full_name ?? c.email ?? c.id ?? `contact-${i}`;
          const sc = STATE_COLOR[c._state] ?? '#6b7280';
          const isExp = expanded === i;
          const tokens = tokenize(`${label} ${c.email ?? ''} ${c.company ?? c.organisation ?? ''} ${c.title ?? c.role ?? ''} ${c.description ?? ''}`);
          const matchedScen = isExp ? scenarios.filter(s => {
            const st = `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''}`.toLowerCase();
            return tokens.some(tok => st.includes(tok));
          }) : [];
          const matchedKb = isExp ? articles.filter(a => {
            const at = `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''}`.toLowerCase();
            return tokens.some(tok => at.includes(tok));
          }) : [];

          return (
            <div key={i}>
              <div onClick={() => setExpanded(isExp ? null : i)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: isExp ? 'rgba(245,158,11,0.05)' : 'transparent',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12 }}>{label}</span>
                {(c.company ?? c.organisation) && (
                  <span style={{ fontSize: 10, color: '#6b7280', letterSpacing: 1 }}>{(c.company ?? c.organisation).slice(0, 24)}</span>
                )}
                <span style={{ fontSize: 10, color: sc, letterSpacing: 1, flexShrink: 0 }}>{c._state}</span>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* Scenarios pane */}
                  <div style={{ padding: '8px 12px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: '#a78bfa', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Matched Scenarios ({matchedScen.length})</div>
                    {matchedScen.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#4b5563' }}>no match</div>
                    ) : matchedScen.slice(0, 6).map((s, j) => {
                      const st = `${s.name ?? s.title ?? s.id ?? ''}`;
                      const { score } = scoreMatch(tokens, `${st} ${s.description ?? ''}`.toLowerCase());
                      const pct = Math.min(100, score * 18);
                      return (
                        <div key={j} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: '#e2e8f0' }}>{st.slice(0, 36)}</span>
                            {s.category && <span style={{ fontSize: 9, color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 3, padding: '0 4px' }}>{s.category}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Knowledge pane */}
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: '#38bdf8', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Matched KB Articles ({matchedKb.length})</div>
                    {matchedKb.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#4b5563' }}>no match</div>
                    ) : matchedKb.slice(0, 6).map((a, j) => {
                      const at = `${a.title ?? a.name ?? a.id ?? ''}`;
                      const { score } = scoreMatch(tokens, `${at} ${a.description ?? ''}`.toLowerCase());
                      const pct = Math.min(100, score * 18);
                      return (
                        <div key={j} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: '#e2e8f0' }}>{at.slice(0, 36)}</span>
                            {a.category && <span style={{ fontSize: 9, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 3, padding: '0 4px' }}>{a.category}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
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
