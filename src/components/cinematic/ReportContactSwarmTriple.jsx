import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RCSJ_RE = /\b(rcsj|report\s+contact\s+swarm|contact\s+swarm\s+report|swarm\s+report\s+contact|report\s+personnel\s+swarm|personnel\s+swarm\s+report|swarm\s+personnel\s+report|report\s+contact\s+automation|contact\s+automation\s+report|report\s+swarm\s+contact|dark\s+report\s+swarm|swarm\s+backed\s+report|contact\s+backed\s+report|fully\s+supported\s+report)\b/i;

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.reports) ? data.reports
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    title: r.title || r.name || r.subject || 'Untitled Report',
    type: r.type || r.kind || r.category || '',
    summary: r.summary || r.description || r.abstract || r.body || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    category: r.category || r.sector || '',
    raw: r,
  }));
}

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.contacts) ? data.contacts
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: c.name || c.full_name || c.label || 'Unnamed Contact',
    email: c.email || '',
    company: c.company || c.organisation || c.organization || '',
    title: c.title || c.role || c.position || '',
    description: c.description || c.bio || c.summary || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.jobs) ? data.jobs
    : Array.isArray(data.swarm_jobs) ? data.swarm_jobs
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(j => ({
    id: j.id || j._id || String(Math.random()),
    name: j.name || j.title || j.label || 'Unnamed Job',
    type: j.type || j.kind || j.category || '',
    status: j.status || j.state || '',
    description: j.description || j.objective || j.summary || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || ''),
    raw: j,
  }));
}

function correlate(reports, contacts, swarmJobs) {
  return reports.map(report => {
    const toks = tok([
      report.title, report.type, report.summary, report.tags, report.category,
    ].join(' '));

    const matchedContacts = contacts
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.company),
          matchScore(toks, c.title),
          matchScore(toks, c.description),
          matchScore(toks, c.tags),
        );
        return { ...c, score };
      })
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedSwarm = swarmJobs
      .map(j => {
        const score = Math.max(
          matchScore(toks, j.name),
          matchScore(toks, j.type),
          matchScore(toks, j.description),
          matchScore(toks, j.tags),
        );
        return { ...j, score };
      })
      .filter(j => j.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasContact = matchedContacts.length > 0;
    const hasSwarm = matchedSwarm.length > 0;

    let state;
    if (hasContact && hasSwarm) state = 'FULLY SUPPORTED';
    else if (hasContact) state = 'CONTACT-BACKED';
    else if (hasSwarm) state = 'SWARM-BACKED';
    else state = 'DARK';

    return { report, matchedContacts, matchedSwarm, state };
  });
}

export function isRcsjQuery(t) {
  return RCSJ_RE.test(t || '');
}

export async function buildRcsjScript() {
  try {
    const [repRes, conRes, swRes] = await Promise.allSettled([
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : null),
    ]);

    const reports = normaliseReports(repRes.status === 'fulfilled' ? repRes.value : null);
    const contacts = normaliseContacts(conRes.status === 'fulfilled' ? conRes.value : null);
    const swarmJobs = normaliseSwarmJobs(swRes.status === 'fulfilled' ? swRes.value : null);
    const rows = correlate(reports, contacts, swarmJobs);

    const fully = rows.filter(r => r.state === 'FULLY SUPPORTED').length;
    const contactBacked = rows.filter(r => r.state === 'CONTACT-BACKED').length;
    const swarmBacked = rows.filter(r => r.state === 'SWARM-BACKED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;

    return `RCSJ Report×Contact×SwarmJob: ${reports.length} reports correlated against ${contacts.length} contacts and ${swarmJobs.length} swarm jobs. ` +
      `${fully} FULLY SUPPORTED (contact+swarm), ${contactBacked} CONTACT-BACKED (personnel only), ` +
      `${swarmBacked} SWARM-BACKED (automation only), ${dark} DARK (no personnel or swarm coverage). ` +
      (dark > 0
        ? `${dark} reports have neither contact personnel nor swarm job coverage — intelligence blind spots requiring attention.`
        : fully > 0
        ? `${fully} reports are fully supported with both contact personnel and swarm automation backing.`
        : 'Report coverage nominal.');
  } catch {
    return 'RCSJ: data fetch failed.';
  }
}

const STATE_COLOUR = {
  'FULLY SUPPORTED': '#69f0ae',
  'CONTACT-BACKED': '#4fc3f7',
  'SWARM-BACKED': '#ce93d8',
  'DARK': '#546e7a',
};

export default function ReportContactSwarmTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:rcsj-toggle', handler);
    return () => window.removeEventListener('jarvis:rcsj-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [repRes, conRes, swRes] = await Promise.allSettled([
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const reports = normaliseReports(repRes.status === 'fulfilled' ? repRes.value : null);
      const contacts = normaliseContacts(conRes.status === 'fulfilled' ? conRes.value : null);
      const swarmJobs = normaliseSwarmJobs(swRes.status === 'fulfilled' ? swRes.value : null);

      if (!reports.length && !contacts.length && !swarmJobs.length) {
        setErr('No data from reports, Contact, or SwarmJob endpoints.');
      }

      setRows(correlate(reports, contacts, swarmJobs));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fully = rows.filter(r => r.state === 'FULLY SUPPORTED').length;
  const contactBacked = rows.filter(r => r.state === 'CONTACT-BACKED').length;
  const swarmBacked = rows.filter(r => r.state === 'SWARM-BACKED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY SUPPORTED', 'CONTACT-BACKED', 'SWARM-BACKED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.report.title.toLowerCase().includes(q) ||
        r.matchedContacts.some(c => c.name.toLowerCase().includes(q)) ||
        r.matchedSwarm.some(j => j.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    fully: (fully / total) * 100,
    contact: (contactBacked / total) * 100,
    swarm: (swarmBacked / total) * 100,
    dark: (dark / total) * 100,
  } : { fully: 0, contact: 0, swarm: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Report "${row.report.title}" [${row.report.type || ''}] coverage state: ${row.state}. ` +
      `Matched contacts: ${row.matchedContacts.map(c => c.name).join(', ') || 'none'}. ` +
      `Matched swarm jobs: ${row.matchedSwarm.map(j => j.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence report personnel and automation coverage brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 817920,
          bottom: 8,
          zIndex: 489,
          background: 'rgba(0,8,20,0.85)',
          border: `1px solid ${dark > 0 ? '#546e7a80' : '#1a3050'}`,
          color: dark > 0 ? '#90a4ae' : '#2a6090',
          padding: '3px 7px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >
        ◈ RCSJ{dark > 0 ? ` [${dark}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      left: 20,
      top: 60,
      width: 660,
      maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(0,8,20,0.97)',
      border: '1px solid #1a3050',
      borderRadius: 8,
      zIndex: 9900,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1a3050',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ color: '#69f0ae', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ RCSJ</span>
        <span style={{ color: '#4a6fa0', fontSize: 10, flex: 1 }}>Report × Contact × SwarmJob Triple Coverage</span>
        {loading && <span style={{ color: '#00e5ff', fontSize: 9 }}>LOADING…</span>}
        {lastRefresh && !loading && (
          <span style={{ color: '#2a4060', fontSize: 9 }}>{lastRefresh.toLocaleTimeString()}</span>
        )}
        <button
          onClick={load}
          disabled={loading}
          style={{ background: 'none', border: '1px solid #1a3050', color: '#2a6090', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 9 }}
        >↺</button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#2a4060', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
        >✕</button>
      </div>

      {err && (
        <div style={{ padding: '6px 14px', background: '#f4433612', color: '#f44336', fontSize: 10 }}>{err}</div>
      )}

      {/* Stat tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        padding: '8px 14px',
        borderBottom: '1px solid #1a3050',
        flexShrink: 0,
      }}>
        {[
          { label: 'REPORTS', val: rows.length, col: '#4fc3f7' },
          { label: 'CONTACTS', val: rows.reduce((a, r) => a + r.matchedContacts.length, 0), col: '#4fc3f7' },
          { label: 'SWARM', val: rows.reduce((a, r) => a + r.matchedSwarm.length, 0), col: '#ce93d8' },
          { label: 'FULL-SUP', val: fully, col: '#69f0ae' },
          { label: 'CONT-BACK', val: contactBacked, col: '#4fc3f7' },
          { label: 'SWM-BACK', val: swarmBacked, col: '#ce93d8' },
          { label: 'DARK', val: dark, col: dark > 0 ? '#90a4ae' : '#546e7a' },
        ].map(t => (
          <div key={t.label} style={{ textAlign: 'center' }}>
            <div style={{ color: t.col, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#2a4060', fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ height: 4, display: 'flex', flexShrink: 0, margin: '0 14px 8px' }}>
        <div style={{ width: `${cbw.fully}%`, background: '#69f0ae', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.contact}%`, background: '#4fc3f7', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.swarm}%`, background: '#ce93d8', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.dark}%`, background: '#546e7a80', transition: 'width 0.4s' }} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: '0 14px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? `${STATE_COLOUR[tab] || '#00e5ff'}22` : 'none',
              border: `1px solid ${filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#1a3050'}`,
              color: filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#2a6090',
              padding: '2px 7px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 9,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,20,40,0.6)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 7px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            width: 110,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', fontSize: 11, padding: '20px 14px', textAlign: 'center' }}>
            No reports match current filter.
          </div>
        )}
        {visible.map(row => (
          <div
            key={row.report.id}
            style={{
              borderBottom: '1px solid #0d1e30',
              background: expanded === row.report.id ? 'rgba(0,20,40,0.4)' : 'transparent',
            }}
          >
            <div
              onClick={() => setExpanded(expanded === row.report.id ? null : row.report.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer' }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 110,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.report.title}
              </span>
              {row.report.type && (
                <span style={{ color: '#4a6fa0', fontSize: 9, background: '#4fc3f722', borderRadius: 2, padding: '0 4px' }}>
                  {row.report.type}
                </span>
              )}
              <span style={{ color: '#4fc3f7', fontSize: 9 }}>{row.matchedContacts.length}C</span>
              <span style={{ color: '#ce93d8', fontSize: 9 }}>{row.matchedSwarm.length}S</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(105,240,174,0.12)',
                  border: '1px solid #69f0ae55',
                  color: '#69f0ae',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.report.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.report.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Contacts */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#4fc3f7', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    CONTACTS ({row.matchedContacts.length})
                  </div>
                  {row.matchedContacts.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No contact match — personnel gap</div>
                  ) : row.matchedContacts.slice(0, 5).map(c => (
                    <div key={c.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{c.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.title && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#4fc3f722', borderRadius: 2, padding: '0 3px' }}>
                            {c.title}
                          </span>
                        )}
                        {c.company && (
                          <span style={{ color: '#4a6fa0', fontSize: 9 }}>{c.company}</span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(c.score * 100)}%`, background: '#4fc3f7', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Swarm Jobs */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#ce93d8', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    SWARM JOBS ({row.matchedSwarm.length})
                  </div>
                  {row.matchedSwarm.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No swarm match — automation gap</div>
                  ) : row.matchedSwarm.slice(0, 5).map(j => (
                    <div key={j.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{j.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {j.type && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#ce93d822', borderRadius: 2, padding: '0 3px' }}>
                            {j.type}
                          </span>
                        )}
                        {j.status && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#69f0ae11', borderRadius: 2, padding: '0 3px' }}>
                            {j.status}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(j.score * 100)}%`, background: '#ce93d8', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Report footer */}
                {row.report.category && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#4a6fa0', fontSize: 9 }}>CATEGORY: <span style={{ color: '#6a8faf' }}>{row.report.category}</span></span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
