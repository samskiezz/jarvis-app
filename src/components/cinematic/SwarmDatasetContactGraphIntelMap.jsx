/**
 * SwarmDatasetContactGraphIntelMap — F261
 *
 * Fetches /entities/SwarmJob
 *         /v1/datasets
 *         /entities/Contact
 *         /v1/graph/centrality
 *
 * Keyword-matches each swarm job against datasets, contacts,
 * and graph centrality nodes to classify:
 *
 *   COMMANDED — matches all 3 other sources
 *   ACTIVE    — matches 2 of 3 other sources
 *   PARTIAL   — matches exactly 1 other source
 *   ORPHAN    — no match to any source
 *               (swarm jobs with no dataset backing, no contact owner,
 *                no graph trace — automation dead-ends)
 *
 * Toggle: ◈ SDCGAM button (fixed, bottom strip) left:193960, zIndex:357
 * Stat tiles: swarm jobs / datasets / contacts / graph nodes /
 *             commanded / active / partial / orphan
 * Red pulse on ORPHAN count (automation dead-ends).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched contacts with role/org +
 *                  matched graph nodes with centrality score badge.
 * Filter tabs: ALL / COMMANDED / ACTIVE / PARTIAL / ORPHAN + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sdcgam"/"swarm dataset contact"/"automation intel map"/
 *        "orphan swarm"/"swarm graph"/"swarm contact map"/
 *        "automation dead-end"/"swarm intelligence map"
 * Event: jarvis:sdcgam-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDED', 'ACTIVE', 'PARTIAL', 'ORPHAN'];

const CLS_COLOR = {
  COMMANDED: '#22C55E',
  ACTIVE:    '#F59E0B',
  PARTIAL:   '#38BDF8',
  ORPHAN:    '#EF4444',
};

export function isSdcgamQuery(q) {
  const s = (q || '').toLowerCase();
  return s.includes('sdcgam') ||
    s.includes('swarm dataset contact') ||
    s.includes('automation intel map') ||
    s.includes('orphan swarm') ||
    s.includes('swarm graph') ||
    s.includes('swarm contact map') ||
    s.includes('automation dead-end') ||
    s.includes('swarm intelligence map');
}

export function buildSdcgamScript() {
  return 'Analyse the SwarmJob × Dataset × Contact × Graph Automation Intelligence Map. ' +
    'Identify ORPHAN swarm jobs (no dataset backing, no contact owner, no graph trace — automation dead-ends). ' +
    'Recommend the top 3 most critical orphaned swarm jobs to ground with data and ownership. ' +
    'Keep the response under 120 words.';
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSwarmJobs(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.swarm_jobs))      return raw.swarm_jobs;
  if (Array.isArray(raw?.jobs))            return raw.jobs;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.datasets))        return raw.datasets;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.contacts))        return raw.contacts;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeGraphNodes(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.nodes))           return raw.nodes;
  if (Array.isArray(raw?.centrality))      return raw.centrality;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function swarmText(job) {
  return [job.name, job.title, job.description, job.type, job.category,
          job.target, job.tags, job.status, job.task_type].filter(Boolean).join(' ');
}

function classifySwarmJob(jobToks, datasets, contacts, graphNodes) {
  const matchedDatasets = datasets.filter(ds => {
    const t = [ds.name, ds.title, ds.description, ds.type, ds.category,
               ds.domain, ds.source, ds.tags].filter(Boolean).join(' ');
    return overlaps(jobToks, t);
  });
  const matchedContacts = contacts.filter(c => {
    const t = [c.name, c.title, c.description, c.role, c.org,
               c.organization, c.email, c.tags].filter(Boolean).join(' ');
    return overlaps(jobToks, t);
  });
  const matchedNodes = graphNodes.filter(n => {
    const t = [n.name, n.title, n.description, n.type, n.label,
               n.category, n.tags].filter(Boolean).join(' ');
    return overlaps(jobToks, t);
  });
  const hits = (matchedDatasets.length > 0 ? 1 : 0)
             + (matchedContacts.length > 0 ? 1 : 0)
             + (matchedNodes.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'COMMANDED'
            : hits === 2 ? 'ACTIVE'
            : hits === 1 ? 'PARTIAL'
            : 'ORPHAN';
  return { cls, matchedDatasets, matchedContacts, matchedNodes };
}

const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function apiFetch(path) {
  const r = await fetch(`${API}${path}`, { headers: hdr });
  if (!r.ok) return null;
  return r.json();
}

export default function SwarmDatasetContactGraphIntelMap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [advice, setAdvice]       = useState('');
  const timerRef                  = useRef(null);

  const counts = {
    COMMANDED: rows.filter(r => r.cls === 'COMMANDED').length,
    ACTIVE:    rows.filter(r => r.cls === 'ACTIVE').length,
    PARTIAL:   rows.filter(r => r.cls === 'PARTIAL').length,
    ORPHAN:    rows.filter(r => r.cls === 'ORPHAN').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [swRaw, dsRaw, ctRaw, grRaw] = await Promise.all([
        apiFetch('/entities/SwarmJob'),
        apiFetch('/v1/datasets'),
        apiFetch('/entities/Contact'),
        apiFetch('/v1/graph/centrality'),
      ]);
      const swarmJobs  = normalizeSwarmJobs(swRaw);
      const datasets   = normalizeDatasets(dsRaw);
      const contacts   = normalizeContacts(ctRaw);
      const graphNodes = normalizeGraphNodes(grRaw);

      const classified = swarmJobs.map(job => {
        const jobToks = tokens(swarmText(job));
        const { cls, matchedDatasets, matchedContacts, matchedNodes } =
          classifySwarmJob(jobToks, datasets, contacts, graphNodes);
        return { job, cls, matchedDatasets, matchedContacts, matchedNodes };
      });
      setRows(classified);
    } catch { /* network offline — keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:sdcgam-toggle', toggle);
    return () => window.removeEventListener('jarvis:sdcgam-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAdvice('');
    try {
      const prompt = buildSdcgamScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || JSON.stringify(d);
      setAdvice(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST', headers: hdr,
          body: JSON.stringify({ text: text.slice(0, 300) }),
        });
      } catch { /* TTS optional */ }
    } catch { setAdvice('Assessment unavailable — check backend connectivity.'); }
    setAssessing(false);
  }

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const t = (r.job.name || r.job.title || '').toLowerCase();
      if (!t.includes(s)) return false;
    }
    return true;
  });

  const orphanCount = counts.ORPHAN;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="SwarmJob × Dataset × Contact × Graph Automation Intelligence Map"
        style={{
          position: 'fixed', left: 193960, bottom: 8, zIndex: 357,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1,
          boxShadow: orphanCount > 0 ? '0 0 8px #EF444466' : 'none',
        }}
      >
        ◈ SDCGAM
        {orphanCount > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff',
            borderRadius: 4, padding: '1px 5px', fontSize: 10,
            animation: 'sdcgam-pulse 1.4s ease-in-out infinite',
          }}>{orphanCount}</span>
        )}
        <style>{`@keyframes sdcgam-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1060,
      background: 'rgba(2,5,10,0.93)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
      padding: '18px 20px', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span style={{ color: '#22D3EE', fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
          ◈ SDCGAM — SWARM × DATASET × CONTACT × GRAPH AUTOMATION INTELLIGENCE MAP
        </span>
        <button onClick={() => setOpen(false)} style={{
          marginLeft: 'auto', background: 'none', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 4, padding: '2px 10px',
          cursor: 'pointer', fontSize: 12,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { label: 'SWARM JOBS',   val: rows.length,                                               color: '#22D3EE' },
          { label: 'DATASETS',     val: rows.reduce((a, r) => a + r.matchedDatasets.length, 0),   color: '#A78BFA' },
          { label: 'CONTACTS',     val: rows.reduce((a, r) => a + r.matchedContacts.length, 0),   color: '#F59E0B' },
          { label: 'GRAPH NODES',  val: rows.reduce((a, r) => a + r.matchedNodes.length, 0),      color: '#38BDF8' },
          { label: 'COMMANDED',    val: counts.COMMANDED, color: CLS_COLOR.COMMANDED },
          { label: 'ACTIVE',       val: counts.ACTIVE,    color: CLS_COLOR.ACTIVE    },
          { label: 'PARTIAL',      val: counts.PARTIAL,   color: CLS_COLOR.PARTIAL   },
          { label: 'ORPHAN',       val: counts.ORPHAN,    color: CLS_COLOR.ORPHAN    },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`,
            borderRadius: 6, padding: '6px 12px', minWidth: 90, textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#8899AA', fontSize: 10, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{ color: '#22D3EE88', fontSize: 11, marginBottom: 8 }}>
          ⟳ Loading swarm automation data…
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#22D3EE22' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === t ? '#22D3EE' : '#22D3EE22'}`,
            color: tab === t ? '#22D3EE' : '#8899AA',
            borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
          }}>{t} {t !== 'ALL' ? `(${counts[t] ?? 0})` : `(${rows.length})`}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid #22D3EE22',
            color: '#DCEBF5', borderRadius: 4, padding: '3px 10px', fontSize: 11,
            outline: 'none', minWidth: 180,
          }}
        />
      </div>

      {/* ASSESS button */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#22D3EE22' : '#22D3EE33',
          border: '1px solid #22D3EE66', color: '#22D3EE',
          borderRadius: 4, padding: '4px 14px', fontSize: 11,
          cursor: assessing ? 'not-allowed' : 'pointer',
        }}>
          {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
        </button>
        {advice && (
          <div style={{
            marginTop: 8, background: 'rgba(34,211,238,0.06)',
            border: '1px solid #22D3EE33', borderRadius: 6,
            padding: '8px 12px', fontSize: 12, color: '#AACCDD',
            maxWidth: 700, lineHeight: 1.5,
          }}>{advice}</div>
        )}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#8899AA', fontSize: 12, padding: '12px 0' }}>
            No swarm jobs match the current filter.
          </div>
        )}
        {visible.map((row, i) => {
          const id = row.job.id || row.job.name || i;
          const isExp = !!expanded[id];
          return (
            <div key={id} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${CLS_COLOR[row.cls]}22`,
              borderRadius: 6, marginBottom: 6, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 12px', cursor: 'pointer',
                }}
              >
                <span style={{
                  color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`,
                  borderRadius: 3, padding: '1px 6px', minWidth: 80, textAlign: 'center',
                }}>{row.cls}</span>
                <span style={{ color: '#DCEBF5', fontSize: 12, flex: 1 }}>
                  {row.job.name || row.job.title || `swarm-${id}`}
                </span>
                {row.job.status && (
                  <span style={{
                    color: '#8899AA', fontSize: 10,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3, padding: '1px 6px',
                  }}>{row.job.status}</span>
                )}
                <span style={{ color: '#22D3EE', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid #22D3EE11' }}>
                  {/* Matched datasets */}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 4 }}>
                        DATASETS ({row.matchedDatasets.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedDatasets.slice(0, 5).map((ds, di) => (
                          <span key={di} style={{
                            background: '#A78BFA22', border: '1px solid #A78BFA44',
                            color: '#A78BFA', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {ds.name || ds.title || `dataset-${di}`}
                            {ds.row_count != null && (
                              <span style={{
                                marginLeft: 5, background: '#A78BFA22',
                                color: '#C4B5FD', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>{Number(ds.row_count).toLocaleString()} rows</span>
                            )}
                          </span>
                        ))}
                        {row.matchedDatasets.length > 5 && (
                          <span style={{ color: '#475569', fontSize: 10 }}>
                            +{row.matchedDatasets.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Matched contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 4 }}>
                        CONTACTS ({row.matchedContacts.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedContacts.slice(0, 5).map((c, ci) => (
                          <span key={ci} style={{
                            background: '#F59E0B22', border: '1px solid #F59E0B44',
                            color: '#F59E0B', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {c.name || c.title || `contact-${ci}`}
                            {(c.role || c.org || c.organization) && (
                              <span style={{
                                marginLeft: 5, background: '#F59E0B22',
                                color: '#FCD34D', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>
                                {[c.role, c.org || c.organization].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                        ))}
                        {row.matchedContacts.length > 5 && (
                          <span style={{ color: '#475569', fontSize: 10 }}>
                            +{row.matchedContacts.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Matched graph nodes */}
                  {row.matchedNodes.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 4 }}>
                        GRAPH NODES ({row.matchedNodes.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedNodes.slice(0, 5).map((n, ni) => (
                          <span key={ni} style={{
                            background: '#38BDF822', border: '1px solid #38BDF844',
                            color: '#38BDF8', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {n.name || n.title || n.label || `node-${ni}`}
                            {n.centrality != null && (
                              <span style={{
                                marginLeft: 5, background: '#38BDF822',
                                color: '#7DD3FC', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>{Number(n.centrality).toFixed(3)}</span>
                            )}
                          </span>
                        ))}
                        {row.matchedNodes.length > 5 && (
                          <span style={{ color: '#475569', fontSize: 10 }}>
                            +{row.matchedNodes.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {row.matchedDatasets.length === 0 && row.matchedContacts.length === 0 && row.matchedNodes.length === 0 && (
                    <div style={{ color: '#8899AA', fontSize: 11, marginTop: 8 }}>
                      No datasets, contacts, or graph nodes matched this swarm job.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
