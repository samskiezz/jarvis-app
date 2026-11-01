/**
 * F266 — Report × Dataset × Contact × SwarmJob Intelligence Production Authority Chain
 * ◈ RDCSP
 *
 * For each report, cross-references against datasets, contacts, and swarm jobs
 * to assess whether the intelligence filing has a data source, a named owner,
 * and an automated production pipeline behind it.
 *
 * AUTHORITATIVE — contact + dataset + swarm job all match.
 * OWNED         — two of three sources match.
 * ACTIVE        — one source matches.
 * ADRIFT        — no contact, no dataset, no swarm job — orphaned report.
 *
 * Data sources (real endpoints):
 *   GET /v1/reports           → filed intelligence reports
 *   GET /v1/datasets          → registered datasets
 *   GET /entities/Contact     → personnel contacts
 *   GET /entities/SwarmJob    → running / completed swarm jobs
 *
 * Stat tiles:  reports / datasets / contacts / swarm jobs /
 *              authoritative / owned / active / adrift
 * Red badge:   adrift count on button.
 * Expand row:  matched contacts with role/org
 *              + matched datasets with row-count badge
 *              + matched swarm jobs with status badge.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ RDCSP at left:196760 bottom:18, zIndex:362.
 * Event:   jarvis:rdcsp-toggle
 * Voice:   "report production chain / rdcsp / adrift reports / orphaned reports /
 *           report authority / report dataset contact swarm / intelligence authority chain /
 *           report production coverage / report data ownership"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const RDCSP_RE =
  /\b(report[._-]?production[._-]?chain|rdcsp|adrift[._-]?reports?|orphaned[._-]?reports?|report[._-]?authority|report[._-]?dataset[._-]?contact[._-]?swarm|intelligence[._-]?authority[._-]?chain|report[._-]?production[._-]?coverage|report[._-]?data[._-]?ownership)\b/i;

export function isRdcspQuery(t) {
  return RDCSP_RE.test(t || '');
}

// ─── normalisers ─────────────────────────────────────────────────────────────

function normReports(raw) {
  if (!raw) return [];
  for (const k of ['reports', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normDatasets(raw) {
  if (!raw) return [];
  for (const k of ['datasets', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normContacts(raw) {
  if (!raw) return [];
  for (const k of ['contacts', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normSwarmJobs(raw) {
  if (!raw) return [];
  for (const k of ['swarm_jobs', 'swarmJobs', 'jobs', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function reportTokens(r) {
  return tokens(
    [r.title, r.name, r.description, r.type, r.category, r.author,
     r.subject, r.summary,
     ...(Array.isArray(r.tags) ? r.tags : [])].join(' ')
  );
}

function datasetTokens(d) {
  return tokens(
    [d.name, d.title, d.description, d.type, d.category, d.source,
     d.owner, d.domain,
     ...(Array.isArray(d.tags) ? d.tags : [])].join(' ')
  );
}

function contactTokens(c) {
  return tokens(
    [c.name, c.full_name, c.fullName, c.role, c.organization, c.org,
     c.company, c.department, c.email,
     ...(Array.isArray(c.tags) ? c.tags : [])].join(' ')
  );
}

function swarmTokens(j) {
  return tokens(
    [j.name, j.title, j.description, j.type, j.status, j.job_type,
     j.target, j.agent,
     ...(Array.isArray(j.tags) ? j.tags : [])].join(' ')
  );
}

function score(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const a = new Set(aToks);
  const b = new Set(bToks);
  let hits = 0;
  for (const tt of a) if (b.has(tt)) hits++;
  return hits / Math.max(a.size, b.size);
}

// ─── enrichment ───────────────────────────────────────────────────────────────

const THRESHOLD = 0.05;

function enrich(reports, datasets, contacts, swarmJobs) {
  return reports.map(report => {
    const rt = reportTokens(report);
    const dMatches = datasets
      .map(d => ({ d, score: score(rt, datasetTokens(d)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const cMatches = contacts
      .map(c => ({ c, score: score(rt, contactTokens(c)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const sMatches = swarmJobs
      .map(j => ({ j, score: score(rt, swarmTokens(j)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasD = dMatches.length > 0;
    const hasC = cMatches.length > 0;
    const hasS = sMatches.length > 0;
    const matchCount = (hasD ? 1 : 0) + (hasC ? 1 : 0) + (hasS ? 1 : 0);
    const _class = matchCount === 3
      ? 'AUTHORITATIVE'
      : matchCount === 2
      ? 'OWNED'
      : matchCount === 1
      ? 'ACTIVE'
      : 'ADRIFT';
    return { ...report, _class, _dMatches: dMatches, _cMatches: cMatches, _sMatches: sMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildRdcspScript() {
  const [rpR, dsR, ctR, swR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const reports   = normReports(rpR.status === 'fulfilled' ? rpR.value : []);
  const datasets  = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const contacts  = normContacts(ctR.status === 'fulfilled' ? ctR.value : []);
  const swarmJobs = normSwarmJobs(swR.status === 'fulfilled' ? swR.value : []);
  const enriched  = enrich(reports, datasets, contacts, swarmJobs);
  const adrift    = enriched.filter(e => e._class === 'ADRIFT').length;
  const auth      = enriched.filter(e => e._class === 'AUTHORITATIVE').length;
  const adriftTitles = enriched
    .filter(e => e._class === 'ADRIFT').slice(0, 3)
    .map(e => e.title || e.name || e.id).join(', ');
  return (
    `Report × Dataset × Contact × SwarmJob Intelligence Production Authority Chain: ${reports.length} reports ` +
    `cross-referenced against ${datasets.length} datasets, ${contacts.length} contacts, ${swarmJobs.length} swarm jobs. ` +
    `${auth} AUTHORITATIVE (all 3 sources); ${adrift} ADRIFT — no dataset, no contact, no swarm pipeline ` +
    `(gaps: ${adriftTitles || 'none'}).`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const PRP = '#B485FF';
const RED = '#FF4D6D';

const CLASS_COL = {
  AUTHORITATIVE: GRN,
  OWNED:         CY,
  ACTIVE:        PRP,
  ADRIFT:        RED,
};

const FILTER_TABS = ['ALL', 'AUTHORITATIVE', 'OWNED', 'ACTIVE', 'ADRIFT'];

const STATUS_COL = {
  running: GRN, completed: CY, pending: AMB, failed: RED,
  active: GRN, done: CY, error: RED,
};

const BASE = {
  position: 'fixed',
  fontFamily: "'JetBrains Mono', monospace",
  color: '#DCEBF5',
  zIndex: 362,
};

const PANEL = {
  ...BASE,
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(4,8,14,0.92)',
  backdropFilter: 'blur(14px)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

function Tile({ label, value, col }) {
  return (
    <div style={{ flex: '1 1 90px', minWidth: 90, padding: '8px 10px',
      background: 'rgba(41,231,255,0.04)',
      border: `1px solid ${col || CY}33`, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col || CY }}>{value ?? '—'}</div>
      <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Bar({ pct, col }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, borderRadius: 2,
        background: col || CY, transition: 'width 0.4s' }} />
    </div>
  );
}

function Badge({ label, col }) {
  return (
    <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
      border: `1px solid ${col || CY}55`, color: col || CY, letterSpacing: 1 }}>
      {label}
    </span>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportDatasetContactSwarmProductionChain() {
  const [open, setOpen]           = useState(false);
  const [reports, setReports]     = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [swarmJobs, setSwarmJobs] = useState([]);
  const [enriched, setEnriched]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const headers = { Authorization: `Bearer ${API_KEY}` };

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rpR, dsR, ctR, swR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers }).then(r => r.json()),
        fetch(`${API}/entities/Contact`, { headers }).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`, { headers }).then(r => r.json()),
      ]);
      const rp = normReports(rpR.status === 'fulfilled' ? rpR.value : []);
      const ds = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      const ct = normContacts(ctR.status === 'fulfilled' ? ctR.value : []);
      const sw = normSwarmJobs(swR.status === 'fulfilled' ? swR.value : []);
      setReports(rp); setDatasets(ds); setContacts(ct); setSwarmJobs(sw);
      setEnriched(enrich(rp, ds, ct, sw));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:rdcsp-toggle', handler);
    return () => window.removeEventListener('jarvis:rdcsp-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90_000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  const adrift = enriched.filter(e => e._class === 'ADRIFT').length;
  const auth   = enriched.filter(e => e._class === 'AUTHORITATIVE').length;
  const owned  = enriched.filter(e => e._class === 'OWNED').length;
  const active = enriched.filter(e => e._class === 'ACTIVE').length;

  const visible = enriched.filter(e => {
    if (filter !== 'ALL' && e._class !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [e.title, e.name, e.description, e.type, e.id]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const handleAssess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const prompt =
        `Report × Dataset × Contact × SwarmJob Intelligence Production Authority Chain: ${reports.length} reports, ` +
        `${datasets.length} datasets, ${contacts.length} contacts, ${swarmJobs.length} swarm jobs. ` +
        `${auth} AUTHORITATIVE, ${owned} OWNED, ${active} ACTIVE, ${adrift} ADRIFT. ` +
        `Top adrift reports: ${enriched.filter(e => e._class === 'ADRIFT')
          .slice(0, 3).map(e => e.title || e.name || e.id).join(', ') || 'none'}. ` +
        `Provide a 2-sentence intelligence brief on report production authority gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const text = res.response || res.content || res.message || res.text || '';
      setAssessText(text);
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessText('Assessment unavailable: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report × Dataset × Contact × SwarmJob Intelligence Production Authority Chain (RDCSP)"
        style={{
          ...BASE,
          left: 196760, bottom: 18, padding: '4px 10px',
          background: 'rgba(4,8,14,0.75)',
          border: `1px solid ${adrift > 0 ? RED : CY}55`,
          borderRadius: 6, cursor: 'pointer', fontSize: 11,
          color: adrift > 0 ? RED : CY,
          boxShadow: adrift > 0 ? `0 0 12px ${RED}33` : 'none',
        }}
      >
        ◈ RDCSP{adrift > 0 && (
          <span style={{ marginLeft: 5, background: RED, color: '#fff',
            borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
            {adrift}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      {/* header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${CY}22`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          ◈ REPORT × DATASET × CONTACT × SWARM PRODUCTION AUTHORITY CHAIN
        </span>
        {adrift > 0 && (
          <span style={{ background: RED, color: '#fff', borderRadius: 8,
            padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
            {adrift} ADRIFT
          </span>
        )}
        {loading && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6E8AA0' }}>loading…</span>}
        {error && <span style={{ marginLeft: 'auto', fontSize: 10, color: RED }}>{error}</span>}
        <button onClick={() => setOpen(false)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none',
            color: '#6E8AA0', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 18px',
        flexShrink: 0, borderBottom: `1px solid ${CY}11` }}>
        <Tile label="REPORTS"       value={reports.length}   col={CY} />
        <Tile label="DATASETS"      value={datasets.length}  col={PRP} />
        <Tile label="CONTACTS"      value={contacts.length}  col={CY} />
        <Tile label="SWARM JOBS"    value={swarmJobs.length} col={AMB} />
        <Tile label="AUTHORITATIVE" value={auth}             col={GRN} />
        <Tile label="OWNED"         value={owned}            col={CY} />
        <Tile label="ACTIVE"        value={active}           col={PRP} />
        <Tile label="ADRIFT"        value={adrift}           col={RED} />
      </div>

      {/* filter + search */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 18px', flexShrink: 0,
        flexWrap: 'wrap', borderBottom: `1px solid ${CY}11` }}>
        {FILTER_TABS.map(tab => (
          <button key={tab} onClick={() => setFilter(tab)}
            style={{ padding: '3px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
              background: filter === tab ? CY : 'rgba(41,231,255,0.05)',
              color: filter === tab ? '#04060A' : CY,
              border: `1px solid ${CY}44`, fontFamily: 'inherit', letterSpacing: 1 }}>
            {tab}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(41,231,255,0.05)',
            border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
            fontFamily: 'inherit', fontSize: 11, outline: 'none', minWidth: 160 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', padding: 40, fontSize: 12 }}>
            No reports match current filter.
          </div>
        )}
        {visible.map((report, i) => {
          const col   = CLASS_COL[report._class] || CY;
          const rowId = report.id || report.report_id || i;
          const isExp = expanded === rowId;
          const dateStr = report.date || report.created_at || report.published_at || '';
          return (
            <div key={rowId}
              style={{ marginBottom: 6, border: `1px solid ${col}22`, borderRadius: 8,
                background: 'rgba(4,8,14,0.5)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : rowId)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 120 }}>
                  {report._class}
                </span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {report.title || report.name || report.id || '—'}
                </span>
                {dateStr && (
                  <Badge label={String(dateStr).slice(0, 10)} col={CY} />
                )}
                <span style={{ color: '#6E8AA0', fontSize: 10, marginLeft: 4 }}>
                  {report._dMatches.length}D · {report._cMatches.length}C · {report._sMatches.length}S
                </span>
                <span style={{ color: '#6E8AA0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: `1px solid ${col}22` }}>
                  {report.description && (
                    <div style={{ fontSize: 11, color: '#8AAABB', padding: '6px 0' }}>
                      {report.description}
                    </div>
                  )}

                  {/* matched contacts */}
                  {report._cMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED CONTACTS ({report._cMatches.length})
                      </div>
                      {report._cMatches.map((m, ci) => {
                        const role = m.c.role || m.c.department || '';
                        const org  = m.c.organization || m.c.org || m.c.company || '';
                        return (
                          <div key={ci} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                              {role && <Badge label={role.toUpperCase()} col={CY} />}
                              {org  && <Badge label={org.toUpperCase()}  col={PRP} />}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.c.name || m.c.full_name || m.c.fullName || m.c.id}
                              </span>
                              <span style={{ fontSize: 10, color: CY }}>
                                {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <Bar pct={m.score} col={CY} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* matched datasets */}
                  {report._dMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: PRP, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED DATASETS ({report._dMatches.length})
                      </div>
                      {report._dMatches.map((m, di) => {
                        const rows = m.d.row_count ?? m.d.rowCount ?? m.d.rows ?? m.d.count;
                        return (
                          <div key={di} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                              {rows != null && (
                                <Badge label={`${rows.toLocaleString()} rows`} col={PRP} />
                              )}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.d.name || m.d.title || m.d.id}
                              </span>
                              <span style={{ fontSize: 10, color: PRP }}>
                                {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <Bar pct={m.score} col={PRP} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* matched swarm jobs */}
                  {report._sMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED SWARM JOBS ({report._sMatches.length})
                      </div>
                      {report._sMatches.map((m, si) => {
                        const status = (m.j.status || '').toLowerCase();
                        return (
                          <div key={si} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                              {status && (
                                <Badge label={status.toUpperCase()} col={STATUS_COL[status] || AMB} />
                              )}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.j.name || m.j.title || m.j.id}
                              </span>
                              <span style={{ fontSize: 10, color: AMB }}>
                                {Math.round(m.score * 100)}%
                              </span>
                            </div>
                            <Bar pct={m.score} col={AMB} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {report._dMatches.length === 0 && report._cMatches.length === 0 && report._sMatches.length === 0 && (
                    <div style={{ fontSize: 11, color: RED, padding: '6px 0' }}>
                      No dataset, contact, or swarm job references this report — orphaned intelligence filing.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess footer */}
      <div style={{ padding: '10px 18px', borderTop: `1px solid ${CY}22`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleAssess} disabled={assessing}
          style={{ padding: '5px 14px', background: 'none', border: `1px solid ${CY}66`,
            borderRadius: 5, color: CY, cursor: assessing ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 11 }}>
          {assessing ? '⋯ assessing…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 11, color: '#AABBC8', flex: 1 }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
