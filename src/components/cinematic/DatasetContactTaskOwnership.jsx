/**
 * DatasetContactTaskOwnership — F66
 *
 * Fetches /v1/datasets + /entities/Contact + /entities/Task
 * Keyword-matches each dataset against contacts (owners/stakeholders) AND tasks
 * (operational usage) to classify:
 *   OWNED   — dataset matched both a Contact AND a Task (owner known + operationally active)
 *   ACTIVE  — dataset matched a Task only (in operational use, no known owner)
 *   STAFFED — dataset matched a Contact only (owner known, not yet tasked)
 *   ORPHAN  — no match (unowned and untasked dataset — blind spot)
 *
 * Toggle: ◈ DCTOWN button (fixed, bottom strip) left:85320, zIndex:163
 * Stat tiles: datasets / contacts / tasks / owned / active / staffed / orphan
 * Amber pulse on ORPHAN count.
 * Expandable rows: matched contacts with role/org + matched tasks with status badge.
 * Filter tabs: ALL / OWNED / ACTIVE / STAFFED / ORPHAN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dctown"/"dataset ownership"/"dataset owner"/"orphan datasets"/
 *        "dataset contact task"/"data ownership"/"unowned datasets"/"dataset staffing"
 * Event: jarvis:dctown-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'OWNED', 'ACTIVE', 'STAFFED', 'ORPHAN'];

const CLS_COLOR = {
  OWNED:   '#00FF88',
  ACTIVE:  '#38BDF8',
  STAFFED: '#A78BFA',
  ORPHAN:  '#FBBF24',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function classify(dsToks, contacts, tasks) {
  const matchedContacts = contacts.filter(c =>
    overlaps(dsToks, [
      c.id, c.name, c.title, c.role, c.organization, c.org,
      c.email, c.department, c.tags, c.domain, c.description,
    ].join(' '))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(dsToks, [
      t.id, t.name, t.title, t.type, t.category,
      t.description, t.tags, t.topic, t.domain, t.subject,
    ].join(' '))
  );
  const hasContact = matchedContacts.length > 0;
  const hasTask    = matchedTasks.length > 0;
  const cls = hasContact && hasTask ? 'OWNED'
            : hasTask               ? 'ACTIVE'
            : hasContact            ? 'STAFFED'
            : 'ORPHAN';
  return {
    cls,
    matchedContacts: matchedContacts.slice(0, 4),
    matchedTasks:    matchedTasks.slice(0, 4),
  };
}

export function isDctownQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('dctown') ||
    s.includes('dataset ownership') ||
    s.includes('dataset owner') ||
    s.includes('orphan datasets') ||
    s.includes('dataset contact task') ||
    s.includes('data ownership') ||
    s.includes('unowned datasets') ||
    s.includes('dataset staffing')
  );
}

export default function DatasetContactTaskOwnership() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dsRes, ctRes, tkRes] = await Promise.all([
        fetch(`${API}/v1/datasets`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/entities/Contact`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/entities/Task`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [dsRaw, ctRaw, tkRaw] = await Promise.all([
        dsRes.ok ? dsRes.json() : {},
        ctRes.ok ? ctRes.json() : {},
        tkRes.ok ? tkRes.json() : {},
      ]);

      const datasets  = normalizeArray(dsRaw, ['datasets', 'items', 'data', 'results', 'entities']);
      const contacts  = normalizeArray(ctRaw, ['contacts', 'items', 'data', 'results', 'entities']);
      const tasks     = normalizeArray(tkRaw, ['tasks', 'items', 'data', 'results', 'entities']);

      const classified = datasets.map(ds => {
        const label = [
          ds.id, ds.name, ds.title, ds.type, ds.category,
          ds.description, ds.tags, ds.domain, ds.subject, ds.source,
        ].join(' ');
        const toks = tokens(label);
        const { cls, matchedContacts, matchedTasks } = classify(toks, contacts, tasks);
        return { ...ds, cls, matchedContacts, matchedTasks, _label: label };
      });

      setRows(classified);
    } catch (_) {
      /* network error — leave existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:dctown-toggle', handler);
    return () => window.removeEventListener('jarvis:dctown-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setAssessment('');
    const orphanCount = rows.filter(r => r.cls === 'ORPHAN').length;
    const ownedCount  = rows.filter(r => r.cls === 'OWNED').length;
    const prompt = `Jarvis, I have ${rows.length} datasets. ${orphanCount} are ORPHAN (no known owner and no active task — data blind spots). ${ownedCount} are OWNED (contact assigned and operationally tasked). Provide a 2-sentence operational advisory on assigning ownership to orphan datasets and ensuring all active datasets are tied to operational tasks.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.message || data.answer || data.content || '';
      setAssessment(text);
      if (text) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice: 'ash' }),
          });
        } catch (_) { /* TTS is best-effort */ }
      }
    } catch (_) { /* assessment failed */ } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    total:   rows.length,
    owned:   rows.filter(r => r.cls === 'OWNED').length,
    active:  rows.filter(r => r.cls === 'ACTIVE').length,
    staffed: rows.filter(r => r.cls === 'STAFFED').length,
    orphan:  rows.filter(r => r.cls === 'ORPHAN').length,
  };

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || (r._label || '').toLowerCase().includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 85320, zIndex: 163,
          background: 'rgba(251,191,36,0.08)', border: '1px solid #FBBF2444',
          color: '#FBBF24', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="Dataset × Contact × Task Operational Data Ownership"
      >◈ DCTOWN</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 163,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FBBF2433',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(251,191,36,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FBBF2422',
          background: 'rgba(251,191,36,0.04)',
        }}>
          <span style={{ color: '#FBBF24', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ DCTOWN — DATASET OWNERSHIP MAP
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FBBF2477', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FBBF2466', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',   counts.total,   '#888',    false],
            ['OWNED',   counts.owned,   '#00FF88', false],
            ['ACTIVE',  counts.active,  '#38BDF8', false],
            ['STAFFED', counts.staffed, '#A78BFA', false],
            ['ORPHAN',  counts.orphan,  '#FBBF24', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${
                color === '#00FF88' ? '0,255,136'
                : color === '#38BDF8' ? '56,189,248'
                : color === '#A78BFA' ? '167,139,250'
                : color === '#FBBF24' ? '251,191,36'
                : '136,136,136'
              },0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'dctown-pulse 1.8s ease-in-out infinite' : 'none',
              }}>{val}</span>
              <span style={{ fontSize: 8, color: `${color}99`, letterSpacing: 1 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(251,191,36,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FBBF24' : '#FBBF2433'}`,
                color: tab === t ? '#FBBF24' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(251,191,36,0.04)',
              border: '1px solid #FBBF2433', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No datasets loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((ds, idx) => {
            const id = ds.id || ds.name || ds.title || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[ds.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4,
                background: `rgba(${
                  color === '#00FF88' ? '0,255,136'
                  : color === '#38BDF8' ? '56,189,248'
                  : color === '#A78BFA' ? '167,139,250'
                  : '251,191,36'
                },0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 70 }}>{ds.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {ds.name || ds.title || ds.id || id}
                  </span>
                  {(ds.row_count || ds.rows) && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{(ds.row_count || ds.rows).toLocaleString()} rows</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {ds.type && (
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 6 }}>
                        type: <span style={{ color: '#aaa' }}>{ds.type}</span>
                      </div>
                    )}
                    {/* Matched Contacts */}
                    {ds.matchedContacts.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED CONTACTS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ds.matchedContacts.map((c, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {c.name || c.title || c.id}
                              {(c.role || c.organization || c.org) && (
                                <span style={{ color: '#A78BFA77', marginLeft: 4 }}>
                                  {c.role || c.organization || c.org}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Tasks */}
                    {ds.matchedTasks.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED TASKS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ds.matchedTasks.map((t, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {t.name || t.title || t.id}
                              {t.status && (
                                <span style={{ color: '#38BDF877', marginLeft: 4 }}>{t.status}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {ds.matchedContacts.length === 0 && ds.matchedTasks.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FBBF2466' }}>No matching contacts or tasks found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FBBF2411' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(251,191,36,0.05)' : 'rgba(251,191,36,0.10)',
              border: '1px solid #FBBF2455', color: '#FBBF24',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS OWNERSHIP MAP'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(251,191,36,0.03)',
              border: '1px solid #FBBF2422', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 85320, zIndex: 163,
          background: 'rgba(251,191,36,0.15)', border: '1px solid #FBBF24',
          color: '#FBBF24', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ DCTOWN ✕</button>

      <style>{`
        @keyframes dctown-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
