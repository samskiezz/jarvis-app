import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const TABS = ['ALL', 'FULLY_COVERED', 'DUAL_LINKED', 'SINGLE_LINKED', 'UNCOVERED'];

const CLASS_COLOR = {
  FULLY_COVERED: '#22c55e',
  DUAL_LINKED:   '#00bfff',
  SINGLE_LINKED: '#ffd700',
  UNCOVERED:     '#ff4444',
};

const PULSE_STYLE = `
@keyframes cpricover-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

export default function ContactPersonnelIntelCoverage() {
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
      const [conRes, kbRes, repRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/Contact?limit=200`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/v1/reports`),
        fetch(`${API}/v1/ops/events`),
      ]);
      const conData = conRes.ok ? await conRes.json() : {};
      const kbData  = kbRes.ok  ? await kbRes.json()  : {};
      const repData = repRes.ok ? await repRes.json() : {};
      const opsData = opsRes.ok ? await opsRes.json() : {};

      const contacts = conData.contacts || conData.items || conData.data || [];
      const articles = kbData.articles  || kbData.items  || kbData.data || [];
      const reports  = repData.reports  || repData.items || repData.data || [];
      const events   = opsData.events   || opsData.items || opsData.data || [];

      const kbBlobs = articles.map(a => ({
        id:       a.id || a.article_id,
        name:     a.title || a.name || '',
        category: a.category || a.type || '',
        text:     [a.title, a.name, a.content, a.summary, a.category,
                   ...(a.tags || [])].filter(Boolean).join(' '),
      }));

      const repBlobs = reports.map(r => ({
        id:   r.id || r.report_id,
        name: r.title || r.name || '',
        type: r.type || r.report_type || '',
        text: [r.title, r.name, r.description, r.summary, r.type,
               ...(r.tags || [])].filter(Boolean).join(' '),
      }));

      const opsBlobs = events.map(e => ({
        id:       e.id || e.event_id,
        name:     e.title || e.name || e.event || '',
        severity: e.severity || e.level || '',
        text:     [e.title, e.name, e.event, e.description, e.category,
                   e.location, e.source, ...(e.tags || [])].filter(Boolean).join(' '),
      }));

      const classified = contacts.map(contact => {
        const cToks = [
          contact.name, contact.first_name, contact.last_name,
          contact.role, contact.title, contact.org, contact.organization,
          contact.email, contact.department,
          ...(contact.tags || []),
        ].filter(Boolean).flatMap(f => tokens(f));

        const matchedKb  = kbBlobs.filter(a => overlaps(cToks, a.text)).slice(0, 4);
        const matchedRep = repBlobs.filter(r => overlaps(cToks, r.text)).slice(0, 4);
        const matchedOps = opsBlobs.filter(e => overlaps(cToks, e.text)).slice(0, 4);

        const score = (matchedKb.length > 0 ? 1 : 0)
                    + (matchedRep.length > 0 ? 1 : 0)
                    + (matchedOps.length > 0 ? 1 : 0);

        let cls;
        if (score === 3)      cls = 'FULLY_COVERED';
        else if (score === 2) cls = 'DUAL_LINKED';
        else if (score === 1) cls = 'SINGLE_LINKED';
        else                  cls = 'UNCOVERED';

        return {
          id:         contact.id || contact.contact_id || Math.random(),
          name:       contact.name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '(unnamed)',
          role:       contact.role || contact.title || '',
          org:        contact.org || contact.organization || '',
          cls,
          matchedKb,
          matchedRep,
          matchedOps,
        };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:cpricover-toggle', onToggle);
    return () => window.removeEventListener('jarvis:cpricover-toggle', onToggle);
  }, []);

  const filtered = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.cls === tab;
    const matchSrc = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.role.toLowerCase().includes(search.toLowerCase()) ||
      r.org.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrc;
  });

  const stats = {
    total:        rows.length,
    fullyCovered: rows.filter(r => r.cls === 'FULLY_COVERED').length,
    dualLinked:   rows.filter(r => r.cls === 'DUAL_LINKED').length,
    singleLinked: rows.filter(r => r.cls === 'SINGLE_LINKED').length,
    uncovered:    rows.filter(r => r.cls === 'UNCOVERED').length,
  };
  const covPct = stats.total
    ? Math.round(((stats.fullyCovered + stats.dualLinked + stats.singleLinked) / stats.total) * 100)
    : 0;
  const barColor = covPct >= 70 ? '#22c55e' : covPct >= 40 ? '#ffd700' : '#ff4444';

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief('');
    try {
      const ctx = `Contacts:${stats.total} FullyCovered:${stats.fullyCovered} DualLinked:${stats.dualLinked} SingleLinked:${stats.singleLinked} Uncovered:${stats.uncovered} COVERAGE%:${covPct}`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `CPRICOVER assessment: ${ctx}. In 2 sentences, assess personnel intelligence coverage and identify the most critical gap among uncovered contacts.` }),
      });
      const d = res.ok ? await res.json() : {};
      const txt = d.response || d.message || d.reply || d.answer || 'Assessment unavailable.';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [stats, covPct]);

  if (!open) {
    return (
      <>
        <style>{PULSE_STYLE}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', left: 1116320, bottom: 8, zIndex: 709,
            background: 'rgba(0,0,0,0.7)', border: '1px solid #00bfff44',
            color: '#00bfff', padding: '4px 10px', fontSize: 11,
            borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ◈ CPRICOVER
          {stats.uncovered > 0 && (
            <span style={{
              marginLeft: 6, background: '#ff4444', color: '#fff',
              borderRadius: '50%', padding: '1px 5px', fontSize: 10,
              animation: 'cpricover-pulse 1.5s infinite',
            }}>{stats.uncovered}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <div style={{
        position: 'fixed', right: 20, top: 60, width: 560, maxHeight: '82vh',
        background: 'rgba(0,0,0,0.93)', border: '1px solid #00bfff44',
        borderRadius: 8, zIndex: 9999, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', fontFamily: 'monospace',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid #00bfff22',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#00bfff', fontSize: 12, fontWeight: 700 }}>
            ◈ CPRICOVER — Contact × Knowledge × Report × Ops Event Personnel Intel Coverage
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#ff4444',
            cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{
          display: 'flex', gap: 8, padding: '10px 16px',
          borderBottom: '1px solid #00bfff11', flexWrap: 'wrap',
        }}>
          {[
            ['CONTACTS',      stats.total,        '#00bfff'],
            ['FULLY COV.',    stats.fullyCovered,  '#22c55e'],
            ['DUAL LINKED',   stats.dualLinked,    '#00bfff'],
            ['SINGLE LINKED', stats.singleLinked,  '#ffd700'],
            ['UNCOVERED',     stats.uncovered,     '#ff4444'],
            [`COV ${covPct}%`, null,               barColor],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: `${color}18`, border: `1px solid ${color}44`,
              borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center',
            }}>
              <div style={{ color, fontSize: 10 }}>{label}</div>
              {val !== null && <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>}
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        <div style={{ padding: '4px 16px 8px', borderBottom: '1px solid #00bfff11' }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>PERSONNEL INTELLIGENCE COVERAGE</div>
          <div style={{ height: 6, background: '#222', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${covPct}%`, background: barColor, transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Assess button + brief */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid #00bfff11' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: '#00bfff22', border: '1px solid #00bfff66', color: '#00bfff',
            padding: '4px 14px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
          }}>
            {assessing ? '◌ Assessing…' : '▶ ASSESS COVERAGE'}
          </button>
          {brief && (
            <div style={{
              marginTop: 6, fontSize: 11, color: '#a0f0ff',
              background: '#00bfff11', border: '1px solid #00bfff22',
              borderRadius: 4, padding: '6px 10px',
            }}>{brief}</div>
          )}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #00bfff11', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? '#00bfff33' : 'transparent',
              border: `1px solid ${tab === t ? '#00bfff' : '#00bfff33'}`,
              color: tab === t ? '#00bfff' : '#666',
              padding: '2px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
            }}>{t}</button>
          ))}
          <input
            placeholder="search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              marginLeft: 'auto', background: '#111', border: '1px solid #00bfff33',
              color: '#ccc', padding: '2px 8px', fontSize: 10, borderRadius: 3, width: 130,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px' }}>
          {loading && <div style={{ color: '#666', fontSize: 11 }}>Loading…</div>}
          {err && <div style={{ color: '#ff4444', fontSize: 11 }}>Error: {err}</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: '#666', fontSize: 11 }}>No results.</div>
          )}
          {filtered.map(row => (
            <div
              key={row.id}
              style={{
                borderBottom: '1px solid #00bfff11', padding: '8px 0', cursor: 'pointer',
              }}
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#e0e0e0', fontSize: 12 }}>{row.name}</span>
                  {row.role && <span style={{ color: '#888', fontSize: 10, marginLeft: 6 }}>{row.role}</span>}
                  {row.org  && <span style={{ color: '#666', fontSize: 10, marginLeft: 6 }}>· {row.org}</span>}
                </div>
                <span style={{
                  background: `${CLASS_COLOR[row.cls]}22`,
                  border: `1px solid ${CLASS_COLOR[row.cls]}`,
                  color: CLASS_COLOR[row.cls], borderRadius: 4,
                  padding: '2px 8px', fontSize: 10, marginLeft: 8, whiteSpace: 'nowrap',
                }}>{row.cls}</span>
              </div>

              {expanded === row.id && (
                <div style={{ marginTop: 10 }}>
                  {/* KB matches */}
                  {row.matchedKb.length > 0 && (
                    <>
                      <div style={{ color: '#22c55e', fontSize: 11, marginBottom: 4 }}>◈ KNOWLEDGE</div>
                      {row.matchedKb.map((a, i) => (
                        <div key={i} style={{
                          background: 'rgba(34,197,94,0.08)', border: '1px solid #22c55e44',
                          borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                          display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span style={{ color: '#86efac' }}>{a.name}</span>
                          {a.category && (
                            <span style={{
                              background: '#22c55e22', border: '1px solid #22c55e44',
                              color: '#22c55e', borderRadius: 3, padding: '0 6px', fontSize: 10,
                            }}>{a.category}</span>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {/* Report matches */}
                  {row.matchedRep.length > 0 && (
                    <>
                      <div style={{ color: '#a855f7', fontSize: 11, marginBottom: 4, marginTop: 6 }}>◈ REPORTS</div>
                      {row.matchedRep.map((r, i) => (
                        <div key={i} style={{
                          background: 'rgba(168,85,247,0.08)', border: '1px solid #a855f744',
                          borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                          display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span style={{ color: '#d8b4fe' }}>{r.name}</span>
                          {r.type && (
                            <span style={{
                              background: '#a855f722', border: '1px solid #a855f744',
                              color: '#a855f7', borderRadius: 3, padding: '0 6px', fontSize: 10,
                            }}>{r.type}</span>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {/* Ops Event matches */}
                  {row.matchedOps.length > 0 && (
                    <>
                      <div style={{ color: '#3b82f6', fontSize: 11, marginBottom: 4, marginTop: 6 }}>◈ OPS EVENTS</div>
                      {row.matchedOps.map((e, i) => (
                        <div key={i} style={{
                          background: 'rgba(59,130,246,0.08)', border: '1px solid #3b82f644',
                          borderRadius: 4, padding: '4px 10px', marginBottom: 4, fontSize: 11,
                          display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span style={{ color: '#93c5fd' }}>{e.name}</span>
                          {e.severity && (
                            <span style={{
                              background: '#3b82f622', border: '1px solid #3b82f644',
                              color: '#3b82f6', borderRadius: 3, padding: '0 6px', fontSize: 10,
                            }}>{e.severity}</span>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {row.matchedKb.length === 0 && row.matchedRep.length === 0 && row.matchedOps.length === 0 && (
                    <div style={{ color: '#ff4444', fontSize: 11 }}>
                      ⚠ No intelligence coverage — contact has no matching KB article, report, or ops event.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function isCpricoverQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('cpricover') ||
    s.includes('contact personnel') ||
    s.includes('personnel coverage') ||
    s.includes('uncovered contacts') ||
    s.includes('contact full coverage') ||
    s.includes('personnel intelligence coverage') ||
    s.includes('contact intel ops') ||
    s.includes('contact knowledge report') ||
    s.includes('personnel intel coverage')
  );
}

export function buildCpricoverScript() {
  return 'CPRICOVER online. Opening Contact Personnel Intelligence Coverage — correlating contacts against knowledge articles, reports, and ops events to classify personnel intel coverage.';
}
