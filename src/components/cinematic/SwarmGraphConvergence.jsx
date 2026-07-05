/**
 * F162 — Swarm Job × Graph Centrality Convergence
 *
 * Parallel-fetches /entities/SwarmJob + /v1/graph/centrality, then keyword-
 * correlates each swarm job (name/objective/type) against the top-influence
 * graph nodes (name/type/label) to surface:
 *   TARGETING  — swarm automation focuses on at least one high-influence node
 *   PERIPHERAL — job has no matched high-influence node (automation gap)
 *
 * Stat tiles: jobs / nodes / targeting / peripheral
 * Filter tabs: ALL | TARGETING | PERIPHERAL
 * Expand any job → matched nodes with centrality score bar + type badge + relevance.
 * Violet badge on targeting count.
 * ▶ ASSESS: 2-sentence swarm-graph convergence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SWGRPH  at bottom:8 left:52840, zIndex:105.
 * Event:   jarvis:swgrph-toggle
 * Voice:   "swarm graph / swarm centrality / which swarm targets high nodes / swarm node / swgrph"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 52840;
const POLL_MS  = 90_000;
const VIOLET   = "#7C3AED";

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

const SWGRPH_RE =
  /\b(swarm\s+graph|swarm\s+centr(ality)?|which\s+swarm\s+(targets?|focuses?|hits?)\s+(high|top|central|influen)|swarm\s+node|swarm\s+graph\s+converg|swgrph)\b/i;

export function isSwgrphQuery(q) { return SWGRPH_RE.test(q); }

export async function buildSwgrphScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jobsRes, nodesRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,      { headers: hdr }),
      fetch(`${base}/v1/graph/centrality`,    { headers: hdr }),
    ]);
    const jobs  = normaliseJobs(await jobsRes.json());
    const nodes = normaliseNodes(await nodesRes.json());

    const targeting  = jobs.filter((j) => nodes.some((n) => relevance(j, n) > 0)).length;
    const peripheral = jobs.length - targeting;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm-job × graph-centrality convergence: ${jobs.length} swarm jobs, ` +
          `${nodes.length} high-influence graph nodes analysed, ${targeting} jobs target ` +
          `influential nodes, ${peripheral} jobs have no graph alignment. ` +
          `Give a 2-sentence swarm-graph convergence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm-graph convergence analysis complete, sir.").trim();
  } catch {
    return "Swarm-graph convergence analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.jobs)               ? raw.jobs
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((j, i) => ({
    id:        j.id          || j.job_id     || String(i),
    name:      j.name        || j.job_name   || j.title || `Job ${i + 1}`,
    objective: (j.objective  || j.description || j.goal || "").toString(),
    type:      j.type        || j.job_type   || j.category || "",
    status:    j.status      || j.state      || "",
    progress:  typeof j.progress === "number" ? j.progress : null,
  }));
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.nodes)              ? raw.nodes
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((n, i) => ({
    id:          n.id         || n.node_id   || String(i),
    name:        n.name       || n.label     || n.entity || `Node ${i + 1}`,
    type:        n.type       || n.node_type || n.category || "",
    centrality:  typeof n.centrality === "number" ? n.centrality
      : typeof n.score       === "number" ? n.score
      : typeof n.pagerank    === "number" ? n.pagerank
      : 0,
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(job, node) {
  const jw = keywords(`${job.name} ${job.objective.slice(0, 300)} ${job.type}`);
  const nw = keywords(`${node.name} ${node.type}`);
  return jw.filter((w) => nw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(jobs, nodes) {
  const maxC = nodes.reduce((m, n) => Math.max(m, n.centrality), 0) || 1;
  return jobs.map((j) => {
    const matched = nodes
      .map((n) => ({ ...n, score: relevance(j, n), centralityPct: n.centrality / maxC }))
      .filter((n) => n.score > 0)
      .sort((a, b) => b.centralityPct - a.centralityPct || b.score - a.score);
    return { ...j, nodes: matched, targeting: matched.length > 0 };
  });
}

const STATUS_COLOR = {
  running:   "#4ADE80",
  completed: "#60A5FA",
  failed:    "#EF4444",
  pending:   "#F59E0B",
  queued:    "#F59E0B",
};
function statusColor(s) {
  return STATUS_COLOR[(s || "").toLowerCase()] || S.text;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TARGETING", "PERIPHERAL"];

export default function SwarmGraphConvergence() {
  const [open,      setOpen]      = useState(false);
  const [jobs,      setJobs]      = useState([]);
  const [nodes,     setNodes]     = useState([]);
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
      const [jobsRes, nodesRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      ]);
      setJobs(normaliseJobs(await jobsRes.json()));
      setNodes(normaliseNodes(await nodesRes.json()));
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
    window.addEventListener("jarvis:swgrph-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swgrph-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isSwgrphQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked     = buildLinked(jobs, nodes);
  const targeting  = linked.filter((j) => j.targeting).length;
  const peripheral = linked.filter((j) => !j.targeting).length;

  const visible = linked
    .filter((j) => {
      if (filter === "TARGETING")  return j.targeting;
      if (filter === "PERIPHERAL") return !j.targeting;
      return true;
    })
    .filter((j) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        j.name.toLowerCase().includes(q)      ||
        j.type.toLowerCase().includes(q)      ||
        j.objective.toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildSwgrphScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm Job × Graph Centrality Convergence (◈ SWGRPH)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 105,
          background: open ? `${VIOLET}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? VIOLET : S.border}`,
          borderRadius: S.radius, color: open ? VIOLET : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${VIOLET}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SWGRPH{targeting > 0 && (
          <span style={{
            marginLeft: 4,
            background: VIOLET,
            color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{targeting}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 104,
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
              SWARM — GRAPH CENTRALITY
            </span>
            <button
              onClick={assess}
              disabled={assessing || jobs.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || jobs.length === 0) ? 0.4 : 1,
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
              { label: "JOBS",       val: jobs.length,  color: C.blue    },
              { label: "NODES",      val: nodes.length, color: C.neon    },
              { label: "TARGETING",  val: targeting,    color: VIOLET     },
              { label: "PERIPHERAL", val: peripheral,   color: S.textHi  },
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
                background: filter === t ? `${VIOLET}18` : "transparent",
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
              placeholder="search swarm jobs…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Job list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && jobs.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No swarm jobs match.</div>
            ) : visible.map((j) => (
              <div key={j.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${j.targeting ? VIOLET : S.border}`,
                  }}
                >
                  <span style={{ color: j.targeting ? VIOLET : S.text, fontSize: 10, width: 10 }}>
                    {j.targeting ? "◈" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {j.name}
                  </span>
                  {j.status && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      color: statusColor(j.status),
                      border: `1px solid ${statusColor(j.status)}55`,
                      background: `${statusColor(j.status)}11`,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>
                      {j.status}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: j.targeting ? VIOLET : S.text,
                    minWidth: 54, textAlign: "right",
                  }}>
                    {j.targeting ? `${j.nodes.length} NODE${j.nodes.length !== 1 ? "S" : ""}` : "PERIPH"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === j.id ? "▴" : "▾"}</span>
                </div>

                {expanded === j.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {j.objective && (
                      <div style={{
                        color: S.text, fontSize: "8px", marginBottom: 4,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {j.objective.slice(0, 120)}{j.objective.length > 120 ? "…" : ""}
                      </div>
                    )}
                    {j.targeting ? j.nodes.map((n) => (
                      <div key={n.id} style={{
                        padding: "4px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6, marginBottom: 2,
                        }}>
                          {n.type && (
                            <span style={{
                              fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                              color: C.blue, border: `1px solid ${C.blue}55`,
                              background: `${C.blue}11`, whiteSpace: "nowrap",
                            }}>
                              {n.type}
                            </span>
                          )}
                          <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {n.name}
                          </span>
                          <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                            rel:{n.score}
                          </span>
                        </div>
                        {/* Centrality bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: S.text, fontSize: "7px", whiteSpace: "nowrap" }}>centrality</span>
                          <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{
                              width: `${Math.round(n.centralityPct * 100)}%`,
                              height: "100%",
                              background: `linear-gradient(90deg,${VIOLET}cc,${VIOLET})`,
                              borderRadius: 2,
                            }} />
                          </div>
                          <span style={{ color: S.text, fontSize: "7px", whiteSpace: "nowrap", minWidth: 28, textAlign: "right" }}>
                            {(n.centrality || 0).toFixed(3)}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No high-influence graph nodes correlated with this job.
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
            /entities/SwarmJob · /v1/graph/centrality · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
