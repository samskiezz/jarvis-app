import { useState, useEffect, useCallback } from 'react';

const API = '';
const CKLITRI_RE = /\b(cklitri|contact[._\-\s]?knowledge[._\-\s]?live|contact[._\-\s]?live[._\-\s]?intel[._\-\s]?kb|active[._\-\s]?contact[._\-\s]?kb|live[._\-\s]?contact[._\-\s]?intel|contact[._\-\s]?kb[._\-\s]?live|dormant[._\-\s]?contact[._\-\s]?triple)\b/i;

export function isCklitriQuery(t) { return CKLITRI_RE.test(t || ''); }

export function buildCklitriScript(data) {
  if (!data) return 'Cross-referencing contacts against knowledge base and live world events now.';
  const rows = data.rows || [];
  const dormant = rows.filter(r => r.state === 'DORMANT').length;
  const fullyActive = rows.filter(r => r.state === 'FULLY ACTIVE').length;
  const total = rows.length;
  const topDormant = rows.filter(r => r.state === 'DORMANT').slice(0, 2).map(r => r.name || 'contact').join(' and ');
  if (dormant > 0) {
    return `CKLITRI alert: ${dormant} of ${total} contacts are DORMANT — no knowledge base documentation and no live world event correlation${topDormant ? ': ' + topDormant : ''}. These contacts lack both background intelligence and real-time situational relevance. Recommend enriching their profiles and reviewing active world events for potential alignment.`;
  }
  return `CKLITRI assessment: ${total} contacts reviewed. ${fullyActive} FULLY ACTIVE contacts are both KB-documented and live-event correlated. All contacts have at least one coverage dimension. Monitor LIVE-TRACKED contacts for emerging KB documentation needs.`;
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, other) {
  const bToks = tokens(other);
  if (!aToks.length || !bToks.length) return 0;
  let hits = 0;
  for (const a of aToks) for (const b of bToks) {
    if (a === b || (a.length > 3 && b.startsWith(a)) || (b.length > 3 && a.startsWith(b))) hits++;
  }
  return hits / Math.max(aToks.length, bToks.length);
}

function normaliseContacts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.results || raw.contacts || raw.items || raw.data || [];
}

function normaliseKB(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.results || raw.articles || raw.documents || raw.items || raw.data || [];
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const arr = raw.earthquakes || raw.quakes || [];
  const crypto = raw.crypto || raw.markets || [];
  const fx = raw.fx || raw.forex || [];
  const combined = [...arr, ...crypto, ...fx];
  if (combined.length) return combined;
  if (Array.isArray(raw)) return raw;
  return raw.results || raw.events || raw.items || raw.data || [];
}

function classifyContact(contact, kbArticles, liveEvents) {
  const cToks = tokens(
    `${contact.name || ''} ${contact.email || ''} ${contact.company || ''} ${contact.title || ''} ${contact.role || ''} ${contact.description || ''} ${(contact.tags || []).join(' ')}`
  );
  const hasKB = kbArticles.some(a =>
    matchScore(cToks, `${a.title || ''} ${a.content || ''} ${a.summary || ''} ${a.subject || ''} ${(a.tags || []).join(' ')}`) > 0.04
  );
  const hasLive = liveEvents.some(e =>
    matchScore(cToks, `${e.title || ''} ${e.place || ''} ${e.location || ''} ${e.type || ''} ${e.symbol || ''} ${e.name || ''} ${e.description || ''}`) > 0.04
  );
  if (hasKB && hasLive) return 'FULLY ACTIVE';
  if (hasKB) return 'KB-BACKED';
  if (hasLive) return 'LIVE-TRACKED';
  return 'DORMANT';
}

const STATE_ORDER = ['FULLY ACTIVE', 'KB-BACKED', 'LIVE-TRACKED', 'DORMANT'];
const STATE_COLOR = {
  'FULLY ACTIVE': '#30D158',
  'KB-BACKED': '#29E7FF',
  'LIVE-TRACKED': '#FFD60A',
  'DORMANT': '#FF9F0A',
};

export default function ContactKnowledgeLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conR, kbR, liR] = await Promise.all([
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/functions/getLiveIntel`),
      ]);
      const [conD, kbD, liD] = await Promise.all([conR.json(), kbR.json(), liR.json()]);
      const contacts = normaliseContacts(conD);
      const kb = normaliseKB(kbD);
      const live = normaliseLiveIntel(liD);
      setKbArticles(kb);
      setLiveEvents(live);
      const classified = contacts.map(c => ({
        ...c,
        state: classifyContact(c, kb, live),
        cToks: tokens(`${c.name || ''} ${c.email || ''} ${c.company || ''} ${c.title || ''} ${c.role || ''} ${c.description || ''} ${(c.tags || []).join(' ')}`),
      }));
      classified.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
      setRows(classified);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:cklitri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:cklitri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  const counts = STATE_ORDER.reduce((acc, s) => {
    acc[s] = rows.filter(r => r.state === s).length;
    return acc;
  }, {});
  const dormantCount = counts['DORMANT'];

  const displayed = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (r.name || '').toLowerCase().includes(q) ||
        (r.company || '').toLowerCase().includes(q) ||
        (r.title || '').toLowerCase().includes(q) ||
        (r.role || '').toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    const dormantNames = rows.filter(r => r.state === 'DORMANT').slice(0, 3).map(r => r.name || 'contact').join(', ');
    const prompt = `CKLITRI contact intelligence coverage: ${rows.length} contacts cross-referenced against ${kbArticles.length} knowledge base articles and ${liveEvents.length} live world events. ${counts['FULLY ACTIVE']} FULLY ACTIVE (KB + live), ${counts['KB-BACKED']} KB-BACKED (documentation only), ${counts['LIVE-TRACKED']} LIVE-TRACKED (world event only), ${dormantCount} DORMANT (no coverage)${dormantNames ? ': ' + dormantNames : ''}. Provide a 2-sentence contact intelligence gap brief identifying the highest-priority dormant contacts and recommended enrichment steps.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {}
    setAssessing(false);
  }

  function getMatchedKB(row) {
    return kbArticles
      .map(a => ({
        a,
        score: matchScore(row.cToks || [], `${a.title || ''} ${a.content || ''} ${a.summary || ''} ${a.subject || ''} ${(a.tags || []).join(' ')}`),
      }))
      .filter(x => x.score > 0.04)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  function getMatchedLive(row) {
    return liveEvents
      .map(e => ({
        e,
        score: matchScore(row.cToks || [], `${e.title || ''} ${e.place || ''} ${e.location || ''} ${e.type || ''} ${e.symbol || ''} ${e.name || ''} ${e.description || ''}`),
      }))
      .filter(x => x.score > 0.04)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 770320, bottom: 8, zIndex: 404,
      width: 460,
      background: 'rgba(8,12,20,0.93)',
      border: `1px solid ${dormantCount > 0 ? '#FF9F0A66' : '#FFFFFF22'}`,
      borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 11,
      color: '#DCEBF5',
      boxShadow: dormantCount > 0 ? '0 0 40px #FF9F0A22' : '0 0 24px #00000055',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #FFFFFF11' }}>
        <span style={{ color: '#FF9F0A', fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ CKLITRI</span>
        <span style={{ color: '#6E8AA0', fontSize: 9, flex: 1 }}>CONTACT × KNOWLEDGE × LIVE INTEL</span>
        {dormantCount > 0 && (
          <span style={{
            background: '#FF9F0A', color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700,
            animation: 'cklitri-pulse 1.4s ease-in-out infinite',
          }}>
            {dormantCount} DORMANT
          </span>
        )}
        {loading && <span style={{ color: '#6E8AA0', fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#6E8AA0',
          cursor: 'pointer', fontSize: 12, padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 5, padding: '6px 12px' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={{
            flex: '1 1 70px', background: 'rgba(255,255,255,0.04)',
            borderRadius: 6, padding: '4px 4px', textAlign: 'center',
            border: `1px solid ${STATE_COLOR[s]}33`,
          }}>
            <div style={{ color: STATE_COLOR[s], fontSize: 14, fontWeight: 700 }}>{counts[s] || 0}</div>
            <div style={{ color: '#6E8AA0', fontSize: 7, letterSpacing: 0.5, marginTop: 1, lineHeight: 1.2 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 12px 4px' }}>
          <div style={{ height: 4, borderRadius: 3, background: '#FFFFFF11', overflow: 'hidden', display: 'flex' }}>
            {STATE_ORDER.map(s => (
              <div key={s} style={{
                width: `${(counts[s] / rows.length) * 100}%`,
                background: STATE_COLOR[s],
                transition: 'width 0.4s',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ color: '#6E8AA0', fontSize: 8 }}>
              {rows.length} contacts · {kbArticles.length} KB articles · {liveEvents.length} live events
            </span>
            <span style={{ color: counts['FULLY ACTIVE'] > 0 ? '#30D158' : '#6E8AA0', fontSize: 8 }}>
              {rows.length > 0 ? Math.round((counts['FULLY ACTIVE'] / rows.length) * 100) : 0}% fully active
            </span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 3, padding: '3px 12px', overflowX: 'auto', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] || '#29E7FF') + '22' : 'none',
            border: `1px solid ${filter === f ? (STATE_COLOR[f] || '#29E7FF') : '#FFFFFF22'}`,
            color: filter === f ? (STATE_COLOR[f] || '#29E7FF') : '#6E8AA0',
            borderRadius: 4, cursor: 'pointer', fontSize: 8, padding: '2px 5px', letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}>
            {f === 'ALL' ? `ALL (${rows.length})` : `${f} (${counts[f] || 0})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '4px 12px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #FFFFFF22', borderRadius: 4,
            color: '#DCEBF5', fontSize: 10, padding: '3px 8px',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 12px' }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: '#6E8AA0', textAlign: 'center', padding: 12, fontSize: 10 }}>
            no contacts matched
          </div>
        )}
        {displayed.map((row, i) => {
          const isExpanded = expanded === i;
          const matchedKB = isExpanded ? getMatchedKB(row) : [];
          const matchedLive = isExpanded ? getMatchedLive(row) : [];
          return (
            <div
              key={i}
              onClick={() => setExpanded(isExpanded ? null : i)}
              style={{
                borderLeft: `3px solid ${STATE_COLOR[row.state]}`,
                padding: '5px 8px', marginBottom: 4, borderRadius: 4,
                background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#DCEBF5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {row.name || '(contact)'}
                  {row.company ? <span style={{ color: '#6E8AA0', marginLeft: 4, fontSize: 9 }}>· {row.company}</span> : null}
                </span>
                {row.title && (
                  <span style={{
                    background: '#FFFFFF11', color: '#8EA3B3',
                    borderRadius: 3, padding: '1px 4px', fontSize: 7, whiteSpace: 'nowrap',
                  }}>{row.title}</span>
                )}
                <span style={{
                  background: STATE_COLOR[row.state] + '33',
                  color: STATE_COLOR[row.state],
                  borderRadius: 3, padding: '1px 5px', fontSize: 7, whiteSpace: 'nowrap', letterSpacing: 0.5,
                }}>{row.state}</span>
              </div>
              {isExpanded && (
                <div style={{ marginTop: 6 }}>
                  {(row.role || row.email) && (
                    <div style={{ color: '#8EA3B3', fontSize: 9, marginBottom: 4 }}>
                      {row.role ? `Role: ${row.role}` : ''}{row.email ? ` · ${row.email}` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Matched KB articles */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#29E7FF', fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>KB ARTICLES</div>
                      {matchedKB.length === 0
                        ? <div style={{ color: '#6E8AA0', fontSize: 9 }}>no knowledge article match</div>
                        : matchedKB.map(({ a, score }, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ color: '#DCEBF5', fontSize: 9, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.title || a.subject || '(article)'}
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: '#29E7FF22', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(score * 400, 100)}%`, background: '#29E7FF', height: '100%' }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                    {/* Matched live events */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#FFD60A', fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>LIVE EVENTS</div>
                      {matchedLive.length === 0
                        ? <div style={{ color: '#6E8AA0', fontSize: 9 }}>no live event match</div>
                        : matchedLive.map(({ e, score }, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ color: '#DCEBF5', fontSize: 9, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.title || e.place || e.symbol || e.name || '(event)'}
                              {e.type && <span style={{ color: '#6E8AA0', marginLeft: 4 }}>· {e.type}</span>}
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: '#FFD60A22', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(score * 400, 100)}%`, background: '#FFD60A', height: '100%' }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ASSESS button */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #FFFFFF11' }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            width: '100%',
            background: assessing ? '#FF9F0A11' : '#FF9F0A22',
            border: '1px solid #FF9F0A55',
            color: '#FF9F0A', borderRadius: 5,
            cursor: assessing ? 'wait' : 'pointer',
            fontSize: 10, padding: '5px 0', letterSpacing: 2,
          }}
        >
          {assessing ? '◉ ASSESSING…' : '▶ ASSESS CONTACT INTEL COVERAGE'}
        </button>
      </div>

      <style>{`@keyframes cklitri-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
