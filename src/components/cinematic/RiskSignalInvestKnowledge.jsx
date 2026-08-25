import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RIKNOW_RE = /\b(riknow|risk\s+signal\s+invest\s+knowledge|risk\s+knowledge\s+invest|risk\s+kb\s+invest|risk\s+investigation\s+knowledge|risk\s+signal\s+knowledge|blind\s+risk\s+signal|risk\s+signal\s+coverage\s+triple|risk\s+invest\s+knowledge|knowledge\s+risk\s+invest|investigate\s+risk\s+knowledge|risk\s+signal\s+kb|risk\s+invest\s+kb)\b/i;

export function isRiknowQuery(t) { return RIKNOW_RE.test(t || ''); }

export async function buildRiknowScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [riskR, invR, knR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);
  const riskRaw = riskR.value ?? {};
  const risks = Array.isArray(riskRaw) ? riskRaw : (riskRaw.risks ?? riskRaw.data ?? riskRaw.results ?? []);
  const invRaw = invR.value ?? {};
  const invs = Array.isArray(invRaw) ? invRaw : (invRaw.investigations ?? invRaw.data ?? invRaw.results ?? []);
  const knRaw = knR.value ?? {};
  const articles = Array.isArray(knRaw) ? knRaw : (knRaw.articles ?? knRaw.documents ?? knRaw.data ?? knRaw.results ?? []);

  const invText = invs.map(i =>
    `${i.title ?? i.name ?? i.id ?? ''} ${i.description ?? ''} ${i.category ?? ''} ${i.tags ?? ''}`.toLowerCase()
  ).join(' ');
  const knText = articles.map(a =>
    `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? a.body ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
  ).join(' ');

  let fully = 0, investigated = 0, kbCovered = 0, blind = 0;
  for (const r of risks) {
    const text = `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasInv = tokens.some(tok => invText.includes(tok));
    const hasKb = tokens.some(tok => knText.includes(tok));
    if (hasInv && hasKb) fully++;
    else if (hasInv) investigated++;
    else if (hasKb) kbCovered++;
    else blind++;
  }
  return `RIKNOW Risk Signal × Investigation × Knowledge: ${risks.length} risk signals assessed against ` +
    `${invs.length} investigations and ${articles.length} KB articles. ` +
    `FULLY COVERED: ${fully} (investigation opened + KB article found). INVESTIGATED: ${investigated} (active investigation, no KB). ` +
    `KB-COVERED: ${kbCovered} (documented in KB, not under investigation). BLIND: ${blind} (no investigation or KB coverage — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY COVERED': '#4ade80',
  INVESTIGATED: '#a78bfa',
  'KB-COVERED': '#22d3ee',
  BLIND: '#ef4444',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreInvestigations(risk, invs) {
  const text = `${risk.title ?? risk.name ?? risk.id ?? ''} ${risk.description ?? ''} ${risk.category ?? ''} ${risk.source ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const inv of invs) {
    const iText = `${inv.title ?? inv.name ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.tags ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => iText.includes(tok));
    if (hits.length > 0) matched.push({ item: inv, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreKnowledge(risk, articles) {
  const text = `${risk.title ?? risk.name ?? risk.id ?? ''} ${risk.description ?? ''} ${risk.category ?? ''} ${risk.source ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const a of articles) {
    const aText = `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? a.body ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => aText.includes(tok));
    if (hits.length > 0) matched.push({ item: a, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(risk, invs, articles) {
  const text = `${risk.title ?? risk.name ?? risk.id ?? ''} ${risk.description ?? ''} ${risk.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const invText = invs.map(i => `${i.title ?? i.name ?? i.id ?? ''} ${i.description ?? ''} ${i.category ?? ''}`.toLowerCase()).join(' ');
  const knText = articles.map(a => `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? a.body ?? ''} ${a.category ?? ''}`.toLowerCase()).join(' ');
  const hasInv = tokens.some(tok => invText.includes(tok));
  const hasKb = tokens.some(tok => knText.includes(tok));
  if (hasInv && hasKb) return 'FULLY COVERED';
  if (hasInv) return 'INVESTIGATED';
  if (hasKb) return 'KB-COVERED';
  return 'BLIND';
}

export default function RiskSignalInvestKnowledge() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [invs, setInvs] = useState([]);
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
      const [riskR, invR, knR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const riskRaw = riskR.value ?? {};
      const rks = Array.isArray(riskRaw) ? riskRaw : (riskRaw.risks ?? riskRaw.data ?? riskRaw.results ?? []);
      const invRaw = invR.value ?? {};
      const ivs = Array.isArray(invRaw) ? invRaw : (invRaw.investigations ?? invRaw.data ?? invRaw.results ?? []);
      const knRaw = knR.value ?? {};
      const arts = Array.isArray(knRaw) ? knRaw : (knRaw.articles ?? knRaw.documents ?? knRaw.data ?? knRaw.results ?? []);
      setRisks(rks);
      setInvs(ivs);
      setArticles(arts);
      setRows(rks.map(r => ({
        r,
        state: correlate(r, ivs, arts),
        leftMatched: scoreInvestigations(r, ivs),
        rightMatched: scoreKnowledge(r, arts),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:riknow-toggle', onToggle);
    return () => window.removeEventListener('jarvis:riknow-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCount = rows.filter(r => r.state === 'FULLY COVERED').length;
  const invCount = rows.filter(r => r.state === 'INVESTIGATED').length;
  const kbCount = rows.filter(r => r.state === 'KB-COVERED').length;
  const blindCount = rows.filter(r => r.state === 'BLIND').length;

  const visible = rows.filter(row => {
    if (filter !== 'ALL' && row.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${row.r.title ?? row.r.name ?? row.r.id ?? ''} ${row.r.category ?? ''} ${row.r.source ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.r.title ?? row.r.name ?? row.r.id ?? 'risk signal';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const invNames = row.leftMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const kbNames = row.rightMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY COVERED'
        ? `has active investigation coverage (${invNames || 'found'}) and KB documentation (${kbNames || 'found'})`
        : row.state === 'INVESTIGATED'
          ? `is under active investigation (${invNames || 'found'}) but lacks KB documentation`
          : row.state === 'KB-COVERED'
            ? `has KB documentation (${kbNames || 'found'}) but no active investigation`
            : 'has NO investigation or KB coverage — intelligence blind spot';
      const prompt = `Risk signal "${id}" ${stateDesc}. In exactly 2 sentences, assess the intelligence coverage status of this risk signal.`;
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
      position: 'fixed', left: 790480, bottom: 8, zIndex: 440,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#4ade80', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ RIKNOW — RISK SIGNAL × INVESTIGATION × KNOWLEDGE</span>
        {blindCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{blindCount} BLIND</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Risk Signals', val: risks.length },
          { label: 'Fully Covered', val: fullyCount, color: '#4ade80' },
          { label: 'Investigated', val: invCount, color: '#a78bfa' },
          { label: 'KB-Covered', val: kbCount, color: '#22d3ee' },
          { label: 'Blind', val: blindCount, color: '#ef4444' },
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
            <div style={{ height: '100%', width: `${Math.round((fullyCount / rows.length) * 100)}%`, background: '#4ade80', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((invCount / rows.length) * 100)}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((kbCount / rows.length) * 100)}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCount / rows.length) * 100) : 0}% fully covered · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY COVERED', 'INVESTIGATED', 'KB-COVERED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'BLIND' ? '#fff' : '#000') : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no risk signals match</div>
        )}
        {visible.map((row, i) => {
          const id = row.r.title ?? row.r.name ?? row.r.id ?? `risk-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.r.severity && (
                  <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(248,113,113,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.r.severity}</span>
                )}
                {row.r.category && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.r.category}</span>
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
                    {/* Left pane: Investigations */}
                    <div>
                      <div style={{ fontSize: 10, color: '#a78bfa', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>INVESTIGATIONS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no investigation matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `inv-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#c4b5fd' }}>{n}</span>
                              {m.item.status && (
                                <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.status}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#a78bfa', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Knowledge articles */}
                    <div>
                      <div style={{ fontSize: 10, color: '#22d3ee', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>KB ARTICLES ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no KB article matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `article-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#67e8f9' }}>{n}</span>
                              {m.item.category && (
                                <span style={{ fontSize: 9, color: '#22d3ee', background: 'rgba(34,211,238,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
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
