/**
 * LiveIntelThreatSynthesis — F321
 *
 * Parallel-fetches /functions/getLiveIntel + /knowledge/ +
 * /entities/Contact + /entities/RiskSignal.
 *
 * Groups live events by their normalized event category (quake region,
 * crypto symbol, FX pair, etc.) and keyword-matches each event against
 * knowledge article titles/categories, contact names/roles/orgs, and
 * risk signal titles/categories to classify:
 *
 *   FULLY_GROUNDED — event matches a knowledge article AND a contact AND a risk signal
 *   KNOWLEDGE_ONLY — event matches knowledge + at least one of contact/signal
 *   SIGNALED       — event matches a risk signal but no knowledge article
 *   DARK           — no match to any source (live event blind spot)
 *
 * Toggle: ◈ TISYNTH button (fixed, bottom strip) left:227560, zIndex:417
 * Stat tiles: events / knowledge / contacts / signals / grounded / knowledge_only / signaled / dark
 * Red pulse on DARK count (blind spots).
 * Expandable rows: matched knowledge articles with category badge +
 *                  matched contacts with role/org +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / FULLY_GROUNDED / KNOWLEDGE_ONLY / SIGNALED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tisynth"/"threat synthesis"/"live intel synthesis"/"intel threat synthesis"
 *        "live threat intelligence"/"intel synthesis"/"threat intel grounding"
 * Event: jarvis:tisynth-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';
const BTN_LEFT = 227560;
const Z = 417;
const TABS = ['ALL', 'FULLY_GROUNDED', 'KNOWLEDGE_ONLY', 'SIGNALED', 'DARK'];

const CLS_COLOR = {
  FULLY_GROUNDED: '#22C55E',
  KNOWLEDGE_ONLY: '#38BDF8',
  SIGNALED:       '#F97316',
  DARK:           '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data))    return raw.data;
  return [];
}

function extractEvents(raw) {
  if (!raw) return [];
  // getLiveIntel returns { earthquakes:[], crypto:[], fx:[], ... }
  const events = [];
  const eq = raw.earthquakes || raw.quakes || [];
  if (Array.isArray(eq)) eq.forEach(e => events.push({ ...e, _kind: 'quake' }));
  const cr = raw.crypto || [];
  if (Array.isArray(cr)) cr.forEach(c => events.push({ ...c, _kind: 'crypto' }));
  const fx = raw.fx || raw.forex || [];
  if (Array.isArray(fx)) fx.forEach(f => events.push({ ...f, _kind: 'fx' }));
  // fallback: if it's an array directly
  if (!events.length && Array.isArray(raw)) raw.forEach(e => events.push(e));
  return events;
}

function eventLabel(ev) {
  return ev.symbol || ev.pair || ev.location || ev.region ||
         ev.place  || ev.name || ev._kind || 'event';
}

function eventTokens(ev) {
  const parts = [
    ev.symbol, ev.pair, ev.location, ev.region, ev.place,
    ev.name, ev.title, ev._kind, ev.category, ev.type,
    ev.description, ev.mag != null ? `magnitude ${ev.mag}` : '',
  ];
  return tokens(parts.filter(Boolean).join(' '));
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    a.play();
  } catch {}
}

export function isTisynthQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes('tisynth') || t.includes('threat synthesis') ||
    t.includes('live intel synthesis') || t.includes('intel threat synthesis') ||
    t.includes('live threat intelligence') || t.includes('intel synthesis') ||
    t.includes('threat intel grounding')
  );
}

export function buildTisynthScript(q) {
  return `Synthesize live intelligence threat assessment for: "${q}". ` +
    'Return JSON with keys: summary (string), dark_spots (array of event labels), top_signals (array), recommendation (string).';
}

export default function LiveIntelThreatSynthesis() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [stats, setStats]     = useState({ total:0, knowledge:0, contacts:0, signals:0, grounded:0, know_only:0, signaled:0, dark:0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:tisynth-toggle', toggle);
    return () => window.removeEventListener('jarvis:tisynth-toggle', toggle);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [intelRaw, knowledgeRaw, contactsRaw, signalsRaw] = await Promise.all([
        fetch(`${apiBase()}/functions/getLiveIntel`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase()}/knowledge/`,             { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase()}/entities/Contact`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase()}/entities/RiskSignal`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const events   = extractEvents(intelRaw);
      const articles = normArray(knowledgeRaw, 'articles', 'knowledge');
      const contacts = normArray(contactsRaw,  'contacts', 'entities');
      const signals  = normArray(signalsRaw,   'risk_signals', 'riskSignals', 'entities');

      const built = events.map(ev => {
        const eToks = eventTokens(ev);
        const matchedArticles = articles.filter(a =>
          overlaps(eToks, `${a.title} ${a.category} ${a.content || ''} ${a.summary || ''}`)
        );
        const matchedContacts = contacts.filter(c =>
          overlaps(eToks, `${c.name} ${c.role} ${c.organisation || c.org || c.organization || ''} ${c.tags || ''}`)
        );
        const matchedSignals = signals.filter(s =>
          overlaps(eToks, `${s.title || s.name} ${s.category} ${s.description || ''}`)
        );

        let cls;
        const hasKnow  = matchedArticles.length > 0;
        const hasCon   = matchedContacts.length > 0;
        const hasSig   = matchedSignals.length > 0;
        if (hasKnow && hasCon && hasSig) cls = 'FULLY_GROUNDED';
        else if (hasKnow && (hasCon || hasSig)) cls = 'KNOWLEDGE_ONLY';
        else if (hasSig) cls = 'SIGNALED';
        else cls = 'DARK';

        return { ev, label: eventLabel(ev), eToks, matchedArticles, matchedContacts, matchedSignals, cls };
      });

      setRows(built);
      setStats({
        total:      built.length,
        knowledge:  articles.length,
        contacts:   contacts.length,
        signals:    signals.length,
        grounded:   built.filter(r => r.cls === 'FULLY_GROUNDED').length,
        know_only:  built.filter(r => r.cls === 'KNOWLEDGE_ONLY').length,
        signaled:   built.filter(r => r.cls === 'SIGNALED').length,
        dark:       built.filter(r => r.cls === 'DARK').length,
      });
    } catch (e) {
      setErr(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const dark = rows.filter(r => r.cls === 'DARK').map(r => r.label).slice(0, 10);
      const prompt = `TISYNTH: Live intel has ${stats.total} events. ${stats.dark} are DARK (no grounding). ` +
        `Dark events: ${dark.join(', ') || 'none'}. ` +
        `Grounded: ${stats.grounded}. Signaled: ${stats.signaled}. Knowledge-linked: ${stats.know_only}. ` +
        `Provide a 2-sentence threat synthesis advisory and top remediation priority.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || d.response || 'Assessment unavailable.').trim();
      setAssessText(text);
      await tts(text);
    } catch { setAssessText('Assessment unavailable.'); }
    finally { setAssessing(false); }
  }, [rows, stats]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 12, left: BTN_LEFT, zIndex: Z,
          background: 'rgba(10,10,20,0.85)', color: '#38BDF8',
          border: '1px solid #38BDF8', borderRadius: 4,
          padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
          whiteSpace: 'nowrap',
        }}
      >◈ TISYNTH</button>
    );
  }

  const pulse = stats.dark > 0;
  const filtered = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || r.label.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', bottom: 48, left: BTN_LEFT, zIndex: Z,
      width: 680, maxHeight: '70vh', overflowY: 'auto',
      background: 'rgba(5,10,20,0.97)', border: '1px solid #38BDF8',
      borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#CBD5E1',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#38BDF8', fontWeight: 700, fontSize: 13 }}>
          ◈ TISYNTH — Threat Intelligence Synthesis
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchData} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          { label: 'EVENTS',    val: stats.total,    color: '#94A3B8' },
          { label: 'KNOWLEDGE', val: stats.knowledge, color: '#94A3B8' },
          { label: 'CONTACTS',  val: stats.contacts,  color: '#94A3B8' },
          { label: 'SIGNALS',   val: stats.signals,   color: '#94A3B8' },
          { label: 'GROUNDED',  val: stats.grounded,  color: CLS_COLOR.FULLY_GROUNDED },
          { label: 'KNOW+',     val: stats.know_only, color: CLS_COLOR.KNOWLEDGE_ONLY },
          { label: 'SIGNALED',  val: stats.signaled,  color: CLS_COLOR.SIGNALED },
          {
            label: 'DARK', val: stats.dark, color: CLS_COLOR.DARK,
            pulse,
          },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.8)', border: `1px solid ${s.color}44`,
            borderRadius: 4, padding: '4px 10px', textAlign: 'center', minWidth: 72,
            animation: s.pulse ? 'pulse-red 1.4s ease-in-out infinite' : 'none',
          }}>
            <div style={{ color: s.color, fontWeight: 700, fontSize: 16 }}>{s.val}</div>
            <div style={{ color: '#64748B', fontSize: 10 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CLS_COLOR[t] || '#38BDF8' : 'rgba(30,41,59,0.6)',
            color: tab === t ? '#000' : '#94A3B8',
            border: 'none', borderRadius: 3, padding: '3px 8px',
            cursor: 'pointer', fontSize: 10, fontWeight: 600,
          }}>{t}</button>
        ))}
      </div>

      {/* Search */}
      <input
        placeholder="search events…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(15,23,42,0.9)', border: '1px solid #334155',
          borderRadius: 4, padding: '4px 8px', color: '#CBD5E1',
          fontSize: 11, marginBottom: 10,
        }}
      />

      {/* Status */}
      {loading && <div style={{ color: '#64748B', marginBottom: 8 }}>Loading…</div>}
      {err     && <div style={{ color: '#EF4444', marginBottom: 8 }}>Error: {err}</div>}

      {/* Rows */}
      {filtered.map((row, i) => {
        const isExp = !!expanded[i];
        const clr   = CLS_COLOR[row.cls];
        return (
          <div key={i} style={{ borderBottom: '1px solid #1E293B', marginBottom: 4 }}>
            <div
              onClick={() => setExpanded(v => ({ ...v, [i]: !v[i] }))}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}
            >
              <span style={{ color: clr, fontWeight: 700, fontSize: 11, minWidth: 120 }}>{row.cls}</span>
              <span style={{ flex: 1, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.label}
              </span>
              <span style={{ color: '#64748B', fontSize: 10 }}>
                {row.matchedArticles.length}art {row.matchedContacts.length}con {row.matchedSignals.length}sig
              </span>
              <span style={{ color: '#475569', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
            </div>
            {isExp && (
              <div style={{ padding: '6px 0 6px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {row.matchedArticles.length > 0 && (
                  <div>
                    <div style={{ color: '#64748B', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.matchedArticles.slice(0, 6).map((a, j) => (
                        <span key={j} style={{
                          background: 'rgba(56,189,248,0.12)', color: '#38BDF8',
                          border: '1px solid #38BDF844', borderRadius: 3, padding: '2px 6px', fontSize: 10,
                        }}>{a.title || a.name} {a.category ? <em style={{ color: '#64748B' }}>· {a.category}</em> : ''}</span>
                      ))}
                    </div>
                  </div>
                )}
                {row.matchedContacts.length > 0 && (
                  <div>
                    <div style={{ color: '#64748B', fontSize: 10, marginBottom: 3 }}>CONTACTS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.matchedContacts.slice(0, 6).map((c, j) => (
                        <span key={j} style={{
                          background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                          border: '1px solid #22C55E44', borderRadius: 3, padding: '2px 6px', fontSize: 10,
                        }}>{c.name} {c.role ? <em style={{ color: '#64748B' }}>· {c.role}</em> : ''}</span>
                      ))}
                    </div>
                  </div>
                )}
                {row.matchedSignals.length > 0 && (
                  <div>
                    <div style={{ color: '#64748B', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.matchedSignals.slice(0, 6).map((s, j) => {
                        const sev = (s.severity || s.level || 'info').toLowerCase();
                        return (
                          <span key={j} style={{
                            background: `${SEV_COLOR[sev] || '#64748B'}18`,
                            color: SEV_COLOR[sev] || '#94A3B8',
                            border: `1px solid ${SEV_COLOR[sev] || '#64748B'}44`,
                            borderRadius: 3, padding: '2px 6px', fontSize: 10,
                          }}>{s.title || s.name} <em style={{ color: '#64748B' }}>· {sev}</em></span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && filtered.length === 0 && (
        <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No events found</div>
      )}

      {/* ASSESS */}
      <div style={{ marginTop: 12, borderTop: '1px solid #1E293B', paddingTop: 10 }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: 'rgba(56,189,248,0.15)', color: '#38BDF8',
            border: '1px solid #38BDF8', borderRadius: 4,
            padding: '5px 14px', cursor: assessing ? 'wait' : 'pointer',
            fontSize: 11, fontWeight: 600,
          }}
        >{assessing ? '…' : '▶ ASSESS'}</button>
        {assessText && (
          <div style={{ marginTop: 8, color: '#CBD5E1', lineHeight: 1.5, fontSize: 11 }}>{assessText}</div>
        )}
      </div>

      <style>{`
        @keyframes pulse-red {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
