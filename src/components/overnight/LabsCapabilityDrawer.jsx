/**
 * LabsCapabilityDrawer — F70
 * Shows the underworld scientific lab module registry.
 * Real endpoint: GET /v1/labs/catalog
 * Response: { capabilities: [{ capability, module, description, loaded, status, detail? }] }
 * Left-edge slide-in at 32% vertical. Emerald (#10B981) accent. 5-min poll.
 */
import { useState, useEffect, useRef } from "react";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }
  return "";
}

const ACC = "#10B981";
const POLL_MS = 5 * 60 * 1000;

const CAP_LABELS = {
  drug_discovery: "Drug Discovery",
  disease_model: "Disease Models",
  quantum_demo: "Exotic Quantum",
  manufacturing_sim: "Manufacturing",
  patent_classify: "Patent Intel",
  materials_or_standards: "Materials & Standards",
};

function relativeAge(ts) {
  if (!ts) return null;
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function StatusBadge({ status }) {
  const available = status === "available";
  const color = available ? "#10B981" : "#EF4444";
  const label = available ? "AVAILABLE" : "UNAVAILABLE";
  return (
    <span
      style={{
        fontSize: 9, letterSpacing: 1, padding: "1px 5px",
        border: `1px solid ${color}55`, borderRadius: 4,
        color, background: `${color}11`, flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

export default function LabsCapabilityDrawer() {
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  async function fetchCatalog() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/labs/catalog`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const list = Array.isArray(d.capabilities) ? d.capabilities : [];
      setCaps(list);
      setLastFetch(Date.now());
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchCatalog();
    timerRef.current = setInterval(fetchCatalog, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const availableCount = caps ? caps.filter((c) => c.status === "available").length : 0;
  const totalCount = caps ? caps.length : 0;

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Labs Capability Catalog"
        style={{
          position: "fixed",
          left: open ? 340 : 0,
          top: "32%",
          zIndex: 200,
          cursor: "pointer",
          background: "#0F172A",
          border: `1px solid ${ACC}44`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "8px 6px",
          writingMode: "vertical-rl",
          fontSize: 10,
          letterSpacing: 1,
          color: ACC,
          userSelect: "none",
          transition: "left 0.25s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        {caps !== null && (
          <span
            style={{
              fontSize: 8, background: availableCount > 0 ? ACC : "#475569",
              color: "#0F172A", borderRadius: "50%",
              width: 14, height: 14, display: "flex", alignItems: "center",
              justifyContent: "center", fontWeight: 700, writingMode: "horizontal-tb",
            }}
          >
            {availableCount}
          </span>
        )}
        <span>LABS ◀</span>
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -340,
          top: "5%",
          width: 340,
          height: "90%",
          zIndex: 199,
          background: "rgba(15,23,42,0.97)",
          border: `1px solid ${ACC}33`,
          borderLeft: "none",
          borderRadius: "0 12px 12px 0",
          display: "flex",
          flexDirection: "column",
          transition: "left 0.25s",
          fontFamily: "monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${ACC}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ color: ACC, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⚗ LABS CATALOG
            </div>
            <div style={{ color: "#64748B", fontSize: 9, marginTop: 2 }}>
              {caps === null
                ? "loading…"
                : `${availableCount} / ${totalCount} modules active`}
              {lastFetch && (
                <span style={{ marginLeft: 6, color: "#334155" }}>
                  · {relativeAge(lastFetch)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: "#475569",
              cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {loading && caps === null && (
            <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
              LOADING…
            </div>
          )}
          {error && (
            <div style={{ color: "#EF4444", fontSize: 10, padding: "8px 14px" }}>
              ⚠ {error}
            </div>
          )}
          {caps !== null && caps.length === 0 && (
            <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
              NO CAPABILITIES FOUND
            </div>
          )}
          {caps !== null &&
            caps.map((cap) => (
              <CapRow key={cap.capability} cap={cap} acc={ACC} />
            ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${ACC}22`,
            fontSize: 9,
            color: "#334155",
            flexShrink: 0,
          }}
        >
          ⚗ underworld lab modules · poll 5 min · GET /v1/labs/catalog
        </div>
      </div>
    </>
  );
}

function CapRow({ cap, acc }) {
  const [expanded, setExpanded] = useState(false);
  const label = CAP_LABELS[cap.capability] || cap.capability;
  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        padding: "8px 14px",
        borderBottom: "1px solid #1E293B",
        cursor: "pointer",
        opacity: cap.status === "unavailable" ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ flex: 1, color: "#E2E8F0", fontSize: 11, fontWeight: 600 }}>
          {label}
        </span>
        <StatusBadge status={cap.status} />
      </div>
      <div style={{ color: "#64748B", fontSize: 10, lineHeight: 1.4 }}>
        {cap.description}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, fontSize: 9, color: "#475569" }}>
          <div>module: {cap.module}</div>
          {cap.detail && (
            <div style={{ color: "#EF444488", marginTop: 2, wordBreak: "break-all" }}>
              {cap.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
