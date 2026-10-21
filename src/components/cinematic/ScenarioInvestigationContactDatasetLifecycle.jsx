/**
 * ScenarioInvestigationContactDatasetLifecycle — F105
 *
 * Fetches /v1/scenario/list + /v1/investigations + /entities/Contact + /v1/datasets.
 *
 * Keyword-matches each scenario (name/description/status) against
 * investigation titles/subjects, contact names/roles/orgs, and dataset names/tags
 * to classify:
 *
 *   COMPLETE  — scenario matches investigation AND contact AND dataset
 *               (fully grounded: tracked, staffed, and data-backed)
 *   TRACKED   — scenario matches investigation + at least one other source
 *               (under investigation but partially ungrounded)
 *   STAFFED   — scenario matches contact or dataset but NO investigation
 *               (has personnel/data but no active investigation trail)
 *   DARK      — no match to any source (operational mission lifecycle blind spot)
 *
 * Toggle: ◈ OMLCYC button (fixed, bottom strip) left:107160, zIndex:202
 * Stat tiles: scenarios / investigations / contacts / datasets / complete / tracked / staffed / dark
 * Amber pulse on DARK count (lifecycle blind spots — scenarios with zero operational grounding).
 * Expandable rows: matched investigations with status badge +
 *                  matched contacts with role/org +
 *                  matched datasets with row-count badge.
 * Filter tabs: ALL / COMPLETE / TRACKED / STAFFED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "omlcyc"/"mission lifecycle"/"operational lifecycle"/"scenario lifecycle"
 *        "mission complete"/"dark missions"/"ungrounded scenarios"
 *        "lifecycle audit"/"scenario investigation"/"mission tracking"
 *        "operational mission lifecycle"/"scenario dataset contact"
 * Event: jarvis:omlcyc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMPLETE', 'TRACKED', 'STAFFED', 'DARK'];

const CLS_COLOR = {
  COMPLETE: '#22C55E',
  TRACKED:  '#38BDF8',
  STAFFED:  '#F97316',
  DARK:     '#F59E0B',
};

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

export function isOmlcycQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'omlcyc', 'mission lifecycle', 'operational lifecycle', 'scenario lifecycle',
    'mission complete', 'dark missions', 'ungrounded scenarios',
    'lifecycle audit', 'scenario investigation', 'mission tracking',
    'operational mission lifecycle', 'scenario dataset contact',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export default function ScenarioInvestigationContactDatasetLifecycle() {
  const [open, setOpen]                 = useState(false);
  const [rows, setRows]                 = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [contacts, setContacts]         = useState([]);
  const [datasets, setDatasets]         = useState([]);
  const [tab, setTab]                   = useState('ALL');
  const [search, setSearch]             = useState('');
  const [loading, setLoading]           = useState(false);
  const [err, setErr]                   = useState('');
  const [expanded, setExpanded]         = useState({});
  const [assessing, setAssessing]       = useState(false);
  const [assessment, setAssessment]     = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [scRaw, invRaw, cntRaw, dsRaw] = await Promise.all([
        fetcher('/v1/scenario/list'),
        fetcher('/v1/investigations'),
        fetcher('/entities/Contact'),
        fetcher('/v1/datasets'),
      ]);

      const scenarios     = normalizeArray(scRaw,  ['scenarios', 'data', 'results', 'items']);
      const invList       = normalizeArray(invRaw, ['investigations', 'data', 'results', 'items']);
      const contactList   = normalizeArray(cntRaw, ['contacts', 'data', 'results', 'items']);
      const datasetList   = normalizeArray(dsRaw,  ['datasets', 'data', 'results', 'items']);

      setInvestigations(invList);
      setContacts(contactList);
      setDatasets(datasetList);

      const built = scenarios.map(sc => {
        const name = sc.name || sc.title || sc.id || '';
        const desc = sc.description || sc.summary || sc.objective || '';
        const sToks = tokens(name + ' ' + desc + ' ' + (sc.status || '') + ' ' + (sc.tags || []).join(' '));

        const matchedInv = invList.filter(inv => {
          const invText = (inv.title || '') + ' ' + (inv.subject || '') + ' ' + (inv.description || '') + ' ' + (inv.name || '');
          return overlaps(sToks, invText);
        });

        const matchedContacts = contactList.filter(c => {
          const cText = (c.name || '') + ' ' + (c.role || '') + ' ' + (c.org || '') + ' ' + (c.organization || '') + ' ' + (c.title || '');
          return overlaps(sToks, cText);
        });

        const matchedDatasets = datasetList.filter(ds => {
          const dsText = (ds.name || '') + ' ' + (ds.title || '') + ' ' + (ds.category || '') + ' ' + (ds.tags || []).join(' ');
          return overlaps(sToks, dsText);
        });

        const hasInv  = matchedInv.length > 0;
        const hasCnt  = matchedContacts.length > 0;
        const hasDs   = matchedDatasets.length > 0;

        let cls;
        if (hasInv && hasCnt && hasDs)        cls = 'COMPLETE';
        else if (hasInv && (hasCnt || hasDs)) cls = 'TRACKED';
        else if (hasCnt || hasDs)             cls = 'STAFFED';
        else                                  cls = 'DARK';

        return {
          id: sc.id || name,
          name,
          status: sc.status || '',
          cls,
          matchedInv,
          matchedContacts,
          matchedDatasets,
        };
      });

      setRows(built);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:omlcyc-toggle', handler);
    return () => window.removeEventListener('jarvis:omlcyc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    const dark    = rows.filter(r => r.cls === 'DARK').length;
    const complete = rows.filter(r => r.cls === 'COMPLETE').length;
    const prompt  = `JARVIS mission lifecycle audit: ${rows.length} scenarios — ${complete} COMPLETE, ${dark} DARK (lifecycle blind spots). Top dark scenarios: ${rows.filter(r => r.cls === 'DARK').slice(0, 3).map(r => r.name).join(', ') || 'none'}. Provide a 2-sentence operational advisory.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(answer);
      try {
        const tr = await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: answer }),
        });
        if (tr.ok) {
          const blob = await tr.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }
      } catch { /* TTS optional */ }
    } catch (e) {
      setAssessment('Assessment unavailable: ' + e.message);
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const counts = {
    complete: rows.filter(r => r.cls === 'COMPLETE').length,
    tracked:  rows.filter(r => r.cls === 'TRACKED').length,
    staffed:  rows.filter(r => r.cls === 'STAFFED').length,
    dark:     rows.filter(r => r.cls === 'DARK').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleExpand = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 107160,
          zIndex: 202, background: 'rgba(0,0,0,0.7)',
          border: '1px solid #29E7FF', color: '#29E7FF',
          padding: '3px 8px', fontSize: 11, fontFamily: 'monospace',
          cursor: 'pointer', borderRadius: 3,
        }}
      >
        ◈ OMLCYC
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: '5%', left: '50%', transform: 'translateX(-50%)',
      width: '92vw', maxHeight: '88vh', zIndex: 9900,
      background: 'rgba(0,4,16,0.97)', border: '1px solid #29E7FF',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#C8F0FF', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #1a3a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#29E7FF', fontWeight: 700, fontSize: 13 }}>
          ◈ OMLCYC — Scenario × Investigation × Contact × Dataset Operational Mission Lifecycle
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ background: 'transparent', border: '1px solid #29E7FF', color: '#29E7FF', padding: '2px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3 }}>
            {loading ? '...' : '↻'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'transparent', border: '1px solid #F87171', color: '#F87171', padding: '2px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #1a3a4a', flexWrap: 'wrap' }}>
        {[
          ['SCENARIOS', rows.length, '#29E7FF'],
          ['INVESTIGATIONS', investigations.length, '#A78BFA'],
          ['CONTACTS', contacts.length, '#38BDF8'],
          ['DATASETS', datasets.length, '#FB923C'],
          ['COMPLETE', counts.complete, '#22C55E'],
          ['TRACKED', counts.tracked, '#38BDF8'],
          ['STAFFED', counts.staffed, '#F97316'],
          ['DARK', counts.dark, '#F59E0B'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(0,20,40,0.8)', border: `1px solid ${color}`, borderRadius: 4, padding: '4px 12px', textAlign: 'center', minWidth: 80 }}>
            <div style={{ color, fontSize: 18, fontWeight: 700, position: 'relative' }}>
              {val}
              {label === 'DARK' && val > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -6, width: 8, height: 8,
                  background: '#F59E0B', borderRadius: '50%',
                  animation: 'pulse 1.4s infinite',
                }} />
              )}
            </div>
            <div style={{ fontSize: 9, color: '#7AA0B8', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid #1a3a4a', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#29E7FF' : 'transparent',
              color: tab === t ? '#001020' : '#29E7FF',
              border: '1px solid #29E7FF', padding: '2px 10px',
              fontSize: 11, cursor: 'pointer', borderRadius: 3,
            }}>
            {t}{t !== 'ALL' ? ` (${counts[t.toLowerCase()] ?? 0})` : ` (${rows.length})`}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{ marginLeft: 'auto', background: 'rgba(0,20,40,0.8)', border: '1px solid #29E7FF', color: '#C8F0FF', padding: '2px 8px', fontSize: 11, borderRadius: 3, width: 180 }} />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {err && <div style={{ color: '#F87171', marginBottom: 8 }}>Error: {err}</div>}
        {visible.length === 0 && !loading && <div style={{ color: '#7AA0B8', fontSize: 12 }}>No scenarios match.</div>}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: '1px solid #0a2030', marginBottom: 4 }}>
            <div
              onClick={() => toggleExpand(row.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}
            >
              <span style={{ color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 700, minWidth: 72, border: `1px solid ${CLS_COLOR[row.cls]}`, borderRadius: 3, textAlign: 'center', padding: '1px 4px' }}>
                {row.cls}
              </span>
              <span style={{ fontSize: 12, flex: 1 }}>{row.name}</span>
              {row.status && <span style={{ fontSize: 10, color: '#7AA0B8' }}>{row.status}</span>}
              <span style={{ fontSize: 10, color: '#4A7A8A' }}>
                {row.matchedInv.length}inv · {row.matchedContacts.length}cnt · {row.matchedDatasets.length}ds
              </span>
              <span style={{ color: '#29E7FF', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingBottom: 8, fontSize: 11 }}>
                {row.matchedInv.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: '#A78BFA', fontSize: 10 }}>INVESTIGATIONS</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                      {row.matchedInv.map((inv, i) => (
                        <span key={i} style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid #A78BFA', borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#C8F0FF' }}>
                          {inv.title || inv.name || inv.id}
                          {inv.status && <span style={{ marginLeft: 4, color: inv.status === 'open' ? '#22C55E' : '#F59E0B' }}>• {inv.status}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {row.matchedContacts.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: '#38BDF8', fontSize: 10 }}>CONTACTS</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                      {row.matchedContacts.map((c, i) => (
                        <span key={i} style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid #38BDF8', borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#C8F0FF' }}>
                          {c.name || c.id}
                          {(c.role || c.org || c.organization) && (
                            <span style={{ color: '#7AA0B8', marginLeft: 4 }}>
                              {[c.role, c.org || c.organization].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {row.matchedDatasets.length > 0 && (
                  <div>
                    <span style={{ color: '#FB923C', fontSize: 10 }}>DATASETS</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                      {row.matchedDatasets.map((ds, i) => (
                        <span key={i} style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid #FB923C', borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#C8F0FF' }}>
                          {ds.name || ds.title || ds.id}
                          {ds.row_count != null && <span style={{ marginLeft: 4, color: '#7AA0B8' }}>{ds.row_count.toLocaleString()} rows</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ASSESS */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid #1a3a4a' }}>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: assessing ? 'rgba(41,231,255,0.1)' : 'rgba(41,231,255,0.15)', border: '1px solid #29E7FF', color: '#29E7FF', padding: '4px 18px', fontSize: 12, cursor: 'pointer', borderRadius: 3 }}>
          {assessing ? 'ASSESSING…' : '▶ ASSESS'}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, color: '#C8F0FF', fontSize: 12, lineHeight: 1.5, padding: '6px 10px', background: 'rgba(41,231,255,0.07)', borderRadius: 4, border: '1px solid #29E7FF' }}>
            {assessment}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.5)} }`}</style>
    </div>
  );
}
