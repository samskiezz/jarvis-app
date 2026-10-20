/**
 * TaskSkillKnowledgeExecutionIntel — F77
 *
 * Fetches /entities/Task + /v1/aip/skill + /knowledge/
 * Keyword-matches each task against skills AND knowledge articles to classify:
 *   CAPABLE  — task matches a skill AND a knowledge article (fully supported)
 *   SKILLED  — task matches a skill only (capability exists, no documented knowledge)
 *   KNOWN    — task matches a knowledge article only (knowledge exists, no skill support)
 *   BLIND    — no skill and no knowledge match (execution blind spot)
 *
 * Toggle: ◈ TSKINTEL button (fixed, bottom strip) left:91480, zIndex:174
 * Stat tiles: tasks / skills / articles / capable / skilled / known / blind
 * Amber pulse on BLIND count (execution blind spots).
 * Expandable rows: matched skills with score badge
 *                  + matched knowledge articles with category badge.
 * Filter tabs: ALL / CAPABLE / SKILLED / KNOWN / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tskintel"/"task skill knowledge"/"execution intelligence"/"blind tasks"/
 *        "task capability"/"task knowledge"/"skill task coverage"/"execution gaps"/
 *        "task blind spots"/"capability gap tasks"
 * Event: jarvis:tskintel-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CAPABLE', 'SKILLED', 'KNOWN', 'BLIND'];

const CLS_COLOR = {
  CAPABLE: '#00FF88',
  SKILLED: '#38BDF8',
  KNOWN:   '#A78BFA',
  BLIND:   '#FF9900',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
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

export function isTskintelQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'tskintel', 'task skill knowledge', 'execution intelligence', 'blind tasks',
    'task capability', 'task knowledge', 'skill task coverage', 'execution gaps',
    'task blind spots', 'capability gap tasks',
  ].some(k => s.includes(k));
}

export function buildTskintelScript() {
  return `Fetch /entities/Task, /v1/aip/skill, and /knowledge/. ` +
    `Keyword-match each task against available skills AND knowledge articles. ` +
    `Classify each task as CAPABLE/SKILLED/KNOWN/BLIND. ` +
    `Report total BLIND (execution blind-spot) tasks, identify which task domains ` +
    `have no skill coverage and no knowledge grounding, and recommend which skills ` +
    `or knowledge articles should be created or extended to eliminate execution gaps.`;
}

export default function TaskSkillKnowledgeExecutionIntel() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [skills, setSkills]     = useState([]);
  const [articles, setArticles] = useState([]);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef                = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [tRes, sRes, kRes] = await Promise.all([
        fetch(`${API}/entities/Task`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/v1/aip/skill`, { headers: hdrs }).catch(() => null),
        fetch(`${API}/knowledge/`, { headers: hdrs }).catch(() => null),
      ]);

      const tJson = tRes?.ok ? await tRes.json().catch(() => ({})) : {};
      const sJson = sRes?.ok ? await sRes.json().catch(() => ({})) : {};
      const kJson = kRes?.ok ? await kRes.json().catch(() => ({})) : {};

      const rawTasks    = normalizeArray(tJson, ['items', 'data', 'results', 'tasks']);
      const rawSkills   = normalizeArray(sJson, ['skills', 'items', 'data', 'results']);
      const rawArticles = normalizeArray(kJson, ['articles', 'items', 'data', 'results', 'documents']);

      setTasks(rawTasks);
      setSkills(rawSkills);
      setArticles(rawArticles);

      const built = rawTasks.map(task => {
        const taskLabel = task.title || task.name || task.id || '';
        const taskBody  = [taskLabel, task.description, task.type, task.status, task.tags]
          .filter(Boolean).join(' ');
        const taskToks  = tokens(taskBody);

        const matchedSkills = rawSkills.filter(s => {
          const sStr = [s.name, s.skill_name, s.description, s.category, s.domain].filter(Boolean).join(' ');
          return overlaps(taskToks, sStr);
        });
        const matchedArticles = rawArticles.filter(a => {
          const aStr = [a.title, a.name, a.category, a.summary, a.content, a.tags].filter(Boolean).join(' ');
          return overlaps(taskToks, aStr);
        });

        const hasSkill   = matchedSkills.length > 0;
        const hasArticle = matchedArticles.length > 0;
        const cls = hasSkill && hasArticle ? 'CAPABLE'
                  : hasSkill               ? 'SKILLED'
                  : hasArticle             ? 'KNOWN'
                  :                          'BLIND';

        return { task, taskLabel, cls, matchedSkills, matchedArticles };
      });

      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:tskintel-toggle', handler);
    return () => window.removeEventListener('jarvis:tskintel-toggle', handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res  = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ message: buildTskintelScript() }),
      });
      const j = res.ok ? await res.json().catch(() => ({})) : {};
      const reply = j.response || j.message || j.content || j.text || 'Assessment complete.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: reply } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: 'Assessment unavailable.' } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const counts = {
    CAPABLE: rows.filter(r => r.cls === 'CAPABLE').length,
    SKILLED: rows.filter(r => r.cls === 'SKILLED').length,
    KNOWN:   rows.filter(r => r.cls === 'KNOWN').length,
    BLIND:   rows.filter(r => r.cls === 'BLIND').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search && !r.taskLabel.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Skill × Knowledge Execution Intelligence"
        style={{
          position: 'fixed', bottom: 8, left: 91480, zIndex: 174,
          background: 'rgba(0,20,40,0.85)', border: '1px solid #FF9900',
          color: '#FF9900', fontFamily: 'monospace', fontSize: 10,
          padding: '3px 7px', cursor: 'pointer', borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        ◈ TSKINTEL
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 174,
      background: 'rgba(0,6,18,0.97)', color: '#E2E8F0',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #1e3a5f' }}>
        <span style={{ color: '#FF9900', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ TSKINTEL</span>
        <span style={{ color: '#64748B', fontSize: 11 }}>Task × Skill × Knowledge Execution Intelligence</span>
        <div style={{ flex: 1 }} />
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#1e3a5f' : '#0f3460', border: '1px solid #38BDF8',
          color: '#38BDF8', fontFamily: 'monospace', fontSize: 10, padding: '3px 10px',
          cursor: assessing ? 'wait' : 'pointer', borderRadius: 3,
        }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={fetchData} disabled={loading} style={{
          background: 'none', border: '1px solid #334155', color: '#94A3B8',
          fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', cursor: 'pointer', borderRadius: 3,
        }}>⟳ REFRESH</button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: '1px solid #334155', color: '#94A3B8',
          fontFamily: 'monospace', fontSize: 11, padding: '2px 8px', cursor: 'pointer', borderRadius: 3,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {[
          ['TASKS',   tasks.length,    '#94A3B8'],
          ['SKILLS',  skills.length,   '#38BDF8'],
          ['ARTICLES', articles.length,'#A78BFA'],
          ['CAPABLE', counts.CAPABLE,  CLS_COLOR.CAPABLE],
          ['SKILLED', counts.SKILLED,  CLS_COLOR.SKILLED],
          ['KNOWN',   counts.KNOWN,    CLS_COLOR.KNOWN],
          ['BLIND',   counts.BLIND,    CLS_COLOR.BLIND],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: 'rgba(0,20,40,0.7)', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '5px 12px', textAlign: 'center', minWidth: 70,
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700,
              animation: label === 'BLIND' && val > 0 ? 'pulse-amber 1.5s ease-in-out infinite' : 'none' }}>
              {loading ? '…' : val}
            </div>
            <div style={{ color: '#64748B', fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid #1e3a5f', alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (CLS_COLOR[t] || '#1e3a5f') : 'rgba(0,20,40,0.7)',
            border: `1px solid ${CLS_COLOR[t] || '#334155'}`,
            color: tab === t ? '#000' : (CLS_COLOR[t] || '#94A3B8'),
            fontFamily: 'monospace', fontSize: 10, padding: '3px 10px',
            cursor: 'pointer', borderRadius: 3, fontWeight: tab === t ? 700 : 400,
          }}>
            {t}{t !== 'ALL' ? ` (${counts[t] ?? ''})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            background: 'rgba(0,20,40,0.8)', border: '1px solid #334155', color: '#E2E8F0',
            fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', borderRadius: 3,
            outline: 'none', marginLeft: 8, width: 180,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {error && (
          <div style={{ color: '#FF4444', fontSize: 11, marginBottom: 8 }}>Error: {error}</div>
        )}
        {loading && rows.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>Loading execution intelligence data…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 11 }}>No tasks match current filter.</div>
        )}
        {visible.map((r, i) => {
          const key = r.taskLabel + i;
          const isExp = !!expanded[key];
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggleRow(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  background: 'rgba(0,20,40,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`,
                  borderRadius: 4, padding: '5px 10px',
                  borderLeft: `3px solid ${CLS_COLOR[r.cls]}`,
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 9, fontWeight: 700, minWidth: 56 }}>{r.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1 }}>{r.taskLabel || '(unnamed)'}</span>
                {r.task.status && (
                  <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>
                    {r.task.status}
                  </span>
                )}
                <span style={{ color: '#38BDF8', fontSize: 9 }}>{r.matchedSkills.length} skills</span>
                <span style={{ color: '#A78BFA', fontSize: 9 }}>{r.matchedArticles.length} articles</span>
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ background: 'rgba(0,10,30,0.7)', border: '1px solid #1e3a5f', borderRadius: '0 0 4px 4px', padding: '8px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#38BDF8', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED SKILLS</div>
                    {r.matchedSkills.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedSkills.map((s, si) => (
                        <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{s.skill_name || s.name || s.id || '(skill)'}</span>
                          {(s.score !== undefined || s.level !== undefined) && (
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 2,
                              background: '#38BDF833', color: '#38BDF8',
                            }}>
                              {s.score !== undefined ? `${Math.round(s.score * 100)}%` : s.level}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#A78BFA', fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>MATCHED KNOWLEDGE ARTICLES</div>
                    {r.matchedArticles.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>None</div>
                      : r.matchedArticles.map((a, ai) => (
                        <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E2E8F0', fontSize: 10 }}>{a.title || a.name || a.id || '(article)'}</span>
                          {a.category && (
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 2,
                              background: '#A78BFA33', color: '#A78BFA',
                            }}>
                              {a.category}
                            </span>
                          )}
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

      <style>{`
        @keyframes pulse-amber {
          0%,100% { opacity:1; }
          50% { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}
