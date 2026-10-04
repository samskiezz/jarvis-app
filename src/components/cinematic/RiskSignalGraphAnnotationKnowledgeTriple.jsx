import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const RSGAKCO_RE = /\b(rsgakco|risk\s+signal\s+graph\s+annotation\s+knowledge|risk\s+annotation\s+knowledge|risk\s+graph\s+knowledge|risk\s+signal\s+annotation\s+kb|risk\s+annotation\s+kb|dark\s+risk\s+signal|risk\s+knowledge\s+annotation|annotated\s+risk\s+signal|kb\s+backed\s+risk|risk\s+signal\s+documentation|risk\s+fully\s+documented|risk\s+knowledge\s+coverage|risk\s+signal\s+triple\s+knowledge|risk\s+annotation\s+triple)\b/i;

export function isRsgakcoQuery(t) { return RSGAKCO_RE.test(t || ''); }

function kwRisk(r) {
  return [r?.title, r?.name, r?.description, r?.category, r?.source,
          r?.tags, r?.severity, r?.type, r?.signal_type]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwAnn(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name, a?.title,
          a?.description, a?.category, a?.tags, a?.kind, a?.target_id]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwKB(k) {
  return [k?.title, k?.summary, k?.content, k?.category,
          k?.tags, k?.subject, k?.topic, k?.keywords]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildRsgakcoScript() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [rskR, annR, kbR] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`,  { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`,           { headers: hdr }).then(r => r.json()),
  ]);

  const risks       = (rskR.status === 'fulfilled' ? (rskR.value?.data ?? rskR.value ?? []) : []).slice(0, 100);
  const annotations = (annR.status === 'fulfilled' ? (annR.value?.data ?? annR.value ?? []) : []).slice(0, 100);
  const kb          = (kbR.status  === 'fulfilled' ? (kbR.value?.data  ?? kbR.value  ?? []) : []).slice(0, 100);

  let fullyDocumented = 0, annotatedOnly = 0, kbOnly = 0, dark = 0;
  for (const risk of risks) {
    const words = kwRisk(risk).split(/\s+/).filter(w => w.length > 3);
    const hasAnn = annotations.some(a => relevance(words, kwAnn(a)) > 0.12);
    const hasKB  = kb.some(k          => relevance(words, kwKB(k))  > 0.12);
    if (hasAnn && hasKB) fullyDocumented++;
    else if (hasAnn) annotatedOnly++;
    else if (hasKB)  kbOnly++;
    else dark++;
  }

  return `RSGAKCO: ${risks.length} risk signals × ${annotations.length} graph annotations × ${kb.length} KB articles. ` +
    `${fullyDocumented} FULLY DOCUMENTED (annotation + KB match), ${annotatedOnly} ANNOTATED-ONLY, ` +
    `${kbOnly} KB-BACKED, ${dark} DARK (no annotation or knowledge coverage). ` +
    (fullyDocumented > 0
      ? `${fullyDocumented} risk signal(s) are simultaneously covered by graph annotation context AND documented knowledge — highest intelligence fidelity.`
      : dark > 0
      ? `${dark} risk signal(s) have no graph annotation or knowledge backing — critical intelligence blind spots.`
      : 'All risk signals have at least one form of graph or knowledge coverage.');
}

const TL = '#14B8A6';
const GR = '#00FF88'; const CY2 = '#22D3EE'; const IN = '#818CF8'; const AM = '#F59E0B';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)';

const STATE_META = {
  'FULLY DOCUMENTED': { col: GR,        label: 'FULLY DOCUMENTED' },
  'ANNOTATED':        { col: CY2,       label: 'ANNOTATED'        },
  'KB-BACKED':        { col: IN,        label: 'KB-BACKED'        },
  'DARK':             { col: '#4E6A80', label: 'DARK'             },
};

function classify(risk, annotations, kb) {
  const words = kwRisk(risk).split(/\s+/).filter(w => w.length > 3);
  const matchedAnns = annotations
    .map(a => ({ a, sc: relevance(words, kwAnn(a)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const matchedKBs = kb
    .map(k => ({ k, sc: relevance(words, kwKB(k)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const hasAnn = matchedAnns.length > 0;
  const hasKB  = matchedKBs.length > 0;
  const state = (hasAnn && hasKB) ? 'FULLY DOCUMENTED'
              : hasAnn            ? 'ANNOTATED'
              : hasKB             ? 'KB-BACKED'
              :                    'DARK';
  return {
    ...risk,
    state,
    matchedAnns: matchedAnns.map(x => ({ ...x.a, _sc: x.sc })),
    matchedKBs:  matchedKBs.map(x => ({ ...x.k, _sc: x.sc })),
  };
}

export default function RiskSignalGraphAnnotationKnowledgeTriple() {
  const [open, setOpen]               = useState(false);
  const [risks, setRisks]             = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [kb, setKB]                   = useState([]);
  const [rows, setRows]               = useState([]);
  const [filter, setFilter]           = useState('ALL');
  const [search, setSearch]           = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [lastFetch, setLastFetch]     = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [rskR, annR, kbR] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/knowledge/`,           { headers: hdr }).then(r => r.json()),
      ]);
      const rsks = (rskR.status === 'fulfilled' ? (rskR.value?.data ?? rskR.value ?? []) : []).slice(0, 100);
      const anns = (annR.status === 'fulfilled' ? (annR.value?.data ?? annR.value ?? []) : []).slice(0, 100);
      const kbs  = (kbR.status  === 'fulfilled' ? (kbR.value?.data  ?? kbR.value  ?? []) : []).slice(0, 100);
      setRisks(rsks);
      setAnnotations(anns);
      setKB(kbs);
      setRows(rsks.map(r => classify(r, anns, kbs)));
      setLastFetch(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:rsgakco-toggle', onToggle);
    const onAsk = (e) => { if (isRsgakcoQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener('jarvis:ask', onAsk);
    return () => {
      window.removeEventListener('jarvis:rsgakco-toggle', onToggle);
      window.removeEventListener('jarvis:ask', onAsk);
    };
  }, []);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return kwRisk(r).includes(q) || r.state.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = { 'FULLY DOCUMENTED': 0, 'ANNOTATED': 0, 'KB-BACKED': 0, 'DARK': 0 };
  rows.forEach(r => counts[r.state]++);

  const darkBadge = counts['DARK'];

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildRsgakcoScript();
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: `RSGAKCO analysis: ${script}. Provide a 2-sentence risk signal knowledge coverage brief.` }),
      }).then(r => r.json());
      const txt = res?.response ?? res?.message ?? res?.text ?? JSON.stringify(res).slice(0, 200);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: 'RSGAKCO assessment unavailable.' } }));
    } finally {
      setAssessing(false);
    }
  };

  const FILTERS = ['ALL', 'FULLY DOCUMENTED', 'ANNOTATED', 'KB-BACKED', 'DARK'];
  const total = rows.length;
  const fd  = counts['FULLY DOCUMENTED'];
  const an  = counts['ANNOTATED'];
  const kb2 = counts['KB-BACKED'];
  const dk  = counts['DARK'];

  return (
    <>
      {/* ◈ RSGAKCO floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Risk Signal × Graph Annotation × Knowledge Triple Coverage"
        style={{
          position: 'fixed', bottom: 8, left: 808960, zIndex: 473,
          background: 'rgba(6,16,28,0.92)', border: `1px solid ${TL}55`,
          borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
          color: TL, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        }}
      >
        ◈ RSGAKCO
        {darkBadge > 0 && (
          <span style={{ background: AM, color: '#000', borderRadius: 4,
            padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {darkBadge}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 474,
          background: 'rgba(0,4,10,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(940px, 96vw)', maxHeight: '88vh',
            background: BG, border: `1px solid ${BD}`,
            borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BD}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ color: TL, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
                  ◈ RSGAKCO
                </span>
                <span style={{ color: '#4E6A80', fontSize: 10, marginLeft: 12, letterSpacing: 1 }}>
                  RISK SIGNAL × GRAPH ANNOTATION × KNOWLEDGE
                </span>
                {lastFetch && (
                  <span style={{ color: '#2E4050', fontSize: 9, marginLeft: 12 }}>
                    {lastFetch.toLocaleTimeString('en-GB')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={assess} disabled={assessing} style={{
                  background: assessing ? 'rgba(20,184,166,0.1)' : 'rgba(20,184,166,0.15)',
                  border: `1px solid ${TL}55`, borderRadius: 6, padding: '4px 12px',
                  color: TL, fontSize: 10, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
                }}>
                  {assessing ? 'ASSESSING…' : '▶ ASSESS'}
                </button>
                <button onClick={() => setOpen(false)} style={{
                  background: 'none', border: 'none', color: '#4E6A80',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1,
                }}>✕</button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BD}`,
              display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'RISK SIGNALS',     val: total,              col: TL        },
                { label: 'ANNOTATIONS',      val: annotations.length, col: CY2       },
                { label: 'KB ARTICLES',      val: kb.length,          col: IN        },
                { label: 'FULLY DOCUMENTED', val: fd,                 col: GR        },
                { label: 'ANNOTATED',        val: an,                 col: CY2       },
                { label: 'KB-BACKED',        val: kb2,                col: IN        },
                { label: 'DARK',             val: dk,                 col: '#4E6A80' },
              ].map(t => (
                <div key={t.label} style={{
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${t.col}22`,
                  borderRadius: 8, padding: '8px 14px', minWidth: 90, textAlign: 'center',
                }}>
                  <div style={{ color: t.col, fontSize: 16, fontWeight: 700 }}>{loading ? '…' : t.val}</div>
                  <div style={{ color: '#3A5264', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
                </div>
              ))}
            </div>

            {/* Coverage bar */}
            {total > 0 && (
              <div style={{ padding: '6px 20px', borderBottom: `1px solid ${BD}` }}>
                <div style={{ height: 6, borderRadius: 4, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.06)', display: 'flex' }}>
                  {[['FULLY DOCUMENTED', GR], ['ANNOTATED', CY2], ['KB-BACKED', IN], ['DARK', '#2E4050']]
                    .map(([k, c]) => (
                      <div key={k} style={{
                        width: `${(counts[k] / total) * 100}%`,
                        background: c, transition: 'width 0.3s',
                      }} />
                    ))}
                </div>
              </div>
            )}

            {/* Filter tabs + search */}
            <div style={{ padding: '10px 20px', borderBottom: `1px solid ${BD}`,
              display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  background: filter === f ? `${TL}22` : 'transparent',
                  border: `1px solid ${filter === f ? TL : '#1E3040'}`,
                  borderRadius: 5, padding: '3px 10px',
                  color: filter === f ? TL : '#4E6A80',
                  fontSize: 9, cursor: 'pointer', letterSpacing: 1,
                }}>
                  {f} {f !== 'ALL' ? `(${counts[f] ?? 0})` : `(${total})`}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search risk signals…"
                style={{
                  marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid #1E3040', borderRadius: 5,
                  padding: '3px 10px', color: '#8EB0C0', fontSize: 10,
                  outline: 'none', minWidth: 160,
                }}
              />
            </div>

            {/* Row list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading && rows.length === 0 && (
                <div style={{ padding: 24, color: '#2E4050', fontSize: 11, textAlign: 'center' }}>
                  Loading risk signal × annotation × knowledge data…
                </div>
              )}
              {!loading && visible.length === 0 && (
                <div style={{ padding: 24, color: '#2E4050', fontSize: 11, textAlign: 'center' }}>
                  No risk signals match filter.
                </div>
              )}
              {visible.map((risk, idx) => {
                const meta = STATE_META[risk.state];
                const isExp = expanded === idx;
                const label = risk.title ?? risk.name ?? `Risk Signal ${idx + 1}`;
                return (
                  <div key={idx} style={{
                    borderBottom: 'rgba(0,212,255,0.07) solid 1px',
                    background: isExp ? 'rgba(20,184,166,0.05)' : 'transparent',
                  }}>
                    <div
                      onClick={() => setExpanded(isExp ? null : idx)}
                      style={{
                        padding: '9px 20px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                    >
                      <span style={{ color: meta.col, fontSize: 9, letterSpacing: 1,
                        minWidth: 120, flexShrink: 0 }}>
                        {meta.label}
                      </span>
                      <span style={{ color: '#8EB0C0', fontSize: 11, flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      {risk.severity && (
                        <span style={{ color: '#2E4050', fontSize: 9, letterSpacing: 1,
                          flexShrink: 0, marginRight: 4 }}>
                          {String(risk.severity).toUpperCase()}
                        </span>
                      )}
                      <span style={{ color: '#2E4050', fontSize: 11, flexShrink: 0 }}>
                        {isExp ? '▲' : '▼'}
                      </span>
                    </div>

                    {isExp && (
                      <div style={{ padding: '0 20px 12px', display: 'grid',
                        gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Annotations pane */}
                        <div>
                          <div style={{ color: CY2, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            ANNOTATIONS ({risk.matchedAnns?.length ?? 0})
                          </div>
                          {(risk.matchedAnns ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No annotation match</div>
                          ) : risk.matchedAnns.map((a, ai) => (
                            <div key={ai} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(34,211,238,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#BCDCEC', fontSize: 10, marginBottom: 2 }}>
                                {a.text ?? a.title ?? a.name ?? `Annotation ${ai + 1}`}
                              </div>
                              {a.target_type && (
                                <div style={{ color: '#3A5264', fontSize: 8, letterSpacing: 1 }}>
                                  {String(a.target_type).toUpperCase()}
                                </div>
                              )}
                              <div style={{ height: 3, borderRadius: 2, overflow: 'hidden',
                                background: 'rgba(255,255,255,0.06)', marginTop: 3 }}>
                                <div style={{ width: `${Math.round(a._sc * 100)}%`,
                                  height: '100%', background: CY2, borderRadius: 2 }} />
                              </div>
                              <div style={{ color: '#3A5264', fontSize: 8, marginTop: 2 }}>
                                relevance {Math.round(a._sc * 100)}%
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* KB articles pane */}
                        <div>
                          <div style={{ color: IN, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            KB ARTICLES ({risk.matchedKBs?.length ?? 0})
                          </div>
                          {(risk.matchedKBs ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No KB article match</div>
                          ) : risk.matchedKBs.map((k, ki) => (
                            <div key={ki} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(129,140,248,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#A5B4FC', fontSize: 10, marginBottom: 2 }}>
                                {k.title ?? k.subject ?? `Article ${ki + 1}`}
                              </div>
                              {k.category && (
                                <div style={{ color: '#3A5264', fontSize: 8, letterSpacing: 1 }}>
                                  {String(k.category).toUpperCase()}
                                </div>
                              )}
                              <div style={{ height: 3, borderRadius: 2, overflow: 'hidden',
                                background: 'rgba(255,255,255,0.06)', marginTop: 3 }}>
                                <div style={{ width: `${Math.round(k._sc * 100)}%`,
                                  height: '100%', background: IN, borderRadius: 2 }} />
                              </div>
                              <div style={{ color: '#3A5264', fontSize: 8, marginTop: 2 }}>
                                relevance {Math.round(k._sc * 100)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '7px 20px', borderTop: `1px solid ${BD}`,
              display: 'flex', gap: 16, color: '#2E4050', fontSize: 9, letterSpacing: 1 }}>
              <span>/entities/RiskSignal</span>
              <span>/v1/graph/annotations</span>
              <span>/knowledge/</span>
              <span style={{ marginLeft: 'auto' }}>90s refresh · {visible.length} shown</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
