/**
 * F219: Graph Node × Contact × Intel Profile Triple Coverage (GNCIP)
 *
 * Three-way keyword-correlates each graph node against contacts
 * AND intelligence profiles to surface:
 *   FULLY MAPPED  — contact AND intel profile found for this node
 *   CONTACT-ONLY  — contact linked, no intel profile
 *   PROFILED      — intel profile exists, no contact
 *   DARK          — neither contact nor intel profile linked
 *
 * Real endpoints:
 *   GET /v1/graph/centrality   — graph nodes with centrality scores
 *   GET /entities/Contact      — contact entities
 *   GET /entities/IntelProfile — intelligence profiles
 *   POST /v1/jarvis/agent/chat — ASSESS brief
 *
 * Voice triggers: "gncip" / "graph node contact intel" / "mapped nodes" /
 *   "dark nodes" / "node contact intel" / "graph contact intel profile" /
 *   "node intel mapping" / "node human intel"
 */

import { useState, useEffect, useCallback } from 'react';

const API = '';

const GNCIP_RE =
  /\b(gncip|graph[._-]?node[._-]?contact[._-]?intel|mapped[._-]?nodes|dark[._-]?nodes|node[._-]?contact[._-]?intel|graph[._-]?contact[._-]?intel[._-]?profile|node[._-]?intel[._-]?mapping|node[._-]?human[._-]?intel)\b/i;

export function isGncipQuery(t) {
  return GNCIP_RE.test(t || '');
}

// ── normalisers ────────────────────────────────────────────────────────────────

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'items', 'results', 'data', 'records', 'centrality'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((n, i) => ({
    id:         n.id || String(i),
    name:       n.label || n.name || n.title || n.entity || `Node ${i + 1}`,
    kind:       n.type || n.kind || n.category || '',
    centrality: Number(n.centrality || n.score || n.weight || 0),
    desc:       String(n.description || n.summary || n.notes || '').slice(0, 300),
    tags:       Array.isArray(n.tags) ? n.tags.join(' ') : (n.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:   c.id || String(i),
    name: c.name || c.full_name || c.label || `Contact ${i + 1}`,
    kind: c.type || c.kind || c.role || '',
    desc: String(c.description || c.summary || c.notes || c.affiliation || '').slice(0, 300),
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseIntelProfiles(raw) {
  if (!raw) return [];
  const arr = ['intel_profiles', 'profiles', 'items', 'results', 'data', 'records', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((p, i) => ({
    id:       p.id || String(i),
    name:     p.name || p.title || p.subject || `Profile ${i + 1}`,
    category: p.category || p.type || p.kind || '',
    threat:   p.threat_level || p.threat || p.risk || '',
    desc:     String(p.description || p.summary || p.notes || p.assessment || '').slice(0, 300),
    tags:     Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
}

// ── token helpers ─────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(nodeToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || ''),
    ...tokens(other.kind || other.category || other.type || other.role || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags || ''),
  ].filter(Boolean);
  if (!nodeToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, otherToks.length);
}

// ── correlator ────────────────────────────────────────────────────────────────

function correlate(nodes, contacts, profiles) {
  return nodes.map(node => {
    const nodeToks = new Set([
      ...tokens(node.name),
      ...tokens(node.kind),
      ...tokens(node.desc),
      ...tokens(node.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(nodeToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedProfiles = profiles
      .map(p => ({ ...p, _score: matchScore(nodeToks, p) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact = matchedContacts.length > 0;
    const hasProfile = matchedProfiles.length > 0;

    let coverage;
    if (hasContact && hasProfile) coverage = 'FULLY MAPPED';
    else if (hasContact)          coverage = 'CONTACT-ONLY';
    else if (hasProfile)          coverage = 'PROFILED';
    else                          coverage = 'DARK';

    return { ...node, _contacts: matchedContacts, _profiles: matchedProfiles, _coverage: coverage };
  });
}

// ── spoken script builder ─────────────────────────────────────────────────────

export async function buildGncipScript() {
  try {
    const [nR, cR, pR] = await Promise.allSettled([
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
    ]);
    const nodes    = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
    const contacts = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
    const profiles = normaliseIntelProfiles(pR.status === 'fulfilled' ? pR.value : []);
    const rows     = correlate(nodes, contacts, profiles);
    const fm  = rows.filter(r => r._coverage === 'FULLY MAPPED').length;
    const co  = rows.filter(r => r._coverage === 'CONTACT-ONLY').length;
    const pr  = rows.filter(r => r._coverage === 'PROFILED').length;
    const dk  = rows.filter(r => r._coverage === 'DARK').length;
    return (
      `Graph Node × Contact × Intel Profile Triple Coverage (GNCIP): ${nodes.length} graph nodes cross-referenced against ${contacts.length} contacts and ${profiles.length} intelligence profiles. ` +
      `${fm} FULLY MAPPED (contact and profile linked); ${co} CONTACT-ONLY (contact found, no intel profile); ` +
      `${pr} PROFILED (intel profile exists, no contact); ${dk} DARK (no contact or profile — visibility gap). ` +
      (dk > 0
        ? `Dark nodes: ${rows.filter(r => r._coverage === 'DARK').slice(0, 3).map(r => r.name || r.id || '?').join(', ')}. Recommend attribution and profile enrichment for dark nodes immediately.`
        : `All graph nodes carry contact or profile linkage. Network attribution coverage is strong.`)
    );
  } catch {
    return 'Graph Node × Contact × Intel Profile Triple Coverage unavailable — check endpoints.';
  }
}

// ── colours & constants ───────────────────────────────────────────────────────

const PANEL_W = 660;
const PANEL_H = 620;
const GR  = '#22C55E';   // fully mapped
const CY  = '#00CFFF';   // contact-only
const AM  = '#F59E0B';   // profiled
const RD  = '#EF4444';   // dark
const DIM = '#6B7280';

const COVERAGE_COLOR = {
  'FULLY MAPPED':  GR,
  'CONTACT-ONLY':  CY,
  'PROFILED':      AM,
  'DARK':          RD,
};

const TABS = ['ALL', 'FULLY MAPPED', 'CONTACT-ONLY', 'PROFILED', 'DARK'];

const chip = (label, color = CY) => (
  <span style={{
    fontSize: 9, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
    background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4,
  }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#111', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

// ── component ─────────────────────────────────────────────────────────────────

export default function GraphNodeContactIntelTriple() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [nR, cR, pR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      ]);
      const nodes    = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
      const contacts = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const profiles = normaliseIntelProfiles(pR.status === 'fulfilled' ? pR.value : []);
      setRows(correlate(nodes, contacts, profiles));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gncip-toggle', toggle);
    return () => window.removeEventListener('jarvis:gncip-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildGncipScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Graph Node × Contact × Intel Profile triple coverage: ${brief}. Give a 2-sentence network attribution readiness assessment.`,
        }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  // ── collapsed button ────────────────────────────────────────────────────────

  if (!open) {
    const dark = rows.filter(r => r._coverage === 'DARK').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Node × Contact × Intel Profile Triple Coverage (GNCIP)"
        style={{
          position: 'fixed', left: 750160, bottom: 8, zIndex: 368,
          background: dark > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${dark > 0 ? AM : CY + '44'}`,
          color: dark > 0 ? AM : CY,
          borderRadius: 4, padding: '3px 8px', fontSize: 10,
          cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GNCIP{dark > 0 ? ` ⚠${dark}` : ''}
      </button>
    );
  }

  // ── derived counts ──────────────────────────────────────────────────────────

  const fm  = rows.filter(r => r._coverage === 'FULLY MAPPED').length;
  const co  = rows.filter(r => r._coverage === 'CONTACT-ONLY').length;
  const pr  = rows.filter(r => r._coverage === 'PROFILED').length;
  const dk  = rows.filter(r => r._coverage === 'DARK').length;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r._coverage === tab) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.kind.toLowerCase().includes(search.toLowerCase()))
  );

  // ── expanded panel ──────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040f', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6219, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #00CFFF22',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>
          ◈ GRAPH NODE × CONTACT × INTEL PROFILE TRIPLE
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GNCIP</span>
        {dk > 0 && (
          <span style={{
            fontSize: 10, color: AM, background: '#F59E0B22',
            border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px',
          }}>
            ⚠ {dk} DARK
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: 'none', border: `1px solid ${CY}44`, color: CY,
          fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
        }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['NODES', rows.length, CY],
          ['FULLY MAPPED', fm, GR],
          ['CONTACT-ONLY', co, CY],
          ['PROFILED', pr, AM],
          ['DARK', dk, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            flex: '1 1 80px', minWidth: 70, background: '#08080f',
            border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 7, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {rows.length > 0 && [[fm, GR], [co, CY], [pr, AM], [dk, RD]].map(([v, c], i) =>
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#08080f',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>
            {t}{t !== 'ALL' ? ` (${rows.filter(r => r._coverage === t).length})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search nodes…"
          style={{
            width: '100%', background: '#08080f', border: '1px solid #00CFFF33',
            borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Assess result */}
      {assessText && (
        <div style={{
          margin: '0 12px 6px', padding: '6px 8px', background: '#05050d',
          border: '1px solid #00CFFF33', borderRadius: 4, fontSize: 10, color: '#ccc', flexShrink: 0,
        }}>
          {assessText}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && (
          <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>
        )}
        {err && (
          <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>
            No nodes match filter.
          </div>
        )}
        {visible.map(node => {
          const color = COVERAGE_COLOR[node._coverage] || CY;
          const isExp = expanded === node.id;
          return (
            <div key={node.id} style={{
              marginBottom: 5, border: `1px solid ${color}33`,
              borderRadius: 5, background: '#06060e', overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : node.id)}
                style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{
                  fontSize: 10, color, minWidth: 0, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {node.name}
                </span>
                {node.kind && (
                  <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{node.kind}</span>
                )}
                {node.centrality > 0 && (
                  <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>
                    c:{node.centrality.toFixed(2)}
                  </span>
                )}
                {chip(node._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* Contacts */}
                  <div>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 700 }}>
                      CONTACTS ({node._contacts.length})
                    </div>
                    {node._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No contact linkage found</div>
                      : node._contacts.map((c, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                            <span style={{ fontSize: 9, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.name}
                            </span>
                            {c.kind && chip(c.kind, CY)}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Intel Profiles */}
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>
                      INTEL PROFILES ({node._profiles.length})
                    </div>
                    {node._profiles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No intel profile found</div>
                      : node._profiles.map((p, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                            <span style={{ fontSize: 9, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </span>
                            {p.category && chip(p.category, AM)}
                          </div>
                          <ScoreBar score={p._score} color={AM} />
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

      {/* Footer */}
      <div style={{
        padding: '4px 12px', borderTop: '1px solid #00CFFF11',
        fontSize: 9, color: '#444', flexShrink: 0, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>GNCIP · /v1/graph/centrality × /entities/Contact × /entities/IntelProfile</span>
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#555', fontSize: 9, cursor: 'pointer' }}>
          ↻ refresh
        </button>
      </div>
    </div>
  );
}
