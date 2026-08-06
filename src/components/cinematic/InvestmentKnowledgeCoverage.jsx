import { useState, useEffect, useCallback } from 'react';

const API = '';

const INVKB_RE = /\b(investment[._-]?knowledge|knowledge[._-]?invest|invkb|investment[._-]?kb|knowledge[._-]?backed[._-]?invest|invest[._-]?knowledge[._-]?gap|which[._-]?investments?[._-]?have[._-]?knowledge|portfolio[._-]?knowledge|invest[._-]?docs?)\b/i;

export function isInvkbQuery(t) {
  return INVKB_RE.test(t || '');
}

export async function buildInvkbScript() {
  try {
    const hdr = { Authorization: 'Bearer dev-key' };
    const [invR, kbR] = await Promise.allSettled([
      fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
    ]);
    const investments = normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []);
    const articles    = normaliseKB(kbR.status === 'fulfilled' ? kbR.value : []);
    const enriched    = correlate(investments, articles);
    const informed    = enriched.filter(inv => inv._informed).length;
    const blind       = enriched.length - informed;
    const topBlind    = enriched.filter(inv => !inv._informed).slice(0, 4).map(inv => inv.name || inv.id || '?').join(', ') || 'none';
    return (
      `Investment × Knowledge Coverage: ${investments.length} investments cross-matched against ` +
      `${articles.length} KB articles. ${informed} investments are INFORMED (KB article coverage found); ` +
      `${blind} are BLIND (no knowledge backing — intelligence gap). ` +
      `Top uncovered: ${topBlind}.`
    );
  } catch {
    return 'Investment × Knowledge Coverage assessment unavailable at this time, sir.';
  }
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.investments)           ? raw.investments
    : Array.isArray(raw?.items)                 ? raw.items
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.data)                  ? raw.data
    : [];
  return arr.map((inv, i) => ({
    id:          inv.id          || String(i),
    name:        inv.name        || inv.title    || inv.label || `Investment ${i + 1}`,
    sector:      inv.sector      || inv.industry || inv.category || inv.type || '',
    ticker:      inv.ticker      || inv.symbol   || inv.code || '',
    notes:       String(inv.notes || inv.description || inv.summary || '').slice(0, 300),
    tags:        Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
    region:      inv.region      || inv.country  || inv.market || '',
    assetClass:  inv.asset_class || inv.assetClass || inv.class || '',
  }));
}

function normaliseKB(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.articles)         ? raw.articles
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.data)             ? raw.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.slug     || String(i),
    title:    a.title    || a.name     || a.label || `Article ${i + 1}`,
    category: a.category || a.type     || a.domain || '',
    summary:  String(a.summary || a.content || a.body || a.abstract || a.description || '').slice(0, 400),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function investTokens(inv) {
  return new Set([
    ...tokens(inv.name),
    ...tokens(inv.sector),
    ...tokens(inv.ticker),
    ...tokens(inv.notes),
    ...tokens(inv.tags),
    ...tokens(inv.region),
    ...tokens(inv.assetClass),
  ].filter(Boolean));
}

function articleTokens(article) {
  return [
    ...tokens(article.title),
    ...tokens(article.category),
    ...tokens(article.summary),
    ...tokens(article.tags),
  ].filter(Boolean);
}

function matchScore(inv, article) {
  const invToks = investTokens(inv);
  const artToks = articleTokens(article);
  if (!invToks.size || !artToks.length) return 0;
  let hits = 0;
  for (const t of artToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, artToks.length);
}

function correlate(investments, articles) {
  return investments.map(inv => {
    const scored = articles
      .map(a => ({ ...a, _score: matchScore(inv, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...inv, _informed: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 600;
const PANEL_H = 570;
const AM = '#F59E0B';
const CY = '#00CFFF';
const GR = '#22C55E';
const PU = '#A78BFA';

const chip = (label, color = AM) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
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

export default function InvestmentKnowledgeCoverage() {
  const [open, setOpen]             = useState(false);
  const [investments, setInvestments] = useState([]);
  const [articles, setArticles]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [brief, setBrief]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: 'Bearer dev-key' };
      const [invR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      setInvestments(normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []));
      setArticles(normaliseKB(kbR.status === 'fulfilled' ? kbR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:invkb-toggle', onToggle);
    return () => window.removeEventListener('jarvis:invkb-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(investments, articles);
  const informed = enriched.filter(inv => inv._informed);
  const blind    = enriched.filter(inv => !inv._informed);
  const badgeCount = blind.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(inv => tab === 'ALL' || (tab === 'INFORMED' ? inv._informed : !inv._informed))
    .filter(inv => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(inv.name   || '').toLowerCase().includes(s) ||
        String(inv.sector || '').toLowerCase().includes(s) ||
        String(inv.ticker || '').toLowerCase().includes(s) ||
        String(inv.region || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const topBlind = blind.slice(0, 4).map(inv => inv.name || inv.id || '?').join(', ') || 'none';
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message:
            `Investment × Knowledge Coverage: ${investments.length} investments, ${articles.length} KB articles. ` +
            `${informed.length} investments are INFORMED (KB article coverage found). ` +
            `${blind.length} are BLIND (no knowledge backing — intelligence gap). ` +
            `Uncovered investments: ${topBlind}. ` +
            `Give a 2-sentence investment-knowledge coverage brief highlighting the most significant intelligence gap.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = inv => inv.name || inv.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Investment × Knowledge Coverage (INVKB)"
        style={{
          position: 'fixed', left: 710400, bottom: 8, zIndex: 297,
          width: 58, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ INVKB
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
          width: PANEL_W, height: PANEL_H, zIndex: 9202,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${AM}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${AM}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AM}` }}>
              ◈ INVESTMENT × KNOWLEDGE COVERAGE
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

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'INVESTMENTS', val: investments.length, col: CY },
              { label: 'KB ARTICLES', val: articles.length,   col: PU },
              { label: 'INFORMED',    val: informed.length,   col: GR },
              { label: 'BLIND',       val: blind.length,      col: AM },
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

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'INFORMED', 'BLIND'].map(t => (
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
              placeholder="search investments…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          {/* Investment list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No investments found.'}
              </div>
            ) : filtered.map((inv, i) => {
              const isExp   = expanded === i;
              const statusC = inv._informed ? GR : AM;
              return (
                <div
                  key={inv.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusC,
                      boxShadow: `0 0 6px ${statusC}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(inv)}</span>
                    {inv.ticker && chip(inv.ticker, CY)}
                    {inv.sector && chip(inv.sector, '#6E8AA0')}
                    {chip(inv._informed ? 'INFORMED' : 'BLIND', statusC)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {inv._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED KB ARTICLES
                          </div>
                          {inv._matches.map((art, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {art.title || art.id || '?'}
                              </span>
                              {art.category && chip(art.category, PU)}
                              {scorebar(art._score, AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No KB articles matched — investment intelligence gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
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
