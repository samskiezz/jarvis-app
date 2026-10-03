import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const CDOE_RE = /\b(cdoe|contact[._-]?dataset[._-]?ops|contact[._-]?data[._-]?ops|contact[._-]?ops[._-]?dataset|dataset[._-]?ops[._-]?contact|contact[._-]?data[._-]?event|contact[._-]?ops[._-]?data|data[._-]?ops[._-]?contact|contact[._-]?dataset[._-]?event|ops[._-]?dataset[._-]?contact)\b/i;
export function isCdoeQuery(t) { return CDOE_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}
function matchScore(aTokens, bSet) {
  if (!aTokens.length || !bSet.size) return 0;
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bSet.size);
}
const THRESHOLD = 0.06;

const COV = {
  FULLY_WIRED: 'FULLY_WIRED',
  DATA_ONLY: 'DATA_ONLY',
  OPS_FLAGGED: 'OPS_FLAGGED',
  UNSEEN: 'UNSEEN',
};

const COV_COLOUR = {
  [COV.FULLY_WIRED]: '#00ffcc',
  [COV.DATA_ONLY]: '#7bd4ff',
  [COV.OPS_FLAGGED]: '#ffd700',
  [COV.UNSEEN]: '#ff4455',
};

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  const first = Object.values(raw).find(v => Array.isArray(v));
  return first || [];
}

function classify(contactTokens, datasets, opsEvents) {
  const dsSet = new Set(datasets.flatMap(d => tok([d.name, d.description, d.type, d.domain, d.tags].join(' '))));
  const opsSet = new Set(opsEvents.flatMap(e => tok([e.name, e.description, e.type, e.source, e.title, e.summary].join(' '))));
  const dsScore = matchScore(contactTokens, dsSet);
  const opsScore = matchScore(contactTokens, opsSet);
  const hasDs = dsScore >= THRESHOLD;
  const hasOps = opsScore >= THRESHOLD;
  if (hasDs && hasOps) return { cov: COV.FULLY_WIRED, dsScore, opsScore };
  if (hasDs) return { cov: COV.DATA_ONLY, dsScore, opsScore };
  if (hasOps) return { cov: COV.OPS_FLAGGED, dsScore, opsScore };
  return { cov: COV.UNSEEN, dsScore, opsScore };
}

export async function buildCdoeScript() {
  const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  try {
    const [cRes, dsRes, opsRes] = await Promise.all([
      fetch(`${API}/entities/Contact`, { headers: hdrs }),
      fetch(`${API}/v1/datasets`, { headers: hdrs }),
      fetch(`${API}/v1/ops/events`, { headers: hdrs }),
    ]);
    const contacts = normaliseArray(cRes.ok ? await cRes.json() : {}, 'items', 'data', 'results', 'contacts');
    const datasets = normaliseArray(dsRes.ok ? await dsRes.json() : {}, 'items', 'data', 'results', 'datasets');
    const opsEvents = normaliseArray(opsRes.ok ? await opsRes.json() : {}, 'items', 'data', 'results', 'events');
    const enriched = contacts.map(c => {
      const ct = tok([c.name, c.role, c.organisation, c.org, c.email, c.notes, c.tags].join(' '));
      return { ...c, ...classify(ct, datasets, opsEvents) };
    });
    const fullyWired = enriched.filter(c => c.cov === COV.FULLY_WIRED).length;
    const dataOnly = enriched.filter(c => c.cov === COV.DATA_ONLY).length;
    const opsFlagged = enriched.filter(c => c.cov === COV.OPS_FLAGGED).length;
    const unseen = enriched.filter(c => c.cov === COV.UNSEEN).length;
    return `CONTACT × DATASET × OPS EVENT TRIPLE COVERAGE. ${contacts.length} contacts cross-referenced against ${datasets.length} datasets and ${opsEvents.length} ops events. FULLY WIRED: ${fullyWired} contacts with both dataset and ops coverage. DATA ONLY: ${dataOnly} contacts found in datasets but not flagged by ops events. OPS FLAGGED: ${opsFlagged} contacts with active ops event signal but no dataset backing. UNSEEN: ${unseen} contacts with neither dataset nor ops coverage. ${unseen > 0 ? `${unseen} contact${unseen > 1 ? 's are' : ' is'} completely off-grid — intelligence gap identified.` : 'All contacts have at least some coverage.'}`;
  } catch {
    return 'CDOE triple coverage check failed. Verify contact, dataset, and ops event endpoints.';
  }
}

export default function ContactDatasetOpsTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessText, setAssessText] = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [cRes, dsRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/Contact`, { headers: hdrs }),
        fetch(`${API}/v1/datasets`, { headers: hdrs }),
        fetch(`${API}/v1/ops/events`, { headers: hdrs }),
      ]);
      const c = normaliseArray(cRes.ok ? await cRes.json() : {}, 'items', 'data', 'results', 'contacts');
      const ds = normaliseArray(dsRes.ok ? await dsRes.json() : {}, 'items', 'data', 'results', 'datasets');
      const ops = normaliseArray(opsRes.ok ? await opsRes.json() : {}, 'items', 'data', 'results', 'events');
      setContacts(c);
      setDatasets(ds);
      setOpsEvents(ops);
      setEnriched(c.map(contact => {
        const ct = tok([contact.name, contact.role, contact.organisation, contact.org, contact.email, contact.notes, contact.tags].join(' '));
        return { ...contact, ...classify(ct, ds, ops) };
      }));
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener('jarvis:cdoe-toggle', handler);
    return () => window.removeEventListener('jarvis:cdoe-toggle', handler);
  }, []);

  const assess = async (contact) => {
    setAssessing(true);
    setAssessText('');
    const key = contact.id || contact.name;
    setExpanded(key);
    try {
      const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const prompt = `Assess contact: ${contact.name || contact.email || JSON.stringify(contact).slice(0, 200)}. Coverage: ${contact.cov}. Dataset match: ${(contact.dsScore * 100).toFixed(0)}%. Ops event match: ${(contact.opsScore * 100).toFixed(0)}%. Role: ${contact.role || 'unknown'}. Organisation: ${contact.organisation || contact.org || 'unknown'}. Be brief and tactical.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        setAssessText(d.response || d.answer || d.message || d.text || JSON.stringify(d).slice(0, 300));
      } else {
        setAssessText('Assessment unavailable.');
      }
    } catch {
      setAssessText('Assessment failed.');
    } finally {
      setAssessing(false);
    }
  };

  const speak = (text) => {
    const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
    fetch(`${API}/v1/voice/tts`, { method: 'POST', headers: hdrs, body: JSON.stringify({ text }) }).catch(() => {});
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  };

  const visible = enriched.filter(c => {
    if (filter !== 'ALL' && c.cov !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.name || c.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const unseen = enriched.filter(c => c.cov === COV.UNSEEN).length;
  const fullyWired = enriched.filter(c => c.cov === COV.FULLY_WIRED).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 879520, bottom: 8, zIndex: 579,
          background: 'rgba(0,20,30,0.85)', border: `1px solid ${unseen > 0 ? '#ff445544' : '#0ff3'}`,
          color: unseen > 0 ? '#ff4455' : fullyWired > 0 ? '#00ffcc' : '#888',
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
          fontFamily: 'monospace', letterSpacing: 1,
        }}
        title="Contact × Dataset × Ops Event Triple Coverage"
      >
        ◈ CDOE{unseen > 0 ? ` ·${unseen}` : fullyWired > 0 ? ` [${fullyWired}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 879520, bottom: 36, zIndex: 579,
      width: 360, maxHeight: 520,
      background: 'rgba(0,12,20,0.97)', border: '1px solid #0ff4',
      borderRadius: 6, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 11, color: '#cce',
      boxShadow: '0 0 18px #00ffcc22',
    }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#00ffcc', fontWeight: 700, letterSpacing: 1 }}>◈ CDOE TRIPLE</span>
        <span style={{ color: '#888', fontSize: 10 }}>
          {contacts.length}C · {datasets.length}DS · {opsEvents.length}OPS
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      <div style={{ padding: '4px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #0ff1' }}>
        {['ALL', ...Object.values(COV)].map(c => {
          const cnt = c === 'ALL' ? enriched.length : enriched.filter(r => r.cov === c).length;
          return (
            <button key={c} onClick={() => setFilter(c)}
              style={{
                padding: '2px 6px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                background: filter === c ? (c === 'ALL' ? '#0ff2' : COV_COLOUR[c] + '33') : 'transparent',
                border: `1px solid ${c === 'ALL' ? '#0ff5' : COV_COLOUR[c] + '66'}`,
                color: c === 'ALL' ? '#0ff' : COV_COLOUR[c],
              }}>
              {c === 'ALL' ? 'ALL' : c.replace(/_/g, ' ')} {cnt}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '4px 10px', borderBottom: '1px solid #0ff1' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter contacts…"
          style={{ width: '100%', background: '#001418', border: '1px solid #0ff3', color: '#cce', padding: '2px 6px', fontSize: 10, borderRadius: 3, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 10, color: '#888' }}>Loading…</div>}
        {!loading && visible.length === 0 && <div style={{ padding: 10, color: '#555' }}>No contacts.</div>}
        {visible.map((c, i) => {
          const key = c.id || c.name || i;
          const isExp = expanded === key;
          return (
            <div key={key} style={{ borderBottom: '1px solid #0ff1', padding: '5px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpanded(isExp ? null : key)}>
                <span style={{ color: COV_COLOUR[c.cov], fontWeight: 600, fontSize: 10 }}>
                  {c.name || c.email || `Contact #${i + 1}`}
                </span>
                <span style={{ color: COV_COLOUR[c.cov], fontSize: 9 }}>{c.cov.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ color: '#556', fontSize: 9, marginTop: 2 }}>
                DS: {(c.dsScore * 100).toFixed(0)}% · OPS: {(c.opsScore * 100).toFixed(0)}%
                {c.role && <span style={{ marginLeft: 6, color: '#888' }}>· {c.role}</span>}
              </div>
              {isExp && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid #0ff1' }}>
                  {(c.organisation || c.org) && (
                    <div style={{ color: '#99b', fontSize: 9, marginBottom: 4 }}>
                      Org: {c.organisation || c.org}
                    </div>
                  )}
                  {c.email && <div style={{ color: '#99b', fontSize: 9, marginBottom: 4 }}>{c.email}</div>}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => assess(c)}
                      style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                      ASSESS
                    </button>
                    <button onClick={() => speak(`Contact ${c.name || 'unknown'}: ${c.cov.replace(/_/g, ' ')}. Dataset match: ${(c.dsScore * 100).toFixed(0)}%. Ops event match: ${(c.opsScore * 100).toFixed(0)}%.`)}
                      style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                      SPEAK
                    </button>
                  </div>
                  {assessing && expanded === key && <div style={{ color: '#888', fontSize: 9, marginTop: 3 }}>Assessing…</div>}
                  {assessText && expanded === key && <div style={{ color: '#aee', fontSize: 9, marginTop: 3, maxHeight: 80, overflowY: 'auto' }}>{assessText}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '4px 10px', borderTop: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#556' }}>
        <span>UNSEEN: <span style={{ color: '#ff4455' }}>{unseen}</span> · WIRED: <span style={{ color: '#00ffcc' }}>{fullyWired}</span></span>
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#0ff7', cursor: 'pointer', fontSize: 9 }}>↻ REFRESH</button>
      </div>
    </div>
  );
}
