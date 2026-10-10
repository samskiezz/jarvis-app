import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const GATOE_RE = /\b(gatoe|annotation\s+task\s+ops|graph\s+annotation\s+task\s+ops|annotation\s+ops\s+event\s+task|annotation\s+task\s+event|dark\s+annotation\s+task|task\s+ops\s+annotation|annotation\s+task|annotation\s+ops\s+event)\b/i;

export function isGatoeQuery(t) { return GATOE_RE.test(t || ''); }

function kwAnn(a) {
  return [a?.text, a?.target_type, a?.actor, a?.name, a?.title,
          a?.description, a?.category, a?.tags, a?.kind, a?.target_id]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwTask(t) {
  return [t?.name, t?.title, t?.description, t?.mission,
          t?.priority, t?.tags, t?.category, t?.type, t?.status]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwOps(o) {
  return [o?.name, o?.title, o?.description, o?.type,
          o?.severity, o?.category, o?.region, o?.location, o?.status]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildGatoeScript() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [annR, tskR, opsR] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/Task`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);

  const annotations = (annR.status === 'fulfilled'
    ? (annR.value?.annotations ?? annR.value?.data ?? annR.value ?? []) : []).slice(0, 80);
  const tasks = (tskR.status === 'fulfilled'
    ? (tskR.value?.data ?? tskR.value?.tasks ?? tskR.value ?? []) : []).slice(0, 200);
  const opsEvents = (opsR.status === 'fulfilled'
    ? (opsR.value?.events ?? opsR.value?.data ?? opsR.value ?? []) : []).slice(0, 200);

  let fullyOp = 0, taskOnly = 0, opsActive = 0, dark = 0;
  for (const ann of annotations) {
    const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
    const hasTask = tasks.some(t => relevance(words, kwTask(t)) > 0.12);
    const hasOps  = opsEvents.some(o => relevance(words, kwOps(o)) > 0.12);
    if (hasTask && hasOps) fullyOp++;
    else if (hasTask) taskOnly++;
    else if (hasOps) opsActive++;
    else dark++;
  }

  return `GATOE: ${annotations.length} graph annotations × ${tasks.length} tasks × ${opsEvents.length} ops events. ` +
    `${fullyOp} FULLY OPERATIONAL (task+ops), ${taskOnly} TASK-ONLY, ${opsActive} OPS-ACTIVE, ${dark} DARK. ` +
    (dark > 0
      ? `${dark} annotation nodes have no task or ops event coverage — operational blind spots.`
      : 'All graph annotations have task or ops event coverage.');
}

const CY  = '#00D4FF';
const CY2 = '#22D3EE';
const GR  = '#22C55E';
const YL  = '#EAB308';
const OR  = '#F97316';
const GY  = '#6B7280';
const BG  = 'rgba(6,16,28,0.97)';
const BD  = 'rgba(0,212,255,0.18)';

const STATE_COL = { 'FULLY OPERATIONAL': GR, 'TASK-ONLY': YL, 'OPS-ACTIVE': OR, DARK: GY };

export default function GraphAnnotationTaskOpsTriple() {
  const [open, setOpen]               = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [tasks, setTasks]             = useState([]);
  const [opsEvents, setOpsEvents]     = useState([]);
  const [rows, setRows]               = useState([]);
  const [filter, setFilter]           = useState('ALL');
  const [search, setSearch]           = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [loading, setLoading]         = useState(false);
  const [assessing, setAssessing]     = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:gatoe-toggle', h);
    return () => window.removeEventListener('jarvis:gatoe-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [aR, tR, oR] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/Task`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const anns = (aR.status === 'fulfilled'
        ? (aR.value?.annotations ?? aR.value?.data ?? aR.value ?? []) : []).slice(0, 80);
      const tsks = (tR.status === 'fulfilled'
        ? (tR.value?.data ?? tR.value?.tasks ?? tR.value ?? []) : []).slice(0, 200);
      const ops  = (oR.status === 'fulfilled'
        ? (oR.value?.events ?? oR.value?.data ?? oR.value ?? []) : []).slice(0, 200);
      setAnnotations(anns);
      setTasks(tsks);
      setOpsEvents(ops);

      const built = anns.map(ann => {
        const words = kwAnn(ann).split(/\s+/).filter(w => w.length > 3);
        const matchedTasks = tsks
          .map(t => ({ ...t, _r: relevance(words, kwTask(t)) }))
          .filter(t => t._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const matchedOps = ops
          .map(o => ({ ...o, _r: relevance(words, kwOps(o)) }))
          .filter(o => o._r > 0.12)
          .sort((a, b) => b._r - a._r)
          .slice(0, 5);
        const hasTask = matchedTasks.length > 0;
        const hasOps  = matchedOps.length > 0;
        const state = hasTask && hasOps ? 'FULLY OPERATIONAL'
          : hasTask ? 'TASK-ONLY'
          : hasOps  ? 'OPS-ACTIVE'
          : 'DARK';
        return { ...ann, matchedTasks, matchedOps, state };
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

  const fullyOp   = rows.filter(r => r.state === 'FULLY OPERATIONAL').length;
  const taskOnly  = rows.filter(r => r.state === 'TASK-ONLY').length;
  const opsActive = rows.filter(r => r.state === 'OPS-ACTIVE').length;
  const dark      = rows.filter(r => r.state === 'DARK').length;
  const total     = rows.length || 1;

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
          `Summarise graph annotation task-ops event coverage in 2 sentences: ${fullyOp} FULLY OPERATIONAL (task+ops), ${taskOnly} TASK-ONLY, ${opsActive} OPS-ACTIVE, ${dark} DARK out of ${rows.length} graph annotations. Tasks: ${tasks.length}, Ops events: ${opsEvents.length}.` }),
      });
      const d   = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 804480, bottom: 8, zIndex: 465, width: 540,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: '0 0 32px rgba(0,212,255,0.12)', display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ GATOE</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>ANNOTATION × TASK × OPS-EVENT</span>
        {dark > 0 && (
          <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{dark} DARK</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: dark > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[
          ['ANNOTATIONS', annotations.length, CY],
          ['TASKS',       tasks.length,       YL],
          ['OPS EVENTS',  opsEvents.length,   OR],
          ['FULLY OP',    fullyOp,            GR],
          ['TASK-ONLY',   taskOnly,           YL],
          ['OPS-ACTIVE',  opsActive,          OR],
          ['DARK',        dark,               GY],
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
        <div style={{ width: `${(fullyOp   / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(taskOnly  / total) * 100}%`, background: YL }} />
        <div style={{ width: `${(opsActive / total) * 100}%`, background: OR }} />
        <div style={{ width: `${(dark      / total) * 100}%`, background: 'rgba(107,114,128,0.4)' }} />
      </div>

      {/* filter + assess */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY OPERATIONAL', 'TASK-ONLY', 'OPS-ACTIVE', 'DARK'].map(f => (
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
                <span style={{ color: stateCol, fontSize: 8, minWidth: 108,
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
                  {r.matchedTasks.length === 0 && r.matchedOps.length === 0 ? (
                    <div style={{ color: '#4A6080', fontSize: 9, padding: '4px 0' }}>
                      no task or ops event matched this annotation
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'rgba(234,179,8,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: YL, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          TASKS ({r.matchedTasks.length})
                        </div>
                        {r.matchedTasks.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedTasks.map((t, j) => (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 160 }}>{t.name ?? t.title ?? `Task ${j + 1}`}</span>
                                {t.priority && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>{t.priority}</span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(234,179,8,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(t._r * 100)}%`, background: YL }} />
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1, background: 'rgba(249,115,22,0.06)', borderRadius: 6, padding: 8 }}>
                        <div style={{ color: OR, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                          OPS EVENTS ({r.matchedOps.length})
                        </div>
                        {r.matchedOps.length === 0
                          ? <div style={{ color: '#4A6080', fontSize: 9 }}>none</div>
                          : r.matchedOps.map((o, j) => (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: '#DCEBF5', fontSize: 9,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 160 }}>{o.name ?? o.title ?? `Event ${j + 1}`}</span>
                                {(o.severity ?? o.type) && (
                                  <span style={{ color: '#4A6080', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>{o.severity ?? o.type}</span>
                                )}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: 'rgba(249,115,22,0.15)' }}>
                                <div style={{ height: '100%', borderRadius: 2,
                                  width: `${Math.round(o._r * 100)}%`, background: OR }} />
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
