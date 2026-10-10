/**
 * F60 — Knowledge × Graph Coverage (KGCV)
 *
 * Parallel-fetches /knowledge/ articles and /v1/graph/centrality nodes every 90 s.
 * Keyword-correlates each high-centrality graph node (id, label, type, description)
 * against the full text of every knowledge article (title, content, tags, topic) to answer:
 * "Which key graph entities have knowledge base coverage vs are undocumented?"
 *
 * DOCUMENTED   — node keywords match at least one knowledge article
 * UNDOCUMENTED — no knowledge article covers this node
 *
 * Stat tiles: nodes / articles / documented / undocumented
 * Amber badge on undocumented count.
 * Filter tabs: ALL / DOCUMENTED / UNDOCUMENTED + text search.
 * Expand node row → matched articles with topic badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ KGCV  at left:1320 bottom:18, zIndex:68.
 * Event:   jarvis:kgcv-toggle
 * Voice:   "knowledge graph / kgcv / graph knowledge / undocumented nodes /
 *           node coverage / knowledge coverage / knowledge gaps / graph coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1320;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.nodes))   return raw.nodes;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseNodes(raw) {
  return normaliseArray(raw).map((n, i) => ({
    id:       String(n.id ?? n.node_id ?? i),
    label:    n.label ?? n.name ?? n.display_name ?? `Node ${i + 1}`,
    type:     n.type ?? n.node_type ?? n.entity_type ?? "",
    desc:     n.description ?? n.summary ?? n.details ?? "",
    score:    typeof n.score === "number" ? n.score :
              typeof n.centrality === "number" ? n.centrality : 0,
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    topic:   a.topic ?? a.category ?? a.section ?? "",
    content: a.content ?? a.body ?? a.summary ?? a.text ?? "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(node, articles) {
  const nodeTokens = new Set([
    ...tokenise(node.id),
    ...tokenise(node.label),
    ...tokenise(node.type),
    ...tokenise(node.desc),
  ]);
  const matches = [];
  for (const art of articles) {
    const artTokens = tokenise(
      `${art.title} ${art.topic} ${art.content} ${art.tags.join(" ")}`
    );
    const hits = artTokens.filter(t => nodeTokens.has(t)).length;
    if (hits > 0) matches.push({ ...art, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [nRes, aRes] = await Promise.all([
    fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
    fetch(`${base}/knowledge/`,          { headers: hdr }),
  ]);
  const nodes    = normaliseNodes(await nRes.json());
  const articles = normaliseArticles(await aRes.json());
  const enriched = nodes.map(n => {
    const matches = correlate(n, articles);
    return { ...n, matches, status: matches.length > 0 ? "DOCUMENTED" : "UNDOCUMENTED" };
  });
  return { nodes: enriched, articles };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isKgcvQuery(q) {
  return /knowledge.?graph|kgcv|graph.?knowledge|undocumented.?node|node.?coverage|knowledge.?coverage|knowledge.?gap|graph.?coverage/i.test(q);
}

export async function buildKgcvScript() {
  try {
    const { nodes, articles } = await fetchAll();
    const documented   = nodes.filter(n => n.status === "DOCUMENTED");
    const undocumented = nodes.filter(n => n.status === "UNDOCUMENTED");
    const topGap       = undocumented[0];

    const prompt =
      `JARVIS knowledge graph coverage report: ${nodes.length} high-centrality graph nodes checked against ${articles.length} knowledge base articles. ` +
      `${documented.length} nodes are DOCUMENTED (KB coverage exists); ${undocumented.length} are UNDOCUMENTED — intelligence gaps.` +
      (topGap ? ` Highest-priority knowledge gap: node "${topGap.label}"${topGap.type ? ` (${topGap.type})` : ""} with centrality score ${topGap.score.toFixed ? topGap.score.toFixed(3) : topGap.score}.` : "") +
      ` Summarise the knowledge coverage status in exactly 2 sentences and recommend priority KB actions.`;

    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body:    JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ??
      `${undocumented.length}/${nodes.length} graph nodes lack knowledge base coverage — intelligence gaps identified.`;
  } catch {
    return "Knowledge graph coverage data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "kgcv-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Node Row ─────────────────────────────────────────────────────────────────

function NodeRow({ node }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...node.matches.map(m => m.score));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border: `1px solid ${node.status === "UNDOCUMENTED" ? AMBER : MUTED}22`,
      background: node.status === "UNDOCUMENTED"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
      >
        {/* status badge */}
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color: node.status === "UNDOCUMENTED" ? AMBER : GREEN,
          border: `1px solid ${node.status === "UNDOCUMENTED" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2,
          whiteSpace: "nowrap", width: 70, textAlign: "center",
        }}>
          {node.status === "UNDOCUMENTED" ? "UNDOC" : "DOCUM"}
        </span>

        {/* label */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {node.label}
          </div>
          {(node.type || node.id !== node.label) && (
            <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
              {[node.type, `id: ${node.id}`].filter(Boolean).join(" · ").slice(0, 48)}
            </div>
          )}
        </div>

        {/* centrality score */}
        <span style={{ fontSize: 7, color: PURP, flexShrink: 0 }}>
          {typeof node.score === "number" ? node.score.toFixed ? node.score.toFixed(3) : node.score : ""}
        </span>

        {/* match count */}
        {node.matches.length > 0 && (
          <span style={{ fontSize: 8, color: GREEN, fontWeight: 700, flexShrink: 0 }}>
            {node.matches.length}art
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* expanded: matched articles */}
      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {node.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: AMBER, padding: "4px 0" }}>
              No knowledge articles found for this node — intelligence gap.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED KNOWLEDGE ARTICLES
              </div>
              {node.matches.slice(0, 6).map(a => {
                const barPct = Math.round((a.score / maxScore) * 100);
                return (
                  <div key={a.id} style={{
                    background: "rgba(41,231,255,0.03)",
                    border: `1px solid ${CY}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      {a.topic && (
                        <span style={{
                          fontSize: 7, fontWeight: 700, color: PURP,
                          border: `1px solid ${PURP}66`,
                          padding: "1px 4px", borderRadius: 2,
                          whiteSpace: "nowrap", flexShrink: 0, maxWidth: 60,
                          overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {a.topic.slice(0, 8).toUpperCase()}
                        </span>
                      )}
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {a.title}
                      </span>
                      <span style={{ fontSize: 7, color: GREEN, fontWeight: 700, flexShrink: 0 }}>
                        {a.score}pt
                      </span>
                    </div>
                    <div style={{ height: 3, background: `${CY}11`, borderRadius: 2 }}>
                      <div style={{ width: `${barPct}%`, height: "100%", background: CY, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
              {node.matches.length > 6 && (
                <div style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
                  +{node.matches.length - 6} more article{node.matches.length - 6 !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "DOCUMENTED", "UNDOCUMENTED"];

export default function KnowledgeGraphCoverage() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:kgcv-toggle", h);
    return () => window.removeEventListener("jarvis:kgcv-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildKgcvScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const nodes    = data?.nodes    ?? [];
  const articles = data?.articles ?? [];
  const undocumented = nodes.filter(n => n.status === "UNDOCUMENTED");

  const visible = nodes
    .filter(n => tab === "ALL" || n.status === tab)
    .filter(n => {
      if (!search) return true;
      const q = search.toLowerCase();
      return n.label.toLowerCase().includes(q)
        || n.type.toLowerCase().includes(q)
        || n.id.toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <>
        <style>{`@keyframes kgcv-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Knowledge × Graph Coverage (KGCV)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
            color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          }}
        >
          ◈ KGCV
          {undocumented.length > 0 && (
            <span style={{
              marginLeft: 5, background: AMBER, color: "#000",
              borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
              animation: "kgcv-pulse 1.4s ease-in-out infinite",
            }}>
              {undocumented.length}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes kgcv-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* toggle button (active) */}
      <button
        onClick={() => setOpen(false)}
        title="Close KGCV"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ KGCV ▲
      </button>

      {/* panel */}
      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 460, maxHeight: "74vh",
        background: BG, border: `1px solid ${CY}44`,
        borderRadius: 6, fontFamily: MONO,
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 30px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
              ◈ KNOWLEDGE GRAPH COVERAGE
            </span>
            {loading && (
              <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
            )}
          </div>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}66`, color: CY,
              fontFamily: MONO, fontSize: 8, padding: "3px 8px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="NODES"    value={nodes.length}           accent={CY} />
          <StatTile label="ARTICLES" value={articles.length}        accent={PURP} />
          <StatTile label="DOCUM"    value={nodes.length - undocumented.length} accent={GREEN} />
          <StatTile label="UNDOC"    value={undocumented.length}    accent={AMBER}
            pulse={undocumented.length > 0} />
        </div>

        {/* error */}
        {error && (
          <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>
        )}

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                border: `1px solid ${tab === t ? CY : MUTED}44`,
                color: tab === t ? "#000" : MUTED,
                fontFamily: MONO, fontSize: 7, fontWeight: 700,
                padding: "2px 6px", borderRadius: 2, cursor: "pointer", letterSpacing: 1,
              }}
            >
              {t === "DOCUMENTED" ? "DOCUM" : t === "UNDOCUMENTED" ? "UNDOC" : t}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search nodes…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`, borderRadius: 2,
              color: CY, fontFamily: MONO, fontSize: 8,
              padding: "2px 6px", outline: "none",
            }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {visible.length === 0 && !loading ? (
            <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
              {nodes.length === 0 ? "No graph nodes loaded." : "No nodes match filter."}
            </div>
          ) : (
            visible.map(n => <NodeRow key={n.id} node={n} />)
          )}
        </div>
      </div>
    </>
  );
}
