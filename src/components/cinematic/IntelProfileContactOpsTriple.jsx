import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPCOE_RE = /\b(ipcoe|intel\s+profile\s+contact\s+ops|intel\s+contact\s+ops|profile\s+contact\s+ops|intel\s+profile\s+contact\s+event|contact\s+intel\s+ops|ops\s+intel\s+contact|intel\s+contact\s+event|profile\s+contact\s+event|intel\s+ops\s+contact|contact\s+ops\s+intel\s+profile|intel\s+profile\s+ops\s+contact|fully\s+tracked\s+intel|dark\s+intel\s+profile\s+contact)\b/i;
const THRESHOLD = 0.07;

export function isIpcoeQuery(t) {
  return IPCOE_RE.test(t || '');
}

export async function buildIpcoeScript() {
  try {
    const [ipRes, ctRes, opsRes] = await Promise.all([
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const profiles = normaliseProfiles(ipRes);
    const contacts = normaliseContacts(ctRes);
    const events = normaliseEvents(opsRes);
    const classified = profiles.map(p => classifyProfile(p, contacts, events));
    const fullyTracked = classified.filter(p => p.state === 'FULLY_TRACKED').length;
    const dark = classified.filter(p => p.state === 'DARK').length;
    return `IPCOE analysis: ${profiles.length} intel profiles cross-referenced against ${contacts.length} contacts and ${events.length} active ops events. ${fullyTracked} profiles are FULLY TRACKED — both directory contact match and operational event coverage confirmed. ${dark} profiles are DARK — no contact directory link or operational event coverage detected, representing critical intelligence gaps requiring immediate profiling attention.`;
  } catch {
    return 'IPCOE data unavailable — check /entities/IntelProfile, /entities/Contact, and /v1/ops/events endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.profiles) ? raw.profiles
    : Array.isArray(raw.intel_profiles) ? raw.intel_profiles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((p, i) => ({
    id: p.id || p._id || `ip-${i}`,
    label: p.name || p.full_name || p.display_name || `Intel Profile ${i + 1}`,
    role: p.role || p.title || p.occupation || '',
    company: p.company || p.organization || p.employer || '',
    threat: p.threat_level || p.risk_level || p.severity || '',
    _searchText: [
      p.name, p.full_name, p.display_name, p.alias, p.role, p.title,
      p.company, p.organization, p.sector, p.tags, p.bio, p.description,
      p.affiliation, p.nationality,
    ].filter(Boolean).join(' '),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.contacts) ? raw.contacts
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `ct-${i}`,
    label: c.name || c.full_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || '',
    company: c.company || c.organization || '',
    _text: [
      c.name, c.full_name, c.email, c.role, c.title,
      c.company, c.organization, c.sector, c.department, c.tags, c.notes,
    ].filter(Boolean).join(' '),
  }));
}

function normaliseEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.events) ? raw.events
    : Array.isArray(raw.ops_events) ? raw.ops_events
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => ({
    id: e.id || e._id || `oe-${i}`,
    label: e.name || e.title || e.event_name || `Ops Event ${i + 1}`,
    severity: e.severity || e.level || '',
    type: e.type || e.kind || e.category || '',
    _text: [
      e.name, e.title, e.event_name, e.type, e.kind,
      e.category, e.description, e.tags, e.source,
    ].filter(Boolean).join(' '),
  }));
}

function classifyProfile(profile, contacts, events) {
  const toks = tok(profile._searchText);
  const matchedContacts = contacts
    .map(c => ({ ...c, score: matchScore(toks, c._text) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedEvents = events
    .map(e => ({ ...e, score: matchScore(toks, e._text) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasContact = matchedContacts.length > 0;
  const hasOps = matchedEvents.length > 0;
  const state = hasContact && hasOps ? 'FULLY_TRACKED'
    : hasContact ? 'CONTACT_MATCHED'
    : hasOps ? 'OPS_TRIGGERED'
    : 'DARK';

  return { ...profile, state, matchedContacts, matchedEvents };
}

const STATE_COLOR = {
  FULLY_TRACKED: '#22d3ee',
  CONTACT_MATCHED: '#a78bfa',
  OPS_TRIGGERED: '#f59e0b',
  DARK: '#6b7280',
};

export default function IntelProfileContactOpsTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [events, setEvents] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ipRes, ctRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const p = normaliseProfiles(ipRes);
      const c = normaliseContacts(ctRes);
      const e = normaliseEvents(opsRes);
      setProfiles(p);
      setContacts(c);
      setEvents(e);
      setClassified(p.map(prof => classifyProfile(prof, c, e)));
    } catch (err) {
      setError('Fetch error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:ipcoe-toggle', handler);
    return () => window.removeEventListener('jarvis:ipcoe-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (IPCOE_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_TRACKED: classified.filter(p => p.state === 'FULLY_TRACKED').length,
    CONTACT_MATCHED: classified.filter(p => p.state === 'CONTACT_MATCHED').length,
    OPS_TRIGGERED: classified.filter(p => p.state === 'OPS_TRIGGERED').length,
    DARK: classified.filter(p => p.state === 'DARK').length,
  };

  const visible = classified.filter(p => {
    if (filter !== 'ALL' && p.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p._searchText.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `IPCOE IntelProfile × Contact × Ops Event Triple Coverage: ${profiles.length} intel profiles cross-referenced against ${contacts.length} contacts and ${events.length} active ops events. Coverage: FULLY_TRACKED=${counts.FULLY_TRACKED}, CONTACT_MATCHED=${counts.CONTACT_MATCHED}, OPS_TRIGGERED=${counts.OPS_TRIGGERED}, DARK=${counts.DARK}. In 2 sentences, assess which intel profiles have both directory contact coverage and operational event attribution versus those that are completely dark with no contact or ops tracking, and identify the most critical intelligence profiling gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || j.answer || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const trackedPct = classified.length ? Math.round((counts.FULLY_TRACKED / classified.length) * 100) : 0;
  const contactPct = classified.length ? Math.round((counts.CONTACT_MATCHED / classified.length) * 100) : 0;
  const opsPct = classified.length ? Math.round((counts.OPS_TRIGGERED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 850960, bottom: 8, zIndex: 548,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a1a2e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,20,60,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>◈ IPCOE</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>IntelProfile × Contact × Ops Event Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#22d3ee', fontSize: 10 }}>SYNCING…</span>}
          {counts.FULLY_TRACKED > 0 && (
            <span style={{ background: '#164e63', color: '#22d3ee', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.FULLY_TRACKED} TRACKED
            </span>
          )}
          {counts.DARK > 0 && (
            <span style={{ background: '#1f2937', color: '#9ca3af', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.DARK} DARK
            </span>
          )}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'INTEL PROFILES', val: profiles.length, color: '#e2e8f0' },
          { label: 'CONTACTS', val: contacts.length, color: '#a78bfa' },
          { label: 'OPS EVENTS', val: events.length, color: '#f59e0b' },
          { label: 'FULLY TRACKED', val: counts.FULLY_TRACKED, color: '#22d3ee', badge: counts.FULLY_TRACKED > 0 },
          { label: 'CONTACT MATCH', val: counts.CONTACT_MATCHED, color: '#a78bfa' },
          { label: 'OPS TRIGGERED', val: counts.OPS_TRIGGERED, color: '#f59e0b' },
          { label: 'DARK', val: counts.DARK, color: '#9ca3af', badge: counts.DARK > 0 },
          { label: 'TRACKED %', val: `${trackedPct}%`, color: '#22d3ee' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          <div style={{ width: `${trackedPct}%`, background: '#22d3ee' }} title={`FULLY TRACKED ${trackedPct}%`} />
          <div style={{ width: `${contactPct}%`, background: '#a78bfa' }} title={`CONTACT MATCHED ${contactPct}%`} />
          <div style={{ width: `${opsPct}%`, background: '#f59e0b' }} title={`OPS TRIGGERED ${opsPct}%`} />
          <div style={{ width: `${darkPct}%`, background: '#374151' }} title={`DARK ${darkPct}%`} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#64748b' }}>
          <span style={{ color: '#22d3ee' }}>■ TRACKED {trackedPct}%</span>
          <span style={{ color: '#a78bfa' }}>■ CONTACT {contactPct}%</span>
          <span style={{ color: '#f59e0b' }}>■ OPS {opsPct}%</span>
          <span style={{ color: '#9ca3af' }}>■ DARK {darkPct}%</span>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY_TRACKED', 'CONTACT_MATCHED', 'OPS_TRIGGERED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1e293b' : 'none', border: `1px solid ${filter === f ? '#334155' : '#1e293b'}`,
            color: filter === f ? '#e2e8f0' : '#64748b', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 10,
          }}>{f.replace(/_/g, ' ')}{f !== 'ALL' ? ` (${counts[f] ?? 0})` : ` (${classified.length})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search intel profiles…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 160 }} />
      </div>

      {/* Profile list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px' }}>
        {visible.slice(0, 120).map(p => (
          <div key={p.id}>
            <div onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0f172a', cursor: 'pointer' }}>
              <span style={{ color: STATE_COLOR[p.state], fontWeight: 700, fontSize: 10, minWidth: 90 }}>{p.state.replace(/_/g, ' ')}</span>
              <span style={{ color: '#e2e8f0', flex: 1 }}>{p.label}</span>
              {p.role && <span style={{ color: '#64748b', fontSize: 10 }}>{p.role}</span>}
              {p.company && <span style={{ color: '#475569', fontSize: 10 }}>{p.company}</span>}
              {p.threat && <span style={{ background: '#1e293b', color: '#f59e0b', borderRadius: 3, padding: '0 5px', fontSize: 9 }}>{p.threat}</span>}
              <span style={{ color: '#334155', fontSize: 10 }}>
                {p.matchedContacts.length}ct {p.matchedEvents.length}ops
              </span>
            </div>
            {expanded === p.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '8px 0 8px 8px', borderBottom: '1px solid #1e293b' }}>
                <div>
                  <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>CONTACTS ({p.matchedContacts.length})</div>
                  {p.matchedContacts.slice(0, 8).map(c => (
                    <div key={c.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#cbd5e1', fontSize: 11 }}>{c.label}</span>
                        {c.role && <span style={{ color: '#64748b', fontSize: 9 }}>{c.role}</span>}
                        {c.company && <span style={{ color: '#475569', fontSize: 9 }}>{c.company}</span>}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(c.score * 100)}%`, background: '#a78bfa' }} />
                      </div>
                    </div>
                  ))}
                  {p.matchedContacts.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no contacts matched</div>}
                </div>
                <div>
                  <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>OPS EVENTS ({p.matchedEvents.length})</div>
                  {p.matchedEvents.slice(0, 8).map(e => (
                    <div key={e.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#cbd5e1', fontSize: 11 }}>{e.label}</span>
                        {e.severity && <span style={{ background: '#292524', color: '#f59e0b', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>{e.severity}</span>}
                        {e.type && <span style={{ color: '#64748b', fontSize: 9 }}>{e.type}</span>}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(e.score * 100)}%`, background: '#f59e0b' }} />
                      </div>
                    </div>
                  ))}
                  {p.matchedEvents.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no ops events matched</div>}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ padding: '20px 0', color: '#475569', textAlign: 'center' }}>no profiles match current filter</div>
        )}
      </div>

      {/* ASSESS footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{assessment}</div>}
        <button onClick={assess} disabled={assessing || classified.length === 0} style={{
          background: assessing ? '#1e293b' : '#164e63', border: '1px solid #22d3ee44',
          color: '#22d3ee', borderRadius: 5, padding: '4px 14px', cursor: assessing ? 'default' : 'pointer', fontSize: 11,
        }}>
          {assessing ? '◌ assessing…' : '▶ ASSESS'}
        </button>
      </div>
    </div>
  );
}
