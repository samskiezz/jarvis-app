import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const GACRTRI_RE = /\b(gacrtri|annotation\s+contact\s+risk|graph\s+annotation\s+contact|annotation\s+person\s+risk|graph\s+note\s+contact|annotation\s+actor\s+risk|contact\s+risk\s+annotation|annotation\s+human\s+threat|annotation\s+contact\s+threat|graph\s+annotation\s+alarm|fully\s+alarmed\s+annotation|alarmed\s+annotation|annotation\s+exposure\s+triple)\b/i;

export function isGacrtriQuery(t) { return GACRTRI_RE.test(t || ''); }

function kwAnn(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name, a?.title,
          a?.description, a?.category, a?.tags, a?.kind, a?.target_id]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwContact(c) {
  return [c?.name, c?.role, c?.department, c?.email, c?.organisation,
          c?.tags, c?.notes, c?.affiliation, c?.location]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwRisk(r) {
  return [r?.title, r?.name, r?.description, r?.category, r?.source,
          r?.tags, r?.severity, r?.type, r?.signal_type]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildGacrtriScript() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [annR, conR, rskR] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/Contact`,     { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`,  { headers: hdr }).then(r => r.json()),
  ]);

  const annotations = (annR.status === 'fulfilled' ? (annR.value?.data ?? annR.value ?? []) : []).slice(0, 100);
  const contacts    = (conR.status === 'fulfilled' ? (conR.value?.data ?? conR.value ?? []) : []).slice(0, 100);
  const risks       = (rskR.status === 'fulfilled' ? (rskR.value?.data ?? rskR.value ?? []) : []).slice(0, 100);

  let fullyAlarmed = 0, contactOnly = 0, riskOnly = 0, dark = 0;
  for (const ann of annotations) {
    const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
    const hasCon = contacts.some(c => relevance(words, kwContact(c)) > 0.12);
    const hasRsk = risks.some(r   => relevance(words, kwRisk(r))    > 0.12);
    if (hasCon && hasRsk) fullyAlarmed++;
    else if (hasCon) contactOnly++;
    else if (hasRsk) riskOnly++;
    else dark++;
  }

  return `GACRTRI: ${annotations.length} graph annotations × ${contacts.length} contacts × ${risks.length} risk signals. ` +
    `${fullyAlarmed} FULLY ALARMED (contact + risk match), ${contactOnly} CONTACT-ONLY, ` +
    `${riskOnly} RISK-ONLY, ${dark} DARK (no contact or risk correlation). ` +
    (fullyAlarmed > 0
      ? `${fullyAlarmed} annotation(s) are simultaneously linked to a known contact AND an active risk signal — high-priority intelligence nodes.`
      : dark > 0
      ? `${dark} annotation(s) have no contact or risk correlation — unanchored intelligence.`
      : 'All annotations correlate with at least one contact or risk signal.');
}

const MG = '#EC4899'; const RD = '#EF4444'; const AM = '#F59E0B'; const GR = '#00FF88';
const CY = '#00D4FF'; const CY2 = '#22D3EE';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)';

const STATE_META = {
  'FULLY ALARMED': { col: RD,  label: 'FULLY ALARMED' },
  'CONTACT-ONLY':  { col: CY2, label: 'CONTACT-ONLY'  },
  'RISK-ONLY':     { col: AM,  label: 'RISK-ONLY'      },
  'DARK':          { col: '#4E6A80', label: 'DARK'     },
};

function classify(ann, contacts, risks) {
  const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
  const matchedContacts = contacts
    .map(c => ({ c, sc: relevance(words, kwContact(c)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const matchedRisks = risks
    .map(r => ({ r, sc: relevance(words, kwRisk(r)) }))
    .filter(x => x.sc > 0.12)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 4);
  const hasCon = matchedContacts.length > 0;
  const hasRsk = matchedRisks.length > 0;
  const state = (hasCon && hasRsk) ? 'FULLY ALARMED'
              : hasCon             ? 'CONTACT-ONLY'
              : hasRsk             ? 'RISK-ONLY'
              :                     'DARK';
  return {
    ...ann,
    state,
    matchedContacts: matchedContacts.map(x => ({ ...x.c, _sc: x.sc })),
    matchedRisks:    matchedRisks.map(x => ({ ...x.r, _sc: x.sc })),
  };
}

export default function GraphAnnotationContactRiskTriple() {
  const [open, setOpen]         = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [risks, setRisks]       = useState([]);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [annR, conR, rskR] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/Contact`,     { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }).then(r => r.json()),
      ]);
      const anns = (annR.status === 'fulfilled' ? (annR.value?.data ?? annR.value ?? []) : []).slice(0, 100);
      const cons = (conR.status === 'fulfilled' ? (conR.value?.data ?? conR.value ?? []) : []).slice(0, 100);
      const rsks = (rskR.status === 'fulfilled' ? (rskR.value?.data ?? rskR.value ?? []) : []).slice(0, 100);
      setAnnotations(anns);
      setContacts(cons);
      setRisks(rsks);
      setRows(anns.map(a => classify(a, cons, rsks)));
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
    window.addEventListener('jarvis:gacrtri-toggle', onToggle);
    const onAsk = (e) => { if (isGacrtriQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener('jarvis:ask', onAsk);
    return () => {
      window.removeEventListener('jarvis:gacrtri-toggle', onToggle);
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

  const counts = { 'FULLY ALARMED': 0, 'CONTACT-ONLY': 0, 'RISK-ONLY': 0, 'DARK': 0 };
  rows.forEach(r => counts[r.state]++);

  const alarmBadge = counts['FULLY ALARMED'];

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildGacrtriScript();
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: `GACRTRI analysis: ${script}. Provide a 2-sentence contact-risk annotation alarm brief.` }),
      }).then(r => r.json());
      const txt = res?.response ?? res?.message ?? res?.text ?? JSON.stringify(res).slice(0, 200);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: 'GACRTRI assessment unavailable.' } }));
    } finally {
      setAssessing(false);
    }
  };

  const FILTERS = ['ALL', 'FULLY ALARMED', 'CONTACT-ONLY', 'RISK-ONLY', 'DARK'];
  const total = rows.length;
  const fa = counts['FULLY ALARMED'];
  const co = counts['CONTACT-ONLY'];
  const ro = counts['RISK-ONLY'];
  const dk = counts['DARK'];

  return (
    <>
      {/* ◈ GACRTRI floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Annotation × Contact × Risk Signal Triple Coverage"
        style={{
          position: 'fixed', bottom: 8, left: 803920, zIndex: 464,
          background: 'rgba(6,16,28,0.92)', border: `1px solid ${MG}55`,
          borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
          color: MG, fontSize: 10, fontFamily: 'monospace', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        }}
      >
        ◈ GACRTRI
        {alarmBadge > 0 && (
          <span style={{ background: RD, color: '#fff', borderRadius: 4,
            padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {alarmBadge}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 465,
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
                <span style={{ color: MG, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
                  ◈ GACRTRI
                </span>
                <span style={{ color: '#4E6A80', fontSize: 10, marginLeft: 12, letterSpacing: 1 }}>
                  GRAPH ANNOTATION × CONTACT × RISK SIGNAL
                </span>
                {lastFetch && (
                  <span style={{ color: '#2E4050', fontSize: 9, marginLeft: 12 }}>
                    {lastFetch.toLocaleTimeString('en-GB')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={assess} disabled={assessing} style={{
                  background: assessing ? 'rgba(236,72,153,0.1)' : 'rgba(236,72,153,0.15)',
                  border: `1px solid ${MG}55`, borderRadius: 6, padding: '4px 12px',
                  color: MG, fontSize: 10, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
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
                { label: 'ANNOTATIONS',     val: total,            col: MG  },
                { label: 'CONTACTS',        val: contacts.length,  col: CY2 },
                { label: 'RISK SIGNALS',    val: risks.length,     col: AM  },
                { label: 'FULLY ALARMED',   val: fa,               col: RD  },
                { label: 'CONTACT-ONLY',    val: co,               col: CY2 },
                { label: 'RISK-ONLY',       val: ro,               col: AM  },
                { label: 'DARK',            val: dk,               col: '#4E6A80' },
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
                  {[['FULLY ALARMED', RD], ['CONTACT-ONLY', CY2], ['RISK-ONLY', AM], ['DARK', '#2E4050']]
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
                  background: filter === f ? `${MG}22` : 'transparent',
                  border: `1px solid ${filter === f ? MG : '#1E3040'}`,
                  borderRadius: 5, padding: '3px 10px',
                  color: filter === f ? MG : '#4E6A80',
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
                  Loading annotation × contact × risk signal data…
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
                    borderBottom: 'rgba(0,212,255,0.07) solid 1px',
                    background: isExp ? 'rgba(236,72,153,0.05)' : 'transparent',
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
                        {/* Contacts pane */}
                        <div>
                          <div style={{ color: CY2, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            CONTACTS ({ann.matchedContacts?.length ?? 0})
                          </div>
                          {(ann.matchedContacts ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No contact match</div>
                          ) : ann.matchedContacts.map((c, ci) => (
                            <div key={ci} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(34,211,238,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#BCDCEC', fontSize: 10, marginBottom: 2 }}>
                                {c.name ?? `Contact ${ci + 1}`}
                              </div>
                              {c.role && (
                                <div style={{ color: '#3A5264', fontSize: 8, letterSpacing: 1 }}>
                                  {c.role}{c.department ? ` · ${c.department}` : ''}
                                </div>
                              )}
                              <div style={{ height: 3, borderRadius: 2, overflow: 'hidden',
                                background: 'rgba(255,255,255,0.06)', marginTop: 3 }}>
                                <div style={{ width: `${Math.round(c._sc * 100)}%`,
                                  height: '100%', background: CY2, borderRadius: 2 }} />
                              </div>
                              <div style={{ color: '#3A5264', fontSize: 8, marginTop: 2 }}>
                                relevance {Math.round(c._sc * 100)}%
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Risk signals pane */}
                        <div>
                          <div style={{ color: AM, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                            RISK SIGNALS ({ann.matchedRisks?.length ?? 0})
                          </div>
                          {(ann.matchedRisks ?? []).length === 0 ? (
                            <div style={{ color: '#2E4050', fontSize: 10 }}>No risk signal match</div>
                          ) : ann.matchedRisks.map((r, ri) => (
                            <div key={ri} style={{ marginBottom: 6, padding: '5px 8px',
                              background: 'rgba(245,158,11,0.06)', borderRadius: 5 }}>
                              <div style={{ color: '#D4A84B', fontSize: 10, marginBottom: 2 }}>
                                {r.title ?? r.name ?? `Signal ${ri + 1}`}
                              </div>
                              {r.severity && (
                                <div style={{ color: '#3A5264', fontSize: 8, letterSpacing: 1 }}>
                                  SEV: {String(r.severity).toUpperCase()}
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
              <span>/v1/graph/annotations</span>
              <span>/entities/Contact</span>
              <span>/entities/RiskSignal</span>
              <span style={{ marginLeft: 'auto' }}>90s refresh · {visible.length} shown</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
