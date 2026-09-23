/**
 * KnowledgeGraphCommunityBridge — F107 (KGNCBRG).
 *
 * Parallel-fetches /knowledge/ × /v1/graph/centrality × /v1/graph/communities
 * and keyword-correlates each KB article against top-centrality graph nodes
 * AND community clusters, classifying each article as:
 *
 *   FULLY_MAPPED  — matched at least one graph node AND one community
 *   NODE_ONLY     — matched a centrality node but no community
 *   CLUSTER_ONLY  — matched a community but no centrality node
 *   DARK          — no graph alignment (isolated intelligence — dead weight)
 *
 * Red pulse on DARK count (knowledge articles with zero graph coverage).
 *
 * Layout:
 *   • 5 stat tiles: KB ARTICLES / GRAPH NODES / COMMUNITIES / FULLY MAPPED / DARK
 *   • Coverage % bar
 *   • Filter tabs: ALL / FULLY_MAPPED / NODE_ONLY / CLUSTER_ONLY / DARK
 *   • Text search on article title / subject / category
 *   • Expandable rows → matched centrality nodes (cyan) + communities (amber)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ KGNCBRG at left:984560, bottom:8, zIndex:131
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isKgncbrgQuery / buildKgncbrgScript
 *
 * Voice: "kgncbrg" / "knowledge graph" / "graph knowledge" /
 *        "mapped knowledge" / "dark knowledge" / "knowledge node" /
 *        "knowledge community" / "knowledge graph bridge"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GREEN = "#00c878";

const BTN_LEFT   = 984560;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function articleKeywords(art) {
  return keywords(
    [art.title, art.name, art.subject, art.category, art.content, art.topic, art.description].join(" ")
  );
}

function matchPool(art, pool) {
  const aks = articleKeywords(art);
  if (!aks.length) return [];
  return pool.filter(item => {
    const pks = keywords(
      [item.entity_id, item.entity_type, item.label, item.name, item.title,
       item.description, item.community_id, item.members?.join?.(" ") ?? ""].join(" ")
    );
    return aks.some(k => pks.includes(k));
  });
}

function classify(nodeHits, clusterHits) {
  if (nodeHits > 0 && clusterHits > 0) return "FULLY_MAPPED";
  if (nodeHits > 0)                    return "NODE_ONLY";
  if (clusterHits > 0)                 return "CLUSTER_ONLY";
  return "DARK";
}

const CLASS_ORDER = ["FULLY_MAPPED", "NODE_ONLY", "CLUSTER_ONLY", "DARK"];
const CLASS_LABEL = {
  FULLY_MAPPED:  "FULLY MAPPED",
  NODE_ONLY:     "NODE ONLY",
  CLUSTER_ONLY:  "CLUSTER ONLY",
  DARK:          "DARK",
};
const CLASS_COLOR = {
  FULLY_MAPPED:  GREEN,
  NODE_ONLY:     CY,
  CLUSTER_ONLY:  AMBER,
  DARK:          RED,
};

const PULSE = { animation: "pulse-kgncbrg 1.4s ease-in-out infinite" };

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [rawKb, rawNodes, rawComm] = await Promise.all([
    fetch(`${base}/knowledge/`,             { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/centrality`,    { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`,   { headers: hdr }).then(r => r.json()),
  ]);
  const articles    = normalise(rawKb);
  const nodes       = normalise(rawNodes);
  const communities = normalise(rawComm);

  const rows = articles.map(art => {
    const nodeMatches    = matchPool(art, nodes);
    const clusterMatches = matchPool(art, communities);
    return {
      art,
      nodeMatches,
      clusterMatches,
      cls: classify(nodeMatches.length, clusterMatches.length),
    };
  });
  rows.sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));
  return {
    rows,
    totals: { articles: articles.length, nodes: nodes.length, communities: communities.length },
  };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

const KGNCBRG_RE =
  /\b(kgncbrg|knowledge.graph|graph.knowledge|mapped.knowledge|dark.knowledge|knowledge.node|knowledge.community|knowledge.graph.bridge)\b/i;

export function isKgncbrgQuery(q) {
  return KGNCBRG_RE.test(q || "");
}

export async function buildKgncbrgScript() {
  try {
    const { rows, totals } = await fetchData();
    const dark    = rows.filter(r => r.cls === "DARK").length;
    const mapped  = rows.filter(r => r.cls === "FULLY_MAPPED").length;
    const pct = totals.articles > 0 ? Math.round((mapped / totals.articles) * 100) : 0;
    window.dispatchEvent(new CustomEvent("jarvis:kgncbrg-toggle"));
    return (
      `Knowledge graph community bridge analysis is open, sir. ` +
      `Of ${totals.articles} KB articles, ${mapped} are fully mapped to the graph (${pct}%), ` +
      `correlated across ${totals.nodes} centrality nodes and ${totals.communities} communities. ` +
      `${dark} articles have no graph alignment and represent isolated intelligence dead weight.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:kgncbrg-toggle"));
    return "Knowledge graph community bridge data is unavailable at present, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KnowledgeGraphCommunityBridge() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [totals,    setTotals]    = useState({ articles: 0, nodes: 0, communities: 0 });
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchData();
      setRows(data.rows);
      setTotals(data.totals);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:kgncbrg-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kgncbrg-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const dark   = rows.filter(r => r.cls === "DARK").length;
  const mapped = rows.filter(r => r.cls === "FULLY_MAPPED").length;
  const pct = totals.articles > 0 ? Math.round((mapped / totals.articles) * 100) : 0;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q   = search.toLowerCase();
      const str = [r.art.title, r.art.name, r.art.subject, r.art.category, r.art.topic].join(" ").toLowerCase();
      return str.includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const snap = rows.slice(0, 8).map(r =>
        `${r.art.title || r.art.name || "article"}: ${CLASS_LABEL[r.cls]} (${r.nodeMatches.length} nodes, ${r.clusterMatches.length} clusters)`
      ).join("; ");
      const prompt =
        `Knowledge graph community bridge summary (${totals.articles} articles, ${mapped} fully mapped, ${dark} dark): ` +
        snap + `. Provide a 2-sentence assessment of knowledge graph alignment and isolated intelligence gaps.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(false);
  }

  const MONO = "'JetBrains Mono','Courier New',monospace";
  const TILE = {
    background: "rgba(0,0,0,0.55)", border: "1px solid rgba(41,231,255,0.2)",
    borderRadius: 6, padding: "8px 10px", minWidth: 80,
  };

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 131,
          background: open ? CY : "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}`,
          color: open ? "#04060A" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "4px 8px", cursor: "pointer", borderRadius: 4,
          boxShadow: `0 0 12px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ KGNCBRG
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: "min(820px,94vw)", zIndex: 3000,
          background: "rgba(4,6,10,0.97)", border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "16px 18px",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 80px ${CY}22`,
          fontFamily: MONO, color: "#DCEBF5",
          maxHeight: "80vh", overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
              ◈ KNOWLEDGE × GRAPH NODES × COMMUNITY BRIDGE
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "KB ARTICLES",   value: totals.articles,    color: CY   },
              { label: "GRAPH NODES",   value: totals.nodes,       color: CY   },
              { label: "COMMUNITIES",   value: totals.communities, color: AMBER },
              { label: "FULLY MAPPED",  value: mapped,             color: GREEN },
              { label: "DARK",          value: dark,               color: RED, pulse: dark > 0 },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 7, color: "#6E8AA0", letterSpacing: 2, marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 20, color: t.color, fontWeight: 700, ...(t.pulse ? PULSE : {}) }}>
                  {loading ? "…" : t.value}
                </div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          {totals.articles > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 8, color: "#6E8AA0" }}>
                <span>GRAPH COVERAGE</span>
                <span style={{ color: pct >= 60 ? GREEN : pct >= 30 ? AMBER : RED }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: pct >= 60 ? GREEN : pct >= 30 ? AMBER : RED, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* controls */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)}
                style={{
                  background: filter === cls ? (CLASS_COLOR[cls] || CY) : "rgba(0,0,0,0.4)",
                  border: `1px solid ${CLASS_COLOR[cls] || CY}`,
                  color: filter === cls ? "#04060A" : (CLASS_COLOR[cls] || CY),
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                  padding: "3px 8px", cursor: "pointer", borderRadius: 3,
                }}>
                {cls === "ALL" ? "ALL" : CLASS_LABEL[cls]}
              </button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search articles…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}44`,
                color: "#DCEBF5", fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 140,
              }} />
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "rgba(0,0,0,0.4)" : `${CY}22`,
                border: `1px solid ${CY}`, color: CY,
                fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                padding: "3px 10px", cursor: assessing ? "default" : "pointer", borderRadius: 3,
              }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((r, i) => {
              const art      = r.art;
              const isExp    = expanded === i;
              const clsColor = CLASS_COLOR[r.cls];
              return (
                <div key={art.id || art.title || i}
                  style={{ border: `1px solid ${clsColor}33`, borderRadius: 6, overflow: "hidden" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                      cursor: "pointer", background: isExp ? `${clsColor}11` : "transparent",
                    }}>
                    <span style={{ fontSize: 7, color: clsColor, border: `1px solid ${clsColor}`, padding: "1px 5px", borderRadius: 3, letterSpacing: 1, whiteSpace: "nowrap" }}>
                      {CLASS_LABEL[r.cls]}
                    </span>
                    <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {art.title || art.name || art.topic || art.id || "KB article"}
                    </span>
                    {art.category && (
                      <span style={{ fontSize: 7, color: "#6E8AA0" }}>{art.category}</span>
                    )}
                    <span style={{ fontSize: 8, color: CY }}>{r.nodeMatches.length} nodes</span>
                    <span style={{ fontSize: 8, color: AMBER }}>{r.clusterMatches.length} clusters</span>
                    <span style={{ fontSize: 9, color: "#6E8AA0" }}>{isExp ? "▴" : "▾"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "8px 12px", borderTop: `1px solid ${clsColor}22`, background: "rgba(0,0,0,0.3)" }}>
                      {r.nodeMatches.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 7, color: CY, letterSpacing: 2, marginBottom: 4 }}>MATCHED CENTRALITY NODES</div>
                          {r.nodeMatches.slice(0, 5).map((n, ni) => (
                            <div key={ni} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {n.entity_id || n.label || n.name || "node"}
                                {n.entity_type && <span style={{ color: "#6E8AA0", marginLeft: 4 }}>({n.entity_type})</span>}
                              </div>
                              <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, Math.round((n.score || n.centrality || 0.5) * 100))}%`, height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.clusterMatches.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER, letterSpacing: 2, marginBottom: 4 }}>MATCHED COMMUNITIES</div>
                          {r.clusterMatches.slice(0, 5).map((c, ci) => (
                            <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.community_id || c.label || c.name || "community"}
                                {c.member_count && <span style={{ color: "#6E8AA0", marginLeft: 4 }}>{c.member_count} members</span>}
                              </div>
                              <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ width: "65%", height: "100%", background: AMBER, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.nodeMatches.length === 0 && r.clusterMatches.length === 0 && (
                        <div style={{ fontSize: 9, color: "#6E8AA0" }}>No matching graph nodes or community clusters found for this KB article.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 10, padding: 20 }}>
                {rows.length === 0 ? "Loading knowledge and graph data…" : "No articles match the current filter."}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-kgncbrg {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.55; transform:scale(1.12); }
        }
      `}</style>
    </>
  );
}
