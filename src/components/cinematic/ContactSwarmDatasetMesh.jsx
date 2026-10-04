/**
 * F271 — Contact × SwarmJob × Dataset Intelligence Mesh (CSDM)
 *
 * Answers: "For each contact, is there an active swarm job covering them AND a
 * dataset backing them in the intelligence corpus?"
 *
 * FULLY_COVERED  — at least one swarm job AND one dataset match this contact.
 * SWARM_ONLY     — a swarm job references the contact but no dataset backs them.
 * DATA_ONLY      — a dataset covers the contact but no swarm is active.
 * UNTRACKED      — neither swarm job nor dataset — blind spot.
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Contact    → contact roster
 *   GET /entities/SwarmJob   → active/queued swarm jobs
 *   GET /v1/datasets         → dataset catalog
 *
 * Stat tiles:  contacts / jobs / datasets / fully-covered / swarm-only / data-only / untracked
 * Amber badge: untracked count on button.
 * Expand row:  matched swarm jobs with status badge + relevance bar
 *              + matched datasets with category badge + relevance bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CSDM  at left:6000 bottom:18, zIndex:68.
 * Event:   jarvis:csdm-toggle
 * Voice:   "contact swarm dataset / csdm / contact mesh / swarm contact coverage /
 *           dataset contact / untracked contacts / contact intelligence mesh /
 *           who is untracked / contact dataset coverage"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const CSDM_RE =
  /\b(contact[._-]?swarm[._-]?dataset|csdm|contact[._-]?mesh|swarm[._-]?contact[._-]?coverage|dataset[._-]?contact|untracked[._-]?contacts?|contact[._-]?intelligence[._-]?mesh|contact[._-]?dataset[._-]?coverage|who[._-]?is[._-]?untracked)\b/i;

export function isCsdmQuery(t) {
  return CSDM_RE.test(t || '');
}

// ─── normalisers ─────────────────────────────────────────────────────────────

function normContacts(raw) {
  if (!raw) return [];
  for (const k of ['contacts', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normJobs(raw) {
  if (!raw) return [];
  for (const k of ['jobs', 'swarm_jobs', 'items', 'results', 'data']) {
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

// ─── keyword scoring ──────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function contactTokens(c) {
  return tokens(
    [c.name, c.email, c.organization, c.org, c.role, c.title,
     c.description, c.sector, c.region,
     ...(Array.isArray(c.tags) ? c.tags : [])].join(' ')
  );
}

function jobTokens(j) {
  return tokens(
    [j.name, j.description, j.target, j.objective, j.type,
     j.owner, j.agent,
     ...(Array.isArray(j.tags) ? j.tags : [])].join(' ')
  );
}

function datasetTokens(d) {
  return tokens(
    [d.name, d.title, d.description, d.category, d.source, d.type,
     d.owner, d.domain,
     ...(Array.isArray(d.tags) ? d.tags : [])].join(' ')
  );
}

function score(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const a = new Set(aToks);
  const b = new Set(bToks);
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.max(a.size, b.size);
}

// ─── enrichment ───────────────────────────────────────────────────────────────

const THRESHOLD = 0.06;

function enrich(contacts, jobs, datasets) {
  return contacts.map(c => {
    const ct = contactTokens(c);
    const jMatches = jobs
      .map(j => ({ j, score: score(ct, jobTokens(j)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const dMatches = datasets
      .map(d => ({ d, score: score(ct, datasetTokens(d)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasJ = jMatches.length > 0;
    const hasD = dMatches.length > 0;
    const _class = hasJ && hasD
      ? 'FULLY_COVERED'
      : hasJ
      ? 'SWARM_ONLY'
      : hasD
      ? 'DATA_ONLY'
      : 'UNTRACKED';
    return { ...c, _class, _jMatches: jMatches, _dMatches: dMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildCsdmScript() {
  const [cR, jR, dR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const contacts = normContacts(cR.status === 'fulfilled' ? cR.value : []);
  const jobs     = normJobs(jR.status === 'fulfilled' ? jR.value : []);
  const datasets = normDatasets(dR.status === 'fulfilled' ? dR.value : []);
  const enriched = enrich(contacts, jobs, datasets);
  const untracked = enriched.filter(e => e._class === 'UNTRACKED').length;
  const full      = enriched.filter(e => e._class === 'FULLY_COVERED').length;
  const untrackedNames = enriched
    .filter(e => e._class === 'UNTRACKED').slice(0, 3)
    .map(e => e.name || e.email || e.id).join(', ');
  return (
    `Contact × Swarm × Dataset Mesh: ${contacts.length} contacts cross-referenced against ` +
    `${jobs.length} swarm jobs and ${datasets.length} datasets. ` +
    `${full} contacts are FULLY_COVERED (swarm + dataset); ${untracked} are UNTRACKED — ` +
    `no swarm job and no dataset covers them (blind spots: ${untrackedNames || 'none'}).`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const PRP = '#B485FF';
const RED = '#FF4D6D';

const CLASS_COL = {
  FULLY_COVERED: GRN,
  SWARM_ONLY:    CY,
  DATA_ONLY:     PRP,
  UNTRACKED:     AMB,
};

const FILTER_TABS = ['ALL', 'FULLY_COVERED', 'SWARM_ONLY', 'DATA_ONLY', 'UNTRACKED'];

const STATUS_COL = {
  running:   GRN,
  completed: CY,
  queued:    AMB,
  failed:    RED,
};

const BASE = {
  position: 'fixed',
  fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  fontSize: 11,
  color: CY,
  zIndex: 68,
};

// ─── component ────────────────────────────────────────────────────────────────

export default function ContactSwarmDatasetMesh() {
  const [open, setOpen]           = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [cR, jR, dR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const cts  = normContacts(cR.status === 'fulfilled' ? cR.value : []);
      const jobs = normJobs(jR.status === 'fulfilled' ? jR.value : []);
      const dts  = normDatasets(dR.status === 'fulfilled' ? dR.value : []);
      setContacts(enrich(cts, jobs, dts));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:csdm-toggle', onToggle);
    return () => window.removeEventListener('jarvis:csdm-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    try {
      const script = await buildCsdmScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `You are JARVIS. Summarise in exactly 2 sentences: ${script}`,
        }),
      });
      const d = await r.json();
      const ans = (d.answer || d.response || script).replace(/<<ACTION:[^>]*>>/g, '').trim();
      setBrief(ans);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: ans } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const untracked = contacts.filter(c => c._class === 'UNTRACKED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × SwarmJob × Dataset Intelligence Mesh"
        style={{
          ...BASE,
          left: 6000,
          bottom: 18,
          background: 'rgba(0,0,0,0.82)',
          border: `1px solid ${CY}55`,
          borderRadius: 3,
          padding: '3px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        ◈ CSDM
        {untracked > 0 && (
          <span style={{
            background: AMB, color: '#000', borderRadius: 2,
            padding: '0 4px', fontSize: 9, fontWeight: 700,
          }}>
            {untracked}
          </span>
        )}
      </button>
    );
  }

  const filtered = contacts.filter(c => {
    if (filter !== 'ALL' && c._class !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.name || '').toLowerCase().includes(q)
        || (c.email || '').toLowerCase().includes(q)
        || (c.organization || c.org || '').toLowerCase().includes(q);
    }
    return true;
  });

  const total     = contacts.length;
  const fullCov   = contacts.filter(c => c._class === 'FULLY_COVERED').length;
  const swarmOnly = contacts.filter(c => c._class === 'SWARM_ONLY').length;
  const dataOnly  = contacts.filter(c => c._class === 'DATA_ONLY').length;
  const untracked = contacts.filter(c => c._class === 'UNTRACKED').length;

  const tile = (label, val, col) => (
    <div style={{
      flex: 1, background: 'rgba(0,0,0,0.5)',
      border: `1px solid ${col}44`,
      borderRadius: 3, padding: '4px 6px', textAlign: 'center',
    }}>
      <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
      <div style={{ color: '#666', fontSize: 9 }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      ...BASE,
      left: 6000,
      bottom: 18,
      width: 420,
      maxHeight: '72vh',
      background: 'rgba(0,4,16,0.95)',
      border: `1px solid ${CY}66`,
      borderRadius: 6,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '6px 10px',
        borderBottom: `1px solid ${CY}33`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, flex: 1 }}>
          ◈ CONTACT × SWARM × DATASET MESH
        </span>
        {loading && <span style={{ color: '#555', fontSize: 9 }}>loading…</span>}
        <button onClick={load} title="Refresh" style={{
          background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 11,
        }}>↻</button>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#111' : `${GRN}22`,
          border: `1px solid ${GRN}55`,
          color: GRN, borderRadius: 3, padding: '2px 7px',
          fontSize: 10, cursor: 'pointer',
        }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 8px' }}>
        {tile('CONTACTS',  total,     CY)}
        {tile('FULL',      fullCov,   GRN)}
        {tile('SWARM',     swarmOnly, CY)}
        {tile('DATA',      dataOnly,  PRP)}
        {tile('UNTRACKED', untracked, AMB)}
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: '0 8px 6px',
          padding: '6px 8px',
          background: 'rgba(41,231,255,0.05)',
          border: `1px solid ${CY}33`,
          borderRadius: 3,
          color: '#bbb',
          fontSize: 10,
          lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}

      {/* filter tabs */}
      <div style={{
        display: 'flex', gap: 2, padding: '0 8px 4px',
        borderBottom: `1px solid ${CY}22`,
        overflowX: 'auto',
      }}>
        {FILTER_TABS.map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            background: filter === tab ? `${CY}22` : 'none',
            border: `1px solid ${filter === tab ? CY : '#333'}`,
            color: filter === tab ? CY : '#555',
            borderRadius: 3, padding: '2px 7px', fontSize: 9,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search contacts…"
        style={{
          margin: '6px 8px',
          background: 'rgba(0,0,0,0.5)',
          border: `1px solid ${CY}33`,
          borderRadius: 3,
          padding: '4px 8px',
          color: CY,
          fontSize: 10,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />

      {/* error */}
      {error && (
        <div style={{ color: RED, fontSize: 10, padding: '0 10px 6px' }}>
          Error: {error}
        </div>
      )}

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 8px 8px' }}>
        {filtered.length === 0 && !loading && (
          <div style={{ color: '#444', fontSize: 10, textAlign: 'center', paddingTop: 20 }}>
            no contacts match
          </div>
        )}
        {filtered.map(c => {
          const id  = c.id || c.email || c.name;
          const isExp = !!expanded[id];
          const col = CLASS_COL[c._class] || '#888';
          return (
            <div key={id} style={{
              marginBottom: 3,
              border: `1px solid ${col}33`,
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', cursor: 'pointer',
                  background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
                }}
              >
                <span style={{
                  background: col, color: '#000', borderRadius: 2,
                  padding: '0 4px', fontSize: 9, minWidth: 80, textAlign: 'center',
                }}>
                  {c._class}
                </span>
                <span style={{
                  flex: 1, color: '#ccc',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {c.name || c.email || id}
                  {c.organization || c.org
                    ? <span style={{ color: '#555' }}> · {c.organization || c.org}</span>
                    : null}
                </span>
                <span style={{ color: '#555', fontSize: 9 }}>
                  {c._jMatches.length}sw / {c._dMatches.length}ds {isExp ? '▲' : '▼'}
                </span>
              </div>

              {isExp && (
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(0,0,0,0.4)',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {(c.role || c.title || c.sector) && (
                    <div style={{ color: '#888', fontSize: 10, marginBottom: 6 }}>
                      {[c.role || c.title, c.sector].filter(Boolean).join(' · ')}
                    </div>
                  )}

                  {/* swarm jobs */}
                  {c._jMatches.length > 0 ? (
                    <>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED SWARM JOBS
                      </div>
                      {c._jMatches.map(({ j, score: s }) => (
                        <div key={j.id || j.name} style={{
                          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                        }}>
                          <span style={{
                            background: STATUS_COL[j.status] || '#555',
                            color: '#000', borderRadius: 2,
                            padding: '0 4px', fontSize: 9, minWidth: 60, textAlign: 'center',
                          }}>
                            {(j.status || 'unknown').toUpperCase().slice(0, 9)}
                          </span>
                          <span style={{
                            flex: 1, color: '#aaa', fontSize: 10,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {j.name || j.id}
                          </span>
                          <div style={{ width: 50, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: CY }} />
                          </div>
                          <span style={{ color: '#666', fontSize: 9, minWidth: 28, textAlign: 'right' }}>
                            {(s * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: '#555', fontSize: 10, marginBottom: 4 }}>no matching swarm jobs</div>
                  )}

                  {/* datasets */}
                  {c._dMatches.length > 0 ? (
                    <>
                      <div style={{ color: PRP, fontSize: 9, letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>
                        MATCHED DATASETS
                      </div>
                      {c._dMatches.map(({ d, score: s }) => (
                        <div key={d.id || d.name} style={{
                          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                        }}>
                          <span style={{
                            background: PRP, color: '#000', borderRadius: 2,
                            padding: '0 4px', fontSize: 9, minWidth: 60, textAlign: 'center',
                          }}>
                            {(d.category || d.type || 'DATA').toUpperCase().slice(0, 10)}
                          </span>
                          <span style={{
                            flex: 1, color: '#aaa', fontSize: 10,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {d.name || d.title || d.id}
                          </span>
                          <div style={{ width: 50, height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s * 100)}%`, height: '100%', background: PRP }} />
                          </div>
                          <span style={{ color: '#666', fontSize: 9, minWidth: 28, textAlign: 'right' }}>
                            {(s * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>no matching datasets</div>
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
