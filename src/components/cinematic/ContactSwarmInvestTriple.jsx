import { useState, useEffect, useCallback } from 'react';

const API = '';

const CSJITRI_RE = /\b(contact[._-]?swarm[._-]?invest|csjitri|fully[._-]?tracked[._-]?contact|untracked[._-]?contact|swarm[._-]?invested[._-]?contact|contact[._-]?hunt[._-]?invest|contact[._-]?triple|swarm[._-]?invest[._-]?contact|who[._-]?is[._-]?tracked)\b/i;

export function isCsjitriQuery(t) {
  return CSJITRI_RE.test(t || '');
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || `Contact ${i + 1}`,
    org:   c.org || c.company || c.organisation || c.organization || '',
    role:  c.role || c.title || c.position || '',
    desc:  String(c.description || c.notes || c.bio || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = ['swarm_jobs', 'swarmjobs', 'jobs', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.job || `Job ${i + 1}`,
    kind:   j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.target || j.summary || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:   inv.id || String(i),
    name: inv.title || inv.name || inv.subject || `Case ${i + 1}`,
    kind: inv.kind || inv.type || inv.category || '',
    desc: String(inv.description || inv.summary || inv.notes || '').slice(0, 200),
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(cToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.org || other.category || other.sector || other.kind || ''),
    ...tokens(other.role || other.type || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!cToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (cToks.has(t)) hits++;
  return hits / Math.max(cToks.size, otherToks.length);
}

function correlate(contacts, jobs, investigations) {
  return contacts.map(contact => {
    const cToks = new Set([
      ...tokens(contact.name),
      ...tokens(contact.org),
      ...tokens(contact.role),
      ...tokens(contact.desc),
      ...tokens(contact.tags),
    ].filter(Boolean));

    const matchedJobs = jobs
      .map(j => ({ ...j, _score: matchScore(cToks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedInvest = investigations
      .map(inv => ({ ...inv, _score: matchScore(cToks, inv) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasJob    = matchedJobs.length > 0;
    const hasInvest = matchedInvest.length > 0;

    let coverage;
    if (hasJob && hasInvest) coverage = 'FULLY TRACKED';
    else if (hasJob)         coverage = 'SWARM-ONLY';
    else if (hasInvest)      coverage = 'INVESTIGATED';
    else                     coverage = 'UNTRACKED';

    return { ...contact, _jobs: matchedJobs, _invest: matchedInvest, _coverage: coverage };
  });
}

export async function buildCsjitriScript() {
  const [cR, jR, iR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);
  const contacts = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const jobs     = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
  const invs     = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
  const enriched = correlate(contacts, jobs, invs);
  const ft  = enriched.filter(c => c._coverage === 'FULLY TRACKED').length;
  const so  = enriched.filter(c => c._coverage === 'SWARM-ONLY').length;
  const inv = enriched.filter(c => c._coverage === 'INVESTIGATED').length;
  const ut  = enriched.filter(c => c._coverage === 'UNTRACKED').length;
  return (
    `Contact × SwarmJob × Investigation Triple Coverage: ${contacts.length} contacts cross-referenced against ${jobs.length} swarm jobs and ${invs.length} open investigations. ` +
    `${ft} FULLY TRACKED (swarm + investigation backing); ${so} SWARM-ONLY (swarm coverage, no investigation); ` +
    `${inv} INVESTIGATED (investigation found, no swarm coverage); ${ut} UNTRACKED (no coverage — surveillance gap). ` +
    `Untracked: ${enriched.filter(c => c._coverage === 'UNTRACKED').slice(0, 3).map(c => c.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';
const TE = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY TRACKED': GR,
  'SWARM-ONLY':    LM,
  'INVESTIGATED':  CY,
  'UNTRACKED':     RD,
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

const TABS = ['ALL', 'FULLY TRACKED', 'SWARM-ONLY', 'INVESTIGATED', 'UNTRACKED'];

export default function ContactSwarmInvestTriple() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
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
      const [cR, jR, iR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_j = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
      const raw_i = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
      setContacts(correlate(raw_c, raw_j, raw_i));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:csjitri-toggle', toggle);
    return () => window.removeEventListener('jarvis:csjitri-toggle', toggle);
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
      const brief = await buildCsjitriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Contact × SwarmJob × Investigation triple coverage brief: ${brief}. Give a 2-sentence contact surveillance coverage assessment.` }),
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
    const untrackedCount = contacts.filter(c => c._coverage === 'UNTRACKED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × SwarmJob × Investigation Triple Coverage (CSJITRI)"
        style={{
          position: 'fixed', left: 719920, bottom: 8, zIndex: 314,
          background: untrackedCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${untrackedCount > 0 ? RD : CY + '44'}`,
          color: untrackedCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ CSJITRI{untrackedCount > 0 ? ` ⚠${untrackedCount}` : ''}
      </button>
    );
  }

  const ft  = contacts.filter(c => c._coverage === 'FULLY TRACKED').length;
  const so  = contacts.filter(c => c._coverage === 'SWARM-ONLY').length;
  const inv = contacts.filter(c => c._coverage === 'INVESTIGATED').length;
  const ut  = contacts.filter(c => c._coverage === 'UNTRACKED').length;

  const visible = contacts.filter(c =>
    (tab === 'ALL' || c._coverage === tab) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.org.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ CONTACT × SWARMJOB × INVESTIGATION TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>CSJITRI</span>
        {ut > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {ut} UNTRACKED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['CONTACTS',       contacts.length, CY],
          ['FULLY TRACKED',  ft,  GR],
          ['SWARM-ONLY',     so,  LM],
          ['INVESTIGATED',   inv, TE],
          ['UNTRACKED',      ut,  RD],
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
          {contacts.length > 0 && [
            [ft, GR], [so, LM], [inv, TE], [ut, RD]
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
          }}>{t}{t !== 'ALL' ? ` (${contacts.filter(c => c._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No contacts match filter.</div>}
        {visible.map(contact => {
          const color = COVERAGE_COLOR[contact._coverage] || CY;
          const isExp = expanded === contact.id;
          return (
            <div key={contact.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : contact.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                {contact.role && <span style={{ fontSize: 9, color: '#888', flexShrink: 0 }}>{contact.role}</span>}
                {contact.org && chip(contact.org, TE)}
                {chip(contact._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: SwarmJobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SWARM JOBS ({contact._jobs.length})</div>
                    {contact._jobs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No swarm coverage</div>
                      : contact._jobs.map(j => (
                        <div key={j.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                            {j.kind && chip(j.kind, LM)}
                            {j.status && chip(j.status, AM)}
                          </div>
                          <ScoreBar score={j._score} color={LM} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Investigations */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>INVESTIGATIONS ({contact._invest.length})</div>
                    {contact._invest.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No investigation backing</div>
                      : contact._invest.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                            {inv.kind && chip(inv.kind, CY)}
                          </div>
                          <ScoreBar score={inv._score} color={CY} />
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
