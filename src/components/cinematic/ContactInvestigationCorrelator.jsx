import { useState, useEffect, useCallback } from 'react';

const API = '';
const CINV_RE = /\b(contact[._-]?invest|invest[._-]?contact|cinv|linked[._-]?contacts?|contacts?[._-]?with[._-]?cases?|contact[._-]?case[._-]?link|investigation[._-]?contacts?|which[._-]?contacts?[._-]?(are[._-]?in|have)[._-]?invest|contact[._-]?invest[._-]?coverage|contact[._-]?cases?)\b/i;

export function isCinvQuery(t) {
  return CINV_RE.test(t || '');
}

export async function buildCinvScript() {
  const [contR, invR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);
  const contacts = normaliseArray(contR.status === 'fulfilled' ? contR.value : []);
  const investigations = normaliseInv(invR.status === 'fulfilled' ? invR.value : []);
  const enriched = correlate(contacts, investigations);
  const linked = enriched.filter(c => c._linked).length;
  const unlinked = enriched.length - linked;
  return (
    `Contact × Investigation Correlation: ${contacts.length} contacts, ${investigations.length} investigations indexed. ` +
    `${linked} contacts are linked to active investigations; ${unlinked} have no investigative context. ` +
    `Top linked: ${enriched.filter(c => c._linked).slice(0, 4).map(c => c.name || c.title || c.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'contacts', 'entities', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseInv(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['investigations', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contact, inv) {
  const contactToks = new Set([
    ...tokens(contact.name),
    ...tokens(contact.title),
    ...tokens(contact.email),
    ...tokens(contact.company),
    ...tokens(contact.description),
  ].filter(Boolean));
  const invToks = [
    ...tokens(inv.title),
    ...tokens(inv.name),
    ...tokens(inv.description),
    ...tokens(inv.subject),
    ...tokens(inv.kind),
  ].filter(Boolean);
  if (!contactToks.size || !invToks.length) return 0;
  let hits = 0;
  for (const t of invToks) if (contactToks.has(t)) hits++;
  return hits / Math.max(contactToks.size, invToks.length);
}

function correlate(contacts, investigations) {
  return contacts.map(contact => {
    const scored = investigations
      .map(inv => ({ inv, score: matchScore(contact, inv) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...contact, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PU = '#A78BFA';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function ContactInvestigationCorrelator() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contR, invR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);
      setContacts(normaliseArray(contR.status === 'fulfilled' ? contR.value : []));
      setInvestigations(normaliseInv(invR.status === 'fulfilled' ? invR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:cinv-toggle', onToggle);
    return () => window.removeEventListener('jarvis:cinv-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(contacts, investigations);
  const linked = enriched.filter(c => c._linked);
  const unlinked = enriched.filter(c => !c._linked);
  const badgeCount = linked.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(c => tab === 'ALL' || (tab === 'LINKED' ? c._linked : !c._linked))
    .filter(c => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(c.name || '').toLowerCase().includes(s) ||
        String(c.title || '').toLowerCase().includes(s) ||
        String(c.company || '').toLowerCase().includes(s) ||
        String(c.email || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${contacts.length} contacts and ${investigations.length} investigations. ${linked.length} contacts are linked to investigations; ${unlinked.length} have no investigative context. Give a 2-sentence contact investigation brief highlighting the most significant connection pattern.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = c => c.name || c.title || c.id || '?';

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Contact × Investigation Correlator (CINV)"
        style={{
          position: 'fixed', left: 620880, bottom: 8, zIndex: 229,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ CINV
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
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ CONTACT × INVESTIGATION CORRELATOR
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'CONTACTS', val: contacts.length, col: CY },
              { label: 'INVESTIGATIONS', val: investigations.length, col: PU },
              { label: 'LINKED', val: linked.length, col: AM },
              { label: 'UNLINKED', val: unlinked.length, col: GR },
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
            {['ALL', 'LINKED', 'UNLINKED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}22` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
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

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No contacts found.'}
              </div>
            ) : filtered.map((contact, i) => {
              const isExp = expanded === i;
              const statusColor = contact._linked ? AM : GR;
              return (
                <div
                  key={contact.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(contact)}</span>
                    {contact.company && chip(contact.company, PU)}
                    {contact.title && chip(contact.title, '#6E8AA0')}
                    {chip(contact._linked ? 'LINKED' : 'UNLINKED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {contact._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED INVESTIGATIONS
                          </div>
                          {contact._matches.map(({ inv, score }, j) => {
                            const seedCount = Array.isArray(inv.seeds) ? inv.seeds.length : (inv.seed_count ?? null);
                            const annCount = Array.isArray(inv.annotations) ? inv.annotations.length : (inv.annotation_count ?? null);
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {inv.title || inv.name || inv.id || '?'}
                                </span>
                                {seedCount !== null && chip(`${seedCount} seeds`, PU)}
                                {annCount !== null && chip(`${annCount} notes`, CY)}
                                {scorebar(score, AM)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No investigations matched this contact.</div>
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
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
