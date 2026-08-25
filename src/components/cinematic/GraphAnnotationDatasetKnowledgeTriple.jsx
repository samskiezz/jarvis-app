import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const GADKCO_RE = /\b(gadkco|annotation\s+dataset\s+knowledge|graph\s+annotation\s+dataset|annotation\s+data\s+kb|annotation\s+knowledge\s+dataset|dark\s+annotation\s+data|grounded\s+annotation|annotation\s+data\s+knowledge|annotation\s+kb\s+dataset|annotation\s+dataset\s+kb|knowledge\s+dataset\s+annotation)\b/i;

export function isGadkcoQuery(t) { return GADKCO_RE.test(t || ''); }

function kwAnn(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name, a?.title,
          a?.description, a?.category, a?.tags, a?.kind, a?.target_id]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwDs(d) {
  return [d?.name, d?.description, d?.kind, d?.tags, d?.category,
          d?.source, d?.title, d?.type]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwKb(k) {
  return [k?.title, k?.content, k?.category, k?.tags, k?.summary,
          k?.name, k?.description, k?.topic, k?.domain]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildGadkcoScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [annR, dsR, kbR] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);

  const annotations = (annR.status === 'fulfilled'
    ? (annR.value?.annotations ?? annR.value?.data ?? annR.value ?? []) : []).slice(0, 80);
  const datasets = (dsR.status === 'fulfilled'
    ? (dsR.value?.data ?? dsR.value?.datasets ?? dsR.value ?? []) : []).slice(0, 200);
  const kbArticles = (kbR.status === 'fulfilled'
    ? (kbR.value?.articles ?? kbR.value?.data ?? kbR.value?.items ?? kbR.value ?? []) : []).slice(0, 200);

  let grounded = 0, dataBacked = 0, kbBacked = 0, dark = 0;
  for (const ann of annotations) {
    const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
    const hasDs = datasets.some(d => relevance(words, kwDs(d)) > 0.12);
    const hasKb = kbArticles.some(k => relevance(words, kwKb(k)) > 0.12);
    if (hasDs && hasKb) grounded++;
    else if (hasDs) dataBacked++;
    else if (hasKb) kbBacked++;
    else dark++;
  }

  return `GADKCO: ${annotations.length} graph annotations × ${datasets.length} datasets × ${kbArticles.length} KB articles. ` +
    `${grounded} FULLY GROUNDED (dataset+KB), ${dataBacked} DATA-BACKED, ${kbBacked} KB-BACKED, ${dark} DARK. ` +
    (dark > 0
      ? `${dark} annotation nodes have no dataset or knowledge coverage — intelligence grounding gaps.`
      : 'All graph annotations have dataset or knowledge coverage.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const GR  = '#22C55E';
const EM  = '#10B981';
const IN  = '#6366F1';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY GROUNDED': GR, 'DATA-BACKED': EM, 'KB-BACKED': IN, DARK: GY };

export default function GraphAnnotationDatasetKnowledgeTriple() {
  const [open, setOpen]           = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:gadkco-toggle', h);
    return () => window.removeEventListener('jarvis:gadkco-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [aR, dR, kR] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/datasets`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const anns = (aR.status === 'fulfilled'
        ? (aR.value?.annotations ?? aR.value?.data ?? aR.value ?? []) : []).slice(0, 80);
      const dss  = (dR.status === 'fulfilled'
        ? (dR.value?.data ?? dR.value?.datasets ?? dR.value ?? []) : []).slice(0, 200);
      const kbs  = (kR.status === 'fulfilled'
        ? (kR.value?.articles ?? kR.value?.data ?? kR.value?.items ?? kR.value ?? []) : []).slice(0, 200);
      setAnnotations(anns);
      setDatasets(dss);
      setKbArticles(kbs);

      const built = anns.map(ann => {
        const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
        const matchedDs = dss
          .map(d => ({ ...d, _r: relevance(words, kwDs(d)) }))
          .filter(d => d._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedKb = kbs
          .map(k => ({ ...k, _r: relevance(words, kwKb(k)) }))
          .filter(k => k._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasDs = matchedDs.length > 0;
        const hasKb = matchedKb.length > 0;
        const state = hasDs && hasKb ? 'FULLY GROUNDED'
          : hasDs ? 'DATA-BACKED'
          : hasKb ? 'KB-BACKED'
          : 'DARK';
        return { ...ann, matchedDs, matchedKb, state };
      });
      setRows(built);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const grounded   = rows.filter(r => r.state === 'FULLY GROUNDED').length;
  const dataBacked = rows.filter(r => r.state === 'DATA-BACKED').length;
  const kbBacked   = rows.filter(r => r.state === 'KB-BACKED').length;
  const dark       = rows.filter(r => r.state === 'DARK').length;
  const total      = rows.length || 1;

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwAnn(r).includes(s); }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message:
          `Summarise graph annotation dataset and knowledge coverage in 2 sentences: ${grounded} FULLY GROUNDED (dataset+KB), ${dataBacked} DATA-BACKED, ${kbBacked} KB-BACKED, ${dark} DARK out of ${rows.length} graph annotations. Datasets: ${datasets.length}, KB articles: ${kbArticles.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 805600, bottom: 8, zIndex: 467, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ GADKCO</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>ANNOTATION × DATASET × KNOWLEDGE</span>
        {grounded > 0 && (
          <span style={{ marginLeft: 'auto', background: GR, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{grounded} GROUNDED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: grounded > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['ANNOTATIONS', annotations.length, CY],
          ['DATASETS',    datasets.length,    EM],
          ['KB ARTICLES', kbArticles.length,  IN],
          ['GROUNDED',    grounded,            GR],
          ['DATA-BACKED', dataBacked,          EM],
          ['KB-BACKED',   kbBacked,            IN],
          ['DARK',        dark,                GY],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: 'rgba(0,212,255,0.05)', borderRadius: 6,
            padding: '4px 2px', textAlign: 'center' }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 12 }}>{loading ? '…' : val}</div>
            <div style={{ color: '#4A6080', fontSize: 7, letterSpacing: 0.5 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ display: 'flex', height: 4, margin: '0 12px 8px', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${(grounded   / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(dataBacked / total) * 100}%`, background: EM }} />
        <div style={{ width: `${(kbBacked   / total) * 100}%`, background: IN }} />
        <div style={{ width: `${(dark       / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY GROUNDED', 'DATA-BACKED', 'KB-BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${CY2}`,
            background: 'transparent', color: CY2, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search annotations…"
          style={{ width: '100%', background: 'rgba(0,212,255,0.05)', border: `1px solid ${BD}`,
            borderRadius: 4, padding: '4px 8px', color: '#DCEBF5', fontSize: 10,
            outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#4A6080', padding: '12px 0', textAlign: 'center' }}>loading…</div>}
        {!loading && filtered.map((r, i) => {
          const id    = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          const label = r.text
            ? (r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text)
            : (r.target_id || r.actor || '—');
          const stateCol = STATE_COL[r.state] ?? GY;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateCol, fontSize: 8, minWidth: 110,
                  fontWeight: 700, letterSpacing: 0.5 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {r.target_type && (
                  <span style={{ color: '#4A6080', fontSize: 9 }}>{r.target_type}</span>
                )}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '4px 0 8px' }}>
                  {r.matchedDs.length === 0 && r.matchedKb.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no dataset or KB article matched this annotation
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'rgba(16,185,129,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: EM, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          DATASETS ({r.matchedDs.length})
                        </div>
                        {r.matchedDs.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedDs.map((d, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 140 }}>{d.name ?? d.title ?? `Dataset ${k + 1}`}</span>
                                {(d.kind ?? d.type) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>{d.kind ?? d.type}</span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(16,185,129,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(d._r * 100)}%`, background: EM }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1, background: 'rgba(99,102,241,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: IN, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          KB ARTICLES ({r.matchedKb.length})
                        </div>
                        {r.matchedKb.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedKb.map((kb, k) => (
                            <div key={k} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 140 }}>{kb.title ?? kb.name ?? `Article ${k + 1}`}</span>
                                {(kb.category ?? kb.topic) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>{kb.category ?? kb.topic}</span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(99,102,241,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(kb._r * 100)}%`, background: IN }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#4A6080', textAlign: 'center', padding: '12px 0' }}>no results</div>
        )}
      </div>
    </div>
  );
}
