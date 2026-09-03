/**
 * F292 — Knowledge × Ops Events Intelligence Pulse (KOEP)
 *
 * Answers: "Which KB articles have active operational coverage — and which
 * are dormant knowledge not yet exercised by live ops events?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /knowledge/      → KB article list (title, category, summary, tags)
 *   GET /v1/ops/events   → live ops events (title, description, service, severity)
 *
 * Classification:
 *   ACTIVE  — KB article keyword-matches ≥1 live ops event
 *   DORMANT — no matching ops event references this article
 *
 * Stat tiles:  KB articles / ops events / active / dormant
 * Amber badge: active count on button (articles exercised by live ops)
 * Expand row:  matched ops events with severity badge + relevance score bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ KOEP  at left:7260 bottom:18, zIndex:68
 * Event:   jarvis:koep-toggle
 * Voice:   "knowledge ops / ops knowledge / koep / active knowledge /
 *           live knowledge / kb ops coverage / knowledge active /
 *           which kb articles have ops / knowledge operational"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS     = ['ALL', 'ACTIVE', 'DORMANT'];
const CLASS_COLOR = { ACTIVE: AM, DORMANT: MU };

const SEV_COLOR = {
  CRITICAL: RD,
  ERROR:    RD,
  HIGH:     '#F97316',
  WARNING:  AM,
  WARN:     AM,
  INFO:     CY,
  LOW:      GR,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const KOEP_RE =
  /\b(knowledge[._-]?ops?|ops?[._-]?knowledge|koep|active[._-]?knowledge|live[._-]?knowledge|kb[._-]?ops?[._-]?coverage|knowledge[._-]?active|which[._-]?kb[._-]?articles?[._-]?have[._-]?ops?|knowledge[._-]?operational|ops?[._-]?kb|kb[._-]?ops?)\b/i;

export function isKoepQuery(t) {
  return KOEP_RE.test(t || '');
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'items', 'results', 'data', 'entries', 'knowledge'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    title:    a.title || a.name || `Article ${i + 1}`,
    category: a.category || a.type || a.domain || '',
    tags:     [a.title, a.summary, a.content, a.description, a.category,
               Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || '')]
               .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function normEvents(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.events ?? raw?.data ?? []);
  return arr.map((e, i) => ({
    id:       e.id ?? e._id ?? String(i),
    title:    e.title ?? e.name ?? e.event ?? '(ops event)',
    severity: (e.severity ?? e.level ?? e.type ?? 'INFO').toString().toUpperCase(),
    service:  e.service ?? e.source ?? '',
    tags:     [e.title, e.description, e.service, e.source, e.tags, e.component]
               .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function keywords(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(aTags, evTags) {
  const ak = keywords(aTags);
  const ek = keywords(evTags);
  return ak.filter(w => ek.includes(w)).length;
}

function enrich(articles, events) {
  return articles.map(a => {
    const scored = events
      .map(ev => ({ ...ev, _score: relevance(a.tags, ev.tags) }))
      .filter(ev => ev._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return {
      ...a,
      _events: scored,
      _class:  scored.length > 0 ? 'ACTIVE' : 'DORMANT',
    };
  });
}

export async function buildKoepScript() {
  const [kbR, evR] = await Promise.allSettled([
    fetch(`${API}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const articles = normArticles(kbR.status === 'fulfilled' ? kbR.value : []);
  const events   = normEvents(evR.status   === 'fulfilled' ? evR.value : []);
  const rows     = enrich(articles, events);
  const active   = rows.filter(r => r._class === 'ACTIVE').length;
  const dormant  = rows.filter(r => r._class === 'DORMANT').length;
  const critical = events.filter(e => e.severity === 'CRITICAL' || e.severity === 'ERROR').length;
  try {
    const body = {
      message:
        `JARVIS Knowledge × Ops Events Pulse: ${articles.length} KB articles, ${active} are operationally active ` +
        `(matched by live ops events), ${dormant} are dormant with no ops footprint. ` +
        `${events.length} live ops events total, ${critical} critical/error. ` +
        `In 2 sentences, assess which knowledge domains are operationally engaged and whether dormant ` +
        `articles represent gaps in live documentation coverage.`,
    };
    const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    return (
      d.response ?? d.message ?? d.text ??
      `${active} of ${articles.length} KB articles have active ops coverage; ${dormant} are operationally dormant.`
    );
  } catch {
    return `${articles.length} KB articles: ${active} operationally active, ${dormant} dormant — ${critical} critical ops events.`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────
export default function KnowledgeOpsEventPulse() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [articles,  setArticles]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [kbR, evR] = await Promise.allSettled([
        fetch(`${API}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const rawArt = normArticles(kbR.status === 'fulfilled' ? kbR.value : []);
      const rawEv  = normEvents(evR.status   === 'fulfilled' ? evR.value : []);
      setEvents(rawEv);
      setArticles(enrich(rawArt, rawEv));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:koep-toggle', onToggle);
    return () => window.removeEventListener('jarvis:koep-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildKoepScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const active  = articles.filter(a => a._class === 'ACTIVE').length;
  const dormant = articles.filter(a => a._class === 'DORMANT').length;

  const visible = articles.filter(a => {
    if (filter !== 'ALL' && a._class !== filter) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase()) &&
        !a.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Knowledge × Ops Events Intelligence Pulse (KOEP)"
        style={{
          position: 'fixed', left: 7260, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${active > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ KOEP
        {active > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{active}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 660, maxHeight: '75vh', zIndex: 9000,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          ◈ KNOWLEDGE × OPS EVENTS PULSE
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${AM}`, borderRadius: 4, color: AM, fontFamily: MONO, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: `1px solid ${MU}`, borderRadius: 4, color: MU, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>
            {loading ? '…' : '↺'}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, fontFamily: MONO, fontSize: 13, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${BD}` }}>
        {[
          { label: 'KB ARTICLES', value: articles.length, color: CY },
          { label: 'OPS EVENTS',  value: events.length,   color: '#94A3B8' },
          { label: 'ACTIVE',      value: active,           color: AM },
          { label: 'DORMANT',     value: dormant,          color: MU },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.07)', borderBottom: `1px solid ${BD}`, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)', color: RD, fontSize: 10 }}>{error}</div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${BD}` }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? AM : 'none',
            border: `1px solid ${filter === f ? AM : BD}`,
            borderRadius: 4, color: filter === f ? '#000' : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 8px', cursor: 'pointer',
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, borderRadius: 4, color: '#CBD5E1', fontFamily: MONO, fontSize: 10, padding: '2px 8px', width: 120, outline: 'none' }}
        />
      </div>

      {/* Article rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px' }}>
        {loading && articles.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>Loading…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>No articles match filter.</div>
        )}
        {visible.map(a => {
          const classColor = CLASS_COLOR[a._class] ?? MU;
          const isEx = expanded[a.id];
          return (
            <div key={a.id} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [a.id]: !p[a.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                {a.category && (
                  <span style={{ background: 'rgba(6,182,212,0.15)', color: CY, border: `1px solid ${CY}`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{a.category.toUpperCase()}</span>
                )}
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                <span style={{
                  background: classColor + '22',
                  color: classColor,
                  border: `1px solid ${classColor}`,
                  borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 6px',
                }}>{a._class}</span>
                <span style={{ color: MU, fontSize: 10 }}>{isEx ? '▲' : '▼'}</span>
              </div>
              {isEx && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${BD}` }}>
                  {a._events.length === 0 ? (
                    <div style={{ color: MU, fontSize: 10 }}>No matching ops events reference this article.</div>
                  ) : (
                    a._events.map(ev => {
                      const sevColor = SEV_COLOR[ev.severity] ?? MU;
                      const maxScore = a._events[0]?._score || 1;
                      return (
                        <div key={ev.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ background: sevColor + '22', color: sevColor, border: `1px solid ${sevColor}`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{ev.severity}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                            {ev.service && <span style={{ color: MU, fontSize: 9 }}>{ev.service}</span>}
                            <span style={{ color: AM, fontSize: 9 }}>score {ev._score}</span>
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((ev._score / maxScore) * 100)}%`, background: AM, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: MU, fontSize: 9 }}>60 s auto-refresh · {articles.length} KB articles · {events.length} ops events</span>
        <span style={{ color: active > 0 ? AM : MU, fontSize: 9, fontWeight: 700 }}>
          {active > 0 ? `${active} ACTIVE` : 'ALL DORMANT'}
        </span>
      </div>
    </div>
  );
}
