import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const POLL_MS = 90_000;

const SOEKTRI_RE = /\b(soektri|scenario\s+ops\s+knowledge|scenario\s+ops\s+event\s+knowledge|ops\s+knowledge\s+scenario|scenario\s+knowledge\s+ops|dark\s+scenario|grounded\s+scenario|ops\s+active\s+scenario|kb\s+backed\s+scenario|scenario\s+ops\s+kb|scenario\s+knowledge\s+event|scenario\s+event\s+knowledge|ops\s+event\s+scenario\s+knowledge|scenario\s+intel\s+ops)\b/i;

export function isSoektriQuery(t) { return SOEKTRI_RE.test(t || ''); }

export async function buildSoektriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [scenR, opsR, kbR] = await Promise.allSettled([
      fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
    ]);

    const scenRaw = scenR.value ?? {};
    const scenarios = Array.isArray(scenRaw) ? scenRaw : (scenRaw.scenarios ?? scenRaw.data ?? scenRaw.results ?? []);
    const opsRaw = opsR.value ?? {};
    const events = Array.isArray(opsRaw) ? opsRaw : (opsRaw.events ?? opsRaw.data ?? opsRaw.results ?? []);
    const kbRaw = kbR.value ?? {};
    const articles = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.data ?? kbRaw.results ?? kbRaw.items ?? []);

    const opsText = events.map(e =>
      `${e.title ?? e.name ?? e.id ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''}`.toLowerCase()
    ).join(' ');
    const kbText = articles.map(a =>
      `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
    ).join(' ');

    let fullyGrounded = 0, opsActive = 0, kbBacked = 0, dark = 0;
    for (const s of scenarios) {
      const text = `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.tags ?? ''}`.toLowerCase();
      const tokens = text.split(/\W+/).filter(t => t.length > 2);
      const hasOps = tokens.some(tok => opsText.includes(tok));
      const hasKb  = tokens.some(tok => kbText.includes(tok));
      if (hasOps && hasKb) fullyGrounded++;
      else if (hasOps) opsActive++;
      else if (hasKb) kbBacked++;
      else dark++;
    }
    return `SOEKTRI Scenario × Ops Event × Knowledge: ${scenarios.length} scenarios assessed against ` +
      `${events.length} active ops events and ${articles.length} knowledge articles. ` +
      `FULLY GROUNDED: ${fullyGrounded} (ops event triggered + KB article found — scenario has both live operational context and documented knowledge). ` +
      `OPS-ACTIVE: ${opsActive} (ops event match, no KB backing — operational trigger without documented intelligence). ` +
      `KB-BACKED: ${kbBacked} (KB article found, no ops event — documented but no active operational trigger). ` +
      `DARK: ${dark} (neither — scenario with no operational or knowledge coverage — planning gap).`;
  } catch {
    return 'Scenario × Ops Event × Knowledge assessment unavailable at this time, sir.';
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY GROUNDED': '#22c55e',
  'OPS-ACTIVE':     '#f97316',
  'KB-BACKED':      '#6366f1',
  DARK:             '#6b7280',
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

function stateOf(s, opsText, kbText) {
  const text = `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.tags ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const hasOps = tokens.some(tok => opsText.includes(tok));
  const hasKb  = tokens.some(tok => kbText.includes(tok));
  if (hasOps && hasKb) return 'FULLY GROUNDED';
  if (hasOps) return 'OPS-ACTIVE';
  if (hasKb) return 'KB-BACKED';
  return 'DARK';
}

const TABS = ['ALL', 'FULLY GROUNDED', 'OPS-ACTIVE', 'KB-BACKED', 'DARK'];

export default function ScenarioOpsKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [events, setEvents] = useState([]);
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
      const [scenR, opsR, kbR] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      const sr = scenR.value ?? {}; setScenarios(Array.isArray(sr) ? sr : (sr.scenarios ?? sr.data ?? sr.results ?? []));
      const or = opsR.value ?? {};  setEvents(Array.isArray(or) ? or : (or.events ?? or.data ?? or.results ?? []));
      const kr = kbR.value ?? {};   setArticles(Array.isArray(kr) ? kr : (kr.articles ?? kr.data ?? kr.results ?? kr.items ?? []));
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
    window.addEventListener('jarvis:soektri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:soektri-toggle', onToggle);
  }, []);

  const opsText = events.map(e =>
    `${e.title ?? e.name ?? e.id ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''}`.toLowerCase()
  ).join(' ');
  const kbText = articles.map(a =>
    `${a.title ?? a.name ?? a.id ?? ''} ${a.description ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
  ).join(' ');

  const rows = scenarios.map(s => ({ ...s, _state: stateOf(s, opsText, kbText) }));

  const counts = { 'FULLY GROUNDED': 0, 'OPS-ACTIVE': 0, 'KB-BACKED': 0, DARK: 0 };
  rows.forEach(r => { counts[r._state] = (counts[r._state] || 0) + 1; });

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._state !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${r.name ?? r.title ?? ''} ${r.description ?? ''} ${r.category ?? ''}`.toLowerCase();
      return text.includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief('');
    const script = await buildSoektriScript();
    setBrief(script); setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      title="Scenario × Ops Event × Knowledge (SOEKTRI)"
      style={{
        position: 'fixed', bottom: 8, left: 793840, zIndex: 446,
        background: 'rgba(5,8,13,0.82)', border: '1px solid rgba(34,197,94,0.4)',
        borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
        color: '#22c55e', fontSize: 10, letterSpacing: 1, fontFamily: 'monospace',
        whiteSpace: 'nowrap',
      }}
    >
      ◈ SOEKTRI
    </button>
  );

  const total = rows.length;
  const fgPct  = total ? (counts['FULLY GROUNDED'] / total) * 100 : 0;
  const opsPct = total ? (counts['OPS-ACTIVE']     / total) * 100 : 0;
  const kbPct  = total ? (counts['KB-BACKED']      / total) * 100 : 0;

  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      width: 'min(820px,96vw)', zIndex: 446,
      background: 'rgba(5,10,18,0.97)', border: '1px solid rgba(34,197,94,0.3)',
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 0 60px rgba(34,197,94,0.12), 0 24px 48px rgba(0,0,0,0.8)',
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22c55e', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ SOEKTRI</span>
        <span style={{ color: '#6b7280', fontSize: 11, flex: 1 }}>Scenario × Ops Event × Knowledge</span>
        {counts['DARK'] > 0 && (
          <span style={{ background: 'rgba(107,114,128,0.2)', border: '1px solid #6b7280', borderRadius: 4, padding: '1px 6px', fontSize: 10, color: '#6b7280' }}>
            {counts['DARK']} DARK
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 4, padding: '3px 8px', color: '#22c55e', fontSize: 10, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
      </div>

      {/* Stats */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[['Scenarios', total], ['Events', events.length], ['KB Articles', articles.length],
          ['Fully Grounded', counts['FULLY GROUNDED']], ['Ops-Active', counts['OPS-ACTIVE']],
          ['KB-Backed', counts['KB-BACKED']], ['Dark', counts['DARK']]].map(([label, val]) => (
          <div key={label} style={TILE}>
            <div style={LABEL}>{label}</div>
            <div style={{ ...VAL, fontSize: 18 }}>{loading ? '…' : val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 16px 8px', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex' }}>
        <div style={{ width: `${fgPct}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${opsPct}%`, background: '#f97316', transition: 'width 0.4s' }} />
        <div style={{ width: `${kbPct}%`, background: '#6366f1', transition: 'width 0.4s' }} />
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ margin: '0 16px 8px', padding: '8px 10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, fontSize: 11, color: '#a3e6b5', lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Tabs + search */}
      <div style={{ padding: '6px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,197,94,0.15)' : 'transparent',
            border: tab === t ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '2px 8px', color: tab === t ? '#22c55e' : '#6b7280',
            fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          }}>
            {t}{tab !== t && counts[t] !== undefined ? ` (${counts[t]})` : ''}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search scenarios…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none', width: 160 }} />
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>no scenarios found</div>
        )}
        {filtered.map((s, i) => {
          const label = s.name ?? s.title ?? s.id ?? `scenario-${i}`;
          const sc = STATE_COLOR[s._state] ?? '#6b7280';
          const isExp = expanded === i;
          const tokens = tokenize(`${label} ${s.description ?? ''} ${s.category ?? ''}`);
          const matchedOps = isExp ? events.filter(e => {
            const et = `${e.title ?? e.name ?? e.id ?? ''} ${e.description ?? ''}`.toLowerCase();
            return tokens.some(tok => et.includes(tok));
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
                background: isExp ? 'rgba(34,197,94,0.05)' : 'transparent',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: 12 }}>{label}</span>
                {s.category && <span style={{ fontSize: 10, color: '#6b7280', letterSpacing: 1 }}>{s.category}</span>}
                <span style={{ fontSize: 10, color: sc, letterSpacing: 1, flexShrink: 0 }}>{s._state}</span>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* Ops events pane */}
                  <div style={{ padding: '8px 12px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: '#f97316', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Matched Ops Events ({matchedOps.length})</div>
                    {matchedOps.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#4b5563' }}>no match</div>
                    ) : matchedOps.slice(0, 6).map((e, j) => {
                      const et = `${e.title ?? e.name ?? e.id ?? ''}`;
                      const { score } = scoreMatch(tokens, `${et} ${e.description ?? ''}`.toLowerCase());
                      const pct = Math.min(100, score * 18);
                      return (
                        <div key={j} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 11, color: '#e2e8f0' }}>{et.slice(0, 36)}</span>
                            {e.severity && <span style={{ fontSize: 9, color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 3, padding: '0 4px' }}>{e.severity}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#f97316', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Knowledge pane */}
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: '#6366f1', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Matched KB Articles ({matchedKb.length})</div>
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
                            {a.category && <span style={{ fontSize: 9, color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 3, padding: '0 4px' }}>{a.category}</span>}
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#6366f1', borderRadius: 2 }} />
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
