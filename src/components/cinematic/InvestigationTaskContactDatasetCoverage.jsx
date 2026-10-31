/**
 * InvestigationTaskContactDatasetCoverage — F228
 *
 * Fetches /v1/investigations + /entities/Task +
 *         /entities/Contact + /v1/datasets
 *
 * Keyword-matches each investigation (title/description/status/type)
 * against tasks, contacts, and datasets to classify:
 *
 *   PROSECUTING — matches all 3 sources (task + contact + dataset)
 *                 (investigation is fully resourced — tasked, staffed, data-backed)
 *   ACTIVE      — matches 2 of 3 sources
 *                 (investigation is partially resourced)
 *   STAFFED     — matches exactly 1 source
 *                 (investigation has minimal operational support)
 *   COLD        — no match to any source
 *                 (prosecution dead-end — no task, no contact owner, no dataset)
 *
 * Toggle: ◈ ITCOVEX button (fixed, bottom strip) left:175480, zIndex:324
 * Stat tiles: investigations / tasks / contacts / datasets /
 *             prosecuting / active / staffed / cold
 * Red pulse on COLD count (prosecution dead-ends).
 * Expandable rows: matched tasks with status badge +
 *                  matched contacts with role/org +
 *                  matched datasets with row-count badge.
 * Filter tabs: ALL / PROSECUTING / ACTIVE / STAFFED / COLD + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "itcovex"/"investigation coverage"/"prosecution coverage"/
 *        "cold investigation"/"investigation task"/"investigation contact"/
 *        "investigation dataset"/"prosecution gap"/"cold case coverage"/
 *        "case coverage"/"investigation staffing"/"case dataset"
 * Event: jarvis:itcovex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'PROSECUTING', 'ACTIVE', 'STAFFED', 'COLD'];

const CLS_COLOR = {
  PROSECUTING: '#22C55E',
  ACTIVE:      '#38BDF8',
  STAFFED:     '#F59E0B',
  COLD:        '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                      return raw;
  if (Array.isArray(raw?.investigations))      return raw.investigations;
  if (Array.isArray(raw?.items))               return raw.items;
  if (Array.isArray(raw?.results))             return raw.results;
  if (Array.isArray(raw?.data))                return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.tasks))    return raw.tasks;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.datasets))   return raw.datasets;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function invLabel(inv) {
  return inv?.title || inv?.name || inv?.description?.slice(0, 40) || inv?.id || 'Unknown';
}

function invText(inv) {
  return [inv?.title, inv?.name, inv?.description, inv?.type, inv?.status, inv?.category, (inv?.tags || []).join(' ')].join(' ');
}

function classify(inv, tasks, contacts, datasets) {
  const itoks = tokens(invText(inv));

  const matchedTasks = tasks.filter(t =>
    overlaps(itoks, [t?.title, t?.name, t?.description, t?.status, t?.type, t?.category, t?.assignee].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(itoks, [c?.name, c?.first_name, c?.last_name, c?.role, c?.org, c?.organisation, c?.email, c?.type, c?.category, c?.description].join(' '))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(itoks, [d?.name, d?.title, d?.description, d?.type, d?.category, d?.source, d?.schema].join(' '))
  );

  const hasT = matchedTasks.length > 0;
  const hasC = matchedContacts.length > 0;
  const hasD = matchedDatasets.length > 0;
  const srcCnt = [hasT, hasC, hasD].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'PROSECUTING';
  else if (srcCnt === 2) cls = 'ACTIVE';
  else if (srcCnt === 1) cls = 'STAFFED';
  else                   cls = 'COLD';

  return { cls, matchedTasks, matchedContacts, matchedDatasets };
}

export function isItcovexQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('itcovex') ||
    s.includes('investigation coverage') ||
    s.includes('prosecution coverage') ||
    s.includes('cold investigation') ||
    s.includes('investigation task') ||
    s.includes('investigation contact') ||
    s.includes('investigation dataset') ||
    s.includes('prosecution gap') ||
    s.includes('cold case coverage') ||
    s.includes('case coverage') ||
    s.includes('investigation staffing') ||
    s.includes('case dataset')
  );
}

export function buildItcovexScript(counts) {
  return `Analyse the JARVIS Investigation Task/Contact/Dataset Prosecution Coverage.
Total investigations: ${counts.total}. Prosecuting: ${counts.prosecuting}. Active: ${counts.active}. Staffed: ${counts.staffed}. Cold: ${counts.cold}.
Focus on the ${counts.cold} COLD investigations — open cases with no assigned task, no contact owner, and no dataset backing.
These are prosecution dead-ends. Identify the highest-priority cold cases and propose concrete resourcing actions: create a task, assign a contact lead, or link a relevant dataset.`;
}

export default function InvestigationTaskContactDatasetCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef                  = useRef(null);

  const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, tRes, cRes, dRes] = await Promise.all([
        fetch(`${API}/v1/investigations`,   { headers: hdrs }),
        fetch(`${API}/entities/Task`,       { headers: hdrs }),
        fetch(`${API}/entities/Contact`,    { headers: hdrs }),
        fetch(`${API}/v1/datasets`,         { headers: hdrs }),
      ]);
      const [iRaw, tRaw, cRaw, dRaw] = await Promise.all([
        iRes.ok ? iRes.json() : [],
        tRes.ok ? tRes.json() : [],
        cRes.ok ? cRes.json() : [],
        dRes.ok ? dRes.json() : [],
      ]);
      const invs  = normalizeInvestigations(iRaw);
      const tsks  = normalizeTasks(tRaw);
      const ctcs  = normalizeContacts(cRaw);
      const dsts  = normalizeDatasets(dRaw);
      setTasks(tsks); setContacts(ctcs); setDatasets(dsts);
      setRows(invs.map(inv => ({ inv, ...classify(inv, tsks, ctcs, dsts) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:itcovex-toggle', toggle);
    return () => window.removeEventListener('jarvis:itcovex-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const cold = rows.filter(r => r.cls === 'COLD').length;
    const script = buildItcovexScript({
      total:       rows.length,
      prosecuting: rows.filter(r => r.cls === 'PROSECUTING').length,
      active:      rows.filter(r => r.cls === 'ACTIVE').length,
      staffed:     rows.filter(r => r.cls === 'STAFFED').length,
      cold,
    });
    setAssessing(true); setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: script }),
      });
      const j = await res.json();
      const txt = j?.response || j?.message || j?.content || JSON.stringify(j);
      setAssessment(txt);
      if (window.__jarvisTTS) window.__jarvisTTS(txt.slice(0, 300));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = {
    total:       rows.length,
    prosecuting: rows.filter(r => r.cls === 'PROSECUTING').length,
    active:      rows.filter(r => r.cls === 'ACTIVE').length,
    staffed:     rows.filter(r => r.cls === 'STAFFED').length,
    cold:        rows.filter(r => r.cls === 'COLD').length,
  };
  const coldPulse = counts.cold > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || invLabel(r.inv).toLowerCase().includes(search.toLowerCase()))
  );

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const TILE = (label, val, color) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', minWidth: 70, textAlign: 'center' }}>
      <div style={{ color, fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{val}</div>
      <div style={{ color: '#64748B', fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 175480, zIndex: 324,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${open ? '#EF4444' : 'rgba(239,68,68,0.3)'}`,
          color: '#EF4444', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ ITCOVEX
        {coldPulse && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff', borderRadius: 9,
            padding: '1px 5px', fontSize: 9, fontWeight: 700,
            animation: 'pulse 1.5s infinite',
          }}>
            {counts.cold}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 36, left: 0, right: 0, margin: '0 auto',
          width: 740, maxHeight: '70vh', zIndex: 10324,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 700 }}>◈ INVESTIGATION PROSECUTION COVERAGE</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F228 · /v1/investigations + /entities/Task + /entities/Contact + /v1/datasets</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {TILE('INVESTIGATIONS', counts.total,       '#94A3B8')}
            {TILE('TASKS',         tasks.length,        '#F59E0B')}
            {TILE('CONTACTS',      contacts.length,     '#34D399')}
            {TILE('DATASETS',      datasets.length,     '#818CF8')}
            {TILE('PROSECUTING',   counts.prosecuting,  '#22C55E')}
            {TILE('ACTIVE',        counts.active,       '#38BDF8')}
            {TILE('STAFFED',       counts.staffed,      '#F59E0B')}
            {TILE('COLD',          counts.cold,         '#EF4444')}
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid rgba(239,68,68,0.1)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(239,68,68,0.2)' : 'transparent',
                  border: `1px solid ${tab === t ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
                  color: tab === t ? '#EF4444' : '#64748B',
                  padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investigations…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1',
                padding: '2px 8px', fontSize: 10, borderRadius: 4, width: 170,
              }}
            />
          </div>

          {/* Row list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
            {loading && <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>Loading…</div>}
            {error   && <div style={{ color: '#EF4444', fontSize: 11, padding: 12 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>No investigations match this filter.</div>
            )}
            {visible.map((row, i) => {
              const id     = row.inv?.id || row.inv?.title || i;
              const isOpen = !!expanded[id];
              const color  = CLS_COLOR[row.cls];
              return (
                <div key={id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => toggleRow(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 5,
                      background: isOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isOpen ? 'rgba(239,68,68,0.2)' : 'transparent'}`,
                    }}
                  >
                    <span style={{ color, fontSize: 9, minWidth: 88, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {invLabel(row.inv)}
                    </span>
                    {row.inv?.status && (
                      <span style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.3)', color: '#94A3B8', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {row.inv.status}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>MATCHED TASKS ({row.matchedTasks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedTasks.slice(0, 6).map((t, ti) => (
                              <span key={ti} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {t?.title || t?.name || t?.id || '—'}
                                {t?.status ? ` · ${t.status}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>MATCHED CONTACTS ({row.matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedContacts.slice(0, 6).map((c, ci) => (
                              <span key={ci} style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || c?.id || '—'}
                                {(c?.role || c?.org || c?.organisation) ? ` · ${c.role || c.org || c.organisation}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>MATCHED DATASETS ({row.matchedDatasets.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedDatasets.slice(0, 6).map((d, di) => {
                              const rows = d?.row_count ?? d?.rows ?? d?.count ?? d?.size;
                              return (
                                <span key={di} style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: '#818CF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                  {d?.name || d?.title || d?.id || '—'}
                                  {rows != null ? ` · ${rows}r` : ''}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {row.matchedTasks.length === 0 && row.matchedContacts.length === 0 && row.matchedDatasets.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No matched sources — prosecution dead-end investigation.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS button + result */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(239,68,68,0.1)' }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
                border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444',
                padding: '4px 14px', fontSize: 10, cursor: assessing ? 'not-allowed' : 'pointer',
                borderRadius: 4,
              }}
            >
              {assessing ? '▶ ASSESSING…' : '▶ ASSESS COLD CASES'}
            </button>
            {assessment && (
              <div style={{ marginTop: 6, color: '#CBD5E1', fontSize: 10, lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
