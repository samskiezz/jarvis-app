import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_SUPPORTED', 'SKILL_ONLY', 'KB_ONLY', 'DARK'];

const CLASS_COLOR = {
  FULLY_SUPPORTED: '#22c55e',
  SKILL_ONLY:      '#00bfff',
  KB_ONLY:         '#ffd700',
  DARK:            '#ff4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

export default function AlertAipKnowledgeNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [alRes, skRes, kbRes] = await Promise.all([
        fetch(`${API}/v1/alerts?status=open&limit=100`),
        fetch(`${API}/v1/aip/skill`),
        fetch(`${API}/knowledge/`),
      ]);
      const alData = alRes.ok ? await alRes.json() : {};
      const skData = skRes.ok ? await skRes.json() : {};
      const kbData = kbRes.ok ? await kbRes.json() : {};

      const alerts  = alData.alerts  || alData.items || alData.data || [];
      const skills  = skData.skills  || skData.items || skData.data || [];
      const articles = kbData.articles || kbData.items || kbData.data || [];

      const skillBlobs = skills.map(s => ({
        id:       s.id || s.skill_id,
        name:     s.name || s.title || '',
        category: s.category || s.type || '',
        text:     [s.name, s.title, s.description, s.category, s.type,
                   ...(s.tags || [])].filter(Boolean).join(' '),
      }));

      const kbBlobs = articles.map(a => ({
        id:    a.id || a.article_id,
        title: a.title || a.name || '',
        topic: a.topic || a.category || '',
        text:  [a.title, a.name, a.topic, a.summary, a.category, a.content,
                ...(a.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = alerts.map(alert => {
        const aToks = [
          alert.type, alert.category, alert.message, alert.title,
          alert.source, alert.description, alert.severity,
          ...(alert.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedSkills = skillBlobs.filter(s => overlaps(aToks, s.text)).slice(0, 5);
        const matchedKb     = kbBlobs.filter(a => overlaps(aToks, a.text)).slice(0, 5);

        const hasSk = matchedSkills.length > 0;
        const hasKb = matchedKb.length > 0;

        let cls;
        if (hasSk && hasKb) cls = 'FULLY_SUPPORTED';
        else if (hasSk)     cls = 'SKILL_ONLY';
        else if (hasKb)     cls = 'KB_ONLY';
        else                cls = 'DARK';

        return { ...alert, _class: cls, _skills: matchedSkills, _kb: matchedKb };
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
    window.addEventListener('jarvis:aakn-toggle', handler);
    return () => window.removeEventListener('jarvis:aakn-toggle', handler);
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
    ALL:             rows.length,
    FULLY_SUPPORTED: rows.filter(r => r._class === 'FULLY_SUPPORTED').length,
    SKILL_ONLY:      rows.filter(r => r._class === 'SKILL_ONLY').length,
    KB_ONLY:         rows.filter(r => r._class === 'KB_ONLY').length,
    DARK:            rows.filter(r => r._class === 'DARK').length,
  };

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r._class !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.type, r.category, r.message, r.title, r.source, r.severity]
      .filter(Boolean).some(v => v.toLowerCase().includes(q));
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `${counts.FULLY_SUPPORTED} alerts fully supported (skill+KB), ${counts.SKILL_ONLY} skill-only, ${counts.KB_ONLY} KB-only, ${counts.DARK} dark (no skill or KB coverage).`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Alert × AIP Skill × Knowledge Nexus (AAKN): ${summary} Provide a 2-sentence brief on which dark alerts represent the highest operational risk and what skill or knowledge enrichment is recommended.`,
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

  const SEV_COLOR = { CRITICAL: '#ff4444', HIGH: '#ff8c00', MEDIUM: '#ffd700', LOW: '#22c55e', INFO: '#00bfff' };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8580, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #ff8c00',
          color: '#ff8c00', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ AAKN
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
        padding: '12px 20px', borderBottom: '1px solid #221100',
        background: 'rgba(5,2,0,0.9)',
      }}>
        <div>
          <span style={{ color: '#ff8c00', fontWeight: 700, fontSize: 16 }}>◈ AAKN</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Alert × AIP Skill × Knowledge Intelligence Nexus
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              background: 'rgba(255,140,0,0.1)', border: '1px solid #ff8c00',
              color: '#ff8c00', padding: '4px 12px', borderRadius: 4,
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
          ['FULLY_SUPPORTED', counts.FULLY_SUPPORTED],
          ['SKILL_ONLY',      counts.SKILL_ONLY],
          ['KB_ONLY',         counts.KB_ONLY],
          ['DARK',            counts.DARK],
        ].map(([k, v]) => (
          <div
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${CLASS_COLOR[k]}44`,
              borderLeft: `3px solid ${CLASS_COLOR[k]}`,
              borderRadius: 6, padding: '8px 16px', minWidth: 170, cursor: 'pointer',
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
          <div style={{ color: '#777', fontSize: 10, marginTop: 2 }}>TOTAL ALERTS</div>
        </div>
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 20px 10px', background: 'rgba(255,140,0,0.05)',
          border: '1px solid #ff8c0044', borderRadius: 6, padding: '8px 12px',
          color: '#ffd580', fontSize: 12, lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 10px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(255,140,0,0.2)' : 'transparent',
            border: `1px solid ${tab === t ? '#ff8c00' : '#333'}`,
            color: tab === t ? '#ff8c00' : '#666',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            {t} ({counts[t] ?? 0})
          </button>
        ))}
        <input
          placeholder="Search alerts…"
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
          <div style={{ color: '#555', fontSize: 12, padding: 16 }}>No alerts match.</div>
        )}
        {!loading && filtered.map((alert, i) => {
          const aid = alert.id || alert.alert_id || i;
          const isExp = expanded === aid;
          const col = CLASS_COLOR[alert._class] || '#888';
          const sevCol = SEV_COLOR[(alert.severity || '').toUpperCase()] || '#888';
          return (
            <div
              key={aid}
              onClick={() => setExpanded(isExp ? null : aid)}
              style={{ borderBottom: '1px solid #1a1a1a', padding: '8px 0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, minWidth: 150, fontWeight: 600 }}>
                  {alert._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: '#aaa', fontSize: 11, flex: 1 }}>
                  {alert.title || alert.message || `Alert ${aid}`}
                </span>
                {alert.severity && (
                  <span style={{
                    background: `${sevCol}22`, border: `1px solid ${sevCol}`,
                    color: sevCol, borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700,
                  }}>
                    {alert.severity}
                  </span>
                )}
                {alert.category && (
                  <span style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
                    borderRadius: 3, padding: '1px 6px', fontSize: 9, color: '#777',
                  }}>
                    {alert.category}
                  </span>
                )}
                <span style={{ color: '#333', fontSize: 10 }}>▾</span>
              </div>

              {isExp && (
                <div style={{
                  marginTop: 6, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 4, fontSize: 11,
                }}>
                  {alert.source && (
                    <div style={{ color: '#666', marginBottom: 6 }}>Source: {alert.source}</div>
                  )}
                  {alert.message && alert.title && alert.message !== alert.title && (
                    <div style={{ color: '#888', marginBottom: 8 }}>{alert.message}</div>
                  )}

                  {/* Skill matches */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: '#00bfff', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      AIP SKILLS ({alert._skills.length})
                    </div>
                    {alert._skills.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No skills matched.</div>
                      : alert._skills.map((s, si) => (
                        <div key={si} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '3px 0', borderBottom: '1px solid #111',
                        }}>
                          {s.category && (
                            <span style={{
                              background: '#00bfff22', border: '1px solid #00bfff',
                              color: '#00bfff', borderRadius: 3, padding: '1px 5px', fontSize: 9,
                            }}>
                              {s.category}
                            </span>
                          )}
                          <span style={{ color: '#00bfff', fontSize: 10, flex: 1 }}>{s.name || s.id}</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* KB matches */}
                  <div>
                    <div style={{ color: '#ffd700', fontWeight: 600, fontSize: 10, marginBottom: 4 }}>
                      KNOWLEDGE ARTICLES ({alert._kb.length})
                    </div>
                    {alert._kb.length === 0
                      ? <div style={{ color: '#444', fontSize: 10 }}>No KB articles matched.</div>
                      : alert._kb.map((a, ai) => (
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
        <span>AAKN — auto-refresh 90s · /v1/alerts · /v1/aip/skill · /knowledge/</span>
        <span>{filtered.length} of {rows.length} shown</span>
      </div>
    </div>
  );
}

export function isAaknQuery(q) {
  const lower = q.toLowerCase();
  return [
    'aakn', 'alert aip knowledge', 'alert skill knowledge', 'alert knowledge skill',
    'alert skill nexus', 'alert knowledge nexus', 'dark alerts skill',
    'alert support coverage', 'which alerts have skills', 'which alerts have knowledge',
    'alert intelligence nexus', 'alert kb skill', 'skill alert nexus', 'alert context skill',
    'alert coverage skill', 'unsupported alerts', 'alert with no skill',
  ].some(kw => lower.includes(kw));
}

export function buildAaknScript() {
  return 'Opening Alert × AIP Skill × Knowledge Intelligence Nexus…';
}
