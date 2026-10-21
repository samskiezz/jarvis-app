/**
 * BrainContactReportTaskMap — F102
 *
 * Fetches /v1/cinematic/brain + /entities/Contact + /v1/reports + /entities/Task.
 *
 * Keyword-matches each brain node (label/type/description) against contact
 * names/roles/organisations, report titles/categories, and task titles/descriptions
 * to classify:
 *
 *   COMMANDING — node matches a contact AND a report AND a task
 *                (fully grounded: staffed, documented, and tasked)
 *   STAFFED    — node matches contact + at least one other source
 *                (human-owned but partially grounded)
 *   DOCUMENTED — node matches report or task but NO contact owner
 *                (documented but unowned)
 *   GHOST      — no match to any source (ungrounded brain node — operational blind spot)
 *
 * Toggle: ◈ BCRTMAP button (fixed, bottom strip) left:105480, zIndex:199
 * Stat tiles: nodes / contacts / reports / tasks / commanding / staffed / documented / ghost
 * Amber pulse on GHOST count (ungrounded brain nodes).
 * Expandable rows: matched contacts with role/org +
 *                  matched reports with date badge +
 *                  matched tasks with status badge.
 * Filter tabs: ALL / COMMANDING / STAFFED / DOCUMENTED / GHOST + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "bcrtmap"/"brain contact report"/"brain authority"/"commanding nodes"
 *        "ghost brain nodes"/"brain grounding"/"brain contact task"
 *        "brain coverage authority"/"brain report contact"/"intelligence authority map"
 *        "brain task coverage"/"brain mission coverage"/"brain staffing"
 * Event: jarvis:bcrtmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'STAFFED', 'DOCUMENTED', 'GHOST'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  STAFFED:    '#38BDF8',
  DOCUMENTED: '#F97316',
  GHOST:      '#F59E0B',
};

const STATUS_COLOR = {
  running:   '#22C55E', active: '#22C55E', open: '#22C55E',
  pending:   '#F59E0B', queued: '#F59E0B', scheduled: '#F59E0B',
  completed: '#38BDF8', done: '#38BDF8', closed: '#38BDF8',
  failed:    '#EF4444', error: '#EF4444',
  idle:      '#6B7280', stopped: '#6B7280',
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

export function isBcrtmapQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'bcrtmap', 'brain contact report', 'brain authority',
    'commanding nodes', 'ghost brain nodes', 'brain grounding',
    'brain contact task', 'brain coverage authority', 'brain report contact',
    'intelligence authority map', 'brain task coverage',
    'brain mission coverage', 'brain staffing',
  ].some(k => s.includes(k));
}

export function buildBcrtmapScript() {
  return (
    'Fetch /v1/cinematic/brain, /entities/Contact, /v1/reports, and /entities/Task. ' +
    'Keyword-match each brain node (label/type/description) against contact names/roles/organisations, ' +
    'report titles/categories, and task titles/descriptions. ' +
    'Classify each node as COMMANDING (matches contact + report + task), ' +
    'STAFFED (matches contact + at least one other), ' +
    'DOCUMENTED (matches report or task but no contact owner), ' +
    'or GHOST (no match to any source — ungrounded operational blind spot). ' +
    'Report total GHOST count, identify the most operationally critical ghost nodes, ' +
    'recommend which contacts should own each ghost node, which reports reference its domain, ' +
    'and which active tasks should be linked to bring it into commanding status.'
  );
}

export default function BrainContactReportTaskMap() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    nodes: 0, contacts: 0, reports: 0, tasks: 0,
    commanding: 0, staffed: 0, documented: 0, ghost: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [brainRaw, contactsRaw, reportsRaw, tasksRaw] = await Promise.all([
        fetch(`${API}/v1/cinematic/brain`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/reports`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Task`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const nodes    = normalizeArray(brainRaw,    ['nodes', 'items', 'results', 'data', 'entities']);
      const contacts = normalizeArray(contactsRaw, ['items', 'contacts', 'results', 'data', 'entities']);
      const reports  = normalizeArray(reportsRaw,  ['items', 'reports', 'results', 'data', 'entities']);
      const tasks    = normalizeArray(tasksRaw,    ['items', 'tasks', 'results', 'data', 'entities']);

      const built = nodes.map((node, idx) => {
        const nodeText = [
          node.label, node.name, node.type, node.description, node.id,
          node.tags?.join?.(' '), node.category,
        ].filter(Boolean).join(' ');
        const nToks = tokens(nodeText);

        const matchedContacts = contacts.filter(c => {
          const s = [c.name, c.first_name, c.last_name, c.role, c.title,
                     c.organisation, c.organization, c.org, c.department,
                     c.description, c.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const matchedReports = reports.filter(r => {
          const s = [r.title, r.name, r.category, r.type, r.description,
                     r.summary, r.tags?.join?.(' '), r.source]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const matchedTasks = tasks.filter(t => {
          const s = [t.title, t.name, t.description, t.type, t.category,
                     t.tags?.join?.(' '), t.assignee, t.project]
            .filter(Boolean).join(' ');
          return overlaps(nToks, s);
        });

        const hasContact = matchedContacts.length > 0;
        const hasReport  = matchedReports.length > 0;
        const hasTask    = matchedTasks.length > 0;

        let cls;
        if (hasContact && hasReport && hasTask) {
          cls = 'COMMANDING';
        } else if (hasContact && (hasReport || hasTask)) {
          cls = 'STAFFED';
        } else if (!hasContact && (hasReport || hasTask)) {
          cls = 'DOCUMENTED';
        } else {
          cls = 'GHOST';
        }

        return {
          id:              `node-${idx}`,
          label:           node.label || node.name || `Node ${idx + 1}`,
          type:            node.type || node.category || '',
          score:           node.centrality ?? node.score ?? node.weight ?? null,
          cls,
          matchedContacts,
          matchedReports,
          matchedTasks,
        };
      });

      const commanding = built.filter(r => r.cls === 'COMMANDING').length;
      const staffed    = built.filter(r => r.cls === 'STAFFED').length;
      const documented = built.filter(r => r.cls === 'DOCUMENTED').length;
      const ghost      = built.filter(r => r.cls === 'GHOST').length;

      setRows(built);
      setCounts({
        nodes: built.length,
        contacts: contacts.length,
        reports: reports.length,
        tasks: tasks.length,
        commanding, staffed, documented, ghost,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:bcrtmap-toggle', handler);
    return () => window.removeEventListener('jarvis:bcrtmap-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildBcrtmapScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.ghost > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#F59E0B' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.type.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const TILE_STYLE = (col) => ({
    background: 'rgba(0,0,0,0.5)', border: `1px solid ${col}`,
    borderRadius: 4, padding: '4px 8px', minWidth: 70, textAlign: 'center',
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 105480, zIndex: 199,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #F59E0B',
          color: '#F59E0B', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ BCRTMAP{counts.ghost > 0 ? <span style={pulse}> {counts.ghost}</span> : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
      width: 820, maxHeight: '72vh', background: 'rgba(0,0,0,0.92)',
      border: '1px solid #F59E0B', borderRadius: 8, zIndex: 9200,
      display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      color: '#E5E7EB', fontSize: 12,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid #374151',
        background: 'rgba(245,158,11,0.08)',
      }}>
        <span style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: 13 }}>
          ◈ BCRTMAP — Brain × Contact × Report × Task Intelligence Authority Map
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: 'rgba(245,158,11,0.15)', border: '1px solid #F59E0B',
              color: '#F59E0B', padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}
          >
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none', border: '1px solid #4B5563',
              color: '#9CA3AF', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}
          >✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
        {[
          ['nodes',      counts.nodes,      '#9CA3AF'],
          ['contacts',   counts.contacts,   '#38BDF8'],
          ['reports',    counts.reports,    '#A78BFA'],
          ['tasks',      counts.tasks,      '#F97316'],
          ['commanding', counts.commanding, '#22C55E'],
          ['staffed',    counts.staffed,    '#38BDF8'],
          ['documented', counts.documented, '#F97316'],
          ['ghost',      counts.ghost,      '#F59E0B'],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={TILE_STYLE(col)}>
            <div style={{ color: col, fontWeight: 'bold', fontSize: 14 }}>{val}</div>
            <div style={{ color: '#9CA3AF', fontSize: 10 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(0,0,0,0.4)',
            border: `1px solid ${tab === t ? '#F59E0B' : '#374151'}`,
            color: tab === t ? '#F59E0B' : '#9CA3AF',
            padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="filter…"
          style={{
            background: 'rgba(0,0,0,0.5)', border: '1px solid #374151',
            color: '#E5E7EB', padding: '2px 8px', borderRadius: 4, fontSize: 11,
            outline: 'none', marginLeft: 'auto',
          }}
        />
        <button
          onClick={fetchData}
          style={{
            background: 'rgba(0,0,0,0.4)', border: '1px solid #374151',
            color: '#9CA3AF', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}
        >↺</button>
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          margin: '0 12px 6px', padding: '6px 10px',
          background: 'rgba(245,158,11,0.08)', border: '1px solid #F59E0B',
          borderRadius: 4, fontSize: 11, color: '#FDE68A', lineHeight: 1.5,
        }}>
          {assessment}
        </div>
      )}

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#9CA3AF', padding: 12 }}>Loading…</div>}
        {error && <div style={{ color: '#EF4444', padding: 8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#6B7280', padding: 12, textAlign: 'center' }}>
            No nodes match the current filter.
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: '1px solid #1F2937', marginBottom: 2 }}>
            <div
              onClick={() => toggleExpand(row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 0', cursor: 'pointer',
              }}
            >
              <span style={{
                background: CLS_COLOR[row.cls] + '22',
                border: `1px solid ${CLS_COLOR[row.cls]}`,
                color: CLS_COLOR[row.cls], padding: '1px 6px',
                borderRadius: 3, fontSize: 10, minWidth: 88, textAlign: 'center',
              }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.label}
              </span>
              {row.type && (
                <span style={{ color: '#6B7280', fontSize: 10 }}>{row.type}</span>
              )}
              {row.score !== null && (
                <span style={{
                  background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                  color: '#38BDF8', padding: '0 5px', borderRadius: 3, fontSize: 10,
                }}>
                  {typeof row.score === 'number' ? row.score.toFixed(3) : row.score}
                </span>
              )}
              <span style={{ color: '#6B7280', fontSize: 10 }}>
                {row.matchedContacts.length}C · {row.matchedReports.length}R · {row.matchedTasks.length}T
              </span>
              <span style={{ color: '#6B7280' }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 12, paddingBottom: 6 }}>
                {/* Contacts */}
                {row.matchedContacts.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 3 }}>CONTACTS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedContacts.slice(0, 8).map((c, i) => {
                        const role = c.role || c.title || '';
                        const org  = c.organisation || c.organization || c.org || '';
                        return (
                          <span key={i} style={{
                            background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                            color: '#BAE6FD', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {c.name || `Contact ${i + 1}`}
                            {(role || org) && (
                              <span style={{ color: '#38BDF8', marginLeft: 4 }}>
                                [{role}{role && org ? ' · ' : ''}{org}]
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reports */}
                {row.matchedReports.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>REPORTS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedReports.slice(0, 8).map((r, i) => {
                        const date = r.date || r.created_at || r.published_at || r.updated_at || '';
                        const dateShort = date ? new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
                        return (
                          <span key={i} style={{
                            background: 'rgba(167,139,250,0.1)', border: '1px solid #A78BFA',
                            color: '#DDD6FE', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {r.title || r.name || `Report ${i + 1}`}
                            {dateShort && (
                              <span style={{
                                background: 'rgba(167,139,250,0.2)', border: '1px solid #A78BFA',
                                color: '#A78BFA', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                              }}>{dateShort}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tasks */}
                {row.matchedTasks.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>TASKS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedTasks.slice(0, 8).map((t, i) => {
                        const st = (t.status || t.state || '').toLowerCase();
                        const sc = STATUS_COLOR[st] || '#6B7280';
                        return (
                          <span key={i} style={{
                            background: 'rgba(249,115,22,0.1)', border: '1px solid #F97316',
                            color: '#FED7AA', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {t.title || t.name || `Task ${i + 1}`}
                            {st && (
                              <span style={{
                                background: sc + '22', border: `1px solid ${sc}`,
                                color: sc, marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                              }}>{st}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {row.matchedContacts.length === 0 && row.matchedReports.length === 0 && row.matchedTasks.length === 0 && (
                  <div style={{ color: '#6B7280', fontSize: 11, padding: '2px 0' }}>
                    No matching contacts, reports, or tasks — ungrounded ghost node.
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
