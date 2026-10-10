import { useState, useEffect, useCallback } from 'react';

const API = '';

const CROETRI_RE = /\b(croetri|contact[._-]?report[._-]?ops|contact[._-]?ops[._-]?report|fully[._-]?exposed[._-]?contact|dark[._-]?contact[._-]?doc|contact[._-]?documentation[._-]?ops|contact[._-]?ops[._-]?doc|reported[._-]?contact[._-]?ops|contact[._-]?paper[._-]?trail[._-]?ops)\b/i;

export function isCroetriQuery(t) {
  return CROETRI_RE.test(t || '');
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records', 'people'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    title: c.title || c.role || c.position || '',
    org:   c.company || c.organisation || c.organization || c.org || '',
    desc:  String(c.description || c.bio || c.notes || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.title || r.name || r.label || `Report ${i + 1}`,
    type:     r.type || r.kind || r.category || '',
    date:     r.date || r.created_at || r.year || '',
    summary:  String(r.summary || r.description || r.abstract || '').slice(0, 200),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
    category: r.category || '',
  }));
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = ['events', 'ops_events', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:       e.id || String(i),
    name:     e.name || e.title || e.event || e.type || `Event ${i + 1}`,
    type:     e.type || e.kind || e.category || '',
    severity: e.severity || e.level || e.priority || '',
    desc:     String(e.description || e.message || e.detail || '').slice(0, 200),
    tags:     Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(contactToks, other) {
  const otherToks = [
    ...tokens(other.name),
    ...tokens(other.type || other.category || ''),
    ...tokens(other.severity || other.title || ''),
    ...tokens(other.summary || other.desc || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!contactToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (contactToks.has(t)) hits++;
  return hits / Math.max(contactToks.size, otherToks.length);
}

function correlate(contacts, reports, opsEvents) {
  return contacts.map(c => {
    const toks = new Set([
      ...tokens(c.name),
      ...tokens(c.title),
      ...tokens(c.org),
      ...tokens(c.desc),
      ...tokens(c.tags),
    ].filter(Boolean));

    const matchedReports = reports
      .map(r => ({ ...r, _score: matchScore(toks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedOps = opsEvents
      .map(e => ({ ...e, _score: matchScore(toks, e) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasReport = matchedReports.length > 0;
    const hasOps    = matchedOps.length > 0;

    let coverage;
    if (hasReport && hasOps) coverage = 'FULLY EXPOSED';
    else if (hasReport)      coverage = 'REPORTED';
    else if (hasOps)         coverage = 'OPS-TRIGGERED';
    else                     coverage = 'DARK';

    return { ...c, _reports: matchedReports, _ops: matchedOps, _coverage: coverage };
  });
}

export async function buildCroetriScript() {
  const [cR, rR, oR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const contacts   = normaliseContacts(cR.status   === 'fulfilled' ? cR.value : []);
  const reports    = normaliseReports(rR.status     === 'fulfilled' ? rR.value : []);
  const opsEvents  = normaliseOpsEvents(oR.status   === 'fulfilled' ? oR.value : []);
  const enriched   = correlate(contacts, reports, opsEvents);
  const fe = enriched.filter(e => e._coverage === 'FULLY EXPOSED').length;
  const rp = enriched.filter(e => e._coverage === 'REPORTED').length;
  const op = enriched.filter(e => e._coverage === 'OPS-TRIGGERED').length;
  const dk = enriched.filter(e => e._coverage === 'DARK').length;
  return (
    `Contact × Report × Ops Event Triple Coverage: ${contacts.length} contacts cross-referenced against ` +
    `${reports.length} intelligence reports and ${opsEvents.length} ops events. ` +
    `${fe} FULLY EXPOSED (report-documented + ops-triggered); ` +
    `${rp} REPORTED (paper trail found, no ops alignment); ` +
    `${op} OPS-TRIGGERED (live ops event, no report documentation); ` +
    `${dk} DARK (no report or ops coverage — contact documentation gap). ` +
    `Top dark contacts: ${enriched.filter(e => e._coverage === 'DARK').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 700;
const PANEL_H = 620;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const PU = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY EXPOSED':  RD,
  'REPORTED':       AM,
  'OPS-TRIGGERED':  CY,
  'DARK':           '#555',
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

const TABS = ['ALL', 'FULLY EXPOSED', 'REPORTED', 'OPS-TRIGGERED', 'DARK'];

export default function ContactReportOpsTriple() {
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
      const [cR, rR, oR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      const raw_c = normaliseContacts(cR.status   === 'fulfilled' ? cR.value : []);
      const raw_r = normaliseReports(rR.status     === 'fulfilled' ? rR.value : []);
      const raw_o = normaliseOpsEvents(oR.status   === 'fulfilled' ? oR.value : []);
      setContacts(correlate(raw_c, raw_r, raw_o));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:croetri-toggle', toggle);
    return () => window.removeEventListener('jarvis:croetri-toggle', toggle);
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
      const brief = await buildCroetriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Contact × Report × Ops Event triple coverage: ${brief}. Give a 2-sentence assessment of which contacts are fully exposed with both report documentation and live ops event relevance versus dark with neither.` }),
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
    const fe = contacts.filter(c => c._coverage === 'FULLY EXPOSED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Report × Ops Event Triple Coverage (CROETRI)"
        style={{
          position: 'fixed', left: 742320, bottom: 8, zIndex: 354,
          background: fe > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${fe > 0 ? RD : CY + '44'}`,
          color: fe > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ CROETRI{fe > 0 ? ` ⚠${fe}` : ''}
      </button>
    );
  }

  const fe = contacts.filter(c => c._coverage === 'FULLY EXPOSED').length;
  const rp = contacts.filter(c => c._coverage === 'REPORTED').length;
  const op = contacts.filter(c => c._coverage === 'OPS-TRIGGERED').length;
  const dk = contacts.filter(c => c._coverage === 'DARK').length;

  const visible = contacts.filter(c =>
    (tab === 'ALL' || c._coverage === tab) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.org.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ CONTACT × REPORT × OPS EVENT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>CROETRI</span>
        {fe > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {fe} FULLY EXPOSED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['CONTACTS',       contacts.length, CY],
          ['FULLY EXPOSED',  fe,              RD],
          ['REPORTED',       rp,              AM],
          ['OPS-TRIGGERED',  op,              CY],
          ['DARK',           dk,              '#555'],
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
            [fe, RD], [rp, AM], [op, CY], [dk, '#444']
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
        {visible.map(c => {
          const color = COVERAGE_COLOR[c._coverage] || CY;
          const isExp = expanded === c.id;
          return (
            <div key={c.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : c.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c.title && chip(c.title, '#888')}
                {c.org && chip(c.org, CY + '88')}
                {chip(c._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>REPORTS ({c._reports.length})</div>
                    {c._reports.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No report documentation</div>
                      : c._reports.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.type && chip(r.type, '#888')}
                            {r.date && chip(String(r.date).slice(0, 4), AM)}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>OPS EVENTS ({c._ops.length})</div>
                    {c._ops.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No ops event alignment</div>
                      : c._ops.map(e => (
                        <div key={e.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                            {e.type && chip(e.type, '#888')}
                            {e.severity && chip(e.severity, e.severity === 'CRITICAL' ? RD : e.severity === 'WARNING' ? AM : GR)}
                          </div>
                          <ScoreBar score={e._score} color={CY} />
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
