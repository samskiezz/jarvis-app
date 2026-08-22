/**
 * F170 — Graph Node × Investigation Coverage
 *
 * Parallel-fetches /v1/graph/centrality + /v1/investigations, then keyword-
 * correlates each top-influence node (name/type/id) against open
 * investigation cases (title/description/status) to surface:
 *   INVESTIGATED  — at least one open case covers this high-influence node
 *   UNMONITORED   — no investigation found (intelligence gap)
 *
 * Stat tiles: nodes / investigations / investigated / unmonitored
 * Filter tabs: ALL | INVESTIGATED | UNMONITORED
 * Expand any node → matched investigations with status badge + relevance score.
 * Violet badge on investigated count; amber badge on unmonitored when CRITICAL nodes.
 * ▶ ASSESS: 2-sentence network-investigation coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GNINV  at bottom:8 left:56760, zIndex:111.
 * Event:   jarvis:gninv-toggle
 * Voice:   "graph node investigation / node case coverage / uninvestigated nodes /
 *           which nodes have cases / gninv"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 56760;
const POLL_MS  = 90_000;
const VIOLET   = "#A78BFA";

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

const GNINV_RE =
  /\b(graph\s+node\s+invest|node\s+case\s+coverage|uninvestigated\s+node|which\s+nodes?\s+(have|lack)\s+case|node\s+investigation|gninv|network\s+investigation\s+coverage|high.influence\s+invest|top\s+node\s+invest)\b/i;

export function isGninvQuery(q) { return GNINV_RE.test(q); }

export async function buildGninvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [centRes, invRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      fetch(`${base}/v1/investigations`,   { headers: hdr }),
    ]);
    const nodes         = normaliseNodes(await centRes.json());
    const investigations = normaliseInvestigations(await invRes.json());

    const investigated  = nodes.filter((n) => investigations.some((inv) => relevance(n, inv) > 0)).length;
    const unmonitored   = nodes.length - investigated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph node investigation coverage: ${nodes.length} top-influence network nodes, ` +
          `${investigations.length} open investigations, ${investigated} high-influence nodes have ` +
          `active case coverage, ${unmonitored} high-influence nodes have no open investigation. ` +
          `Give a 2-sentence network-investigation coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Graph node investigation coverage analysis complete, sir.").trim();
  } catch {
    return "Graph node investigation coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.nodes)           ? raw.nodes
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.items)           ? raw.items
    : [];
  return arr.slice(0, 100).map((n, i) => ({
    id:         n.id         || n.node_id   || String(i),
    name:       n.name       || n.label     || n.title  || `Node ${i + 1}`,
    type:       n.type       || n.node_type || n.category || "",
    centrality: n.centrality_score ?? n.centrality ?? n.score ?? 0,
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)                     ? raw
    : Array.isArray(raw?.investigations)             ? raw.investigations
    : Array.isArray(raw?.data)                       ? raw.data
    : Array.isArray(raw?.items)                      ? raw.items
    : Array.isArray(raw?.results)                    ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:          inv.id          || inv.case_id    || String(i),
    title:       inv.title       || inv.name       || `Investigation ${i + 1}`,
    description: (inv.description || inv.summary   || inv.notes || "").toString(),
    status:      inv.status      || inv.state      || "open",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(node, inv) {
  const nw = keywords(`${node.name} ${node.type}`);
  const iw = keywords(`${inv.title} ${inv.description.slice(0, 400)}`);
  return nw.filter((w) => iw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(nodes, investigations) {
  return nodes.map((n) => {
    const matched = investigations
      .map((inv) => ({ ...inv, score: relevance(n, inv) }))
      .filter((inv) => inv.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...n, investigations: matched, investigated: matched.length > 0 };
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
  if (st === "open" || st === "active")        return "#F87171";
  if (st === "investigating" || st === "in_progress") return "#FBBF24";
  if (st === "closed" || st === "resolved")   return "#4ADE80";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "INVESTIGATED", "UNMONITORED"];

export default function GraphNodeInvestigationCoverage() {
  const [open,         setOpen]         = useState(false);
  const [nodes,        setNodes]        = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [filter,       setFilter]       = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [assessing,    setAssessing]    = useState(false);
  const [lastFetch,    setLastFetch]    = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [centRes, invRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
        fetch(`${base}/v1/investigations`,   { headers: hdr }),
      ]);
      setNodes(normaliseNodes(await centRes.json()));
      setInvestigations(normaliseInvestigations(await invRes.json()));
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
    window.addEventListener("jarvis:gninv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gninv-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isGninvQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked       = buildLinked(nodes, investigations);
  const investigated = linked.filter((n) => n.investigated).length;
  const unmonitored  = linked.filter((n) => !n.investigated).length;

  const visible = linked
    .filter((n) => {
      if (filter === "INVESTIGATED")  return n.investigated;
      if (filter === "UNMONITORED")   return !n.investigated;
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
    const text = await buildGninvScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Graph Node × Investigation Coverage (◈ GNINV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 111,
          background: open ? `${VIOLET}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? VIOLET : S.border}`,
          borderRadius: S.radius, color: open ? VIOLET : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${VIOLET}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ GNINV{investigated > 0 && (
          <span style={{
            marginLeft: 4,
            background: VIOLET,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{investigated}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 110,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${VIOLET}`,
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
            <span style={{ color: VIOLET, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              GRAPH NODE — INVESTIGATION COVERAGE
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
              { label: "NODES",       val: nodes.length,     color: C.blue    },
              { label: "INV.",        val: investigations.length, color: C.neon },
              { label: "INVESTIG.",   val: investigated,     color: VIOLET    },
              { label: "UNMONITOR.", val: unmonitored,       color: "#F59E0B" },
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
                background: filter === t ? `${VIOLET}22` : "transparent",
                border: `1px solid ${filter === t ? VIOLET : S.border}`,
                color: filter === t ? VIOLET : S.text,
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
                    borderLeft: `3px solid ${n.investigated ? VIOLET : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: n.investigated ? VIOLET : "#F59E0B", fontSize: 10, width: 10 }}>
                    {n.investigated ? "●" : "○"}
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
                    color: n.investigated ? VIOLET : "#F59E0B",
                    minWidth: 60, textAlign: "right",
                  }}>
                    {n.investigated ? `${n.investigations.length} CASE${n.investigations.length !== 1 ? "S" : ""}` : "UNMONITORED"}
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
                      centrality: <span style={{ color: VIOLET }}>{fmtCentrality(n.centrality)}</span>
                    </div>
                    {n.investigated ? n.investigations.map((inv) => (
                      <div key={inv.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <span style={{
                          fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                          background: `${statusColor(inv.status)}22`,
                          color: statusColor(inv.status),
                          border: `1px solid ${statusColor(inv.status)}44`,
                          whiteSpace: "nowrap",
                        }}>
                          {String(inv.status || "open").toUpperCase()}
                        </span>
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inv.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{inv.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#F59E0B", fontSize: "9px", padding: "2px 0" }}>
                        No open investigations found for this graph node.
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
            /v1/graph/centrality · /v1/investigations · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
