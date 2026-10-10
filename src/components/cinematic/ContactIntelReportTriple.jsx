import { useState, useEffect, useCallback } from 'react';

const API = '';

const CIPRTRI_RE = /\b(ciprtri|contact[._-]?intel[._-]?report|contact[._-]?report[._-]?intel|profiled[._-]?contact|uncharted[._-]?contact|contact[._-]?intelligence[._-]?coverage|contact[._-]?intel[._-]?profile[._-]?report|intel[._-]?report[._-]?contact|contact[._-]?profile[._-]?report|intel[._-]?profiled[._-]?contact)\b/i;

export function isCiprtriQuery(t) {
  return CIPRTRI_RE.test(t || '');
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records', 'people'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    company: c.company || c.organisation || c.org || '',
    title:   c.title || c.role || c.position || '',
    email:   c.email || '',
    desc:    String(c.description || c.bio || c.notes || c.summary || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseIntelProfiles(raw) {
  if (!raw) return [];
  const arr = ['intel_profiles', 'profiles', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((p, i) => ({
    id:       p.id || String(i),
    name:     p.name || p.alias || p.label || p.title || `Profile ${i + 1}`,
    category: p.category || p.type || p.kind || '',
    threat:   p.threat_level || p.severity || p.risk || '',
    desc:     String(p.description || p.summary || p.notes || '').slice(0, 200),
    tags:     Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data', 'records', 'documents'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:    r.id || String(i),
    name:  r.name || r.title || r.subject || `Report ${i + 1}`,
    type:  r.type || r.kind || r.category || '',
    date:  r.date || r.created_at || r.published_at || '',
    desc:  String(r.description || r.summary || r.content || r.body || '').slice(0, 200),
    tags:  Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contToks, other) {
  const otherToks = [
    ...tokens(other.name   || ''),
    ...tokens(other.category || other.type || other.kind || ''),
    ...tokens(other.threat || other.severity || ''),
    ...tokens(other.desc   || other.description || other.summary || ''),
    ...tokens(other.tags   || ''),
  ].filter(Boolean);
  if (!contToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (contToks.has(t)) hits++;
  return hits / Math.max(contToks.size, otherToks.length);
}

function correlate(contacts, intelProfiles, reports) {
  return contacts.map(cont => {
    const toks = new Set([
      ...tokens(cont.name),
      ...tokens(cont.company),
      ...tokens(cont.title),
      ...tokens(cont.desc),
      ...tokens(cont.tags),
    ].filter(Boolean));

    const matchedProfiles = intelProfiles
      .map(p => ({ ...p, _score: matchScore(toks, p) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedReports = reports
      .map(r => ({ ...r, _score: matchScore(toks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasProfile = matchedProfiles.length > 0;
    const hasReport  = matchedReports.length  > 0;

    let coverage;
    if (hasProfile && hasReport) coverage = 'FULLY PROFILED';
    else if (hasProfile)         coverage = 'PROFILED';
    else if (hasReport)          coverage = 'REPORTED';
    else                         coverage = 'UNCHARTED';

    return { ...cont, _profiles: matchedProfiles, _reports: matchedReports, _coverage: coverage };
  });
}

export async function buildCiprtriScript() {
  const [cR, pR, rR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
  ]);
  const contacts  = normaliseContacts(cR.status      === 'fulfilled' ? cR.value : []);
  const profiles  = normaliseIntelProfiles(pR.status === 'fulfilled' ? pR.value : []);
  const reports   = normaliseReports(rR.status       === 'fulfilled' ? rR.value : []);
  const enriched  = correlate(contacts, profiles, reports);
  const fp  = enriched.filter(e => e._coverage === 'FULLY PROFILED').length;
  const pro = enriched.filter(e => e._coverage === 'PROFILED').length;
  const rep = enriched.filter(e => e._coverage === 'REPORTED').length;
  const unc = enriched.filter(e => e._coverage === 'UNCHARTED').length;
  return (
    `Contact × Intel Profile × Report Triple Coverage: ${contacts.length} contacts cross-referenced against ` +
    `${profiles.length} intel profiles and ${reports.length} reports. ` +
    `${fp} FULLY PROFILED (intel profile + report documentation); ` +
    `${pro} PROFILED (intel profile only, no report); ` +
    `${rep} REPORTED (report coverage, no intel profile); ` +
    `${unc} UNCHARTED (neither — contact with no intelligence documentation). ` +
    `Most critical uncharted contacts: ${enriched.filter(e => e._coverage === 'UNCHARTED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PU = '#A78BFA';

const COVERAGE_COLOR = {
  'FULLY PROFILED': GR,
  'PROFILED':       PU,
  'REPORTED':       CY,
  'UNCHARTED':      '#555',
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

const TABS = ['ALL', 'FULLY PROFILED', 'PROFILED', 'REPORTED', 'UNCHARTED'];

export default function ContactIntelReportTriple() {
  const [open, setOpen]             = useState(false);
  const [contacts, setContacts]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cR, pR, rR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
      ]);
      const raw_c = normaliseContacts(cR.status      === 'fulfilled' ? cR.value : []);
      const raw_p = normaliseIntelProfiles(pR.status === 'fulfilled' ? pR.value : []);
      const raw_r = normaliseReports(rR.status       === 'fulfilled' ? rR.value : []);
      setContacts(correlate(raw_c, raw_p, raw_r));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ciprtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:ciprtri-toggle', toggle);
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
      const brief = await buildCiprtriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Contact intelligence coverage brief: ${brief}. Give a 2-sentence assessment of contact profiling and report documentation gaps.` }),
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
    const uncCount = contacts.filter(c => c._coverage === 'UNCHARTED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Intel Profile × Report Triple Coverage (CIPRTRI)"
        style={{
          position: 'fixed', left: 734480, bottom: 8, zIndex: 340,
          background: uncCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${uncCount > 0 ? AM : CY + '44'}`,
          color: uncCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ CIPRTRI{uncCount > 0 ? ` ⚠${uncCount}` : ''}
      </button>
    );
  }

  const fp  = contacts.filter(c => c._coverage === 'FULLY PROFILED').length;
  const pro = contacts.filter(c => c._coverage === 'PROFILED').length;
  const rep = contacts.filter(c => c._coverage === 'REPORTED').length;
  const unc = contacts.filter(c => c._coverage === 'UNCHARTED').length;

  const visible = contacts.filter(c =>
    (tab === 'ALL' || c._coverage === tab) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ CONTACT × INTEL PROFILE × REPORT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>CIPRTRI</span>
        {unc > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {unc} UNCHARTED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['CONTACTS',        contacts.length, CY],
          ['FULLY PROFILED',  fp,              GR],
          ['PROFILED',        pro,             PU],
          ['REPORTED',        rep,             CY],
          ['UNCHARTED',       unc,             '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {contacts.length > 0 && [
            [fp, GR], [pro, PU], [rep, CY], [unc, '#444']
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

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

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No contacts match filter.</div>}
        {visible.map(cont => {
          const color = COVERAGE_COLOR[cont._coverage] || CY;
          const isExp = expanded === cont.id;
          return (
            <div key={cont.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : cont.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cont.name}</span>
                {cont.company && chip(cont.company, '#888')}
                {cont.title   && chip(cont.title,   '#888')}
                {chip(cont._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: PU, marginBottom: 4, fontWeight: 600 }}>INTEL PROFILES ({cont._profiles.length})</div>
                    {cont._profiles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No intel profile alignment</div>
                      : cont._profiles.map(p => (
                        <div key={p.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            {p.category && chip(p.category, '#888')}
                            {p.threat   && chip(p.threat,   p.threat?.toLowerCase?.().includes('high') || p.threat?.toLowerCase?.().includes('critical') ? '#EF4444' : AM)}
                          </div>
                          <ScoreBar score={p._score} color={PU} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>REPORTS ({cont._reports.length})</div>
                    {cont._reports.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No report alignment</div>
                      : cont._reports.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.type && chip(r.type, '#888')}
                          </div>
                          <ScoreBar score={r._score} color={CY} />
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

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
