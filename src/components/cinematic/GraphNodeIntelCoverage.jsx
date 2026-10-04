/**
 * F175 — Graph Node × Intel Profile Coverage (GNINTEL)
 *
 * Parallel-fetches /v1/graph/centrality + /entities/IntelProfile, then
 * keyword-correlates each top-influence graph node against known threat
 * actor profiles to surface:
 *   ATTRIBUTED  — at least one intel profile has keyword overlap with this node
 *   UNTRACKED   — no threat actor profile covers this high-influence node
 *                 (intelligence blind spot in the network)
 *
 * Stat tiles: nodes / profiles / attributed / untracked
 * Filter tabs: ALL | ATTRIBUTED | UNTRACKED
 * Text search across node names / types.
 * Expand any node → matched intel profiles with actor-type badge + relevance score.
 * Red badge on untracked count.
 * ▶ ASSESS: 2-sentence network-intel attribution brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GNINTEL  at bottom:8 left:59560, zIndex:116.
 * Event:   jarvis:gnintel-toggle
 * Voice:   "graph intel / node threat actor / graph profile / high node intel /
 *           gnintel / node actor / network actor / untracked nodes / graph actor coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 59560;
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

const GNINTEL_RE =
  /\b(graph\s+intel|node\s+threat\s+actor[s]?|graph\s+profile[s]?|high\s+node\s+intel|gnintel|node\s+actor[s]?|network\s+actor[s]?|untracked\s+node[s]?|graph\s+actor\s+coverage|which\s+(nodes?|graph)\s+(have|lack|missing)\s+(actor|intel|profile)[s]?|actor\s+node[s]?)\b/i;

export function isGnintelQuery(q) { return GNINTEL_RE.test(q); }

export async function buildGnintelScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [nodeRes, profileRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`,   { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const nodes    = normaliseNodes(await nodeRes.json());
    const profiles = normaliseProfiles(await profileRes.json());

    const attributed = nodes.filter((n) => profiles.some((p) => relevance(n, p) > 0)).length;
    const untracked  = nodes.length - attributed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph node intel-profile attribution analysis: ${nodes.length} top-influence ` +
          `graph nodes on record, ${profiles.length} known threat actor profiles. ` +
          `${attributed} nodes are attributed to at least one known actor, ` +
          `${untracked} high-influence nodes have no threat actor profile coverage ` +
          `(network intelligence blind spots). Provide a 2-sentence situational-awareness brief — ` +
          `formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Graph node intel attribution analysis complete, sir.").trim();
  } catch {
    return "Graph node intel attribution analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.centrality)       ? raw.centrality
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.items)            ? raw.items
    : [];
  return arr.map((n, i) => ({
    id:         n.id          || n.node_id   || String(i),
    name:       n.name        || n.label     || n.title  || `Node ${i + 1}`,
    type:       n.type        || n.node_type || n.kind   || "",
    centrality: Number(n.centrality || n.score || n.influence || 0),
    tags:       Array.isArray(n.tags) ? n.tags.join(" ") : (n.tags || ""),
    description: (n.description || n.summary || n.details || "").toString().slice(0, 300),
  }));
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.profiles)               ? raw.profiles
    : Array.isArray(raw?.intel_profiles)         ? raw.intel_profiles
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.results)                ? raw.results
    : Array.isArray(raw?.items)                  ? raw.items
    : [];
  return arr.map((p, i) => ({
    id:         p.id          || p.profile_id || String(i),
    name:       p.name        || p.actor_name || p.title  || `Profile ${i + 1}`,
    type:       p.type        || p.actor_type || p.category || "",
    origin:     p.origin      || p.country    || p.nationality || "",
    aliases:    Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
    tags:       Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
    description: (p.description || p.summary || p.bio || p.notes || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(node, profile) {
  const nw = keywords(`${node.name} ${node.type} ${node.description} ${node.tags}`);
  const pw = keywords(`${profile.name} ${profile.aliases} ${profile.description} ${profile.tags} ${profile.origin}`);
  return nw.filter((w) => pw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(nodes, profiles) {
  return nodes.map((node) => {
    const matched = profiles
      .map((p) => ({ ...p, score: relevance(node, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...node, profiles: matched, attributed: matched.length > 0 };
  });
}

function actorTypeColor(t) {
  const lc = String(t || "").toLowerCase();
  if (lc.includes("nation") || lc.includes("state"))  return "#F87171";
  if (lc.includes("criminal") || lc.includes("crime")) return "#FB923C";
  if (lc.includes("terror") || lc.includes("apt"))    return "#FBBF24";
  if (lc.includes("hacktiv") || lc.includes("group")) return "#A78BFA";
  return "#94A3B8";
}

function centralityBar(score, max) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{
        flex: 1, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2,
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, #60A5FA, #A78BFA)`,
          borderRadius: 2,
        }} />
      </div>
      <span style={{ color: S.text, fontSize: "8px", width: 24, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ATTRIBUTED", "UNTRACKED"];

export default function GraphNodeIntelCoverage() {
  const [open,      setOpen]      = useState(false);
  const [nodes,     setNodes]     = useState([]);
  const [profiles,  setProfiles]  = useState([]);
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
      const [nodeRes, profileRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`,   { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      setNodes(normaliseNodes(await nodeRes.json()));
      setProfiles(normaliseProfiles(await profileRes.json()));
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
    window.addEventListener("jarvis:gnintel-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gnintel-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isGnintelQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked      = buildLinked(nodes, profiles);
  const attributed  = linked.filter((n) => n.attributed).length;
  const untracked   = linked.filter((n) => !n.attributed).length;
  const maxCent     = Math.max(0, ...linked.map((n) => n.centrality));

  const visible = linked
    .filter((n) => {
      if (filter === "ATTRIBUTED") return n.attributed;
      if (filter === "UNTRACKED")  return !n.attributed;
      return true;
    })
    .filter((n) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        n.name.toLowerCase().includes(q) ||
        String(n.type).toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildGnintelScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Graph Node × Intel Profile Coverage (◈ GNINTEL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 116,
          background: open ? `${RED}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? RED : S.border}`,
          borderRadius: S.radius, color: open ? RED : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${RED}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ GNINTEL{untracked > 0 && (
          <span style={{
            marginLeft: 4,
            background: RED,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{untracked}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 117,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 380,
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
              GRAPH NODE × INTEL PROFILE
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
              { label: "NODES",      val: nodes.length,   color: "#60A5FA" },
              { label: "PROFILES",   val: profiles.length, color: "#A78BFA" },
              { label: "ATTRIBUTED", val: attributed,      color: "#4ADE80" },
              { label: "UNTRACKED",  val: untracked,       color: RED       },
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
            ) : visible.map((node) => (
              <div key={node.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === node.id ? null : node.id)}
                  style={{
                    display: "flex", flexDirection: "column", gap: 3,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${node.attributed ? "#4ADE80" : RED}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: node.attributed ? "#4ADE80" : RED, fontSize: 10, width: 10 }}>
                      {node.attributed ? "●" : "○"}
                    </span>
                    <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px" }}>
                      {node.name}
                    </span>
                    {node.type && (
                      <span style={{
                        fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                        background: "rgba(96,165,250,0.15)",
                        color: "#60A5FA",
                        border: "1px solid rgba(96,165,250,0.3)",
                        whiteSpace: "nowrap",
                      }}>
                        {String(node.type).toUpperCase().slice(0, 10)}
                      </span>
                    )}
                    <span style={{
                      fontSize: "9px", whiteSpace: "nowrap",
                      color: node.attributed ? "#4ADE80" : RED,
                      minWidth: 68, textAlign: "right",
                    }}>
                      {node.attributed ? `${node.profiles.length} ACTOR${node.profiles.length !== 1 ? "S" : ""}` : "UNTRACKED"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>{expanded === node.id ? "▴" : "▾"}</span>
                  </div>
                  {centralityBar(node.centrality, maxCent)}
                </div>

                {expanded === node.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {node.attributed ? node.profiles.map((p) => (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <span style={{
                          fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                          background: `${actorTypeColor(p.type)}22`,
                          color: actorTypeColor(p.type),
                          border: `1px solid ${actorTypeColor(p.type)}44`,
                          whiteSpace: "nowrap",
                        }}>
                          {String(p.type || "ACTOR").toUpperCase().slice(0, 10)}
                        </span>
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </span>
                        {p.origin && (
                          <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                            {String(p.origin).slice(0, 8)}
                          </span>
                        )}
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{p.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: RED, fontSize: "9px", padding: "2px 0" }}>
                        No threat actor profile covers this high-influence node.
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
            /v1/graph/centrality · /entities/IntelProfile · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
