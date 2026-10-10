import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CGAOE_RE = /\b(cgaoe|contact\s+annotation\s+ops|contact\s+graph\s+annotation\s+ops|contact\s+ops\s+annotation|alarmed\s+contact|annotation\s+ops\s+contact|contact\s+graph\s+ops|contact\s+ops\s+alert|contact\s+annotated\s+ops|contact\s+flagged\s+ops)\b/i;
const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
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
    id: c.id || c._id || `contact-${i}`,
    label: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    email: c.email || '',
    company: c.company || c.organisation || c.org || '',
    title: c.title || c.role || c.job_title || '',
    description: c.description || c.bio || c.notes || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    _searchText: [c.name, c.full_name, c.email, c.company, c.organisation, c.title, c.role, c.description, c.bio, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseAnnotations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.annotations) ? raw.annotations
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `annot-${i}`,
    label: a.text || a.name || a.title || `Annotation ${i + 1}`,
    targetType: a.target_type || a.type || a.kind || '',
    actor: a.actor || a.author || '',
    category: a.category || '',
    description: a.description || a.summary || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    _searchText: [a.text, a.name, a.title, a.target_type, a.type, a.actor, a.author, a.category, a.description, a.tags].filter(Boolean).join(' '),
  }));
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.events) ? raw.events
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => ({
    id: e.id || e._id || `opsev-${i}`,
    label: e.name || e.title || e.event_type || `Event ${i + 1}`,
    severity: e.severity || e.level || e.priority || '',
    type: e.type || e.kind || e.category || '',
    description: e.description || e.summary || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    _searchText: [e.name, e.title, e.event_type, e.type, e.kind, e.category, e.severity, e.description, e.tags].filter(Boolean).join(' '),
  }));
}

function correlate(contacts, annotations, opsEvents) {
  return contacts.map(contact => {
    const cToks = tok(contact._searchText);
    const matchedAnnotations = annotations
      .map(a => ({ ...a, score: matchScore(cToks, a._searchText) }))
      .filter(a => a.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedOpsEvents = opsEvents
      .map(e => ({ ...e, score: matchScore(cToks, e._searchText) }))
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasAnnotation = matchedAnnotations.length > 0;
    const hasOps = matchedOpsEvents.length > 0;
    let coverage;
    if (hasAnnotation && hasOps) coverage = 'FULLY_ALARMED';
    else if (hasAnnotation) coverage = 'ANNOTATED';
    else if (hasOps) coverage = 'OPS_FLAGGED';
    else coverage = 'CLEAR';
    return { ...contact, matchedAnnotations, matchedOpsEvents, coverage };
  });
}

export function isCgaoeQuery(t) {
  return CGAOE_RE.test(t || '');
}

export async function buildCgaoeScript() {
  try {
    const [cRes, aRes, oRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(cRes);
    const annotations = normaliseAnnotations(aRes);
    const opsEvents = normaliseOpsEvents(oRes);
    const correlated = correlate(contacts, annotations, opsEvents);
    const alarmed = correlated.filter(c => c.coverage === 'FULLY_ALARMED').length;
    const annotated = correlated.filter(c => c.coverage === 'ANNOTATED').length;
    const opsFlagged = correlated.filter(c => c.coverage === 'OPS_FLAGGED').length;
    const clear = correlated.filter(c => c.coverage === 'CLEAR').length;
    return `CGAOE analysis: ${contacts.length} contacts cross-referenced against ${annotations.length} graph annotations and ${opsEvents.length} active ops events. ${alarmed} contacts are FULLY ALARMED — both graph annotation context and live operational trigger detected. ${clear} contacts are CLEAR with no graph or ops event coverage; these represent personnel intelligence blind spots requiring immediate assessment.`;
  } catch {
    return 'CGAOE data unavailable — check /entities/Contact, /v1/graph/annotations, and /v1/ops/events endpoints.';
  }
}

const CY = '#00CFFF';
const GN = '#00FF9F';
const AM = '#FFB300';
const OR = '#FF6B35';

const FILTER_TABS = ['ALL', 'FULLY ALARMED', 'ANNOTATED', 'OPS FLAGGED', 'CLEAR'];
const COV_MAP = { 'FULLY ALARMED': 'FULLY_ALARMED', 'ANNOTATED': 'ANNOTATED', 'OPS FLAGGED': 'OPS_FLAGGED', 'CLEAR': 'CLEAR' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 3, background: '#1A2535', borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${Math.min(100, Math.round(score * 100))}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function Badge({ label, color }) {
  if (!label) return null;
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${color}22`, color, border: `1px solid ${color}55`, letterSpacing: 1, marginLeft: 4 }}>
      {String(label).toUpperCase().slice(0, 12)}
    </span>
  );
}

export default function ContactGraphAnnotationOpsTriple() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, aRes, oRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const contacts = normaliseContacts(cRes);
      const annotations = normaliseAnnotations(aRes);
      const opsEvents = normaliseOpsEvents(oRes);
      setData(correlate(contacts, annotations, opsEvents));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:cgaoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:cgaoe-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = data.filter(c => {
    if (filter !== 'ALL' && c.coverage !== COV_MAP[filter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.label.toLowerCase().includes(q) && !c._searchText.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    alarmed: data.filter(c => c.coverage === 'FULLY_ALARMED').length,
    annotated: data.filter(c => c.coverage === 'ANNOTATED').length,
    opsFlagged: data.filter(c => c.coverage === 'OPS_FLAGGED').length,
    clear: data.filter(c => c.coverage === 'CLEAR').length,
  };

  const totalAnnotations = [...new Set(data.flatMap(c => c.matchedAnnotations.map(a => a.id)))].length;
  const totalOpsEvents = [...new Set(data.flatMap(c => c.matchedOpsEvents.map(e => e.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildCgaoeScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Contact × Graph Annotation × Ops Event Triple Coverage"
        style={{
          position: 'fixed', left: 826880, bottom: 8, zIndex: 505,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${AM}55`,
          color: AM, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ CGAOE
        {counts.alarmed > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.alarmed}
          </span>
        )}
      </button>
    );
  }

  const covColor = c => c === 'FULLY_ALARMED' ? AM : c === 'ANNOTATED' ? CY : c === 'OPS_FLAGGED' ? OR : '#555';

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 505, width: 'min(800px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${AM}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 60px ${AM}22`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${AM}33`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ color: AM, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ CGAOE</span>
        <span style={{ color: '#6E8AA0', fontSize: 10, flex: 1 }}>Contact × Graph Annotation × Ops Event Triple Coverage</span>
        {loading && <span style={{ color: AM, fontSize: 9, animation: 'cgaoe_pulse 1s infinite' }}>◌ LOADING</span>}
        <button onClick={assess} disabled={assessing} style={{ background: `${AM}22`, border: `1px solid ${AM}55`, color: AM, fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6E8AA0', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>✕</button>
      </div>

      {assessText && (
        <div style={{ padding: '8px 14px', background: `${AM}11`, borderBottom: `1px solid ${AM}22`, fontSize: 10, color: '#DCEBF5', lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${AM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'CONTACTS', val: data.length, color: '#6E8AA0' },
          { label: 'ANNOTS', val: totalAnnotations, color: CY },
          { label: 'OPS EVT', val: totalOpsEvents, color: OR },
          { label: 'ALARMED', val: counts.alarmed, color: AM },
          { label: 'ANNOTATED', val: counts.annotated, color: CY },
          { label: 'OPS FLAGD', val: counts.opsFlagged, color: OR },
          { label: 'CLEAR', val: counts.clear, color: '#555' },
        ].map(s => (
          <div key={s.label} style={{ background: `${s.color}11`, border: `1px solid ${s.color}33`, borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 64 }}>
            <div style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {data.length > 0 && (
        <div style={{ margin: '6px 14px', height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
          {[
            { n: counts.alarmed, c: AM },
            { n: counts.annotated, c: CY },
            { n: counts.opsFlagged, c: OR },
            { n: counts.clear, c: '#333' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${AM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${AM}33` : 'transparent',
            border: `1px solid ${filter === f ? AM : '#2A3A50'}`,
            color: filter === f ? AM : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid #2A3A50`, color: '#DCEBF5', fontSize: 9, padding: '2px 8px', borderRadius: 3, outline: 'none', width: 130 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No contacts match filter.'}
          </div>
        )}
        {visible.map(contact => {
          const isExp = expanded === contact.id;
          const cc = covColor(contact.coverage);
          return (
            <div key={contact.id} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${cc}33`, background: `${cc}07`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : contact.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cc, flexShrink: 0 }} />
                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.label}</span>
                {contact.title && <Badge label={contact.title} color={'#6E8AA0'} />}
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{contact.coverage.replace('_', ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {(contact.email || contact.company) && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8 }}>
                      {contact.email && <span style={{ marginRight: 10 }}>{contact.email}</span>}
                      {contact.company && <span>{contact.company}</span>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: annotations */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>ANNOTATIONS ({contact.matchedAnnotations.length})</div>
                      {contact.matchedAnnotations.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no annotation match</div>
                        : contact.matchedAnnotations.slice(0, 5).map(a => (
                          <div key={a.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
                              {a.targetType && <Badge label={a.targetType} color={CY} />}
                            </div>
                            <ScoreBar score={a.score} color={CY} />
                          </div>
                        ))}
                    </div>
                    {/* Right: ops events */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS ({contact.matchedOpsEvents.length})</div>
                      {contact.matchedOpsEvents.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no ops event match</div>
                        : contact.matchedOpsEvents.slice(0, 5).map(e => (
                          <div key={e.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                              {e.severity && <Badge label={e.severity} color={OR} />}
                              {e.type && <Badge label={e.type} color={'#6E8AA0'} />}
                            </div>
                            <ScoreBar score={e.score} color={OR} />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes cgaoe_pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
