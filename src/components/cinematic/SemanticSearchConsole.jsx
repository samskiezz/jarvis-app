/**
 * SemanticSearchConsole — F290
 * Interactive semantic search, NL-to-filter, RAG context, and reindex console.
 *
 * Endpoints:
 *   GET  /v1/semantic/search?q=&k=&kind= — cosine top-k semantic search
 *   POST /v1/semantic/nl                 — NL → structured ontology filter
 *   POST /v1/semantic/rag                — retrieval + cited grounding context
 *   POST /v1/semantic/reindex            — re-embed all ontology objects
 *   POST /v1/jarvis/agent/chat           — AI search brief + TTS
 *
 * Toggle: ◈ SRCH  left:342720  bottom:8  zIndex:168
 * Event:  jarvis:srch-toggle
 * Voice:  "semantic search" | "vector search" | "rag" | "knowledge search" |
 *         "natural language query" | "srch" | "knowledge retrieval" |
 *         "search ontology" | "search knowledge" | "nl query" | "reindex"
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GN  = "#00E5A0";
const AM  = "#F59E0B";
const PU  = "#A78BFA";
const DIM = "#4A6070";
const POLL_MS = 0; // no background poll — query-driven
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SRCH_RE =
  /\bsemantic\s+search|\bvector\s+search|\brag\b|\bknowledge\s+search|\bnatural\s+language\s+quer|\bsrch\b|\bknowledge\s+retriev|\bsearch\s+ontology|\bsearch\s+knowledge|\bnl\s+quer|\breindex\b/i;

export function isSrchQuery(text) {
  return SRCH_RE.test(text || "");
}

export async function buildSrchScript() {
  try {
    const r = await fetch(
      `${apiBase()}/v1/semantic/search?q=jarvis&k=5`,
      { headers: { Authorization: `Bearer ${API_KEY}` } },
    );
    if (!r.ok) throw new Error("no data");
    const d = await r.json();
    const count = d.count ?? 0;
    return (
      `Semantic search console online — ${count} vector result${count !== 1 ? "s" : ""} ` +
      `available. Opening console for knowledge retrieval, sir.`
    );
  } catch {
    return "Semantic search console is online. Vector index available for query, sir.";
  }
}

function fmtScore(v) {
  if (typeof v !== "number") return "—";
  return (v * 100).toFixed(1) + "%";
}

function Chip({ label, color = CY }) {
  return (
    <span style={{
      background: `${color}22`,
      border: `1px solid ${color}44`,
      borderRadius: 4, color, fontSize: 8,
      padding: "1px 5px", letterSpacing: 0.8,
    }}>
      {label}
    </span>
  );
}

function StatTile({ label, value, color = CY }) {
  return (
    <div style={{
      flex: 1, background: "rgba(41,231,255,0.04)",
      border: `1px solid ${color}22`, borderRadius: 6,
      padding: "8px 10px", textAlign: "center",
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value ?? "—"}</div>
      <div style={{ color: DIM, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const TAB_STYLE = (active, color = CY) => ({
  background: active ? `${color}22` : "transparent",
  border: `1px solid ${active ? color : DIM}44`,
  borderRadius: 4, color: active ? color : DIM,
  fontSize: 9, padding: "3px 9px", cursor: "pointer", letterSpacing: 0.5,
});

export default function SemanticSearchConsole() {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState("SEARCH");  // SEARCH | NL | RAG | REINDEX
  const [loading, setLoading]   = useState(false);

  // SEARCH state
  const [searchQ, setSearchQ]   = useState("");
  const [searchK, setSearchK]   = useState(10);
  const [searchKind, setSearchKind] = useState("");
  const [searchRes, setSearchRes] = useState(null);

  // NL state
  const [nlQ, setNlQ]           = useState("");
  const [nlRes, setNlRes]       = useState(null);

  // RAG state
  const [ragQ, setRagQ]         = useState("");
  const [ragK, setRagK]         = useState(6);
  const [ragRes, setRagRes]     = useState(null);

  // REINDEX state
  const [reindexRes, setReindexRes] = useState(null);

  // Stats derived from last search
  const [lastCount, setLastCount] = useState(null);

  const hdrRef = useRef(null);

  function hdrs() {
    return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  }

  const runSearch = useCallback(async () => {
    if (!searchQ.trim()) return;
    setLoading(true); setSearchRes(null);
    try {
      const params = new URLSearchParams({ q: searchQ, k: searchK });
      if (searchKind) params.set("kind", searchKind);
      const r = await fetch(`${apiBase()}/v1/semantic/search?${params}`, { headers: hdrs() });
      const d = await r.json();
      setSearchRes(d);
      setLastCount(d.count ?? 0);
    } catch {
      setSearchRes({ error: "Semantic search unreachable." });
    } finally {
      setLoading(false);
    }
  }, [searchQ, searchK, searchKind]);

  const runNl = useCallback(async () => {
    if (!nlQ.trim()) return;
    setLoading(true); setNlRes(null);
    try {
      const r = await fetch(`${apiBase()}/v1/semantic/nl`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({ query: nlQ }),
      });
      const d = await r.json();
      setNlRes(d);
    } catch {
      setNlRes({ error: "NL query engine unreachable." });
    } finally {
      setLoading(false);
    }
  }, [nlQ]);

  const runRag = useCallback(async () => {
    if (!ragQ.trim()) return;
    setLoading(true); setRagRes(null);
    try {
      const r = await fetch(`${apiBase()}/v1/semantic/rag`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({ query: ragQ, k: ragK }),
      });
      const d = await r.json();
      setRagRes(d);
    } catch {
      setRagRes({ error: "RAG engine unreachable." });
    } finally {
      setLoading(false);
    }
  }, [ragQ, ragK]);

  const runReindex = useCallback(async () => {
    setLoading(true); setReindexRes(null);
    try {
      const r = await fetch(`${apiBase()}/v1/semantic/reindex`, {
        method: "POST", headers: hdrs(),
      });
      const d = await r.json();
      setReindexRes(d);
    } catch {
      setReindexRes({ error: "Reindex failed — check backend." });
    } finally {
      setLoading(false);
    }
  }, []);

  const runAssess = useCallback(async () => {
    try {
      const ctx = searchRes
        ? `Semantic search for "${searchQ}": ${searchRes.count} results.`
        : "No search run yet.";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({ message: `${ctx} Assess the semantic knowledge retrieval quality and top findings in two sentences.` }),
      });
      const d = await r.json();
      const text = (d.answer || "Semantic search console active, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      const voice = getActiveVoice();
      if (voice && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch { /* silent */ }
  }, [searchRes, searchQ]);

  // Toggle listener
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:srch-toggle", onToggle);
    return () => window.removeEventListener("jarvis:srch-toggle", onToggle);
  }, []);

  const panelStyle = {
    position: "fixed",
    left: 342720 - (typeof window !== "undefined" ? Math.max(0, 342720 - (window.innerWidth - 440)) : 0),
    bottom: 48, zIndex: 168,
    width: 430, maxHeight: "72vh",
    background: "rgba(6,10,16,0.96)",
    border: `1px solid ${CY}44`,
    borderRadius: 10, padding: "12px 14px",
    backdropFilter: "blur(12px)",
    boxShadow: `0 0 40px ${CY}18`,
    fontFamily: "'JetBrains Mono',monospace",
    display: "flex", flexDirection: "column", gap: 8,
    overflowY: "auto",
  };

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(41,231,255,0.05)",
    border: `1px solid ${CY}33`, borderRadius: 5,
    color: "#DCEBF5", fontSize: 10, padding: "5px 8px",
    fontFamily: "inherit", outline: "none",
  };

  const btnStyle = (color = CY) => ({
    background: `${color}18`, border: `1px solid ${color}55`,
    borderRadius: 5, color, fontSize: 9,
    padding: "4px 10px", cursor: "pointer", letterSpacing: 0.5,
  });

  // Badge: green = last count, dim = idle
  const badgeColor = lastCount > 0 ? GN : DIM;
  const badgeLabel = lastCount != null ? String(lastCount) : "◈";

  return (
    <>
      {/* Floating strip button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          left: 342720 % (typeof window !== "undefined" ? window.innerWidth : 1920),
          bottom: 8, zIndex: 168,
          background: open ? `${CY}22` : "rgba(6,10,16,0.82)",
          border: `1px solid ${badgeColor}66`,
          borderRadius: 5, color: badgeColor,
          fontSize: 8, padding: "2px 6px",
          cursor: "pointer", letterSpacing: 1,
          fontFamily: "'JetBrains Mono',monospace",
        }}
        title="Semantic Search Console (F290)"
      >
        ◈ SRCH
        {lastCount != null && (
          <span style={{
            marginLeft: 4, background: badgeColor,
            color: "#04060A", borderRadius: 3,
            fontSize: 7, padding: "0 3px",
          }}>
            {lastCount}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle} ref={hdrRef}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>◈ SEMANTIC SEARCH</span>
              <Chip label="F290" color={DIM} />
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <button onClick={runAssess} style={btnStyle(AM)} title="AI assess">▶ ASSESS</button>
              <button onClick={() => setOpen(false)} style={{ ...btnStyle(DIM), padding: "4px 7px" }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6 }}>
            <StatTile label="VECTOR HITS" value={searchRes?.count ?? "—"} color={GN} />
            <StatTile label="RAG CHUNKS" value={ragRes?.chunks?.length ?? ragRes?.context?.split?.("\n\n")?.length ?? "—"} color={CY} />
            <StatTile label="INDEXED" value={reindexRes?.total ?? reindexRes?.indexed ?? "—"} color={PU} />
            <StatTile label="TAB" value={tab} color={AM} />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["SEARCH", "NL", "RAG", "REINDEX"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(tab === t)}>
                {t}
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ color: CY, fontSize: 9, textAlign: "center", padding: 8, opacity: 0.7 }}>
              querying…
            </div>
          )}

          {/* SEARCH tab */}
          {tab === "SEARCH" && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>COSINE TOP-K VECTOR SEARCH</div>
              <div style={{ display: "flex", gap: 5 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search query…"
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                />
                <button onClick={runSearch} style={btnStyle(GN)}>▶ SEARCH</button>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ color: DIM, fontSize: 8 }}>K:</span>
                <input
                  type="range" min={1} max={30} value={searchK}
                  onChange={(e) => setSearchK(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ color: CY, fontSize: 8, minWidth: 16 }}>{searchK}</span>
                <input
                  style={{ ...inputStyle, width: 90 }}
                  value={searchKind}
                  onChange={(e) => setSearchKind(e.target.value)}
                  placeholder="kind filter…"
                />
              </div>

              {searchRes?.error && (
                <div style={{ color: "#F87171", fontSize: 9 }}>{searchRes.error}</div>
              )}

              {searchRes?.results?.length === 0 && (
                <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 10 }}>
                  No results for "{searchQ}". Try a broader query or reindex.
                </div>
              )}

              {(searchRes?.results || []).map((hit, i) => (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${CY}22`, borderRadius: 6,
                    padding: "7px 10px", background: "rgba(41,231,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {hit.kind && <Chip label={hit.kind.toUpperCase()} color={PU} />}
                      <span style={{ color: DIM, fontSize: 8 }}>#{i + 1}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: GN, fontSize: 9 }}>{fmtScore(hit.score)}</span>
                      {/* score bar */}
                      <div style={{ width: 48, height: 4, background: DIM + "44", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          width: `${(hit.score || 0) * 100}%`,
                          height: "100%", background: GN, borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ color: CY, fontSize: 9, opacity: 0.7, marginBottom: 2 }}>
                    {hit.id || hit.object_id || "—"}
                  </div>
                  <div style={{ color: "#DCEBF5", fontSize: 10, lineHeight: 1.4 }}>
                    {(hit.label || hit.name || hit.text || hit.content || "").slice(0, 120)}
                    {(hit.label || hit.name || hit.text || hit.content || "").length > 120 ? "…" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* NL tab */}
          {tab === "NL" && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>NATURAL LANGUAGE → STRUCTURED FILTER</div>
              <div style={{ display: "flex", gap: 5 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={nlQ}
                  onChange={(e) => setNlQ(e.target.value)}
                  placeholder="e.g. 'show me tasks created after June 2025'…"
                  onKeyDown={(e) => e.key === "Enter" && runNl()}
                />
                <button onClick={runNl} style={btnStyle(AM)}>▶ QUERY</button>
              </div>

              {nlRes?.error && (
                <div style={{ color: "#F87171", fontSize: 9 }}>{nlRes.error}</div>
              )}

              {nlRes && !nlRes.error && (
                <div style={{
                  border: `1px solid ${AM}33`, borderRadius: 6,
                  padding: "8px 10px", background: `${AM}08`,
                }}>
                  <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>STRUCTURED FILTER OUTPUT</div>
                  <pre style={{
                    color: "#DCEBF5", fontSize: 9, whiteSpace: "pre-wrap",
                    wordBreak: "break-word", margin: 0, lineHeight: 1.5,
                  }}>
                    {JSON.stringify(nlRes, null, 2)}
                  </pre>
                </div>
              )}

              {!nlRes && !loading && (
                <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 10 }}>
                  Enter a natural language query to translate it into a structured ontology filter.
                </div>
              )}
            </div>
          )}

          {/* RAG tab */}
          {tab === "RAG" && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>RETRIEVAL-AUGMENTED GROUNDING CONTEXT</div>
              <div style={{ display: "flex", gap: 5 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={ragQ}
                  onChange={(e) => setRagQ(e.target.value)}
                  placeholder="What do you want to ground?…"
                  onKeyDown={(e) => e.key === "Enter" && runRag()}
                />
                <button onClick={runRag} style={btnStyle(PU)}>▶ RETRIEVE</button>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ color: DIM, fontSize: 8 }}>TOP-K CHUNKS:</span>
                <input
                  type="range" min={1} max={20} value={ragK}
                  onChange={(e) => setRagK(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ color: PU, fontSize: 8, minWidth: 16 }}>{ragK}</span>
              </div>

              {ragRes?.error && (
                <div style={{ color: "#F87171", fontSize: 9 }}>{ragRes.error}</div>
              )}

              {ragRes && !ragRes.error && (
                <>
                  {/* Sources/chunks */}
                  {(ragRes.sources || ragRes.chunks || []).map((src, i) => (
                    <div
                      key={i}
                      style={{
                        border: `1px solid ${PU}22`, borderRadius: 6,
                        padding: "7px 10px", background: `${PU}05`,
                      }}
                    >
                      <div style={{ display: "flex", gap: 5, marginBottom: 3 }}>
                        <Chip label={`[${i + 1}]`} color={PU} />
                        {(src.kind || src.type) && <Chip label={(src.kind || src.type).toUpperCase()} color={DIM} />}
                        {src.score != null && (
                          <span style={{ color: GN, fontSize: 8 }}>{fmtScore(src.score)}</span>
                        )}
                      </div>
                      <div style={{ color: CY, fontSize: 8, opacity: 0.7, marginBottom: 2 }}>
                        {src.id || src.object_id || "—"}
                      </div>
                      <div style={{ color: "#DCEBF5", fontSize: 10, lineHeight: 1.4 }}>
                        {(src.text || src.content || src.label || src.name || "").slice(0, 150)}
                        {(src.text || src.content || src.label || src.name || "").length > 150 ? "…" : ""}
                      </div>
                    </div>
                  ))}

                  {/* Assembled context block */}
                  {ragRes.context && (
                    <div style={{
                      border: `1px solid ${CY}22`, borderRadius: 6,
                      padding: "8px 10px", background: "rgba(41,231,255,0.03)",
                    }}>
                      <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                        ASSEMBLED GROUNDING CONTEXT
                      </div>
                      <pre style={{
                        color: "#DCEBF5", fontSize: 9, whiteSpace: "pre-wrap",
                        wordBreak: "break-word", margin: 0, lineHeight: 1.4,
                        maxHeight: 180, overflowY: "auto",
                      }}>
                        {ragRes.context}
                      </pre>
                    </div>
                  )}

                  {!ragRes.context && !(ragRes.sources || ragRes.chunks || []).length && (
                    <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 10 }}>
                      No grounding context returned. Try reindexing or a different query.
                    </div>
                  )}
                </>
              )}

              {!ragRes && !loading && (
                <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 10 }}>
                  Enter a query to build cited grounding context from the knowledge base.
                </div>
              )}
            </div>
          )}

          {/* REINDEX tab */}
          {tab === "REINDEX" && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>RE-EMBED ALL ONTOLOGY OBJECTS</div>
              <div style={{ color: "#7A9BAB", fontSize: 10, lineHeight: 1.5 }}>
                Reindexing walks every ontology object and rebuilds the vector store used for semantic
                search and RAG retrieval. Use this after adding or updating objects.
              </div>
              <button
                onClick={runReindex}
                style={{
                  ...btnStyle(PU),
                  padding: "6px 14px", fontSize: 10, alignSelf: "flex-start",
                }}
              >
                ↺ REINDEX KNOWLEDGE BASE
              </button>

              {reindexRes?.error && (
                <div style={{ color: "#F87171", fontSize: 9 }}>{reindexRes.error}</div>
              )}

              {reindexRes && !reindexRes.error && (
                <div style={{
                  border: `1px solid ${GN}33`, borderRadius: 6,
                  padding: "8px 10px", background: `${GN}08`,
                }}>
                  <div style={{ color: GN, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>REINDEX COMPLETE</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div>
                      <div style={{ color: GN, fontSize: 16, fontWeight: 700 }}>
                        {reindexRes.indexed ?? "—"}
                      </div>
                      <div style={{ color: DIM, fontSize: 8 }}>OBJECTS INDEXED</div>
                    </div>
                    {reindexRes.total != null && (
                      <div>
                        <div style={{ color: CY, fontSize: 16, fontWeight: 700 }}>{reindexRes.total}</div>
                        <div style={{ color: DIM, fontSize: 8 }}>TOTAL IN STORE</div>
                      </div>
                    )}
                    {reindexRes.ok != null && (
                      <Chip label={reindexRes.ok ? "SUCCESS" : "FAILED"} color={reindexRes.ok ? GN : "#F87171"} />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
