import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const CIIT_RE = /\b(ciit|contact[\s_-]*intel[\s_-]*invest(?:igation)?|contact[\s_-]*investigation[\s_-]*intel|contact[\s_-]*intel[\s_-]*case|intel[\s_-]*contact[\s_-]*invest|investigation[\s_-]*contact[\s_-]*intel|fully[\s_-]*tracked[\s_-]*contact|untracked[\s_-]*contact[\s_-]*intel|contact[\s_-]*case[\s_-]*profile|contact[\s_-]*profile[\s_-]*case|contact[\s_-]*dossier[\s_-]*investigation)\b/i;
const THRESHOLD = 0.07;

export function isCiitQuery(t) { return CIIT_RE.test(t || ''); }

export async function buildCiitScript() {
  try {
    const [contactRes, intelRes, invRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(contactRes);
    const intels   = normaliseIntels(intelRes);
    const cases    = normaliseCases(invRes);
    const classified = contacts.map(c => classifyContact(c, intels, cases));
    const fullyTracked = classified.filter(c => c.state === 'FULLY_TRACKED').length;
    const intelOnly    = classified.filter(c => c.state === 'INTEL_ONLY').length;
    const caseOnly     = classified.filter(c => c.state === 'CASE_ONLY').length;
    const untracked    = classified.filter(c => c.state === 'UNTRACKED').length;
    const total        = classified.length;
    return `CIIT Coverage: ${total} contacts analysed. ` +
      `Fully tracked (intel+investigation): ${fullyTracked}. ` +
      `Intel-only: ${intelOnly}. ` +
      `Case-only: ${caseOnly}. ` +
      `Untracked: ${untracked}. ` +
      `Coverage ratio: ${total ? Math.round((fullyTracked / total) * 100) : 0}%.`;
  } catch {
    return 'CIIT: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.contacts || raw?.data || raw?.items || []);
  return arr.map((c, i) => ({
    id:          c.id || c._id || `contact-${i}`,
    name:        c.name || c.fullName || c.full_name || c.label || `Contact ${i + 1}`,
    role:        c.role || c.title || c.position || '',
    org:         c.org || c.organisation || c.organization || c.company || '',
    email:       c.email || '',
    notes:       c.notes || c.description || c.bio || c.summary || '',
    tags:        Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normaliseIntels(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.intelProfiles || raw?.intel_profiles || raw?.data || raw?.items || []);
  return arr.map((p, i) => ({
    id:      p.id || p._id || `intel-${i}`,
    name:    p.name || p.title || p.subject || p.label || `IntelProfile ${i + 1}`,
    type:    p.type || p.category || p.kind || '',
    summary: p.summary || p.description || p.notes || p.content || '',
    tags:    Array.isArray(p.tags) ? p.tags : [],
  }));
}

function normaliseCases(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.investigations || raw?.cases || raw?.data || raw?.items || []);
  return arr.map((inv, i) => ({
    id:      inv.id || inv._id || `case-${i}`,
    name:    inv.name || inv.title || inv.label || `Investigation ${i + 1}`,
    status:  inv.status || inv.state || '',
    summary: inv.summary || inv.description || inv.notes || '',
    tags:    Array.isArray(inv.tags) ? inv.tags : [],
  }));
}

function contactTokens(c) {
  return tok([c.name, c.role, c.org, c.email, c.notes, ...c.tags].join(' '));
}

function classifyContact(contact, intels, cases) {
  const ctoks = contactTokens(contact);
  const matchedIntels = intels
    .map(p => ({
      ...p,
      score: Math.max(
        matchScore(ctoks, [p.name, p.summary, ...p.tags].join(' ')),
        matchScore(tok(p.name), [contact.name, contact.org].join(' '))
      ),
    }))
    .filter(p => p.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const matchedCases = cases
    .map(inv => ({
      ...inv,
      score: Math.max(
        matchScore(ctoks, [inv.name, inv.summary, ...inv.tags].join(' ')),
        matchScore(tok(inv.name), [contact.name, contact.org].join(' '))
      ),
    }))
    .filter(inv => inv.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasIntel = matchedIntels.length > 0;
  const hasCase  = matchedCases.length > 0;
  const state =
    hasIntel && hasCase ? 'FULLY_TRACKED' :
    hasIntel             ? 'INTEL_ONLY' :
    hasCase              ? 'CASE_ONLY' :
                           'UNTRACKED';

  return { ...contact, state, matchedIntels, matchedCases };
}

const STATE_COLOR = {
  FULLY_TRACKED: '#00e5ff',
  INTEL_ONLY:    '#ff9800',
  CASE_ONLY:     '#7c4dff',
  UNTRACKED:     '#607d8b',
};
const STATE_LABEL = {
  FULLY_TRACKED: 'FULLY TRACKED',
  INTEL_ONLY:    'INTEL ONLY',
  CASE_ONLY:     'CASE ONLY',
  UNTRACKED:     'UNTRACKED',
};

export default function ContactIntelInvestigationTriple() {
  const [open, setOpen]       = useState(false);
  const [contacts, setContacts] = useState([]);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [brief, setBrief]     = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactRes, intelRes, invRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      ]);
      const cs = normaliseContacts(contactRes);
      const is = normaliseIntels(intelRes);
      const vs = normaliseCases(invRes);
      setContacts(cs.map(c => classifyContact(c, is, vs)));
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:ciit-toggle', toggle);
    return () => window.removeEventListener('jarvis:ciit-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = useCallback(async (contact) => {
    if (assessing === contact.id) return;
    setAssessing(contact.id);
    try {
      const prompt =
        `Contact "${contact.name}" (${contact.role || 'unknown role'}, ${contact.org || 'unknown org'}) ` +
        `has state ${contact.state} — ` +
        `matched intel profiles: ${contact.matchedIntels.map(p => p.name).join(', ') || 'none'}; ` +
        `matched investigations: ${contact.matchedCases.map(c => c.name).join(', ') || 'none'}. ` +
        `In 2 sentences, assess this contact's intelligence coverage posture and recommend next action.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.response || data.reply || data.message || data.content || '';
        setBrief(b => ({ ...b, [contact.id]: text }));
        if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      }
    } catch { /* silent */ }
    finally { setAssessing(null); }
  }, [assessing]);

  if (!open) return null;

  const fullyTracked = contacts.filter(c => c.state === 'FULLY_TRACKED').length;
  const intelOnly    = contacts.filter(c => c.state === 'INTEL_ONLY').length;
  const caseOnly     = contacts.filter(c => c.state === 'CASE_ONLY').length;
  const untracked    = contacts.filter(c => c.state === 'UNTRACKED').length;
  const total        = contacts.length;
  const coveragePct  = total ? Math.round((fullyTracked / total) * 100) : 0;

  const filtered = contacts.filter(c => {
    if (filter !== 'ALL' && c.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.org.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 868880, bottom: 8, zIndex: 560,
      background: 'rgba(0,10,20,0.97)', border: '1px solid rgba(0,229,255,0.25)',
      borderRadius: 10, width: 620, maxHeight: '88vh',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: 'monospace', color: '#cdd9e5', fontSize: 12,
      boxShadow: '0 0 32px rgba(0,229,255,0.12)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid rgba(0,229,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(0,229,255,0.05)',
      }}>
        <span style={{ color: '#00e5ff', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
          ◈ CIIT — CONTACT × INTEL × INVESTIGATION
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: 'rgba(0,229,255,0.15)', color: '#00e5ff',
            borderRadius: 4, padding: '1px 6px', fontSize: 11,
          }}>
            FULLY TRACKED: {fullyTracked}
          </span>
          <span style={{
            background: 'rgba(96,125,139,0.2)', color: '#90a4ae',
            borderRadius: 4, padding: '1px 6px', fontSize: 11,
          }}>
            UNTRACKED: {untracked}
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#546e7a',
            cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
        {[
          { label: 'contacts',      val: total,        color: '#cdd9e5' },
          { label: 'fully tracked', val: fullyTracked, color: '#00e5ff' },
          { label: 'intel only',    val: intelOnly,    color: '#ff9800' },
          { label: 'case only',     val: caseOnly,     color: '#7c4dff' },
          { label: 'untracked',     val: untracked,    color: '#607d8b' },
          { label: 'coverage %',    val: `${coveragePct}%`, color: coveragePct >= 60 ? '#69f0ae' : coveragePct >= 30 ? '#ff9800' : '#ef5350' },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 5,
            padding: '5px 4px', textAlign: 'center',
          }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#546e7a', fontSize: 9, marginTop: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
        <div style={{ height: 6, borderRadius: 3, background: '#1a2a35', overflow: 'hidden', display: 'flex' }}>
          {[
            { pct: total ? (fullyTracked / total) * 100 : 0, color: '#00e5ff' },
            { pct: total ? (intelOnly    / total) * 100 : 0, color: '#ff9800' },
            { pct: total ? (caseOnly     / total) * 100 : 0, color: '#7c4dff' },
            { pct: total ? (untracked    / total) * 100 : 0, color: '#37474f' },
          ].map((seg, i) => (
            <div key={i} style={{ width: `${seg.pct}%`, background: seg.color, transition: 'width 0.5s' }} />
          ))}
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px', alignItems: 'center', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
        {['ALL', 'FULLY_TRACKED', 'INTEL_ONLY', 'CASE_ONLY', 'UNTRACKED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#00e5ff' : '#78909c',
            borderRadius: 4, padding: '2px 7px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? 'ALL' : STATE_LABEL[f]}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,229,255,0.15)',
            borderRadius: 4, color: '#cdd9e5', padding: '3px 8px', fontSize: 11, outline: 'none',
          }}
        />
        <button onClick={load} disabled={loading} style={{
          background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)',
          color: '#00e5ff', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
        }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Contact list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && !contacts.length ? (
          <div style={{ color: '#546e7a', textAlign: 'center', padding: 24 }}>loading contacts…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#546e7a', textAlign: 'center', padding: 24 }}>no contacts match</div>
        ) : filtered.map(c => {
          const isExp = expanded === c.id;
          const stateColor = STATE_COLOR[c.state];
          return (
            <div key={c.id} style={{
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: isExp ? 'rgba(0,229,255,0.04)' : 'transparent',
            }}>
              {/* Row */}
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: stateColor, flexShrink: 0,
                  boxShadow: c.state === 'FULLY_TRACKED' ? `0 0 6px ${stateColor}` : 'none',
                }} />
                <span style={{ flex: 1, color: '#cdd9e5', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </span>
                {c.org && (
                  <span style={{ color: '#78909c', fontSize: 10, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.org}
                  </span>
                )}
                <span style={{
                  background: `${stateColor}22`, color: stateColor,
                  borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>
                  {STATE_LABEL[c.state]}
                </span>
                <span style={{ color: '#546e7a', fontSize: 14 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded detail */}
              {isExp && (
                <div style={{ padding: '0 12px 12px', display: 'flex', gap: 12 }}>
                  {/* Intel profiles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#ff9800', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      INTEL PROFILES ({c.matchedIntels.length})
                    </div>
                    {c.matchedIntels.length === 0 ? (
                      <div style={{ color: '#37474f', fontSize: 10 }}>no intel matches</div>
                    ) : c.matchedIntels.slice(0, 4).map(p => (
                      <div key={p.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: '#ff9800', fontSize: 9, background: 'rgba(255,152,0,0.15)', borderRadius: 2, padding: '0 3px' }}>
                            {p.type || 'profile'}
                          </span>
                          <span style={{ color: '#b0bec5', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: '#1a2a35', marginTop: 2 }}>
                          <div style={{ height: '100%', width: `${Math.round(p.score * 100)}%`, background: '#ff9800', borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Investigations */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#7c4dff', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      INVESTIGATIONS ({c.matchedCases.length})
                    </div>
                    {c.matchedCases.length === 0 ? (
                      <div style={{ color: '#37474f', fontSize: 10 }}>no case matches</div>
                    ) : c.matchedCases.slice(0, 4).map(inv => (
                      <div key={inv.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: '#7c4dff', fontSize: 9, background: 'rgba(124,77,255,0.15)', borderRadius: 2, padding: '0 3px' }}>
                            {inv.status || 'open'}
                          </span>
                          <span style={{ color: '#b0bec5', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {inv.name}
                          </span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: '#1a2a35', marginTop: 2 }}>
                          <div style={{ height: '100%', width: `${Math.round(inv.score * 100)}%`, background: '#7c4dff', borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ASSESS button */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  <button
                    onClick={() => assess(c)}
                    disabled={assessing === c.id}
                    style={{
                      background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)',
                      color: '#00e5ff', borderRadius: 4, padding: '3px 10px', fontSize: 10,
                      cursor: assessing === c.id ? 'wait' : 'pointer',
                    }}
                  >
                    {assessing === c.id ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                  {brief[c.id] && (
                    <div style={{
                      marginTop: 6, color: '#90a4ae', fontSize: 10, lineHeight: 1.5,
                      background: 'rgba(0,229,255,0.04)', borderRadius: 4, padding: '5px 8px',
                      borderLeft: '2px solid rgba(0,229,255,0.3)',
                    }}>
                      {brief[c.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '5px 12px', borderTop: '1px solid rgba(0,229,255,0.1)',
        color: '#37474f', fontSize: 9, textAlign: 'right',
      }}>
        /entities/Contact × /entities/IntelProfile × /v1/investigations · 90s refresh · {filtered.length}/{total} shown
      </div>
    </div>
  );
}
