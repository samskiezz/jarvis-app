import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_GROUNDED', 'KB_ONLY', 'DATA_ONLY', 'DARK'];

const CLASS_COLOR = {
  FULLY_GROUNDED: '#22c55e',
  KB_ONLY:        '#ffd700',
  DATA_ONLY:      '#00bfff',
  DARK:           '#ff4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

export default function ContactKnowledgeDatasetMap() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [ctRes, kbRes, dsRes] = await Promise.all([
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/v1/datasets`),
      ]);
      const ctData = ctRes.ok ? await ctRes.json() : {};
      const kbData = kbRes.ok ? await kbRes.json() : {};
      const dsData = dsRes.ok ? await dsRes.json() : {};

      const contacts  = ctData.items    || ctData.data     || ctData.contacts  || [];
      const articles  = kbData.articles || kbData.items    || kbData.data      || [];
      const datasets  = dsData.datasets || dsData.items    || dsData.data      || [];

      const kbBlobs = articles.map(a => ({
        id:    a.id || a.article_id,
        title: a.title || a.name || '',
        topic: a.topic || a.category || '',
        text:  [a.title, a.name, a.topic, a.summary, a.category, a.content,
                ...(a.tags || [])].filter(Boolean).join(' '),
      }));

      const dsBlobs = datasets.map(d => ({
        id:       d.id || d.dataset_id,
        name:     d.name || d.title || '',
        category: d.category || d.type || '',
        text:     [d.name, d.title, d.description, d.category, d.type,
                   ...(d.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = contacts.map(contact => {
        const cToks = [
          contact.name, contact.role, contact.organization, contact.org,
          contact.email, contact.bio, contact.notes,
          ...(contact.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedKb = kbBlobs.filter(a => overlaps(cToks, a.text)).slice(0, 4);
        const matchedDs = dsBlobs.filter(d => overlaps(cToks, d.text)).slice(0, 4);

        const hasKb = matchedKb.length > 0;
        const hasDs = matchedDs.length > 0;

        let cls;
        if (hasKb && hasDs) cls = 'FULLY_GROUNDED';
        else if (hasKb)     cls = 'KB_ONLY';
        else if (hasDs)     cls = 'DATA_ONLY';
        else                cls = 'DARK';

        return { ...contact, _class: cls, _kb: matchedKb, _ds: matchedDs };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:ckdm-toggle', handler);
    return () => window.removeEventListener('jarvis:ckdm-toggle', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const counts = {
    ALL:            rows.length,
    FULLY_GROUNDED: rows.filter(r => r._class === 'FULLY_GROUNDED').length,
    KB_ONLY:        rows.filter(r => r._class === 'KB_ONLY').length,
    DATA_ONLY:      rows.filter(r => r._class === 'DATA_ONLY').length,
    DARK:           rows.filter(r => r._class === 'DARK').length,
  };

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.name, r.role, r.organization, r.org, r.email]
      .filter(Boolean).some(v => v.toLowerCase().includes(q));
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.FULLY_GROUNDED} contacts fully grounded (KB+dataset match), ${counts.KB_ONLY} KB-only, ${counts.DATA_ONLY} data-only, ${counts.DARK} dark (no KB or dataset coverage).`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Contact × Knowledge × Dataset Intelligence Map (CKDM): ${summary} Provide a 2-sentence brief on which dark contacts represent the highest intelligence gap and what enrichment actions are recommended.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8520, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #22c55e',
          color: '#22c55e', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ CKDM
        {counts.DARK > 0 && (
          <span style={{
            background: '#ff4444', color: '#fff', borderRadius: 10,
            padding: '1px 6px', fontSize: 10, fontWeight: 700,
          }}>
            {counts.DARK}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.93)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #002200',
        background: 'rgba(0,5,0,0.9)',
      }}>
        <div>
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 16 }}>◈ CKDM</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Contact × Knowledge × Dataset Intelligence Map
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e',
              color: '#22c55e', padding: '4px 12px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 11,
            }}
          >
            ⟳
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: '1px solid #333',
              color: '#888', padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
        {[
          ['FULLY_GROUNDED', counts.FULLY_GROUNDED],
          ['KB_ONLY',        counts.KB_ONLY],
          ['DATA_ONLY',      counts.DATA_ONLY],
          ['DARK',           counts.DARK],
        ].map(([k, v]) => (
          <div
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${CLASS_COLOR[k]}44`,
              borderLeft: `3px solid ${CLASS_COLOR[k]}`,
              borderRadius: 6, padding: '8px 16px', minWidth: 160, cursor: 'pointer',
            }}
          >
            <div style={{ color: CLASS_COLOR[k], fontSize: 22, fontWeight: 700 }}>{v}</div>
            <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>{k.replace(/_/g, ' ')}</div>
          </div>
        ))}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid #333',
          borderRadius: 6, padding: '8px 16px', minWidth: 120,
        }}>
          <div style={{ color: '#e0e0e0', fontSize: 22, fontWeight: 700 }}>{counts.ALL}</div>
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL CONTACTS</div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(34,197,94,0.05)',
          border: '1px solid #22c55e44', borderRadius: 6, padding: '8px 12px',
          color: '#86efac', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,197,94,0.2)' : 'transparent',
            border: `1px solid ${tab === t ? '#22c55e' : '#333'}`,
            color: tab === t ? '#22c55e' : '#666',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            {t} ({counts[t] ?? 0})
          </button>
        ))}
        <input
          placeholder="Search contacts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333', borderRadius: 4, color: '#e0e0e0',
            padding: '4px 10px', fontSize: 11, width: 220,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {loading && <div style={{ color: '#555', fontSize: 12, padding: 16 }}>⟳ Loading…</div>}
        {err && <div style={{ color: '#ff4444', fontSize: 12, padding: 16 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', fontSize: 12, padding: 16 }}>No contacts match.</div>
        )}
        {!loading && filtered.map((contact, i) => {
          const cid = contact.id || contact.contact_id || i;
          const isExp = expanded === cid;
          const col = CLASS_COLOR[contact._class] || '#888';
          return (
            <div
              key={cid}
              onClick={() => setExpanded(isExp ? null : cid)}
              style={{ borderBottom: '1px solid #1a1a1a', padding: '8px 0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, minWidth: 150, fontWeight: 600 }}>
                  {contact._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {contact.name || `Contact ${cid}`}
                </span>
                {contact.role && (
                  <span style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid #333',
                    borderRadius: 3, padding: '1px 6px', fontSize: 10, color: '#888',
                  }}>
                    {contact.role}
                  </span>
                )}
                {contact.organization || contact.org ? (
                  <span style={{ color: '#555', fontSize: 10 }}>
                    {contact.organization || contact.org}
                  </span>
                ) : null}
                <span style={{ color: '#333', fontSize: 10 }}>▾</span>
              </div>

              {isExp && (
                <div style={{
                  marginTop: 6, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4, fontSize: 11,
                }}>
                  {contact.email && (
                    <div style={{ color: '#666', marginBottom: 6 }}>{contact.email}</div>
                  )}
                  {contact.bio || contact.notes ? (
                    <div style={{ color: '#888', marginBottom: 8 }}>
                      {contact.bio || contact.notes}
                    </div>
                  ) : null}

                  {/* KB matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#ffd700', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      KNOWLEDGE ARTICLES ({contact._kb.length})
                    </div>
                    {contact._kb.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No KB articles matched.</div>
                      : contact._kb.map((a, ai) => (
                        <div key={ai} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {a.topic && (
                            <span style={{
                              background: '#ffd70022', border: '1px solid #ffd700',
                              color: '#ffd700', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {a.topic}
                            </span>
                          )}
                          <span style={{ color: '#ffd700', fontSize: 10, flex: 1 }}>{a.title || a.id}</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* Dataset matches */}
                  <div>
                    <div style={{ color: '#00bfff', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      DATASETS ({contact._ds.length})
                    </div>
                    {contact._ds.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No datasets matched.</div>
                      : contact._ds.map((d, di) => (
                        <div key={di} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {d.category && (
                            <span style={{
                              background: '#00bfff22', border: '1px solid #00bfff',
                              color: '#00bfff', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {d.category}
                            </span>
                          )}
                          <span style={{ color: '#00bfff', fontSize: 10, flex: 1 }}>{d.name || d.id}</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: '6px 20px', borderTop: '1px solid #1a1a1a',
        color: '#444', fontSize: 10, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>CKDM — auto-refresh 90s · /entities/Contact · /knowledge/ · /v1/datasets</span>
        <span>{filtered.length} of {rows.length} shown</span>
      </div>
    </div>
  );
}

export function isCkdmQuery(q) {
  const lower = q.toLowerCase();
  return [
    'ckdm', 'contact knowledge dataset', 'contact dataset knowledge',
    'grounded contacts', 'dark contacts knowledge', 'contact kb dataset',
    'contact data knowledge', 'which contacts have data', 'contact intelligence map',
    'contact knowledge map', 'contact dataset coverage', 'contact grounding',
    'knowledge contact dataset', 'contact coverage map',
  ].some(kw => lower.includes(kw));
}

export function buildCkdmScript() {
  return 'Opening Contact × Knowledge × Dataset Intelligence Map…';
}
