import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const IPGAREP_RE = /\b(ipgarep|intel\s+profile\s+annotation|intel\s+annotation\s+report|profile\s+annotation\s+report|intel\s+profile\s+report\s+annotation|unmapped\s+intel\s+profile|intel\s+profile\s+graph\s+report|profile\s+fully\s+mapped|intel\s+annotation\s+graph|intel\s+profile\s+annotation\s+report\s+triple)\b/i;

export function isIpgarepQuery(t) { return IPGAREP_RE.test(t || ''); }

function kwProfile(p) {
  return [p?.name, p?.company, p?.role, p?.sector, p?.nationality, p?.aliases,
          p?.description, p?.tags, p?.title, p?.affiliation]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwAnn(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name, a?.title,
          a?.description, a?.category, a?.tags, a?.kind, a?.target_id]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwRep(r) {
  return [r?.title, r?.name, r?.description, r?.summary, r?.type, r?.category, r?.tags,
          r?.author, r?.subject]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildIpgarepScript() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [profR, annR, repR] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/annotations`,  { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/reports`,            { headers: hdr }).then(r => r.json()),
  ]);

  const profiles     = (profR.status === 'fulfilled' ? (profR.value?.data ?? profR.value ?? []) : []).slice(0, 80);
  const annotations  = (annR.status  === 'fulfilled' ? (annR.value?.data  ?? annR.value  ?? []) : []).slice(0, 100);
  const reports      = (repR.status  === 'fulfilled' ? (repR.value?.data  ?? repR.value  ?? []) : []).slice(0, 100);

  let fullyMapped = 0, annotated = 0, reported = 0, unmapped = 0;
  for (const p of profiles) {
    const words = kwProfile(p).split(/\s+/).filter(w => w.length > 3);
    const hasAnn = annotations.some(a => relevance(words, kwAnn(a)) > 0.12);
    const hasRep = reports.some(r     => relevance(words, kwRep(r)) > 0.12);
    if (hasAnn && hasRep) fullyMapped++;
    else if (hasAnn)      annotated++;
    else if (hasRep)      reported++;
    else                  unmapped++;
  }

  return `IPGAREP: ${profiles.length} intel profiles × ${annotations.length} graph annotations × ${reports.length} reports. ` +
    `${fullyMapped} FULLY MAPPED (annotation + report), ${annotated} ANNOTATED (graph context, no report), ` +
    `${reported} REPORTED (documentation, no graph annotation), ${unmapped} UNMAPPED (no annotation or report coverage). ` +
    (unmapped > 0
      ? `${unmapped} intel profiles have no graph annotation or intelligence report coverage — intelligence gap.`
      : 'All intel profiles have annotation or report coverage.');
}

const GR = '#00FF88'; const RD = '#EF4444'; const CY2 = '#22D3EE'; const AM = '#F59E0B';
const VI = '#A855F7'; const EM = '#10B981';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)'; const CY = '#00D4FF';

const STATE_META = {
  'FULLY MAPPED': { col: GR,  label: 'FULLY MAPPED' },
  'ANNOTATED':    { col: CY2, label: 'ANNOTATED'    },
  'REPORTED':     { col: AM,  label: 'REPORTED'     },
  'UNMAPPED':     { col: RD,  label: 'UNMAPPED'     },
};

function classify(profile, annotations, reports) {
  const words = kwProfile(profile).split(/\s+/).filter(w => w.length > 3);
  const matchedAnns = annotations
    .map(a => ({ a, sc: relevance(words, kwAnn(a)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const matchedReps = reports
    .map(r => ({ r, sc: relevance(words, kwRep(r)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const hasAnn = matchedAnns.length > 0;
  const hasRep = matchedReps.length > 0;
  const state = (hasAnn && hasRep) ? 'FULLY MAPPED'
              : hasAnn             ? 'ANNOTATED'
              : hasRep             ? 'REPORTED'
              :                     'UNMAPPED';
  return {
    ...profile,
    state,
    matchedAnns: matchedAnns.map(x => ({ ...x.a, _sc: x.sc })),
    matchedReps: matchedReps.map(x => ({ ...x.r, _sc: x.sc })),
  };
}

export default function IntelProfileAnnotationReportTriple() {
  const [open, setOpen]           = useState(false);
  const [profiles, setProfiles]   = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [reports, setReports]     = useState([]);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [profR, annR, repR] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/graph/annotations`,  { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/reports`,            { headers: hdr }).then(r => r.json()),
      ]);
      const profs = (profR.status === 'fulfilled' ? (profR.value?.data ?? profR.value ?? []) : []).slice(0, 80);
      const anns  = (annR.status  === 'fulfilled' ? (annR.value?.data  ?? annR.value  ?? []) : []).slice(0, 100);
      const reps  = (repR.status  === 'fulfilled' ? (repR.value?.data  ?? repR.value  ?? []) : []).slice(0, 100);
      setProfiles(profs);
      setAnnotations(anns);
      setReports(reps);
      setRows(profs.map(p => classify(p, anns, reps)));
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
    window.addEventListener('jarvis:ipgarep-toggle', onToggle);
    const onAsk = (e) => { if (isIpgarepQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener('jarvis:ask', onAsk);
    return () => {
      window.removeEventListener('jarvis:ipgarep-toggle', onToggle);
      window.removeEventListener('jarvis:ask', onAsk);
    };
  }, []);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return kwProfile(r).includes(q) || r.state.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = { 'FULLY MAPPED': 0, 'ANNOTATED': 0, 'REPORTED': 0, 'UNMAPPED': 0 };
  rows.forEach(r => counts[r.state]++);

  const unmappedBadge = counts['UNMAPPED'];

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildIpgarepScript();
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: `IPGAREP analysis: ${script}. Provide a 2-sentence intel profile annotation and report coverage brief.` }),
      }).then(r => r.json());
      const txt = res?.response ?? res?.message ?? res?.text ?? JSON.stringify(res).slice(0, 200);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: 'IPGAREP assessment unavailable.' } }));
    } finally {
      setAssessing(false);
    }
  };

  const FILTERS = ['ALL', 'FULLY MAPPED', 'ANNOTATED', 'REPORTED', 'UNMAPPED'];
  const total = rows.length;
  const fm = counts['FULLY MAPPED'];
  const an = counts['ANNOTATED'];
  const rp = counts['REPORTED'];
  const um = counts['UNMAPPED'];

  return (
    <>
      {/* ◈ IPGAREP floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="IntelProfile × Graph Annotation × Report Triple Coverage"
        style={{
          position: 'fixed', bottom: 8, left: 803360, zIndex: 463,
          background: 'rgba(6,16,28,0.92)', border: `1px solid ${EM}55`,
          borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
          color: EM, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        }}
      >
        ◈ IPGAREP
        {unmappedBadge > 0 && (
          <span style={{ background: RD, color: '#fff', borderRadius: 4,
            padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {unmappedBadge}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 464,
          background: 'rgba(0,4,10,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(920px, 96vw)', maxHeight: '88vh',
            background: BG, border: `1px solid ${BD}`,
            borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BD}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ color: EM, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
                  ◈ IPGAREP
                </span>
                <span style={{ color: '#4E6A80', fontSize: 10, marginLeft: 12, letterSpacing: 1 }}>
                  INTEL PROFILE × GRAPH ANNOTATION × REPORT
                </span>
                {lastFetch && (
                  <span style={{ color: '#2E4050', fontSize: 9, marginLeft: 12 }}>
                    {lastFetch.toLocaleTimeString('en-GB')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={assess} disabled={assessing} style={{
                  background: assessing ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)',
                  border: `1px solid ${EM}55`, borderRadius: 6, padding: '4px 12px',
                  color: EM, fontSize: 10, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
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
                { label: 'PROFILES',     val: total,             col: EM  },
                { label: 'ANNOTATIONS',  val: annotations.length, col: CY2 },
                { label: 'REPORTS',      val: reports.length,     col: AM  },
                { label: 'FULLY MAPPED', val: fm,                col: GR  },
                { label: 'ANNOTATED',    val: an,                col: CY2 },
                { label: 'REPORTED',     val: rp,                col: AM  },
                { label: 'UNMAPPED',     val: um,                col: RD  },
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
                  {[['FULLY MAPPED', GR], ['ANNOTATED', CY2], ['REPORTED', AM], ['UNMAPPED', RD]]
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
                  background: filter === f ? `${EM}22` : 'transparent',
                  border: `1px solid ${filter === f ? EM : '#1E3040'}`,
                  borderRadius: 5, padding: '3px 10px',
                  color: filter === f ? EM : '#4E6A80',
                  fontSize: 9, cursor: 'pointer', letterSpacing: 1,
                }}>
                  {f} {f !== 'ALL' ? `(${counts[f] ?? 0})` : `(${total})`}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search intel profiles…"
                style={{
                  marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
                  border: `1px solid #1E3040`, borderRadius: 5,
                  padding: '3px 10px', color: '#8EB0C0', fontSize: 10,
                  outline: 'none', minWidth: 160,
                }}
              />
            </div>

            {/* Row list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading && rows.length === 0 && (
                <div style={{ padding: 24, color: '#2E4050', fontSize: 11, textAlign: 'center' }}>
                  Loading intel profile × annotation × report data…
                </div>
              )}
              {!loading && visible.length === 0 && (
                <div style={{ padding: 24, color: '#2E4050', fontSize: 11, textAlign: 'center' }}>
                  No profiles match filter.
                </div>
              )}
              {visible.map((p, idx) => {
                const meta = STATE_META[p.state];
                const isExp = expanded === idx;
                const label = p.name ?? p.company ?? `Profile ${idx + 1}`;
                return (
                  <div key={idx} style={{
                    borderBottom: `1px solid rgba(0,212,255,0.07)`,
                    background: isExp ? 'rgba(16,185,129,0.06)' : 'transparent',
                  }}>
                    <div
                      onClick={() => setExpanded(isExp ? null : idx)}
                      style={{
                        padding: '9px 20px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                    >
                      <span style={{ color: meta.col, fontSize: 9, letterSpacing: 1,
                        minWidth: 110, flexShrink: 0 }}>
                        {meta.label}
                      </span>
                      <span style={{ color: '#8EB0C0', fontSize: 11, flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      {p.role && (
                        <span style={{ color: '#2E4050', fontSize: 9, letterSpacing: 1,
                          flexShrink: 0, marginRight: 4 }}>
                          {String(p.role).toUpperCase().slice(0, 20)}
                        </span>
                      )}
                      <span style={{ color: '#2E4050', fontSize: 11, flexShrink: 0 }}>
                        {isExp ? '▲' : '▼'}
                      </span>
                    </div>

                    {isExp && (
                      <div style={{ padding: '0 20px 12px', display: 'grid',
                        gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Graph Annotations pane */}
                        <div>
                          <div style={{ color: CY2, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            GRAPH ANNOTATIONS ({p.matchedAnns?.length ?? 0})
                          </div>
                          {(p.matchedAnns ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No annotation coverage</div>
                          ) : p.matchedAnns.map((a, ai) => (
                            <div key={ai} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(34,211,238,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#BCDCEC', fontSize: 10, marginBottom: 2 }}>
                                {a.text ?? a.title ?? a.name ?? `Annotation ${ai + 1}`}
                              </div>
                              {a.target_type && (
                                <div style={{ color: '#3A5264', fontSize: 8, letterSpacing: 1 }}>
                                  TYPE: {String(a.target_type).toUpperCase()}
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

                        {/* Reports pane */}
                        <div>
                          <div style={{ color: AM, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            INTELLIGENCE REPORTS ({p.matchedReps?.length ?? 0})
                          </div>
                          {(p.matchedReps ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No report coverage</div>
                          ) : p.matchedReps.map((r, ri) => (
                            <div key={ri} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(245,158,11,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#D4A84B', fontSize: 10, marginBottom: 2 }}>
                                {r.title ?? r.name ?? `Report ${ri + 1}`}
                              </div>
                              {r.type && (
                                <div style={{ color: '#3A5264', fontSize: 8, letterSpacing: 1 }}>
                                  TYPE: {String(r.type).toUpperCase()}
                                </div>
                              )}
                              <div style={{ height: 3, borderRadius: 2, overflow: 'hidden',
                                background: 'rgba(255,255,255,0.06)', marginTop: 3 }}>
                                <div style={{ width: `${Math.round(r._sc * 100)}%`,
                                  height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <div style={{ color: '#3A5264', fontSize: 8, marginTop: 2 }}>
                                relevance {Math.round(r._sc * 100)}%
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
              <span>/entities/IntelProfile</span>
              <span>/v1/graph/annotations</span>
              <span>/v1/reports</span>
              <span style={{ marginLeft: 'auto' }}>90s refresh · {visible.length} shown</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
