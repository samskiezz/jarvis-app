import { useState, useEffect, useCallback } from 'react';

const API = '';

const OCRSTRI_RE = /\b(ocrstri|ops[._-]?event[._-]?contact[._-]?risk|contact[._-]?ops[._-]?risk|ops[._-]?contact[._-]?risk[._-]?signal|ops[._-]?risk[._-]?contact|fully[._-]?exposed[._-]?ops|ops[._-]?exposure[._-]?triple|ops[._-]?contact[._-]?signal)\b/i;

export function isOcrstriQuery(t) {
  return OCRSTRI_RE.test(t || '');
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = ['events', 'ops_events', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:       e.id || String(i),
    name:     e.name || e.title || e.event || `Event ${i + 1}`,
    severity: e.severity || e.level || e.priority || '',
    type:     e.type || e.category || e.kind || '',
    desc:     String(e.description || e.summary || e.detail || '').slice(0, 200),
    tags:     Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    email:   c.email || c.contact_email || '',
    company: c.company || c.organisation || c.employer || c.org || '',
    title:   c.title || c.role || c.position || '',
    desc:    String(c.description || c.notes || c.bio || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseRisks(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'risks', 'signals', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.name || r.title || r.signal || `Risk ${i + 1}`,
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.kind || '',
    sector:   r.sector || r.domain || '',
    desc:     String(r.description || r.summary || r.detail || '').slice(0, 200),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(eventToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || ''),
    ...tokens(other.severity || other.level || ''),
    ...tokens(other.category || other.type || other.kind || ''),
    ...tokens(other.sector || other.domain || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags || ''),
  ].filter(Boolean);
  if (!eventToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (eventToks.has(t)) hits++;
  return hits / Math.max(eventToks.size, otherToks.length);
}

function correlate(opsEvents, contacts, risks) {
  return opsEvents.map(evt => {
    const toks = new Set([
      ...tokens(evt.name),
      ...tokens(evt.type),
      ...tokens(evt.desc),
      ...tokens(evt.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedRisks = risks
      .map(r => ({ ...r, _score: matchScore(toks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact = matchedContacts.length > 0;
    const hasRisk    = matchedRisks.length > 0;

    let coverage;
    if (hasContact && hasRisk) coverage = 'FULLY EXPOSED';
    else if (hasContact)       coverage = 'CONTACT-LINKED';
    else if (hasRisk)          coverage = 'RISK-FLAGGED';
    else                       coverage = 'ISOLATED';

    return { ...evt, _contacts: matchedContacts, _risks: matchedRisks, _coverage: coverage };
  });
}

export async function buildOcrstriScript() {
  const [oR, cR, rR] = await Promise.allSettled([
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const opsEvents = normaliseOpsEvents(oR.status === 'fulfilled' ? oR.value : []);
  const contacts  = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const risks     = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
  const enriched  = correlate(opsEvents, contacts, risks);
  const fe   = enriched.filter(e => e._coverage === 'FULLY EXPOSED').length;
  const cl   = enriched.filter(e => e._coverage === 'CONTACT-LINKED').length;
  const rf   = enriched.filter(e => e._coverage === 'RISK-FLAGGED').length;
  const iso  = enriched.filter(e => e._coverage === 'ISOLATED').length;
  return (
    `Ops Event × Contact × Risk Signal Triple Coverage: ${opsEvents.length} ops events cross-referenced against ` +
    `${contacts.length} contacts and ${risks.length} risk signals. ` +
    `${fe} FULLY EXPOSED (contact alignment + risk signal — people and threats identified); ` +
    `${cl} CONTACT-LINKED (contact affected, no risk signal linked); ` +
    `${rf} RISK-FLAGGED (risk signal present, no contact alignment); ` +
    `${iso} ISOLATED (no contact or risk signal — ops event with no human or threat context). ` +
    `Most critical: ${enriched.filter(e => e._coverage === 'FULLY EXPOSED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const RD = '#EF4444';

const COVERAGE_COLOR = {
  'FULLY EXPOSED':    RD,
  'CONTACT-LINKED':   CY,
  'RISK-FLAGGED':     AM,
  'ISOLATED':         '#555',
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

const TABS = ['ALL', 'FULLY EXPOSED', 'CONTACT-LINKED', 'RISK-FLAGGED', 'ISOLATED'];

export default function OpsEventContactRiskTriple() {
  const [open, setOpen]           = useState(false);
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [oR, cR, rR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const raw_o = normaliseOpsEvents(oR.status === 'fulfilled' ? oR.value : []);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_r = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
      setEvents(correlate(raw_o, raw_c, raw_r));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ocrstri-toggle', toggle);
    return () => window.removeEventListener('jarvis:ocrstri-toggle', toggle);
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
      const brief = await buildOcrstriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Ops event contact-risk exposure brief: ${brief}. Give a 2-sentence assessment of ops event exposure across contacts and risk signals.` }),
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
    const feCount = events.filter(e => e._coverage === 'FULLY EXPOSED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Event × Contact × Risk Signal Triple Coverage (OCRSTRI)"
        style={{
          position: 'fixed', left: 724400, bottom: 8, zIndex: 322,
          background: feCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${feCount > 0 ? RD : CY + '44'}`,
          color: feCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ OCRSTRI{feCount > 0 ? ` ⚠${feCount}` : ''}
      </button>
    );
  }

  const fe  = events.filter(e => e._coverage === 'FULLY EXPOSED').length;
  const cl  = events.filter(e => e._coverage === 'CONTACT-LINKED').length;
  const rf  = events.filter(e => e._coverage === 'RISK-FLAGGED').length;
  const iso = events.filter(e => e._coverage === 'ISOLATED').length;

  const visible = events.filter(e =>
    (tab === 'ALL' || e._coverage === tab) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) || e.type.toLowerCase().includes(search.toLowerCase()) || e.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ OPS EVENT × CONTACT × RISK SIGNAL TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>OCRSTRI</span>
        {fe > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {fe} EXPOSED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['OPS EVENTS',     events.length, CY],
          ['FULLY EXPOSED',  fe,            RD],
          ['CONTACT-LINKED', cl,            CY],
          ['RISK-FLAGGED',   rf,            AM],
          ['ISOLATED',       iso,           '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {events.length > 0 && [
            [fe, RD], [cl, CY], [rf, AM], [iso, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${events.filter(e => e._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ops events…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No ops events match filter.</div>}
        {visible.map(evt => {
          const color = COVERAGE_COLOR[evt._coverage] || CY;
          const isExp = expanded === evt.id;
          return (
            <div key={evt.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : evt.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.name}</span>
                {evt.type && chip(evt.type, '#888')}
                {evt.severity && chip(evt.severity, evt.severity?.toLowerCase?.().includes('crit') ? RD : AM)}
                {chip(evt._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({evt._contacts.length})</div>
                    {evt._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : evt._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.title && chip(c.title, '#888')}
                            {c.company && <span style={{ fontSize: 8, color: '#555' }}>{c.company}</span>}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>RISK SIGNALS ({evt._risks.length})</div>
                    {evt._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No risk signal alignment</div>
                      : evt._risks.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.severity && chip(r.severity, r.severity?.toLowerCase?.().includes('crit') ? RD : AM)}
                            {r.category && chip(r.category, '#888')}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
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
