import { useState, useEffect, useCallback } from 'react';

const API = '';
const REFRESH_MS = 90000;
const SIPCX_RE = /\b(scenario[._-]?intel[._-]?contact|intel[._-]?contact[._-]?scenario|sipcx|dark[._-]?scen(?:ario)?s?|scenario[._-]?actor|scenario[._-]?people|which[._-]?scenarios[._-]?have[._-]?contacts?|scenario[._-]?contact[._-]?coverage|scenario[._-]?profile[._-]?coverage|scenario[._-]?human[._-]?coverage)\b/i;

export function isSipcxQuery(t) { return SIPCX_RE.test(t || ''); }

export async function buildSipcxScript() {
  const [scR, ipR, ctR] = await Promise.allSettled([
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile?limit=200`).then(r => r.json()),
    fetch(`${API}/entities/Contact?limit=200`).then(r => r.json()),
  ]);
  const scenarios = norm(scR.status === 'fulfilled' ? scR.value : []);
  const profiles = norm(ipR.status === 'fulfilled' ? ipR.value : []);
  const contacts = norm(ctR.status === 'fulfilled' ? ctR.value : []);
  const enriched = correlate(scenarios, profiles, contacts);
  const full = enriched.filter(s => s._profileMatches.length > 0 && s._contactMatches.length > 0).length;
  const dark = enriched.filter(s => s._profileMatches.length === 0 && s._contactMatches.length === 0).length;
  return `Scenario × IntelProfile × Contact: ${scenarios.length} scenarios, ${profiles.length} intel profiles, ${contacts.length} contacts. ` +
    `${full} fully covered (profile + contact), ${dark} dark (no actor or contact match). ` +
    `Dark scenarios: ${enriched.filter(s => s._profileMatches.length === 0 && s._contactMatches.length === 0).slice(0, 4).map(s => s.name || s.title || s.id).join(', ') || 'none'}.`;
}

function norm(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'scenarios', 'profiles', 'contacts', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function toks(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
}

function scorePair(scen, entity, entityFields) {
  const sToks = new Set([
    ...toks(scen.name), ...toks(scen.title), ...toks(scen.description),
    ...toks(scen.type), ...toks(scen.category), ...(scen.tags || []).flatMap(toks),
  ]);
  const eToks = entityFields.flatMap(f => toks(entity[f])).filter(Boolean);
  if (!sToks.size || !eToks.length) return 0;
  let hits = 0;
  for (const t of eToks) if (sToks.has(t)) hits++;
  return hits / Math.max(sToks.size, eToks.length);
}

function correlate(scenarios, profiles, contacts) {
  return scenarios.map(s => {
    const profileScored = profiles
      .map(p => ({ p, score: scorePair(s, p, ['name', 'description', 'subject', 'role', 'organization', 'aliases', 'tags']) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    const contactScored = contacts
      .map(c => ({ c, score: scorePair(s, c, ['name', 'email', 'organization', 'title', 'role', 'description', 'tags']) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
    const hasProfile = profileScored.length > 0;
    const hasContact = contactScored.length > 0;
    const cls = hasProfile && hasContact ? 'FULL_COVERAGE' : hasProfile ? 'PROFILE_ONLY' : hasContact ? 'CONTACT_ONLY' : 'DARK';
    return { ...s, _profileMatches: profileScored, _contactMatches: contactScored, _cls: cls };
  });
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background .15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };
const CY = '#00D4FF'; const AM = '#F59E0B'; const RD = '#EF4444'; const GN = '#10B981';

const CLS_COLOR = { FULL_COVERAGE: GN, PROFILE_ONLY: CY, CONTACT_ONLY: AM, DARK: RD };

export default function ScenarioIntelContactTriple() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [verdict, setVerdict] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    const [scR, ipR, ctR] = await Promise.allSettled([
      fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      fetch(`${API}/entities/IntelProfile?limit=200`).then(r => r.json()),
      fetch(`${API}/entities/Contact?limit=200`).then(r => r.json()),
    ]);
    const scenarios = norm(scR.status === 'fulfilled' ? scR.value : []);
    const profiles = norm(ipR.status === 'fulfilled' ? ipR.value : []);
    const contacts = norm(ctR.status === 'fulfilled' ? ctR.value : []);
    if (!scenarios.length && !profiles.length && !contacts.length) {
      setErr('No data returned. Check backend connectivity.');
      return;
    }
    setData(correlate(scenarios, profiles, contacts));
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sipcx-toggle', toggle);
    return () => window.removeEventListener('jarvis:sipcx-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setVerdict('');
    try {
      const script = await buildSipcxScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: `Scenario × IntelProfile × Contact coverage: ${script} Provide a 2-sentence operational summary.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.text || '';
      setVerdict(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch {
      setVerdict('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const dark = data.filter(s => s._cls === 'DARK').length;

  const filtered = data.filter(s => {
    if (filter !== 'ALL' && s._cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.name || s.title || s.id || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × IntelProfile × Contact (SIPCX)"
        style={{
          position: 'fixed', left: 5160, bottom: 18, zIndex: 68,
          background: 'rgba(5,10,18,0.82)', border: `1px solid ${RD}55`,
          color: dark > 0 ? RD : '#8899AA', borderRadius: 8, padding: '4px 10px',
          fontSize: 11, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}
      >
        ◈ SIPCX{dark > 0 && <span style={{ marginLeft: 5, background: RD, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, animation: 'jpulse 1.5s ease-in-out infinite' }}>{dark}</span>}
      </button>
    );
  }

  const full = data.filter(s => s._cls === 'FULL_COVERAGE').length;
  const profileOnly = data.filter(s => s._cls === 'PROFILE_ONLY').length;
  const contactOnly = data.filter(s => s._cls === 'CONTACT_ONLY').length;
  const profiles = [...new Set(data.flatMap(s => s._profileMatches.map(x => x.p.id)))].length;
  const contacts = [...new Set(data.flatMap(s => s._contactMatches.map(x => x.c.id)))].length;

  return (
    <div style={{
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      zIndex: 170, width: 'min(660px,94vw)', maxHeight: '82vh', overflowY: 'auto',
      background: 'rgba(6,10,18,0.96)', border: `1px solid ${RD}44`, borderRadius: 14,
      padding: 18, fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
      backdropFilter: 'blur(14px)', boxShadow: `0 0 60px ${RD}18`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 8 }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ SCENARIO × INTEL × CONTACT</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6E8AA0' }}>90 s refresh · {data.length} scenarios</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {err && <div style={{ color: RD, fontSize: 12, marginBottom: 10 }}>{err}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          ['SCENARIOS', data.length, '#8899AA'],
          ['PROFILES', profiles, CY],
          ['CONTACTS', contacts, AM],
          ['FULL COV', full, GN],
          ['PROF ONLY', profileOnly, CY],
          ['CONT ONLY', contactOnly, AM],
          ['DARK', dark, RD],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...TILE, minWidth: 80 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {['ALL', 'FULL_COVERAGE', 'PROFILE_ONLY', 'CONTACT_ONLY', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
            border: `1px solid ${filter === f ? (CLS_COLOR[f] || CY) : '#334'}`,
            background: filter === f ? `${CLS_COLOR[f] || CY}22` : 'transparent',
            color: filter === f ? (CLS_COLOR[f] || CY) : '#6E8AA0',
          }}>{f.replace(/_/g, ' ')}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search…"
          style={{
            marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, fontSize: 11,
            background: 'rgba(255,255,255,0.05)', border: '1px solid #334', color: '#DCEBF5', outline: 'none',
          }}
        />
      </div>

      {/* Scenario rows */}
      <div style={{ marginBottom: 12 }}>
        {filtered.length === 0 && <div style={{ color: '#6E8AA0', fontSize: 12, padding: '10px 0' }}>No scenarios match filter.</div>}
        {filtered.map((s, i) => {
          const sid = s.id || i;
          const isExp = expanded === sid;
          const col = CLS_COLOR[s._cls] || '#8899AA';
          return (
            <div key={sid} style={{ marginBottom: 2 }}>
              <div style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                onClick={() => setExpanded(isExp ? null : sid)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...PILL, background: `${col}22`, color: col, fontSize: 10 }}>{s._cls.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.name || s.title || s.id}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6E8AA0' }}>
                    {s._profileMatches.length}P · {s._contactMatches.length}C
                  </span>
                  <span style={{ color: '#6E8AA0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {s.description && !isExp && (
                  <div style={{ fontSize: 10, color: '#6E8AA0', marginTop: 2, paddingLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.description}
                  </div>
                )}
              </div>
              {isExp && (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {s.description && <div style={{ fontSize: 11, color: '#8899AA', marginBottom: 8 }}>{s.description}</div>}
                  {/* Intel Profiles */}
                  <div style={{ fontSize: 11, color: CY, fontWeight: 700, marginBottom: 4 }}>INTEL PROFILES ({s._profileMatches.length})</div>
                  {s._profileMatches.length === 0
                    ? <div style={{ fontSize: 10, color: '#6E8AA0', marginBottom: 8 }}>No intel profile matches.</div>
                    : s._profileMatches.map(({ p, score }, pi) => (
                      <div key={p.id || pi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11 }}>
                        <span style={{ ...PILL, background: `${CY}22`, color: CY, fontSize: 9 }}>{p.role || p.type || 'PROFILE'}</span>
                        <span style={{ flex: 1 }}>{p.name || p.subject || p.id}</span>
                        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                          <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, color: '#6E8AA0', width: 30, textAlign: 'right' }}>{Math.round(score * 100)}%</span>
                      </div>
                    ))
                  }
                  {/* Contacts */}
                  <div style={{ fontSize: 11, color: AM, fontWeight: 700, margin: '8px 0 4px' }}>CONTACTS ({s._contactMatches.length})</div>
                  {s._contactMatches.length === 0
                    ? <div style={{ fontSize: 10, color: '#6E8AA0' }}>No contact matches.</div>
                    : s._contactMatches.map(({ c, score }, ci) => (
                      <div key={c.id || ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11 }}>
                        <span style={{ ...PILL, background: `${AM}22`, color: AM, fontSize: 9 }}>{c.title || c.role || 'CONTACT'}</span>
                        <span style={{ flex: 1 }}>{c.name || c.email || c.id}</span>
                        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                          <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, color: '#6E8AA0', width: 30, textAlign: 'right' }}>{Math.round(score * 100)}%</span>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
        <button onClick={assess} disabled={assessing} style={{
          padding: '5px 16px', borderRadius: 7, fontSize: 11, cursor: assessing ? 'not-allowed' : 'pointer',
          background: assessing ? 'rgba(0,212,255,0.1)' : `${CY}22`, border: `1px solid ${CY}55`, color: CY,
          fontFamily: 'monospace', letterSpacing: 1,
        }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {verdict && <div style={{ marginTop: 8, fontSize: 11, color: '#DCEBF5', lineHeight: 1.5, background: 'rgba(0,212,255,0.06)', borderRadius: 7, padding: '8px 12px' }}>{verdict}</div>}
      </div>
    </div>
  );
}
