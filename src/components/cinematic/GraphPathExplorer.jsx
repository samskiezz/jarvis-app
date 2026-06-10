/**
 * GraphPathExplorer — F36 Graph path explorer.
 * Sources from /v1/graph/path (or /v1/graph/subgraph) — pick two entities, find the
 * connection chain. JARVIS narrates the chain via /v1/jarvis/agent/chat + TTS.
 * "JARVIS, path from X to Y" / "how is X connected to Y" opens the panel.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const PRP = "#A855F7";
const GLD = "#FFD700";
const GRN = "#00E5A0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const PATH_RE = /\bpath\b|connect(?:ion|ed)?|how.{0,12}(linked?|related|connected|link)|find.{0,12}(link|path|chain|connect)|chain.{0,12}(between|from)|route.{0,8}(from|between)|traverse|link.{0,8}between|relation.{0,8}between/i;

function extractEntities(q) {
  // "path from X to Y"
  let m = q.match(/(?:path|route|chain|connect(?:ion)?)\s+from\s+(.+?)\s+to\s+(.+)/i);
  if (m) return { source: m[1].trim(), target: m[2].trim() };
  // "how is X connected to Y"
  m = q.match(/how\s+(?:is|are)\s+(.+?)\s+(?:connected|linked|related)\s+to\s+(.+)/i);
  if (m) return { source: m[1].trim(), target: m[2].trim() };
  // "connection between X and Y"
  m = q.match(/(?:connection|link|path|chain|route|relation)\s+between\s+(.+?)\s+and\s+(.+)/i);
  if (m) return { source: m[1].trim(), target: m[2].trim() };
  // "find X and Y" or "link X to Y"
  m = q.match(/(?:find|link|connect)\s+(.+?)\s+(?:and|to)\s+(.+)/i);
  if (m) return { source: m[1].trim(), target: m[2].trim() };
  return null;
}

async function fetchPath(source, target) {
  const url = `${apiBase()}/v1/graph/path?source=${encodeURIComponent(source)}&target=${encodeURIComponent(target)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  // Normalise — backends vary in response shape
  if (Array.isArray(d))          return d;
  if (Array.isArray(d?.path))    return d.path;
  if (Array.isArray(d?.nodes))   return d.nodes;
  if (Array.isArray(d?.chain))   return d.chain;
  if (Array.isArray(d?.edges))   return d.edges;
  if (Array.isArray(d?.results)) return d.results;
  return [];
}

async function narrateChain(source, target, chain) {
  // Build a natural-language prompt and ask the agent to narrate
  const chainDesc = chain.length
    ? chain.map((n, i) => {
        const name = n.name || n.label || n.id || `Node ${i + 1}`;
        const rel  = n.relationship || n.edge_type || n.type || "";
        return rel ? `${name} (${rel})` : name;
      }).join(" → ")
    : `${source} … ${target}`;

  const prompt = chain.length
    ? `In one or two sentences, narrate this graph connection path from "${source}" to "${target}" via the following chain: ${chainDesc}. Speak as JARVIS, British butler tone.`
    : `In one sentence, explain how "${source}" and "${target}" might be connected in an intelligence graph. Speak as JARVIS, British butler tone.`;

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

export function isPathQuery(text) {
  return PATH_RE.test(text || "");
}

export async function buildPathScript(q) {
  const entities = extractEntities(q || "");
  if (!entities) {
    return "Please specify two entities, sir. For example: path from Alpha to Bravo.";
  }
  const { source, target } = entities;
  let chain = [];
  try { chain = await fetchPath(source, target); } catch (_) {}

  // Signal the panel to open and run the query
  window.dispatchEvent(new CustomEvent("jarvis:path-query", {
    detail: { source, target, chain },
  }));

  let narration = "";
  try { narration = await narrateChain(source, target, chain); } catch (_) {}

  if (!narration) {
    if (chain.length) {
      const hops = chain.length;
      return `The connection from ${source} to ${target} spans ${hops} hop${hops !== 1 ? "s" : ""}. Path loaded in the Graph Path Explorer, sir.`;
    }
    return `I have opened the Graph Path Explorer so you can trace the connection from ${source} to ${target}, sir.`;
  }
  return narration;
}

// ── Colour helpers ─────────────────────────────────────────────────────────────
function nodeColor(type = "") {
  if (/person|contact|human|user/i.test(type))  return CY;
  if (/org|company|corp|firm/i.test(type))       return GLD;
  if (/event|incident|case/i.test(type))         return "#FF4D6D";
  if (/asset|investment|fund/i.test(type))       return GRN;
  return PRP;
}

export default function GraphPathExplorer() {
  const [open,    setOpen]    = useState(false);
  const [source,  setSource]  = useState("");
  const [target,  setTarget]  = useState("");
  const [chain,   setChain]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const srcRef = useRef(null);

  // Auto-open + populate when the brain fires the event
  useEffect(() => {
    const onPath = (e) => {
      const { source: s, target: t, chain: c } = e?.detail || {};
      if (s) setSource(s);
      if (t) setTarget(t);
      if (Array.isArray(c)) setChain(c);
      setOpen(true);
      setError("");
    };
    window.addEventListener("jarvis:path-query", onPath);
    return () => window.removeEventListener("jarvis:path-query", onPath);
  }, []);

  // Also open on any matching jarvis:ask event
  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (PATH_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function handleFind() {
    if (!source.trim() || !target.trim()) return;
    setLoading(true); setError(""); setChain([]);
    try {
      const c = await fetchPath(source.trim(), target.trim());
      setChain(c);
      if (!c.length) setError("No path found between these entities.");
    } catch (err) {
      setError(`Error fetching path: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleFind();
  }

  const hopCount = chain.length;

  return (
    <>
      {/* Toggle button — bottom-left strip at left:2468 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Path Explorer"
        style={{
          position: "fixed", left: 2468, bottom: 18, zIndex: 68,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⤢</span>
        PATH
        {hopCount > 0 && (
          <span style={{
            background: CY + "44", color: CY,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {hopCount}
          </span>
        )}
      </button>

      {/* Path explorer panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(560px,96vw)", maxHeight: "min(680px,82vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: CY,
              boxShadow: `0 0 10px ${CY}`,
              display: "inline-block",
              animation: loading ? "gppulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH PATH EXPLORER
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "TRACING PATH…" : hopCount > 0 ? `${hopCount} HOP${hopCount !== 1 ? "S" : ""}` : "AWAITING QUERY"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Entity inputs */}
          <div style={{
            padding: "12px 14px", borderBottom: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2, minWidth: 48 }}>SOURCE</span>
              <input
                ref={srcRef}
                value={source}
                onChange={e => setSource(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Entity A…"
                style={{
                  flex: 1, background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${CY}33`, borderRadius: 6,
                  color: "#DCEBF5", padding: "5px 10px",
                  fontSize: 10, letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace", outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2, minWidth: 48 }}>TARGET</span>
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Entity B…"
                style={{
                  flex: 1, background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${CY}33`, borderRadius: 6,
                  color: "#DCEBF5", padding: "5px 10px",
                  fontSize: 10, letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace", outline: "none",
                }}
              />
            </div>
            <button
              onClick={handleFind}
              disabled={loading || !source.trim() || !target.trim()}
              style={{
                alignSelf: "flex-end",
                background: loading ? "rgba(5,8,13,0.4)" : `${CY}22`,
                border: `1px solid ${CY}${loading ? "22" : "88"}`,
                borderRadius: 8, color: loading ? "#4A6070" : CY,
                padding: "6px 18px", fontSize: 10, letterSpacing: 2,
                fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {loading ? "TRACING…" : "⤢ FIND PATH"}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              margin: "10px 14px 0",
              padding: "8px 12px",
              background: "#FF4D6D18",
              border: "1px solid #FF4D6D44",
              borderRadius: 8, color: "#FF4D6D",
              fontSize: 10, letterSpacing: 1,
            }}>
              {error}
            </div>
          )}

          {/* Path chain */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 0" }}>
            {chain.length === 0 && !loading && !error && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                Enter two entities and press FIND PATH
              </div>
            )}

            {chain.length > 0 && (
              <div style={{ padding: "0 14px" }}>
                {/* Summary row */}
                <div style={{
                  background: `${CY}11`,
                  border: `1px solid ${CY}33`,
                  borderRadius: 8, padding: "8px 12px",
                  marginBottom: 12,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>⤢</span>
                  <div>
                    <div style={{ color: "#DCF0FF", fontSize: 11, fontWeight: 700 }}>
                      {source} → {target}
                    </div>
                    <div style={{ color: CY, fontSize: 9, letterSpacing: 2, marginTop: 2 }}>
                      {hopCount} HOP{hopCount !== 1 ? "S" : ""} · CONNECTION TRACED
                    </div>
                  </div>
                </div>

                {/* Chain nodes */}
                {chain.map((node, i) => {
                  const name = node.name || node.label || node.entity || node.id || `Node ${i + 1}`;
                  const type = (node.type || node.entity_type || node.kind || "entity").toUpperCase();
                  const rel  = node.relationship || node.edge_type || node.relation || node.rel || "";
                  const color = nodeColor(node.type || "");

                  return (
                    <div key={node.id || i}>
                      {/* Node card */}
                      <div style={{
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.02)",
                        border: `1px solid ${color}33`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: 8,
                        display: "flex", alignItems: "center", gap: 10,
                      }}>
                        {/* Hop index */}
                        <span style={{
                          fontSize: 9, color: color, minWidth: 20, textAlign: "center",
                          fontWeight: 900,
                        }}>
                          {i + 1}
                        </span>
                        {/* Avatar */}
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%",
                          background: `${color}22`,
                          border: `1px solid ${color}88`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, color, fontWeight: 900, flexShrink: 0,
                        }}>
                          {name[0]?.toUpperCase() || "?"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            color: "#DCF0FF", fontSize: 12, fontWeight: 700,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {name}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                            <span style={{
                              fontSize: 9, color, background: color + "22",
                              borderRadius: 4, padding: "1px 6px", letterSpacing: 1,
                            }}>
                              {type}
                            </span>
                            {node.description && (
                              <span style={{
                                fontSize: 9, color: "#566878",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                maxWidth: "200px",
                              }}>
                                {node.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Relationship arrow between nodes */}
                      {i < chain.length - 1 && (
                        <div style={{
                          display: "flex", alignItems: "center",
                          padding: "2px 16px", gap: 8,
                        }}>
                          <div style={{
                            flex: 1, height: 1,
                            background: `${CY}33`,
                          }} />
                          {rel && (
                            <span style={{
                              fontSize: 8, color: CY + "99",
                              background: `${CY}11`,
                              borderRadius: 4, padding: "2px 6px",
                              letterSpacing: 1, whiteSpace: "nowrap",
                            }}>
                              {rel.toUpperCase()}
                            </span>
                          )}
                          <span style={{ color: CY + "99", fontSize: 10 }}>↓</span>
                          <div style={{
                            flex: 1, height: 1,
                            background: `${CY}33`,
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>GRAPH PATH · /v1/graph/path</span>
            {hopCount > 0 && (
              <span style={{ marginLeft: "auto", color: CY + "88" }}>
                {hopCount} INTERMEDIATE HOP{hopCount !== 1 ? "S" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes gppulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
