import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const KCRSTRI_RE = /\b(kcrstri|knowledge\s+contact\s+risk|knowledge\s+risk\s+signal|knowledge\s+risk\s+contact|uncovered\s+knowledge|risk\s+backed\s+knowledge|contact\s+linked\s+knowledge|knowledge\s+coverage\s+triple|knowledge\s+risk\s+triple|knowledge\s+contact\s+triple)\b/i;

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

function normaliseKnowledge(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.articles) ? data.articles
    : Array.isArray(data.entries) ? data.entries
    : Array.isArray(data.documents) ? data.documents
    : Array.isArray(data.knowledge) ? data.knowledge
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(k => ({
    id: k.id || k._id || k.articleId || k.slug || String(Math.random()),
    name: k.name || k.title || k.heading || k.label || 'Untitled Article',
    description: k.description || k.summary || k.body || k.content || k.abstract || '',
    category: k.category || k.type || k.domain || k.topic || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : String(k.tags || ''),
    raw: k,
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
    id: c.id || c._id || c.contactId || String(Math.random()),
    name: c.name || c.fullName || c.displayName || c.label || 'Unknown Contact',
    description: c.description || c.bio || c.notes || c.summary || '',
    title: c.title || c.jobTitle || c.role || c.position || '',
    company: c.company || c.organization || c.employer || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function normaliseRisks(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.risks) ? data.risks
    : Array.isArray(data.signals) ? data.signals
    : Array.isArray(data.riskSignals) ? data.riskSignals
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || r.signalId || String(Math.random()),
    name: r.name || r.title || r.label || r.signal || 'Risk Signal',
    description: r.description || r.summary || r.details || r.body || '',
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.domain || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function correlate(articles, contacts, risks) {
  return articles.map(art => {
    const toks = tok([art.name, art.description, art.category, art.tags].join(' '));

    const matchedContacts = contacts
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.description),
          matchScore(toks, c.title),
          matchScore(toks, c.company),
          matchScore(toks, c.tags),
        );
        return { ...c, matchScore: score };
      })
      .filter(c => c.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedRisks = risks
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.description),
          matchScore(toks, r.category),
          matchScore(toks, r.tags),
        );
        return { ...r, matchScore: score };
      })
      .filter(r => r.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasContact = matchedContacts.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let state;
    if (hasContact && hasRisk) state = 'FULLY ALARMED';
    else if (hasContact) state = 'CONTACT-LINKED';
    else if (hasRisk) state = 'RISK-BACKED';
    else state = 'UNCOVERED';

    return { art, matchedContacts, matchedRisks, state };
  });
}

export function isKcrstriQuery(t) {
  return KCRSTRI_RE.test(t || '');
}

export async function buildKcrstriScript() {
  try {
    const apiBase = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
    const key = (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';
    const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    const [kRes, cRes, rRes] = await Promise.all([
      fetch(`${apiBase}/knowledge/`, { headers: hdr }),
      fetch(`${apiBase}/entities/Contact`, { headers: hdr }),
      fetch(`${apiBase}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const [kData, cData, rData] = await Promise.all([kRes.json(), cRes.json(), rRes.json()]);
    const articles = normaliseKnowledge(kData);
    const contacts = normaliseContacts(cData);
    const risks = normaliseRisks(rData);
    const rows = correlate(articles, contacts, risks);
    const alarmed = rows.filter(r => r.state === 'FULLY ALARMED').length;
    const contactLinked = rows.filter(r => r.state === 'CONTACT-LINKED').length;
    const riskBacked = rows.filter(r => r.state === 'RISK-BACKED').length;
    const uncovered = rows.filter(r => r.state === 'UNCOVERED').length;
    return `KCRSTRI coverage across ${rows.length} knowledge articles: ${alarmed} fully alarmed (contact + risk signal), ${contactLinked} contact-linked, ${riskBacked} risk-backed, ${uncovered} uncovered with no contact or risk signal linkage. ${uncovered > 0 ? `${uncovered} article${uncovered > 1 ? 's' : ''} lack both contact and risk coverage — recommend knowledge gap review.` : 'All knowledge articles have at least one coverage layer.'}`;
  } catch {
    return 'KCRSTRI coverage data unavailable — check knowledge, contact, and risk signal endpoints.';
  }
}

const STATE_COLOR = {
  'FULLY ALARMED': '#f87171',
  'CONTACT-LINKED': '#22d3ee',
  'RISK-BACKED': '#fb923c',
  'UNCOVERED': '#6b7280',
};

const TABS = ['ALL', 'FULLY ALARMED', 'CONTACT-LINKED', 'RISK-BACKED', 'UNCOVERED'];

export default function KnowledgeContactRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const apiBase = () => (typeof window !== 'undefined' && window.__JARVIS_API__) || API;
  const apiKey = () => (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` };
      const [kRes, cRes, rRes] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, { headers: hdr }),
        fetch(`${apiBase()}/entities/Contact`, { headers: hdr }),
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const [kData, cData, rData] = await Promise.all([kRes.json(), cRes.json(), rRes.json()]);
      const articles = normaliseKnowledge(kData);
      const contacts = normaliseContacts(cData);
      const risks = normaliseRisks(rData);
      setRows(correlate(articles, contacts, risks));
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

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:kcrstri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:kcrstri-toggle', onToggle);
  }, []);

  const counts = {
    'ALL': rows.length,
    'FULLY ALARMED': rows.filter(r => r.state === 'FULLY ALARMED').length,
    'CONTACT-LINKED': rows.filter(r => r.state === 'CONTACT-LINKED').length,
    'RISK-BACKED': rows.filter(r => r.state === 'RISK-BACKED').length,
    'UNCOVERED': rows.filter(r => r.state === 'UNCOVERED').length,
  };

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.state === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || r.art.name.toLowerCase().includes(q) || r.art.description.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess(row) {
    setAssessing(true);
    try {
      const msg = `Assess knowledge article "${row.art.name}" (${row.state}): ${row.matchedContacts.length} contact(s) matched, ${row.matchedRisks.length} risk signal(s). Summarise knowledge coverage and recommend next action in 2 sentences.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const text = (d.answer || '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { /* swallow */ } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    const uncoveredCount = counts['UNCOVERED'];
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Contact × RiskSignal Triple Coverage"
        style={{
          position: 'fixed', left: 778720, bottom: 8, zIndex: 419,
          background: uncoveredCount > 0 ? 'rgba(107,114,128,0.15)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${uncoveredCount > 0 ? '#6b728066' : '#f8717144'}`,
          color: uncoveredCount > 0 ? '#9ca3af' : '#f87171',
          padding: '3px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
          fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ KCRSTRI{uncoveredCount > 0 && <span style={{ marginLeft: 5, background: '#6b7280', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9 }}>{uncoveredCount}</span>}
      </button>
    );
  }

  const alarmed = counts['FULLY ALARMED'];
  const total = counts['ALL'];
  const pct = total > 0 ? Math.round((alarmed / total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 778720, bottom: 48, zIndex: 419,
      width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,10,18,0.97)', border: '1px solid #f8717133',
      borderRadius: 8, fontFamily: 'monospace', overflow: 'hidden',
      boxShadow: '0 0 40px #f8717111',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f8717122', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f87171', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ KCRSTRI</span>
        <span style={{ color: '#6b7280', fontSize: 10, flex: 1 }}>Knowledge × Contact × RiskSignal</span>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', color: '#f8717188', cursor: 'pointer', fontSize: 12 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f8717111' }}>
        {[
          { label: 'FULLY ALARMED', val: counts['FULLY ALARMED'], col: '#f87171' },
          { label: 'CONTACT-LINKED', val: counts['CONTACT-LINKED'], col: '#22d3ee' },
          { label: 'RISK-BACKED', val: counts['RISK-BACKED'], col: '#fb923c' },
          { label: 'UNCOVERED', val: counts['UNCOVERED'], col: '#6b7280' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: col + '88', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '4px 12px 6px', borderBottom: '1px solid #f8717111' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#6b7280', fontSize: 9 }}>FULLY ALARMED COVERAGE</span>
          <span style={{ color: '#f87171', fontSize: 9 }}>{pct}% ({alarmed}/{total})</span>
        </div>
        <div style={{ height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#f87171,#fb923c)', transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #f8717111', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${STATE_COLOR[t] || '#f87171'}22` : 'none',
            border: `1px solid ${tab === t ? (STATE_COLOR[t] || '#f87171') + '66' : '#f8717122'}`,
            color: tab === t ? (STATE_COLOR[t] || '#f87171') : '#6b7280',
            padding: '2px 7px', borderRadius: 3, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {t} {counts[t] !== undefined ? `(${counts[t]})` : ''}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #f8717122',
            color: '#c8e6ff', padding: '2px 7px', borderRadius: 3, fontSize: 9, fontFamily: 'monospace', outline: 'none', width: 90,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {loading && <div style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: '#f87171', fontSize: 10, padding: 8 }}>{err}</div>}

        {visible.map((row, i) => {
          const isExpanded = expanded[row.art.id];
          return (
            <div key={row.art.id + i} style={{
              marginBottom: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${STATE_COLOR[row.state]}22`,
              borderRadius: 4, padding: '5px 8px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setExpanded(e => ({ ...e, [row.art.id]: !e[row.art.id] }))}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1, color: STATE_COLOR[row.state],
                  background: `${STATE_COLOR[row.state]}18`, border: `1px solid ${STATE_COLOR[row.state]}44`,
                  borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {row.art.name}
                </span>
                <span style={{ fontSize: 9, color: '#22d3ee88' }}>{row.matchedContacts.length}CT</span>
                <span style={{ fontSize: 9, color: '#fb923c88' }}>{row.matchedRisks.length}RS</span>
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Contacts */}
                  <div style={{ flex: 1, background: 'rgba(34,211,238,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#22d3ee', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      CONTACTS ({row.matchedContacts.length})
                    </div>
                    {row.matchedContacts.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No contact match</div>
                    ) : (
                      row.matchedContacts.slice(0, 5).map((c, k) => (
                        <div key={c.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{c.name}</span>
                            {c.title && <span style={{ fontSize: 9, color: '#22d3ee88' }}>{c.title}</span>}
                          </div>
                          {c.company && <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 1 }}>{c.company}</div>}
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(c.matchScore * 100)}%`, background: '#22d3ee', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Risk Signals */}
                  <div style={{ flex: 1, background: 'rgba(251,146,60,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#fb923c', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      RISK SIGNALS ({row.matchedRisks.length})
                    </div>
                    {row.matchedRisks.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No risk signal match</div>
                    ) : (
                      row.matchedRisks.slice(0, 5).map((r, k) => (
                        <div key={r.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{r.name}</span>
                            {r.severity && <span style={{ fontSize: 9, color: '#f8717188' }}>{r.severity}</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(r.matchScore * 100)}%`, background: '#fb923c', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(248,113,113,0.1)', border: '1px solid #f8717144',
                      color: '#f87171', padding: '3px 12px', borderRadius: 3,
                      fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
