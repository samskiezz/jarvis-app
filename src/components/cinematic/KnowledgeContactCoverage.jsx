import { useState, useEffect, useCallback } from 'react';

const API = '';
const CKBASE_RE = /\b(contact[._-]?knowledge|knowledge[._-]?contact[s]?|ckbase|contact[._-]?kb|knowledge[._-]?backed[._-]?contact[s]?|contact[._-]?intel[._-]?base|unknown[._-]?contact[s]?|contact[._-]?knowledge[._-]?gap|kb[._-]?contact[s]?|contact[._-]?knowledge[._-]?coverage)\b/i;

export function isCkbaseQuery(t) {
  return CKBASE_RE.test(t || '');
}

export async function buildCkbaseScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [ctR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);
  const contacts = normaliseContacts(ctR.status === 'fulfilled' ? ctR.value : []);
  const articles = normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []);
  const enriched = correlate(contacts, articles);
  const referenced = enriched.filter(c => c._linked).length;
  const unknown = enriched.filter(c => !c._linked).length;
  return (
    `Knowledge × Contact Coverage: ${contacts.length} contacts cross-matched against ${articles.length} knowledge base articles. ` +
    `${referenced} contacts are REFERENCED (at least one KB article covers their domain); ${unknown} are UNKNOWN (no knowledge base coverage — intelligence gap). ` +
    `Top unknown contacts: ${enriched.filter(c => !c._linked).slice(0, 3).map(c => c.name || c.email || '?').join(', ') || 'none'}.`
  );
}

function normaliseContacts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['contacts', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseArticles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['articles', 'knowledge', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contact, article) {
  const cToks = new Set([
    ...tokens(contact.name),
    ...tokens(contact.email),
    ...tokens(contact.company),
    ...tokens(contact.title),
    ...tokens(contact.description),
    ...tokens(contact.role),
    ...tokens(contact.tags),
  ].filter(Boolean));
  const aToks = [
    ...tokens(article.title),
    ...tokens(article.name),
    ...tokens(article.summary),
    ...tokens(article.content),
    ...tokens(article.type),
    ...tokens(article.category),
    ...tokens(article.tags),
  ].filter(Boolean);
  if (!cToks.size || !aToks.length) return 0;
  let hits = 0;
  for (const t of aToks) if (cToks.has(t)) hits++;
  return hits / Math.max(cToks.size, aToks.length);
}

function correlate(contacts, articles) {
  return contacts.map(ct => {
    const scored = articles
      .map(a => ({ a, score: matchScore(ct, a) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...ct, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const PU = '#A78BFA';

const chip = (label, color = AM) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = AM) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function KnowledgeContactCoverage() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [ctR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      setContacts(normaliseContacts(ctR.status === 'fulfilled' ? ctR.value : []));
      setArticles(normaliseArticles(kbR.status === 'fulfilled' ? kbR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ckbase-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ckbase-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(contacts, articles);
  const referenced = enriched.filter(c => c._linked);
  const unknown = enriched.filter(c => !c._linked);
  const badgeCount = unknown.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(c => tab === 'ALL' || (tab === 'REFERENCED' ? c._linked : !c._linked))
    .filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.email || '').toLowerCase().includes(q) ||
        String(c.company || '').toLowerCase().includes(q) ||
        String(c.title || '').toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          message:
            `You have ${contacts.length} contacts cross-matched against ${articles.length} knowledge base articles. ` +
            `${referenced.length} contacts are REFERENCED (at least one KB article covers their domain). ` +
            `${unknown.length} are UNKNOWN (no knowledge base coverage — intelligence gap). ` +
            `Top unknown contacts: ${unknown.slice(0, 3).map(c => c.name || c.email || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence contact-knowledge coverage brief: which contact domains have strong KB backing, and which contacts represent the biggest intelligence gaps.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const contactLabel = c => c.name || c.email || c.id || '?';
  const articleLabel = a => a.title || a.name || a.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Knowledge × Contact Coverage (CKBASE)"
        style={{
          position: 'fixed', left: 685200, bottom: 8, zIndex: 252,
          width: 72, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ CKBASE
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9212,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${AM}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${AM}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AM}` }}>
              ◈ KNOWLEDGE × CONTACT COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${AM}55`,
                  background: 'transparent', color: AM, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'CONTACTS', val: contacts.length, col: CY },
              { label: 'KB ARTICLES', val: articles.length, col: PU },
              { label: 'REFERENCED', val: referenced.length, col: GR },
              { label: 'UNKNOWN', val: unknown.length, col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'REFERENCED', 'UNKNOWN'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? AM : '#2a3a4a'}`,
                  background: tab === t ? `${AM}22` : 'transparent',
                  color: tab === t ? AM : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No contacts found.'}
              </div>
            ) : filtered.map((ct, i) => {
              const isRef = ct._linked;
              const statusColor = isRef ? GR : AM;
              const isExp = expanded === i;
              return (
                <div key={ct.id || i} style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{contactLabel(ct)}</span>
                    {ct.company && chip(String(ct.company).slice(0, 14), CY)}
                    {ct.title && chip(String(ct.title).slice(0, 12), PU)}
                    {chip(isRef ? 'REFERENCED' : 'UNKNOWN', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {ct._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING KB ARTICLES
                          </div>
                          {ct._matches.map(({ a, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {a.type && chip(String(a.type).slice(0, 10).toUpperCase(), PU)}
                              {a.category && chip(String(a.category).slice(0, 10), CY)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {articleLabel(a).slice(0, 55)}
                              </span>
                              {scorebar(score, AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No knowledge base articles match this contact's domain.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${AM}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(245,158,11,0.03)',
            }}>
              <span style={{ color: AM, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
