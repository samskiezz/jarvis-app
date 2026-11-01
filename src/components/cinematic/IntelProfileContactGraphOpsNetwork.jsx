/**
 * F265 — IntelProfile × Contact × Graph × Ops Alert Intelligence Impact Network
 * ◈ ICONET
 *
 * For each intel profile, cross-references against contacts, graph centrality
 * nodes, and ops alerts to assess whether the profile has personnel linkage,
 * network trace, and active alerting.
 *
 * IMPACT   — contact + graph + ops alert all present.
 * CONNECTED — at least two of three sources match.
 * TRACED   — only one source matches.
 * DORMANT  — no contact owner, no graph trace, no ops alert — intelligence dead-end.
 *
 * Data sources (real endpoints):
 *   GET /entities/IntelProfile     → intelligence profiles
 *   GET /entities/Contact          → personnel contacts
 *   GET /v1/graph/centrality       → graph node centrality
 *   GET /v1/ops/alerts             → ops alerts
 *
 * Stat tiles:  profiles / contacts / graph nodes / alerts /
 *              impact / connected / traced / dormant
 * Red badge:   dormant count on button.
 * Expand row:  matched contacts with role/org
 *              + matched graph nodes with centrality score badge
 *              + matched ops alerts with severity badge.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ ICONET at left:196200 bottom:18, zIndex:361.
 * Event:   jarvis:iconet-toggle
 * Voice:   "intel impact network / iconet / dormant profiles / intel contact graph /
 *           profile ops alert / intel network / intelligence impact /
 *           unlinked intel profiles / intel attribution network"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const ICONET_RE =
  /\b(intel[._-]?impact[._-]?network|iconet|dormant[._-]?profiles?|intel[._-]?contact[._-]?graph|profile[._-]?ops[._-]?alert|intel[._-]?network|intelligence[._-]?impact|unlinked[._-]?intel[._-]?profiles?|intel[._-]?attribution[._-]?network)\b/i;

export function isIconetQuery(t) {
  return ICONET_RE.test(t || '');
}

// ─── normalisers ─────────────────────────────────────────────────────────────

function normProfiles(raw) {
  if (!raw) return [];
  for (const k of ['intel_profiles', 'intelProfiles', 'profiles', 'items', 'results', 'data']) {
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

function normGraphNodes(raw) {
  if (!raw) return [];
  const nodes = raw?.nodes || raw?.graph?.nodes || raw?.data?.nodes || [];
  if (Array.isArray(nodes)) return nodes;
  return [];
}

function normAlerts(raw) {
  if (!raw) return [];
  for (const k of ['alerts', 'ops_alerts', 'opsAlerts', 'items', 'results', 'data']) {
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

function profileTokens(p) {
  return tokens(
    [p.name, p.title, p.description, p.type, p.category, p.alias,
     p.subject, p.nationality,
     ...(Array.isArray(p.tags) ? p.tags : [])].join(' ')
  );
}

function contactTokens(c) {
  return tokens(
    [c.name, c.full_name, c.fullName, c.role, c.organization, c.org,
     c.company, c.department, c.email,
     ...(Array.isArray(c.tags) ? c.tags : [])].join(' ')
  );
}

function graphNodeTokens(n) {
  return tokens(
    [n.label, n.name, n.type, n.category, n.description,
     ...(Array.isArray(n.tags) ? n.tags : [])].join(' ')
  );
}

function alertTokens(a) {
  return tokens(
    [a.name, a.title, a.description, a.type, a.category,
     a.severity, a.level, a.alert_type,
     ...(Array.isArray(a.tags) ? a.tags : [])].join(' ')
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

function enrich(profiles, contacts, graphNodes, alerts) {
  return profiles.map(profile => {
    const pt = profileTokens(profile);
    const cMatches = contacts
      .map(c => ({ c, score: score(pt, contactTokens(c)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const gMatches = graphNodes
      .map(n => ({ n, score: score(pt, graphNodeTokens(n)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const aMatches = alerts
      .map(a => ({ a, score: score(pt, alertTokens(a)) }))
      .filter(m => m.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasC = cMatches.length > 0;
    const hasG = gMatches.length > 0;
    const hasA = aMatches.length > 0;
    const matchCount = (hasC ? 1 : 0) + (hasG ? 1 : 0) + (hasA ? 1 : 0);
    const _class = matchCount === 3
      ? 'IMPACT'
      : matchCount === 2
      ? 'CONNECTED'
      : matchCount === 1
      ? 'TRACED'
      : 'DORMANT';
    return { ...profile, _class, _cMatches: cMatches, _gMatches: gMatches, _aMatches: aMatches };
  });
}

// ─── exported script builder ─────────────────────────────────────────────────

export async function buildIconetScript() {
  const [prR, ctR, grR, alR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/ops/alerts`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const profiles   = normProfiles(prR.status === 'fulfilled' ? prR.value : []);
  const contacts   = normContacts(ctR.status === 'fulfilled' ? ctR.value : []);
  const graphNodes = normGraphNodes(grR.status === 'fulfilled' ? grR.value : []);
  const alerts     = normAlerts(alR.status === 'fulfilled' ? alR.value : []);
  const enriched   = enrich(profiles, contacts, graphNodes, alerts);
  const dormant    = enriched.filter(e => e._class === 'DORMANT').length;
  const impact     = enriched.filter(e => e._class === 'IMPACT').length;
  const dormantNames = enriched
    .filter(e => e._class === 'DORMANT').slice(0, 3)
    .map(e => e.name || e.title || e.id).join(', ');
  return (
    `IntelProfile × Contact × Graph × Ops Alert Intelligence Impact Network: ${profiles.length} profiles cross-referenced ` +
    `against ${contacts.length} contacts, ${graphNodes.length} graph nodes, ${alerts.length} ops alerts. ` +
    `${impact} IMPACT (all 3 sources); ${dormant} DORMANT — no contact, no graph trace, no ops alert ` +
    `(gaps: ${dormantNames || 'none'}).`
  );
}

// ─── UI constants ─────────────────────────────────────────────────────────────

const CY  = '#29E7FF';
const AMB = '#FFD700';
const GRN = '#00E5A0';
const PRP = '#B485FF';
const RED = '#FF4D6D';

const CLASS_COL = {
  IMPACT:    GRN,
  CONNECTED: CY,
  TRACED:    PRP,
  DORMANT:   RED,
};

const FILTER_TABS = ['ALL', 'IMPACT', 'CONNECTED', 'TRACED', 'DORMANT'];

const SEV_COL = { critical: RED, high: RED, medium: AMB, low: GRN, info: CY };

const BASE = {
  position: 'fixed',
  fontFamily: "'JetBrains Mono', monospace",
  color: '#DCEBF5',
  zIndex: 361,
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

export default function IntelProfileContactGraphOpsNetwork() {
  const [open, setOpen]           = useState(false);
  const [profiles, setProfiles]   = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [graphNodes, setGraphNodes] = useState([]);
  const [alerts, setAlerts]       = useState([]);
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
      const [prR, ctR, grR, alR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`, { headers }).then(r => r.json()),
        fetch(`${API}/entities/Contact`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`, { headers }).then(r => r.json()),
        fetch(`${API}/v1/ops/alerts`, { headers }).then(r => r.json()),
      ]);
      const pr = normProfiles(prR.status === 'fulfilled' ? prR.value : []);
      const ct = normContacts(ctR.status === 'fulfilled' ? ctR.value : []);
      const gn = normGraphNodes(grR.status === 'fulfilled' ? grR.value : []);
      const al = normAlerts(alR.status === 'fulfilled' ? alR.value : []);
      setProfiles(pr); setContacts(ct); setGraphNodes(gn); setAlerts(al);
      setEnriched(enrich(pr, ct, gn, al));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:iconet-toggle', handler);
    return () => window.removeEventListener('jarvis:iconet-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90_000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  const dormant   = enriched.filter(e => e._class === 'DORMANT').length;
  const impact    = enriched.filter(e => e._class === 'IMPACT').length;
  const connected = enriched.filter(e => e._class === 'CONNECTED').length;
  const traced    = enriched.filter(e => e._class === 'TRACED').length;

  const visible = enriched.filter(e => {
    if (filter !== 'ALL' && e._class !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [e.name, e.title, e.description, e.type, e.category, e.id]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const handleAssess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const prompt =
        `IntelProfile × Contact × Graph × Ops Alert Intelligence Impact Network: ${profiles.length} profiles, ` +
        `${contacts.length} contacts, ${graphNodes.length} graph nodes, ${alerts.length} ops alerts. ` +
        `${impact} IMPACT, ${connected} CONNECTED, ${traced} TRACED, ${dormant} DORMANT. ` +
        `Top dormant profiles: ${enriched.filter(e => e._class === 'DORMANT')
          .slice(0, 3).map(e => e.name || e.title || e.id).join(', ') || 'none'}. ` +
        `Provide a 2-sentence intelligence brief on impact network coverage gaps.`;
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
        title="IntelProfile × Contact × Graph × Ops Alert Intelligence Impact Network (ICONET)"
        style={{
          ...BASE,
          left: 196200, bottom: 18, padding: '4px 10px',
          background: 'rgba(4,8,14,0.75)',
          border: `1px solid ${dormant > 0 ? RED : CY}55`,
          borderRadius: 6, cursor: 'pointer', fontSize: 11,
          color: dormant > 0 ? RED : CY,
          boxShadow: dormant > 0 ? `0 0 12px ${RED}33` : 'none',
        }}
      >
        ◈ ICONET{dormant > 0 && (
          <span style={{ marginLeft: 5, background: RED, color: '#fff',
            borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>
            {dormant}
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
          ◈ INTELPROFILE × CONTACT × GRAPH × OPS ALERT IMPACT NETWORK
        </span>
        {dormant > 0 && (
          <span style={{ background: RED, color: '#fff', borderRadius: 8,
            padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
            {dormant} DORMANT
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
        <Tile label="PROFILES"    value={profiles.length}   col={CY} />
        <Tile label="CONTACTS"    value={contacts.length}   col={CY} />
        <Tile label="GRAPH NODES" value={graphNodes.length} col={PRP} />
        <Tile label="OPS ALERTS"  value={alerts.length}     col={AMB} />
        <Tile label="IMPACT"      value={impact}            col={GRN} />
        <Tile label="CONNECTED"   value={connected}         col={CY} />
        <Tile label="TRACED"      value={traced}            col={PRP} />
        <Tile label="DORMANT"     value={dormant}           col={RED} />
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
          placeholder="search profiles…"
          style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(41,231,255,0.05)',
            border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
            fontFamily: 'inherit', fontSize: 11, outline: 'none', minWidth: 160 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6E8AA0', padding: 40, fontSize: 12 }}>
            No profiles match current filter.
          </div>
        )}
        {visible.map((profile, i) => {
          const col   = CLASS_COL[profile._class] || CY;
          const rowId = profile.id || profile.profile_id || i;
          const isExp = expanded === rowId;
          return (
            <div key={rowId}
              style={{ marginBottom: 6, border: `1px solid ${col}22`, borderRadius: 8,
                background: 'rgba(4,8,14,0.5)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : rowId)}
                style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10 }}>
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 100 }}>
                  {profile._class}
                </span>
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.name || profile.title || profile.alias || profile.id || '—'}
                </span>
                {profile.category && <Badge label={profile.category.toUpperCase()} col={CY} />}
                <span style={{ color: '#6E8AA0', fontSize: 10, marginLeft: 4 }}>
                  {profile._cMatches.length}C · {profile._gMatches.length}G · {profile._aMatches.length}A
                </span>
                <span style={{ color: '#6E8AA0', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: `1px solid ${col}22` }}>
                  {profile.description && (
                    <div style={{ fontSize: 11, color: '#8AAABB', padding: '6px 0' }}>
                      {profile.description}
                    </div>
                  )}

                  {/* matched contacts */}
                  {profile._cMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED CONTACTS ({profile._cMatches.length})
                      </div>
                      {profile._cMatches.map((m, ci) => {
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

                  {/* matched graph nodes */}
                  {profile._gMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: PRP, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED GRAPH NODES ({profile._gMatches.length})
                      </div>
                      {profile._gMatches.map((m, gi) => (
                        <div key={gi} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            {m.n.centrality != null && (
                              <Badge label={`c:${m.n.centrality.toFixed ? m.n.centrality.toFixed(2) : m.n.centrality}`} col={PRP} />
                            )}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' }}>
                              {m.n.label || m.n.name || m.n.id}
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

                  {/* matched ops alerts */}
                  {profile._aMatches.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED OPS ALERTS ({profile._aMatches.length})
                      </div>
                      {profile._aMatches.map((m, ai) => {
                        const sev = (m.a.severity || m.a.level || '').toLowerCase();
                        return (
                          <div key={ai} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                              {sev && <Badge label={sev.toUpperCase()} col={SEV_COL[sev] || AMB} />}
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' }}>
                                {m.a.name || m.a.title || m.a.id}
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

                  {profile._cMatches.length === 0 && profile._gMatches.length === 0 && profile._aMatches.length === 0 && (
                    <div style={{ fontSize: 11, color: RED, padding: '6px 0' }}>
                      No contact, graph node, or ops alert references this intel profile — intelligence dead-end.
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
