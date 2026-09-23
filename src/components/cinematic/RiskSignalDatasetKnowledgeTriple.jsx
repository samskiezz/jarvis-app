import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSDKTRI_RE = /\b(rsdktri|risk\s+dataset\s+knowledge|risk\s+signal\s+data\s+kb|risk\s+data\s+coverage|risk\s+knowledge\s+gap|unsupported\s+risk\s+signal|risk\s+data\s+kb|risk\s+intelligence\s+backing|risk\s+kb\s+dataset|dataset\s+knowledge\s+risk)\b/i;

export function isRsdktriQuery(t) { return RSDKTRI_RE.test(t || ''); }

function normRisks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.signals ?? raw?.items ?? raw?.data ?? []);
  return arr.map(r => ({
    id: r.id ?? r._id ?? '',
    label: `${r.title ?? r.name ?? r.id ?? ''}`.trim(),
    severity: r.severity ?? r.level ?? '',
    category: r.category ?? r.type ?? '',
    description: r.description ?? r.detail ?? '',
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets ?? raw?.items ?? raw?.data ?? []);
  return arr.map(d => ({
    id: d.id ?? d._id ?? '',
    label: `${d.name ?? d.title ?? d.id ?? ''}`.trim(),
    kind: d.kind ?? d.type ?? d.category ?? '',
    rowCount: d.row_count ?? d.rows ?? null,
  }));
}

function normKb(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles ?? raw?.items ?? raw?.data ?? []);
  return arr.map(k => ({
    id: k.id ?? k._id ?? k.slug ?? '',
    label: `${k.title ?? k.name ?? k.id ?? ''}`.trim(),
    category: k.category ?? k.type ?? '',
    summary: k.summary ?? k.description ?? k.content ?? '',
  }));
}

function tokens(str) {
  return (str || '').toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function overlap(aToks, bText) {
  const bt = bText.toLowerCase();
  return aToks.reduce((s, t) => s + (bt.includes(t) ? 1 : 0), 0);
}

function correlateSignal(signal, datasets, kbArticles) {
  const toks = tokens(`${signal.label} ${signal.category} ${signal.description}`);
  if (toks.length === 0) return { state: 'UNSUPPORTED', dsMatch: null, kbMatch: null };

  const dsText = t => `${t.label} ${t.kind}`;
  const kbText = t => `${t.label} ${t.category} ${t.summary}`;

  let bestDs = null, bestDsScore = 0;
  for (const ds of datasets) {
    const sc = overlap(toks, dsText(ds)) / toks.length;
    if (sc > bestDsScore) { bestDsScore = sc; bestDs = ds; }
  }

  let bestKb = null, bestKbScore = 0;
  for (const kb of kbArticles) {
    const sc = overlap(toks, kbText(kb)) / toks.length;
    if (sc > bestKbScore) { bestKbScore = sc; bestKb = kb; }
  }

  const dsHit = bestDsScore > 0;
  const kbHit = bestKbScore > 0;
  let state;
  if (dsHit && kbHit) state = 'FULLY GROUNDED';
  else if (dsHit) state = 'DATA-BACKED';
  else if (kbHit) state = 'KB-DOCUMENTED';
  else state = 'UNSUPPORTED';

  return {
    state,
    dsMatch: dsHit ? { ...bestDs, score: bestDsScore } : null,
    kbMatch: kbHit ? { ...bestKb, score: bestKbScore } : null,
  };
}

export async function buildRsdktriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [rkR, dsR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
  ]);
  const risks = normRisks(rkR.status === 'fulfilled' ? rkR.value : []);
  const datasets = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const kb = normKb(kbR.status === 'fulfilled' && kbR.value ? kbR.value : []);

  let fg = 0, db = 0, kbDoc = 0, unsup = 0;
  for (const sig of risks) {
    const { state } = correlateSignal(sig, datasets, kb);
    if (state === 'FULLY GROUNDED') fg++;
    else if (state === 'DATA-BACKED') db++;
    else if (state === 'KB-DOCUMENTED') kbDoc++;
    else unsup++;
  }
  return `RSDKTRI RiskSignal × Dataset × Knowledge: ${risks.length} risk signals cross-referenced against ${datasets.length} datasets and ${kb.length} KB articles. ` +
    `FULLY GROUNDED: ${fg} (dataset backing + KB documented). ` +
    `DATA-BACKED: ${db} (dataset found, no KB article). ` +
    `KB-DOCUMENTED: ${kbDoc} (KB article found, no dataset). ` +
    `UNSUPPORTED: ${unsup} (no data or knowledge backing — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 88, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY GROUNDED': '#22d3ee',
  'DATA-BACKED': '#34d399',
  'KB-DOCUMENTED': '#a78bfa',
  'UNSUPPORTED': '#f59e0b',
};
const STATE_ORDER = ['FULLY GROUNDED', 'DATA-BACKED', 'KB-DOCUMENTED', 'UNSUPPORTED'];

const SEV_COLOR = { CRITICAL: '#f87171', HIGH: '#fb923c', MEDIUM: '#facc15', LOW: '#94a3b8' };

export default function RiskSignalDatasetKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [kb, setKb] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [rkR, dsR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      const risks = normRisks(rkR.status === 'fulfilled' ? rkR.value : []);
      const dss = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      const kbs = normKb(kbR.status === 'fulfilled' && kbR.value ? kbR.value : []);
      setDatasets(dss);
      setKb(kbs);
      setRows(risks.map(sig => ({ ...sig, ...correlateSignal(sig, dss, kbs) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:rsdktri-toggle', toggle);
    return () => window.removeEventListener('jarvis:rsdktri-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const unsup = rows.filter(r => r.state === 'UNSUPPORTED').length;
    const summary = `RSDKTRI: ${rows.length} risk signals. FULLY GROUNDED: ${rows.filter(r => r.state === 'FULLY GROUNDED').length}. DATA-BACKED: ${rows.filter(r => r.state === 'DATA-BACKED').length}. KB-DOCUMENTED: ${rows.filter(r => r.state === 'KB-DOCUMENTED').length}. UNSUPPORTED: ${unsup}. Datasets: ${datasets.length}. KB articles: ${kb.length}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this RSDKTRI risk signal data-knowledge coverage state. Identify the two highest-priority unsupported risk signals and recommend immediate remediation: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows, datasets, kb]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || r.label.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase()))
  );
  const unsupCount = stateCounts['UNSUPPORTED'] ?? 0;
  const total = rows.length;
  const fg = stateCounts['FULLY GROUNDED'] ?? 0;
  const pct = total > 0 ? Math.round((fg / total) * 100) : 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9984, width: 700, maxHeight: 640,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="RSDKTRI Risk Signal × Dataset × Knowledge Triple Coverage" style={{
        position: 'fixed', left: 761920, bottom: 8, zIndex: 389,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ RSDKTRI
        {unsupCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {unsupCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ RSDKTRI</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Risk Signal × Dataset × Knowledge Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}><div style={LABEL}>SIGNALS</div><div style={VAL}>{total}</div></div>
        <div style={TILE}><div style={LABEL}>DATASETS</div><div style={VAL}>{datasets.length}</div></div>
        <div style={TILE}><div style={LABEL}>KB ARTICLES</div><div style={VAL}>{kb.length}</div></div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY GROUNDED COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#22d3ee' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no risk signals match</div>
        ) : visible.map((sig, i) => (
          <div key={sig.id || i}>
            <div
              onClick={() => setExpanded(expanded === (sig.id || i) ? null : (sig.id || i))}
              style={{
                padding: '6px 8px', marginBottom: 2, borderRadius: 5,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[sig.state]}22`,
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              }}>
              <span style={{ fontSize: 8, color: STATE_COLOR[sig.state], minWidth: 120, letterSpacing: 0.5 }}>{sig.state}</span>
              <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sig.label || '—'}
              </span>
              {sig.severity && (
                <span style={{ fontSize: 8, background: (SEV_COLOR[sig.severity?.toUpperCase()] ?? '#64748b') + '33', color: SEV_COLOR[sig.severity?.toUpperCase()] ?? '#94a3b8', borderRadius: 3, padding: '1px 5px' }}>
                  {sig.severity}
                </span>
              )}
              {sig.category && <span style={{ fontSize: 8, color: '#64748b' }}>{sig.category}</span>}
              <span style={{ fontSize: 8, color: '#475569' }}>{expanded === (sig.id || i) ? '▲' : '▼'}</span>
            </div>
            {expanded === (sig.id || i) && (
              <div style={{ display: 'flex', gap: 8, margin: '0 8px 6px', padding: 8, background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: '#34d399', letterSpacing: 1, marginBottom: 4 }}>DATASET MATCH</div>
                  {sig.dsMatch ? (
                    <div>
                      <div style={{ fontSize: 9, color: '#cbd5e1', marginBottom: 2 }}>{sig.dsMatch.label}</div>
                      {sig.dsMatch.kind && <div style={{ fontSize: 8, color: '#64748b' }}>{sig.dsMatch.kind}</div>}
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 8, color: '#475569', marginBottom: 2 }}>relevance {Math.round(sig.dsMatch.score * 100)}%</div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, sig.dsMatch.score * 100)}%`, background: '#34d399', borderRadius: 2 }} />
                        </div>
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 8, color: '#475569' }}>no dataset match</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: '#a78bfa', letterSpacing: 1, marginBottom: 4 }}>KB ARTICLE</div>
                  {sig.kbMatch ? (
                    <div>
                      <div style={{ fontSize: 9, color: '#cbd5e1', marginBottom: 2 }}>{sig.kbMatch.label}</div>
                      {sig.kbMatch.category && <div style={{ fontSize: 8, color: '#64748b' }}>{sig.kbMatch.category}</div>}
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 8, color: '#475569', marginBottom: 2 }}>relevance {Math.round(sig.kbMatch.score * 100)}%</div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, sig.kbMatch.score * 100)}%`, background: '#a78bfa', borderRadius: 2 }} />
                        </div>
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 8, color: '#475569' }}>no KB article match</div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
          color: '#f59e0b', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
