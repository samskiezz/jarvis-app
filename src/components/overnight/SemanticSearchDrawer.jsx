/**
 * SemanticSearchDrawer — F114
 * Right-edge slide-in drawer: debounced semantic/vector search over the
 * JARVIS ontology via GET /v1/semantic/search?q=&k=12.
 *
 * Tab sits at 33 % from top on the right edge.
 * Mounted in src/Layout.jsx after MotorPredictorDrawer.
 *
 * Endpoint:
 *   GET /v1/semantic/search?q=QUERY&k=12
 *   → { query, k, count, results: [{id, kind, score, text, meta}] }
 */
import { useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const ACCENT  = "#C084FC"; // lavender-purple
const GREY    = "#4e6070";
const DELAY   = 400;       // debounce ms
const K       = 12;

const KIND_COLORS = {
  object:      "#22D3EE",
  note:        "#34D399",
  report:      "#A78BFA",
  knowledge:   "#60A5FA",
  task:        "#FCD34D",
  risk:        "#F87171",
  document:    "#818CF8",
  investment:  "#FB923C",
  contact:     "#67E8F9",
  swarm:       "#4ADE80",
};

function kindColor(k) {
  return KIND_COLORS[k?.toLowerCase?.()] ?? GREY;
}

function scoreBar(score) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <div style={{
        width: 48, height: 4, borderRadius: 2,
        background: "rgba(255,255,255,0.08)", overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: ACCENT, borderRadius: 2,
          transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{ fontSize: 9, color: GREY, letterSpacing: 1, minWidth: 24 }}>
        {pct}%
      </span>
    </div>
  );
}

export default function SemanticSearchDrawer() {
  const [open,    setOpen]   = useState(false);
  const [query,   setQuery]  = useState("");
  const [results, setResults]= useState([]);
  const [loading, setLoading]= useState(false);
  const [error,   setError]  = useState(false);
  const [count,   setCount]  = useState(null);
  const debRef               = useRef(null);
  const inputRef             = useRef(null);

  // Debounced search
  useEffect(() => {
    clearTimeout(debRef.current);
    if (!query.trim()) { setResults([]); setCount(null); setError(false); return; }
    debRef.current = setTimeout(() => {
      let alive = true;
      setLoading(true); setError(false);
      kimiClient
        .request(`/v1/semantic/search?q=${encodeURIComponent(query.trim())}&k=${K}`)
        .then((d) => {
          if (!alive) return;
          setResults(Array.isArray(d?.results) ? d.results : []);
          setCount(typeof d?.count === "number" ? d.count : null);
          setLoading(false);
        })
        .catch(() => { if (alive) { setError(true); setLoading(false); } });
      return () => { alive = false; };
    }, DELAY);
    return () => clearTimeout(debRef.current);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  const hasResults = results.length > 0;

  return (
    <>
      {/* Edge tab */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Semantic search (vector)"
        style={{
          position: "fixed", right: 0, top: "33%", zIndex: 50,
          writingMode: "vertical-rl", transform: "rotate(180deg)",
          padding: "8px 4px",
          background: open ? ACCENT : S.glassRail,
          border: `1px solid ${open ? ACCENT : S.border}`,
          borderRight: "none",
          borderRadius: "4px 0 0 4px",
          color: open ? "#0a0f1a" : ACCENT,
          fontSize: S.fs.xs, letterSpacing: 2, cursor: "pointer",
          fontFamily: S.mono,
          boxShadow: open ? `0 0 14px ${ACCENT}66` : "none",
        }}
      >
        ◈ SEM
      </button>

      {/* Drawer panel */}
      {open && (
        <div style={{
          position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 49,
          width: 340, background: S.glassRail,
          backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}44`,
          boxShadow: `-4px 0 28px ${ACCENT}18`,
          display: "flex", flexDirection: "column",
          fontFamily: S.mono, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${ACCENT}33`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: ACCENT, fontSize: 11, letterSpacing: 2 }}>◈ SEMANTIC SEARCH</span>
              {count !== null && (
                <span style={{
                  marginLeft: "auto", fontSize: 9, color: GREY,
                  letterSpacing: 1,
                }}>{count} result{count !== 1 ? "s" : ""}</span>
              )}
            </div>
            {/* Search input */}
            <div style={{
              display: "flex", alignItems: "center",
              background: "rgba(0,0,0,0.3)",
              border: `1px solid ${ACCENT}44`,
              borderRadius: 6, padding: "5px 10px", gap: 6,
            }}>
              <span style={{ color: ACCENT, fontSize: 11 }}>⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="vector search the ontology…"
                style={{
                  flex: 1, background: "transparent",
                  border: "none", outline: "none",
                  color: "#DCEBF5", fontSize: 12, letterSpacing: 0.5,
                  fontFamily: S.mono,
                }}
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setResults([]); setCount(null); }}
                  style={{
                    background: "transparent", border: "none",
                    color: GREY, cursor: "pointer", fontSize: 12, padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {loading && (
              <div style={{
                padding: "18px 14px", color: GREY,
                fontSize: 11, letterSpacing: 1, textAlign: "center",
              }}>
                searching…
              </div>
            )}
            {error && !loading && (
              <div style={{
                padding: "18px 14px", color: "#F87171",
                fontSize: 11, letterSpacing: 1, textAlign: "center",
              }}>
                search unavailable
              </div>
            )}
            {!loading && !error && !hasResults && query.trim() && (
              <div style={{
                padding: "18px 14px", color: GREY,
                fontSize: 11, letterSpacing: 1, textAlign: "center",
              }}>
                no results
              </div>
            )}
            {!loading && !error && !query.trim() && (
              <div style={{
                padding: "18px 14px", color: GREY,
                fontSize: 11, letterSpacing: 1, textAlign: "center",
              }}>
                type to search all JARVIS objects
              </div>
            )}
            {!loading && hasResults && results.map((hit, i) => (
              <div
                key={`${hit.id}-${i}`}
                style={{
                  padding: "7px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  display: "flex", flexDirection: "column", gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 9, letterSpacing: 1, padding: "1px 5px",
                    borderRadius: 3, border: `1px solid ${kindColor(hit.kind)}55`,
                    color: kindColor(hit.kind), flexShrink: 0, textTransform: "uppercase",
                  }}>
                    {hit.kind || "?"}
                  </span>
                  <span style={{
                    color: "#DCEBF5", fontSize: 11, letterSpacing: 0.5,
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {hit.id}
                  </span>
                  {scoreBar(hit.score)}
                </div>
                {hit.text && (
                  <div style={{
                    color: GREY, fontSize: 10, letterSpacing: 0.3, lineHeight: 1.4,
                    overflow: "hidden",
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}>
                    {hit.text}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px",
            borderTop: `1px solid ${ACCENT}22`,
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 9, color: GREY, letterSpacing: 1 }}>
              GET /v1/semantic/search · cosine top-{K}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
