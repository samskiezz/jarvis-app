/**
 * ContactTaskInvestigationDatasetCoverage — F117
 *
 * Fetches /entities/Contact + /entities/Task + /v1/investigations + /v1/datasets.
 *
 * Keyword-matches each contact (name/role/org/department/tags) against task names/objectives,
 * investigation titles/descriptions, and dataset names/descriptions to classify:
 *
 *   ACTIVE       — contact matches task AND investigation AND dataset
 *                  (fully anchored: operationally active, traceable, and data-grounded)
 *   STAFFED      — contact matches 2 of the 3 sources
 *                  (partially engaged — missing one operational pillar)
 *   INVESTIGATED — contact matches only 1 of the 3 sources
 *                  (thin footprint — contact exists but barely grounded)
 *   ORPHAN       — no match to any source
 *                  (invisible actor — full contact blind spot)
 *
 * Toggle: ◈ CTIDOP button (fixed, bottom strip) left:113880, zIndex:214
 * Stat tiles: contacts / tasks / investigations / datasets / active / staffed / investigated / orphan
 * Amber pulse on ORPHAN count (invisible contacts).
 * Expandable rows: matched tasks with status badge +
 *                  matched investigations with status badge +
 *                  matched datasets with row-count badge.
 * Filter tabs: ALL / ACTIVE / STAFFED / INVESTIGATED / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ctidop"/"contact operational"/"contact coverage"/"contact task dataset"
 *        "contact investigation"/"contact blind spot"/"orphan contact"
 *        "contact operational coverage"/"contact task investigation"
 *        "contact dataset"/"contact active"/"invisible contact"/"contact footprint"
 *        "contact staffed"/"contact grounding"/"contact mission coverage"
 * Event: jarvis:ctidop-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVE', 'STAFFED', 'INVESTIGATED', 'ORPHAN'];

const CLS_COLOR = {
  ACTIVE:       '#22C55E',
  STAFFED:      '#3B82F6',
  INVESTIGATED: '#F97316',
  ORPHAN:       '#F59E0B',
};

export function isCtidopQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ctidop', 'contact operational', 'contact coverage', 'contact task dataset',
    'contact investigation', 'contact blind spot', 'orphan contact',
    'contact operational coverage', 'contact task investigation',
    'contact dataset', 'contact active', 'invisible contact', 'contact footprint',
    'contact staffed', 'contact grounding', 'contact mission coverage',
  ].some(kw => s.includes(kw));
}

export function buildCtidopScript(q) {
  return `JARVIS contact operational coverage audit triggered by: "${q}". Fetch /entities/Contact + /entities/Task + /v1/investigations + /v1/datasets. Classify each contact as ACTIVE/STAFFED/INVESTIGATED/ORPHAN. Report the orphan count and top 3 blind-spot contacts.`;
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function contactLabel(c) {
  return c.name || c.full_name || c.display_name || c.email || c.id || 'Unknown';
}

function contactTokens(c) {
  return tokens(
    `${c.name || ''} ${c.full_name || ''} ${c.role || ''} ${c.title || ''} ${c.org || ''} ${c.organization || ''} ${c.department || ''} ${c.email || ''} ${(c.tags || []).join(' ')}`
  );
}

function classifyContact(contact, tasks, investigations, datasets) {
  const toks = contactTokens(contact);
  const mTasks   = tasks.filter(t => overlaps(toks, `${t.name || ''} ${t.title || ''} ${t.description || ''} ${t.objective || ''} ${t.assignee || ''} ${t.owner || ''}`));
  const mInvs    = investigations.filter(inv => overlaps(toks, `${inv.title || ''} ${inv.name || ''} ${inv.description || ''} ${inv.subject || ''} ${inv.target || ''} ${inv.assigned_to || ''}`));
  const mDatasets = datasets.filter(d => overlaps(toks, `${d.name || ''} ${d.description || ''} ${d.owner || ''} ${d.category || ''} ${d.type || ''}`));

  const matchCount = (mTasks.length > 0 ? 1 : 0) + (mInvs.length > 0 ? 1 : 0) + (mDatasets.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'ACTIVE';
  else if (matchCount === 2) cls = 'STAFFED';
  else if (matchCount === 1) cls = 'INVESTIGATED';
  else cls = 'ORPHAN';

  return { contact, cls, mTasks, mInvs, mDatasets };
}

export default function ContactTaskInvestigationDatasetCoverage() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [contactsRaw, tasksRaw, invsRaw, datasetsRaw] = await Promise.all([
        fetcher('/entities/Contact'),
        fetcher('/entities/Task'),
        fetcher('/v1/investigations'),
        fetcher('/v1/datasets'),
      ]);

      const contacts      = normalizeArray(contactsRaw, ['contacts', 'data', 'items', 'results']);
      const tasks         = normalizeArray(tasksRaw,    ['tasks', 'data', 'items', 'results']);
      const investigations = normalizeArray(invsRaw,   ['investigations', 'data', 'items', 'results']);
      const datasets      = normalizeArray(datasetsRaw, ['datasets', 'data', 'items', 'results']);

      setRows(contacts.map(c => classifyContact(c, tasks, investigations, datasets)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:ctidop-toggle', handler);
    return () => window.removeEventListener('jarvis:ctidop-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    ACTIVE:       rows.filter(r => r.cls === 'ACTIVE').length,
    STAFFED:      rows.filter(r => r.cls === 'STAFFED').length,
    INVESTIGATED: rows.filter(r => r.cls === 'INVESTIGATED').length,
    ORPHAN:       rows.filter(r => r.cls === 'ORPHAN').length,
  };

  const taskCount = rows.reduce((n, r) => n + r.mTasks.length,   0);
  const invCount  = rows.reduce((n, r) => n + r.mInvs.length,    0);
  const dsCount   = rows.reduce((n, r) => n + r.mDatasets.length, 0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return contactLabel(r.contact).toLowerCase().includes(s) ||
             (r.contact.role || r.contact.title || r.contact.org || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Contacts: ${rows.length}. Active: ${counts.ACTIVE}. Staffed: ${counts.STAFFED}. Investigated: ${counts.INVESTIGATED}. Orphan: ${counts.ORPHAN}.`;
    const prompt = `JARVIS contact operational coverage audit: ${summary}. Identify the most critical orphan contacts — those with no task assignment, no investigation grounding, and no dataset link. Provide a 2-sentence advisory on the deepest contact blind spots and priority actions to bring the invisible actors into operational scope.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 113880, zIndex: 214,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #F59E0B55',
          color: '#F59E0B', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ CTIDOP</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 214, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #F59E0B33', flexShrink: 0 }}>
        <span style={{ color: '#F59E0B', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ CTIDOP</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Contact × Task × Investigation × Dataset — Operational Coverage Matrix</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #F59E0B55', color: '#F59E0B', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'CONTACTS',     val: rows.length,          color: '#94a3b8' },
          { label: 'TASKS',        val: taskCount,            color: '#fbbf24' },
          { label: 'INVESTIG.',    val: invCount,             color: '#7dd3fc' },
          { label: 'DATASETS',     val: dsCount,              color: '#86efac' },
          { label: 'ACTIVE',       val: counts.ACTIVE,        color: CLS_COLOR.ACTIVE },
          { label: 'STAFFED',      val: counts.STAFFED,       color: CLS_COLOR.STAFFED },
          { label: 'INVESTIGATED', val: counts.INVESTIGATED,  color: CLS_COLOR.INVESTIGATED },
          { label: 'ORPHAN',       val: counts.ORPHAN,        color: CLS_COLOR.ORPHAN, pulse: counts.ORPHAN > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'ctidop-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B44', borderRadius: 5, fontSize: 11, color: '#fde68a', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#F59E0B22' : 'none',
            border: `1px solid ${tab === t ? '#F59E0B' : '#1e293b'}`,
            color: tab === t ? '#F59E0B' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contactLabel(r.contact)}
                </span>
                {(r.contact.role || r.contact.title) && (
                  <span style={{ background: '#071428', border: '1px solid #075985', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.contact.role || r.contact.title}
                  </span>
                )}
                {(r.contact.org || r.contact.organization) && (
                  <span style={{ background: '#071420', border: '1px solid #0e4d6b', color: '#67e8f9', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.contact.org || r.contact.organization}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mTasks.length > 0 && (
                    <div>
                      <div style={{ color: '#fbbf24', fontSize: 10, marginBottom: 3 }}>TASKS ({r.mTasks.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mTasks.slice(0, 8).map((t, k) => (
                          <span key={k} style={{ background: '#1a1000', border: '1px solid #78350f', color: '#fbbf24', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {t.name || t.title || t.id}
                            {t.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{t.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mInvs.length > 0 && (
                    <div>
                      <div style={{ color: '#7dd3fc', fontSize: 10, marginBottom: 3 }}>INVESTIGATIONS ({r.mInvs.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mInvs.slice(0, 8).map((inv, k) => (
                          <span key={k} style={{ background: '#071420', border: '1px solid #0e4d6b', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {inv.title || inv.name || inv.id}
                            {inv.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{inv.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#86efac', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#071a10', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.id}
                            {d.row_count != null && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{d.row_count.toLocaleString()} rows]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mTasks.length === 0 && r.mInvs.length === 0 && r.mDatasets.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No task, investigation, or dataset match — invisible contact with zero operational footprint.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ctidop-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
