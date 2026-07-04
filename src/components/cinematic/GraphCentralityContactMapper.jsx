/**
 * GraphCentralityContactMapper — F131.
 *
 * Parallel-fetches /v1/graph/centrality + /entities/Contact and
 * keyword-correlates each contact (name / role / org / department /
 * tags) against top-influence graph nodes (node id / type / labels /
 * description) to surface:
 *
 *   NETWORK-EMBEDDED — contact matched to at least one centrality node
 *   PERIPHERAL       — no match (contact not visible in the influence graph)
 *
 * Stat tiles: contacts / nodes / embedded / peripheral.
 * Filter tabs: ALL | EMBEDDED | PERIPHERAL + text search.
 * Expand contact → matched nodes with centrality score bar + node type
 *   badge + relevance score.
 * Embedded count badge on toggle button (amber).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-network influence
 *   brief + TTS via jarvis:speak-dossier.
 *
 * Toggle:  ◈ GCCM at left:41320, bottom:8, zIndex:85.
 * Event:   jarvis:gccm-toggle
 * Voice:   "contact network" / "graph contact" / "network embedded" /
 *          "centrality contact" / "gccm" / "who is in the graph"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY      = "#29E7FF";
const GREEN   = "#00c878";
const AMBER   = "#F5A623";
const VIOLET  = "#A78BFA";
const CYAN2   = "#6EE7FF";
const BTN_LEFT = 41320;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ──────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.contacts)           ? raw.contacts
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:         c.id           || String(i),
    name:       c.name         || c.full_name || c.label  || `Contact ${i + 1}`,
    role:       c.role         || c.title     || c.job    || "",
    org:        c.organization || c.org       || c.company || c.employer || "",
    department: c.department   || c.dept      || c.team   || "",
    tags:       Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
    email:      c.email        || "",
  }));
}

function normaliseNodes(raw) {
  // /v1/graph/centrality may return {nodes:[...], data:[...], results:[...]}
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.nodes)              ? raw.nodes
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.items)              ? raw.items
    : [];
  return arr.map((n, i) => ({
    id:          n.id           || n.node_id  || String(i),
    name:        n.name         || n.label    || n.title  || n.id || `Node ${i + 1}`,
    type:        n.type         || n.node_type || n.category || "",
    description: n.description  || n.summary  || n.bio   || "",
    labels:      Array.isArray(n.labels) ? n.labels.join(" ")
                 : typeof n.labels === "string" ? n.labels : "",
    centrality:  Number(n.centrality ?? n.score ?? n.rank ?? n.weight ?? 0),
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/.()[\]{}'"]+/)
    .filter((t) => t.length > 2);
}

function relevance(contact, node) {
  const contactWords = new Set([
    ...tokenize(contact.name),
    ...tokenize(contact.role),
    ...tokenize(contact.org),
    ...tokenize(contact.department),
    ...tokenize(contact.tags),
  ]);
  const nodeTokens = [
    ...tokenize(node.name),
    ...tokenize(node.type),
    ...tokenize(node.description),
    ...tokenize(node.labels),
  ];
  if (!contactWords.size || !nodeTokens.length) return 0;
  const hits = nodeTokens.filter((t) => contactWords.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(contactWords.size, nodeTokens.length)) * 100 * 5));
}

function buildMapping(contacts, nodes) {
  const embedded = new Set();
  const pairs    = [];
  for (const contact of contacts) {
    for (const node of nodes) {
      const score = relevance(contact, node);
      if (score >= 8) {
        embedded.add(contact.id);
        pairs.push({ contactId: contact.id, node, score });
      }
    }
  }
  return { embedded, pairs };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isGccmQuery(q) {
  return /contact\s*network|graph\s*contact|network\s*embed|centrality\s*contact|gccm\b|who\s*is\s*in\s*the\s*graph|contact\s*influence|influence\s*contact|network\s*contact/i.test(q || "");
}

export async function buildGccmScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [cr, nr] = await Promise.all([
      fetch(`${base}/entities/Contact`,      { headers }),
      fetch(`${base}/v1/graph/centrality`,   { headers }),
    ]);
    const [craw, nraw] = await Promise.all([cr.json(), nr.json()]);
    const contacts  = normaliseContacts(craw);
    const nodes     = normaliseNodes(nraw);
    const { embedded } = buildMapping(contacts, nodes);
    const peripheral   = contacts.length - embedded.size;
    const pct          = contacts.length
      ? Math.round((embedded.size / contacts.length) * 100)
      : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Graph Centrality × Contact Network: ${contacts.length} contacts correlated against ${nodes.length} top-influence graph nodes. ${embedded.size} contacts are NETWORK-EMBEDDED (${pct}%), ${peripheral} are PERIPHERAL (not visible in the influence graph). Write a 2-sentence contact-network influence brief highlighting the most operationally significant finding.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `${pct}% of contacts are embedded in the influence graph. ${peripheral} contacts remain peripheral — they may represent blind-spots in the network's operational coverage.`;
  } catch (_) {
    return "Graph centrality contact mapping data unavailable.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function GraphCentralityContactMapper() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [nodes,     setNodes]     = useState([]);
  const [embedded,  setEmbedded]  = useState(new Set());
  const [pairs,     setPairs]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [cr, nr] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers }),
        fetch(`${base}/v1/graph/centrality`, { headers }),
      ]);
      const [craw, nraw] = await Promise.all([cr.json(), nr.json()]);
      const ctcts = normaliseContacts(craw);
      const nds   = normaliseNodes(nraw);
      const map   = buildMapping(ctcts, nds);
      setContacts(ctcts);
      setNodes(nds);
      setEmbedded(map.embedded);
      setPairs(map.pairs);
    } catch (_) {
      // keep last state on network failure
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((p) => !p);
    window.addEventListener("jarvis:gccm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gccm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    const text = await buildGccmScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  };

  const peripheral  = contacts.length - embedded.size;
  const pctEmbedded = contacts.length
    ? Math.round((embedded.size / contacts.length) * 100)
    : 0;

  // Normalise centrality values for display bar (0–100)
  const maxCentrality = nodes.reduce((m, n) => Math.max(m, n.centrality), 0) || 1;

  const visible = contacts.filter((c) => {
    const matchesFilter =
      filter === "ALL"       ? true
      : filter === "EMBEDDED"  ? embedded.has(c.id)
      : !embedded.has(c.id);
    const q = search.toLowerCase();
    const matchesSearch = !q || [c.name, c.role, c.org, c.department, c.tags]
      .some((f) => f.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const TABS = ["ALL", "EMBEDDED", "PERIPHERAL"];
  const TAB_LABELS = {
    ALL:       `ALL (${contacts.length})`,
    EMBEDDED:  `EMBEDDED (${embedded.size})`,
    PERIPHERAL:`PERIPHERAL (${peripheral})`,
  };

  // ── panel ─────────────────────────────────────────────────────────────────

  const panelStyle = {
    position:      "fixed",
    bottom:        50,
    left:          BTN_LEFT,
    width:         440,
    maxHeight:     560,
    background:    "rgba(4,12,20,0.97)",
    border:        "1px solid #1A3A4A",
    borderRadius:  10,
    zIndex:        1200,
    display:       "flex",
    flexDirection: "column",
    fontFamily:    "monospace",
    color:         CY,
    boxShadow:     "0 0 24px rgba(167,139,250,0.10)",
    overflow:      "hidden",
  };

  const TILE = (label, value, color) => (
    <div key={label} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: "rgba(41,231,255,0.04)", borderRadius: 6 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || CY }}>{value ?? "—"}</div>
      <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          position:     "fixed",
          bottom:       8,
          left:         BTN_LEFT,
          zIndex:       85,
          background:   open ? "rgba(167,139,250,0.18)" : "rgba(4,12,20,0.82)",
          border:       `1px solid ${open ? VIOLET : "#1A3A4A"}`,
          borderRadius: 5,
          color:        open ? VIOLET : "#4E7A8A",
          fontSize:     10,
          padding:      "3px 8px",
          cursor:       "pointer",
          letterSpacing: 1,
          whiteSpace:   "nowrap",
        }}
      >
        ◈ GCCM{embedded.size > 0 && (
          <span style={{
            marginLeft:   5,
            background:   AMBER,
            color:        "#000",
            borderRadius: 3,
            padding:      "0 4px",
            fontSize:     9,
            fontWeight:   700,
          }}>
            {embedded.size}
          </span>
        )}
      </button>

      {/* ── panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #1A2A3A", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: VIOLET }}>
                ◈ GRAPH CENTRALITY × CONTACT MAPPER
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={assess}
                  disabled={assessing || !contacts.length}
                  style={{
                    background:   "rgba(167,139,250,0.12)",
                    border:       "1px solid #A78BFA",
                    borderRadius: 4,
                    color:        VIOLET,
                    fontSize:     9,
                    padding:      "2px 8px",
                    cursor:       "pointer",
                  }}
                >
                  {assessing ? "…" : "▶ ASSESS"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "none", border: "none", color: "#4E6A7A", fontSize: 14, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {TILE("CONTACTS",         contacts.length,  CY)}
              {TILE("GRAPH NODES",      nodes.length,     CYAN2)}
              {TILE(`EMBEDDED ${pctEmbedded}%`, embedded.size, VIOLET)}
              {TILE("PERIPHERAL",       peripheral,       peripheral > 0 ? AMBER : GREEN)}
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    background:   filter === t
                      ? (t === "EMBEDDED"   ? "rgba(167,139,250,0.15)"
                        : t === "PERIPHERAL" ? "rgba(245,166,35,0.15)"
                        : "rgba(41,231,255,0.12)")
                      : "transparent",
                    border:       `1px solid ${filter === t
                      ? (t === "EMBEDDED"   ? VIOLET
                        : t === "PERIPHERAL" ? AMBER
                        : CY)
                      : "#1A3A4A"}`,
                    borderRadius: 4,
                    color:        filter === t
                      ? (t === "EMBEDDED"   ? VIOLET
                        : t === "PERIPHERAL" ? AMBER
                        : CY)
                      : "#4E6A7A",
                    fontSize:     9,
                    padding:      "2px 7px",
                    cursor:       "pointer",
                    whiteSpace:   "nowrap",
                  }}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search…"
                style={{
                  flex:         1,
                  background:   "rgba(41,231,255,0.04)",
                  border:       "1px solid #1A3A4A",
                  borderRadius: 4,
                  color:        CY,
                  fontSize:     9,
                  padding:      "2px 6px",
                  outline:      "none",
                  minWidth:     0,
                }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 10px" }}>
            {loading && !contacts.length ? (
              <div style={{ textAlign: "center", color: "#4E6A7A", fontSize: 10, padding: 20 }}>
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign: "center", color: "#4E6A7A", fontSize: 10, padding: 20 }}>
                No contacts match current filter.
              </div>
            ) : (
              visible.map((contact) => {
                const isEmbedded   = embedded.has(contact.id);
                const contactPairs = pairs
                  .filter((p) => p.contactId === contact.id)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 5);
                const isExpanded   = expanded === contact.id;

                return (
                  <div
                    key={contact.id}
                    style={{
                      marginBottom:  6,
                      background:    "rgba(41,231,255,0.03)",
                      border:        `1px solid ${isEmbedded ? "rgba(167,139,250,0.22)" : "rgba(78,106,122,0.28)"}`,
                      borderRadius:  6,
                      overflow:      "hidden",
                    }}
                  >
                    {/* Row header */}
                    <div
                      onClick={() => setExpanded(isExpanded ? null : contact.id)}
                      style={{
                        display:    "flex",
                        alignItems: "center",
                        gap:        8,
                        padding:    "7px 10px",
                        cursor:     "pointer",
                      }}
                    >
                      {/* Avatar initial */}
                      <div style={{
                        width:        24,
                        height:       24,
                        borderRadius: "50%",
                        background:   isEmbedded ? "rgba(167,139,250,0.18)" : "rgba(78,106,122,0.18)",
                        border:       `1px solid ${isEmbedded ? VIOLET : "#2A4A5A"}`,
                        display:      "flex",
                        alignItems:   "center",
                        justifyContent: "center",
                        fontSize:     10,
                        fontWeight:   700,
                        color:        isEmbedded ? VIOLET : "#4E6A7A",
                        flexShrink:   0,
                      }}>
                        {(contact.name[0] || "?").toUpperCase()}
                      </div>

                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize:     11,
                          fontWeight:   600,
                          color:        isEmbedded ? "#E0D8FF" : "#8A9AAA",
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}>
                          {contact.name}
                        </div>
                        <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 1 }}>
                          {[contact.role, contact.org].filter(Boolean).join(" · ")}
                        </div>
                      </div>

                      {/* Badge */}
                      <span style={{
                        fontSize:     9,
                        fontWeight:   700,
                        color:        isEmbedded ? VIOLET : "#4E6A7A",
                        background:   isEmbedded ? "rgba(167,139,250,0.10)" : "rgba(78,106,122,0.08)",
                        border:       `1px solid ${isEmbedded ? "rgba(167,139,250,0.30)" : "rgba(78,106,122,0.20)"}`,
                        borderRadius: 3,
                        padding:      "1px 5px",
                        flexShrink:   0,
                      }}>
                        {isEmbedded ? `EMBEDDED ×${contactPairs.length}` : "PERIPHERAL"}
                      </span>

                      {/* Chevron */}
                      <span style={{ fontSize: 9, color: "#4E6A7A" }}>
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* Expanded matched nodes */}
                    {isExpanded && (
                      <div style={{ padding: "0 10px 10px", borderTop: "1px solid #1A2A3A" }}>
                        {contactPairs.length > 0 ? (
                          contactPairs.map(({ node, score }) => {
                            const cBar = maxCentrality > 0
                              ? Math.round((node.centrality / maxCentrality) * 100)
                              : 0;
                            return (
                              <div
                                key={node.id}
                                style={{
                                  marginTop:    8,
                                  background:   "rgba(167,139,250,0.04)",
                                  borderRadius: 5,
                                  padding:      "6px 8px",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  {node.type && (
                                    <span style={{
                                      fontSize:      8,
                                      background:    "rgba(167,139,250,0.10)",
                                      border:        "1px solid rgba(167,139,250,0.30)",
                                      borderRadius:  3,
                                      padding:       "1px 4px",
                                      color:         VIOLET,
                                      textTransform: "uppercase",
                                      flexShrink:    0,
                                    }}>
                                      {node.type}
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize:     10,
                                    color:        "#C0D8E8",
                                    overflow:     "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace:   "nowrap",
                                    flex:         1,
                                  }}>
                                    {node.name}
                                  </span>
                                </div>

                                {/* Centrality bar */}
                                <div style={{ marginTop: 5 }}>
                                  <div style={{ fontSize: 8, color: "#4E6A7A", marginBottom: 2 }}>
                                    CENTRALITY
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ flex: 1, height: 3, background: "rgba(167,139,250,0.12)", borderRadius: 2, overflow: "hidden" }}>
                                      <div style={{ width: `${cBar}%`, height: "100%", background: VIOLET, borderRadius: 2 }} />
                                    </div>
                                    <span style={{ fontSize: 9, color: VIOLET, minWidth: 52, textAlign: "right" }}>
                                      {node.centrality.toFixed ? node.centrality.toFixed(3) : node.centrality}
                                    </span>
                                  </div>
                                </div>

                                {/* Relevance bar */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                                  <div style={{ flex: 1, height: 3, background: "rgba(41,231,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ width: `${score}%`, height: "100%", background: CY, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: 9, color: CY, minWidth: 52, textAlign: "right" }}>
                                    match {score}%
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ marginTop: 10, fontSize: 10, color: "#4E6A7A" }}>
                            ◌ No matching graph nodes — contact is peripheral to the influence network.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:        "6px 14px",
            borderTop:      "1px solid #1A2A3A",
            fontSize:       9,
            color:          "#4E6A7A",
            flexShrink:     0,
            display:        "flex",
            justifyContent: "space-between",
          }}>
            <span>/entities/Contact · /v1/graph/centrality · /v1/jarvis/agent/chat</span>
            <span>{POLL_MS / 1000}s auto-refresh</span>
          </div>
        </div>
      )}
    </>
  );
}
