/**
 * F282 — Contact × Graph Communities Intelligence Bridge (CGIB)
 *
 * Answers: "For each contact, does any graph community cluster contain nodes
 * that match their name or attributes — or are they isolated from the graph?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Contact            → contact list
 *   GET /v1/graph/communities        → graph cluster partition
 *
 * Classification per contact:
 *   IN_CLUSTER  — ≥1 cluster whose member node IDs/labels keyword-match
 *                 the contact's name / email / role / organization
 *   ISOLATED    — no cluster match (contact invisible to the graph model)
 *
 * Stat tiles:  contacts / clusters / in-cluster / isolated
 * Amber badge: isolated count on button
 * Expand row:  matched clusters with member count + relevance score bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ CGIB  at left:6660, bottom:18, zIndex:68
 * Event:   jarvis:cgib-toggle
 * Voice:   "contact graph community / contact cluster / cgib /
 *           clustered contacts / isolated contacts / contact community /
 *           which contacts are in graph clusters / contact graph bridge /
 *           graph contact coverage / community contact"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'IN_CLUSTER', 'ISOLATED'];
const CLASS_COLOR = { IN_CLUSTER: GR, ISOLATED: AM };
const CLASS_LABEL = { IN_CLUSTER: 'IN', ISOLATED: 'ISO' };

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const CGIB_RE =
  /\b(contact[._-]?graph[._-]?communit(?:y|ies)|contact[._-]?cluster|cgib|clustered[._-]?contacts?|isolated[._-]?contacts?|contact[._-]?communit(?:y|ies)|which[._-]?contacts?[._-]?are[._-]?in[._-]?graph[._-]?clusters?|contact[._-]?graph[._-]?bridge|graph[._-]?contact[._-]?coverage|communit(?:y|ies)[._-]?contact)\b/i;

export function isCgibQuery(t) {
  return CGIB_RE.test(t || '');
}

export async function buildCgibScript() {
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [cr, gr] = await Promise.all([
      fetch(`${API}/entities/Contact`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/communities`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normContacts(cr);
    const clusters = normCommunities(gr);
    const { inCluster, isolated } = classify(contacts, clusters);
    return `Contact-graph community bridge: ${contacts.length} contacts analysed across ${clusters.length} graph clusters. ${inCluster} contacts map into at least one cluster; ${isolated} are fully isolated from the graph model — these represent blind spots where the knowledge graph has no structural anchor for these people.`;
  } catch {
    return 'Contact-graph community bridge data temporarily unavailable.';
  }
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normContacts(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.contacts ?? raw?.data ?? raw?.items ?? raw?.results ?? []);
  return arr.map(c => ({
    id:           c.id ?? c._id ?? String(Math.random()),
    name:         c.name ?? c.full_name ?? c.display_name ?? 'Unknown',
    email:        c.email ?? '',
    role:         c.role ?? c.title ?? '',
    organization: c.organization ?? c.org ?? c.company ?? '',
    tags:         Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normCommunities(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.communities ?? raw?.clusters ?? raw?.partitions ?? raw?.data ?? raw?.items ?? []);
  return arr.map((cl, i) => ({
    id:      cl.id ?? cl.cluster_id ?? cl.partition ?? String(i),
    members: Array.isArray(cl.members) ? cl.members
           : Array.isArray(cl.nodes)   ? cl.nodes
           : [],
    size:    cl.size ?? cl.member_count ?? (Array.isArray(cl.members) ? cl.members.length : 0),
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────
function tokens(str) {
  return String(str ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function contactTokens(c) {
  return new Set([
    ...tokens(c.name),
    ...tokens(c.email),
    ...tokens(c.role),
    ...tokens(c.organization),
    ...c.tags.flatMap(tokens),
  ]);
}

function clusterTokens(cl) {
  return new Set(cl.members.flatMap(m => tokens(typeof m === 'string' ? m : (m?.id ?? m?.label ?? ''))));
}

function scoreMatch(aToks, bToks) {
  if (!aToks.size || !bToks.size) return 0;
  let hits = 0;
  for (const t of aToks) { if (bToks.has(t)) hits++; }
  return hits ? Math.round((hits / Math.max(aToks.size, bToks.size)) * 100) : 0;
}

function classify(contacts, clusters) {
  const clToks = clusters.map(cl => clusterTokens(cl));
  let inCluster = 0, isolated = 0;
  const rows = contacts.map(c => {
    const ctoks = contactTokens(c);
    const matches = clusters
      .map((cl, i) => ({ cl, score: scoreMatch(ctoks, clToks[i]) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const classification = matches.length > 0 ? 'IN_CLUSTER' : 'ISOLATED';
    if (classification === 'IN_CLUSTER') inCluster++; else isolated++;
    return { ...c, classification, matches };
  });
  return { rows, inCluster, isolated };
}

// ─── component ───────────────────────────────────────────────────────────────
export default function ContactGraphCommunityBridge() {
  const [open, setOpen]           = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [clusters, setClusters]   = useState([]);
  const [rows, setRows]           = useState([]);
  const [inCluster, setInCluster] = useState(0);
  const [isolated, setIsolated]   = useState(0);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState('');
  const [err, setErr]             = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setErr('');
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [cr, gr] = await Promise.all([
        fetch(`${API}/entities/Contact`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/communities`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const cs = normContacts(cr);
      const cl = normCommunities(gr);
      setContacts(cs); setClusters(cl);
      const { rows: r, inCluster: ic, isolated: iso } = classify(cs, cl);
      setRows(r); setInCluster(ic); setIsolated(iso);
    } catch (e) { setErr(String(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) fetchData(); }, [open, fetchData]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(fetchData, 90_000);
    return () => clearInterval(id);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:cgib-toggle', handler);
    return () => window.removeEventListener('jarvis:cgib-toggle', handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief('');
    const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({
          message: `Contact-Graph Community Bridge status: ${contacts.length} contacts, ${clusters.length} clusters, ${inCluster} in-cluster, ${isolated} isolated. Provide a 2-sentence intelligence brief on the graph coverage gap.`,
        }),
      });
      const d = await res.json();
      const text = d?.response ?? d?.message ?? d?.content ?? 'Analysis unavailable.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { setBrief('Assessment unavailable.'); }
    setAssessing(false);
  }, [contacts.length, clusters.length, inCluster, isolated]);

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.classification !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.role.toLowerCase().includes(q);
    }
    return true;
  });

  const badgeColor = isolated > 0 ? AM : GR;

  // button always visible
  const btn = (
    <button
      onClick={() => setOpen(o => !o)}
      title="Contact × Graph Community Bridge (CGIB)"
      style={{
        position: 'fixed', left: 6660, bottom: 18, zIndex: 68,
        background: open ? AM : 'rgba(20,24,40,0.92)',
        border: `1px solid ${open ? AM : BD}`,
        borderRadius: 4, color: open ? '#000' : AM,
        fontFamily: MONO, fontSize: 9, fontWeight: 700,
        padding: '3px 6px', cursor: 'pointer', letterSpacing: 1,
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      ◈ CGIB
      {isolated > 0 && !open && (
        <span style={{ background: badgeColor, color: '#000', borderRadius: 3, padding: '1px 4px', fontSize: 8 }}>
          {isolated}
        </span>
      )}
    </button>
  );

  if (!open) return btn;

  return (
    <>
      {btn}
      <div style={{
        position: 'fixed', left: 6440, bottom: 56, zIndex: 69,
        width: 520, maxHeight: '78vh',
        background: BG, border: `1px solid ${AM}`,
        borderRadius: 8, fontFamily: MONO, fontSize: 11,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${BD}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: AM, fontWeight: 700, letterSpacing: 1.5, fontSize: 12 }}>
            ◈ CONTACT × GRAPH COMMUNITY BRIDGE
          </span>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '8px 14px' }}>
          {[
            { label: 'CONTACTS',   val: contacts.length, color: CY },
            { label: 'CLUSTERS',   val: clusters.length, color: CY },
            { label: 'IN-CLUSTER', val: inCluster,       color: GR },
            { label: 'ISOLATED',   val: isolated,        color: AM },
          ].map(t => (
            <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '6px 8px', textAlign: 'center' }}>
              <div style={{ color: t.color, fontSize: 18, fontWeight: 700 }}>{t.val}</div>
              <div style={{ color: MU, fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* filters + search */}
        <div style={{ padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? AM : 'rgba(255,255,255,0.05)',
                border: `1px solid ${filter === f ? AM : BD}`,
                borderRadius: 3, color: filter === f ? '#000' : MU,
                fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: '2px 7px', cursor: 'pointer',
              }}>{f}</button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, borderRadius: 3, color: '#e2e8f0', fontFamily: MONO, fontSize: 10, padding: '4px 8px', outline: 'none' }}
          />
        </div>

        {/* assess button */}
        <div style={{ padding: '0 14px 8px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: assessing ? MU : 'rgba(16,185,129,0.15)',
            border: `1px solid ${assessing ? MU : GR}`,
            borderRadius: 3, color: GR, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: '3px 10px', cursor: assessing ? 'not-allowed' : 'pointer',
          }}>{assessing ? '…' : '▶ ASSESS'}</button>
          {brief && <div style={{ color: '#94a3b8', fontSize: 9, lineHeight: 1.5, flex: 1 }}>{brief}</div>}
        </div>

        {/* rows */}
        {loading ? (
          <div style={{ color: MU, padding: '20px', textAlign: 'center', fontSize: 10 }}>Loading…</div>
        ) : err ? (
          <div style={{ color: RD, padding: '12px 14px', fontSize: 9 }}>{err}</div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
            {visible.length === 0 && (
              <div style={{ color: MU, textAlign: 'center', padding: 16, fontSize: 10 }}>No contacts match.</div>
            )}
            {visible.map(r => (
              <div key={r.id} style={{ marginBottom: 5 }}>
                <div
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(255,255,255,0.04)', borderRadius: 4,
                    padding: '6px 8px', cursor: 'pointer',
                    border: `1px solid ${expanded === r.id ? AM : 'transparent'}`,
                  }}
                >
                  <span style={{
                    background: CLASS_COLOR[r.classification] + '22',
                    border: `1px solid ${CLASS_COLOR[r.classification]}`,
                    color: CLASS_COLOR[r.classification],
                    borderRadius: 3, padding: '1px 5px', fontSize: 8, fontWeight: 700, flexShrink: 0,
                  }}>{CLASS_LABEL[r.classification]}</span>
                  <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                    {r.role && <span style={{ color: MU, marginLeft: 6 }}>{r.role}</span>}
                  </span>
                  <span style={{ color: MU, fontSize: 9 }}>{r.matches.length} cluster{r.matches.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: MU, fontSize: 10 }}>{expanded === r.id ? '▲' : '▼'}</span>
                </div>
                {expanded === r.id && (
                  <div style={{ padding: '6px 8px 4px 28px', background: 'rgba(0,0,0,0.3)', borderRadius: '0 0 4px 4px' }}>
                    {r.email && <div style={{ color: MU, fontSize: 9, marginBottom: 4 }}>{r.email} · {r.organization}</div>}
                    {r.matches.length === 0 ? (
                      <div style={{ color: AM, fontSize: 9 }}>No matching graph clusters.</div>
                    ) : (
                      r.matches.map((m, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: CY, fontSize: 9 }}>Cluster {m.cl.id}</span>
                            <span style={{ color: MU, fontSize: 9 }}>{m.cl.size} nodes · score {m.score}</span>
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${Math.min(m.score, 100)}%`, background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '6px 14px', borderTop: `1px solid ${BD}`, color: MU, fontSize: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span>90 s auto-refresh · {visible.length}/{rows.length} contacts</span>
          <button onClick={fetchData} style={{ background: 'none', border: 'none', color: CY, cursor: 'pointer', fontFamily: MONO, fontSize: 8 }}>↻ refresh</button>
        </div>
      </div>
    </>
  );
}
