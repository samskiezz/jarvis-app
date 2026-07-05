/**
 * F159 — Graph Node × Knowledge Coverage
 *
 * Parallel-fetches /v1/graph/centrality + /knowledge/, then keyword-
 * correlates each top-influence node (name/type/id) against knowledge
 * articles (title/content/summary) to surface:
 *   DOCUMENTED — at least one article backs this high-influence node
 *   DARK        — no knowledge documentation (intelligence gap)
 *
 * Stat tiles: nodes / articles / documented / dark
 * Filter tabs: ALL | DOCUMENTED | DARK
 * Expand any node → matched articles with relevance score + type badge.
 * Amber badge on dark count.
 * ▶ ASSESS: 2-sentence network-knowledge coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GKNOW  at bottom:8 left:51960, zIndex:103.
 * Event:   jarvis:gknow-toggle
 * Voice:   "graph knowledge / node docs / network knowledge / top node docs / gknow"
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 51960;
const POLL_MS  = 120_000;

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

const GKNOW_RE =
  /\b(graph\s+knowledge|node\s+docs?|network\s+knowledge|top\s+node\s+docs?|gknow|knowledge\s+graph\s+nodes?|graph\s+node\s+coverage|which\s+nodes?\s+(have|lack)\s+(docs?|knowledge)|dark\s+graph\s+nodes?)\b/i;

export function isGknowQuery(q) { return GKNOW_RE.test(q); }

export async function buildGknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [centRes, knowRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      fetch(`${base}/knowledge/`,          { headers: hdr }),
    ]);
    const nodes    = normaliseNodes(await centRes.json());
    const articles = normaliseArticles(await knowRes.json());

    const documented = nodes.filter((n) => articles.some((a) => relevance(n, a) > 0)).length;
    const dark       = nodes.length - documented;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph node knowledge coverage: ${nodes.length} top-influence network nodes, ` +
          `${articles.length} knowledge articles, ${documented} nodes have documentation backing, ` +
          `${dark} high-influence nodes lack any knowledge coverage. ` +
          `Give a 2-sentence network-knowledge coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Graph knowledge coverage analysis complete, sir.").trim();
  } catch {
    return "Graph knowledge coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.nodes)             ? raw.nodes
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.results)           ? raw.results
    : Array.isArray(raw?.items)             ? raw.items
    : [];
  return arr.slice(0, 100).map((n, i) => ({
    id:         n.id         || n.node_id   || String(i),
    name:       n.name       || n.label     || n.title  || `Node ${i + 1}`,
    type:       n.type       || n.node_type || n.category || "",
    centrality: n.centrality_score ?? n.centrality ?? n.score ?? 0,
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.articles)           ? raw.articles
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((a, i) => ({
    id:      a.id       || String(i),
    title:   a.title    || a.name   || `Article ${i + 1}`,
    content: (a.content || a.summary || a.description || a.body || "").toString(),
    type:    a.type     || a.category || a.source || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(node, article) {
  const nw = keywords(`${node.name} ${node.type}`);
  const aw = keywords(`${article.title} ${article.content.slice(0, 400)}`);
  return nw.filter((w) => aw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(nodes, articles) {
  return nodes.map((n) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(n, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...n, articles: matched, documented: matched.length > 0 };
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

const TABS = ["ALL", "DOCUMENTED", "DARK"];

export default function GraphNodeKnowledgeCoverage() {
  const [open,      setOpen]      = useState(false);
  const [nodes,     setNodes]     = useState([]);
  const [articles,  setArticles]  = useState([]);
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
      const [centRes, knowRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
        fetch(`${base}/knowledge/`,          { headers: hdr }),
      ]);
      setNodes(normaliseNodes(await centRes.json()));
      setArticles(normaliseArticles(await knowRes.json()));
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
    window.addEventListener("jarvis:gknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isGknowQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked     = buildLinked(nodes, articles);
  const documented = linked.filter((n) => n.documented).length;
  const dark       = linked.filter((n) => !n.documented).length;

  const visible = linked
    .filter((n) => {
      if (filter === "DOCUMENTED") return n.documented;
      if (filter === "DARK")       return !n.documented;
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
    const text = await buildGknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Graph Node × Knowledge Coverage (◈ GKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 103,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ GKNOW{dark > 0 && (
          <span style={{
            marginLeft: 4,
            background: "#F59E0B",
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 102,
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
              GRAPH NODE — KNOWLEDGE COVERAGE
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
              { label: "NODES",   val: nodes.length,    color: C.blue    },
              { label: "ARTICLES",val: articles.length,  color: C.neon    },
              { label: "DOCUM.",  val: documented,       color: "#4ADE80" },
              { label: "DARK",    val: dark,             color: "#F59E0B" },
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
                    borderLeft: `3px solid ${n.documented ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: n.documented ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {n.documented ? "●" : "○"}
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
                    color: n.documented ? "#4ADE80" : "#F59E0B",
                    minWidth: 50, textAlign: "right",
                  }}>
                    {n.documented ? `${n.articles.length} ART` : "DARK"}
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
                    {n.documented ? n.articles.map((a) => (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        {a.type && (
                          <span style={{
                            fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                            background: `${C.neon}22`, color: C.neon,
                            border: `1px solid ${C.neon}44`, whiteSpace: "nowrap",
                          }}>
                            {a.type}
                          </span>
                        )}
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{a.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#F59E0B", fontSize: "9px", padding: "2px 0" }}>
                        No knowledge articles found for this graph node.
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
            /v1/graph/centrality · /knowledge/ · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
