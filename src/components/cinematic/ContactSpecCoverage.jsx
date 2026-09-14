import { useState, useEffect, useCallback } from 'react';

const API = '';
const CSPC_RE = /\b(contact[._-]?spec|spec[._-]?contact|cspc|contact[._-]?coverage[._-]?spec|contacts[._-]?with[._-]?spec|spec[._-]?for[._-]?contact|which[._-]?contacts[._-]?have[._-]?spec|contact[._-]?specification|contact[._-]?spec[._-]?gap|contacts[._-]?without[._-]?spec|spec[._-]?backed[._-]?contact)\b/i;

export function isCspcQuery(t) {
  return CSPC_RE.test(t || '');
}

export async function buildCspcScript() {
  const [ctR, spR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/spec/list`).then(r => r.json()),
  ]);
  const contacts = normaliseArray(ctR.status === 'fulfilled' ? ctR.value : []);
  const specs = normaliseArray(spR.status === 'fulfilled' ? spR.value : []);
  const enriched = correlate(contacts, specs);
  const covered = enriched.filter(c => c._linked).length;
  const uncovered = enriched.filter(c => !c._linked).length;
  return (
    `Contact × Spec Coverage: ${contacts.length} contacts, ${specs.length} specs indexed. ` +
    `${covered} contacts are COVERED (matched to specs); ${uncovered} are UNCOVERED (no spec backing). ` +
    `Top uncovered: ${enriched.filter(c => !c._linked).slice(0, 4).map(c => c.name || c.email || c.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'contacts', 'specs', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contact, spec) {
  const contactToks = new Set([
    ...tokens(contact.name),
    ...tokens(contact.title),
    ...tokens(contact.email),
    ...tokens(contact.company),
    ...tokens(contact.description),
  ].filter(Boolean));
  const specToks = [
    ...tokens(spec.title),
    ...tokens(spec.name),
    ...tokens(spec.description),
    ...tokens(spec.content),
    ...tokens(spec.kind),
  ].filter(Boolean);
  if (!contactToks.size || !specToks.length) return 0;
  let hits = 0;
  for (const t of specToks) if (contactToks.has(t)) hits++;
  return hits / Math.max(contactToks.size, specToks.length);
}

function correlate(contacts, specs) {
  return contacts.map(contact => {
    const scored = specs
      .map(spec => ({ spec, score: matchScore(contact, spec) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...contact, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const ACCENT = '#8B5CF6';

export default function ContactSpecCoverage() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [ctR, spR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/spec/list`).then(r => r.json()),
      ]);
      setContacts(normaliseArray(ctR.status === 'fulfilled' ? ctR.value : []));
      setSpecs(normaliseArray(spR.status === 'fulfilled' ? spR.value : []));
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
    const id = open ? setInterval(load, 90000) : null;
    return () => { if (id) clearInterval(id); };
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:cspc-toggle', h);
    return () => window.removeEventListener('jarvis:cspc-toggle', h);
  }, []);

  const enriched = correlate(contacts, specs);
  const covered = enriched.filter(c => c._linked).length;
  const uncovered = enriched.filter(c => !c._linked).length;

  const filtered = enriched.filter(c => {
    if (tab === 'COVERED' && !c._linked) return false;
    if (tab === 'UNCOVERED' && c._linked) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${c.name || ''} ${c.email || ''} ${c.title || ''} ${c.company || ''} ${c.description || ''}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const badgeCount = uncovered;
  const badgeCol = uncovered > 0 ? '#F59E0B' : '#22C55E';

  async function doAssess() {
    setAssessing(true); setAssessText('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `Contact × Spec Coverage: ${contacts.length} contacts, ${specs.length} specs. ${covered} covered, ${uncovered} uncovered. Top uncovered: ${enriched.filter(c => !c._linked).slice(0, 4).map(c => c.name || c.email || c.id || '?').join(', ') || 'none'}. Give a 2-sentence contact spec coverage brief.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.result || JSON.stringify(d);
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessText(`Error: ${e.message}`);
    }
    setAssessing(false);
  }

  return (
    <>
      {/* dock button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact × Spec Coverage (CSPC)"
        style={{
          position: 'fixed',
          left: 547920,
          bottom: 8,
          zIndex: 213,
          background: open ? ACCENT : '#1e293b',
          border: `1px solid ${ACCENT}`,
          borderRadius: 6,
          color: '#e2e8f0',
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        ◈ CSPC
        {badgeCount > 0 && (
          <span style={{ background: badgeCol, color: '#000', borderRadius: 8, fontSize: 10, padding: '0 5px', fontWeight: 800 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 48,
          width: PANEL_W,
          height: PANEL_H,
          background: 'rgba(10,15,30,0.97)',
          border: `1px solid ${ACCENT}`,
          borderRadius: 12,
          zIndex: 9200,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 0 40px rgba(139,92,246,0.25)`,
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ACCENT, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>◈ CONTACT × SPEC COVERAGE</span>
            <span style={{ flex: 1 }} />
            {loading && <span style={{ color: '#64748b', fontSize: 11 }}>loading…</span>}
            <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #0f172a' }}>
            {[
              { label: 'CONTACTS', val: contacts.length, col: ACCENT },
              { label: 'SPECS', val: specs.length, col: '#06B6D4' },
              { label: 'COVERED', val: covered, col: '#22C55E' },
              { label: 'UNCOVERED', val: uncovered, col: '#F59E0B' },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 800 }}>{val}</div>
                <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter row */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 16px', borderBottom: '1px solid #0f172a', alignItems: 'center' }}>
            {['ALL', 'COVERED', 'UNCOVERED'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? ACCENT : '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: tab === t ? '#fff' : '#94a3b8',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', fontSize: 11, padding: '3px 8px',
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {err && <div style={{ color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
            {!err && filtered.length === 0 && !loading && (
              <div style={{ color: '#475569', fontSize: 12, marginTop: 24, textAlign: 'center' }}>No contacts match.</div>
            )}
            {filtered.map((contact, i) => {
              const key = contact.id || contact._id || i;
              const isRow = expanded === key;
              const label = contact.name || contact.email || contact.id || '?';
              const cov = contact._linked;
              return (
                <div key={key} style={{ background: '#0f172a', borderRadius: 6, border: `1px solid ${cov ? '#1e1b4b' : '#78350f'}`, overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpanded(isRow ? null : key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
                  >
                    <span style={{
                      background: cov ? '#1e1b4b' : '#451a03',
                      color: cov ? ACCENT : '#F59E0B',
                      borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '2px 6px', letterSpacing: 1,
                    }}>
                      {cov ? 'COVERED' : 'UNCOVERED'}
                    </span>
                    {contact.title && (
                      <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 4, fontSize: 9, padding: '1px 5px', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {contact.title}
                      </span>
                    )}
                    <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ color: '#334155', fontSize: 11 }}>{isRow ? '▲' : '▼'}</span>
                  </div>

                  {isRow && (
                    <div style={{ borderTop: '1px solid #1e293b', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {contact.email && (
                        <div style={{ color: '#64748b', fontSize: 10 }}>{contact.email}</div>
                      )}
                      {contact.company && (
                        <div style={{ color: '#94a3b8', fontSize: 11 }}>{contact.company}</div>
                      )}
                      {contact.description && (
                        <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>
                          {String(contact.description).slice(0, 200)}
                        </div>
                      )}
                      {contact._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#64748b', fontSize: 10, letterSpacing: 1 }}>MATCHED SPECS</div>
                          {contact._matches.map(({ spec, score }, si) => (
                            <div key={spec.id || spec._id || si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                background: spec.status === 'approved' ? '#14532d' : '#451a03',
                                color: spec.status === 'approved' ? '#22C55E' : '#F59E0B',
                                borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                              }}>
                                {spec.status || 'draft'}
                              </span>
                              <span style={{ color: '#cbd5e1', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {spec.title || spec.name || spec.id || '?'}
                              </span>
                              <div style={{ width: 60, background: '#1e293b', borderRadius: 2, height: 4 }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, background: ACCENT, height: 4, borderRadius: 2 }} />
                              </div>
                              <span style={{ color: '#475569', fontSize: 10, width: 28, textAlign: 'right' }}>
                                {Math.round(score * 100)}%
                              </span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: '#F59E0B', fontSize: 11 }}>No matching specs found for this contact.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
            {assessText && (
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessText}</div>
            )}
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: assessing ? '#1e293b' : ACCENT,
                border: 'none', borderRadius: 6, color: '#fff',
                fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
