/**
 * OpsAlertDatasetScenarioKnowledgeContactFoundation — F213
 *
 * Fetches /v1/ops/alerts + /v1/datasets + /v1/scenario/list +
 *         /knowledge/ + /entities/Contact.
 *
 * Keyword-matches each ops alert (name/type/description/severity) against
 * dataset names/descriptions, scenario names/descriptions, knowledge article
 * titles/categories, and contact names/roles/orgs to classify:
 *
 *   GROUNDED  — alert matches a dataset + scenario + knowledge + contact
 *               (fully evidenced: data-linked, playbook-staged, documented, owned)
 *   STAGED    — alert matches a scenario + at least two other sources (no full coverage)
 *               (playbook exists but not fully grounded)
 *   PARTIAL   — alert matches at least one source but not GROUNDED/STAGED
 *               (some grounding present)
 *   BLIND     — no match to any source
 *               (incident blind spot — unmonitored, undocumented, unowned)
 *
 * Toggle: ◈ ODSKFC button (fixed, bottom strip) left:167080, zIndex:309
 * Stat tiles: alerts / datasets / scenarios / articles / contacts / grounded / staged / partial / blind
 * Red pulse on BLIND count (full incident blind spots).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched scenarios with status badge +
 *                  matched knowledge articles with category badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / GROUNDED / STAGED / PARTIAL / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "odskfc"/"incident evidence"/"alert foundation"/"blind alert"
 *        "alert coverage"/"incident blind spot"/"alert dataset"
 *        "ops evidence"/"incident knowledge"/"alert grounding"
 *        "incident scenario"/"ops alert foundation"/"alert ground"
 * Event: jarvis:odskfc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'GROUNDED', 'STAGED', 'PARTIAL', 'BLIND'];

const CLS_COLOR = {
  GROUNDED: '#22C55E',
  STAGED:   '#38BDF8',
  PARTIAL:  '#F97316',
  BLIND:    '#EF4444',
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

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.datasets))    return raw.datasets;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.items))        return raw.items;
  if (Array.isArray(raw?.scenarios))    return raw.scenarios;
  if (Array.isArray(raw?.results))      return raw.results;
  if (Array.isArray(raw?.data))         return raw.data;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.items))        return raw.items;
  if (Array.isArray(raw?.articles))     return raw.articles;
  if (Array.isArray(raw?.knowledge))    return raw.knowledge;
  if (Array.isArray(raw?.results))      return raw.results;
  if (Array.isArray(raw?.data))         return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.contacts))   return raw.contacts;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  if (Array.isArray(raw?.entities))   return raw.entities;
  return [];
}

export function isOdskfcQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'odskfc', 'incident evidence', 'alert foundation', 'blind alert',
    'alert coverage', 'incident blind spot', 'alert dataset',
    'ops evidence', 'incident knowledge', 'alert grounding',
    'incident scenario', 'ops alert foundation', 'alert ground',
  ].some(k => s.includes(k));
}

export function buildOdskfcScript() {
  return (
    'Fetch /v1/ops/alerts, /v1/datasets, /v1/scenario/list, /knowledge/, and /entities/Contact. ' +
    'Keyword-match each ops alert (name/type/description/severity) against dataset names/descriptions, ' +
    'scenario names/descriptions, knowledge article titles/categories, and contact names/roles/orgs. ' +
    'Classify each alert as GROUNDED (matches dataset + scenario + knowledge + contact), ' +
    'STAGED (matches a scenario + at least two other sources), ' +
    'PARTIAL (matches at least one source), ' +
    'or BLIND (no match to any source — incident evidence blind spot). ' +
    'Report total BLIND count, identify which blind alerts carry the highest operational risk ' +
    '(by severity, type, or recency), and recommend which datasets should be linked, ' +
    'which scenarios should be staged, which knowledge articles should be written, ' +
    'and which contacts should be assigned ownership to eliminate incident blind spots.'
  );
}

export default function OpsAlertDatasetScenarioKnowledgeContactFoundation() {
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
    alerts: 0, datasets: 0, scenarios: 0, articles: 0, contacts: 0,
    grounded: 0, staged: 0, partial: 0, blind: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [alertsRaw, datasetsRaw, scenariosRaw, knowledgeRaw, contactsRaw] = await Promise.all([
        fetch(`${API}/v1/ops/alerts`,       { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/datasets`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/knowledge/`,          { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const alerts    = normalizeAlerts(alertsRaw);
      const datasets  = normalizeDatasets(datasetsRaw);
      const scenarios = normalizeScenarios(scenariosRaw);
      const articles  = normalizeKnowledge(knowledgeRaw);
      const contacts  = normalizeContacts(contactsRaw);

      const built = alerts.map((alert, idx) => {
        const alertText = [
          alert.name, alert.title, alert.type, alert.alert_type, alert.alertType,
          alert.description, alert.message, alert.severity, alert.level,
          alert.category, alert.source, alert.tags?.join?.(' '),
        ].filter(Boolean).join(' ');
        const aToks = tokens(alertText);

        const matchedDatasets = datasets.filter(ds => {
          const s = [ds.name, ds.title, ds.description, ds.type, ds.category, ds.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const matchedScenarios = scenarios.filter(sc => {
          const s = [sc.name, sc.title, sc.description, sc.type, sc.category, sc.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const matchedArticles = articles.filter(art => {
          const s = [
            art.title, art.name, art.category, art.description,
            art.type, art.tags?.join?.(' '), art.content?.slice?.(0, 200),
          ].filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const matchedContacts = contacts.filter(c => {
          const s = [c.name, c.role, c.title, c.org, c.organisation, c.organization, c.description]
            .filter(Boolean).join(' ');
          return overlaps(aToks, s);
        });

        const hasDs       = matchedDatasets.length > 0;
        const hasSc       = matchedScenarios.length > 0;
        const hasArt      = matchedArticles.length > 0;
        const hasContact  = matchedContacts.length > 0;

        const matchCount = [hasDs, hasSc, hasArt, hasContact].filter(Boolean).length;

        let cls;
        if (hasDs && hasSc && hasArt && hasContact) {
          cls = 'GROUNDED';
        } else if (hasSc && matchCount >= 3) {
          cls = 'STAGED';
        } else if (matchCount >= 1) {
          cls = 'PARTIAL';
        } else {
          cls = 'BLIND';
        }

        const sev = (alert.severity || alert.level || alert.priority || 'medium').toLowerCase();

        return {
          id:               `alert-${idx}`,
          label:            alert.name || alert.title || alert.message || `Alert ${idx + 1}`,
          type:             alert.type || alert.alert_type || alert.alertType || '',
          severity:         sev,
          cls,
          matchedDatasets,
          matchedScenarios,
          matchedArticles,
          matchedContacts,
        };
      });

      const grounded = built.filter(r => r.cls === 'GROUNDED').length;
      const staged   = built.filter(r => r.cls === 'STAGED').length;
      const partial  = built.filter(r => r.cls === 'PARTIAL').length;
      const blind    = built.filter(r => r.cls === 'BLIND').length;

      setRows(built);
      setCounts({
        alerts:    built.length,
        datasets:  datasets.length,
        scenarios: scenarios.length,
        articles:  articles.length,
        contacts:  contacts.length,
        grounded, staged, partial, blind,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:odskfc-toggle', handler);
    return () => window.removeEventListener('jarvis:odskfc-toggle', handler);
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
        body:    JSON.stringify({ message: buildOdskfcScript() }),
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

  const pulse = counts.blind > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 167080, zIndex: 309,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ ODSKFC{counts.blind > 0 ? <span style={pulse}> {counts.blind}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 740, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.07)',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ ODSKFC — Incident Evidence Intelligence Foundation
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          {[
            ['Alerts',    counts.alerts,    '#94A3B8'],
            ['Datasets',  counts.datasets,  '#94A3B8'],
            ['Scenarios', counts.scenarios, '#94A3B8'],
            ['Articles',  counts.articles,  '#94A3B8'],
            ['Contacts',  counts.contacts,  '#94A3B8'],
            ['Grounded',  counts.grounded,  CLS_COLOR.GROUNDED],
            ['Staged',    counts.staged,    CLS_COLOR.STAGED],
            ['Partial',   counts.partial,   CLS_COLOR.PARTIAL],
            ['Blind',     counts.blind,     CLS_COLOR.BLIND],
          ].map(([lbl, val, clr]) => (
            <div key={lbl} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${clr}44`,
              borderRadius: 6, padding: '5px 10px', minWidth: 72, textAlign: 'center',
            }}>
              <div style={{ color: clr, fontSize: 18, fontWeight: 700,
                ...(lbl === 'Blind' && val > 0 ? pulse : {}) }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 10 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: tab === t ? CLS_COLOR[t] || '#EF4444' : 'rgba(255,255,255,0.05)',
              color: tab === t ? '#000' : '#94A3B8', border: 'none', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              marginLeft: 'auto', padding: '3px 8px', fontSize: 11, borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
              color: '#E2E8F0', fontFamily: 'monospace', width: 160,
            }} />
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          <button onClick={assess} disabled={assessing} style={{
            padding: '4px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
            background: assessing ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)',
            border: '1px solid #EF4444', color: '#EF4444', borderRadius: 4,
            fontFamily: 'monospace',
          }}>{assessing ? '⟳ Assessing…' : '▶ ASSESS'}</button>
          {assessment && (
            <div style={{ marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
              background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>

        {/* Error / loading */}
        {error   && <div style={{ padding: '8px 14px', color: '#EF4444', fontSize: 11 }}>Error: {error}</div>}
        {loading && <div style={{ padding: '8px 14px', color: '#64748B', fontSize: 11 }}>Loading…</div>}

        {/* Rows */}
        <div style={{ padding: '8px 14px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#475569', fontSize: 12, padding: '12px 0' }}>No alerts match this filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => toggleExpand(row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${CLS_COLOR[row.cls]}33`,
                }}
              >
                <span style={{
                  padding: '1px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`, color: CLS_COLOR[row.cls],
                  whiteSpace: 'nowrap',
                }}>{row.cls}</span>
                <span style={{
                  padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                  background: `${SEV_COLOR[row.severity] || '#94A3B8'}22`,
                  color: SEV_COLOR[row.severity] || '#94A3B8',
                  whiteSpace: 'nowrap',
                }}>{row.severity.toUpperCase()}</span>
                <span style={{ color: '#E2E8F0', fontSize: 12, flex: 1 }}>{row.label}</span>
                {row.type && <span style={{ color: '#64748B', fontSize: 10 }}>{row.type}</span>}
                <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }}>
                  {expanded[row.id] ? '▲' : '▼'}
                </span>
              </div>

              {expanded[row.id] && (
                <div style={{
                  marginTop: 2, marginLeft: 12, padding: '8px 12px',
                  background: 'rgba(0,0,0,0.3)', borderRadius: 4,
                  border: '1px solid rgba(239,68,68,0.1)',
                }}>
                  {/* Datasets */}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>DATASETS</div>
                      {row.matchedDatasets.map((ds, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(ds.row_count || ds.rowCount || ds.count) !== undefined && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(56,189,248,0.12)', color: '#38BDF8',
                            }}>{ds.row_count ?? ds.rowCount ?? ds.count} rows</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {ds.name || ds.title || 'Dataset'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Scenarios */}
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>SCENARIOS</div>
                      {row.matchedScenarios.map((sc, i) => {
                        const st = (sc.status || sc.state || '').toLowerCase();
                        const stColor = st === 'active' ? '#22C55E' : st === 'draft' ? '#F97316' : '#94A3B8';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            {st && (
                              <span style={{
                                padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                background: `${stColor}22`, color: stColor,
                              }}>{st.toUpperCase()}</span>
                            )}
                            <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                              {sc.name || sc.title || 'Scenario'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Knowledge articles */}
                  {row.matchedArticles.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>KNOWLEDGE</div>
                      {row.matchedArticles.map((art, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(art.category || art.type) && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(168,85,247,0.12)', color: '#A855F7',
                            }}>{art.category || art.type}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {art.title || art.name || 'Article'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>CONTACTS</div>
                      {row.matchedContacts.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>{c.name || c.email || 'Contact'}</span>
                          {(c.role || c.title) && (
                            <span style={{ color: '#64748B', fontSize: 10 }}>{c.role || c.title}</span>
                          )}
                          {(c.org || c.organisation || c.organization) && (
                            <span style={{ color: '#475569', fontSize: 10 }}>
                              @ {c.org || c.organisation || c.organization}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedDatasets.length === 0 && row.matchedScenarios.length === 0 &&
                   row.matchedArticles.length === 0 && row.matchedContacts.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 11 }}>No matching datasets, scenarios, knowledge articles, or contacts found.</div>
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
