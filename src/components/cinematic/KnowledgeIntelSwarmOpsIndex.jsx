/**
 * KnowledgeIntelSwarmOpsIndex — F101
 *
 * Fetches /knowledge/ + /entities/IntelProfile + /entities/SwarmJob + /v1/ops/alerts.
 *
 * Keyword-matches each knowledge article (title/category/description/tags) against
 * intel profile names/categories, swarm job names/types, and ops alert titles/categories
 * to classify:
 *
 *   ACTIVE      — article matches an intel profile AND a swarm job AND an ops alert
 *                 (fully operational: profiled, processing, and alert-covered)
 *   PROFILED    — article matches intel profile + at least one other source
 *                 (partially grounded)
 *   PROCESSING  — article matches swarm job or ops alert but NO intel profile
 *                 (operational but un-attributed)
 *   DARK        — no match to any source (orphaned knowledge — intelligence dead-end)
 *
 * Toggle: ◈ KIPROD button (fixed, bottom strip) left:104920, zIndex:198
 * Stat tiles: articles / profiles / jobs / alerts / active / profiled / processing / dark
 * Amber pulse on DARK count (dead-end knowledge).
 * Expandable rows: matched intel profiles with category badge +
 *                  matched swarm jobs with status badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / ACTIVE / PROFILED / PROCESSING / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "kiprod"/"knowledge production"/"intel knowledge"/"deep intelligence production"
 *        "orphan knowledge"/"knowledge blind spot"/"knowledge profiling"/"dark knowledge"
 *        "knowledge swarm"/"knowledge ops index"/"intelligence production"
 * Event: jarvis:kiprod-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVE', 'PROFILED', 'PROCESSING', 'DARK'];

const CLS_COLOR = {
  ACTIVE:     '#22C55E',
  PROFILED:   '#38BDF8',
  PROCESSING: '#F97316',
  DARK:       '#F59E0B',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
};

const STATUS_COLOR = {
  running:   '#22C55E', active: '#22C55E',
  pending:   '#F59E0B', queued: '#F59E0B', scheduled: '#F59E0B',
  completed: '#38BDF8', done: '#38BDF8',
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

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.articles))  return raw.articles;
  if (Array.isArray(raw?.knowledge)) return raw.knowledge;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeIntelProfiles(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.items))           return raw.items;
  if (Array.isArray(raw?.intel_profiles))  return raw.intel_profiles;
  if (Array.isArray(raw?.intelProfiles))   return raw.intelProfiles;
  if (Array.isArray(raw?.profiles))        return raw.profiles;
  if (Array.isArray(raw?.results))         return raw.results;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.entities))        return raw.entities;
  return [];
}

function normalizeSwarmJobs(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.swarm_jobs))  return raw.swarm_jobs;
  if (Array.isArray(raw?.swarmJobs))   return raw.swarmJobs;
  if (Array.isArray(raw?.jobs))        return raw.jobs;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.entities))    return raw.entities;
  return [];
}

function normalizeOpsAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

export function isKiprodQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'kiprod', 'knowledge production', 'intel knowledge',
    'deep intelligence production', 'orphan knowledge',
    'knowledge blind spot', 'knowledge profiling', 'dark knowledge',
    'knowledge swarm', 'knowledge ops index', 'intelligence production',
  ].some(k => s.includes(k));
}

export function buildKiprodScript() {
  return (
    'Fetch /knowledge/, /entities/IntelProfile, /entities/SwarmJob, and /v1/ops/alerts. ' +
    'Keyword-match each knowledge article (title/category/description/tags) against ' +
    'intel profile names/categories, swarm job names/types, and ops alert titles/categories. ' +
    'Classify each article as ACTIVE (matches intel profile + swarm job + ops alert), ' +
    'PROFILED (matches intel profile + at least one other), ' +
    'PROCESSING (matches swarm job or ops alert but no intel profile), ' +
    'or DARK (no match to any source — orphaned knowledge). ' +
    'Report total DARK count, identify the top orphaned articles with the highest operational risk, ' +
    'and recommend which intel profiles should be assigned, which swarm jobs should process each ' +
    'orphaned article, and which ops alert categories the dark articles most closely resemble.'
  );
}

export default function KnowledgeIntelSwarmOpsIndex() {
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
    articles: 0, profiles: 0, jobs: 0, alerts: 0,
    active: 0, profiled: 0, processing: 0, dark: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [knowledgeRaw, profilesRaw, jobsRaw, alertsRaw] = await Promise.all([
        fetch(`${API}/knowledge/`,             { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/IntelProfile`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/SwarmJob`,      { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const articles = normalizeKnowledge(knowledgeRaw);
      const profiles = normalizeIntelProfiles(profilesRaw);
      const jobs     = normalizeSwarmJobs(jobsRaw);
      const alerts   = normalizeOpsAlerts(alertsRaw);

      const built = articles.map((art, idx) => {
        const artText = [
          art.title, art.name, art.category, art.description,
          art.tags?.join?.(' '), art.keywords?.join?.(' '), art.type,
        ].filter(Boolean).join(' ');
        const aToks = tokens(artText);

        const matchedProfiles = profiles.filter(p => {
          const s = [p.name, p.title, p.category, p.type, p.description,
                     p.tags?.join?.(' '), p.subject, p.entity]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const matchedJobs = jobs.filter(j => {
          const s = [j.name, j.title, j.type, j.job_type, j.jobType,
                     j.description, j.tags?.join?.(' '), j.target, j.task]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const matchedAlerts = alerts.filter(a => {
          const s = [a.title, a.name, a.message, a.category, a.type,
                     a.description, a.source, a.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const hasProfile = matchedProfiles.length > 0;
        const hasJob     = matchedJobs.length > 0;
        const hasAlert   = matchedAlerts.length > 0;

        let cls;
        if (hasProfile && hasJob && hasAlert) {
          cls = 'ACTIVE';
        } else if (hasProfile && (hasJob || hasAlert)) {
          cls = 'PROFILED';
        } else if (!hasProfile && (hasJob || hasAlert)) {
          cls = 'PROCESSING';
        } else {
          cls = 'DARK';
        }

        return {
          id:              `art-${idx}`,
          label:           art.title || art.name || `Article ${idx + 1}`,
          category:        art.category || art.type || '',
          cls,
          matchedProfiles,
          matchedJobs,
          matchedAlerts,
        };
      });

      const active     = built.filter(r => r.cls === 'ACTIVE').length;
      const profiled   = built.filter(r => r.cls === 'PROFILED').length;
      const processing = built.filter(r => r.cls === 'PROCESSING').length;
      const dark       = built.filter(r => r.cls === 'DARK').length;

      setRows(built);
      setCounts({
        articles: built.length,
        profiles: profiles.length,
        jobs: jobs.length,
        alerts: alerts.length,
        active, profiled, processing, dark,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:kiprod-toggle', handler);
    return () => window.removeEventListener('jarvis:kiprod-toggle', handler);
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
        body:    JSON.stringify({ message: buildKiprodScript() }),
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

  const pulse = counts.dark > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#F59E0B' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.category.toLowerCase().includes(s)
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
          position: 'fixed', bottom: 8, left: 104920, zIndex: 198,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #F59E0B',
          color: '#F59E0B', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ KIPROD{counts.dark > 0 ? <span style={pulse}> {counts.dark}</span> : null}
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
          ◈ KIPROD — Knowledge × Intel × Swarm × Ops Intelligence Production Index
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
          ['articles',   counts.articles,   '#9CA3AF'],
          ['profiles',   counts.profiles,   '#38BDF8'],
          ['jobs',       counts.jobs,       '#A78BFA'],
          ['alerts',     counts.alerts,     '#F97316'],
          ['active',     counts.active,     '#22C55E'],
          ['profiled',   counts.profiled,   '#38BDF8'],
          ['processing', counts.processing, '#F97316'],
          ['dark',       counts.dark,       '#F59E0B'],
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
            No articles match the current filter.
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
                borderRadius: 3, fontSize: 10, minWidth: 72, textAlign: 'center',
              }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.label}
              </span>
              {row.category && (
                <span style={{ color: '#6B7280', fontSize: 10 }}>{row.category}</span>
              )}
              <span style={{ color: '#6B7280', fontSize: 10 }}>
                {row.matchedProfiles.length}P · {row.matchedJobs.length}J · {row.matchedAlerts.length}A
              </span>
              <span style={{ color: '#6B7280' }}>{expanded[row.id] ? '▲' : '▼'}</span>
            </div>

            {expanded[row.id] && (
              <div style={{ paddingLeft: 12, paddingBottom: 6 }}>
                {/* Intel Profiles */}
                {row.matchedProfiles.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 3 }}>INTEL PROFILES</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedProfiles.slice(0, 8).map((p, i) => (
                        <span key={i} style={{
                          background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
                          color: '#BAE6FD', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                        }}>
                          {p.name || p.title || `Profile ${i + 1}`}
                          {(p.category || p.type) && (
                            <span style={{ color: '#38BDF8', marginLeft: 4 }}>
                              [{p.category || p.type}]
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Swarm Jobs */}
                {row.matchedJobs.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 3 }}>SWARM JOBS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedJobs.slice(0, 8).map((j, i) => {
                        const st = (j.status || j.state || '').toLowerCase();
                        const sc = STATUS_COLOR[st] || '#6B7280';
                        return (
                          <span key={i} style={{
                            background: 'rgba(167,139,250,0.1)', border: '1px solid #A78BFA',
                            color: '#DDD6FE', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {j.name || j.title || `Job ${i + 1}`}
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

                {/* Ops Alerts */}
                {row.matchedAlerts.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>OPS ALERTS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.matchedAlerts.slice(0, 8).map((a, i) => {
                        const sev = (a.severity || a.level || a.priority || '').toLowerCase();
                        const sc  = SEV_COLOR[sev] || '#9CA3AF';
                        return (
                          <span key={i} style={{
                            background: 'rgba(249,115,22,0.1)', border: '1px solid #F97316',
                            color: '#FED7AA', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                          }}>
                            {a.title || a.name || a.message?.slice(0, 40) || `Alert ${i + 1}`}
                            {sev && (
                              <span style={{
                                background: sc + '22', border: `1px solid ${sc}`,
                                color: sc, marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                              }}>{sev}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {row.matchedProfiles.length === 0 && row.matchedJobs.length === 0 && row.matchedAlerts.length === 0 && (
                  <div style={{ color: '#6B7280', fontSize: 11, padding: '2px 0' }}>
                    No matching intel profiles, swarm jobs, or ops alerts.
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
