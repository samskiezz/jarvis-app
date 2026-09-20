import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const OECDTRI_RE = /\b(oecdtri|ops[_\s-]?event[_\s-]?contact[_\s-]?dataset|ops[_\s-]?contact[_\s-]?data(?:set)?|ops[_\s-]?dataset[_\s-]?contact|event[_\s-]?contact[_\s-]?data(?:set)?|contact[_\s-]?dataset[_\s-]?ops|blind[_\s-]?ops[_\s-]?event[_\s-]?data|ops[_\s-]?event[_\s-]?data[_\s-]?gap|fully[_\s-]?equipped[_\s-]?ops|ops[_\s-]?fully[_\s-]?equipped)\b/i;

export function isOecdtriQuery(t) { return OECDTRI_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const k of ['results', 'items', 'data', 'events', 'contacts', 'datasets', 'records', 'list', 'entries']) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function normEvents(raw) {
  return normaliseArray(raw).map(e => ({
    id: e.id || e._id || e.event_id || String(Math.random()),
    name: e.name || e.title || e.event_name || e.label || e.type || 'Unnamed Event',
    severity: e.severity || e.priority || e.level || 'INFO',
    desc: [e.description, e.summary, e.category, e.type].filter(Boolean).join(' '),
  }));
}

function normContacts(raw) {
  return normaliseArray(raw).map(c => ({
    id: c.id || c._id || String(Math.random()),
    text: [c.name, c.title, c.email, c.company, c.organization, c.role, c.description, c.tags].filter(Boolean).join(' '),
    label: c.name || c.title || c.email || 'Unknown Contact',
  }));
}

function normDatasets(raw) {
  return normaliseArray(raw).map(d => ({
    id: d.id || d._id || String(Math.random()),
    text: [d.name, d.title, d.description, d.kind, d.type, d.tags, d.category].filter(Boolean).join(' '),
    label: d.name || d.title || 'Unknown Dataset',
    kind: d.kind || d.type || '',
    rows: d.row_count || d.rows || d.count || null,
  }));
}

function matchScore(eventToks, fields) {
  if (!eventToks.length) return 0;
  const fToks = new Set(tok(fields));
  const hits = eventToks.filter(t => fToks.has(t)).length;
  return hits / eventToks.length;
}

const THRESHOLD = 0.1;

function correlate(events, contacts, datasets) {
  return events.map(ev => {
    const evToks = tok(`${ev.name} ${ev.desc}`);
    const bestContact = contacts.reduce((best, c) => {
      const s = matchScore(evToks, c.text);
      return s > best.score ? { score: s, item: c } : best;
    }, { score: 0, item: null });
    const bestDataset = datasets.reduce((best, d) => {
      const s = matchScore(evToks, d.text);
      return s > best.score ? { score: s, item: d } : best;
    }, { score: 0, item: null });
    const hasContact = bestContact.score >= THRESHOLD;
    const hasDataset = bestDataset.score >= THRESHOLD;
    const state = hasContact && hasDataset ? 'FULLY EQUIPPED'
      : hasContact ? 'CONTACT-LINKED'
      : hasDataset ? 'DATA-BACKED'
      : 'BLIND';
    return { ...ev, state, contactScore: bestContact.score, datasetScore: bestDataset.score,
      matchedContact: bestContact.item, matchedDataset: bestDataset.item };
  });
}

export async function buildOecdtriScript() {
  const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}` };
  const [evR, coR, dsR] = await Promise.allSettled([
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.ok ? r.json() : []),
  ]);
  const events = normEvents(evR.status === 'fulfilled' ? evR.value : []);
  const contacts = normContacts(coR.status === 'fulfilled' ? coR.value : []);
  const datasets = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const rows = correlate(events, contacts, datasets);
  const fe = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
  const cl = rows.filter(r => r.state === 'CONTACT-LINKED').length;
  const db = rows.filter(r => r.state === 'DATA-BACKED').length;
  const bl = rows.filter(r => r.state === 'BLIND').length;
  return `OECDTRI Ops Event × Contact × Dataset: ${events.length} ops events cross-referenced against ${contacts.length} contacts and ${datasets.length} datasets. ` +
    `FULLY EQUIPPED: ${fe} (contact assigned + dataset backing — event has both human accountability and data coverage). ` +
    `CONTACT-LINKED: ${cl} (contact found, no dataset — human assigned but no data backing). ` +
    `DATA-BACKED: ${db} (dataset found, no contact — data exists but no human assigned). ` +
    `BLIND: ${bl} (no contact or dataset coverage — ops event with no accountability or data support).`;
}

const TILE = {
  flex: '1 1 120px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
};
const LBL = { fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const SEV_COLOR = { CRITICAL: '#ef4444', WARNING: '#f59e0b', INFO: '#38bdf8', LOW: '#6ee7b7' };

const STATE_COLOR = {
  'FULLY EQUIPPED': '#22d3ee',
  'CONTACT-LINKED': '#34d399',
  'DATA-BACKED': '#a78bfa',
  'BLIND': '#f59e0b',
};
const STATE_ORDER = ['FULLY EQUIPPED', 'CONTACT-LINKED', 'DATA-BACKED', 'BLIND'];

export default function OpsEventContactDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}` };
    const [evR, coR, dsR] = await Promise.allSettled([
      fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const events = normEvents(evR.status === 'fulfilled' ? evR.value : []);
    const conts = normContacts(coR.status === 'fulfilled' ? coR.value : []);
    const dsets = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
    setContacts(conts);
    setDatasets(dsets);
    setRows(correlate(events, conts, dsets));
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:oecdtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:oecdtri-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    const fe = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
    const bl = rows.filter(r => r.state === 'BLIND').length;
    const summary = `OECDTRI: ${rows.length} ops events. FULLY EQUIPPED: ${fe}. CONTACT-LINKED: ${rows.filter(r => r.state === 'CONTACT-LINKED').length}. DATA-BACKED: ${rows.filter(r => r.state === 'DATA-BACKED').length}. BLIND (critical gap — no contact or dataset): ${bl}. ${contacts.length} contacts, ${datasets.length} datasets indexed.`;
    setAssessing(true);
    try {
      const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: `Assess this OECDTRI ops event contact and dataset coverage state in two sentences. Identify the highest-priority blind ops events that lack both contact accountability and dataset backing: ${summary}` }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: summary } }));
    }
    setAssessing(false);
  }, [rows, contacts, datasets, assessing]);

  const blind = rows.filter(r => r.state === 'BLIND').length;
  const fe = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
  const visible = rows
    .filter(r => filter === 'ALL' || r.state === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const pct = rows.length ? Math.round((fe / rows.length) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: 'fixed', left: 768640, bottom: 8, zIndex: 401,
          background: blind > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(34,211,238,0.12)',
          border: `1px solid ${blind > 0 ? 'rgba(245,158,11,0.5)' : 'rgba(34,211,238,0.35)'}`,
          color: blind > 0 ? '#f59e0b' : '#22d3ee', borderRadius: 6, padding: '3px 9px',
          fontSize: 10, letterSpacing: 1.5, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ OECDTRI{blind > 0 ? ` ⚠${blind}` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 9999, width: 700, maxHeight: 620,
      background: 'rgba(10,14,28,0.97)', border: '1px solid rgba(34,211,238,0.25)',
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", color: '#e2e8f0',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: '#22d3ee', flex: 1 }}>◈ OPS EVENT × CONTACT × DATASET</span>
        {loading && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>LOADING…</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
      </div>

      {/* Stat Tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => {
          const count = rows.filter(r => r.state === s).length;
          return (
            <div key={s} style={{ ...TILE, borderColor: count > 0 ? `${STATE_COLOR[s]}40` : 'rgba(255,255,255,0.07)' }}>
              <div style={LBL}>{s}</div>
              <div style={{ ...VAL, color: STATE_COLOR[s] }}>{count}</div>
            </div>
          );
        })}
        <div style={TILE}>
          <div style={LBL}>CONTACTS</div>
          <div style={VAL}>{contacts.length}</div>
        </div>
        <div style={TILE}>
          <div style={LBL}>DATASETS</div>
          <div style={VAL}>{datasets.length}</div>
        </div>
      </div>

      {/* Coverage Bar */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: 1 }}>
          {pct}% FULLY EQUIPPED · {contacts.length} contacts · {datasets.length} datasets
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === s ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: filter === s ? '#22d3ee' : 'rgba(255,255,255,0.5)',
            borderRadius: 4, padding: '3px 8px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
          }}>{s} {s !== 'ALL' ? `(${rows.filter(r => r.state === s).length})` : `(${rows.length})`}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search ops events…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '5px 10px', color: '#e2e8f0', fontSize: 10, letterSpacing: 1,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {visible.slice(0, 80).map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{
              fontSize: 8, letterSpacing: 1, color: SEV_COLOR[r.severity?.toUpperCase()] || '#94a3b8',
              background: `${SEV_COLOR[r.severity?.toUpperCase()] || '#94a3b8'}18`, borderRadius: 3,
              padding: '2px 5px', whiteSpace: 'nowrap', minWidth: 52, textAlign: 'center',
            }}>{(r.severity || 'INFO').toUpperCase().slice(0, 4)}</span>
            <span style={{
              fontSize: 8, letterSpacing: 1, color: STATE_COLOR[r.state],
              background: `${STATE_COLOR[r.state]}18`, borderRadius: 3, padding: '2px 5px',
              whiteSpace: 'nowrap', minWidth: 90, textAlign: 'center',
            }}>{r.state}</span>
            <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(r.contactScore * 100)}%`, background: '#34d399' }} />
              </div>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(r.datasetScore * 100)}%`, background: '#a78bfa' }} />
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '20px 0', textAlign: 'center' }}>no events match</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={load} disabled={loading} style={{
          background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
          color: '#22d3ee', borderRadius: 4, padding: '4px 12px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
        }}>↺ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(255,255,255,0.05)' : 'rgba(34,211,238,0.14)',
          border: '1px solid rgba(34,211,238,0.35)', color: assessing ? 'rgba(255,255,255,0.3)' : '#22d3ee',
          borderRadius: 4, padding: '4px 12px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
        }}>{assessing ? '…' : '▶ ASSESS'}</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
          {rows.length} events · /v1/ops/events × /entities/Contact × /v1/datasets
        </span>
      </div>
    </div>
  );
}
