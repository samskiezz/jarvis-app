import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const DGCCON_RE = /\b(dgccon|dataset[\s_-]*graph[\s_-]*contact|dataset[\s_-]*centrality[\s_-]*contact|dataset[\s_-]*node[\s_-]*contact|dataset[\s_-]*contact[\s_-]*centrality|dataset[\s_-]*contact[\s_-]*graph)\b/i;
const THRESHOLD = 0.07;

export function isDgcconQuery(t) { return DGCCON_RE.test(t || ''); }

export async function buildDgcconScript() {
  try {
    const [dsRes, centralityRes, contactRes] = await Promise.all([
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
    ]);
    const datasets = normaliseDatasets(dsRes);
    const nodes = normaliseNodes(centralityRes);
    const contacts = normaliseContacts(contactRes);
    const classified = datasets.map(ds => classifyDataset(ds, nodes, contacts));
    const fullyMapped = classified.filter(c => c.state === 'FULLY_MAPPED').length;
    const nodeLinked = classified.filter(c => c.state === 'NODE_LINKED').length;
    const contactBacked = classified.filter(c => c.state === 'CONTACT_BACKED').length;
    const dark = classified.filter(c => c.state === 'DARK').length;
    const total = classified.length;
    return `DGCCON Coverage: ${total} datasets analysed. ` +
      `Fully mapped (node+contact): ${fullyMapped}. ` +
      `Node-linked only: ${nodeLinked}. ` +
      `Contact-backed only: ${contactBacked}. ` +
      `Dark (unlinked): ${dark}. ` +
      `Coverage ratio: ${total ? Math.round((fullyMapped / total) * 100) : 0}%.`;
  } catch {
    return 'DGCCON: unable to build coverage script — check endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  let hits = 0;
  for (const t of toks) { if (ft.some(f => f.includes(t) || t.includes(f))) hits++; }
  return hits / toks.length;
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets || raw?.data || raw?.items || []);
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    name: d.name || d.title || d.label || `Dataset ${i + 1}`,
    tags: Array.isArray(d.tags) ? d.tags : [],
    description: d.description || d.summary || '',
    domain: d.domain || d.category || '',
  }));
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.nodes || raw?.centrality || raw?.data || raw?.items || []);
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.entity || `Node ${i + 1}`,
    score: typeof n.score === 'number' ? n.score : (typeof n.centrality === 'number' ? n.centrality : 0),
  }));
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.contacts || raw?.data || raw?.items || []);
  return arr.map((c, i) => ({
    id: c.id || c._id || `contact-${i}`,
    name: c.name || c.fullName || c.displayName || `Contact ${i + 1}`,
    tags: Array.isArray(c.tags) ? c.tags : [],
    domain: c.domain || c.organization || '',
  }));
}

function classifyDataset(ds, nodes, contacts) {
  const dsToks = tok(`${ds.name} ${ds.description} ${ds.domain} ${ds.tags.join(' ')}`);
  const nodeLinked = nodes.some(n => matchScore(dsToks, `${n.label}`) >= THRESHOLD ||
    matchScore(tok(n.label), `${ds.name} ${ds.description}`) >= THRESHOLD);
  const contactBacked = contacts.some(c => matchScore(dsToks, `${c.name} ${c.domain} ${c.tags.join(' ')}`) >= THRESHOLD ||
    matchScore(tok(`${c.name} ${c.domain}`), `${ds.name} ${ds.description}`) >= THRESHOLD);
  let state;
  if (nodeLinked && contactBacked) state = 'FULLY_MAPPED';
  else if (nodeLinked) state = 'NODE_LINKED';
  else if (contactBacked) state = 'CONTACT_BACKED';
  else state = 'DARK';
  return { ...ds, state, nodeLinked, contactBacked };
}

const STATE_COLORS = {
  FULLY_MAPPED: '#22d3ee',
  NODE_LINKED: '#34d399',
  CONTACT_BACKED: '#a78bfa',
  DARK: '#6b7280',
};

const STATE_LABELS = {
  FULLY_MAPPED: 'Fully Mapped',
  NODE_LINKED: 'Node-Linked',
  CONTACT_BACKED: 'Contact-Backed',
  DARK: 'Dark',
};

export default function DatasetGraphCentralityContactTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('FULLY_MAPPED');
  const [expanded, setExpanded] = useState(null);
  const [ttsText, setTtsText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dsRes, centralityRes, contactRes] = await Promise.all([
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      ]);
      const datasets = normaliseDatasets(dsRes);
      const nodes = normaliseNodes(centralityRes);
      const contacts = normaliseContacts(contactRes);
      const classified = datasets.map(ds => classifyDataset(ds, nodes, contacts));
      setRows(classified);
      setLastUpdated(new Date().toISOString());
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:dgccon-toggle', handler);
    return () => window.removeEventListener('jarvis:dgccon-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const counts = {
    FULLY_MAPPED: rows.filter(r => r.state === 'FULLY_MAPPED').length,
    NODE_LINKED: rows.filter(r => r.state === 'NODE_LINKED').length,
    CONTACT_BACKED: rows.filter(r => r.state === 'CONTACT_BACKED').length,
    DARK: rows.filter(r => r.state === 'DARK').length,
  };
  const total = rows.length;
  const coveragePct = total ? Math.round((counts.FULLY_MAPPED / total) * 100) : 0;
  const tabRows = rows.filter(r => r.state === activeTab);

  const speak = useCallback(() => {
    const summary = `DGCCON: ${total} datasets. Fully mapped: ${counts.FULLY_MAPPED}. Node-linked: ${counts.NODE_LINKED}. Contact-backed: ${counts.CONTACT_BACKED}. Dark: ${counts.DARK}. Coverage ${coveragePct} percent.`;
    setTtsText(summary);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: summary } }));
  }, [total, counts, coveragePct]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: 'fixed', bottom: 8, left: 854880, zIndex: 555,
          background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.35)',
          borderRadius: 6, color: '#22d3ee', fontSize: 10, fontFamily: 'monospace',
          padding: '2px 7px', cursor: 'pointer', whiteSpace: 'nowrap',
          backdropFilter: 'blur(4px)',
        }}
        title="Dataset × Graph Centrality × Contact Coverage"
      >
        ◈ DGCCON
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 555,
      background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 780, maxHeight: '88vh', overflowY: 'auto',
        background: 'rgba(10,20,30,0.97)', border: '1px solid rgba(34,211,238,0.3)',
        borderRadius: 12, padding: 24, fontFamily: 'monospace', color: '#e2e8f0',
        backdropFilter: 'blur(12px)', boxShadow: '0 0 40px rgba(34,211,238,0.15)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#22d3ee', letterSpacing: 1 }}>
              ◈ DGCCON — Dataset × Graph Centrality × Contact
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
              {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Loading…'} · Auto-refresh 90s
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={speak} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>▶ TTS</button>
            <button onClick={load} disabled={loading} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>⟳</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#f87171', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {Object.entries(counts).map(([state, cnt]) => (
            <div key={state} onClick={() => setActiveTab(state)}
              style={{
                background: activeTab === state ? `rgba(${state === 'FULLY_MAPPED' ? '34,211,238' : state === 'NODE_LINKED' ? '52,211,153' : state === 'CONTACT_BACKED' ? '167,139,250' : '107,114,128'},0.15)` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${activeTab === state ? STATE_COLORS[state] : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 8, padding: '10px 8px', cursor: 'pointer', textAlign: 'center',
              }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: STATE_COLORS[state] }}>{cnt}</div>
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{STATE_LABELS[state]}</div>
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
            <span>Full coverage</span><span style={{ color: '#22d3ee' }}>{coveragePct}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${coveragePct}%`, background: 'linear-gradient(90deg,#22d3ee,#34d399)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {['FULLY_MAPPED','NODE_LINKED','CONTACT_BACKED','DARK'].map(s => (
              <div key={s} style={{ height: 3, flex: counts[s] || 0, background: STATE_COLORS[s], borderRadius: 2, minWidth: counts[s] ? 2 : 0 }} />
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {Object.keys(STATE_LABELS).map(s => (
            <button key={s} onClick={() => setActiveTab(s)}
              style={{
                background: activeTab === s ? STATE_COLORS[s] + '22' : 'none',
                border: `1px solid ${activeTab === s ? STATE_COLORS[s] : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 4, color: activeTab === s ? STATE_COLORS[s] : '#64748b',
                fontSize: 10, padding: '3px 10px', cursor: 'pointer',
              }}>
              {STATE_LABELS[s]} ({counts[s]})
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 11, padding: '20px 0' }}>Loading datasets…</div>
        )}

        {/* Row list */}
        {!loading && tabRows.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 11, padding: '20px 0' }}>No datasets in this state.</div>
        )}

        {!loading && tabRows.map((row, i) => (
          <div key={row.id} style={{
            borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '8px 4px',
            cursor: 'pointer',
          }} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLORS[row.state], display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#e2e8f0' }}>{row.name}</span>
                {row.domain && <span style={{ fontSize: 9, color: '#475569', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 5px' }}>{row.domain}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {row.nodeLinked && <span style={{ fontSize: 9, color: '#34d399', background: 'rgba(52,211,153,0.1)', borderRadius: 3, padding: '1px 5px' }}>NODE</span>}
                {row.contactBacked && <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 5px' }}>CONTACT</span>}
                <span style={{ fontSize: 9, color: '#64748b' }}>{expanded === row.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === row.id && (
              <div style={{ marginTop: 8, paddingLeft: 16, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                {row.description && <div><strong>Description:</strong> {row.description}</div>}
                {row.tags?.length > 0 && <div><strong>Tags:</strong> {row.tags.join(', ')}</div>}
                <div><strong>State:</strong> <span style={{ color: STATE_COLORS[row.state] }}>{STATE_LABELS[row.state]}</span></div>
                <div><strong>Graph Node:</strong> {row.nodeLinked ? '✓ linked' : '✗ unlinked'}</div>
                <div><strong>Contact:</strong> {row.contactBacked ? '✓ backed' : '✗ none'}</div>
              </div>
            )}
          </div>
        ))}

        {/* Footer */}
        <div style={{ marginTop: 12, fontSize: 9, color: '#334155', textAlign: 'right' }}>
          DGCCON · /v1/datasets · /v1/graph/centrality · /entities/Contact
        </div>
      </div>
    </div>
  );
}
