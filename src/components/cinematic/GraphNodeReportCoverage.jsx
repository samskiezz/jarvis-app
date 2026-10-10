/**
 * F34 — Graph Node × Report Coverage
 *
 * Parallel-fetches /v1/graph/centrality + /v1/reports, then keyword-
 * correlates each top-influence node (name/type/id) against report
 * titles and descriptions to surface:
 *   REPORTED   — at least one report references this high-influence node
 *   UNREPORTED — no report coverage (intelligence gap)
 *
 * Stat tiles: nodes / reports / reported / unreported
 * Filter tabs: ALL | REPORTED | UNREPORTED
 * Expand any node → matched reports with relevance score.
 * Amber badge on unreported count.
 * ▶ ASSESS: 2-sentence graph-report coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GPREP  at bottom:8 left:55640, zIndex:108.
 * Event:   jarvis:gprep-toggle
 * Voice:   "graph report / node report / gprep / unreported nodes /
 *           report coverage / graph report coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 55640;
const POLL_MS  = 90_000;

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

// ── intent helpers ────────────────────────────────────────────────────────────

const GPREP_RE =
  /\b(graph\s+report|node\s+report|gprep|unreported\s+nodes?|report\s+coverage|graph\s+report\s+coverage|which\s+nodes?\s+(have|lack|are\s+in)\s+reports?|nodes?\s+without\s+reports?|report\s+gaps?)\b/i;

export function isGprepQuery(q) { return GPREP_RE.test(q); }

export async function buildGprepScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [centRes, repRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      fetch(`${base}/v1/reports`,          { headers: hdr }),
    ]);
    const nodes   = normaliseNodes(await centRes.json());
    const reports = normaliseReports(await repRes.json());

    const reported   = nodes.filter((n) => reports.some((r) => relevance(n, r) > 0)).length;
    const unreported = nodes.length - reported;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph node report coverage: ${nodes.length} top-influence network nodes, ` +
          `${reports.length} intelligence reports available, ${reported} nodes appear in at least one report, ` +
          `${unreported} high-influence nodes have no report coverage — a significant intelligence gap. ` +
          `Give a 2-sentence graph-report coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Graph report coverage analysis complete, sir.").trim();
  } catch {
    return "Graph report coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.nodes)              ? raw.nodes
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.items)              ? raw.items
    : [];
  return arr.slice(0, 100).map((n, i) => ({
    id:         n.id          || n.node_id    || String(i),
    name:       n.name        || n.label      || n.title   || `Node ${i + 1}`,
    type:       n.type        || n.node_type  || n.category || "",
    centrality: n.centrality_score ?? n.centrality ?? n.score ?? 0,
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.reports)            ? raw.reports
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id          || r.report_id   || String(i),
    title:   r.title       || r.name        || `Report ${i + 1}`,
    summary: (r.summary    || r.description || r.content || r.body || "").toString(),
    type:    r.type        || r.report_type || r.category || "",
    status:  r.status      || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(node, report) {
  const nw = keywords(`${node.name} ${node.type}`);
  const rw = keywords(`${report.title} ${report.summary.slice(0, 500)}`);
  return nw.filter((w) => rw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(nodes, reports) {
  return nodes.map((n) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(n, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...n, reports: matched, reported: matched.length > 0 };
  });
}

function fmtCentrality(v) {
  const n = Number(v);
  if (!n && n !== 0) return "—";
  if (n < 0.01) return n.toFixed(4);
  if (n < 1)    return n.toFixed(3);
  return n.toFixed(1);
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "REPORTED", "UNREPORTED"];

export default function GraphNodeReportCoverage() {
  const [open,      setOpen]      = useState(false);
  const [nodes,     setNodes]     = useState([]);
  const [reports,   setReports]   = useState([]);
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
      const [centRes, repRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
        fetch(`${base}/v1/reports`,          { headers: hdr }),
      ]);
      setNodes(normaliseNodes(await centRes.json()));
      setReports(normaliseReports(await repRes.json()));
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
    window.addEventListener("jarvis:gprep-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gprep-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isGprepQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked     = buildLinked(nodes, reports);
  const reported   = linked.filter((n) => n.reported).length;
  const unreported = linked.filter((n) => !n.reported).length;

  const visible = linked
    .filter((n) => {
      if (filter === "REPORTED")   return n.reported;
      if (filter === "UNREPORTED") return !n.reported;
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
    const text = await buildGprepScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Graph Node × Report Coverage (◈ GPREP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 108,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ GPREP{unreported > 0 && (
          <span style={{
            marginLeft: 4,
            background: "#F59E0B",
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unreported}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 107,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
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
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              GRAPH NODE — REPORT COVERAGE
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
              { label: "NODES",    val: nodes.length,  color: C.blue    },
              { label: "REPORTS",  val: reports.length, color: C.neon    },
              { label: "REPORTED", val: reported,       color: "#4ADE80" },
              { label: "UNREP.",   val: unreported,     color: "#F59E0B" },
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
                background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
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
                    borderLeft: `3px solid ${n.reported ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: n.reported ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {n.reported ? "●" : "○"}
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
                    color: n.reported ? "#4ADE80" : "#F59E0B",
                    minWidth: 56, textAlign: "right",
                  }}>
                    {n.reported ? `${n.reports.length} REP` : "UNREP"}
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
                      centrality: <span style={{ color: C.neon }}>{fmtCentrality(n.centrality)}</span>
                    </div>
                    {n.reported ? n.reports.map((r) => (
                      <div key={r.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        {r.type && (
                          <span style={{
                            fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                            background: `${C.neon}22`, color: C.neon,
                            border: `1px solid ${C.neon}44`, whiteSpace: "nowrap",
                          }}>
                            {r.type}
                          </span>
                        )}
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{r.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#F59E0B", fontSize: "9px", padding: "2px 0" }}>
                        No intelligence reports found covering this graph node.
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
            /v1/graph/centrality · /v1/reports · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
