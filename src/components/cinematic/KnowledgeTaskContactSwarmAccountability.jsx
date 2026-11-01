/**
 * KnowledgeTaskContactSwarmAccountability — F256
 *
 * Fetches /knowledge/
 *         /entities/Task
 *         /entities/Contact
 *         /entities/SwarmJob
 *
 * Keyword-matches each knowledge article against tasks, contacts,
 * and swarm jobs to classify:
 *
 *   GROUNDED — matches all 3 sources
 *   ACTIVE   — matches 2 of 3 sources
 *   STAFFED  — matches exactly 1 source
 *   DARK     — no match to any source
 *              (orphaned knowledge articles with no active task,
 *               no contact owner, no swarm job processing —
 *               intelligence dead-ends)
 *
 * Toggle: ◈ KTCSAW button (fixed, bottom strip) left:191160, zIndex:352
 * Stat tiles: articles / tasks / contacts / swarm jobs /
 *             grounded / active / staffed / dark
 * Amber pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched tasks with status badge +
 *                  matched contacts with role/org +
 *                  matched swarm jobs with status badge.
 * Filter tabs: ALL / GROUNDED / ACTIVE / STAFFED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ktcsaw"/"knowledge task contact"/"knowledge accountability"/
 *        "dark knowledge"/"orphaned articles"/"knowledge dead ends"/
 *        "knowledge swarm coverage"/"knowledge task coverage"
 * Event: jarvis:ktcsaw-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'ACTIVE', 'STAFFED', 'DARK'];

const CLS_COLOR = {
  GROUNDED: '#22C55E',
  ACTIVE:   '#F59E0B',
  STAFFED:  '#38BDF8',
  DARK:     '#F97316',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.articles))   return raw.articles;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.tasks))      return raw.tasks;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function normalizeSwarmJobs(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.jobs))       return raw.jobs;
  if (Array.isArray(raw?.swarm_jobs)) return raw.swarm_jobs;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.results))    return raw.results;
  return [];
}

function articleText(a) {
  return [a.title, a.name, a.content, a.summary, a.category, a.topic, a.tags]
    .filter(Boolean).join(' ');
}

function classifyArticle(artToks, tasks, contacts, swarmJobs) {
  const matchedTasks = tasks.filter(t => {
    const text = [t.title, t.name, t.description, t.type, t.status, t.category, t.tags].filter(Boolean).join(' ');
    return overlaps(artToks, text);
  });
  const matchedContacts = contacts.filter(c => {
    const text = [c.name, c.full_name, c.role, c.organization, c.department, c.email, c.expertise].filter(Boolean).join(' ');
    return overlaps(artToks, text);
  });
  const matchedSwarmJobs = swarmJobs.filter(j => {
    const text = [j.name, j.title, j.description, j.type, j.status, j.job_type, j.tags].filter(Boolean).join(' ');
    return overlaps(artToks, text);
  });
  const hits = (matchedTasks.length > 0 ? 1 : 0)
             + (matchedContacts.length > 0 ? 1 : 0)
             + (matchedSwarmJobs.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'GROUNDED'
            : hits === 2 ? 'ACTIVE'
            : hits === 1 ? 'STAFFED'
            : 'DARK';
  return { cls, matchedTasks, matchedContacts, matchedSwarmJobs };
}

export function isKtcsawQuery(q) {
  const s = q.toLowerCase();
  return s.includes('ktcsaw')
      || s.includes('knowledge task contact')
      || s.includes('knowledge accountability')
      || s.includes('dark knowledge')
      || s.includes('orphaned articles')
      || s.includes('knowledge dead ends')
      || s.includes('knowledge swarm coverage')
      || s.includes('knowledge task coverage');
}

export function buildKtcsawScript(rows) {
  const dark     = rows.filter(r => r.cls === 'DARK');
  const grounded = rows.filter(r => r.cls === 'GROUNDED');
  return `Knowledge × Task × Contact × SwarmJob Intelligence Activation Accountability (◈ KTCSAW):
Total knowledge articles analysed: ${rows.length}.
Grounded (all 3 sources): ${grounded.length}.
Active (2 sources): ${rows.filter(r => r.cls === 'ACTIVE').length}.
Staffed (1 source): ${rows.filter(r => r.cls === 'STAFFED').length}.
DARK (no grounding — intelligence dead-ends): ${dark.length}${dark.length ? ' — ' + dark.slice(0, 3).map(r => r.label).join(', ') : ''}.
Identify root cause for each DARK article. Propose task assignments, contact ownership, and swarm job linkages. Return findings, evidence, and next action.`;
}

export default function KnowledgeTaskContactSwarmAccountability() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [stats, setStats]           = useState({ articles: 0, tasks: 0, contacts: 0, swarmJobs: 0 });
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [kn, ta, co, sw] = await Promise.all([
        fetch(`${API}/knowledge/`,          { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Task`,       { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`,    { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/SwarmJob`,   { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const articles  = normalizeKnowledge(kn);
      const tasks     = normalizeTasks(ta);
      const contacts  = normalizeContacts(co);
      const swarmJobs = normalizeSwarmJobs(sw);

      const classified = articles.map(a => {
        const toks = tokens(articleText(a));
        const { cls, matchedTasks, matchedContacts, matchedSwarmJobs } = classifyArticle(toks, tasks, contacts, swarmJobs);
        return {
          id:              a.id || a._id || a.title || a.name,
          label:           a.title || a.name || a.id || 'Untitled',
          category:        a.category || a.topic || '',
          cls,
          matchedTasks,
          matchedContacts,
          matchedSwarmJobs,
        };
      });

      setRows(classified);
      setStats({ articles: articles.length, tasks: tasks.length, contacts: contacts.length, swarmJobs: swarmJobs.length });
    } catch (e) {
      setError(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ktcsaw-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ktcsaw-toggle', onToggle);
  }, []);

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search && !r.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    GROUNDED: rows.filter(r => r.cls === 'GROUNDED').length,
    ACTIVE:   rows.filter(r => r.cls === 'ACTIVE').length,
    STAFFED:  rows.filter(r => r.cls === 'STAFFED').length,
    DARK:     rows.filter(r => r.cls === 'DARK').length,
  };

  async function assess() {
    if (!rows.length) return;
    setAssessing(true);
    setAssessText('');
    try {
      const script = buildKtcsawScript(rows);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = (d.answer || d.response || '').trim();
      setAssessText(text);
      if (text && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(text.slice(0, 300));
        u.rate = 1.1;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {
      setAssessText('Assessment unavailable: ' + e.message);
    } finally {
      setAssessing(false);
    }
  }

  function toggleRow(id) {
    setExpanded(p => ({ ...p, [id]: !p[id] }));
  }

  const btn = {
    position: 'fixed', bottom: 8, left: 191160, zIndex: 352,
    background: 'rgba(0,0,0,0.7)', border: '1px solid #F97316',
    color: '#F97316', borderRadius: 4, padding: '3px 7px',
    fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
    display: 'flex', alignItems: 'center', gap: 4,
  };

  if (!open) {
    return (
      <button style={btn} onClick={() => setOpen(true)} title="Knowledge × Task × Contact × SwarmJob Intelligence Activation Accountability">
        ◈ KTCSAW
        {counts.DARK > 0 && (
          <span style={{
            background: '#F97316', color: '#000', borderRadius: 3,
            padding: '0 4px', fontSize: 9, fontWeight: 700,
            animation: 'pulse 1.5s infinite',
          }}>{counts.DARK}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
      width: 820, maxHeight: '80vh', overflowY: 'auto',
      background: 'rgba(0,0,0,0.92)', border: '1px solid #F97316',
      borderRadius: 8, zIndex: 352, padding: 16, fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#F97316', fontWeight: 700, fontSize: 13 }}>
          ◈ KTCSAW — Knowledge × Task × Contact × SwarmJob Intelligence Activation Accountability
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          ['Articles', stats.articles, '#9CA3AF'],
          ['Tasks', stats.tasks, '#9CA3AF'],
          ['Contacts', stats.contacts, '#9CA3AF'],
          ['Swarm Jobs', stats.swarmJobs, '#9CA3AF'],
          ['Grounded', counts.GROUNDED, '#22C55E'],
          ['Active', counts.ACTIVE, '#F59E0B'],
          ['Staffed', counts.STAFFED, '#38BDF8'],
          ['Dark', counts.DARK, '#F97316'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.05)', borderRadius: 4,
            padding: '4px 10px', fontSize: 11,
          }}>
            <div style={{ color: '#666', fontSize: 9 }}>{label}</div>
            <div style={{ color, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CLS_COLOR[t] || '#F97316' : 'rgba(255,255,255,0.07)',
            border: 'none', borderRadius: 3, color: tab === t ? '#000' : '#aaa',
            padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
          }}>{t} {t !== 'ALL' ? `(${counts[t] || 0})` : `(${rows.length})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search articles…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.07)',
            border: '1px solid #444', borderRadius: 3, color: '#ccc',
            padding: '2px 8px', fontSize: 10,
          }}
        />
      </div>

      {/* ASSESS button */}
      <button onClick={assess} disabled={assessing || !rows.length} style={{
        background: assessing ? '#444' : '#F97316', color: '#000',
        border: 'none', borderRadius: 4, padding: '4px 12px',
        fontSize: 11, fontWeight: 700, cursor: assessing ? 'not-allowed' : 'pointer',
        marginBottom: 10,
      }}>
        {assessing ? '▶ Assessing…' : '▶ ASSESS'}
      </button>

      {assessText && (
        <div style={{
          background: 'rgba(249,115,22,0.1)', border: '1px solid #F97316',
          borderRadius: 4, padding: 10, marginBottom: 10,
          color: '#FED7AA', fontSize: 11, whiteSpace: 'pre-wrap',
        }}>{assessText}</div>
      )}

      {loading && <div style={{ color: '#F97316', fontSize: 11, marginBottom: 8 }}>Loading…</div>}
      {error   && <div style={{ color: '#EF4444', fontSize: 11, marginBottom: 8 }}>{error}</div>}

      {/* Rows */}
      {filtered.map(row => (
        <div key={row.id} style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '6px 0',
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => toggleRow(row.id)}
          >
            <span style={{
              background: CLS_COLOR[row.cls], color: '#000',
              borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700, minWidth: 62, textAlign: 'center',
            }}>{row.cls}</span>
            <span style={{ color: '#E5E7EB', fontSize: 11, flex: 1 }}>{row.label}</span>
            {row.category && (
              <span style={{ color: '#9CA3AF', fontSize: 9 }}>{row.category}</span>
            )}
            <span style={{ color: '#555', fontSize: 9 }}>{expanded[row.id] ? '▲' : '▼'}</span>
          </div>

          {expanded[row.id] && (
            <div style={{ marginLeft: 12, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Matched Tasks */}
              {row.matchedTasks.length > 0 && (
                <div>
                  <div style={{ color: '#6B7280', fontSize: 9, marginBottom: 2 }}>TASKS ({row.matchedTasks.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {row.matchedTasks.slice(0, 6).map((t, i) => (
                      <span key={i} style={{
                        background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
                        borderRadius: 3, padding: '1px 6px', fontSize: 9, color: '#FDE68A',
                      }}>
                        {t.title || t.name || t.id}
                        {t.status && <span style={{ marginLeft: 4, color: '#F59E0B', fontWeight: 700 }}>{t.status}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Contacts */}
              {row.matchedContacts.length > 0 && (
                <div>
                  <div style={{ color: '#6B7280', fontSize: 9, marginBottom: 2 }}>CONTACTS ({row.matchedContacts.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {row.matchedContacts.slice(0, 6).map((c, i) => (
                      <span key={i} style={{
                        background: 'rgba(56,189,248,0.15)', border: '1px solid #38BDF8',
                        borderRadius: 3, padding: '1px 6px', fontSize: 9, color: '#BAE6FD',
                      }}>
                        {c.name || c.full_name || c.id}
                        {(c.role || c.organization) && (
                          <span style={{ marginLeft: 4, color: '#38BDF8' }}>
                            {[c.role, c.organization].filter(Boolean).join(' / ')}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched SwarmJobs */}
              {row.matchedSwarmJobs.length > 0 && (
                <div>
                  <div style={{ color: '#6B7280', fontSize: 9, marginBottom: 2 }}>SWARM JOBS ({row.matchedSwarmJobs.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {row.matchedSwarmJobs.slice(0, 6).map((j, i) => (
                      <span key={i} style={{
                        background: 'rgba(168,85,247,0.15)', border: '1px solid #A855F7',
                        borderRadius: 3, padding: '1px 6px', fontSize: 9, color: '#E9D5FF',
                      }}>
                        {j.name || j.title || j.id}
                        {j.status && <span style={{ marginLeft: 4, color: '#A855F7', fontWeight: 700 }}>{j.status}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {row.matchedTasks.length === 0 && row.matchedContacts.length === 0 && row.matchedSwarmJobs.length === 0 && (
                <div style={{ color: '#F97316', fontSize: 9 }}>No matching tasks, contacts, or swarm jobs — intelligence dead-end.</div>
              )}
            </div>
          )}
        </div>
      ))}

      {filtered.length === 0 && !loading && (
        <div style={{ color: '#555', fontSize: 11, textAlign: 'center', padding: 20 }}>
          No articles match current filter.
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#444', fontSize: 9 }}>Auto-refresh: 90s</span>
        <button onClick={load} style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid #444',
          borderRadius: 3, color: '#aaa', padding: '2px 8px', fontSize: 9, cursor: 'pointer',
        }}>↺ Refresh</button>
      </div>
    </div>
  );
}
