import { useState, useEffect, useCallback } from 'react';

const API = '';
const CLIE_RE = /\b(contact[._-]?live[._-]?intel|live[._-]?contact|clie|contact[._-]?world[._-]?event|triggered[._-]?contacts|contact[._-]?intel[._-]?exposure|contact[._-]?live[._-]?world|live[._-]?contact[._-]?exposure)\b/i;

export function isClieQuery(t) {
  return CLIE_RE.test(t || '');
}

export const isCxlintelQuery = isClieQuery;

export async function buildClieScript() {
  const [ctR, inR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact?limit=200`).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
  ]);
  const contacts = normaliseArray(ctR.status === 'fulfilled' ? ctR.value : []);
  const intel = normaliseArray(inR.status === 'fulfilled' ? inR.value : []);
  const enriched = correlate(contacts, intel);
  const triggered = enriched.filter(c => c._triggered).length;
  return `Contact × Live Intel Exposure: ${contacts.length} contacts, ${intel.length} live events, ${triggered} triggered (intersecting world event). ` +
    `Triggered contacts: ${enriched.filter(c => c._triggered).slice(0, 5).map(c => c.name || c.id).join(', ') || 'none'}.`;
}

export const buildCxlintelScript = buildClieScript;

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'contacts', 'events', 'records', 'intel']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(contact, event) {
  const ctToks = new Set([
    ...tokens(contact.name),
    ...tokens(contact.organization),
    ...tokens(contact.sector),
    ...tokens(contact.region),
    ...tokens(contact.tags),
    ...tokens(contact.description),
  ].filter(Boolean));
  const evToks = [
    ...tokens(event.title),
    ...tokens(event.type),
    ...tokens(event.region),
    ...tokens(event.sector),
    ...tokens(event.category),
    ...tokens(event.description),
    ...tokens(event.tags),
  ].filter(Boolean);
  if (!ctToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (ctToks.has(t)) hits++;
  return hits / Math.max(ctToks.size, evToks.length);
}

function correlate(contacts, intel) {
  return contacts.map(c => {
    const scored = intel
      .map(ev => ({ ev, score: matchScore(c, ev) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...c, _matches: scored, _triggered: scored.length > 0, _topScore: scored[0]?.score || 0 };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function ContactLiveIntelExposure() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [intel, setIntel] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [ctR, inR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact?limit=200`).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
      ]);
      const cts = normaliseArray(ctR.status === 'fulfilled' ? ctR.value : []);
      const ins = normaliseArray(inR.status === 'fulfilled' ? inR.value : []);
      setContacts(cts);
      setIntel(ins);
      setEnriched(correlate(cts, ins));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:clie-toggle', h);
    return () => window.removeEventListener('jarvis:clie-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const triggered = enriched.filter(c => c._triggered);
    const prompt = `Contact × Live Intel Exposure: ${contacts.length} contacts, ${intel.length} live world events. ` +
      `${triggered.length} contacts triggered (world-event intersection). ` +
      `Triggered contacts: ${triggered.slice(0, 6).map(c => c.name || c.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence intelligence-exposure brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const triggered = enriched.filter(c => c._triggered);
  const badge = triggered.length > 0 ? '#f43f5e' : '#22c55e';

  const visible = enriched.filter(c => {
    const label = (c.name || c.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'TRIGGERED') return c._triggered;
    if (tab === 'QUIET') return !c._triggered;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact × Live Intel Exposure"
        style={{
          position: 'fixed', left: 347380, bottom: 8, zIndex: 170,
          background: 'rgba(0,0,0,0.85)', border: `1px solid ${badge}`,
          color: badge, borderRadius: 6, padding: '3px 9px', fontSize: 11,
          fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          boxShadow: triggered.length > 0 ? `0 0 8px ${badge}55` : 'none',
          fontFamily: 'monospace',
        }}
      >
        ◈ CLIE
        {triggered.length > 0 && (
          <span style={{ ...PILL, background: '#f43f5e22', color: '#f43f5e', marginLeft: 6 }}>
            {triggered.length} triggered
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: 60, right: 20, width: 620, maxHeight: '82vh',
          background: 'rgba(8,12,20,0.97)', border: '1px solid rgba(244,63,94,0.35)',
          borderRadius: 12, zIndex: 9201, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)', fontFamily: 'monospace',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#f43f5e', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ CONTACT × LIVE INTEL</span>
            <span style={{ ...PILL, background: '#22c55e22', color: '#22c55e' }}>{enriched.filter(c => !c._triggered).length} quiet</span>
            {triggered.length > 0 && <span style={{ ...PILL, background: '#f43f5e22', color: '#f43f5e' }}>{triggered.length} triggered</span>}
            {loading && <span style={{ color: '#888', fontSize: 11 }}>loading…</span>}
            <span style={{ flex: 1 }} />
            <button onClick={assess} disabled={assessing} style={{ fontSize: 11, color: '#f43f5e', background: 'transparent', border: '1px solid #f43f5e55', borderRadius: 5, padding: '2px 9px', cursor: 'pointer' }}>
              {assessing ? '…' : '▶ ASSESS'}
            </button>
            <button onClick={() => setOpen(false)} style={{ color: '#888', background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', marginLeft: 6 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { label: 'Contacts', val: contacts.length, color: '#60a5fa' },
              { label: 'Live Events', val: intel.length, color: '#a78bfa' },
              { label: 'Triggered', val: triggered.length, color: triggered.length > 0 ? '#f43f5e' : '#555' },
              { label: 'Quiet', val: enriched.filter(c => !c._triggered).length, color: '#22c55e' },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ color: t.color, fontWeight: 700, fontSize: 18 }}>{t.val}</div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
            {['ALL', 'TRIGGERED', 'QUIET'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
                background: tab === t ? 'rgba(244,63,94,0.18)' : 'transparent',
                border: tab === t ? '1px solid #f43f5e55' : '1px solid transparent',
                color: tab === t ? '#f43f5e' : '#888',
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="filter contacts…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc', borderRadius: 5, padding: '3px 9px', fontSize: 11, width: 160 }}
            />
          </div>

          {assessment && (
            <div style={{ padding: '8px 14px', background: 'rgba(244,63,94,0.07)', borderBottom: '1px solid rgba(244,63,94,0.15)', color: '#fda4af', fontSize: 12 }}>
              {assessment}
            </div>
          )}

          {err && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 12 }}>{err}</div>}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: '#555', padding: 20, textAlign: 'center', fontSize: 12 }}>No contacts</div>
            )}
            {visible.map((c, i) => {
              const key = c.id || c._id || i;
              const label = c.name || c.id || `contact-${i}`;
              const isExp = expanded === key;
              return (
                <div key={key}>
                  <div
                    onClick={() => setExpanded(isExp ? null : key)}
                    style={{ ...ROW, background: isExp ? 'rgba(244,63,94,0.06)' : 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(244,63,94,0.06)' : 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: c._triggered ? '#f43f5e22' : '#22c55e22', color: c._triggered ? '#f43f5e' : '#22c55e' }}>
                        {c._triggered ? 'TRIGGERED' : 'QUIET'}
                      </span>
                      <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1 }}>{label}</span>
                      {c.organization && <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>{c.organization}</span>}
                      {c.sector && <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>{c.sector}</span>}
                      {c._triggered && c._topScore > 0 && (
                        <span style={{ color: '#f43f5e', fontSize: 10 }}>{Math.round(c._topScore * 100)}%</span>
                      )}
                      <span style={{ color: '#555', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {isExp && (
                    <div style={{ padding: '8px 18px 12px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {c.description && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{c.description}</div>}
                      {c._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>Live event matches:</div>
                          {c._matches.map(({ ev, score }, j) => (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ color: '#f43f5e', fontSize: 11, flex: 1 }}>{ev.title || ev.type || ev.id}</span>
                                {ev.region && <span style={{ color: '#888', fontSize: 10 }}>{ev.region}</span>}
                                <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#f43f5e', borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: '#22c55e', fontSize: 11 }}>✓ No live world event intersection for this contact.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
