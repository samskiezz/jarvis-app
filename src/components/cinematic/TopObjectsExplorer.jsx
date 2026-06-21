/**
 * TopObjectsExplorer — F44
 *
 * Polls GET /v1/jarvis/analytics/top-objects?kind=pagerank&limit=10 every 2 min
 * and renders a compact ranked panel of the most influential ontology nodes.
 *
 * Voice intents: "JARVIS, top objects" | "most influential" | "top nodes"
 *                | "pagerank" | "influential entities" | "who are the top nodes"
 * Strip button: ⊕ NODES
 * Custom event: jarvis:top-objects-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const YLW  = "#FFD700";
const POLL = 2 * 60 * 1000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TOP_OBJ_RE =
  /\b(top.objects?|top.nodes?|most.influential|influential.entit|pagerank|graph.rank|top.ranked|who.are.the.top|highest.rank)\b/i;

export function isTopObjectsQuery(t) {
  return TOP_OBJ_RE.test(t || "");
}

export async function buildTopObjectsScript() {
  try {
    const r = await fetch(
      `${apiBase()}/v1/jarvis/analytics/top-objects?kind=pagerank&limit=5`,
      { headers: { Authorization: `Bearer ${API_KEY}` } },
    );
    if (!r.ok) return "Top object analytics are unavailable at present, sir.";
    const d = await r.json();
    const results = d?.results || [];
    if (!results.length) return "The ontology graph does not yet have ranked objects, sir.";
    const lines = results.slice(0, 5).map(
      (o, i) => `#${i + 1}: ${o.label || o.id} (${o.type}, PageRank ${typeof o.score === "number" ? o.score.toFixed(4) : "—"})`
    );
    return (
      `Top ${results.length} most influential nodes by PageRank, sir. ` +
      lines.join(". ") + "."
    );
  } catch {
    return "I was unable to retrieve the top objects ranking at this time, sir.";
  }
}

const TYPE_COLOR = {
  Person: CY,
  Organization: GRN,
  Topic: YLW,
  Document: "#b18cff",
  Location: "#ff7f50",
};

function typeColor(type) {
  return TYPE_COLOR[type] || "#566878";
}

const PANEL = {
  position: "fixed",
  top: 60,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 300,
  width: "min(480px, 94vw)",
  background: "rgba(4,8,14,0.93)",
  border: `1px solid ${CY}44`,
  borderRadius: 12,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 48px ${CY}18`,
  fontFamily: "'JetBrains Mono', monospace",
  color: "#DCEBF5",
  overflow: "hidden",
};

const HEADER = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  borderBottom: `1px solid ${CY}22`,
  background: "rgba(41,231,255,0.05)",
};

export default function TopObjectsExplorer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [kind, setKind] = useState("pagerank");
  const timerRef = useRef(null);

  const fetch_ = useCallback(async (k = kind) => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `${apiBase()}/v1/jarvis/analytics/top-objects?kind=${k}&limit=10`,
        { headers: { Authorization: `Bearer ${API_KEY}` } },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(() => fetch_(), POLL);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:top-objects-toggle", onToggle);
    return () => window.removeEventListener("jarvis:top-objects-toggle", onToggle);
  }, []);

  const results = data?.results || [];

  function switchKind(k) {
    setKind(k);
    fetch_(k);
  }

  return (
    <>
      {/* Strip toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Top ontology nodes by graph score"
        style={{
          position: "fixed",
          bottom: 18,
          left: "calc(50% + 80px)",
          zIndex: 301,
          padding: "4px 10px",
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 6,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ⊕ NODES
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HEADER}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ⊕ Top Objects · Graph Analytics
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["pagerank", "centrality", "connectivity"].map((k) => (
                <button
                  key={k}
                  onClick={() => switchKind(k)}
                  style={{
                    fontSize: 8,
                    padding: "2px 7px",
                    borderRadius: 4,
                    border: `1px solid ${kind === k ? CY : "#2a3a4a"}`,
                    background: kind === k ? `${CY}22` : "transparent",
                    color: kind === k ? CY : "#566878",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {k}
                </button>
              ))}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", color: "#566878",
                  cursor: "pointer", fontSize: 14, marginLeft: 4, lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ padding: "10px 14px", maxHeight: 360, overflowY: "auto" }}>
            {loading && !results.length && (
              <div style={{ color: "#566878", fontSize: 10, padding: "8px 0" }}>
                ◌ Loading graph analytics…
              </div>
            )}
            {err && (
              <div style={{ color: "#e8203c", fontSize: 10, padding: "4px 0" }}>
                ⚠ {err}
              </div>
            )}
            {results.map((obj, i) => (
              <div
                key={obj.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: i < results.length - 1 ? "1px solid rgba(41,231,255,0.06)" : "none",
                }}
              >
                <span style={{ color: CY, fontSize: 9, minWidth: 20, textAlign: "right" }}>
                  #{i + 1}
                </span>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: typeColor(obj.type),
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {obj.label || obj.id}
                </span>
                <span style={{ fontSize: 8, color: typeColor(obj.type), minWidth: 68, textAlign: "right" }}>
                  {obj.type}
                </span>
                <span style={{ fontSize: 9, color: GRN, minWidth: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {typeof obj.score === "number" ? obj.score.toFixed(5) : "—"}
                </span>
              </div>
            ))}
            {!loading && !err && results.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "8px 0" }}>
                No ranked objects in the graph yet.
              </div>
            )}
          </div>

          <div style={{ padding: "6px 14px", borderTop: "1px solid rgba(41,231,255,0.06)", fontSize: 8, color: "#566878", display: "flex", justifyContent: "space-between" }}>
            <span>Source: /v1/jarvis/analytics/top-objects</span>
            <span style={{ color: loading ? YLW : GRN }}>
              {loading ? "◌ updating" : `${results.length} nodes · ${kind}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
