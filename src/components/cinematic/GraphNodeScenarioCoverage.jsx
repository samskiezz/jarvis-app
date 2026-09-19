/**
 * F190 — Graph Node × Scenario Coverage (GNSCEN)
 *
 * Parallel-fetches /v1/graph/centrality + /v1/scenario/list, then keyword-
 * correlates each top-influence node (name/type/id) against active operational
 * scenarios (title/description/objective/tags) to surface:
 *   PLANNED    — at least one scenario covers this high-influence node
 *   UNPLANNED  — no scenario found (strategic planning gap)
 *
 * Stat tiles: nodes / scenarios / planned / unplanned
 * Filter tabs: ALL | PLANNED | UNPLANNED
 * Expand any node → matched scenarios with status badge + relevance score.
 * Red badge on unplanned count.
 * ▶ ASSESS: 2-sentence node-scenario planning brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GNSCEN  at bottom:8 left:67960, zIndex:131.
 * Event:   jarvis:gnscen-toggle
 * Voice:   "graph node scenario / node scenario coverage / gnscen /
 *           high influence scenario / unplanned nodes / which nodes have scenarios"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 67960;
const POLL_MS  = 90_000;
const RED      = "#F87171";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const GNSCEN_RE =
  /\b(graph\s+node\s+scen|node\s+scenario\s+(coverage|plan)|gnscen|high.influence\s+scen|unplanned\s+node|which\s+nodes?\s+(have|lack)\s+scen|node\s+plan(ning)?|scenario\s+node\s+coverage|strategic\s+node\s+gap)\b/i;

export function isGnscenQuery(q) { return GNSCEN_RE.test(q); }

export async function buildGnscenScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [centRes, scenRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
    ]);
    const nodes     = normaliseNodes(await centRes.json());
    const scenarios = normaliseScenarios(await scenRes.json());

    const planned   = nodes.filter((n) => scenarios.some((s) => relevance(n, s) > 0)).length;
    const unplanned = nodes.length - planned;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph node scenario planning coverage: ${nodes.length} top-influence network nodes, ` +
          `${scenarios.length} operational scenarios, ${planned} high-influence nodes have active ` +
          `scenario coverage, ${unplanned} high-influence nodes have no operational scenario. ` +
          `Give a 2-sentence node-scenario strategic planning brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Graph node scenario planning coverage analysis complete, sir.").trim();
  } catch {
    return "Graph node scenario planning coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.nodes)         ? raw.nodes
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.results)       ? raw.results
    : Array.isArray(raw?.items)         ? raw.items
    : [];
  return arr.slice(0, 100).map((n, i) => ({
    id:         n.id         || n.node_id   || String(i),
    name:       n.name       || n.label     || n.title  || `Node ${i + 1}`,
    type:       n.type       || n.node_type || n.category || "",
    centrality: n.centrality_score ?? n.centrality ?? n.score ?? 0,
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.scenarios)             ? raw.scenarios
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.items)                 ? raw.items
    : Array.isArray(raw?.results)               ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    title:       s.title       || s.name        || `Scenario ${i + 1}`,
    description: (s.description || s.objective  || s.summary || s.notes || "").toString(),
    status:      s.status      || s.state       || "active",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(node, scenario) {
  const nw = keywords(`${node.name} ${node.type}`);
  const sw = keywords(`${scenario.title} ${scenario.description.slice(0, 400)}`);
  return nw.filter((w) => sw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(nodes, scenarios) {
  return nodes.map((n) => {
    const matched = scenarios
      .map((s) => ({ ...s, score: relevance(n, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...n, scenarios: matched, planned: matched.length > 0 };
  });
}

function fmtCentrality(v) {
  const n = Number(v);
  if (!n && n !== 0) return "—";
  if (n < 0.01) return n.toFixed(4);
  if (n < 1)    return n.toFixed(3);
  return n.toFixed(1);
}

function statusColor(s) {
  const st = String(s || "").toLowerCase();
  if (st === "active" || st === "running")          return "#4ADE80";
  if (st === "pending" || st === "draft")           return "#FBBF24";
  if (st === "completed" || st === "done")          return "#60A5FA";
  if (st === "cancelled" || st === "failed")        return "#F87171";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "PLANNED", "UNPLANNED"];

export default function GraphNodeScenarioCoverage() {
  const [open,      setOpen]      = useState(false);
  const [nodes,     setNodes]     = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [centRes, scenRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
      ]);
      setNodes(normaliseNodes(await centRes.json()));
      setScenarios(normaliseScenarios(await scenRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:gnscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gnscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isGnscenQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked   = buildLinked(nodes, scenarios);
  const planned  = linked.filter((n) => n.planned).length;
  const unplanned = linked.filter((n) => !n.planned).length;

  const visible = linked
    .filter((n) => {
      if (filter === "PLANNED")   return n.planned;
      if (filter === "UNPLANNED") return !n.planned;
      return true;
    })
    .filter((n) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        n.name.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildGnscenScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Graph Node × Scenario Coverage (◈ GNSCEN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 131,
          background: open ? `${RED}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? RED : S.border}`,
          borderRadius: S.radius, color: open ? RED : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${RED}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ GNSCEN{unplanned > 0 && (
          <span style={{
            marginLeft: 4,
            background: RED,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unplanned}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 130,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${RED}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: RED, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              GRAPH NODE — SCENARIO COVERAGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || nodes.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || nodes.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "NODES",     val: nodes.length,     color: C.blue    },
              { label: "SCENARIOS", val: scenarios.length,  color: C.neon   },
              { label: "PLANNED",   val: planned,           color: "#4ADE80" },
              { label: "UNPLANNED", val: unplanned,         color: RED       },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1,
                background: filter === t ? `${RED}22` : "transparent",
                border: `1px solid ${filter === t ? RED : S.border}`,
                color: filter === t ? RED : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search nodes…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Node list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && nodes.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No nodes match.</div>
            ) : visible.map((n) => (
              <div key={n.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${n.planned ? "#4ADE80" : RED}`,
                  }}
                >
                  <span style={{ color: n.planned ? "#4ADE80" : RED, fontSize: 10, width: 10 }}>
                    {n.planned ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.name}
                  </span>
                  {n.type && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      color: C.blue, border: `1px solid ${C.blue}55`,
                      background: `${C.blue}11`, whiteSpace: "nowrap",
                    }}>
                      {n.type}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: n.planned ? "#4ADE80" : RED,
                    minWidth: 64, textAlign: "right",
                  }}>
                    {n.planned ? `${n.scenarios.length} SCEN.` : "UNPLANNED"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === n.id ? "▴" : "▾"}</span>
                </div>

                {expanded === n.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                      centrality: <span style={{ color: RED }}>{fmtCentrality(n.centrality)}</span>
                    </div>
                    {n.planned ? n.scenarios.map((s) => (
                      <div key={s.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <span style={{
                          fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                          background: `${statusColor(s.status)}22`,
                          color: statusColor(s.status),
                          border: `1px solid ${statusColor(s.status)}44`,
                          whiteSpace: "nowrap",
                        }}>
                          {String(s.status || "active").toUpperCase()}
                        </span>
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{s.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: RED, fontSize: "9px", padding: "2px 0" }}>
                        No operational scenarios found for this graph node.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/graph/centrality · /v1/scenario/list · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
