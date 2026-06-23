/**
 * OntologySearchDrawer — Feature 53
 * Right-edge slide-in search panel backed by GET /v1/search.
 * Queries as you type (350 ms debounce). Results show label, type badge,
 * classification mark, and a relevance score bar.
 *
 * Tab at 43 % from top on right edge (between PipelineRunsDrawer 35 %
 * and ContactsDirectoryDrawer 50 %).
 * Mounted in src/Layout.jsx after TopObjectsDrawer.
 *
 * Endpoint:
 *   GET /v1/search?q=<query>&limit=20
 *   → { query, count, results: [{ id, label, type, mark, score }] }
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const DRAWER_W = 320;
const ACCENT = "#F97316"; // orange — unused by other overnight drawers
const DEBOUNCE_MS = 350;

const TYPE_COLORS = {
  Person:       "#29E7FF",
  Organization: "#B57BFF",
  Location:     "#7FFF5F",
  Event:        "#FFD700",
  Asset:        "#F59E0B",
  Topic:        "#60A5FA",
  Concept:      "#34D399",
  Measurement:  "#FB7185",
};

function typeColor(t) {
  return TYPE_COLORS[t] || ACCENT;
}

function ScoreBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div
      style={{
        width: 48,
        height: 3,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 2,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ width: `${pct}%`, height: "100%", background: ACCENT }} />
    </div>
  );
}

export default function OntologySearchDrawer() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const doSearch = useCallback((q) => {
    if (!q.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(false);
    kimiClient
      .request(`/v1/search?q=${encodeURIComponent(q)}&limit=20`)
      .then((d) => {
        setResults(d?.results ?? []);
        setLoading(false);
      })
      .catch(() => {
        setErr(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    } else {
      setQuery("");
      setResults(null);
      setErr(false);
    }
  }, [open]);

  const maxScore =
    results && results.length > 0
      ? Math.max(...results.map((r) => r.score), 1e-9)
      : 1;

  return (
    <>
      {/* Fixed toggle tab — right edge at 43 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close ontology search" : "Search the ontology (GET /v1/search)"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "43%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "◀ SRCH" : "SRCH ▶"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 9005,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header + search input */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: S.fs.xs,
              color: ACCENT,
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            ONTOLOGY SEARCH
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${ACCENT}44`,
              borderRadius: 4,
              padding: "5px 10px",
            }}
          >
            <span style={{ color: ACCENT, fontSize: 12, flexShrink: 0 }}>⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entities…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#DCEBF5",
                fontSize: S.fs.xs,
                letterSpacing: 0.5,
                fontFamily: S.mono,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: S.text,
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: "#F59E0B",
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : loading ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              SEARCHING…
            </div>
          ) : !query.trim() ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
                lineHeight: 1.6,
              }}
            >
              TYPE TO SEARCH
              <br />
              THE ONTOLOGY
            </div>
          ) : results && results.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO RESULTS FOUND
            </div>
          ) : results ? (
            results.map((obj) => (
              <div
                key={obj.id}
                style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {/* Label row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  <span
                    style={{
                      color: "#DCEBF5",
                      fontSize: S.fs.xs,
                      letterSpacing: 0.5,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {obj.label || obj.id}
                  </span>
                  {obj.type && (
                    <span
                      style={{
                        fontSize: 8,
                        color: typeColor(obj.type),
                        border: `1px solid ${typeColor(obj.type)}44`,
                        borderRadius: 3,
                        padding: "1px 4px",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        flexShrink: 0,
                      }}
                    >
                      {obj.type}
                    </span>
                  )}
                </div>

                {/* Score bar + mark */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <ScoreBar score={obj.score} max={maxScore} />
                  {obj.mark && (
                    <span
                      style={{
                        fontSize: 8,
                        color: "#64748B",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {obj.mark}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      fontVariantNumeric: "tabular-nums",
                      marginLeft: "auto",
                    }}
                  >
                    {Number(obj.score).toFixed(4)}
                  </span>
                </div>
              </div>
            ))
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>GET /v1/search</span>
          {results && (
            <span>
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
