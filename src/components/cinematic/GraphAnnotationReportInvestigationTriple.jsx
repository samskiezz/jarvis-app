import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const GARIC_RE = /\b(garic|annotation\s+report\s+invest|graph\s+annotation\s+report|annotation\s+investigation|graph\s+note\s+report|annotation\s+case|graph\s+annotation\s+case|note\s+report\s+case|annotation\s+intelligence\s+report|graph\s+annotation\s+invest|undocumented\s+annotation|annotation\s+gap|annotation\s+coverage)\b/i;

export function isGaricQuery(t) { return GARIC_RE.test(t || ''); }

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

function kwInv(i) {
  return [i?.title, i?.name, i?.description, i?.case_type, i?.category, i?.tags,
          i?.subject, i?.summary, i?.status]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildGaricScript() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [annR, repR, invR] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/reports`,           { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/investigations`,    { headers: hdr }).then(r => r.json()),
  ]);

  const annotations   = (annR.status === 'fulfilled' ? (annR.value?.data ?? annR.value ?? []) : []).slice(0, 100);
  const reports       = (repR.status === 'fulfilled' ? (repR.value?.data ?? repR.value ?? []) : []).slice(0, 100);
  const investigations = (invR.status === 'fulfilled' ? (invR.value?.data ?? invR.value ?? []) : []).slice(0, 80);

  let fullyDocumented = 0, reportBacked = 0, caseLinked = 0, undocumented = 0;
  for (const ann of annotations) {
    const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
    const hasRep = reports.some(r      => relevance(words, kwRep(r)) > 0.12);
    const hasInv = investigations.some(i => relevance(words, kwInv(i)) > 0.12);
    if (hasRep && hasInv) fullyDocumented++;
    else if (hasRep) reportBacked++;
    else if (hasInv) caseLinked++;
    else undocumented++;
  }

  return `GARIC: ${annotations.length} graph annotations × ${reports.length} intelligence reports × ${investigations.length} investigations. ` +
    `${fullyDocumented} FULLY DOCUMENTED (report + investigation), ${reportBacked} REPORT-BACKED (no investigation), ` +
    `${caseLinked} CASE-LINKED (investigation found, no report), ${undocumented} UNDOCUMENTED (no report or investigation coverage). ` +
    (undocumented > 0
      ? `${undocumented} annotations have no intelligence report or open investigation — knowledge gap.`
      : 'All annotations have report or investigation coverage.');
}

const GR = '#00FF88'; const RD = '#EF4444'; const CY2 = '#22D3EE'; const AM = '#F59E0B';
const VI = '#A855F7';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)'; const CY = '#00D4FF';

const STATE_META = {
  'FULLY DOCUMENTED': { col: GR,  label: 'FULLY DOCUMENTED' },
  'REPORT-BACKED':    { col: CY2, label: 'REPORT-BACKED'    },
  'CASE-LINKED':      { col: AM,  label: 'CASE-LINKED'      },
  'UNDOCUMENTED':     { col: RD,  label: 'UNDOCUMENTED'     },
};

function classify(ann, reports, investigations) {
  const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
  const matchedReps = reports
    .map(r => ({ r, sc: relevance(words, kwRep(r)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const matchedInvs = investigations
    .map(i => ({ i, sc: relevance(words, kwInv(i)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const hasRep = matchedReps.length > 0;
  const hasInv = matchedInvs.length > 0;
  const state = (hasRep && hasInv) ? 'FULLY DOCUMENTED'
              : hasRep             ? 'REPORT-BACKED'
              : hasInv             ? 'CASE-LINKED'
              :                     'UNDOCUMENTED';
  return { ...ann, state, matchedReps: matchedReps.map(x => ({ ...x.r, _sc: x.sc })),
           matchedInvs: matchedInvs.map(x => ({ ...x.i, _sc: x.sc })) };
}

export default function GraphAnnotationReportInvestigationTriple() {
  const [open, setOpen]           = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [reports, setReports]     = useState([]);
  const [investigations, setInvestigations] = useState([]);
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
      const [annR, repR, invR] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/reports`,           { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/investigations`,    { headers: hdr }).then(r => r.json()),
      ]);
      const anns  = (annR.status === 'fulfilled' ? (annR.value?.data ?? annR.value ?? []) : []).slice(0, 100);
      const reps  = (repR.status === 'fulfilled' ? (repR.value?.data ?? repR.value ?? []) : []).slice(0, 100);
      const invs  = (invR.status === 'fulfilled' ? (invR.value?.data ?? invR.value ?? []) : []).slice(0, 80);
      setAnnotations(anns);
      setReports(reps);
      setInvestigations(invs);
      setRows(anns.map(a => classify(a, reps, invs)));
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
    window.addEventListener('jarvis:garic-toggle', onToggle);
    const onAsk = (e) => { if (isGaricQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener('jarvis:ask', onAsk);
    return () => {
      window.removeEventListener('jarvis:garic-toggle', onToggle);
      window.removeEventListener('jarvis:ask', onAsk);
    };
  }, []);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return kwAnn(r).includes(q) || r.state.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = { 'FULLY DOCUMENTED': 0, 'REPORT-BACKED': 0, 'CASE-LINKED': 0, 'UNDOCUMENTED': 0 };
  rows.forEach(r => counts[r.state]++);

  const undocBadge = counts['UNDOCUMENTED'];

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildGaricScript();
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: `GARIC analysis: ${script}. Provide a 2-sentence intelligence annotation coverage brief.` }),
      }).then(r => r.json());
      const txt = res?.response ?? res?.message ?? res?.text ?? JSON.stringify(res).slice(0, 200);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: 'GARIC assessment unavailable.' } }));
    } finally {
      setAssessing(false);
    }
  };

  const FILTERS = ['ALL', 'FULLY DOCUMENTED', 'REPORT-BACKED', 'CASE-LINKED', 'UNDOCUMENTED'];
  const total = rows.length;
  const fd = counts['FULLY DOCUMENTED'];
  const rb = counts['REPORT-BACKED'];
  const cl = counts['CASE-LINKED'];
  const ud = counts['UNDOCUMENTED'];

  return (
    <>
      {/* ◈ GARIC floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Annotation × Report × Investigation Triple Coverage"
        style={{
          position: 'fixed', bottom: 8, left: 802800, zIndex: 462,
          background: 'rgba(6,16,28,0.92)', border: `1px solid ${VI}55`,
          borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
          color: VI, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        }}
      >
        ◈ GARIC
        {undocBadge > 0 && (
          <span style={{ background: RD, color: '#fff', borderRadius: 4,
            padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {undocBadge}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 463,
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
                <span style={{ color: VI, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
                  ◈ GARIC
                </span>
                <span style={{ color: '#4E6A80', fontSize: 10, marginLeft: 12, letterSpacing: 1 }}>
                  GRAPH ANNOTATION × REPORT × INVESTIGATION
                </span>
                {lastFetch && (
                  <span style={{ color: '#2E4050', fontSize: 9, marginLeft: 12 }}>
                    {lastFetch.toLocaleTimeString('en-GB')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={assess} disabled={assessing} style={{
                  background: assessing ? 'rgba(168,85,247,0.1)' : 'rgba(168,85,247,0.15)',
                  border: `1px solid ${VI}55`, borderRadius: 6, padding: '4px 12px',
                  color: VI, fontSize: 10, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
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
                { label: 'ANNOTATIONS', val: total,        col: VI  },
                { label: 'REPORTS',     val: reports.length, col: CY2 },
                { label: 'CASES',       val: investigations.length, col: AM },
                { label: 'FULLY DOC',   val: fd,           col: GR  },
                { label: 'RPT-BACKED',  val: rb,           col: CY2 },
                { label: 'CASE-LINKED', val: cl,           col: AM  },
                { label: 'UNDOCUMENTED',val: ud,           col: RD  },
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
                  {[['FULLY DOCUMENTED', GR], ['REPORT-BACKED', CY2], ['CASE-LINKED', AM], ['UNDOCUMENTED', RD]]
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
                  background: filter === f ? `${VI}22` : 'transparent',
                  border: `1px solid ${filter === f ? VI : '#1E3040'}`,
                  borderRadius: 5, padding: '3px 10px',
                  color: filter === f ? VI : '#4E6A80',
                  fontSize: 9, cursor: 'pointer', letterSpacing: 1,
                }}>
                  {f} {f !== 'ALL' ? `(${counts[f] ?? 0})` : `(${total})`}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search annotations…"
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
                  Loading annotation × report × investigation data…
                </div>
              )}
              {!loading && visible.length === 0 && (
                <div style={{ padding: 24, color: '#2E4050', fontSize: 11, textAlign: 'center' }}>
                  No annotations match filter.
                </div>
              )}
              {visible.map((ann, idx) => {
                const meta = STATE_META[ann.state];
                const isExp = expanded === idx;
                const label = ann.text ?? ann.title ?? ann.name ?? ann.target_id ?? `Annotation ${idx + 1}`;
                return (
                  <div key={idx} style={{
                    borderBottom: `1px solid rgba(0,212,255,0.07)`,
                    background: isExp ? 'rgba(168,85,247,0.06)' : 'transparent',
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
                      {ann.target_type && (
                        <span style={{ color: '#2E4050', fontSize: 9, letterSpacing: 1,
                          flexShrink: 0, marginRight: 4 }}>
                          {String(ann.target_type).toUpperCase()}
                        </span>
                      )}
                      <span style={{ color: '#2E4050', fontSize: 11, flexShrink: 0 }}>
                        {isExp ? '▲' : '▼'}
                      </span>
                    </div>

                    {isExp && (
                      <div style={{ padding: '0 20px 12px', display: 'grid',
                        gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Reports pane */}
                        <div>
                          <div style={{ color: CY2, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            INTELLIGENCE REPORTS ({ann.matchedReps?.length ?? 0})
                          </div>
                          {(ann.matchedReps ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No report coverage</div>
                          ) : ann.matchedReps.map((r, ri) => (
                            <div key={ri} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(34,211,238,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#BCDCEC', fontSize: 10, marginBottom: 2 }}>
                                {r.title ?? r.name ?? `Report ${ri + 1}`}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, overflow: 'hidden',
                                background: 'rgba(255,255,255,0.06)' }}>
                                <div style={{ width: `${Math.round(r._sc * 100)}%`,
                                  height: '100%', background: CY2, borderRadius: 2 }} />
                              </div>
                              <div style={{ color: '#3A5264', fontSize: 8, marginTop: 2 }}>
                                relevance {Math.round(r._sc * 100)}%
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Investigations pane */}
                        <div>
                          <div style={{ color: AM, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            INVESTIGATIONS ({ann.matchedInvs?.length ?? 0})
                          </div>
                          {(ann.matchedInvs ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No investigation coverage</div>
                          ) : ann.matchedInvs.map((iv, ii) => (
                            <div key={ii} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(245,158,11,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#D4A84B', fontSize: 10, marginBottom: 2 }}>
                                {iv.title ?? iv.name ?? `Case ${ii + 1}`}
                              </div>
                              {iv.status && (
                                <div style={{ color: '#3A5264', fontSize: 8, letterSpacing: 1 }}>
                                  STATUS: {String(iv.status).toUpperCase()}
                                </div>
                              )}
                              <div style={{ height: 3, borderRadius: 2, overflow: 'hidden',
                                background: 'rgba(255,255,255,0.06)', marginTop: 3 }}>
                                <div style={{ width: `${Math.round(iv._sc * 100)}%`,
                                  height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <div style={{ color: '#3A5264', fontSize: 8, marginTop: 2 }}>
                                relevance {Math.round(iv._sc * 100)}%
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
              <span>/v1/graph/annotations</span>
              <span>/v1/reports</span>
              <span>/v1/investigations</span>
              <span style={{ marginLeft: 'auto' }}>90s refresh · {visible.length} shown</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
