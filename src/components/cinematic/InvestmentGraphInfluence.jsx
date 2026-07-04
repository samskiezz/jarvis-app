/**
 * InvestmentGraphInfluence — F129.
 *
 * Parallel-fetches /entities/Investment + /v1/graph/centrality and
 * keyword-correlates each holding (name / type / sector / ticker / tags)
 * against the graph's top-influence nodes to surface:
 *
 *   NETWORK-ANCHORED — investment matched to at least one high-centrality node
 *   ISOLATED         — no graph network presence detected
 *
 * Stat tiles: investments / nodes / network-anchored / isolated.
 * Filter tabs: ALL | ANCHORED | ISOLATED + text search.
 * Expand holding → matched graph nodes with centrality score + node type badge.
 * Influence indicator bar.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-influence brief
 *   + TTS via jarvis:speak-dossier.
 *
 * Toggle:  ◈ INVGRPH at left:40200, bottom:8, zIndex:83.
 * Event:   jarvis:invgrph-toggle
 * Voice:   "investment graph" / "portfolio influence" /
 *          "network investments" / "invgrph" / "graph investments"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const VIOLET = "#A78BFA";
const BTN_LEFT = 40200;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ──────────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.investments)          ? raw.investments
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:     inv.id     || String(i),
    name:   inv.name   || inv.title || inv.label || `Investment ${i + 1}`,
    type:   inv.type   || inv.asset_type || inv.category || "",
    sector: inv.sector || inv.industry   || inv.domain   || "",
    ticker: inv.ticker || inv.symbol     || inv.code     || "",
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : String(inv.tags || ""),
    desc:   inv.description || inv.notes || "",
  }));
}

function normaliseCentrality(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.nodes)                ? raw.nodes
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.slice(0, 100).map((n, i) => ({
    id:         n.id    || n.node_id || String(i),
    label:      n.label || n.name    || n.entity || `Node ${i + 1}`,
    type:       n.type  || n.entity_type || n.kind || "unknown",
    centrality: typeof n.centrality === "number" ? n.centrality
      : typeof n.score    === "number" ? n.score
      : typeof n.pagerank === "number" ? n.pagerank
      : typeof n.betweenness === "number" ? n.betweenness
      : 0,
    rank: i + 1,
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/.()]+/)
    .filter((t) => t.length > 2);
}

function relevance(inv, node) {
  const invWords = new Set([
    ...tokenize(inv.name),
    ...tokenize(inv.type),
    ...tokenize(inv.sector),
    ...tokenize(inv.ticker),
    ...tokenize(inv.tags),
    ...tokenize(inv.desc),
  ]);
  const nodeTokens = [
    ...tokenize(node.label),
    ...tokenize(node.type),
  ];
  if (!invWords.size || !nodeTokens.length) return 0;
  const hits = nodeTokens.filter((t) => invWords.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(invWords.size, nodeTokens.length)) * 100 * 5));
}

function buildCoverage(investments, nodes) {
  const anchored = new Set();
  const pairs    = [];
  for (const inv of investments) {
    for (const node of nodes) {
      const score = relevance(inv, node);
      if (score >= 8) {
        anchored.add(inv.id);
        pairs.push({ investmentId: inv.id, node, score });
      }
    }
  }
  return { anchored, pairs };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isInvgrphQuery(q) {
  return /investment\s*graph|graph\s*invest|portfolio\s*influenc|network\s*invest|invgrph\b|graph\s*portfolio/i.test(q || "");
}

export async function buildInvgrphScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [ir, nr] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers }),
      fetch(`${base}/v1/graph/centrality`,  { headers }),
    ]);
    const [iraw, nraw] = await Promise.all([ir.json(), nr.json()]);
    const investments = normaliseInvestments(iraw);
    const nodes       = normaliseCentrality(nraw);
    const { anchored } = buildCoverage(investments, nodes);
    const pct = investments.length
      ? Math.round((anchored.size / investments.length) * 100)
      : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Investment × Graph Influence analysis: ${investments.length} holdings, ${nodes.length} centrality nodes. ${anchored.size} holdings are NETWORK-ANCHORED (${pct}%), ${investments.length - anchored.size} ISOLATED. Write a 2-sentence portfolio-network influence brief highlighting key findings.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `${pct}% of holdings are network-anchored. ${anchored.size} investments link to high-influence graph nodes.`;
  } catch (_) {
    return "Investment graph influence data unavailable.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestmentGraphInfluence() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [nodes,       setNodes]       = useState([]);
  const [anchored,    setAnchored]    = useState(new Set());
  const [pairs,       setPairs]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [assessing,   setAssessing]   = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [ir, nr] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers }),
        fetch(`${base}/v1/graph/centrality`,  { headers }),
      ]);
      const [iraw, nraw] = await Promise.all([ir.json(), nr.json()]);
      const invs  = normaliseInvestments(iraw);
      const nds   = normaliseCentrality(nraw);
      const cov   = buildCoverage(invs, nds);
      setInvestments(invs);
      setNodes(nds);
      setAnchored(cov.anchored);
      setPairs(cov.pairs);
    } catch (_) {
      // network failure — keep last state
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((p) => !p);
    window.addEventListener("jarvis:invgrph-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invgrph-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    const text = await buildInvgrphScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  };

  const isolated     = investments.length - anchored.size;
  const pctAnchored  = investments.length
    ? Math.round((anchored.size / investments.length) * 100)
    : 0;

  const maxCentrality = nodes.length ? Math.max(...nodes.map((n) => n.centrality), 0.001) : 1;

  const visible = investments.filter((inv) => {
    const matchesFilter =
      filter === "ALL"      ? true
      : filter === "ANCHORED" ? anchored.has(inv.id)
      : !anchored.has(inv.id);
    const q = search.toLowerCase();
    const matchesSearch = !q || [inv.name, inv.type, inv.sector, inv.ticker, inv.tags, inv.desc]
      .some((f) => f.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const TABS = ["ALL", "ANCHORED", "ISOLATED"];
  const TAB_LABELS = { ALL: `ALL (${investments.length})`, ANCHORED: `ANCHORED (${anchored.size})`, ISOLATED: `ISOLATED (${isolated})` };

  // ── panel ─────────────────────────────────────────────────────────────────

  const panelStyle = {
    position:     "fixed",
    bottom:       50,
    left:         BTN_LEFT,
    width:        440,
    maxHeight:    560,
    background:   "rgba(4,12,20,0.97)",
    border:       "1px solid #1A3A4A",
    borderRadius: 10,
    zIndex:       1200,
    display:      "flex",
    flexDirection: "column",
    fontFamily:   "monospace",
    color:        CY,
    boxShadow:    "0 0 24px rgba(41,231,255,0.10)",
    overflow:     "hidden",
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
          zIndex:       83,
          background:   open ? "rgba(41,231,255,0.18)" : "rgba(4,12,20,0.82)",
          border:       `1px solid ${open ? CY : "#1A3A4A"}`,
          borderRadius: 5,
          color:        open ? CY : "#4E7A8A",
          fontSize:     10,
          padding:      "3px 8px",
          cursor:       "pointer",
          letterSpacing: 1,
          whiteSpace:   "nowrap",
        }}
      >
        ◈ INVGRPH{anchored.size > 0 && (
          <span style={{
            marginLeft:   5,
            background:   VIOLET,
            color:        "#000",
            borderRadius: 3,
            padding:      "0 4px",
            fontSize:     9,
            fontWeight:   700,
          }}>
            {anchored.size}
          </span>
        )}
      </button>

      {/* ── panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #1A2A3A", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
                ◈ INVESTMENT × GRAPH INFLUENCE
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={assess}
                  disabled={assessing || !investments.length}
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
              {TILE("INVESTMENTS", investments.length, CY)}
              {TILE("GRAPH NODES", nodes.length, "#6EE7FF")}
              {TILE(`ANCHORED ${pctAnchored}%`, anchored.size, VIOLET)}
              {TILE("ISOLATED", isolated, isolated > 0 ? AMBER : GREEN)}
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    background:   filter === t ? (t === "ANCHORED" ? "rgba(167,139,250,0.18)" : t === "ISOLATED" ? "rgba(245,166,35,0.15)" : "rgba(41,231,255,0.12)") : "transparent",
                    border:       `1px solid ${filter === t ? (t === "ANCHORED" ? VIOLET : t === "ISOLATED" ? AMBER : CY) : "#1A3A4A"}`,
                    borderRadius: 4,
                    color:        filter === t ? (t === "ANCHORED" ? VIOLET : t === "ISOLATED" ? AMBER : CY) : "#4E6A7A",
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
            {loading && !investments.length ? (
              <div style={{ textAlign: "center", color: "#4E6A7A", fontSize: 10, padding: 20 }}>
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign: "center", color: "#4E6A7A", fontSize: 10, padding: 20 }}>
                No holdings match current filter.
              </div>
            ) : (
              visible.map((inv) => {
                const isAnchored  = anchored.has(inv.id);
                const invPairs    = pairs.filter((p) => p.investmentId === inv.id)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 5);
                const isExpanded  = expanded === inv.id;

                return (
                  <div
                    key={inv.id}
                    style={{
                      marginBottom:  6,
                      background:    "rgba(41,231,255,0.03)",
                      border:        `1px solid ${isAnchored ? "rgba(167,139,250,0.25)" : "#1A2A3A"}`,
                      borderRadius:  6,
                      overflow:      "hidden",
                    }}
                  >
                    {/* Row header */}
                    <div
                      onClick={() => setExpanded(isExpanded ? null : inv.id)}
                      style={{
                        display:    "flex",
                        alignItems: "center",
                        gap:        8,
                        padding:    "7px 10px",
                        cursor:     "pointer",
                      }}
                    >
                      {/* Status dot */}
                      <div style={{
                        width:        7,
                        height:       7,
                        borderRadius: "50%",
                        background:   isAnchored ? VIOLET : "#2A3A4A",
                        flexShrink:   0,
                      }} />

                      {/* Name + tags */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize:     11,
                          fontWeight:   600,
                          color:        isAnchored ? "#E0E8FF" : "#8AAABB",
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}>
                          {inv.name}
                        </div>
                        <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 1 }}>
                          {[inv.type, inv.sector, inv.ticker].filter(Boolean).join(" · ")}
                        </div>
                      </div>

                      {/* Badge */}
                      <span style={{
                        fontSize:     9,
                        fontWeight:   700,
                        color:        isAnchored ? VIOLET : AMBER,
                        background:   isAnchored ? "rgba(167,139,250,0.12)" : "rgba(245,166,35,0.10)",
                        border:       `1px solid ${isAnchored ? "rgba(167,139,250,0.35)" : "rgba(245,166,35,0.25)"}`,
                        borderRadius: 3,
                        padding:      "1px 5px",
                        flexShrink:   0,
                      }}>
                        {isAnchored ? `ANCHORED ×${invPairs.length}` : "ISOLATED"}
                      </span>

                      {/* Chevron */}
                      <span style={{ fontSize: 9, color: "#4E6A7A" }}>
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* Expanded matched nodes */}
                    {isExpanded && (
                      <div style={{ padding: "0 10px 10px", borderTop: "1px solid #1A2A3A" }}>
                        {invPairs.length > 0 ? (
                          invPairs.map(({ node, score }) => {
                            const normC = maxCentrality > 0
                              ? Math.round((node.centrality / maxCentrality) * 100)
                              : 0;
                            return (
                              <div
                                key={node.id}
                                style={{
                                  marginTop:    8,
                                  background:   "rgba(167,139,250,0.05)",
                                  borderRadius: 5,
                                  padding:      "6px 8px",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{
                                    fontSize:     8,
                                    background:   "rgba(41,231,255,0.10)",
                                    border:       "1px solid #1A4A5A",
                                    borderRadius: 3,
                                    padding:      "1px 4px",
                                    color:        CY,
                                    textTransform: "uppercase",
                                    flexShrink:   0,
                                  }}>
                                    {node.type}
                                  </span>
                                  <span style={{
                                    fontSize:     10,
                                    color:        "#C0D8E8",
                                    overflow:     "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace:   "nowrap",
                                    flex:         1,
                                  }}>
                                    #{node.rank} {node.label}
                                  </span>
                                  <span style={{ fontSize: 9, color: VIOLET, flexShrink: 0 }}>
                                    {node.centrality.toFixed ? node.centrality.toFixed(4) : node.centrality}
                                  </span>
                                </div>

                                {/* Centrality bar */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                                  <div style={{ flex: 1, height: 3, background: "rgba(167,139,250,0.12)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ width: `${normC}%`, height: "100%", background: VIOLET, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: 9, color: "#4E6A7A", minWidth: 52, textAlign: "right" }}>
                                    centrality {normC}%
                                  </span>
                                </div>

                                {/* Relevance bar */}
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                  <div style={{ flex: 1, height: 3, background: "rgba(245,166,35,0.12)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ width: `${score}%`, height: "100%", background: AMBER, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: 9, color: AMBER, minWidth: 52, textAlign: "right" }}>
                                    match {score}%
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ marginTop: 10, fontSize: 10, color: GREEN }}>
                            ✓ No graph centrality cross-references — holding is ISOLATED from the network.
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
            <span>/entities/Investment · /v1/graph/centrality · /v1/jarvis/agent/chat</span>
            <span>{POLL_MS / 1000}s auto-refresh</span>
          </div>
        </div>
      )}
    </>
  );
}
