import { useState, useEffect, useCallback } from 'react';

const API = '';
const CSKILL_RE = /\b(contact[._-]?skill[s]?|skill[s]?[._-]?contact[s]?|cskill|uncovered[._-]?contact[s]?|contact[._-]?capabilit(?:y|ies)|contact[._-]?skill[._-]?gap|skilled[._-]?contact[s]?|contact[._-]?capability[._-]?gap)\b/i;

export function isCskillQuery(t) {
  return CSKILL_RE.test(t || '');
}

export async function buildCskillScript() {
  const [conR, skR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const contacts = normaliseContacts(conR.status === 'fulfilled' ? conR.value : []);
  const skills = normaliseSkills(skR.status === 'fulfilled' ? skR.value : []);
  const enriched = correlate(contacts, skills);
  const skilled = enriched.filter(c => c._linked).length;
  const uncovered = enriched.filter(c => !c._linked).length;
  return (
    `Contact × Skill Coverage: ${contacts.length} contacts, ${skills.length} JARVIS skills. ` +
    `${skilled} contacts are SKILLED (skill domain coverage found); ${uncovered} are UNCOVERED (no skill addresses their domain — capability gap). ` +
    `Top uncovered: ${enriched.filter(c => !c._linked).slice(0, 3).map(c => c.name || c.email || '?').join(', ') || 'none'}.`
  );
}

function normaliseContacts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['contacts', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseSkills(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['skills', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contact, skill) {
  const contactToks = new Set([
    ...tokens(contact.name),
    ...tokens(contact.email),
    ...tokens(contact.company),
    ...tokens(contact.title),
    ...tokens(contact.description),
    ...tokens(contact.role),
    ...tokens(contact.tags),
    ...tokens(contact.sector),
  ].filter(Boolean));
  const skillToks = [
    ...tokens(skill.name),
    ...tokens(skill.title),
    ...tokens(skill.description),
    ...tokens(skill.category),
    ...tokens(skill.domain),
    ...tokens(skill.tags),
  ].filter(Boolean);
  if (!contactToks.size || !skillToks.length) return 0;
  let hits = 0;
  for (const t of skillToks) if (contactToks.has(t)) hits++;
  return hits / Math.max(contactToks.size, skillToks.length);
}

function correlate(contacts, skills) {
  return contacts.map(contact => {
    const scored = skills
      .map(sk => ({ sk, score: matchScore(contact, sk) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...contact, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';

const chip = (label, color = CY) => (
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

export default function ContactSkillCoverage() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conR, skR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      setContacts(normaliseContacts(conR.status === 'fulfilled' ? conR.value : []));
      setSkills(normaliseSkills(skR.status === 'fulfilled' ? skR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:cskill-toggle', onToggle);
    return () => window.removeEventListener('jarvis:cskill-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(contacts, skills);
  const skilled = enriched.filter(c => c._linked);
  const uncovered = enriched.filter(c => !c._linked);
  const badgeCount = uncovered.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(c => tab === 'ALL' || (tab === 'SKILLED' ? c._linked : !c._linked))
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
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${contacts.length} contacts and ${skills.length} JARVIS skills. ` +
            `${skilled.length} contacts are SKILLED (their domain is covered by at least one JARVIS skill); ` +
            `${uncovered.length} are UNCOVERED (no skill addresses their domain — capability gap). ` +
            `Top uncovered contacts: ${uncovered.slice(0, 3).map(c => c.name || c.email || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence contact-skill coverage brief highlighting the biggest capability gaps and which contacts need new skill development.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = c => c.name || c.email || c.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Contact × Skill Coverage (CSKILL)"
        style={{
          position: 'fixed', left: 682960, bottom: 8, zIndex: 248,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ CSKILL
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
              ◈ CONTACT × SKILL COVERAGE
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
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'CONTACTS', val: contacts.length, col: CY },
              { label: 'SKILLS', val: skills.length, col: '#A78BFA' },
              { label: 'SKILLED', val: skilled.length, col: GR },
              { label: 'UNCOVERED', val: uncovered.length, col: AM },
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
            {['ALL', 'SKILLED', 'UNCOVERED'].map(t => (
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
            ) : filtered.map((contact, i) => {
              const isSkilled = contact._linked;
              const statusColor = isSkilled ? GR : AM;
              const isExp = expanded === i;
              return (
                <div
                  key={contact.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
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
                    {contact.company && chip(String(contact.company).slice(0, 18), CY)}
                    {contact.title && chip(String(contact.title).slice(0, 14), '#A78BFA')}
                    {chip(isSkilled ? 'SKILLED' : 'UNCOVERED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {contact._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING SKILLS
                          </div>
                          {contact._matches.map(({ sk, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {sk.category && chip(String(sk.category).toUpperCase().slice(0, 14), '#A78BFA')}
                              {sk.domain && chip(String(sk.domain).toUpperCase().slice(0, 12), CY)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {sk.name || sk.title || sk.id || '?'}
                              </span>
                              {scorebar(score, AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No skill coverage found for this contact's domain.</div>
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
