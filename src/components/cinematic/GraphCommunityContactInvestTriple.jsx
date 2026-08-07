import { useState, useEffect, useCallback } from 'react';

const API = '';

const GCCITP_RE = /\b(gccitp|community[._-]?contact[._-]?invest(?:igation)?|community[._-]?people[._-]?cases?|community[._-]?human[._-]?intel(?:ligence)?|dark[._-]?communit(?:y|ies)|profiled[._-]?communit(?:y|ies)|which[._-]?communities[._-]?have[._-]?contacts?[._-]?and[._-]?cases?|community[._-]?case[._-]?contact|community[._-]?case[._-]?coverage|community[._-]?invest(?:igation)?[._-]?contact)\b/i;

export function isGccitpQuery(t) {
  return GCCITP_RE.test(t || '');
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'clusters', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.label || c.name || c.title || `Community ${i + 1}`,
    type:    c.type || c.kind || '',
    members: Array.isArray(c.members) ? c.members.join(' ') : (c.members || ''),
    summary: String(c.summary || c.description || '').slice(0, 250),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    org:   c.org || c.company || c.organization || c.employer || '',
    role:  c.role || c.title || c.position || c.job_title || '',
    email: c.email || '',
    desc:  String(c.description || c.bio || c.notes || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.title || inv.name || inv.subject || `Investigation ${i + 1}`,
    kind:   inv.kind || inv.type || inv.category || '',
    status: inv.status || inv.state || '',
    desc:   String(inv.description || inv.summary || inv.notes || '').slice(0, 200),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(comToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || other.subject),
    ...tokens(other.org || other.company || ''),
    ...tokens(other.role || other.kind || other.type || ''),
    ...tokens(other.status || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.email || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!comToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (comToks.has(t)) hits++;
  return hits / Math.max(comToks.size, otherToks.length);
}

function correlate(communities, contacts, investigations) {
  return communities.map(com => {
    const comToks = new Set([
      ...tokens(com.name),
      ...tokens(com.type),
      ...tokens(com.members),
      ...tokens(com.summary),
      ...tokens(com.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(comToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedInvests = investigations
      .map(inv => ({ ...inv, _score: matchScore(comToks, inv) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact = matchedContacts.length > 0;
    const hasInvest  = matchedInvests.length > 0;

    let coverage;
    if (hasContact && hasInvest) coverage = 'FULLY PROFILED';
    else if (hasContact)         coverage = 'CONTACT-ONLY';
    else if (hasInvest)          coverage = 'INVESTIGATED';
    else                         coverage = 'DARK';

    return { ...com, _contacts: matchedContacts, _invests: matchedInvests, _coverage: coverage };
  });
}

export async function buildGccitpScript() {
  const [cR, coR, iR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);
  const communities    = normaliseCommunities(cR.status === 'fulfilled' ? cR.value : []);
  const contacts       = normaliseContacts(coR.status === 'fulfilled' ? coR.value : []);
  const investigations = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
  const enriched       = correlate(communities, contacts, investigations);
  const fp   = enriched.filter(c => c._coverage === 'FULLY PROFILED').length;
  const conly= enriched.filter(c => c._coverage === 'CONTACT-ONLY').length;
  const inv  = enriched.filter(c => c._coverage === 'INVESTIGATED').length;
  const dark = enriched.filter(c => c._coverage === 'DARK').length;
  return (
    `Graph Community × Contact × Investigation Triple Coverage: ${communities.length} network clusters cross-referenced against ` +
    `${contacts.length} contacts and ${investigations.length} open investigations. ` +
    `${fp} FULLY PROFILED (contact-aligned + investigation-backed); ${conly} CONTACT-ONLY (people found, no case); ` +
    `${inv} INVESTIGATED (investigation found, no contact alignment); ${dark} DARK (no human or case coverage — community intelligence gap). ` +
    `Dark clusters: ${enriched.filter(c => c._coverage === 'DARK').slice(0, 3).map(c => c.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const RD = '#EF4444';
const GR = '#10B981';

const COVERAGE_COLOR = {
  'FULLY PROFILED': GR,
  'CONTACT-ONLY':   CY,
  'INVESTIGATED':   AM,
  'DARK':           RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY PROFILED', 'CONTACT-ONLY', 'INVESTIGATED', 'DARK'];

export default function GraphCommunityContactInvestTriple() {
  const [open, setOpen]         = useState(false);
  const [communities, setComs]  = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cR, coR, iR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);
      const raw_c   = normaliseCommunities(cR.status === 'fulfilled' ? cR.value : []);
      const raw_co  = normaliseContacts(coR.status === 'fulfilled' ? coR.value : []);
      const raw_inv = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
      setComs(correlate(raw_c, raw_co, raw_inv));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gccitp-toggle', toggle);
    return () => window.removeEventListener('jarvis:gccitp-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildGccitpScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Community human-intelligence coverage brief: ${brief}. Give a 2-sentence community-contact-investigation coverage assessment.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const darkCount = communities.filter(c => c._coverage === 'DARK').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × Contact × Investigation Triple Coverage (GCCITP)"
        style={{
          position: 'fixed', left: 726080, bottom: 8, zIndex: 325,
          background: darkCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${darkCount > 0 ? RD : CY + '44'}`,
          color: darkCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GCCITP{darkCount > 0 ? ` ⚠${darkCount}` : ''}
      </button>
    );
  }

  const fp    = communities.filter(c => c._coverage === 'FULLY PROFILED').length;
  const conly = communities.filter(c => c._coverage === 'CONTACT-ONLY').length;
  const inv   = communities.filter(c => c._coverage === 'INVESTIGATED').length;
  const dark  = communities.filter(c => c._coverage === 'DARK').length;

  const visible = communities.filter(com =>
    (tab === 'ALL' || com._coverage === tab) &&
    (!search || com.name.toLowerCase().includes(search.toLowerCase()) || com.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ COMMUNITY × CONTACT × INVESTIGATION TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GCCITP</span>
        {dark > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {dark} DARK</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['CLUSTERS',       communities.length, CY],
          ['FULLY PROFILED', fp,                 GR],
          ['CONTACT-ONLY',   conly,              CY],
          ['INVESTIGATED',   inv,                AM],
          ['DARK',           dark,               RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {communities.length > 0 && [
            [fp, GR], [conly, CY], [inv, AM], [dark, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${communities.filter(c => c._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search communities…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No communities match filter.</div>}
        {visible.map(com => {
          const color = COVERAGE_COLOR[com._coverage] || CY;
          const isExp = expanded === com.id;
          return (
            <div key={com.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : com.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{com.name}</span>
                {com.type && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{com.type}</span>}
                {chip(com._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Contacts */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({com._contacts.length})</div>
                    {com._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : com._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.role && chip(c.role, CY)}
                            {c.org && chip(c.org, '#888')}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Investigations */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>INVESTIGATIONS ({com._invests.length})</div>
                    {com._invests.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No investigation alignment</div>
                      : com._invests.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                            {inv.kind && chip(inv.kind, AM)}
                            {inv.status && chip(inv.status, '#888')}
                          </div>
                          <ScoreBar score={inv._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#EF444422', border: `1px solid ${RD}55`, color: RD, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
