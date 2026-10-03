import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJCKTRI_RE = /\b(sjcktri|swarm\s+job\s+contact\s+know\w*|swarm\s+contact\s+kb|swarm\s+job\s+kb|blind\s+swarm\s+job|staffed\s+swarm|swarm\s+know\w*\s+contact|swarm\s+contact\s+know\w*|swarm\s+job\s+fully\s+mapped|swarm\s+personnel\s+know\w*|swarm\s+kb\s+contact)\b/i;

export function isSjcktriQuery(t) { return SJCKTRI_RE.test(t || ''); }

export async function buildSjcktriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [swjR, conR, kbR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
  ]);
  const swjRaw = swjR.value ?? {};
  const jobs = Array.isArray(swjRaw) ? swjRaw : (swjRaw.jobs ?? swjRaw.data ?? swjRaw.results ?? []);
  const conRaw = conR.value ?? {};
  const contacts = Array.isArray(conRaw) ? conRaw : (conRaw.contacts ?? conRaw.data ?? conRaw.results ?? []);
  const kbRaw = kbR.value ?? {};
  const articles = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);

  const conText = contacts.map(c =>
    `${c.name ?? c.full_name ?? c.id ?? ''} ${c.email ?? ''} ${c.company ?? ''} ${c.title ?? ''} ${c.role ?? ''}`.toLowerCase()
  ).join(' ');
  const kbText = articles.map(a =>
    `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? ''} ${a.category ?? ''} ${a.tags ?? ''}`.toLowerCase()
  ).join(' ');

  let fully = 0, staffed = 0, kbBacked = 0, blind = 0;
  for (const job of jobs) {
    const name = `${job.name ?? job.title ?? job.id ?? ''} ${job.description ?? ''} ${job.type ?? ''} ${job.objective ?? ''}`.toLowerCase();
    const tokens = name.split(/\W+/).filter(t => t.length > 2);
    const hasCon = tokens.some(tok => conText.includes(tok));
    const hasKb = tokens.some(tok => kbText.includes(tok));
    if (hasCon && hasKb) fully++;
    else if (hasCon) staffed++;
    else if (hasKb) kbBacked++;
    else blind++;
  }
  return `SJCKTRI SwarmJob × Contact × Knowledge: ${jobs.length} swarm jobs assessed against ` +
    `${contacts.length} contacts and ${articles.length} KB articles. ` +
    `FULLY MAPPED: ${fully} (contact + KB backing — staffed and documented). STAFFED: ${staffed} (contact found, no KB — personnel linked but undocumented). ` +
    `KB-BACKED: ${kbBacked} (KB article found, no contact — documented but unstaffed). BLIND: ${blind} (no contact or knowledge coverage — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY MAPPED': '#4ade80',
  STAFFED: '#22d3ee',
  'KB-BACKED': '#818cf8',
  BLIND: '#ef4444',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreContacts(job, contacts) {
  const name = `${job.name ?? job.title ?? job.id ?? ''} ${job.description ?? ''} ${job.type ?? ''} ${job.objective ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const matched = [];
  for (const c of contacts) {
    const cText = `${c.name ?? c.full_name ?? c.id ?? ''} ${c.email ?? ''} ${c.company ?? ''} ${c.title ?? ''} ${c.role ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => cText.includes(tok));
    if (hits.length > 0) matched.push({ item: c, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreArticles(job, articles) {
  const name = `${job.name ?? job.title ?? job.id ?? ''} ${job.description ?? ''} ${job.type ?? ''} ${job.objective ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const matched = [];
  for (const a of articles) {
    const aText = `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? ''} ${a.category ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => aText.includes(tok));
    if (hits.length > 0) matched.push({ item: a, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(job, contacts, articles) {
  const name = `${job.name ?? job.title ?? job.id ?? ''} ${job.description ?? ''} ${job.type ?? ''} ${job.objective ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const conText = contacts.map(c => `${c.name ?? c.full_name ?? c.id ?? ''} ${c.email ?? ''} ${c.company ?? ''} ${c.title ?? ''}`.toLowerCase()).join(' ');
  const kbText = articles.map(a => `${a.title ?? a.name ?? a.id ?? ''} ${a.content ?? a.summary ?? ''} ${a.category ?? ''}`.toLowerCase()).join(' ');
  const hasCon = tokens.some(tok => conText.includes(tok));
  const hasKb = tokens.some(tok => kbText.includes(tok));
  if (hasCon && hasKb) return 'FULLY MAPPED';
  if (hasCon) return 'STAFFED';
  if (hasKb) return 'KB-BACKED';
  return 'BLIND';
}

export default function SwarmJobContactKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [articles, setArticles] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [swjR, conR, kbR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.json()),
      ]);
      const swjRaw = swjR.value ?? {};
      const jbs = Array.isArray(swjRaw) ? swjRaw : (swjRaw.jobs ?? swjRaw.data ?? swjRaw.results ?? []);
      const conRaw = conR.value ?? {};
      const cons = Array.isArray(conRaw) ? conRaw : (conRaw.contacts ?? conRaw.data ?? conRaw.results ?? []);
      const kbRaw = kbR.value ?? {};
      const arts = Array.isArray(kbRaw) ? kbRaw : (kbRaw.articles ?? kbRaw.items ?? kbRaw.data ?? kbRaw.results ?? []);
      setJobs(jbs);
      setContacts(cons);
      setArticles(arts);
      setRows(jbs.map(j => ({
        j,
        state: correlate(j, cons, arts),
        leftMatched: scoreContacts(j, cons),
        rightMatched: scoreArticles(j, arts),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjcktri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:sjcktri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCount = rows.filter(r => r.state === 'FULLY MAPPED').length;
  const staffedCount = rows.filter(r => r.state === 'STAFFED').length;
  const kbBackedCount = rows.filter(r => r.state === 'KB-BACKED').length;
  const blindCount = rows.filter(r => r.state === 'BLIND').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.j.name ?? r.j.title ?? r.j.id ?? ''} ${r.j.type ?? ''} ${r.j.objective ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.j.name ?? row.j.title ?? row.j.id ?? 'swarm job';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const conNames = row.leftMatched.slice(0, 2).map(m => m.item.name ?? m.item.full_name ?? m.item.id ?? '?').join(', ');
      const kbTitles = row.rightMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY MAPPED'
        ? `has both contact backing (${conNames || 'found'}) and KB article coverage (${kbTitles || 'found'})`
        : row.state === 'STAFFED'
          ? `has contact assignment (${conNames || 'found'}) but no KB article coverage`
          : row.state === 'KB-BACKED'
            ? `has KB article support (${kbTitles || 'found'}) but no assigned contact`
            : 'has NO contact or knowledge coverage — intelligence gap';
      const prompt = `Swarm job "${id}" ${stateDesc}. In exactly 2 sentences, assess the operational coverage completeness for this swarm job.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 788800, bottom: 8, zIndex: 437,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#4ade80', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ SJCKTRI — SWARM JOB × CONTACT × KNOWLEDGE</span>
        {blindCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{blindCount} BLIND</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Swarm Jobs', val: jobs.length },
          { label: 'Fully Mapped', val: fullyCount, color: '#4ade80' },
          { label: 'Staffed', val: staffedCount, color: '#22d3ee' },
          { label: 'KB-Backed', val: kbBackedCount, color: '#818cf8' },
          { label: 'Blind', val: blindCount, color: '#ef4444' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyCount / rows.length) * 100)}%`, background: '#4ade80', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((staffedCount / rows.length) * 100)}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((kbBackedCount / rows.length) * 100)}%`, background: '#818cf8', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCount / rows.length) * 100) : 0}% fully mapped · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY MAPPED', 'STAFFED', 'KB-BACKED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'BLIND' ? '#fff' : '#000') : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no swarm jobs match</div>
        )}
        {visible.map((row, i) => {
          const id = row.j.name ?? row.j.title ?? row.j.id ?? `job-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.j.type && (
                  <span style={{ fontSize: 10, color: '#22d3ee', background: 'rgba(34,211,238,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.j.type}</span>
                )}
                {row.j.status && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.j.status}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4, color: '#4ade80', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: Contacts */}
                    <div>
                      <div style={{ fontSize: 10, color: '#22d3ee', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>CONTACTS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no contact matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.full_name ?? m.item.id ?? `contact-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#67e8f9' }}>{n}</span>
                              {m.item.role && (
                                <span style={{ fontSize: 9, color: '#22d3ee', background: 'rgba(34,211,238,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.role}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#22d3ee', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#22d3ee', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: KB Articles */}
                    <div>
                      <div style={{ fontSize: 10, color: '#818cf8', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>KB ARTICLES ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no KB article matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `article-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#c4b5fd' }}>{n}</span>
                              {m.item.category && (
                                <span style={{ fontSize: 9, color: '#818cf8', background: 'rgba(129,140,248,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#818cf8', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
