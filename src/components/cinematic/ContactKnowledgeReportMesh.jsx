/**
 * F275 — Contact × Knowledge × Report Intelligence Mesh (CKRM)
 *
 * Answers: "For each contact in the roster, is there KB documentation
 * AND a report in the system referencing them?"
 *
 * FULL_COVERAGE  — at least one KB article AND one report match this contact.
 * KB_ONLY        — a KB article exists but no report covers them.
 * REPORT_ONLY    — a report covers them but no KB article documents them.
 * DARK           — neither KB nor report references this contact (intelligence blind spot).
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Contact  → contact roster
 *   GET /knowledge/        → KB article catalog
 *   GET /v1/reports        → report catalog
 *
 * Stat tiles:  contacts / KB articles / reports / full / kb-only / report-only / dark
 * Amber badge: dark count on button.
 * Expand row:  matched KB articles with topic badge + relevance bar (max 5)
 *              + matched reports with type badge + relevance bar (max 5).
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CKRM  at left:6180 bottom:18, zIndex:68.
 * Event:   jarvis:ckrm-toggle
 * Voice:   "contact knowledge report / ckrm / dark contacts / contact documentation /
 *           contact kb / contact report / untracked contacts / contact coverage /
 *           knowledge contact mesh / contact intelligence coverage / undocumented contacts /
 *           contact record gap / contact mesh"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const CKRM_RE =
  /\b(contact[._-]?knowledge[._-]?report|ckrm|dark[._-]?contacts?|contact[._-]?doc(?:umentation)?|contact[._-]?kb|contact[._-]?report|untracked[._-]?contacts?|contact[._-]?coverage|knowledge[._-]?contact[._-]?mesh|contact[._-]?intelligence[._-]?coverage|undocumented[._-]?contacts?|contact[._-]?record[._-]?gap|contact[._-]?mesh)\b/i;

export function isCkrmQuery(t) {
  return CKRM_RE.test(t || '');
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

function normArticles(raw) {
  if (!raw) return [];
  for (const k of ['articles', 'knowledge', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normReports(raw) {
  if (!raw) return [];
  for (const k of ['reports', 'items', 'results', 'data']) {
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
     c.description, c.sector, c.region, c.company,
     ...(Array.isArray(c.tags) ? c.tags : [])].join(' ')
  );
}

function articleTokens(a) {
  return tokens(
    [a.title, a.summary, a.content, a.topic, a.category,
     a.author, a.description, a.source,
     ...(Array.isArray(a.tags) ? a.tags : [])].join(' ')
  );
}

function reportTokens(r) {
  return tokens(
    [r.title, r.summary, r.content, r.body, r.topic,
     r.author, r.description, r.type, r.category,
     ...(Array.isArray(r.tags) ? r.tags : [])].join(' ')
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

const THRESHOLD = 0.05;

function enrich(contacts, articles, reports) {
  return contacts.map(c => {
    const ct = contactTokens(c);
    const aMatches = articles
      .map(a => ({ a, score: score(ct, articleTokens(a)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
    const rMatches = reports
      .map(r => ({ r, score: score(ct, reportTokens(r)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
    const hasA = aMatches.length > 0;
    const hasR = rMatches.length > 0;
    const _class = hasA && hasR
      ? 'FULL_COVERAGE'
      : hasA
      ? 'KB_ONLY'
      : hasR
      ? 'REPORT_ONLY'
      : 'DARK';
    return { ...c, _class, _aMatches: aMatches, _rMatches: rMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildCkrmScript() {
  const [cR, aR, rR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const contacts  = normContacts(cR.status === 'fulfilled' ? cR.value : []);
  const articles  = normArticles(aR.status === 'fulfilled' ? aR.value : []);
  const reports   = normReports(rR.status === 'fulfilled' ? rR.value : []);
  const enriched  = enrich(contacts, articles, reports);
  const dark      = enriched.filter(e => e._class === 'DARK').length;
  const full      = enriched.filter(e => e._class === 'FULL_COVERAGE').length;
  const darkNames = enriched
    .filter(e => e._class === 'DARK').slice(0, 3)
    .map(e => e.name || e.email || e.id).join(', ');
  return (
    `Contact × Knowledge × Report Intelligence Mesh: ${contacts.length} contacts cross-referenced ` +
    `against ${articles.length} KB articles and ${reports.length} reports. ` +
    `${full} contacts have FULL COVERAGE (KB + report); ${dark} are DARK — ` +
    `no documentation or reports reference them (gaps: ${darkNames || 'none'}).`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const PRP = '#B485FF';
const RED = '#FF4D6D';

const CLASS_COL = {
  FULL_COVERAGE: GRN,
  KB_ONLY:       CY,
  REPORT_ONLY:   PRP,
  DARK:          AMB,
};

const FILTER_TABS = ['ALL', 'FULL_COVERAGE', 'KB_ONLY', 'REPORT_ONLY', 'DARK'];

const BASE = {
  position: 'fixed',
  fontFamily: "'JetBrains Mono', monospace",
  color: '#DCEBF5',
  zIndex: 68,
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

export default function ContactKnowledgeReportMesh() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [articles, setArticles] = useState([]);
  const [reports, setReports]   = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const headers = { Authorization: `Bearer ${API_KEY}` };

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cR, aR, rR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/reports`, { headers }).then(r => r.json()),
      ]);
      const c = normContacts(cR.status === 'fulfilled' ? cR.value : []);
      const a = normArticles(aR.status === 'fulfilled' ? aR.value : []);
      const r = normReports(rR.status === 'fulfilled' ? rR.value : []);
      setContacts(c); setArticles(a); setReports(r);
      setEnriched(enrich(c, a, r));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:ckrm-toggle', handler);
    return () => window.removeEventListener('jarvis:ckrm-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90_000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  const dark      = enriched.filter(e => e._class === 'DARK').length;
  const full      = enriched.filter(e => e._class === 'FULL_COVERAGE').length;
  const kbOnly    = enriched.filter(e => e._class === 'KB_ONLY').length;
  const repOnly   = enriched.filter(e => e._class === 'REPORT_ONLY').length;

  const visible = enriched.filter(e => {
    if (filter !== 'ALL' && e._class !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [e.name, e.email, e.organization, e.role, e.id]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const handleAssess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const prompt =
        `Contact × Knowledge × Report Intelligence Mesh: ${contacts.length} contacts, ` +
        `${articles.length} KB articles, ${reports.length} reports. ` +
        `${full} FULL_COVERAGE, ${kbOnly} KB_ONLY, ${repOnly} REPORT_ONLY, ${dark} DARK. ` +
        `Top dark contacts: ${enriched.filter(e => e._class === 'DARK')
          .slice(0, 3).map(e => e.name || e.email || e.id).join(', ') || 'none'}. ` +
        `Provide a 2-sentence intelligence coverage brief on contact documentation gaps.`;
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
        title="Contact × Knowledge × Report Intelligence Mesh (CKRM)"
        style={{
          ...BASE,
          left: 6180, bottom: 18, padding: '4px 10px',
          background: 'rgba(4,8,14,0.75)',
          border: `1px solid ${dark > 0 ? AMB : CY}55`,
          borderRadius: 6, cursor: 'pointer', fontSize: 11,
          color: dark > 0 ? AMB : CY,
          boxShadow: dark > 0 ? `0 0 12px ${AMB}33` : 'none',
        }}
      >
        ◈ CKRM{dark > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: '#04060A',
            borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
            {dark}
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
          ◈ CONTACT × KNOWLEDGE × REPORT MESH
        </span>
        {dark > 0 && (
          <span style={{ background: AMB, color: '#04060A', borderRadius: 8,
            padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
            {dark} DARK
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
        <Tile label="CONTACTS"  value={contacts.length} col={CY} />
        <Tile label="KB ARTS"   value={articles.length} col={CY} />
        <Tile label="REPORTS"   value={reports.length}  col={CY} />
        <Tile label="FULL"      value={full}             col={GRN} />
        <Tile label="KB ONLY"   value={kbOnly}           col={CY} />
        <Tile label="RPT ONLY"  value={repOnly}          col={PRP} />
        <Tile label="DARK"      value={dark}             col={AMB} />
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
          placeholder="search contacts…"
          style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(41,231,255,0.05)',
            border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
            fontFamily: 'inherit', fontSize: 11, outline: 'none', minWidth: 160 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', padding: 40, fontSize: 12 }}>
            No contacts match current filter.
          </div>
        )}
        {visible.map((c, i) => {
          const col   = CLASS_COL[c._class] || CY;
          const key   = c.id || c.email || i;
          const isExp = expanded === key;
          return (
            <div key={key}
              style={{ marginBottom: 6, border: `1px solid ${col}22`, borderRadius: 8,
                background: 'rgba(4,8,14,0.5)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : key)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 110 }}>
                  {c._class}
                </span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name || c.email || c.id || '—'}
                </span>
                {c.role && <Badge label={c.role} col={CY} />}
                <span style={{ color: '#6E8AA0', fontSize: 10, marginLeft: 4 }}>
                  {c._aMatches.length}KB · {c._rMatches.length}R
                </span>
                <span style={{ color: '#6E8AA0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: `1px solid ${col}22` }}>
                  {c.email && (
                    <div style={{ fontSize: 11, color: '#8AAABB', padding: '4px 0' }}>
                      {c.email}
                      {c.organization && ` · ${c.organization}`}
                    </div>
                  )}

                  {/* matched KB articles */}
                  {c._aMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED KB ARTICLES ({c._aMatches.length})
                      </div>
                      {c._aMatches.map((m, ai) => (
                        <div key={ai} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            {m.a.topic && <Badge label={m.a.topic} col={GRN} />}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' }}>
                              {m.a.title || m.a.id || '—'}
                            </span>
                            <span style={{ fontSize: 10, color: GRN }}>
                              {Math.round(m.score * 100)}%
                            </span>
                          </div>
                          <Bar pct={m.score} col={GRN} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* matched reports */}
                  {c._rMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: PRP, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED REPORTS ({c._rMatches.length})
                      </div>
                      {c._rMatches.map((m, ri) => (
                        <div key={ri} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            {(m.r.type || m.r.category) && (
                              <Badge label={m.r.type || m.r.category} col={PRP} />
                            )}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' }}>
                              {m.r.title || m.r.id || '—'}
                            </span>
                            <span style={{ fontSize: 10, color: PRP }}>
                              {Math.round(m.score * 100)}%
                            </span>
                          </div>
                          <Bar pct={m.score} col={PRP} />
                        </div>
                      ))}
                    </div>
                  )}

                  {c._aMatches.length === 0 && c._rMatches.length === 0 && (
                    <div style={{ fontSize: 11, color: AMB, padding: '6px 0' }}>
                      No KB articles or reports reference this contact.
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
