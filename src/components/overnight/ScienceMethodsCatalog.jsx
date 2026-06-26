/**
 * ScienceMethodsCatalog — F116
 * Left-edge slide-in drawer exposing the underworld 489-method science registry.
 *
 * GET /functions/science/methods → [{key, domain, doc, engine, aliases}] or
 *   {status: "unavailable", reason} when the engine is not loaded.
 * POST /functions/science/run {field} → {status, field, data, ...} or {status, error}
 *
 * Groups methods by domain. Each method row has a ▶ RUN button that fires
 * POST /functions/science/run and shows the result inline. Degrades gracefully
 * when the underworld engine is unavailable.
 *
 * Accent: amber (#F59E0B). Tab: left-edge at 46% from top.
 * Mount point: src/Layout.jsx after <AssuranceInvariantsDrawer />.
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const AMBER = "#F59E0B";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

export default function ScienceMethodsCatalog() {
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [runResults, setRunResults] = useState({});
  const [running, setRunning] = useState({});
  const [expanded, setExpanded] = useState({});
  const fetchedRef = useRef(false);

  async function fetchMethods() {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/functions/science/methods`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (Array.isArray(d)) {
        setMethods(d);
      } else if (d.status === "unavailable") {
        setUnavailable(true);
      } else {
        setError(d.error || "unknown error");
      }
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMethods();
  }, []);

  async function runMethod(key) {
    setRunning((p) => ({ ...p, [key]: true }));
    setRunResults((p) => ({ ...p, [key]: null }));
    try {
      const r = await fetch(`${apiBase()}/functions/science/run`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ field: key }),
      });
      const d = await r.json();
      setRunResults((p) => ({ ...p, [key]: d }));
    } catch (e) {
      setRunResults((p) => ({ ...p, [key]: { status: "error", error: e.message } }));
    } finally {
      setRunning((p) => ({ ...p, [key]: false }));
    }
  }

  const grouped = {};
  if (methods) {
    for (const m of methods) {
      if (!grouped[m.domain]) grouped[m.domain] = [];
      grouped[m.domain].push(m);
    }
  }
  const domains = Object.keys(grouped).sort();

  const tabStyle = {
    position: "fixed",
    left: 0,
    top: "46%",
    transform: "translateY(-50%) rotate(-90deg) translateX(-50%)",
    transformOrigin: "left center",
    zIndex: 200,
    background: "rgba(8,14,22,0.85)",
    color: AMBER,
    border: `1px solid ${AMBER}55`,
    borderRadius: "0 0 6px 6px",
    padding: "4px 12px",
    fontSize: 10,
    letterSpacing: 2,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  };

  const panelStyle = {
    position: "fixed",
    left: open ? 0 : -360,
    top: 0,
    height: "100vh",
    width: 340,
    background: "rgba(6,10,18,0.97)",
    borderRight: `1px solid ${AMBER}44`,
    boxShadow: open ? `4px 0 40px ${AMBER}22` : "none",
    zIndex: 199,
    overflowY: "auto",
    transition: "left 0.28s ease",
    fontFamily: "'JetBrains Mono', monospace",
    padding: "0 0 60px",
  };

  return (
    <>
      <button onClick={() => setOpen((v) => !v)} style={tabStyle} title="Science Methods Catalog">
        ◈ SCI
      </button>

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          position: "sticky", top: 0,
          background: "rgba(6,10,18,0.98)",
          borderBottom: `1px solid ${AMBER}33`,
          padding: "14px 16px 10px",
          zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              SCIENCE METHODS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                marginLeft: "auto", background: "none", border: "none",
                color: "#6E8AA0", cursor: "pointer", fontSize: 16,
              }}
            >✕</button>
          </div>
          <div style={{ color: "#4A6278", fontSize: 10 }}>
            {loading && "loading registry…"}
            {unavailable && "engine unavailable — underworld not loaded"}
            {error && `error: ${error}`}
            {methods && `${methods.length} methods · ${domains.length} domains`}
          </div>
        </div>

        {/* Domain groups */}
        {domains.map((domain) => (
          <div key={domain}>
            <button
              onClick={() => setExpanded((p) => ({ ...p, [domain]: !p[domain] }))}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                width: "100%", background: "rgba(245,158,11,0.06)",
                border: "none", borderBottom: `1px solid ${AMBER}22`,
                padding: "8px 16px", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{
                color: AMBER, fontSize: 10, letterSpacing: 1, flex: 1,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {expanded[domain] ? "▾" : "▸"} {domain.toUpperCase()}
              </span>
              <span style={{ color: "#4A6278", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                {grouped[domain].length}
              </span>
            </button>

            {expanded[domain] && grouped[domain].map((m) => {
              const res = runResults[m.key];
              return (
                <div key={m.key} style={{ padding: "8px 16px", borderBottom: "1px solid #0D1824" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#C8DCF0", fontSize: 11, marginBottom: 2 }}>{m.key}</div>
                      {m.doc && (
                        <div style={{ color: "#4A6278", fontSize: 10, lineHeight: 1.4 }}>{m.doc}</div>
                      )}
                    </div>
                    <button
                      onClick={() => runMethod(m.key)}
                      disabled={!!running[m.key]}
                      style={{
                        background: running[m.key] ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.15)",
                        border: `1px solid ${AMBER}44`,
                        color: AMBER,
                        borderRadius: 3,
                        padding: "2px 8px",
                        fontSize: 9,
                        cursor: running[m.key] ? "wait" : "pointer",
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {running[m.key] ? "…" : "▶ RUN"}
                    </button>
                  </div>

                  {res && (
                    <div style={{
                      marginTop: 6,
                      background: "rgba(0,0,0,0.3)",
                      border: `1px solid ${res.status === "ok" ? AMBER : "#EF4444"}33`,
                      borderRadius: 4,
                      padding: "6px 8px",
                      fontSize: 10,
                      color: res.status === "ok" ? "#9BBAD0" : "#FCA5A5",
                      wordBreak: "break-all",
                      maxHeight: 120,
                      overflowY: "auto",
                    }}>
                      {res.status === "ok"
                        ? JSON.stringify(res.data ?? res, null, 2).slice(0, 400)
                        : `error: ${res.error}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {!loading && !unavailable && !error && methods && methods.length === 0 && (
          <div style={{ color: "#4A6278", fontSize: 11, padding: "16px" }}>
            no methods registered
          </div>
        )}

        <div style={{ color: "#2A3844", fontSize: 9, padding: "8px 16px", textAlign: "center" }}>
          GET /functions/science/methods · POST /functions/science/run
        </div>
      </div>
    </>
  );
}
