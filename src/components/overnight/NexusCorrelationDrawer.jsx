/**
 * NexusCorrelationDrawer — F66
 * Cross-store correlation search: fuses vector + FTS + graph results.
 * Real endpoint: GET /v1/correlate/search?q=<query>&k=10
 * Response: { query, k, count, results: [{id,kind,text,score,final_score,store,ts,source}],
 *             stores_hit, relationships?, store_errors? }
 * Mounted in Layout.jsx (additive only). Violet (#7C3AED) accent. Right edge at 3%.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }
  return "";
}

const ACC = "#7C3AED";
const STORE_COLORS = { vector: "#A78BFA", fts: "#60A5FA", graph: "#34D399" };

function storeBadge(store) {
  const color = STORE_COLORS[store] || "#94A3B8";
  return (
    <span
      style={{
        fontSize: 9, letterSpacing: 1, padding: "1px 5px",
        border: `1px solid ${color}55`, borderRadius: 4,
        color, background: `${color}11`, flexShrink: 0,
      }}
    >
      {(store || "?").toUpperCase()}
    </span>
  );
}

function ScoreBar({ value }) {
  const pct = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  return (
    <div style={{ height: 2, background: "#1E293B", borderRadius: 2, width: 60, flexShrink: 0 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: ACC, borderRadius: 2 }} />
    </div>
  );
}

export default function NexusCorrelationDrawer() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [storesHit, setStoresHit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q || !q.trim()) {
      setResults(null); setStoresHit([]); setError(null);
      return;
    }
    setLoading(true); setError(null);
    try {
      const r = await fetch(
        `${apiBase()}/v1/correlate/search?q=${encodeURIComponent(q.trim())}&k=10`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setResults(Array.isArray(d.results) ? d.results : []);
      setStoresHit(Array.isArray(d.stores_hit) ? d.stores_hit : []);
    } catch (e) {
      setError(e.message || "fetch error");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
    else { setQuery(""); setResults(null); setStoresHit([]); setError(null); }
  }, [open]);

  const count = results ? results.length : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Nexus Correlation Explorer (F66)"
        style={{
          position: "fixed", right: 0, top: "3%",
          zIndex: 110, writingMode: "vertical-rl",
          padding: "8px 5px", cursor: "pointer",
          background: open ? ACC : "rgba(8,10,16,0.85)",
          border: `1px solid ${ACC}`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: open ? "#fff" : ACC,
          fontSize: 10, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        {open ? "◈" : "◇"} NEXUS
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed", right: 0, top: 0, height: "100vh",
            width: "min(380px, 90vw)", zIndex: 109,
            background: "rgba(8,10,20,0.97)",
            border: `1px solid ${ACC}44`,
            borderRight: "none",
            boxShadow: `-12px 0 40px rgba(124,58,237,0.15)`,
            display: "flex", flexDirection: "column",
            fontFamily: "'JetBrains Mono',monospace",
            overflowY: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "12px 14px 8px",
            borderBottom: `1px solid ${ACC}33`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: ACC, fontSize: 13, letterSpacing: 2 }}>◈ NEXUS</span>
              <span style={{ color: "#334155", fontSize: 10, letterSpacing: 1 }}>
                CROSS-STORE CORRELATION
              </span>
              {storesHit.length > 0 && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  {storesHit.map((s) => storeBadge(s))}
                </div>
              )}
            </div>
            {/* Search input */}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all stores…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(124,58,237,0.08)",
                border: `1px solid ${ACC}44`, borderRadius: 6,
                color: "#CBD5E1", fontSize: 12, letterSpacing: 0.5,
                padding: "6px 10px", outline: "none",
                fontFamily: "inherit",
              }}
            />
            {results !== null && (
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1, marginTop: 5 }}>
                {loading ? "searching…" : `${count} result${count !== 1 ? "s" : ""}`}
              </div>
            )}
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {!query.trim() && (
              <div style={{ padding: "24px 14px", color: "#334155", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                Type to search across graph · vector · FTS
              </div>
            )}
            {query.trim() && loading && (
              <div style={{ padding: "24px 14px", color: "#475569", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                correlating…
              </div>
            )}
            {error && (
              <div style={{ padding: "12px 14px", color: "#F87171", fontSize: 10, letterSpacing: 1 }}>
                ⚠ {error}
              </div>
            )}
            {!loading && !error && results !== null && count === 0 && (
              <div style={{ padding: "24px 14px", color: "#334155", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                No correlations found
              </div>
            )}
            {!loading && results && results.map((hit, i) => {
              const score = hit.final_score ?? hit.score ?? 0;
              const text = (hit.text || hit.title || hit.label || hit.id || "—").slice(0, 200);
              const kind = hit.kind || hit.type || "";
              return (
                <div
                  key={hit.id || i}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${ACC}11`,
                    display: "flex", flexDirection: "column", gap: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {storeBadge(hit.store)}
                    {kind && (
                      <span style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>
                        {kind}
                      </span>
                    )}
                    <div style={{ marginLeft: "auto" }}>
                      <ScoreBar value={score} />
                    </div>
                    <span style={{ fontSize: 9, color: ACC, letterSpacing: 1, flexShrink: 0 }}>
                      {(score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
                    {text}
                  </div>
                  {hit.source && (
                    <div style={{ fontSize: 9, color: "#334155", letterSpacing: 1 }}>
                      {String(hit.source).slice(0, 60)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${ACC}22`,
            flexShrink: 0, fontSize: 9, color: "#334155", letterSpacing: 1,
            display: "flex", gap: 10,
          }}>
            <span>GET /v1/correlate/search</span>
            <span style={{ marginLeft: "auto" }}>ESC close</span>
          </div>
        </div>
      )}
    </>
  );
}
