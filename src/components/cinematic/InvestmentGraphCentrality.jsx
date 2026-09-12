/**
 * F123 — Investment × Graph Centrality Coverage (IGCV)
 *
 * Parallel-fetches /entities/Investment and /v1/graph/centrality, then
 * keyword-correlates each investment (name, sector, category, tags, notes)
 * against the top-centrality graph nodes (id, label, type) to surface:
 *
 *   ENTITY_LINKED — investment keyword-matches ≥1 high-centrality graph node
 *   PERIPHERAL    — investment has no alignment with any central graph entity
 *
 * Stat tiles: investments / centrality nodes / entity-linked / peripheral
 * Filter tabs: ALL | ENTITY_LINKED | PERIPHERAL + text search
 * Expand investment → matched nodes with centrality score + relevance bar.
 * Amber badge on PERIPHERAL count (gap indicator).
 * ▶ ASSESS: 2-sentence portfolio graph-coverage brief via /v1/jarvis/agent/chat
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IGCV  at left:4140 bottom:18, zIndex:68.
 * Event:   jarvis:igcv-toggle
 * Voice:   "investment graph / graph investment / igcv / peripheral investments /
 *           investment centrality / portfolio graph / investment node coverage /
 *           which investments have graph nodes / entity linked investments /
 *           portfolio entity coverage / graph portfolio coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 4140;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const VIOLET   = "#A78BFA";
const ROSE     = "#FB7185";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const IGCV_RE =
  /\b(investment\s+graph|graph\s+investment[s]?|igcv|peripheral\s+investment[s]?|investment\s+centralit[y]?|portfolio\s+graph|investment\s+node\s+coverage|which\s+investment[s]?\s+(have|has)\s+graph\s+(node[s]?)?|entity\s+linked\s+investment[s]?|portfolio\s+entity\s+coverage|graph\s+portfolio|portfolio\s+centrality|investment\s+entity\s+map)\b/i;

export function isIgcvQuery(q) { return IGCV_RE.test(q); }
export const isIvgcQuery = isIgcvQuery;

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? raw?.investments ?? []);
  return arr.map((x) => ({
    id:       x.id ?? x._id ?? String(Math.random()),
    name:     String(x.name ?? x.title ?? "Investment"),
    sector:   String(x.sector ?? x.category ?? x.type ?? ""),
    tags:     Array.isArray(x.tags) ? x.tags.join(" ") : String(x.tags ?? ""),
    notes:    String(x.notes ?? x.description ?? x.summary ?? ""),
  }));
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.nodes ?? raw?.items ?? raw?.data ?? []);
  return arr.map((n) => ({
    id:          String(n.id ?? n.node_id ?? n._id ?? Math.random()),
    label:       String(n.label ?? n.name ?? n.id ?? "Node"),
    type:        String(n.type ?? n.entity_type ?? ""),
    centrality:  typeof n.centrality === "number" ? n.centrality
                 : typeof n.score     === "number" ? n.score
                 : typeof n.degree    === "number" ? n.degree : 0,
  }));
}

function relevance(inv, node) {
  const haystack = [inv.name, inv.sector, inv.tags, inv.notes].join(" ").toLowerCase();
  const needles  = [node.label, node.type, node.id]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  let score = 0;
  needles.forEach((n) => { if (haystack.includes(n)) score += 1; });
  return score;
}

function correlate(investments, nodes) {
  return investments.map((inv) => {
    const matches = nodes
      .map((node) => ({ node, score: relevance(inv, node) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.node.centrality - a.node.centrality || b.score - a.score);
    return { ...inv, matches, linked: matches.length > 0 };
  });
}

// ── async build helper exported for JarvisBrain ───────────────────────────────

export async function buildIgcvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, nodeRes] = await Promise.all([
      fetch(`${base}/entities/Investment`,   { headers: hdr }),
      fetch(`${base}/v1/graph/centrality`,   { headers: hdr }),
    ]);
    const investments = normaliseInvestments(await invRes.json());
    const nodes       = normaliseNodes(await nodeRes.json());
    const correlated  = correlate(investments, nodes);

    const linked     = correlated.filter((i) => i.linked).length;
    const peripheral = investments.length - linked;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment × graph centrality coverage analysis: ${investments.length} portfolio ` +
          `positions cross-referenced against ${nodes.length} high-centrality graph entities. ` +
          `${linked} positions are ENTITY_LINKED (aligned with key graph nodes); ` +
          `${peripheral} are PERIPHERAL (no central graph entity alignment). ` +
          `Provide a 2-sentence portfolio graph-coverage intelligence brief — formal British butler ` +
          `tone, first person, highlight any coverage gaps or high-centrality alignments worth noting.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Portfolio graph-centrality analysis complete, sir.").trim();
  } catch {
    return "Portfolio graph-centrality analysis unavailable at this time, sir.";
  }
}

export { buildIgcvScript as buildIvgcScript };

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestmentGraphCentrality() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [rows,      setRows]      = useState([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [err,       setErr]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, nodeRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      ]);
      if (!invRes.ok || !nodeRes.ok) throw new Error("fetch failed");
      const investments = normaliseInvestments(await invRes.json());
      const nodes       = normaliseNodes(await nodeRes.json());
      setNodeCount(nodes.length);
      setRows(correlate(investments, nodes));
      setErr("");
    } catch (e) {
      setErr(String(e.message ?? "Load failed"));
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:igcv-toggle", handler);
    window.addEventListener("jarvis:ivgc-toggle", handler);
    return () => {
      window.removeEventListener("jarvis:igcv-toggle", handler);
      window.removeEventListener("jarvis:ivgc-toggle", handler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const script = await buildIgcvScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  if (!open) {
    const peripheral = rows.filter((r) => !r.linked).length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:    "fixed",
          left:        BTN_LEFT,
          bottom:      18,
          zIndex:      68,
          background:  peripheral > 0 ? "rgba(245,158,11,0.15)" : "rgba(0,0,0,0.55)",
          border:      `1px solid ${peripheral > 0 ? AMBER : "#29E7FF44"}`,
          borderRadius: 6,
          color:       peripheral > 0 ? AMBER : CYAN,
          fontFamily:  "monospace",
          fontSize:    11,
          padding:     "4px 8px",
          cursor:      "pointer",
          whiteSpace:  "nowrap",
        }}
      >
        ◈ IGCV{peripheral > 0 ? ` [${peripheral}]` : ""}
      </button>
    );
  }

  const linked     = rows.filter((r) => r.linked).length;
  const peripheral = rows.length - linked;

  const visible = rows.filter((r) => {
    if (tab === "ENTITY_LINKED" && !r.linked) return false;
    if (tab === "PERIPHERAL"    &&  r.linked) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.sector.toLowerCase().includes(q) ||
        r.tags.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const panelStyle = {
    position:    "fixed",
    bottom:      60,
    left:        BTN_LEFT,
    width:       530,
    maxHeight:   520,
    overflowY:   "auto",
    background:  "rgba(8,16,26,0.97)",
    border:      "1px solid #29E7FF33",
    borderRadius: 10,
    zIndex:      68,
    padding:     16,
    fontFamily:  "monospace",
    color:       "#C8D8E8",
    fontSize:    12,
  };

  const tile = (label, val, col) => (
    <div style={{
      flex: 1, textAlign: "center", background: "rgba(255,255,255,0.04)",
      borderRadius: 6, padding: "6px 4px",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 10, color: SLATE }}>{label}</div>
    </div>
  );

  const tabBtn = (label) => (
    <button key={label} onClick={() => setTab(label)} style={{
      background:   tab === label ? "#29E7FF22" : "transparent",
      border:       `1px solid ${tab === label ? CYAN : "#29E7FF33"}`,
      borderRadius: 4,
      color:        tab === label ? CYAN : SLATE,
      fontFamily:   "monospace",
      fontSize:     11,
      padding:      "2px 8px",
      cursor:       "pointer",
    }}>{label}</button>
  );

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: AMBER, fontWeight: 700, fontSize: 13 }}>
          ◈ INVESTMENT × GRAPH CENTRALITY
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: SLATE,
          cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {err && <div style={{ color: ROSE, marginBottom: 8, fontSize: 11 }}>{err}</div>}

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {tile("INVESTMENTS",   rows.length,  CYAN)}
        {tile("CENTRAL NODES", nodeCount,    VIOLET)}
        {tile("ENTITY_LINKED", linked,       GREEN)}
        {tile("PERIPHERAL",    peripheral,   AMBER)}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {["ALL", "ENTITY_LINKED", "PERIPHERAL"].map(tabBtn)}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.06)",
            border: "1px solid #29E7FF33", borderRadius: 4,
            color: "#C8D8E8", fontSize: 11, padding: "2px 6px", width: 100,
          }}
        />
      </div>

      {/* rows */}
      {visible.length === 0 && (
        <div style={{ color: SLATE, textAlign: "center", padding: 16 }}>No results.</div>
      )}
      {visible.map((inv) => (
        <div key={inv.id} style={{
          background:   "rgba(255,255,255,0.03)",
          border:       `1px solid ${inv.linked ? "#A78BFA44" : AMBER + "55"}`,
          borderRadius: 6,
          marginBottom: 6,
          overflow:     "hidden",
        }}>
          <div
            onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        8,
              padding:    "6px 10px",
              cursor:     "pointer",
            }}
          >
            <span style={{
              fontSize:    10,
              fontWeight:  700,
              padding:     "1px 6px",
              borderRadius: 3,
              background:  inv.linked ? "rgba(167,139,250,0.2)" : "rgba(245,158,11,0.15)",
              color:       inv.linked ? VIOLET : AMBER,
            }}>
              {inv.linked ? "ENTITY_LINKED" : "PERIPHERAL"}
            </span>
            <span style={{ flex: 1, fontWeight: 600, color: "#E0EEFF" }}>{inv.name}</span>
            {inv.sector && (
              <span style={{ fontSize: 10, color: SLATE }}>{inv.sector}</span>
            )}
            <span style={{ color: SLATE, fontSize: 10 }}>
              {inv.linked ? `${inv.matches.length} node${inv.matches.length !== 1 ? "s" : ""}` : "—"}
            </span>
          </div>

          {expanded === inv.id && inv.matches.length > 0 && (
            <div style={{ borderTop: "1px solid #29E7FF22", padding: "8px 10px" }}>
              {inv.matches.slice(0, 8).map(({ node, score }) => {
                const maxScore = Math.max(...inv.matches.map((m) => m.score), 1);
                const maxCent  = Math.max(...inv.matches.map((m) => m.node.centrality), 1);
                return (
                  <div key={node.id} style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          8,
                    marginBottom: 5,
                  }}>
                    {node.type && (
                      <span style={{
                        fontSize:    9,
                        fontWeight:  700,
                        padding:     "1px 5px",
                        borderRadius: 3,
                        background:  "rgba(167,139,250,0.2)",
                        color:       VIOLET,
                      }}>
                        {node.type}
                      </span>
                    )}
                    <span style={{ flex: 1, color: "#C8D8E8", fontSize: 11 }}>{node.label}</span>
                    <span style={{ fontSize: 10, color: SLATE, whiteSpace: "nowrap" }}>
                      c:{node.centrality.toFixed ? node.centrality.toFixed(3) : node.centrality}
                    </span>
                    <div style={{ width: 60, background: "#1E2A38", borderRadius: 3, height: 6 }}>
                      <div style={{
                        width:        `${Math.round((score / maxScore) * 100)}%`,
                        height:       "100%",
                        background:   VIOLET,
                        borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ width: 22, textAlign: "right", color: VIOLET, fontSize: 10 }}>
                      {score}
                    </span>
                  </div>
                );
              })}
              {inv.matches.length > 8 && (
                <div style={{ color: SLATE, fontSize: 10, paddingTop: 4 }}>
                  +{inv.matches.length - 8} more nodes…
                </div>
              )}
            </div>
          )}

          {expanded === inv.id && inv.matches.length === 0 && (
            <div style={{ padding: "6px 10px", color: SLATE, fontSize: 11, borderTop: "1px solid #29E7FF22" }}>
              No central graph node correlations.
            </div>
          )}
        </div>
      ))}

      {/* assess */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background:   "rgba(167,139,250,0.15)",
            border:       `1px solid ${VIOLET}`,
            borderRadius: 4,
            color:        VIOLET,
            fontFamily:   "monospace",
            fontSize:     11,
            padding:      "4px 10px",
            cursor:       assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
        {brief && (
          <div style={{
            flex:       1,
            color:      "#C8D8E8",
            fontSize:   11,
            lineHeight: 1.5,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 6,
            padding:    "6px 8px",
          }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
