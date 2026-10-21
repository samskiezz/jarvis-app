/**
 * OpsAlertBrainDatasetReportContinuity — F103
 *
 * Fetches /v1/ops/alerts + /v1/cinematic/brain + /v1/datasets + /v1/reports.
 *
 * Keyword-matches each ops alert (title/description/category/type) against
 * brain node labels/types, dataset names/descriptions, and report titles/categories
 * to classify:
 *
 *   CONTINUOUS — alert matches brain AND dataset AND report
 *                (fully grounded: modeled, data-backed, and documented)
 *   MODELED    — alert matches brain + at least one other source
 *                (model-supported but partially grounded)
 *   DATAED     — alert matches dataset or report but NO brain model
 *                (data-backed but unmodeled)
 *   BLIND      — no match to any source (ungrounded operational blind spot)
 *
 * Toggle: ◈ OABDCONT button (fixed, bottom strip) left:106040, zIndex:200
 * Stat tiles: alerts / brain-nodes / datasets / reports / continuous / modeled / dataed / blind
 * Red pulse on BLIND count (ungrounded operational blind spots).
 * Expandable rows: matched brain nodes with centrality score badge +
 *                  matched datasets with row-count badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / CONTINUOUS / MODELED / DATAED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "oabdcont"/"ops continuity"/"operational continuity"/"ops brain data report"
 *        "intelligence continuity"/"alert coverage continuity"/"ops intelligence continuity"
 *        "brain alert report"/"data alert continuity"/"alert blind spots"
 *        "ops coverage gaps"/"alert grounding"/"continuity check"
 * Event: jarvis:oabdcont-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CONTINUOUS', 'MODELED', 'DATAED', 'BLIND'];

const CLS_COLOR = {
  CONTINUOUS: '#22C55E',
  MODELED:    '#38BDF8',
  DATAED:     '#F97316',
  BLIND:      '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
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

export function isOabdcontQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'oabdcont', 'ops continuity', 'operational continuity',
    'ops brain data report', 'intelligence continuity',
    'alert coverage continuity', 'ops intelligence continuity',
    'brain alert report', 'data alert continuity', 'alert blind spots',
    'ops coverage gaps', 'alert grounding', 'continuity check',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

async function fetchBrainNodes() {
  const data = await fetcher('/v1/cinematic/brain');
  const nodes = normalizeArray(data, ['nodes', 'items', 'data', 'results']);
  if (nodes.length) return nodes;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = ['node_count', 'total_nodes', 'synapses'];
    const labels = [];
    for (const k of Object.keys(data)) {
      if (typeof data[k] === 'string') labels.push({ label: data[k], id: k });
    }
    if (labels.length) return labels;
    return [{ label: 'JARVIS Brain', id: 'brain', centrality: data.node_count || 0 }];
  }
  return [];
}

export default function OpsAlertBrainDatasetReportContinuity() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [brainNodes, setBrainNodes] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [reports, setReports]   = useState([]);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [alertsRaw, brainRaw, datasetsRaw, reportsRaw] = await Promise.all([
        fetcher('/v1/ops/alerts').catch(() => []),
        fetchBrainNodes().catch(() => []),
        fetcher('/v1/datasets').catch(() => []),
        fetcher('/v1/reports').catch(() => []),
      ]);

      const alerts   = normalizeArray(alertsRaw,   ['alerts', 'items', 'data', 'results']);
      const brain    = Array.isArray(brainRaw) ? brainRaw : [];
      const dsets    = normalizeArray(datasetsRaw, ['datasets', 'items', 'data', 'results']);
      const rpts     = normalizeArray(reportsRaw,  ['reports', 'items', 'data', 'results']);

      setBrainNodes(brain);
      setDatasets(dsets);
      setReports(rpts);

      const built = alerts.map((a, idx) => {
        const id    = a.id || a._id || String(idx);
        const title = a.title || a.name || a.message || a.summary || `Alert ${idx + 1}`;
        const desc  = [a.description, a.category, a.type, a.source, a.details]
          .filter(Boolean).join(' ');
        const aToks = tokens(`${title} ${desc}`);

        const matchedBrain = brain.filter(n => {
          const nStr = [n.label, n.type, n.description, n.name].filter(Boolean).join(' ');
          return overlaps(aToks, nStr);
        });
        const matchedDatasets = dsets.filter(d => {
          const dStr = [d.name, d.title, d.description, d.category, d.type].filter(Boolean).join(' ');
          return overlaps(aToks, dStr);
        });
        const matchedReports = rpts.filter(r => {
          const rStr = [r.title, r.name, r.category, r.description, r.summary].filter(Boolean).join(' ');
          return overlaps(aToks, rStr);
        });

        const hasBrain   = matchedBrain.length > 0;
        const hasDataset = matchedDatasets.length > 0;
        const hasReport  = matchedReports.length > 0;

        let cls;
        if (hasBrain && hasDataset && hasReport)       cls = 'CONTINUOUS';
        else if (hasBrain && (hasDataset || hasReport)) cls = 'MODELED';
        else if (hasDataset || hasReport)               cls = 'DATAED';
        else                                            cls = 'BLIND';

        return {
          id, title, desc,
          severity: (a.severity || a.level || a.priority || '').toLowerCase(),
          cls, matchedBrain, matchedDatasets, matchedReports,
        };
      });

      setRows(built);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:oabdcont-toggle', handler);
    return () => window.removeEventListener('jarvis:oabdcont-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    const blind  = rows.filter(r => r.cls === 'BLIND').length;
    const total  = rows.length;
    const prompt = `Ops Alert Intelligence Continuity audit: ${total} alerts total. ${blind} BLIND (no brain model, no dataset, no report — operational blind spots). Provide a 2-sentence advisory on which alert categories to prioritize for intelligence grounding.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.content || data.text || '';
      setAssessment(text);
      if (text) {
        fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        }).then(r => r.blob()).then(blob => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch (e) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const counts = {
    continuous: rows.filter(r => r.cls === 'CONTINUOUS').length,
    modeled:    rows.filter(r => r.cls === 'MODELED').length,
    dataed:     rows.filter(r => r.cls === 'DATAED').length,
    blind:      rows.filter(r => r.cls === 'BLIND').length,
  };

  const filtered = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.title.toLowerCase().includes(s) || r.desc.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 106040,
          zIndex: 200, background: 'rgba(0,0,0,0.85)',
          border: '1px solid #334155', color: '#94A3B8',
          padding: '3px 8px', borderRadius: 4, fontSize: 11,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        ◈ OABDCONT
        {counts.blind > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff',
            borderRadius: 8, padding: '0 5px', fontSize: 10,
            animation: 'pulse 1.5s infinite',
          }}>{counts.blind}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, width: 560, maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(0,0,0,0.95)', border: '1px solid #1E3A5F',
      borderRadius: 8, zIndex: 9200, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #1E3A5F',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(14,30,54,0.9)',
      }}>
        <div>
          <div style={{ color: '#38BDF8', fontSize: 13, fontWeight: 700 }}>
            ◈ OABDCONT — Ops Alert Intelligence Continuity
          </div>
          <div style={{ color: '#64748B', fontSize: 10, marginTop: 2 }}>
            /v1/ops/alerts × /v1/cinematic/brain × /v1/datasets × /v1/reports
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#64748B',
          cursor: 'pointer', fontSize: 16, padding: '0 4px',
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6, padding: '10px 14px', borderBottom: '1px solid #1E3A5F',
      }}>
        {[
          { label: 'ALERTS',     val: rows.length,       color: '#94A3B8' },
          { label: 'CONTINUOUS', val: counts.continuous,  color: CLS_COLOR.CONTINUOUS },
          { label: 'MODELED',    val: counts.modeled,     color: CLS_COLOR.MODELED },
          { label: 'DATAED',     val: counts.dataed,      color: CLS_COLOR.DATAED },
          { label: 'BLIND',      val: counts.blind,       color: CLS_COLOR.BLIND },
          { label: 'BRAIN',      val: brainNodes.length,  color: '#818CF8' },
          { label: 'DATASETS',   val: datasets.length,    color: '#22D3EE' },
          { label: 'REPORTS',    val: reports.length,     color: '#A78BFA' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(30,58,95,0.4)', border: '1px solid #1E3A5F',
            borderRadius: 4, padding: '5px 8px', textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{
        padding: '6px 14px', borderBottom: '1px solid #1E3A5F',
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CLS_COLOR[t] || '#38BDF8' : 'rgba(30,58,95,0.4)',
            border: '1px solid ' + (tab === t ? CLS_COLOR[t] || '#38BDF8' : '#1E3A5F'),
            color: tab === t ? '#000' : '#94A3B8',
            padding: '2px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,58,95,0.4)',
            border: '1px solid #1E3A5F', color: '#94A3B8',
            padding: '2px 8px', borderRadius: 3, fontSize: 10,
            outline: 'none', width: 130,
          }}
        />
      </div>

      {/* ASSESS */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1E3A5F' }}>
        <button onClick={assess} disabled={assessing} style={{
          background: 'rgba(56,189,248,0.1)', border: '1px solid #38BDF8',
          color: '#38BDF8', padding: '3px 10px', borderRadius: 3,
          fontSize: 10, cursor: 'pointer',
        }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        {assessment && (
          <div style={{
            marginTop: 6, color: '#CBD5E1', fontSize: 11,
            lineHeight: 1.5, background: 'rgba(30,58,95,0.3)',
            padding: '6px 8px', borderRadius: 4, borderLeft: '2px solid #38BDF8',
          }}>{assessment}</div>
        )}
      </div>

      {/* Status bar */}
      {(loading || err) && (
        <div style={{
          padding: '4px 14px', fontSize: 10,
          color: err ? '#EF4444' : '#64748B',
        }}>
          {loading ? '⟳ loading…' : `⚠ ${err}`}
        </div>
      )}

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {filtered.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, padding: '10px 14px' }}>
            No alerts match current filter.
          </div>
        )}
        {filtered.map(row => {
          const sev = row.severity;
          const sc  = SEV_COLOR[sev] || '#6B7280';
          const cc  = CLS_COLOR[row.cls];
          return (
            <div
              key={row.id}
              onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{
                padding: '7px 14px',
                borderBottom: '1px solid rgba(30,58,95,0.5)',
                cursor: 'pointer',
                background: expanded[row.id] ? 'rgba(30,58,95,0.3)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: cc + '22', border: `1px solid ${cc}`,
                  color: cc, padding: '1px 6px', borderRadius: 3,
                  fontSize: 9, fontWeight: 700, minWidth: 74, textAlign: 'center',
                }}>{row.cls}</span>
                {sev && (
                  <span style={{
                    background: sc + '22', border: `1px solid ${sc}`,
                    color: sc, padding: '1px 5px', borderRadius: 3, fontSize: 9,
                  }}>{sev}</span>
                )}
                <span style={{ color: '#CBD5E1', fontSize: 11, flex: 1 }}>{row.title}</span>
                <span style={{ color: '#475569', fontSize: 10 }}>
                  {row.matchedBrain.length}B · {row.matchedDatasets.length}D · {row.matchedReports.length}R
                </span>
                <span style={{ color: '#6B7280' }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingTop: 6, paddingBottom: 4 }}>
                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: '#818CF8', fontSize: 10, marginBottom: 3 }}>BRAIN NODES</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.matchedBrain.slice(0, 8).map((n, i) => {
                          const score = n.centrality ?? n.score ?? n.weight ?? null;
                          return (
                            <span key={i} style={{
                              background: 'rgba(129,140,248,0.1)', border: '1px solid #818CF8',
                              color: '#C7D2FE', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            }}>
                              {n.label || n.name || `Node ${i + 1}`}
                              {score !== null && (
                                <span style={{
                                  background: 'rgba(129,140,248,0.2)', border: '1px solid #818CF8',
                                  color: '#818CF8', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                                }}>{typeof score === 'number' ? score.toFixed(3) : score}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Datasets */}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>DATASETS</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.matchedDatasets.slice(0, 8).map((d, i) => {
                          const rows2 = d.row_count ?? d.rows ?? d.count ?? d.size ?? null;
                          return (
                            <span key={i} style={{
                              background: 'rgba(34,211,238,0.1)', border: '1px solid #22D3EE',
                              color: '#A5F3FC', padding: '1px 6px', borderRadius: 3, fontSize: 10,
                            }}>
                              {d.name || d.title || `Dataset ${i + 1}`}
                              {rows2 !== null && (
                                <span style={{
                                  background: 'rgba(34,211,238,0.2)', border: '1px solid #22D3EE',
                                  color: '#22D3EE', marginLeft: 4, padding: '0 4px', borderRadius: 2, fontSize: 9,
                                }}>{rows2.toLocaleString()}r</span>
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
                          const dateShort = date ? new Date(date).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: '2-digit',
                          }) : '';
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

                  {row.matchedBrain.length === 0 && row.matchedDatasets.length === 0 && row.matchedReports.length === 0 && (
                    <div style={{ color: '#6B7280', fontSize: 11, padding: '2px 0' }}>
                      No matching brain nodes, datasets, or reports — blind operational gap.
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
