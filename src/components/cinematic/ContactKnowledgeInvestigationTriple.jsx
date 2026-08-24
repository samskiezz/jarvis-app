import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CKIKNOW_RE = /\b(ckiknow|contact\s+knowledge\s+investigation|contact\s+investigation\s+knowledge|contact\s+kb\s+case|contact\s+case\s+knowledge|tracked\s+contact\s+knowledge|dark\s+contact\s+knowledge|contact\s+intel\s+gap|contact\s+knowledge\s+case|contact\s+case\s+kb|knowledge\s+investigation\s+contact|investigation\s+knowledge\s+contact|contact\s+fully\s+tracked\s+knowledge)\b/i;
const THRESHOLD = 0.07;

export function isCkiknowQuery(t) {
  return CKIKNOW_RE.test(t || '');
}

export async function buildCkiknowScript() {
  try {
    const [contactRes, kbRes, invRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(contactRes);
    const articles = normaliseKb(kbRes);
    const cases = normaliseCases(invRes);
    const classified = contacts.map(c => classifyContact(c, articles, cases));
    const fullyTracked = classified.filter(c => c.state === 'FULLY_TRACKED').length;
    const dark = classified.filter(c => c.state === 'DARK').length;
    return `CKIKNOW analysis: ${contacts.length} contacts cross-referenced against ${articles.length} knowledge base articles and ${cases.length} active investigations. ${fullyTracked} contacts are FULLY TRACKED — both knowledge base documentation and active investigation case coverage confirmed. ${dark} contacts are DARK — no KB documentation or investigation case detected, representing critical intelligence registry gaps requiring immediate personnel profiling.`;
  } catch {
    return 'CKIKNOW data unavailable — check /entities/Contact, /knowledge/, and /v1/investigations endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.contacts) ? raw.contacts
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `contact-${i}`,
    label: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.job_title || c.position || '',
    company: c.company || c.organisation || c.organization || '',
    sector: c.sector || c.industry || '',
    _searchText: [
      c.name, c.full_name, c.email, c.role, c.title, c.job_title,
      c.company, c.organisation, c.organization, c.sector, c.industry,
      c.description, c.bio, c.aliases, c.tags,
    ].filter(Boolean).join(' '),
  }));
}

function normaliseKb(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.articles) ? raw.articles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `kb-${i}`,
    label: a.title || a.name || a.slug || `Article ${i + 1}`,
    category: a.category || a.type || a.topic || '',
    _text: [a.title, a.name, a.summary, a.content, a.description, a.tags, a.category].filter(Boolean).join(' '),
  }));
}

function normaliseCases(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.investigations) ? raw.investigations
    : Array.isArray(raw.cases) ? raw.cases
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `case-${i}`,
    label: c.name || c.title || c.case_name || `Case ${i + 1}`,
    status: c.status || c.state || '',
    priority: c.priority || c.severity || '',
    _text: [c.name, c.title, c.description, c.summary, c.subject,
      c.category, c.type, c.tags, c.notes].filter(Boolean).join(' '),
  }));
}

function classifyContact(contact, articles, cases) {
  const toks = tok(contact._searchText);
  const matchedArticles = articles
    .map(a => ({ ...a, score: matchScore(toks, a._text) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedCases = cases
    .map(c => ({ ...c, score: matchScore(toks, c._text) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasKb = matchedArticles.length > 0;
  const hasCase = matchedCases.length > 0;
  const state = hasKb && hasCase ? 'FULLY_TRACKED'
    : hasKb ? 'KB_BACKED'
    : hasCase ? 'CASE_ACTIVE'
    : 'DARK';

  return { ...contact, state, matchedArticles, matchedCases };
}

const STATE_COLOR = {
  FULLY_TRACKED: '#22d3ee',
  KB_BACKED: '#818cf8',
  CASE_ACTIVE: '#fb923c',
  DARK: '#475569',
};

export default function ContactKnowledgeInvestigationTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contacts, setContacts] = useState([]);
  const [articles, setArticles] = useState([]);
  const [cases, setCases] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contactRes, kbRes, invRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      ]);
      const c = normaliseContacts(contactRes);
      const a = normaliseKb(kbRes);
      const inv = normaliseCases(invRes);
      setContacts(c);
      setArticles(a);
      setCases(inv);
      setClassified(c.map(contact => classifyContact(contact, a, inv)));
    } catch (e) {
      setError('Fetch error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:ckiknow-toggle', handler);
    return () => window.removeEventListener('jarvis:ckiknow-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (CKIKNOW_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_TRACKED: classified.filter(c => c.state === 'FULLY_TRACKED').length,
    KB_BACKED: classified.filter(c => c.state === 'KB_BACKED').length,
    CASE_ACTIVE: classified.filter(c => c.state === 'CASE_ACTIVE').length,
    DARK: classified.filter(c => c.state === 'DARK').length,
  };

  const visible = classified.filter(c => {
    if (filter !== 'ALL' && c.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c._searchText.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `CKIKNOW Contact × Knowledge × Investigation Triple Coverage: ${contacts.length} contacts cross-referenced against ${articles.length} KB articles and ${cases.length} active investigations. Coverage: FULLY_TRACKED=${counts.FULLY_TRACKED}, KB_BACKED=${counts.KB_BACKED}, CASE_ACTIVE=${counts.CASE_ACTIVE}, DARK=${counts.DARK}. In 2 sentences, assess which contacts have both knowledge base documentation and active investigation case coverage versus those that are completely dark with no KB or case references, and identify the most critical personnel intelligence gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const trackedPct = classified.length ? Math.round((counts.FULLY_TRACKED / classified.length) * 100) : 0;
  const kbPct = classified.length ? Math.round((counts.KB_BACKED / classified.length) * 100) : 0;
  const casePct = classified.length ? Math.round((counts.CASE_ACTIVE / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 848720, bottom: 8, zIndex: 544,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a1a2e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,20,60,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>◈ CKIKNOW</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Contact × Knowledge × Investigation Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#22d3ee', fontSize: 10 }}>SYNCING…</span>}
          {counts.FULLY_TRACKED > 0 && (
            <span style={{ background: '#164e63', color: '#22d3ee', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.FULLY_TRACKED} TRACKED
            </span>
          )}
          {counts.DARK > 0 && (
            <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.DARK} DARK
            </span>
          )}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'CONTACTS', val: contacts.length, color: '#e2e8f0' },
          { label: 'KB ARTICLES', val: articles.length, color: '#818cf8' },
          { label: 'CASES', val: cases.length, color: '#fb923c' },
          { label: 'FULLY TRACKED', val: counts.FULLY_TRACKED, color: '#22d3ee', badge: counts.FULLY_TRACKED > 0 },
          { label: 'KB-BACKED', val: counts.KB_BACKED, color: '#818cf8' },
          { label: 'CASE-ACTIVE', val: counts.CASE_ACTIVE, color: '#fb923c' },
          { label: 'DARK', val: counts.DARK, color: '#475569', badge: counts.DARK > 0 },
          { label: 'TRACKED %', val: `${trackedPct}%`, color: '#22d3ee' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          <div style={{ width: `${trackedPct}%`, background: '#22d3ee' }} title={`FULLY TRACKED ${trackedPct}%`} />
          <div style={{ width: `${kbPct}%`, background: '#818cf8' }} title={`KB-BACKED ${kbPct}%`} />
          <div style={{ width: `${casePct}%`, background: '#fb923c' }} title={`CASE-ACTIVE ${casePct}%`} />
          <div style={{ width: `${darkPct}%`, background: '#1e293b' }} title={`DARK ${darkPct}%`} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#64748b' }}>
          <span style={{ color: '#22d3ee' }}>■ TRACKED {trackedPct}%</span>
          <span style={{ color: '#818cf8' }}>■ KB {kbPct}%</span>
          <span style={{ color: '#fb923c' }}>■ CASE {casePct}%</span>
          <span>■ DARK {darkPct}%</span>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY_TRACKED', 'KB_BACKED', 'CASE_ACTIVE', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1e293b' : 'none', border: `1px solid ${filter === f ? '#334155' : '#1e293b'}`,
            color: filter === f ? '#e2e8f0' : '#64748b', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 10,
          }}>{f.replace(/_/g, ' ')}{f !== 'ALL' ? ` (${counts[f] ?? 0})` : ` (${classified.length})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 160 }} />
      </div>

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px' }}>
        {visible.slice(0, 120).map(c => (
          <div key={c.id}>
            <div onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0f172a', cursor: 'pointer' }}>
              <span style={{ color: STATE_COLOR[c.state], fontSize: 10, fontWeight: 700, minWidth: 120 }}>{c.state.replace(/_/g, ' ')}</span>
              <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
              {c.role && <span style={{ color: '#64748b', fontSize: 10 }}>{c.role}</span>}
              <span style={{ color: '#475569', fontSize: 10 }}>{c.matchedArticles.length}KB / {c.matchedCases.length}CASE</span>
              <span style={{ color: '#334155', fontSize: 11 }}>{expanded === c.id ? '▲' : '▼'}</span>
            </div>
            {expanded === c.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0 8px 16px' }}>
                <div>
                  <div style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>KB ARTICLES ({c.matchedArticles.length})</div>
                  {c.matchedArticles.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no knowledge base documentation found</div>}
                  {c.matchedArticles.slice(0, 8).map(a => (
                    <div key={a.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{a.label}</span>
                        {a.category && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{a.category}</span>}
                      </div>
                      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '100%' }}>
                        <div style={{ height: '100%', background: '#818cf8', borderRadius: 2, width: `${Math.round(a.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  {c.company && <div style={{ color: '#475569', fontSize: 10, marginTop: 6 }}>{c.company}{c.sector ? ` · ${c.sector}` : ''}</div>}
                </div>
                <div>
                  <div style={{ color: '#fb923c', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>INVESTIGATIONS ({c.matchedCases.length})</div>
                  {c.matchedCases.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no active investigation case detected</div>}
                  {c.matchedCases.slice(0, 8).map(inv => (
                    <div key={inv.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{inv.label}</span>
                        {inv.status && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{inv.status}</span>}
                        {inv.priority && <span style={{ color: '#fb923c', fontSize: 9, border: '1px solid #7c2d12', borderRadius: 3, padding: '0 4px' }}>{inv.priority}</span>}
                      </div>
                      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '100%' }}>
                        <div style={{ height: '100%', background: '#fb923c', borderRadius: 2, width: `${Math.round(inv.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', padding: '20px 0', textAlign: 'center', fontSize: 12 }}>No contacts match current filter</div>
        )}
      </div>

      {/* ASSESS */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#1e293b' : '#083344', border: '1px solid #0e7490', color: '#22d3ee',
          borderRadius: 5, padding: '4px 16px', cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700,
        }}>{assessing ? 'ASSESSING…' : 'ASSESS'}</button>
        {assessment && <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>{assessment}</div>}
      </div>
    </div>
  );
}
